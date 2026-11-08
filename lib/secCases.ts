import { listingTotal } from "./listingGaps";
import { plainText } from "./doj";
import { longerListedNameIn } from "./frCompany";
import { listedCompaniesNamed, outrankingNameFor } from "./sec";
import { andSpellings, legalSpellings } from "./edgarName";
import { easternDay, pressName } from "./secPress";
import type { TimelineEvent } from "./types";
import { UA } from "./contact";
import { takenBefore } from "./takenNames";

/**
 * The SEC's litigation releases and administrative proceedings in which a listed company is a
 * defendant or a respondent, from 1995, the first year either listing holds (batch 83, the
 * 2026-11-01 proposal 2, a source the owner approved on 2026-11-01).
 *
 * The press releases (`lib/secPress.ts`) are the SEC's announcements; these two listings are its
 * record of each case: a litigation release for each step of a suit it brings in court, an
 * administrative proceeding for each order it issues itself. Most press releases have one
 * behind them, and most of these have no press release: of the 1,022 company days the index's
 * companies had in 1995–2026, 813 fell on a day no press release names the company (measured
 * 2026-11-01, under current names; 1,047 since batch 85, 1,146 with batch 88's units).
 *
 * Read from the two year listings, www.sec.gov/enforcement-litigation/litigation-releases and
 * …/administrative-proceedings, ?year=Y&month=All&page=N, 100 rows a page, newest first. Each row
 * gives an instant, a caption naming the defendants or respondents, the release numbers, a
 * proceeding's file number, and a link. Under the press releases' licence: "Information presented
 * on sec.gov is considered public information and may be copied or further distributed by users of
 * the web site without the SEC's permission. Please consider appropriate citation to the SEC as the
 * source." (sec.gov/about/privacy-information, read 2026-10-28). What is used is the caption, day,
 * numbers and link.
 *
 * The listings are the SEC's, not a company's: every year is read once for every company
 * (`lib/ingest/secCasesWalk.ts`), and each company's ingest keeps the stored rows whose caption
 * names it as a party (`captionParty`).
 */

export const SEC_CASE_LISTINGS = {
  litigation: "https://www.sec.gov/enforcement-litigation/litigation-releases",
  proceeding: "https://www.sec.gov/enforcement-litigation/administrative-proceedings",
} as const;
export type CaseListing = keyof typeof SEC_CASE_LISTINGS;
export const CASE_LISTINGS = Object.keys(SEC_CASE_LISTINGS) as CaseListing[];
/** The first year either listing holds: 1994 lists none, 1995 lists both (measured 2026-11-01). */
export const SEC_CASES_FROM = 1995;
/** A full page; a shorter one is a year's last. */
export const SEC_CASES_PAGE_SIZE = 100;
const TIMEOUT_MS = 60_000;

/** One row as the listing shows it. Its listing, release number and day together are its identity. */
export interface SecCase {
  listing: CaseListing;
  /** as the row gives it: "LR-21795", "34-63600, AAER-3222", or before 1997 "7244;34-36519;3-8886" */
  number: string;
  /** the day in Washington */
  day: string;
  /** the defendants or respondents, as the SEC writes them */
  caption: string;
  /** a proceeding's file number, "3-14116": every order in one proceeding carries it */
  fileNo?: string;
  url: string;
}

const ROW = /<tr class="pr-list-page-row">([\s\S]*?)<\/tr>/g;
const TIME = /<time datetime="([^"]+)"/;
const CAPTION = /release-view__respondents'>\s*<a href='([^']+)'>([\s\S]*?)<\/a>/;
const NUMBER = /view-table_subfield_release_number">[\s\S]*?view-table_subfield_value">([\s\S]*?)<\/span>/;
const FILE_NO = /view-table_subfield_file_number">[\s\S]*?view-table_subfield_value">([\s\S]*?)<\/span>/;

/** A row's identity: its listing, number and day. */
export const caseKey = (c: Pick<SecCase, "listing" | "number" | "day">) => `${c.listing}:${c.number}@${c.day}`;

/** The rows on one page of a listing; a row missing a day, caption, number or sec.gov link is skipped. */
export function parseCaseListing(html: string, listing: CaseListing): SecCase[] {
  const out: SecCase[] = [];
  for (const [, row] of html.matchAll(ROW)) {
    const day = easternDay(TIME.exec(row)?.[1] ?? "");
    const caption = CAPTION.exec(row);
    const number = plainText(NUMBER.exec(row)?.[1] ?? "");
    const fileNo = plainText(FILE_NO.exec(row)?.[1] ?? "");
    const text = plainText(caption?.[2] ?? "");
    if (!day || !caption || !number || !text) continue;
    const href = plainText(caption[1]);
    const url = href.startsWith("/") ? `https://www.sec.gov${href}` : href;
    if (!/^https:\/\/www\.sec\.gov\//.test(url)) continue;
    out.push({ listing, number, day, caption: text, ...(fileNo ? { fileNo } : {}), url });
  }
  return out;
}

export interface CasePage {
  cases: SecCase[];
  /** the page's own count of the rows its view holds ("1 to 100 of 439 items"), where it gives one */
  total?: number;
  outcome: "ok" | "throttled" | "error";
  httpStatus?: number;
  detail?: string;
}

/** One page of a listing's year, or of one month (1–12) of it, newest first; `page` counts from 0. */
export async function fetchCasePage(listing: CaseListing, year: number, page: number, month?: number): Promise<CasePage> {
  const params = new URLSearchParams({ year: String(year), month: month ? String(month) : "All", page: String(page) });
  try {
    const res = await fetch(`${SEC_CASE_LISTINGS[listing]}?${params}`, { headers: UA, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status === 403 || res.status === 429 || res.status === 503) return { cases: [], outcome: "throttled", httpStatus: res.status };
    if (!res.ok) return { cases: [], outcome: "error", httpStatus: res.status };
    const html = await res.text();
    // a page the SEC answers without its table is not an empty year: "Request Rate Threshold
    // Exceeded" comes back as a page of its own
    if (!/pr-list-page-row|views-view-table|views-empty/.test(html)) {
      return { cases: [], outcome: "error", httpStatus: res.status, detail: "no listing on the page" };
    }
    const total = listingTotal(html);
    return { cases: parseCaseListing(html, listing), ...(total === undefined ? {} : { total }), outcome: "ok", httpStatus: res.status };
  } catch (err) {
    return { cases: [], outcome: "error", detail: String(err).slice(0, 200) };
  }
}

/**
 * Where a party starts in a caption: its beginning, after a ";" or "," or "and", or after the
 * words that give an entity's other name ("EMB Corporation (n/k/a AMTGroup, Inc.)").
 */
const LEAD = String.raw`(?:^|[;,]\s*|\band\s+|\b(?:n\/k\/a|f\/k\/a|a\/k\/a|d\/b\/a|formerly(?:\s+known\s+as)?|now\s+known\s+as)\s+)`;
/** …and where it ends: the caption's end, the next party, a bracket, "et al.", or its other name ("…, L.P. f/k/a Spear, Leeds & Kellogg, L.P.") */
const TAIL = String.raw`(?=\s*(?:$|[;,()]|\band\b|\bet\s+al\b|\b(?:n\/k\/a|f\/k\/a|a\/k\/a|d\/b\/a|formerly)\b))`;

/**
 * The words a caption may write after a company's name and still mean the company: its legal form
 * and nothing else. A caption gives each party its full legal name, so "Southern Financial Group,
 * Inc." is another company than Southern Company, "Reliance Holdings, LLC" than Reliance, Inc., and
 * "Lucent Technologies Inc." than Lucent, Inc.; the press releases' `DESIGNATOR`, which lets
 * "Holdings", "Financial", "Securities" or "Technologies" follow a name in a headline, gave 231
 * litigation releases to 127 companies, many of them namesakes like these (measured 2026-11-01).
 * A bank's securities firm reaches it by its own full name, from the release rules' map.
 */
export const LEGAL_WORD = String.raw`(?:,?\s+|\s*&\s*)(?:Inc\.?|Incorporated|Corp\.?|Corporation|Company|Co\.?|LLC|L\.\s?L\.\s?C\.?|L\.\s?P\.?|LP|Ltd\.?|Limited|plc|P\.L\.C\.?|N\.\s?A\.?|S\.\s?A\.?|S\.\s?p\.\s?A\.?|SpA|A\.?G\.?|N\.\s?V\.?|SE|AB|ASA|B\.\s?V\.?|GmbH|Pty\.?)(?![\w-])`;

/**
 * A name as a caption writes it: the press releases' pattern, its words also parted by a comma,
 * as the SEC wrote "Bear, Stearns & Co. Inc." where the company called itself Bear Stearns.
 */
const captionName = (name: string) => pressName(name).replaceAll(String.raw`[\s-]+`, String.raw`,?[\s-]+`);

/**
 * The defendants a caption charges: relief defendants, who hold money from a scheme but are not
 * charged with it, are cut off — "…, and Jennifer Ransom, Defendants, and Bosco Financial, LLC,
 * Relief Defendants" keeps what comes before "Defendants", and "…, relief defendants Personal
 * Communications Corp., …" what comes before "relief".
 */
export function chargedParties(caption: string): string {
  const t = caption.replace(/,(?=[A-Za-z])/g, ", ").replace(/\s+/g, " ").trim();
  // a brief the SEC filed in someone else's suit charges no one: "Milestone Scientific (Securities
  // Litigation); December 4, 1998 ( Accompanying Amicus Brief …)"
  if (/\bamicus\b/i.test(t)) return "";
  if (!/\brelief\s+defendants?\b/i.test(t)) return t;
  const charged = /^(.*?),?\s+(?<!relief\s)defendants?\b/i.exec(t);
  if (charged && !/\brelief\s*$/i.test(charged[1])) return charged[1];
  return t.split(/,?\s*(?:and\s+)?\brelief\s+defendants?\b/i)[0];
}

/**
 * The party in the caption that is the company under one of its names, as the caption writes it,
 * or null. A party is a whole entry of the caption: the name and its legal words, from one
 * separator to the next, so "One or More Unknown Purchasers of Securities of Martek Biosciences
 * Corporation" names no party Martek, nor "…of Options of InterMune, Inc." InterMune. The guards
 * are the press releases': a longer listed company's name owns the party ("Prudential Financial,
 * Inc." is not Prudential plc), a short name a bigger listed company's name begins with counts only
 * with a legal word of its own, and a name more than one listed company has names none of them.
 */
export function captionParty(caption: string, names: readonly string[]): string | null {
  const t = chargedParties(caption);
  // a legal name's own legal form is the caption's to write: "DANA HOLDING CORP" is "Dana Holding
  // Corporation (as Successor Registrant to Dana Corporation)" in the case of 2009, and every guard
  // below reads the name so shortened. Where that shortened name is shared, the legal name as filed
  // is still its own: "Rio Tinto plc" is RIO TINTO PLC's, and "Rio Tinto" two listed companies'.
  // …and the legal name in either spelling of its form, "The Toro Company" for TORO CO, which counts
  // where the shortened name is shared (batch 111: Toro's recalls were 5 of 28); and a name with
  // "&" with "and" in its place, as EPA writes Goodyear's and Air Products' (batch 120)
  const variants = [...new Set(names.flatMap(andSpellings).flatMap((raw) => {
    const stem = raw.trim().replace(new RegExp(String.raw`(?:${LEGAL_WORD})+\.?$`, "i"), "");
    return stem && stem !== raw.trim() ? [stem, ...legalSpellings(raw)] : [raw.trim()];
  }))];
  for (const name of variants) {
    if (name.length < 2 || listedCompaniesNamed(name) > 1) continue;
    // a short name a bigger listed company's name begins with carries a legal word of its own
    const legal = outrankingNameFor(name, names) ? `${LEGAL_WORD}(?:${LEGAL_WORD})*` : `(?:${LEGAL_WORD})*`;
    // …and all of the legal words that follow are the party's: the name is not cut short of them
    // to meet a separator, so "Appian, Inc. Bulk Storage Software, Inc." names no "Appian"
    const party = new RegExp(String.raw`${LEAD}((?:the\s+)?${captionName(name)}(?=(${legal}))\2\.?)${TAIL}`, "gi");
    const oneWord = !/\s/.test(name);
    for (const m of t.matchAll(party)) {
      if (longerListedNameIn(m[1], name)) continue;
      // a one-word name with no legal word is the party only standing alone, as "Sanofi" and
      // "TransUnion" are their captions: "Dow, Mitchell B." is a person, "Fox, Reusch & Co., Inc."
      // and "Dover and Associates, Inc." are other firms, and so is "City (U.K.), Ltd."
      if (oneWord && !m[2] && !/^\s*(?:$|;|\((?:n\/k\/a|f\/k\/a|a\/k\/a|formerly|now)\b|et\s+al\b)/i.test(t.slice(m.index + m[0].length))) continue;
      return m[1].trim();
    }
  }
  return null;
}

const alnum = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * The cases a caption names a listed company's exact name in that are another company's, each read
 * by hand on 2026-11-01 among every match the 30,654 rows of 1995–2026 gave the index (and on
 * 2026-11-02 among the 30,747 of batch 85), by CIK. The
 * rule cannot tell a namesake from the company, and the company's first price, which keeps a
 * company off the years before it listed, does not reach these, or not all of their rows.
 * The SEC revokes the registrations of delinquent filers in lists of five to seven shells, which
 * the proposal said must land on no company; the ones a listed company's name is among are here.
 */
export const NOT_THE_COMPANY: Readonly<Record<number, { ticker: string; caption: RegExp; why: string }[]>> = {
  880984: [{ ticker: "ACFN", caption: /^Overland Energy, Inc\., Acorn Energy, Inc\./, why: "another Acorn Energy, sued with Overland Energy and its promoters in 2010 (LR-21736); none of its people is Acorn Energy's" }],
  63908: [{ ticker: "MCD", caption: /\bMcDonalds Ltd\./, why: "\"McDonalds Ltd.\", one of a promoter's offshore companies in the Lybrand case of 2000 and 2003, not McDonald's Corporation" }],
  932781: [{ ticker: "FCCO", caption: /^Falcon Entertainment Corp\./, why: "a 2009 list of revoked registrations, \"First Mutual, Inc. (n/k/a First Community, Inc.)\", not First Community Corporation of South Carolina" }],
  320121: [{ ticker: "TLS", caption: /^Telos, Inc\., MAS Acquisition XVII/, why: "a 2012 list of revoked registrations: the shell \"Telos, Inc.\", not Telos Corporation" }],
  1320760: [{ ticker: "TSSI", caption: /^Telos, Inc\., MAS Acquisition XVII/, why: "the same 2012 list: \"TSS Ltd.\", not TSS, Inc." }],
  1711012: [{ ticker: "VAI", caption: /^Quintek Technologies, Inc\./, why: "a 2012 list of revoked registrations; Valor Energy Inc.'s own record begins in 2017" }],
  1342325: [{ ticker: "CGDCF", caption: /^Canadian Mono Mines, Inc\./, why: "a 2011 list of revoked registrations: \"Carlin Resources Corp. (n/k/a Carlin Gold Corp.)\", a registered issuer, where Carlin Gold Corp's record holds only private-placement notices" }],
  1049659: [{ ticker: "SID", caption: /^National Steel Corporation$/, why: "the American steelmaker of 2001, not Companhia Siderúrgica Nacional, whose EDGAR name is NATIONAL STEEL CO" }],
  109177: [{ ticker: "SPB", caption: /^Spectrum Brands Corp\./, why: "a 2001 promoter's company; the record that is Spectrum Brands Holdings today was Zapata's then, and took the name in 2018" }],
  1786108: [{ ticker: "TRIN", caption: /^Trinity Capital Corporation$/, why: "Trinity Capital Corporation of Los Alamos, a bank's holding company, charged 2015–2021, not Trinity Capital Inc., the lender listed in 2021" }],
  709283: [{ ticker: "QMCO", caption: /\bQuantum Corp\. a\/k\/a Quantum Trading\b/, why: "\"Quantum Corp. a/k/a Quantum Trading\", one of Teddy Wayne Solomon's companies in a 1997 fraud (LR-15555), not Quantum Corporation, the storage maker (batch 85)" }],
};

/** What each listing is, as a title and a source line say it. */
const KIND: Record<CaseListing, { title: string; source: string }> = {
  litigation: { title: "SEC litigation release", source: "SEC litigation release" },
  proceeding: { title: "SEC administrative proceeding", source: "SEC administrative proceeding" },
};

/**
 * The kept rows whose caption names the company as a party, as timeline events, newest first: one
 * a day, since the SEC files one case's complaint and its settlement, or a proceeding's order and
 * its notice, the same day. `namesIn(year)` gives the company's names that year, `namesOn(day)`
 * the units it then owned (`releaseNamesOn`), and a row from before `from`, the company's first
 * price, is not its. The title names the company as the caption does, and the description gives
 * the whole caption, each release number and a proceeding's file number, which every order in that
 * proceeding carries. The event is the company's own, `cik` in its identity: two banks one caption
 * names each get theirs, titled by their own party. Before `from` only the units `namesBefore(day)`
 * gives count (`releaseNamesBefore`, the owner's calls b and c, batch 90), none of the company's
 * own names.
 */
export function secCaseEvents(
  cases: readonly SecCase[],
  namesIn: (year: number) => string[],
  { cik, from = "", namesOn, namesBefore }: { cik: number | string; from?: string; namesOn?: (day: string) => string[]; namesBefore?: (day: string) => string[] },
): TimelineEvent[] {
  const byYear = new Map<number, string[]>();
  const names = (year: number) => byYear.get(year) ?? byYear.set(year, namesIn(year)).get(year)!;
  const byDay = new Map<string, { c: SecCase; party: string }[]>();
  for (const c of cases) {
    if (!/^https:\/\/www\.sec\.gov\//.test(c.url)) continue;
    if (NOT_THE_COMPANY[Number(cik)]?.some((n) => n.caption.test(c.caption))) continue;
    // a name the record took from another company is that company's before the day (lib/takenNames.ts, batch 117)
    if (takenBefore(cik, c.day, c.caption)) continue;
    const held = c.day < from ? (namesBefore?.(c.day) ?? []) : [...names(Number(c.day.slice(0, 4))), ...(namesOn?.(c.day) ?? [])];
    if (!held.length) continue;
    // a name can only be a party where the caption's letters and digits hold its own: most rows
    // are read no further
    // …in either spelling of "&", as every other source's prefilter reads it (the 2026-11-08 audit, set aside 2)
    const letters = alnum(c.caption);
    if (!held.flatMap(andSpellings).some((n) => alnum(n).length >= 2 && letters.includes(alnum(n)))) continue;
    const party = captionParty(c.caption, held);
    if (!party) continue;
    (byDay.get(c.day) ?? byDay.set(c.day, []).get(c.day)!).push({ c, party });
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, rows]) => {
      // litigation first, then by number, so a day's event is the same whatever order the rows came in
      rows.sort((x, y) => x.c.listing.localeCompare(y.c.listing) || x.c.number.localeCompare(y.c.number));
      const { c, party } = rows[0];
      const others = chargedParties(c.caption).replace(/[.,;\s]+$/, "") !== party.replace(/[.,;\s]+$/, "");
      const step = (r: SecCase) => `${KIND[r.listing].source} ${r.number}${r.fileNo ? ` (file ${r.fileNo})` : ""}: ${r.caption}`;
      return {
        id: `sec-case-${Number(cik)}-${day}`,
        date: day,
        type: "regulation" as const,
        title: `${KIND[c.listing].title}: ${party}${others ? " and others" : ""}`,
        description: rows.map((r) => step(r.c)).join(" · ").slice(0, 600),
        source: `${KIND[c.listing].source} ${c.number}`,
        url: c.url,
        sourceKey: "sec_cases" as const,
        // every case of the day, so another page holding any of them finds this row ("Also on",
        // batch 106); a day of one case keeps the key it always had
        externalId: rows.map((r) => caseKey(r.c)).join(","),
        // the company's one event a day: rows learned later the same day change its description and add their keys
        dedupBasis: `sec-cases:${Number(cik)}@${day}`,
      };
    });
}
