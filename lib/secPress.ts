import { DESIGNATOR, PARTY_VERB, START, escapeName, namedAsSubject, outrankedName, plainText } from "./doj";
import { longerListedNameIn } from "./frCompany";
import { listedCompaniesNamed } from "./sec";
import type { TimelineEvent } from "./types";

/**
 * The SEC's own press releases in which a listed company is the party — it is charged, sued or
 * sanctioned, it settles or pays — from 1997, the first year the newsroom lists (batch 73, the
 * 2026-10-28 proposal 1, approved by the owner on 2026-10-29).
 *
 * Read from the newsroom's year listing, www.sec.gov/newsroom/press-releases?year=Y&month=All,
 * 25 releases a page, newest first, each with its day, headline, link and release number.
 * "Information presented on sec.gov is considered public information and may be copied or
 * further distributed by users of the web site without the SEC's permission. Please consider
 * appropriate citation to the SEC as the source." (sec.gov/about/privacy-information, "Website
 * Dissemination", read 2026-10-28). What is used is the release's headline, day, number and link.
 *
 * The listing is the SEC's, not a company's: every release of a year is read once for every
 * company, by the year walk in `lib/ingest/secPressWalk.ts`, and each company's ingest keeps the
 * stored releases whose headline makes it the party (`secReleaseNamesParty`).
 */

export const SEC_PRESS_LISTING = "https://www.sec.gov/newsroom/press-releases";
/** The first year the listing holds: 1996 lists none (measured 2026-10-28), 1997 lists 95. */
export const SEC_PRESS_FROM = 1997;
/** A full page; a shorter one is a year's last. */
export const SEC_PRESS_PAGE_SIZE = 25;
const UA = { "User-Agent": "News Charts Research marcusowens94@gmail.com" };
const TIMEOUT_MS = 30_000;

/**
 * One release as the listing shows it. Its number and its day together are its identity: the SEC
 * has given one number twice — 2022-123 is a commissioner's swearing-in on 2022-07-18 and a
 * Pfizer statistician's charge on 2023-06-29 — and listed one release twice under two addresses
 * (2024-3), which the day and number make one.
 */
export interface SecRelease {
  /** the SEC's release number, "2010-59" or, before 2000, "98-129" */
  number: string;
  /** the day it was issued, in Washington */
  day: string;
  title: string;
  url: string;
}

const ROW = /<tr class="pr-list-page-row">([\s\S]*?)<\/tr>/g;
const TIME = /<time datetime="([^"]+)"/;
const LINK = /<a href="(\/newsroom\/press-releases\/[^"#?\s]+)"[^>]*>([\s\S]*?)<\/a>/;
const NUMBER = /views-field-field-release-number">\s*([^<]*?)\s*<\/td>/;

/**
 * The day an instant falls on in Washington. The listing gives a UTC instant, usually 07:00 or
 * 08:00Z, but a release posted in the evening is the next day in UTC: "2011-12-23T00:01:00Z" is
 * shown as Dec. 22, 2011. Read so, every one of the 6,898 rows 1997–2026 gives the day the page
 * shows (measured 2026-10-29).
 */
export function easternDay(instant: string): string | null {
  const t = Date.parse(instant);
  return Number.isNaN(t) ? null : new Date(t).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

/** A release's identity: its number and its day. */
export const releaseKey = (r: Pick<SecRelease, "number" | "day">) => `${r.number}@${r.day}`;

/** The releases on one page of the listing; a row missing a day, link or number is skipped. */
export function parseListing(html: string): SecRelease[] {
  const out: SecRelease[] = [];
  for (const [, row] of html.matchAll(ROW)) {
    const day = easternDay(TIME.exec(row)?.[1] ?? "");
    const link = LINK.exec(row);
    const number = plainText(NUMBER.exec(row)?.[1] ?? "");
    const title = plainText(link?.[2] ?? "");
    if (!day || !link || !number || !title) continue;
    out.push({ number, day, title, url: `https://www.sec.gov${link[1]}` });
  }
  return out;
}

export interface ListingPage {
  releases: SecRelease[];
  outcome: "ok" | "throttled" | "error";
  httpStatus?: number;
  detail?: string;
}

/** One page of a year's listing, newest first; `page` counts from 0. */
export async function fetchListingPage(year: number, page: number): Promise<ListingPage> {
  const params = new URLSearchParams({ year: String(year), month: "All", page: String(page) });
  try {
    const res = await fetch(`${SEC_PRESS_LISTING}?${params}`, { headers: UA, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status === 403 || res.status === 429 || res.status === 503) return { releases: [], outcome: "throttled", httpStatus: res.status };
    if (!res.ok) return { releases: [], outcome: "error", httpStatus: res.status };
    const html = await res.text();
    // a page the SEC answers without its table is not an empty year: "Request Rate Threshold
    // Exceeded" comes back as a page of its own
    if (!/pr-list-page-row|views-view-table|views-empty/.test(html)) {
      return { releases: [], outcome: "error", httpStatus: res.status, detail: "no listing on the page" };
    }
    return { releases: parseListing(html), outcome: "ok", httpStatus: res.status };
  } catch (err) {
    return { releases: [], outcome: "error", detail: String(err).slice(0, 200) };
  }
}

/**
 * What the SEC does to a company, said just before its name: "SEC Charges Goldman Sachs With
 * Fraud", "SEC Sues Dell", "SEC Sanctions", "SEC Suspends Trading in", "Commission Settles With",
 * "SEC's Division of Enforcement Charges Raymond James Financial Services".
 */
const SEC_VERB = String.raw`\b(?:SEC|Commission|Enforcement)\s+(?:Charges|Sues|Sanctions|Fines|Censures|Halts|Suspends\s+Trading\s+in(?:\s+(?:the\s+)?(?:Securities|Shares|Stock)\s+of)?|Settles\s+With)`;

/**
 * …or what it brings against it, wherever the words stand: "Settles Enforcement Proceedings
 * against J.P. Morgan Chase and Citigroup", "Obtains Final Judgment Against", "Files Settled
 * Action Against", "Brings Fraud Charges Against", "Non-Prosecution Agreement With".
 */
const AGAINST = String.raw`\b(?:Proceedings?|Judgments?|Orders?|Injunctions?|Actions?|Charges|Complaints?|Cases?|Claims?|Lawsuits?|Suits?|Settlements?|Agreements?)\s+(?:Against|With)`;

/**
 * Other parties named before it, "Charges Citigroup, Merrill Lynch and" — each a capitalised name
 * closed by a comma or an "and". Never a lone word before it, as the Justice Department rule's
 * "Sues Monopolist Google" allows: here that word is a person's ("Settlement With Former
 * Take-Two Interactive Software, Inc. CEO") or another company's ("Action Against Vivendi
 * Universal, S.A." is not Universal Corp's).
 */
const BEFORE = String.raw`(?:(?:[A-Z][\w.&'’-]*\s+){0,3}[A-Z][\w.&'’-]*(?:,\s+|,?\s+and\s+)){0,5}(?:the\s+)?`;

/**
 * What may come straight after the company: the end, punctuation, a joining word, or its own
 * verb. Stricter than the Justice Department rule's `FOLLOWS`: not "of" ("SEC Charges City of
 * Miami" is not City Holding), not a possessive ("Goldman's Former Trader"), not a hyphen or an
 * "-ing" word ("Crypto-Focused Advisory Firm", "Crypto Trading Platform Beaxy" are not The Crypto
 * Company).
 */
const AFTER = String.raw`(?=\s*$|\s*[,.;:!?()/–—]|\s+(?:for|to|over|in|on|alleging|and|resulting|regarding|concerning|relating|related|that|after|from|with|by|at|under|as|formerly|involving|arising|stemming|amid|following|because|who|which)\b|\s+${PARTY_VERB})`;

/** A release about a company's people, not the company: "Board Member of Goldman Sachs and Procter & Gamble Charged". */
const ABOUT_PEOPLE = /^(?:\S+\s+){0,3}(?:Board\s+Members?|Directors?|Executives?|Officers?|CEOs?|CFOs?|Chairm[ae]n|Employees?|Traders?|Bankers?|Brokers?|Analysts?|Partners?|Founders?|Presidents?|Insiders?|Managers?)\s+(?:of|at)\b/i;


/**
 * A name as a pattern, its initials with or without their stops: the SEC wrote "J.P. Morgan
 * Chase" where EDGAR's former name is J P MORGAN CHASE & CO.
 */
function pressName(name: string): string {
  const words = name.trim().split(/[\s-]+/);
  let out = "";
  words.forEach((w, i) => {
    const initial = /^\p{L}\.?$/u.test(w);
    if (i) out += initial && /^\p{L}\.?$/u.test(words[i - 1]) ? String.raw`\s*` : String.raw`[\s-]+`;
    out += initial ? `${w[0]}\\.?` : escapeName(w);
  });
  return out;
}

/**
 * Whether the release makes the company its party: it pays, settles, agrees or is charged — the
 * Justice Department rule's subject test (`namedAsSubject`), which, unlike the rule's other two,
 * does not take the SEC's own "Division of Risk, Strategy, and Financial Innovation" for Strategy
 * Inc.'s parent — or the SEC charges, sues or sanctions it, or brings proceedings against it, in
 * the SEC's own words. Measured on all 6,898
 * releases 1997–2026 against every company in the index (batch 73). Most name no company here, and
 * of those that do, many are about someone else: "SEC Charges Former Carter's Executive With Fraud
 * and Insider Trading", "SEC Charges Two Individuals for Roles in Innospec FCPA Scheme", "SEC
 * Proposes New Measures to Help Investors in Target Date Funds".
 *
 * As in the Justice Department rule, a longer listed company's name owns the mention, a short
 * name a bigger listed company's name begins with counts only with a legal word of its own
 * (`outrankedName`: "Prudential to Pay" is not Prudential plc's), and a name more than one listed
 * company has names none of them: "First Bancorp Settles SEC Financial Fraud Charges" is Puerto
 * Rico's First BanCorp, and nothing in the title says so to North Carolina's or Maine's.
 */
export function secReleaseNamesParty(title: string, names: readonly string[]): boolean {
  const t = title.replace(/\s+/g, " ").trim();
  if (ABOUT_PEOPLE.test(t)) return false;
  for (const name of names) {
    if (name.trim().length < 2 || longerListedNameIn(t, name) || listedCompaniesNamed(name) > 1) continue;
    const n = outrankedName(name, pressName(name));
    if (namedAsSubject(t, name, n)) return true;
    const object = new RegExp(String.raw`(?:${SEC_VERB}|${AGAINST})\s+${BEFORE}${START}${n}${DESIGNATOR}${AFTER}`, "i");
    if (object.test(t)) return true;
  }
  return false;
}

/**
 * The kept releases that make the company the party, as timeline events, newest first.
 * `namesIn(year)` gives the names the company had that year — its former names counted until
 * the day they stopped, as the Federal Register walk counts them (`namesForYear`) — and a
 * release from before `from`, the company's first price, is not its.
 */
export function secPressEvents(releases: readonly SecRelease[], namesIn: (year: number) => string[], from = ""): TimelineEvent[] {
  const byYear = new Map<number, string[]>();
  const names = (year: number) => byYear.get(year) ?? byYear.set(year, namesIn(year)).get(year)!;
  return releases
    .filter((r) => r.day >= from && /^https:\/\/www\.sec\.gov\//.test(r.url) && secReleaseNamesParty(r.title, names(Number(r.day.slice(0, 4)))))
    .sort((a, b) => b.day.localeCompare(a.day) || b.number.localeCompare(a.number))
    .map((r) => ({
      id: `sec-press-${r.number}-${r.day}`,
      date: r.day,
      type: "regulation" as const,
      title: r.title,
      source: `SEC press release ${r.number}`,
      url: r.url,
      sourceKey: "sec_press" as const,
      externalId: releaseKey(r),
      dedupBasis: `sec-press:${releaseKey(r)}`,
    }));
}
