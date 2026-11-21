import { respondents } from "./cfpb";
import { UA } from "./contact";
import { UNITS as CPSC_UNITS } from "./cpscRecalls";
import { eeocUnitNamesOn } from "./eeoc";
import { andSpellings } from "./edgarName";
import { BRANDED_SITE, UNITS as EPA_UNITS, epaParty } from "./epaCases";
import { takenBefore } from "./takenNames";
import type { TimelineEvent } from "./types";

/**
 * The National Labor Relations Board's decisions in the company's own cases, from 1962 (batch 161, the
 * 2026-11-18 proposal 2, approved by the owner that day with call (a): a row from the listing alone).
 * The Board decides every unfair labor practice case and contested union election in the private sector,
 * and each decision's caption names the employer. No other source the pages read covers labour relations.
 *
 * The Board's decision listing (`NLRB_LIST`, 100 a page): each row gives the issue day, the citation ("375
 * NLRB No. 68", a slip opinion; "1 NLRB 519", a bound volume), the case name with the decision's document
 * and the case number. 66,645 decisions on 2026-11-18, 667 pages, back to 1935-12-07. It is read whole once a
 * year and its newest page once a day, for every company at once (lib/ingest/nlrbWalk.ts, db/054), the
 * whole read only in the NLRB's night window, by its policy (`inNightWindow`).
 *
 * The kind is the case number's (`nlrbKind`): CA, and C before 1948, is an unfair labor practice case
 * against the employer; RC, RD, RM, R before 1948, RE (the 1940s' employer petitions), UA (the union-shop
 * polls of 1947–1951), UC, UD and AC are an election or a unit question at the employer. CB, CC, CD, CE,
 * CG and CP are cases against a union, and advisory opinions (AO), fee applications (ED) and the rest are
 * no employer's case: they make no row, whatever their caption names ("UFCW, Local 700 (Kroger)").
 *
 * A decision is the company's by EPA's form of the caption rule (`epaParty`: one name joined by "and" is
 * one name, so "Wisconsin Power and Light Co." is no "Light Co."; a person written surname first is no
 * company), on the caption with its "d/b/a" read as a party (`respondents`), under the company's names of
 * the year, the release map's and the EEOC's units of the day, EPA's and the CPSC's units on their days
 * and its own units (`NLRB_UNITS`); never a namesake (`NOT_THE_COMPANY`), nor a name its record took from
 * another company before the day (lib/takenNames.ts); from its first price. A day before the Act's
 * (1935-07-05) is a misdated row and makes none. A company's decisions of a day are one row, its id the
 * decisions' documents, so a joint employers' decision is "Also on" the other page (lib/alsoOn.ts).
 *
 * The listing does not say how the Board ruled; the decision does, and the row says so (the owner's call
 * (a)). Licence: the NLRB's site policies (read 2026-11-18) state no licence or copyright terms, so the
 * decisions are a federal agency's own work, 17 U.S.C. § 105, under the owner's ruling of 2026-11-12. They
 * do state a disclaimer ("the information available on this web site may not reflect official positions of
 * the NLRB") and a bulk-data policy: "bulk data extractions be scheduled for non-peak hours (between 11pm
 * EST – 6am EST)", and no more than 5 concurrent requests or 20 per 200 ms; the walk reads one page at a
 * time, `GAP_MS` apart.
 */
export const NLRB_LIST = "https://www.nlrb.gov/cases-decisions/decisions/board-decisions";
export const NLRB_PAGE_SIZE = 100;
/** A page of the listing, 100 decisions, every volume, newest first. */
export const nlrbPageUrl = (page: number) => `${NLRB_LIST}?volume=-1&items_per_page=${NLRB_PAGE_SIZE}&page=${page}`;
/** The decision's own document. */
export const nlrbDocumentUrl = (document: string) => `https://apps.nlrb.gov/link/document.aspx/${document}`;
/** The National Labor Relations Act's day: a decision dated before it is misdated in the listing ("02/14/1919"). */
export const ACT_DAY = "1935-07-05";

export interface NlrbDecision {
  /** the decision's document id on apps.nlrb.gov, "09031d45843ede05" */
  document: string;
  day: string;
  /** "375 NLRB No. 68", "1 NLRB 519" */
  citation: string;
  /** the case name as the listing gives it, "Pepperjacks, LLC d/b/a Notch 8 Brewery" */
  name: string;
  /** "13-CA-393585", "00-C-000024" */
  caseNumber: string;
}

/** A cell's text, its codes read; the listing writes some older captions' "&" twice over ("Santa Fe Hotel &amp;amp; Casino"). */
const text = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:amp;)+/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&rsquo;|&#8217;/g, "'")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * A page of the listing: its decisions, and the last page the pager names (none on the last page itself).
 * `table` is false when the page holds no listing at all (a refusal served as a page), which is no empty page.
 */
export function parseNlrbListing(html: string): { decisions: NlrbDecision[]; lastPage: number | null; table: boolean } {
  const start = html.search(/<table[^>]*case-decisions-table/i);
  if (start < 0) return { decisions: [], lastPage: null, table: false };
  const body = html.slice(start, html.indexOf("</table>", start));
  const decisions: NlrbDecision[] = [];
  for (const tr of body.match(/<tr>[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    if (cells.length < 4) continue;
    const day = /(\d{2})\/(\d{2})\/(\d{4})/.exec(cells[0]);
    const doc = /document\.aspx\/([0-9a-f]+)/i.exec(cells[2]);
    if (!day || !doc) continue;
    decisions.push({
      document: doc[1].toLowerCase(),
      day: `${day[3]}-${day[1]}-${day[2]}`,
      // a bound volume's citation without its leading zeros: "001 NLRB 519" is 1 NLRB 519
      citation: text(cells[1]).replace(/^0+(?=\d)/, ""),
      name: text(cells[2]),
      caseNumber: text(cells[3]),
    });
  }
  const last = /pager__item--last[\s\S]{0,400}?[?&](?:amp;)?page=(\d+)/i.exec(html.slice(html.indexOf("</table>", start)));
  return { decisions, lastPage: last ? Number(last[1]) : null, table: true };
}

/** The case's kind by its number's letters: the employer's unfair labor practice case, a representation case, or none. */
export function nlrbKind(caseNumber: string): "ulp" | "representation" | null {
  const letters = /^[0-9A-Z]{1,4}-([A-Z]{1,2})-/i.exec(caseNumber.trim())?.[1].toUpperCase();
  if (!letters) return null;
  if (letters === "CA" || letters === "C") return "ulp";
  if (["RC", "RD", "RM", "R", "RE", "UA", "UC", "UD", "AC"].includes(letters)) return "representation";
  return null;
}

const KIND_LABEL = { ulp: "an unfair labor practice case against the employer", representation: "a representation case, an election or a unit question" } as const;

/**
 * Employers a company's names do not reach by the rule, by CIK, read by hand: the units named after it and
 * the spellings the listing gives (batch 161, from the sample of 24 pages the 2026-11-18 proposal read).
 */
export const NLRB_UNITS: Readonly<Record<number, readonly { ticker: string; name: RegExp; from?: string; to?: string; why: string }[]>> = {
  1018724: [{ ticker: "AMZN", name: /^Amazon\.com Services\b/i, why: "Amazon.com Services, LLC, the company's US operating company, as the FDA's letters spell it too" }],
  354950: [{ ticker: "HD", name: /^Home Depot,? U\.?\s?S\.?\s?A\b/i, why: "Home Depot U.S.A., Inc., its operating company" }],
  1744489: [{ ticker: "DIS", name: /^Walt Disney Parks and Resorts\b/i, why: "Walt Disney Parks and Resorts U.S., Inc., its parks company" }],
  1048911: [{ ticker: "FDX", name: /^FedEx (?:Home Delivery|Ground|Freight|Express)\b/i, why: "FedEx's operating companies, named after it" }],
  936468: [{ ticker: "LMT", name: /^Lockheed Martin\b/i, why: "Lockheed Martin's own companies (\"Lockheed Martin Tactical Aircraft Systems\", \"Lockheed Martin Skunk Works\")" }],
  79879: [{ ticker: "PPG", name: /^PPG\b/i, why: "PPG Industries' own companies (\"PPG Aerospace\")" }],
  1108109: [{ ticker: "CYH", name: /^CHS Community Health\b/i, why: "CHS/Community Health Systems, Inc., as the listing writes the company" }],
  40545: [{ ticker: "GE", name: /^General Electric\b/i, why: "GE's own divisions written as employers (\"General Electric Wiring Devices\"), as the Labor Department's certifications write them (lib/taaPetitions.ts)" }],
};

/** Employers the rule would give a company that are not its, by CIK, read by hand. */
export const NOT_THE_COMPANY: Readonly<Record<number, readonly { ticker: string; name: RegExp; why: string }[]>> = {
  1049659: [{ ticker: "SID", name: /^National Steel\b/i, why: "National Steel Corporation, the American steelmaker, not Companhia Siderúrgica Nacional (as EPA's and the SEC's lists hold)" }],
  1306965: [
    {
      ticker: "SHEL",
      name: /^Shell Co\.?$/i,
      why: "\"Shell Co.\", the listing's Shell Company (Puerto Rico) of 1994: Shell's companies are Shell plc's only from 2005-07-20, when its record became the group's parent (the owner's call, as EPA's unit of Shell holds)",
    },
  ],
};

const alnum = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Whether a decision's employer is the company on its day, by its units, the namesakes and the rule. */
export function nlrbIsCompany(d: Pick<NlrbDecision, "name" | "day">, cik: number, names: () => string[]): boolean {
  const name = d.name.trim();
  if (NOT_THE_COMPANY[cik]?.some((r) => r.name.test(name))) return false;
  // a name the record took from another company is that company's before the day (lib/takenNames.ts)
  if (takenBefore(cik, d.day, name)) return false;
  const within = (u: { from?: string; to?: string }) => d.day >= (u.from ?? "") && (!u.to || d.day <= u.to);
  if (NLRB_UNITS[cik]?.some((u) => within(u) && u.name.test(name))) return true;
  // the units EPA's and the CPSC's rules read under their own names, on their days, as the Labor
  // Department's certifications read them (lib/taaPetitions.ts, batch 160); a branded site is no brand's
  if (EPA_UNITS[cik]?.some((u) => within(u) && u.defendant.test(name) && !(u.branded && BRANDED_SITE.test(name)))) return true;
  if (CPSC_UNITS[cik]?.some((u) => within(u) && u.firm.test(name))) return true;
  const held = names();
  const letters = alnum(name);
  if (!held.flatMap(andSpellings).some((n) => alnum(n).length >= 2 && letters.includes(alnum(n)))) return false;
  return epaParty(respondents(name), held) !== null;
}

const LIMIT = 900;

/** "375 NLRB No. 63, Tesla, Inc., case 03-CA-312352: an unfair labor practice case against the employer" */
const decisionLine = (d: NlrbDecision) => `${d.citation}, ${d.name}, case ${d.caseNumber}: ${KIND_LABEL[nlrbKind(d.caseNumber)!]}`;

/**
 * The company's decisions as timeline events, newest first, from `from`, its first price: one row a day,
 * each decision with its citation, caption, case number and kind, linked to the first's document. The
 * listing does not say how the Board ruled, and the row says so.
 */
export function nlrbEvents(
  decisions: readonly NlrbDecision[],
  namesIn: (year: number) => string[],
  { cik, from = "", namesOn }: { cik: number | string; from?: string; namesOn?: (day: string) => string[] },
): TimelineEvent[] {
  const tag = Number(cik);
  const byYear = new Map<number, string[]>();
  const yearNames = (year: number) => byYear.get(year) ?? byYear.set(year, namesIn(year)).get(year)!;
  const byDay = new Map<string, NlrbDecision[]>();
  for (const d of decisions) {
    if (d.day < from || d.day < ACT_DAY || !nlrbKind(d.caseNumber)) continue;
    if (!nlrbIsCompany(d, tag, () => [...yearNames(Number(d.day.slice(0, 4))), ...eeocUnitNamesOn(tag, d.day), ...(namesOn?.(d.day) ?? [])])) continue;
    (byDay.get(d.day) ?? byDay.set(d.day, []).get(d.day)!).push(d);
  }
  return [...byDay.entries()]
    .sort(([x], [y]) => y.localeCompare(x))
    .map(([day, found]) => {
      const kept = [...new Map(found.map((d) => [d.document, d])).values()].sort((a, b) => a.citation.localeCompare(b.citation, "en", { numeric: true }) || a.caseNumber.localeCompare(b.caseNumber));
      const one = kept[0];
      const title =
        kept.length === 1
          ? `NLRB decision: ${one.name}, ${one.citation} (case ${one.caseNumber}), ${KIND_LABEL[nlrbKind(one.caseNumber)!]}`
          : `${kept.length} NLRB decisions: ${[...new Set(kept.map((d) => d.name))].join("; ")}`;
      const body = `${kept.map(decisionLine).join(". ")}. How the Board ruled is in the decision; the Board's listing does not say.`;
      const basis = `nlrb:${tag}@${day}`;
      return {
        id: `nlrb-${tag}-${day}`,
        date: day,
        type: "regulation" as const,
        title: title.length <= 300 ? title : `${title.slice(0, 299).replace(/\s+\S*$/, "")}…`,
        description: body.length <= LIMIT ? body : `${body.slice(0, LIMIT - 1).replace(/\s+\S*$/, "")}…`,
        source: "NLRB",
        url: nlrbDocumentUrl(one.document),
        sourceKey: "nlrb_decisions" as const,
        // the decisions' documents, each the same on every page a joint employers' decision is on ("Also on")
        externalId: kept.map((d) => d.document).join(","),
        // the company's one event a day
        dedupBasis: basis,
      };
    });
}

/**
 * Whether `now` is in the NLRB's night window for bulk reads, 11 pm to 6 am Eastern ("between 11pm EST – 6am
 * EST", its policy), with `room` minutes left in it for the read to finish: the whole listing is about 15
 * minutes at `GAP_MS`.
 */
export function inNightWindow(now: Date, room = 45): boolean {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  const minutes = hour * 60 + minute;
  // minutes since 23:00, wrapping past midnight
  const since = (minutes - 23 * 60 + 24 * 60) % (24 * 60);
  return since < 7 * 60 - room;
}

export type NlrbAnswer = { decisions: NlrbDecision[]; lastPage: number | null; outcome: "ok" | "throttled" | "error"; httpStatus?: number; detail?: string };

/** A page of the listing. A page without the listing on it is an error, not an empty page. */
export async function fetchNlrbPage(page: number): Promise<NlrbAnswer> {
  try {
    const res = await fetch(nlrbPageUrl(page), { headers: { ...UA, Accept: "text/html" }, signal: AbortSignal.timeout(60_000) });
    if (res.status === 403 || res.status === 429 || res.status === 503) return { decisions: [], lastPage: null, outcome: "throttled", httpStatus: res.status };
    if (!res.ok) return { decisions: [], lastPage: null, outcome: "error", httpStatus: res.status };
    const got = parseNlrbListing(await res.text());
    if (!got.table) return { decisions: [], lastPage: null, outcome: "error", httpStatus: res.status, detail: "no listing on the page" };
    return { decisions: got.decisions, lastPage: got.lastPage, outcome: "ok", httpStatus: res.status };
  } catch (err) {
    return { decisions: [], lastPage: null, outcome: "error", detail: String(err).slice(0, 200) };
  }
}
