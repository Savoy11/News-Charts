import { UA } from "./contact";
import { DESIGNATOR, FOLLOWS, escapeName, outrankedName, plainText, releaseNamesParty } from "./doj";
import { longerListedNameIn } from "./frCompany";
import { RELEASE_NAMES } from "./releaseNames";
import { isEverydayWord, oneWordName } from "./wordNames";
import type { TimelineEvent } from "./types";
import { takenBefore } from "./takenNames";

/**
 * The Commodity Futures Trading Commission's enforcement actions on the pages of the companies
 * they charge (batch 97, the 2026-11-05 proposal 2, approved by the owner that day).
 *
 * The Commission lists its actions on one paged list, newest first, ten a page:
 * `www.cftc.gov/LawRegulation/EnforcementActions/index.htm?page=N`, 2,610 actions from 1995-07-27
 * (measured 2026-11-05). It is read whole once and then its newest pages once a day, for every
 * company (`lib/ingest/cftcWalk.ts`, db/039); each company's ingest keeps the actions whose title
 * makes it the party, by the Justice Department's rule (`releaseNamesParty`) with the release
 * map's units, from its first price, one event a company a day.
 *
 * Licence: "Government information at the CFTC website is in the public domain. Public domain
 * information may be freely distributed and copied, but it is requested that in any subsequent use
 * the CFTC be given appropriate acknowledgement." (www.cftc.gov/WebPolicy/index.htm, "Copyright",
 * read 2026-11-05.) Used: each action's title, day and link; credited to the CFTC.
 */
export const CFTC_LIST = "https://www.cftc.gov/LawRegulation/EnforcementActions/index.htm";
export const CFTC_PAGE_SIZE = 10;

export interface CftcAction {
  day: string;
  /** the release's path on cftc.gov, its key: "/PressRoom/PressReleases/9320-26" */
  path: string;
  title: string;
}

/** The actions on one list page, each with its day as the list shows it ("11/03/2026") and its release's link. */
export function parseCftcList(html: string): CftcAction[] {
  const out: CftcAction[] = [];
  for (const row of html.split(/<tr\b/i).slice(1)) {
    const shown = /<time[^>]*>\s*(\d{2})\/(\d{2})\/(\d{4})\s*<\/time>/i.exec(row);
    const link = /views-field-title[^>]*>\s*<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(row);
    if (!shown || !link) continue;
    let path: string;
    try {
      const url = new URL(link[1].trim(), "https://www.cftc.gov");
      if (url.hostname !== "www.cftc.gov") continue;
      path = url.pathname;
    } catch {
      continue;
    }
    const title = plainText(link[2]);
    if (title) out.push({ day: `${shown[3]}-${shown[1]}-${shown[2]}`, path, title });
  }
  return out;
}

/**
 * Whether the title makes the company the party: the Justice Department's rule, and the two forms
 * the Commission's titles add (measured on 110 titles, 2026-11-05) —
 *
 * - the company as the object of the Commission's order or suit, a one-word name too: "CFTC Orders
 *   UBS to Pay $700 Million Penalty", "CFTC Sues American Electric Power Company";
 * - its name written with a comma, as a registrant's legal name is: "Goldman, Sachs & Co., a
 *   Commission Registrant".
 *
 * A title about a person ("Former Avista Energy Vice-President") is not the company's, nor a
 * longer listed company's name ("Hartford Financial Group, Inc.").
 */
export function cftcNamesParty(title: string, names: readonly string[], cik?: number | string): boolean {
  const t = title.replace(/\s+/g, " ").trim();
  const held = heldNames(t, names, cik);
  if (!held.length) return false;
  if (releaseNamesParty(t, held) || releaseNamesParty(t.replace(/,(?=\s+Sachs\b)/g, ""), held)) return true;
  if (/^(?:Former|Ex-)\b/i.test(t)) return false;
  for (const name of held) {
    if (name.trim().length < 2 || longerListedNameIn(t, name)) continue;
    const n = outrankedName(name, escapeName(name).replaceAll(String.raw`[\s-]+`, String.raw`,?[\s-]+`), held);
    const key = oneWordName(name);
    const follows = key && isEverydayWord(key) ? OBJECT_FOLLOWS : FOLLOWS;
    // "CFTC Orders London-Based Barclays Bank PLC to Pay", "…United Kingdom-Based Barclays Bank PLC" (batch 100, finding 6);
    // a name joined on by a hyphen is another's: "Florida-Based Inter-Global Currency" is not Inter's
    const object = new RegExp(String.raw`\b(?:CFTC|Commission|Court)\s+(?:Orders|Sues|Charges|Fines|Sanctions|Files\s+(?:a\s+)?(?:Complaint|Suit|Action|Charges)\s+Against)\s+(?:(?:[A-Z][\w.]*\s+){0,2}[A-Z][\w.]*-Based\s+)?${n}(?!-\p{L})${DESIGNATOR}${follows}`, "iu");
    const m = object.exec(t);
    if (m && !/\bwho\b/i.test(t.slice(0, m.index))) return true;
  }
  return false;
}

/**
 * What may follow a company named by an everyday word as the Commission's object: the end,
 * punctuation, or a joining word — not a possessive or another word, "People’s Alternative" is no
 * "People" (People Inc.). Any other name takes the Justice rule's `FOLLOWS`: "CME Group’s New York
 * Mercantile Exchange", "CHS Hedging, LLC" are CME's and CHS's units.
 */
const OBJECT_FOLLOWS = String.raw`(?=\s*$|\s*[,.;:()–—-]|\s+(?:to|and|for|with|in|on|over|from|as|after|by|at|of)\b)`;
const COUNT = String.raw`(?:\d+|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|several|multiple|other)`;

/** Every unit name the release map gives a company, with its owner. */
const UNITS: readonly { name: string; cik: number }[] = Object.entries(RELEASE_NAMES).flatMap(([cik, b]) => b.names.map((n) => ({ name: n.name, cik: Number(cik) })));

/**
 * The names the title may make the company's, measured on the 2,607 actions (2026-11-05):
 *
 * - not a name every mention of which a count or "Former" comes before: "CFTC Orders Six
 *   Financial Institutions to Pay" is no one company's, "with Former Citigroup Global Markets Inc.
 *   Traders" is about the traders;
 * - not a name another company's unit holds whole: "Prudential Securities, Inc. Settles" is
 *   Prudential Financial's unit, not Prudential plc's;
 * - not a namesake read by hand (`NOT_THE_COMPANY`).
 */
function heldNames(t: string, names: readonly string[], cik?: number | string): string[] {
  if (cik !== undefined && NOT_THE_COMPANY[Number(cik)]?.some((n) => n.title.test(t))) return [];
  const own = new Set(names.map((n) => n.toLowerCase()));
  return names.filter((name) => {
    const p = escapeName(name);
    const at = [...t.matchAll(new RegExp(String.raw`(?<![\w&])${p}(?![\w])`, "gi"))];
    if (at.length && at.every((m) => new RegExp(String.raw`\b(?:Former|Ex-|${COUNT})\s+(?:the\s+)?$`, "i").test(t.slice(0, m.index)))) return false;
    const other = UNITS.find((u) => u.cik !== Number(cik) && !own.has(u.name.toLowerCase()) && new RegExp(String.raw`(?<![\w&])${escapeName(u.name)}(?![\w])`, "i").test(t) && new RegExp(String.raw`^${p}\b`, "i").test(u.name));
    return !other;
  });
}

/**
 * The actions that name a listed company's name and are another firm's, read by hand on
 * 2026-11-05 among every match the 2,607 actions gave the index, by CIK.
 */
export const NOT_THE_COMPANY: Readonly<Record<number, { ticker: string; title: RegExp; why: string }[]>> = {
  26058: [{ ticker: "CTS", title: /\bCTS FINANCIAL PUBLISHING\b/i, why: "CTS Financial Publishing, a newsletter publisher charged in 2000, not CTS Corporation" }],
};

/**
 * The actions naming the company as the party, as timeline events, one a day. `names` are its
 * names, `namesOn(day)` the units it then owned; before `from`, its first price, only the units
 * marked to count before it listed (`namesBefore`).
 */
export function cftcEvents(
  actions: readonly CftcAction[],
  names: readonly string[],
  { cik, from = "", namesOn, namesBefore }: { cik?: number | string; from?: string; namesOn?: (day: string) => string[]; namesBefore?: (day: string) => string[] } = {},
): TimelineEvent[] {
  const tag = cik === undefined ? "" : `${Number(cik)}`;
  const byDay = new Map<string, CftcAction[]>();
  for (const a of actions) {
    const asked = a.day < from ? (namesBefore?.(a.day) ?? []) : [...names, ...(namesOn?.(a.day) ?? [])];
    // the rule runs only on a title holding one of the names' letters at all
    const t = lettersOf(a);
    if (!asked.length || !asked.some((n) => { const k = letters(n); return k.length >= 2 && t.includes(k); }) || !cftcNamesParty(a.title, asked, cik)) continue;
    // a name the record took from another company is that company's before the day (lib/takenNames.ts, batch 117)
    if (takenBefore(cik, a.day, a.title)) continue;
    byDay.set(a.day, [...(byDay.get(a.day) ?? []), a]);
  }
  return [...byDay]
    .sort((x, y) => y[0].localeCompare(x[0]))
    .map(([day, rows]) => {
      const sorted = [...rows].sort((x, y) => x.path.localeCompare(y.path));
      return {
        id: `cftc-${tag}-${day}`,
        date: day,
        type: "regulation" as const,
        title: sorted[0].title + (sorted.length > 1 ? ` (and ${sorted.length - 1} more that day)` : ""),
        source: "CFTC",
        url: `https://www.cftc.gov${sorted[0].path}`,
        description: sorted.length > 1 ? sorted.map((r) => r.title).join(" · ") : undefined,
        sourceKey: "cftc" as const,
        externalId: sorted.map((r) => r.path).join(","),
        dedupBasis: `cftc:${tag}@${day}`,
      };
    });
}

const letters = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const LETTERS = new WeakMap<CftcAction, string>();
function lettersOf(a: CftcAction): string {
  let held = LETTERS.get(a);
  if (held === undefined) {
    held = letters(a.title);
    LETTERS.set(a, held);
  }
  return held;
}

export interface CftcAnswer {
  actions: CftcAction[];
  /** the list's last page, from its pager */
  lastPage?: number;
  outcome: "ok" | "throttled" | "error";
  httpStatus?: number;
  detail?: string;
}

/** One page of the list, 0 the newest. A page without the list's table is an error, not an empty page. */
export async function fetchCftcPage(page: number): Promise<CftcAnswer> {
  try {
    const res = await fetch(`${CFTC_LIST}${page ? `?page=${page}` : ""}`, { headers: { ...UA, Accept: "text/html" }, signal: AbortSignal.timeout(30_000) });
    if (res.status === 403 || res.status === 429 || res.status === 503) return { actions: [], outcome: "throttled", httpStatus: res.status };
    if (!res.ok) return { actions: [], outcome: "error", httpStatus: res.status };
    const html = await res.text();
    if (!/views-field-title/.test(html)) return { actions: [], outcome: "error", httpStatus: res.status, detail: "no list on the page" };
    const last = [...html.matchAll(/[?&]page=(\d+)/g)].map((m) => Number(m[1]));
    return { actions: parseCftcList(html), lastPage: last.length ? Math.max(...last) : 0, outcome: "ok", httpStatus: res.status };
  } catch (err) {
    return { actions: [], outcome: "error", detail: String(err).slice(0, 200) };
  }
}
