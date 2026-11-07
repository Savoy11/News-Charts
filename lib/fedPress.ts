import { DESIGNATOR, START, escapeName, outrankedName, plainText } from "./doj";
import { fedBanksFor, type FedOrg } from "./fedActions";
import { longerListedNameIn } from "./frCompany";
import { eastern } from "./marketTime";
import { listedCompaniesNamed } from "./sec";
import { captionParty } from "./secCases";
import { decodeEntities } from "./secHeadlines";
import type { FetchResult, TimelineEvent } from "./types";
import { UA } from "./contact";
import { ARCHIVED_ORDERS } from "./fedOrders";
import { takenBefore } from "./takenNames";

/**
 * The Federal Reserve Board's own announcements about a listed company, from 2006, the first year
 * its press-release feed holds (batch 84, the 2026-11-01 proposal 5, a source the owner approved on
 * 2026-11-01), and its orders of 1996–2005 from its yearly pages, committed (`lib/fedOrders.ts`,
 * batch 99).
 *
 * The Board names each bank whose application it approves or denies — "Approval of proposal by
 * Wells Fargo & Company to acquire Wachovia Corporation" (2008-10-12) — and the banks its policy
 * acts on: a capital plan objected to, a rescue, an agreement. On a bank's page a deal carried its
 * 8-Ks, not the approval that let it close.
 *
 * Read from one file, www.federalreserve.gov/json/ne-press.json, every release since 2006-01-10,
 * each with its day (most with a time), title, type and link; about 1 MB, read once a process for
 * every company. "Unless otherwise indicated, information on Board's website is in the
 * public domain and may be copied and distributed without permission. Please cite to the Board as
 * the source of the information." (federalreserve.gov/disclaimer.htm, read 2026-11-01). What is
 * used is the title, day, time and link.
 *
 * Its "Enforcement Actions" are not read here: the enforcement files carry each of them, with the
 * organisation the Board names, and batch 69's map gives them to the banks (`lib/fedActions.ts`).
 * Nor is "Monetary Policy", which names no company as the one acted on.
 */

export const FED_PRESS_FEED = "https://www.federalreserve.gov/json/ne-press.json";
const TIMEOUT_MS = 30_000;

/** The types read: the Board's orders on banks' applications, and its policy and other releases. */
export const READ_TYPES = ["Orders on Banking Applications", "Banking and Consumer Regulatory Policy", "Other Announcements"] as const;
type ReadType = (typeof READ_TYPES)[number];

export interface FedRelease {
  /** the day in Washington */
  day: string;
  /** the instant, where the feed gives a time: "10/29/2026 4:30:00 PM" is 2026-10-29T20:30:00.000Z */
  at?: string;
  title: string;
  type: ReadType;
  url: string;
  /** an archived order's page sentence naming its parties (batch 99, `lib/fedOrders.ts`) */
  summary?: string;
}

/** One row as the feed writes it. */
export interface FeedRow {
  d?: string;
  t?: string;
  pt?: string;
  l?: string;
}

/**
 * The instant a Washington wall-clock time stands for, daylight saving the time zone database's:
 * of the two offsets New York keeps, the one whose clock reads the time back.
 */
export function easternInstant(day: string, time: string): string | null {
  const [y, m, d] = day.split("-").map(Number);
  const [h, mi, s] = time.split(":").map(Number);
  for (const offset of [4, 5]) {
    const iso = new Date(Date.UTC(y, m - 1, d, h + offset, mi, s)).toISOString();
    const et = eastern(iso);
    if (et?.day === day && et.time === time) return iso;
  }
  return null;
}

const STAMP = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}):(\d{2})\s*([AP]M))?$/i;

/** The feed's rows → releases of the types read; a row without a day, title or a link on the Board's site is skipped. */
export function parseFedFeed(rows: readonly FeedRow[]): FedRelease[] {
  const out: FedRelease[] = [];
  for (const r of rows) {
    const type = READ_TYPES.find((t) => t === r.pt);
    const m = STAMP.exec((r.d ?? "").trim());
    // "Soci&eacute;t&eacute; G&eacute;n&eacute;rale": the feed spells its accented letters as entities
    const title = decodeEntities(plainText(r.t ?? "")).replace(/\s+/g, " ").trim();
    const path = (r.l ?? "").trim();
    if (!type || !m || !title || !/^\/newsevents\/pressreleases\/[\w-]+\.htm$/.test(path)) continue;
    const day = `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
    let at: string | undefined;
    if (m[4]) {
      const h = (Number(m[4]) % 12) + (m[7].toUpperCase() === "PM" ? 12 : 0);
      at = easternInstant(day, `${String(h).padStart(2, "0")}:${m[5]}:${m[6]}`) ?? undefined;
    }
    out.push({ day, ...(at ? { at } : {}), title, type, url: `https://www.federalreserve.gov${path}` });
  }
  return out;
}

/**
 * An order's parties as its title gives them: the applicant after "by", and what it acquires or
 * merges with after "to acquire" or "to merge with" — "Approval of proposal by Mitsubishi UFJ
 * Financial Group to acquire voting shares of Morgan Stanley" (2008-10-06) is MUFG's and Morgan
 * Stanley's. Each is read as a caption is (`captionParty`): the name with its legal words, an entry
 * of its own.
 */
export function orderParties(title: string): string[] {
  // "…its approval for UBS Group AG to acquire the U.S. subsidiaries of Credit Suisse Group AG" (2023-04-14)
  // …and, only where no "by" or "for" gives the applicant, the Board's verb before it: "Federal Reserve
  // Board approves Banco Popular de Puerto Rico to acquire assets … of Westernbank Puerto Rico"
  // (2010-04-30, the one such title of the 463 orders read; batch 88)
  const by =
    // the older titles, and the archived orders' own pages, write "of": "Approval of proposal of
    // Norwest Corporation" (1998), "its approval of the proposal of Norwest Corporation,
    // Minneapolis, Minnesota, to acquire Wells Fargo & Company" (batch 99)
    /\b(?:(?:proposals?|applications?|notices?|requests?)\s+(?:\w+\s+){0,2}?(?:by|of)|approval\s+for)\s+(?:the\s+)?(.+)$/i.exec(title) ??
    /\bBoard\s+approves\s+(?:the\s+)?(.+)$/i.exec(title);
  if (!by) return [];
  const rest = by[1];
  const verb = /\s+to\s+(acquire|merge\s+with|purchase|become|establish|engage|retain|form|convert|increase|hold|invest|expand|open|own|control|make|operate|serve|relocate|redeem|sell|change|exceed|elect|indirectly|directly|continue|reduce)\b/i.exec(rest);
  const applicant = (verb ? rest.slice(0, verb.index) : rest).replace(/[.,;\s]+$/, "");
  const parties = [applicant];
  if (verb && /^(?:acquire|merge\s+with|purchase|retain|control)$/i.test(verb[1])) {
    const target = rest
      .slice(verb.index + verb[0].length)
      .replace(/^\s*(?:(?:up\s+to|approximately|an\s+additional|a)\s+)?(?:[\d.]+\s+percent\s+of\s+)?(?:all\s+(?:of\s+)?)?(?:the\s+)?(?:outstanding\s+)?(?:voting\s+)?(?:shares|securities|stock|interest|control|assets|equity)?(?:\s+(?:of|in))?\s+/i, "")
      .replace(/\s+(?:and\s+(?:its|their)\s+\w+|to\s+\w+.*|,\s+(?:and\s+)?(?:for|to)\s+.*)$/i, "")
      .replace(/[.,;\s]+$/, "");
    if (target) parties.push(target);
  }
  return parties;
}

/**
 * What the Board does to a company in a policy release, said just before its name: "a re-submitted
 * capital plan from BB&T Corporation", "requiring Bank of America Corporation to resubmit",
 * "Assistance to Bank of America", "Joint Statement by Treasury, Federal Reserve, and the FDIC on
 * Citigroup", "joint release on Fannie Mae and Freddie Mac" (2008-09-07, the day of their conservatorship),
 * "rescind the designation of American International Group", "agreement with HSBC", "the applications of Goldman Sachs and Morgan Stanley to become
 * bank holding companies", "transition period for Deutsche Bank AG", "proposed acquisition by
 * Capital One of Discover", "acquisition by The Toronto-Dominion Bank of First Horizon
 * Corporation".
 */
const BOARD_ON = String.raw`\b(?:capital\s+plans?\s+(?:re-?submitted\s+)?(?:from|by|of)|stress\s+capital\s+buffer(?:\s+requirement)?\s+(?:for|of)|(?:assistance|financial\s+support|support|lend[\w\s$,.-]{0,40}?)\s+to|(?:statement|joint\s+release)\b[\w\s,.]{0,60}?\bon|rescind\s+the\s+designation\s+of|resolution\s+plans?\s+of|agreements?(?:\s+in\s+principle)?\s+with|requiring|(?:approve|approves|permit|permits)|applications?\s+(?:of|by)|(?:proposed\s+)?acquisition\s+(?:by|of)|acquisition\s+by\s+(?:the\s+)?(?:[A-Z][\w.&'’-]*\s+){1,5}of|merger\s+of|transition\s+period\s+for|efforts\s+of|participation\s+in|subsidiaries\s+of)`;

/** Other companies named before it: "capital plans from The Goldman Sachs Group, Inc. and". */
const ALSO = String.raw`(?:(?:the\s+)?(?:[A-Z][\w.&'’-]*\s+){0,4}[A-Z][\w.&'’-]*(?:,?\s+(?:Inc\.|Corp\.|&\s+Co\.))?(?:,\s+|,?\s+and\s+)){0,4}(?:the\s+)?`;

/** What may follow it: the end, punctuation, a joining word, its possessive, or what it did. */
const AFTER = String.raw`(?=\s*$|\s*[,.;:()]|['’]s\b|\s+(?:and|to|for|of|in|on|with|has|have|that|after|as|regarding|borrowers|Restructuring|should|AG|SE|plc)\b)`;

/**
 * Whether a policy release names the company as the one the Board acts on: after one of the
 * Board's own phrases (`BOARD_ON`), or as the owner of the plan acted on ("Morgan Stanley's stress
 * capital buffer requirement", "Wells Fargo's second resolution plan"), under the press releases'
 * guards: a longer listed name owns the mention, a name more than one listed company has names none
 * of them, and a short name a bigger company's begins with counts only with a legal word of its own.
 */
export function boardActsOn(title: string, names: readonly string[]): boolean {
  const t = title.replace(/\s+/g, " ").trim();
  for (const name of names) {
    if (name.trim().length < 2 || longerListedNameIn(t, name) || listedCompaniesNamed(name) > 1) continue;
    const n = outrankedName(name, escapeName(name), names);
    const acted = new RegExp(String.raw`${BOARD_ON}\s+${ALSO}${START}${n}${DESIGNATOR}${AFTER}`, "i");
    const owns = new RegExp(String.raw`${START}${n}${DESIGNATOR}['’]s\s+(?:\w+\s+){0,2}(?:capital\s+plan|stress\s+capital\s+buffer|resolution\s+plan)`, "i");
    const did = new RegExp(String.raw`(?:^|\bannounce\s+)${n}${DESIGNATOR}\s+has\s+remediated\b`, "i");
    // "public meeting on proposed Bank of Montreal acquisition of BancWest", "U.S. Bancorp Acquisition of MUFG Union Bank"
    const buys = new RegExp(String.raw`\bproposed\s+${n}${DESIGNATOR}\s+(?:acquisition|merger)\s+(?:of|with)\b`, "i");
    if (acted.test(t) || owns.test(t) || did.test(t) || buys.test(t)) return true;
  }
  return false;
}

/**
 * Whether a release names the company, under the names it then had, as a party: an order's
 * applicant or what it acquires, or the one a policy acts on. An order's party is also the
 * company's where batch 69's hand-checked map gives it the organisation that day (`FED_BANKS`):
 * "Goldman Sachs Bank USA" (2016-03-21) is Goldman Sachs's bank, which no legal word ends.
 */
export function fedReleaseNames(r: Pick<FedRelease, "day" | "title" | "type" | "summary">, names: readonly string[], orgs: readonly FedOrg[] = []): boolean {
  if (r.type !== "Orders on Banking Applications") return boardActsOn(r.title, names);
  const mapped = orgs.filter((o) => (!o.from || r.day >= o.from) && (!o.to || r.day <= o.to));
  const parties = [...orderParties(r.title), ...(r.summary ? orderParties(r.summary) : [])];
  return parties.some((p) => captionParty(p, names) !== null || mapped.some((o) => o.match.test(p)));
}

/**
 * The releases a name of another company's took, read by hand on 2026-11-01, by CIK: the rule
 * cannot tell them from the company.
 */
export const NOT_THE_COMPANY: Readonly<Record<number, { ticker: string; title?: RegExp; summary?: RegExp; why: string }[]>> = {
  1666175: [{ ticker: "FTS", title: /^Approval of proposal by Fortis$/, why: "Fortis, the Belgian and Dutch bank of 2007, not Fortis Inc., the Canadian utility" }],
  // the 1996–2005 orders (`lib/fedOrders.ts`), read by hand on 2026-11-05: each order's sentence gives every party's city
  714562: [{ ticker: "THFF", summary: /\bFirst Financial Corporation, and its wholly owned subsidiary, First Financial Bank, F\.S\.B\., both in Stevens Point\b/, why: "First Financial Corporation of Stevens Point, Wisconsin, bought by Associated Banc-Corp in 1997, not the Terre Haute company" }],
  706129: [{ ticker: "HBNC", summary: /\bHorizon Bancorp, Inc\., Beckley, West Virginia\b/, why: "Horizon Bancorp of Beckley, West Virginia, bought by City Holding in 1998, not the Michigan City, Indiana company" }],
  921557: [{ ticker: "RBCAA", summary: /\bRepublic Bancorp, Inc\., Munden, Kansas\b/, why: "Republic Bancorp of Munden, Kansas, a new holding company of 2005, not the Louisville, Kentucky company" }],
  842517: [{ ticker: "ISBA", summary: /\bIBT Bancorp, Inc\., and thereby indirectly acquire an interest in Irwin Bank & Trust Company, both in Irwin, Pennsylvania\b/, why: "IBT Bancorp of Irwin, Pennsylvania, in which S&T Bancorp bought a stake in 2003, not Isabella Bank's IBT Bancorp of Mount Pleasant, Michigan" }],
  1471265: [{ ticker: "NWBI", summary: /\bNorthwest Bancshares, Inc\., and its wholly owned subsidiary bank, Northwest National Bank, both of Vancouver, Washington\b/, why: "Northwest Bancshares of Vancouver, Washington, bought by U.S. Bancorp in 1998, not the Pennsylvania company" }],
};

/** An archived order's sentence as the page shows it: whole up to 400 characters, else cut at a word. */
export function shortened(sentence: string): string {
  return sentence.length > 400 ? `${sentence.slice(0, 397).replace(/\s\S*$/, "")}…` : sentence;
}

/**
 * The releases naming the company as a party, as timeline events, newest first: the Board's own
 * title and link, and its time where the feed gives one, so batch 68's after-the-close mark reads
 * it. `namesIn(year)` gives the company's names that year, `namesOn(day)` the units it then owned
 * (`releaseNamesOn`), and a release from before `from`, its first price, is not its. One release is
 * one event, whichever companies it names.
 */
export function fedPressEvents(
  releases: readonly FedRelease[],
  namesIn: (year: number) => string[],
  { cik, from = "", namesOn }: { cik: number | string; from?: string; namesOn?: (day: string) => string[] },
): TimelineEvent[] {
  const orgs = fedBanksFor(cik) ?? [];
  const byYear = new Map<number, string[]>();
  const names = (year: number) => byYear.get(year) ?? byYear.set(year, namesIn(year)).get(year)!;
  const alnum = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  const out: TimelineEvent[] = [];
  for (const r of releases) {
    if (r.day < from || NOT_THE_COMPANY[Number(cik)]?.some((n) => n.title?.test(r.title) || n.summary?.test(r.summary ?? ""))) continue;
    // a name the record took from another company is that company's before the day (lib/takenNames.ts, batch 117)
    if (takenBefore(cik, r.day, `${r.title} ${r.summary ?? ""}`)) continue;
    const held = [...names(Number(r.day.slice(0, 4))), ...(namesOn?.(r.day) ?? [])];
    // a name can only be a party where the title's letters and digits, or an archived order's sentence's, hold its own
    const letters = alnum(`${r.title} ${r.summary ?? ""}`);
    if (!held.some((n) => alnum(n).length >= 2 && letters.includes(alnum(n))) && !orgs.some((o) => o.match.test(r.title))) continue;
    if (!fedReleaseNames(r, held, orgs)) continue;
    const key = r.url.replace(/^https:\/\/www\.federalreserve\.gov/, "");
    out.push({
      id: `fed-press-${key.replace(/[^\w]+/g, "-")}`,
      date: r.day,
      ...(r.at ? { occurredAt: r.at } : {}),
      type: "regulation",
      title: r.title,
      description: r.summary ? shortened(r.summary) : r.type === "Orders on Banking Applications" ? "The Board's order on a banking application." : `A Board release: ${r.type}.`,
      source: "Federal Reserve Board press release",
      url: r.url,
      sourceKey: "fed_press",
      externalId: key,
      dedupBasis: `fed-press:${key}`,
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/** The feed, read once a process: every company's ingest reads the same file. */
let feed: Promise<FedRelease[]> | null = null;

async function readFeed(): Promise<FedRelease[]> {
  const res = await fetch(FED_PRESS_FEED, { headers: UA, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw Object.assign(new Error(`the Board answered ${res.status}`), { status: res.status });
  // the file begins with a byte-order mark, and ends with a row saying when it was updated
  const rows: unknown = JSON.parse((await res.text()).replace(/^﻿/, ""));
  if (!Array.isArray(rows)) throw new Error("the feed did not answer with a list");
  return parseFedFeed(rows as FeedRow[]);
}

/** The feed for this process; a failure is not kept, so the next company's ingest asks again. */
export function cachedFedFeed(): Promise<FedRelease[]> {
  if (!feed) {
    feed = readFeed();
    feed.catch(() => (feed = null));
  }
  return feed;
}

/** A company's Board releases from the feed, or why there are none. */
export async function fetchFedPress(
  namesIn: (year: number) => string[],
  opts: { cik: number | string; from?: string; namesOn?: (day: string) => string[] },
): Promise<FetchResult> {
  try {
    // the feed begins in 2006; the orders of 1996–2005 are the archive's (batch 99)
    const events = fedPressEvents([...(await cachedFedFeed()), ...ARCHIVED_ORDERS], namesIn, opts);
    return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200 };
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 403 || status === 429 || status === 503) return { events: [], outcome: "throttled", httpStatus: status };
    return { events: [], outcome: "error", ...(status ? { httpStatus: status } : {}), detail: String(err).slice(0, 200) };
  }
}
