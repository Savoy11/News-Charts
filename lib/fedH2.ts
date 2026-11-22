import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { named, partyIsCompany } from "./hsrEarly";
import type { TimelineEvent } from "./types";

/**
 * The Federal Reserve's weekly actions on the company's applications, 1996–2026 (batch 173, the 2026-11-22b
 * proposal 2, approved by the owner that day with its recommended call (a): the Fed's actions on the company's
 * deals, on the action's day; the applications' Federal Register notices are not read).
 *
 * The Board's weekly release "H.2, Actions of the Board, Its Staff, and the Federal Reserve Banks; Applications
 * and Reports Received" lists each week's actions on applications: the Board's own, and those its staff and the
 * twelve Reserve Banks took under delegated authority, each under its category ("Bank Holding Companies",
 * "Change in Bank Control") and its Reserve Bank or Board office, with the outcome and its day. Most of a bank's
 * deals are decided under delegated authority, and the H.2 is where those are published; the Board's own orders
 * and press releases (`lib/fedPress.ts`) carry only what the Board itself decided.
 *
 * The releases: the archive's index (`H2_INDEX`) lists every week from 1996-11-02, and each week's release is
 * one PDF (`h2Pdf`), read once with poppler's `pdftotext -layout` (`readH2`). Three layouts are read:
 *  - 1996 to 1998, the categories in capitals, "-- " before what was asked and "- Approved, May 7, 1997"
 *    (the first weeks a scan's text layer, the district beside the entry);
 *  - 1998–2022, the categories in title case, the same dashes;
 *  - 2023–2026, an em dash and "Approved: September 7, 2023".
 * The weeks of 1996-11-09 to 1997-10-04 but one are scans with no text layer, and the Board serves the file of
 * 2018-05-26 damaged: they give no action and are listed as unread (`fedH2Unread`), never guessed. `npm run
 * sync:fed-h2` reads the weeks the committed
 * `data/fed-h2.json.gz` does not hold, weekly; ingest asks nothing.
 *
 * The file keeps every action of the categories a deal is filed under (`KEPT`); a row is made only for a deal
 * (`isDeal`): an acquisition, a merger, a change in control, a new holding company, a nonbank activity, a
 * financial holding company election. The routine actions filed under the same headings make none: public
 * welfare investments, Regulation K investments, waivers of a notice period, interlock exemptions, comment
 * periods and extensions of time, internal reorganizations, section 23A exemptions, relief from commitments.
 *
 * A party is the company's by the merger notices' rule (`partyIsCompany`, lib/hsrEarly.ts): the caption rule
 * under the company's names of the year, the release map's units, EPA's and the CPSC's units on their days, the
 * table of taken names and the first price. The release gives each party's city and state, and a namesake is
 * refused by it (`HOMES`, each company's own places read by hand once: a move of its own head office is its own
 * city). A party with no place written takes the last place the action gave before it ("Citizens Bankshares, Inc.,
 * Shawano, Wisconsin, and … Citizens Bank").
 *
 * One row a company a day, its id the day's actions; a Board action on a day the page already holds the
 * Board's own release or order joins that row as a line (`h2Line`, lib/fedPress.ts) and makes none of its own.
 *
 * Licence: the Board's own work. Its site's notice (federalreserve.gov/disclaimer.htm): "Unless otherwise
 * indicated, information on Board's website is in the public domain and may be copied and distributed without
 * permission. Please cite to the Board as the source of the information."
 */

export const H2_INDEX = "https://www.federalreserve.gov/releases/h2/";
/** A week's release, by the day the week ends: "19991211". */
export const h2Pdf = (week: string) => `https://www.federalreserve.gov/releases/h2/${week.replace(/-/g, "")}/h2.pdf`;
export const FED_H2_DATA = join(__dirname, "..", "data", "fed-h2.json.gz");

/** The weeks the index lists, as "YYYYMMDD", oldest first. */
export function indexWeeks(page: string): string[] {
  const weeks = new Set<string>();
  for (const m of page.matchAll(/href="(?:\/releases\/h2\/)?(\d{8})(?:\/[^"]*)?"/g)) weeks.add(m[1]);
  return [...weeks].sort();
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** The categories a deal is filed under, whose actions the file keeps. */
export const KEPT = [
  "Bank Holding Companies",
  "Bank Mergers",
  "Change in Bank Control",
  "Financial Holding Companies",
  "Savings and Loan Holding Companies",
  "Banks, State Member",
  "Banks, Foreign",
] as const;

/** Every heading a release files actions under, so an action is never read under the heading before it. */
const HEADINGS = [
  ...KEPT,
  "Bank Holding Companies and Savings and Loan Holding Companies",
  "International Operations",
  "Bank Branches, Domestic",
  "Bank Branches, Foreign",
  "Membership",
  "Extensions of Time",
  "Enforcement",
  "Regulations and Policies",
  "Forms",
  "Reserve Bank Operations",
  "Board Operations",
  "Bank Premises",
  "Capital Stock",
  "Advisory Councils",
  "Banks, Nonmember, and Miscellaneous Institutions",
  "Banks, National",
  "Banks, Nonmember",
  "Banking Supervision and Regulation",
  "Personnel",
  "Currency",
  "Securities Regulation",
  "Discount Rates",
  "Federal Open Market Committee",
  "Testimony and Statements",
  "Competitive Factors Reports",
  "Community Reinvestment",
  "Consumer and Community Affairs",
  "Reserve Bank Services",
  "Supervision and Regulation",
  "Supervisory Policy",
  "Payment System Risk",
  "Rules Regarding Delegation of Authority",
  "Nonbank Subsidiaries",
  "Financial Market Utilities",
  "Savings and Loan Holding Companies and Bank Holding Companies",
  "Bank Holding Companies; Savings and Loan Holding Companies",
  "Agreements Under Section 4(c)(8)",
  "Contingency Planning",
  "Research and Statistics",
  "Federal Reserve Bank Operations",
  "Reserve Bank Budgets",
  "Information Technology",
  "Financial Stability",
  "Monetary Policy",
  "Dividend",
  "Credit and Liquidity Programs",
  "Monetary and Financial Policy",
  "Monetary Policy Implementation",
  "Board Operations and Personnel",
  "Other Actions",
  "Publications",
  "General Accounting Office",
];
const key = (s: string) => s.toLowerCase().replace(/~/g, "m").replace(/[^a-z]/g, "");
const HEADING = new Map(HEADINGS.map((h) => [key(h), h]));
// "Banks, State Member" is written "State Member Banks" in some years, and an OCR'd heading loses a letter
HEADING.set(key("State Member Banks"), "Banks, State Member");
HEADING.set(key("Foreign Banks"), "Banks, Foreign");
HEADING.set(key("Savings and Loan Holding Company"), "Savings and Loan Holding Companies");
HEADING.set(key("Bank Holding Company"), "Bank Holding Companies");
HEADING.set(key("Change in Control"), "Change in Bank Control");
HEADING.set(key("Banking Supervision & Regulation"), "Banking Supervision and Regulation");

/** The edits between two short strings, for a scan's heading that lost or changed a letter ("HOLDING COKPANIES"). */
function edits(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return d[b.length];
}

/** A heading a scan's line begins with, in capitals, and the rest of the line: "BANK MERGERS Chase Manhattan Bank…". */
function scanHeading(s: string): { heading: string; rest: string } | null {
  const m = /^([^a-z]{6,}?)\s+([A-Z][a-z].*)$/.exec(s);
  if (!m) return null;
  const k = key(m[1]);
  for (const [hk, h] of HEADING) if (k.length >= 8 && edits(k, hk) <= 2) return { heading: h, rest: m[2] };
  return null;
}

/** Who took an action under delegated authority: a Reserve Bank, or a Board office. */
const DISTRICTS = ["Boston", "New York", "Philadelphia", "Cleveland", "Richmond", "Atlanta", "Chicago", "St. Louis", "Minneapolis", "Kansas City", "Dallas", "San Francisco"];
const OFFICE = /^(?:Secretary|Deputy Secretary|General Counsel|Director,?\s+[A-Z&,.\s]+|Director of [A-Za-z ,&]+|Division of [A-Za-z ,&]+|Staff Director[A-Za-z ,&]*|Associate Secretary|Assistant Secretary|Board|Chairman|Vice Chairman for Supervision)$/;
const officeOf = (s: string): string | null => {
  const t = s.replace(/\s+/g, " ").trim().replace(/^Director\s+(?!of\b)(?=[A-Z&]+$)/, "Director, ");
  if (DISTRICTS.some((d) => d.toLowerCase() === t.toLowerCase())) return DISTRICTS.find((d) => d.toLowerCase() === t.toLowerCase())!;
  return t.length <= 70 && OFFICE.test(t) ? t : null;
};

const OUTCOMES =
  "Approved in part|Approved|Permitted|Granted|Effective|Withdrawn|Denied|Returned|Dismissed|Terminated|Accepted|Not disapproved|Disapproved|Extended|Issued|Announced|Released|Published|Closed|Acknowledged|Rescinded|Modified|Determined|Received|Allowed|Transmitted|Waived|Exempted|Declined|Lapsed";
// the outcome is capitalized as the release prints it: a sentence of an action's own text that begins "modified
// September 12, 2023, …" is no outcome
const OUTCOME = new RegExp(`^-?\\s*(${OUTCOMES})\\b[^,:]{0,40}?[,:]?\\s+([A-Za-z]+)\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`);

/** A line of a release's furniture, never part of an action: page headers and footers, legends, notes. */
function furniture(s: string): boolean {
  return (
    /^(?:H\.2\b.*|Page \d+|No\. \d+.*|Week ending .*|Federal Reserve Release.*|FEDERAL RESERVE RELEASE.*|BOARD OF GOVERNORS.*|Board of Governors of the Federal Reserve System.*)$/i.test(s) ||
    /^\(A\/C\)|^\*\s*(?:Addition|Correction)|^\*\s*Subject to|^(?:Board|Delegated)\s*-\s*(?:Page\s*)?\d+\s+of\s+\d+$/i.test(s) ||
    /^(?:[A-Z][a-z]+ \d{1,2}, \d{4}\s+to\s+[A-Z][a-z]+ \d{1,2}, \d{4})$/i.test(s) ||
    /^[A-Z]+ \d{1,2}, \d{4}\s+TO\s+[A-Z]+ \d{1,2}, \d{4}$/.test(s) ||
    /^Abbreviations:|^(?:BS&R|C&CA|FOMC|RBOPS|IF|OSDM|OSD|S&R|CCA|FMU|IT|MA|R&S)\s+(?:Banking Supervision|Consumer and Community|Federal Open Market|Reserve Bank Operations|International Finance|Office of (?:the )?Staff Director|Supervision and Regulation|Financial Market|Information Technology|Monetary Affairs|Research and Statistics)/.test(s) ||
    /^(?:Affairs|Systems|Management)[;:]|^www\.federalreserve\.gov$/i.test(s)
  );
}

export interface H2Action {
  /** the day its week ends, "1999-12-11" */
  week: string;
  /** its place in the week's release, from 1 */
  n: number;
  /** the day the action was taken */
  day: string;
  /** the Board's own action, else one under delegated authority */
  board: boolean;
  /** the Reserve Bank or Board office that took it under delegated authority: "Dallas", "Secretary" */
  by: string;
  category: string;
  /** "Approved", "Permitted", "Withdrawn"… */
  outcome: string;
  /** the text before the dash: the applicant or the bank, with its city */
  head: string;
  /** what was asked */
  what: string;
}

/** The text a pdftotext line run makes: a word broken at a line's end joined again, every space one. */
function joined(lines: readonly string[]): string {
  let out = "";
  for (const l of lines) {
    if (!out) out = l;
    else if (/[a-z]-$/.test(out) && /^[a-z]/.test(l)) out += l;
    else out += ` ${l}`;
  }
  return out.replace(/\s+/g, " ").trim();
}

/** The dash between an action's applicant and what it asked: "--", an em dash, or a lone hyphen in the scans. */
const DASH = /\s*--+\s*|\s*[—–]\s*|\s+\.?-\s+|\s+-$/g;

/**
 * An action's text split at its dash: the first one what was asked begins after, in lower case ("to acquire",
 * "change in bank control", "(1) to become"), else the first after a state or country (a change in control's
 * notifiers since 2023, "Nebraska—Dallen Juelfs"), else the first; a name's own dash ("Pinnacle Bank - Torrington",
 * "Lone Star National Bancshares--Texas, Inc.") is never it where a later one is. The scans' text, which drops the
 * dash, is split at the first "to" or "request" after a state.
 */
export function splitAction(text: string): { head: string; what: string } | null {
  const dashes = [...text.matchAll(DASH)].filter((m) => m.index! > 0);
  const after = (m: RegExpMatchArray) => text.slice(m.index! + m[0].length);
  const before = (m: RegExpMatchArray) => text.slice(0, m.index!).trim().replace(/,$/, "");
  const lower = dashes.find((m) => /^(?:[a-z(]|\d\))/.test(after(m)));
  const placed = dashes.find((m) => STATE.test(before(m).split(",").at(-1)!.trim()));
  const m = lower ?? placed ?? dashes[0];
  if (m) return { head: before(m), what: after(m).trim() };
  const loose = new RegExp(`^(.+?,\\s*(?:${STATES.join("|")}))\\s+((?:to|request|notification|waiver|election|change)\\b.*)$`).exec(text);
  return loose ? { head: loose[1], what: loose[2] } : null;
}

/**
 * The actions of one week's release, from `pdftotext -layout`'s text: each under its section (the Board's or
 * delegated), its category and its Reserve Bank or office, closed by its outcome line. The applications received
 * are not actions and are not read. A text of under 2,000 characters is a scan's, `scanned`.
 */
export function readH2(text: string, week: string): { actions: H2Action[]; scanned: boolean; unsplit: string[] } {
  const wk = `${week.slice(0, 4)}-${week.slice(4, 6)}-${week.slice(6, 8)}`;
  if (text.replace(/\s+/g, "").length < 2000) return { actions: [], scanned: true, unsplit: [] };
  const lines = text.replace(/­/g, "").replace(/\f/g, "\n").split("\n");
  const actions: H2Action[] = [];
  const unsplit: string[] = [];
  let section: "board" | "delegated" | "received" | null = null;
  let category = "";
  let by = "";
  let buf: string[] = [];
  for (const raw of lines) {
    const s = raw.replace(/\s+/g, " ").trim();
    if (!s) continue;
    const low = s.toLowerCase();
    if (/applications and reports received$|^applications received|filings received\b/.test(low)) {
      section = "received";
      buf = [];
      continue;
    }
    if (/^(?:h\.2\s+)?actions taken by the board\b|^(?:h\.2\s+)?board actions\b/.test(low)) {
      section = "board";
      by = "";
      buf = [];
      continue;
    }
    // the section's heading, never a sentence of an action's that says "under delegated authority by the Federal Reserve Bank…"
    if (/^(?:h\.2\s+)?(?:actions taken by the staff\b|actions under delegated authority\b)|^u[nl]'?[dn]er delegated aut\w*$/i.test(low)) {
      section = "delegated";
      buf = [];
      continue;
    }
    if (section !== "board" && section !== "delegated") continue;
    if (furniture(s)) continue;
    const heading = HEADING.get(key(s));
    if (heading && s.length < 90 && !/[.;]$/.test(s)) {
      category = heading;
      buf = [];
      continue;
    }
    const scan = scanHeading(s);
    if (scan) {
      category = scan.heading;
      buf = [scan.rest];
      continue;
    }
    const office = officeOf(s);
    if (office) {
      by = office;
      buf = [];
      continue;
    }
    // the scans set the district beside the action's first line, a column apart
    let line = s;
    const beside = /^([A-Z][A-Za-z. ]+?)\s{3,}(\S.*)$/.exec(raw.trim());
    if (beside && officeOf(beside[1])) {
      by = officeOf(beside[1])!;
      buf = [];
      line = beside[2].replace(/\s+/g, " ").trim();
    }
    const out = OUTCOME.exec(line);
    if (out) {
      const month = MONTHS.indexOf(out[2].toLowerCase());
      const text = joined(buf);
      buf = [];
      if (month < 0 || !text || !category) {
        if (text) unsplit.push(`${category || "no heading"}: ${text}`);
        continue;
      }
      const day = `${out[4]}-${String(month + 1).padStart(2, "0")}-${out[3].padStart(2, "0")}`;
      const split = splitAction(text.replace(/\s*\*$/, ""));
      if (!split) {
        unsplit.push(`${category}: ${text}`);
        continue;
      }
      const outcome = out[1][0].toUpperCase() + out[1].slice(1).toLowerCase();
      actions.push({ week: wk, n: actions.length + 1, day, board: section === "board", by: section === "board" ? "" : by, category, outcome, ...split });
      continue;
    }
    buf.push(line);
  }
  return { actions, scanned: false, unsplit };
}

/** The states and countries a release writes a party's place in, its last word before the next party. */
export const STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "District of Columbia", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois",
  "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
  "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina",
  "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming", "Puerto Rico", "Guam", "Virgin Islands", "D\\.C\\.",
  "Canada", "Mexico", "United Kingdom", "England", "Scotland", "Ireland", "France", "Germany", "Spain", "Portugal", "Italy", "Switzerland", "Netherlands", "The Netherlands",
  "Belgium", "Luxembourg", "Austria", "Sweden", "Norway", "Denmark", "Finland", "Greece", "Israel", "Japan", "China", "Hong Kong", "Taiwan", "Korea", "South Korea",
  "Republic of Korea", "Singapore", "India", "Australia", "New Zealand", "Brazil", "Argentina", "Chile", "Colombia", "Peru", "Venezuela", "Bermuda", "Bahamas",
  "Cayman Islands", "Panama", "Turkey", "Russia", "Poland", "Saudi Arabia", "Bahrain", "Kuwait", "Qatar", "United Arab Emirates", "Egypt", "South Africa", "Thailand",
  "Malaysia", "Indonesia", "Philippines", "Pakistan", "Jordan", "Lebanon", "Iceland", "Cyprus", "Malta", "Liechtenstein", "Monaco", "Jersey", "Guernsey", "Isle of Man",
  "Channel Islands", "Curacao", "Netherlands Antilles", "Uruguay", "Ecuador", "Dominican Republic", "Costa Rica", "Guatemala", "El Salvador", "Honduras", "Jamaica",
  "Trinidad", "Barbados", "British Virgin Islands", "Hungary", "Czech Republic", "Croatia", "Slovenia", "Morocco", "Nigeria", "Kenya", "Vietnam", "Macau", "Oman",
  "Federal Republic of Germany", "People's Republic of China", "Republic of China", "U\\.K\\.", "Great Britain", "Wales", "Northern Ireland", "Antigua",
];

const STATE = new RegExp(`^(?:the\\s+)?(?:${STATES.join("|")})$`, "i");
/** A province or region a release writes between a city and its country. */
const REGION = /^(?:Ontario|Quebec|Québec|Alberta|British Columbia|Manitoba|Nova Scotia|New Brunswick|Saskatchewan|Newfoundland|Vizcaya|Bavaria|Hesse|Lombardy|Catalonia|Andalusia|Galicia|Basque Country|Grand Cayman|Tortola|Kowloon)$/i;
/** A piece of a name that only a legal word makes: "Inc.", "N.A.", "S.p.A.", "plc". */
const LEGAL_PIECE =
  /^(?:Inc|Incorporated|Corp|Corporation|Co|Company|Cos|Ltd|Limited|LLC|L\.\s?L\.\s?C|LP|L\.\s?P|LLP|N\.\s?A|N\.\s?V|B\.\s?V|A\.\s?G|AG|S\.\s?A|S\.\s?p\.\s?A|plc|pIc|P\.\s?L\.\s?C|FSB|F\.\s?S\.\s?B|SSB|S\.\s?S\.\s?B|MHC|M\.\s?H\.\s?C|ESOP|Jr|Sr|II|III|IV|National Association|S\.\s?A\.\s?B\.? de C\.\s?V|de C\.\s?V|ASA|A\/S|Oyj|SE|GmbH|KG|K\.\s?K|S\.\s?C|P\.\s?C|Chartered|Ltda|S\.\s?A\.\s?U|N\.\s?A\.\s?\)|Trust|Bancorp|Inc\.\s?\(publ\)|AB(?:\s+\(publ\))?)\.?$/i;

export interface H2Party {
  name: string;
  /** "Houston, Texas", or the place before it in the action where none is written */
  place: string;
}

/**
 * The parties a list of them names, each with its place: "Prime Bancshares, Inc., Houston, Texas, and Prime
 * Bank", "United Community Banks, Inc., and United Community Bank, both of Greenville, South Carolina".
 * A party whose place the list does not write takes the last one written before it, or after it where none is.
 */
export function listParties(text: string, before = ""): H2Party[] {
  const t = text
    .replace(/\s*\((?:[A-Z][\w&.'’ -]{0,14}|the "?[A-Z][\w ]{0,20}"?|(?:a|an|the|formerly|collectively|together|in organization|proposed)\b[^()]{0,80})\)/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:]+$/, "");
  const out: H2Party[] = [];
  let place = before;
  for (const chunk of t.split(/\s*;\s*(?:and\s+)?/)) {
    const both = /^(.*?),?\s+(?:both|all|each)\s+(?:of|in)\s+(.+)$/i.exec(chunk);
    if (both) {
      const where = both[2].trim();
      for (const n of both[1].split(/,\s*and\s+|\s+and\s+(?=(?:The\s+)?[A-Z])|,\s+(?=(?:The\s+)?[A-Z][\w&.'’-]*\s)/)) {
        const name = n.trim().replace(/,$/, "");
        if (name && !LEGAL_PIECE.test(name)) out.push({ name, place: where });
        else if (name && out.length) out[out.length - 1].name += `, ${name}`;
      }
      place = where;
      continue;
    }
    const pieces = chunk.split(/\s*,\s*/).map((p) => p.trim()).filter(Boolean);
    let cur: string[] = [];
    const flush = (where: string) => {
      if (cur.length) out.push({ name: cur.join(", "), place: where });
      cur = [];
    };
    for (let i = 0; i < pieces.length; i++) {
      let piece = pieces[i];
      const and = /^and\s+(.+)$/i.exec(piece);
      if (and) {
        piece = and[1];
        if (cur.length) {
          // a party before "and" with no place of its own: "Bank of Mason, Mason, and Union Bank"
          const last = cur.length >= 2 && !LEGAL_PIECE.test(cur[cur.length - 1]) && isPlaceWord(cur[cur.length - 1]) ? cur.pop()! : null;
          if (last) place = `${last}${stateOf(place) ? `, ${stateOf(place)}` : ""}`;
          flush(place);
        }
      }
      // a city named as its state is ("New York, New York"), or a province before its country ("Toronto, Ontario, Canada")
      const next = pieces[i + 1];
      if (next && !/^and\s/i.test(next) && STATE.test(next) && (STATE.test(piece) || REGION.test(piece))) {
        cur.push(piece);
        continue;
      }
      if (STATE.test(piece)) {
        const country = piece.replace(/^the\s+/i, "");
        if (cur.length >= 3 && REGION.test(cur[cur.length - 1]) && !LEGAL_PIECE.test(cur[cur.length - 2])) {
          const region = cur.pop()!;
          place = `${cur.pop()!}, ${region}, ${country}`;
          flush(place);
        } else if (cur.length >= 2 && !LEGAL_PIECE.test(cur[cur.length - 1])) {
          place = `${cur.pop()!}, ${country}`;
          flush(place);
        } else if (cur.length === 1 && out.length && !cur[0].includes(" ")) {
          // a lone city after a party already closed: "…, Inc., Weimar, Texas"
          place = `${cur[0]}, ${country}`;
          cur = [];
        } else if (!cur.length && out.length) {
          // a country after a party's city and region or state: "…, Toronto, Ontario, Canada"
          out[out.length - 1].place = place = `${out[out.length - 1].place}, ${country}`;
        } else {
          place = country;
          flush(place);
        }
        continue;
      }
      cur.push(piece);
    }
    if (cur.length) {
      const last = cur.length >= 2 && !LEGAL_PIECE.test(cur[cur.length - 1]) && isPlaceWord(cur[cur.length - 1]) ? cur.pop()! : null;
      flush(last ? `${last}${stateOf(place) ? `, ${stateOf(place)}` : ""}` : place);
    }
  }
  return out.filter((p) => /[A-Za-z]{2}/.test(p.name)).map((p) => ({ ...p, name: p.name.replace(/^(?:both of|(?:its|their)\s+(?:wholly[- ]owned\s+)?(?:subsidiary|subsidiaries)(?:\s+banks?)?,?)\s+/i, "") }));
}

/** A city as a list writes one before its state or alone: a word or three, each capitalized, no bank's word. */
function isPlaceWord(s: string): boolean {
  return /^(?:[A-Z][a-zA-Z.'’-]*|de|du|la|le|of|the)(?:\s+(?:[A-Z][a-zA-Z.'’-]*|de|du|la|le|of|the)){0,3}$/.test(s) && !/\b(?:Bank|Banc|Bancorp|Bancshares|Bankshares|Financial|Holding|Holdings|Trust|Savings|Company|Corporation|Group|Capital|National|State|Federal|Mutual|Partners|Fund|Investors|Services)\b/.test(s);
}
const stateOf = (place: string) => (place.includes(",") ? place.split(",").at(-1)!.trim() : STATE.test(place) ? place : "");

/** What introduces a party acquired in what was asked. */
const TAKES =
  /\b(?:acquire|acquiring|acquisition of|acqurie|merge with|merger with|merging with|retain|retaining|control of|shares of|securities of|interest in|assets of|liabilities of|purchase|purchasing|stock of|investment in|invest in)\s+/gi;
/** Where a party acquired ends, in what was asked. */
const ENDS =
  /,?\s+(?:and\s+)?thereby\b|,?\s+and\s+(?:to\s+)?(?:engage|indirectly|continue|retain|acquire|merge|for|to|operate|become|thus|hold|assume|establish|control)\b|;\s*(?:and\s+)?(?:for|to|\(\d)|;\s*$|,?\s+through\b|,?\s+in connection with\b|,?\s+pursuant to\b|,?\s+(?:a|an)\s+(?:de novo|proposed|newly|nonbank|savings|existing|wholly|subsidiary|company|bank|state|national|federal)\b|,?\s+(?:which|that|whose|who)\b|\.\s|\.$|\s+\((?!publ)|,?\s+from\s+|,?\s+as\s+(?:a|an|trustee)\b|,?\s+to\s+(?:engage|become|be)\b|,?\s+(?:both|all)\s+of\s+which\b|,?\s+with\s+(?:and\s+)?into\b|\s+with\s+(?!and\b)|,?\s+(?:located|headquartered|based)\b|,?\s+under\s+/i;

/** The parties an action says are acquired, merged or controlled, each with its place. */
export function takenParties(what: string, before = ""): H2Party[] {
  const out: H2Party[] = [];
  let place = before;
  for (const m of what.matchAll(TAKES)) {
    let rest = what.slice(m.index! + m[0].length);
    // "up to 24.9 percent of the voting shares of …", "certain assets and assume certain liabilities of …"
    rest = rest.replace(/^(?:[a-z0-9.,%$\s-]|\bof\b|\bin\b)*?\b(?:of|in)\s+(?=(?:The\s+|the\s+)?[A-Z0-9])/, "").replace(/^the\s+(?=[A-Z])/, "");
    if (!/^(?:The\s+)?[A-Z0-9]/.test(rest)) continue;
    const end = ENDS.exec(rest);
    const phrase = (end ? rest.slice(0, end.index) : rest).trim();
    if (phrase.length < 3) continue;
    for (const p of listParties(phrase, place)) {
      if (!out.some((o) => o.name === p.name)) out.push(p);
      place = p.place;
    }
  }
  return out;
}

/** Each action's parties and whether it is a deal, read once a process: every company's ingest reads the same file. */
const PARTIES = new WeakMap<H2Action, ReturnType<typeof actionParties>>();
const DEALS = new WeakMap<H2Action, boolean>();
const partiesOf = (a: H2Action) => PARTIES.get(a) ?? (PARTIES.set(a, actionParties(a)), PARTIES.get(a)!);
const dealOf = (a: H2Action) => DEALS.get(a) ?? (DEALS.set(a, isDeal(a)), DEALS.get(a)!);

/** The parties an action names as the company's role in it, the applicant's or the acquired's. */
export function actionParties(a: Pick<H2Action, "category" | "head" | "what">): { applicants: H2Party[]; acquired: H2Party[] } {
  const head = listParties(a.head);
  const lastPlace = head.at(-1)?.place ?? "";
  // a change in control's notice is filed on the bank whose control changes, the notifiers after the dash
  if (a.category === "Change in Bank Control" || /^(?:a\s+)?change in (?:bank\s+)?control\b|^change in control notice/i.test(a.what)) return { applicants: [], acquired: head };
  return { applicants: head, acquired: takenParties(a.what, lastPlace) };
}

/** What a deal asks for: an acquisition, a merger, a change in control, a new holding company, an activity, an election. */
const DEAL =
  /\b(?:acquire|acquiring|acquisition|acqurie|merge|merger|merging|purchase|purchasing|retain|retention|become (?:a |the )?(?:bank|financial|savings and loan|thrift) holding compan(?:y|ies)|change in (?:bank )?control|control of|engage|engaging|elections?|shares of|interest in|invest(?:ment)? in)\b/i;

/** The routine actions filed under the same headings as the deals, which make no row. */
const ROUTINE =
  /public welfare investment|\bRegulation K\b|notice period|notification period|prior[- ]notice|\binterlocks?\b|comment period|extension of time|extend the (?:time|period)|internal (?:corporate )?reorgani[sz]ation|\bsection 23A\b|\b23A of the Federal Reserve Act|relief from|waiver of (?:a |the |certain |its )*commitments?|modification of (?:a |an |the |certain |its )*(?:existing )?commitments?|\bcommitments?\b.{0,40}\b(?:waive|relie|modif|release)|capital (?:distribution|plan)|representative office|to establish (?:a |an )?(?:de novo )?(?:branch|office|agency|representative|loan production)|to (?:make|retain) (?:an? |certain |two |three )?(?:public welfare |community development )?investments?\b(?! in [A-Z])|transfer agent|reconsideration|temporary exemption|exemption period|divestiture period|to conform|wholesale bank|limited purpose bank|Community Reinvestment Act|\bdesignat(?:e|ion) as\b|tying|anti-tying|section 106|enhanced prudential|resolution plan|stress test|\bdividend\b|redemption|to reduce (?:its )?capital|capital stock|subordinated debt|a de novo office|offices? (?:abroad|in [A-Z])|community development investment|\bextension (?:to|until) [A-Z][a-z]+ \d|to receive comments|\bcomments?\b.{0,30}\bextend/i;

/** The outcomes a deal's row is made for. */
const DEAL_OUTCOMES = new Set(["Approved", "Approved in part", "Permitted", "Granted", "Effective", "Withdrawn", "Denied", "Returned", "Not disapproved", "Disapproved", "Dismissed", "Announced"]);

/** Whether an action is a deal, which makes a row, not one of the routine actions filed under the same heading. */
export function isDeal(a: Pick<H2Action, "category" | "outcome" | "what" | "board">): boolean {
  if (!(KEPT as readonly string[]).includes(a.category) || !DEAL_OUTCOMES.has(a.outcome)) return false;
  // the Board's orders are "Announced" in its section since 2023; under delegated authority the word is no outcome
  if (a.outcome === "Announced" && !a.board) return false;
  if (ROUTINE.test(a.what)) return false;
  // a change in control is the deal itself, whatever its text after the dash names
  if (a.category === "Change in Bank Control") return true;
  return DEAL.test(a.what);
}

/** The committed file's columns, a row an action. */
export const DATA_COLUMNS = ["week", "n", "day", "board", "by", "category", "outcome", "head", "what"] as const;

let cached: { path: string; actions: H2Action[]; unread: string[] } | null = null;

/** Every action in the committed file, read once a process. */
export function fedH2Actions(path = FED_H2_DATA): readonly H2Action[] {
  return readFile(path).actions;
}
/** The weeks the file lists as unread: the scans with no text layer, and the one file the Board serves damaged. */
export function fedH2Unread(path = FED_H2_DATA): readonly string[] {
  return readFile(path).unread;
}
function readFile(path: string) {
  if (cached?.path === path) return cached;
  const body = JSON.parse(gunzipSync(readFileSync(path)).toString("utf8")) as { columns: string[]; rows: unknown[][]; unread: string[] };
  const at = (k: string) => body.columns.indexOf(k);
  const actions = body.rows.map((r) => ({
    week: String(r[at("week")]),
    n: Number(r[at("n")]),
    day: String(r[at("day")]),
    board: r[at("board")] === 1 || r[at("board")] === true,
    by: String(r[at("by")] ?? ""),
    category: String(r[at("category")]),
    outcome: String(r[at("outcome")]),
    head: String(r[at("head")]),
    what: String(r[at("what")]),
  }));
  cached = { path, actions, unread: body.unread };
  return cached;
}

/**
 * The places a company's own parties are written at, by CIK, read by hand (batch 173) among every party a replay of
 * every week against every listed company matched. Where a company's names are also a namesake's ("Commerce
 * Bancshares, Inc., White Castle, Louisiana" against Kansas City's), a party is the company's only at one of its own
 * places: its head office, a move of it (United Community Banks' from Blairsville, Georgia, to Greenville, South
 * Carolina), and its own units' cities. A company with no entry had no namesake in the weeks read.
 */
export const HOMES: Readonly<Record<number, { ticker: string; at: RegExp; why: string }>> = {
  883948: { ticker: "AUB", at: /\b(?:Bowling Green|Richmond|Glen Allen), Virginia\b/, why: "Union Bankshares Corporation of Bowling Green, then Richmond and Glen Allen, Virginia; the Union Bankshares of Union, West Virginia, Ellsworth, Maine, Mena, Arkansas, Denver and Morrisville, Vermont are others" },
  1795815: { ticker: "BCAL", at: /\bSan Diego, California\b/, why: "Southern California Bancorp of San Diego, which took California BanCorp's name in 2024; California BanCorp of Lafayette and Oakland before it is the company it bought" },
  1419536: { ticker: "CBNK", at: /\bRockville, Maryland\b/, why: "Capital Bancorp of Rockville; the Capital Bancorps of Delhi, Louisiana, Lansing, Nashville, Jacinto City, Texas and Miami are others" },
  22356: { ticker: "CBSH", at: /\bKansas City, Missouri\b/, why: "Commerce Bancshares of Kansas City; those of Franklin, Brownsville and Nolensville, Tennessee, Waukee, Iowa, White Castle, Louisiana, Adair, Oklahoma and Worcester, Massachusetts are others" },
  16040: { ticker: "CBT", at: /\bBoston, Massachusetts\b/, why: "Cabot Corporation of Boston; Kennedy, Cabot & Co. of Beverly Hills, a broker Toronto-Dominion bought in 1997, is not it" },
  1437958: { ticker: "CCB", at: /\bEverett, Washington\b/, why: "Coastal Financial Corporation of Everett; that of Myrtle Beach, South Carolina, which BB&T bought in 2007, is another" },
  736772: { ticker: "CCNE", at: /\bClearfield, Pennsylvania\b/, why: "CNB Financial Corporation of Clearfield; those of Litchfield, Minnesota, Worcester, Massachusetts and Taylor, Texas are others" },
  759944: { ticker: "CFG", at: /\bProvidence, Rhode Island\b/, why: "Citizens Financial Group of Providence; the Citizens Banks of dozens of other towns, from Flint, Michigan to Velma, Oklahoma, are others'" },
  24090: { ticker: "CIA", at: /\bAustin, Texas\b/, why: "Citizens, Inc., the life insurer of Austin; the Citizens, Inc. of Butler, Pennsylvania and Enderlin, North Dakota are others" },
  1075706: { ticker: "CIZN", at: /\bPhiladelphia, Mississippi\b/, why: "Citizens Holding Company of Philadelphia, Mississippi; those of Keenesburg, Colorado, Clearwater, Florida and Sac City, Iowa are others" },
  2115119: { ticker: "CLBK", at: /\bFair Lawn, New Jersey\b/, why: "Columbia Financial of Fair Lawn; Columbia Financial Corporation of Bloomsburg, Pennsylvania is another" },
  718413: { ticker: "CMTV", at: /\bDerby, Vermont\b/, why: "Community Bancorp of Derby; the Community Bancorps of Las Vegas, Chanute, Kansas, Houston and six more towns are others" },
  1084551: { ticker: "CRDV", at: /\bMilford, Massachusetts\b/, why: "Community Redevelopment Inc. of Milford; Community Redevelopment, LLC of Freeport, Illinois is another" },
  2114521: { ticker: "CSBA", at: /\bBethel, Ohio\b/, why: "CSB Financial of Bethel; those of Ashland City, Tennessee, Teaneck, New Jersey and Miles, Texas are others" },
  880417: { ticker: "CSBB", at: /\bMillersburg, Ohio\b/, why: "CSB Bancorp of Millersburg; those of Coffeyville, Kansas, Chelsea, Michigan and Walsh, Colorado are others" },
  739421: { ticker: "CZFS", at: /\bMansfield, Pennsylvania\b/, why: "Citizens Financial Services of Mansfield; those of Shawano, Wisconsin and Newport, Kentucky are others" },
  1367859: { ticker: "CZWI", at: /\bEau Claire, Wisconsin\b/, why: "Citizens Community Bancorp of Eau Claire; those of Marco Island, Florida and Ridgewood, New Jersey are others" },
  846617: { ticker: "DCOM", at: /\b(?:Bridgehampton|Brooklyn|Hauppauge), New York\b/, why: "Bridge Bancorp of Bridgehampton, Dime's record; Bridge Bancorp of San Jose, California is another" },
  1914605: { ticker: "ECBK", at: /\bEverett, Massachusetts\b/, why: "ECB Bancorp of Everett; ECB Bancorp of Engelhard, North Carolina, The East Carolina Bank's, is another" },
  1050441: { ticker: "EGBN", at: /\bBethesda, Maryland\b/, why: "Eagle Bancorp of Bethesda; those of Statesboro, Georgia and Everett, Massachusetts are others" },
  1227500: { ticker: "EQBK", at: /\b(?:Wichita|Andover), Kansas\b/, why: "Equity Bancshares of Wichita and Andover; Equity Bank of Marlton, New Jersey and Equity Bank, SSB of Dallas are others" },
  2106126: { ticker: "EURBF", at: /\bAthens, Greece\b/, why: "Eurobank of Athens; the EuroBanks of Hato Rey, Puerto Rico and Coral Gables, Florida are others" },
  1472787: { ticker: "FAF", at: /\bSanta Ana, California\b/, why: "First American Financial of Santa Ana; that of Sulphur Springs, Texas is another" },
  1649749: { ticker: "FBK", at: /\b(?:Nashville|Lexington), Tennessee\b/, why: "FB Financial of Nashville, First South Bancorp of Lexington, Tennessee to 2016; the First South Bancorps of Spartanburg and Washington, North Carolina are others" },
  2013639: { ticker: "FBLA", at: /\bNew Orleans, Louisiana\b/, why: "FB Bancorp of New Orleans; FB Bancorp of San Diego is another" },
  912967: { ticker: "FBSI", at: /\bMountain Grove, Missouri\b/, why: "First Bancshares of Mountain Grove; those of Hattiesburg, Gladstone, Michigan, Cold Spring, Minnesota and six more towns are others" },
  1070296: { ticker: "FCAP", at: /\bCorydon, Indiana\b/, why: "First Capital of Corydon; First Capital Corporation of Fort Scott, Kansas is another" },
  859070: { ticker: "FCBC", at: /\bBluefield, (?:West )?Virginia\b/, why: "First Community Bankshares of Bluefield; the First Community Bancshares of Overland Park, Batesville, Bargersville, Houston and three more towns are others" },
  932781: { ticker: "FCCO", at: /\bLexington, South Carolina\b/, why: "First Community Corporation of Lexington; that Miners and Merchants Bancorp bought in 2025 is another" },
  798941: { ticker: "FCNCA", at: /\bRaleigh, North Carolina\b/, why: "First Citizens BancShares of Raleigh; those of Dyersburg, Tennessee, Waxahachie, Texas and Marion, Arkansas are others" },
  708955: { ticker: "FFBC", at: /\b(?:Cincinnati|Hamilton), Ohio\b/, why: "First Financial Bancorp of Hamilton, then Cincinnati; those of Lodi, California and Belvidere, Illinois are others" },
  862831: { ticker: "FISI", at: /\bWarsaw, New York\b/, why: "Financial Institutions of Warsaw; that of Port Washington, Wisconsin is another" },
  792966: { ticker: "FMAO", at: /\bArchbold, Ohio\b/, why: "Farmers & Merchants Bancorp of Archbold; that of Hannibal, Missouri is another" },
  740806: { ticker: "FMBM", at: /\bTimberville, Virginia\b/, why: "F&M Bank Corp. of Timberville; the F&M Banks of Watertown, Tulsa and Clarksville are others" },
  1698022: { ticker: "FMFG", at: /\bHampstead, Maryland\b/, why: "Farmers and Merchants Bancshares of Hampstead; those of Houston, Burlington, Iowa, Nashville, Illinois and Crescent, Oklahoma are others" },
  37808: { ticker: "FNB", at: /\b(?:Hermitage|Pittsburgh), Pennsylvania\b|\bNaples, Florida\b/, why: "F.N.B. Corporation of Hermitage, Naples and Pittsburgh; the FNB Corporations of Christiansburg, Virginia, Asheboro, North Carolina, Dennison, Ohio, Greeley and Fort Mitchell, Kentucky are others" },
  765207: { ticker: "FNLC", at: /\bDamariscotta, Maine\b/, why: "The First Bancorp of Damariscotta; the First Bancorps of Russell Springs, Kentucky, Lebanon, Virginia and Yates City, Illinois are others" },
  1556727: { ticker: "FNWB", at: /\bPort Angeles, Washington\b/, why: "First Northwest Bancorp of Port Angeles; that of Arlington Heights, Illinois is another" },
  1666175: { ticker: "FTS", at: /\bSt\.? John'?s\b/, why: "Fortis Inc., the utility of St. John's; Fortis of Brussels and Utrecht, the bank of 1999–2008, is another" },
  763907: { ticker: "FUNC", at: /\bOakland, Maryland\b/, why: "First United Corporation of Oakland; First United, Inc. of Central City, Kentucky is another" },
  717806: { ticker: "FUSB", at: /\b(?:Birmingham|Thomasville), Alabama\b/, why: "First US Bancshares of Birmingham, United Security Bancshares of Thomasville before; United Security Bancshares of Fresno is another" },
  719402: { ticker: "FXNC", at: /\bStrasburg, Virginia\b/, why: "First National Corporation of Strasburg; those of Orangeburg, Grand Forks, Folkston, Wilmington and Savannah are others" },
  2057463: { ticker: "GLIBA", at: /\bEnglewood, Colorado\b/, why: "Liberty Capital of Englewood; Liberty Capital, Inc. of Wilmington, Ohio is another" },
  49196: { ticker: "HBAN", at: /\bColumbus, Ohio\b/, why: "Huntington Bancshares of Columbus; that of Huntington, Texas is another" },
  1436425: { ticker: "HBCP", at: /\bLafayette, Louisiana\b/, why: "Home Bancorp of Lafayette; that of Fort Wayne, Indiana is another" },
  706129: { ticker: "HBNC", at: /\bMichigan City, Indiana\b/, why: "Horizon Bancorp of Michigan City; those of Decatur, Georgia, Arkadelphia, Arkansas, Beckley, West Virginia and Lake Havasu City are others" },
  1046025: { ticker: "HFWA", at: /\bOlympia, Washington\b/, why: "Heritage Financial of Olympia; those of Columbia, Tennessee and Albany, Georgia are others" },
  1828588: { ticker: "HNVR", at: /\b(?:Mineola|Garden City Park), New York\b/, why: "Hanover Bancorp of Mineola; that of Hanover, Pennsylvania is another" },
  1331520: { ticker: "HOMB", at: /\b(?:Conway|Little Rock), Arkansas\b/, why: "Home BancShares of Conway, its Centennial Bank of Conway and Little Rock; the Centennial Banks of Centennial, Colorado and Fountain Valley, California and the Home Bancshares of Selmer, Tennessee are others" },
  1020569: { ticker: "IRM", at: /\bBoston, Massachusetts\b|\bPortsmouth, New Hampshire\b/, why: "Iron Mountain of Boston; a bank's branch in Iron Mountain, Michigan is not it" },
  842517: { ticker: "ISBA", at: /\bM(?:oun)?t\.? Pleasant, Michigan\b/, why: "Isabella Bank of Mount Pleasant, IBT Bancorp before; the IBT Bancorps of Irwin, Pennsylvania and Dallas are others" },
  1791942: { ticker: "JBS", at: /\bAmstelveen\b|\bGreeley, Colorado\b|\bS[aã]o Paulo\b/, why: "JBS, the meat packer; JBS, Inc. of Kulm, North Dakota is a bank holding company" },
  1822993: { ticker: "JXN", at: /\bLansing, Michigan\b/, why: "Jackson Financial of Lansing; those of Mayfield, Kentucky and Jackson, Minnesota are others" },
  1141688: { ticker: "LARK", at: /\bManhattan, Kansas\b/, why: "Landmark Bancorp of Manhattan; that of Pittston, Pennsylvania is another" },
  721994: { ticker: "LKFN", at: /\bWarsaw, Indiana\b/, why: "Lakeland Financial of Warsaw; that of Round Lake Heights, Illinois is another" },
  1462120: { ticker: "LOB", at: /\bWilmington, North Carolina\b/, why: "Live Oak Bancshares of Wilmington; Live Oak Bancshares Corporation of George West, Texas is another" },
  1454147: { ticker: "LOIMF", at: /\bStockholm\b|\bSolna\b/, why: "Loomis AB of Sweden; Loomis Company of Loomis, Nebraska is another" },
  1396440: { ticker: "MAIN", at: /\bHouston, Texas\b/, why: "Main Street Capital of Houston; Main Street Capital Company of Germantown, Ohio is another" },
  1629019: { ticker: "MBIN", at: /\bCarmel, Indiana\b/, why: "Merchants Bancorp of Carmel; those of Hillsboro, Ohio, Aurora, Illinois and Gresham, Oregon, and Miners and Merchants Bancorp of Grundy, Virginia, are others" },
  1042729: { ticker: "MBWM", at: /\bGrand Rapids, Michigan\b/, why: "Mercantile Bank Corporation of Grand Rapids; the Mercantile Banks of Overland Park, Brownsville, Dallas and Quincy, Illinois are others" },
  1476034: { ticker: "MCB", at: /^New York(?:, New York)?$/, why: "Metropolitan Bank Holding of New York; the Metropolitan Banks of Oakland and Highland Hills, Ohio are others" },
  1475841: { ticker: "NBHC", at: /\bGreenwood Village, Colorado\b|\bDenver, Colorado\b|\bBoston, Massachusetts\b/, why: "National Bank Holdings of Greenwood Village, NBH Holdings Corp. of Boston in 2010; the National Banks of Moline, La Grange, Gatesville, Edina and Wilmington, Ohio are others" },
  1471265: { ticker: "NWBI", at: /\bWarren, Pennsylvania\b|\bColumbus, Ohio\b/, why: "Northwest Bancshares of Warren, then Columbus; those of Roanoke, Texas, Colby, Kansas, Vancouver, Washington and Shreveport are others" },
  1769663: { ticker: "PBFS", at: /\bAlbany, New York\b/, why: "Pioneer Bancorp of Albany; those of Auburndale, Wisconsin and Yakima are others" },
  1423869: { ticker: "PCB", at: /\bLos Angeles, California\b/, why: "PCB Bancorp of Los Angeles; those of Largo, Florida and Johnson City, Tennessee are others" },
  318300: { ticker: "PEBO", at: /\bMarietta, Ohio\b/, why: "Peoples Bancorp of Marietta; the Peoples Bancorps of Prairie du Chien, Rock Valley, Lubbock, Newton, Illinois and nine more towns are others" },
  1492165: { ticker: "PFBC", at: /\bLos Angeles, California\b/, why: "Preferred Bank of Los Angeles; the Preferred Banks of Chaska, Casey, Illinois and Houston are others" },
  770460: { ticker: "PFBX", at: /\bBiloxi, Mississippi\b/, why: "Peoples Financial Corporation of Biloxi; those of Rock Valley, Massillon and Linton, Indiana are others" },
  1967656: { ticker: "PFSB", at: /\bPeru, Illinois\b/, why: "PFS Bancorp of Peru; that of Aurora, Indiana is another" },
  845385: { ticker: "PIAC", at: /\bNorth Andover, Massachusetts\b/, why: "Princeton Capital Corporation of North Andover; Princeton Capital, LLC of West Trenton, New Jersey is another" },
  2087419: { ticker: "PNSB", at: /\bDeer Lodge, Montana\b/, why: "PSB Financial of Deer Lodge; PSB Financial Corporation of Many, Louisiana is another" },
  921557: { ticker: "RBCAA", at: /\bLouisville, Kentucky\b/, why: "Republic Bancorp of Louisville; those of Orland Park and Oak Brook, Illinois, Owosso and Ann Arbor, Michigan and Munden, Kansas are others" },
  715072: { ticker: "RNST", at: /\bTupelo, Mississippi\b/, why: "Renasant of Tupelo, The Peoples Holding Company before; the Peoples holding companies of Ottawa, Kansas, Minden, Louisiana, Coldwater, Ohio, Winfield, Iowa and Wyalusing, Pennsylvania are others" },
  705432: { ticker: "SBSI", at: /\bTyler, Texas\b/, why: "Southside Bancshares of Tyler; Southside Bancshares Corp. of St. Louis is another" },
  1038773: { ticker: "SMBK", at: /, Tennessee$/, why: "SmartFinancial of Knoxville, Pigeon Forge and Chattanooga, Cornerstone Bancshares before; the Cornerstone Bancshares of Overland Park and Lebanon, Missouri are others" },
  764038: { ticker: "SSB", at: /\b(?:Orangeburg|Columbia), South Carolina\b|\bWinter Haven, Florida\b/, why: "SouthState of Winter Haven, SCBT Financial of Columbia and First National Corporation of Orangeburg before; First Financial Holdings of Charleston before it bought it in 2013, and every other First National and First Financial Corporation, are others" },
  93751: { ticker: "STT", at: /\bBoston, Massachusetts\b/, why: "State Street of Boston; State Street Bank and Trust Company of Quincy, Illinois is another" },
  1295401: { ticker: "TBBK", at: /\bWilmington, Delaware\b/, why: "The Bancorp of Wilmington; those of Cedarburg, Wisconsin, New Hyde Park, New York and LaGrange, Kentucky are others" },
  1849466: { ticker: "TCBS", at: /\bMineola, Texas\b/, why: "Texas Community Bancshares of Mineola, formed in 2021; that of Dallas of 2001–2005 is another" },
  714562: { ticker: "THFF", at: /\bTerre Haute, Indiana\b/, why: "First Financial Corporation of Terre Haute; those of Arthur, North Dakota, Mount Juliet, Tennessee and Providence are others" },
  1786108: { ticker: "TRIN", at: /\bPhoenix, Arizona\b/, why: "Trinity Capital Inc. of Phoenix; Trinity Capital Corporation of Los Alamos is another" },
  1046050: { ticker: "TSBK", at: /\bHoquiam, Washington\b/, why: "Timberland Bancorp of Hoquiam; that of Baxter, Minnesota is another" },
  731653: { ticker: "UBCP", at: /\bMartins Ferry, Ohio\b/, why: "United Bancorp of Martins Ferry; those of Tecumseh and Ann Arbor, Michigan and Roseburg, Oregon are others" },
  1087456: { ticker: "UBOH", at: /\bColumbus Grove, Ohio\b/, why: "United Bancshares of Columbus Grove; those of Philadelphia, New Orleans and Garden City, Kansas are others" },
  729986: { ticker: "UBSI", at: /\bCharleston, West Virginia\b/, why: "United Bankshares of Charleston; that of Miami, which Mellon bought in 1998, is another" },
  857855: { ticker: "UCB", at: /\bBlairsville, Georgia\b|\bGreenville, South Carolina\b/, why: "United Community Banks of Blairsville, Georgia, then Greenville, South Carolina, its head office's move" },
  706863: { ticker: "UNB", at: /\bMorrisville, Vermont\b/, why: "Union Bankshares of Morrisville; the Union Bankshares of Bowling Green and Richmond, Virginia, Union, West Virginia and three more towns are others" },
  1745201: { ticker: "VIK", at: /\bWoodland Hills, California\b/, why: "Viking Holdings, the cruise line; the Viking Corporations of Omaha and Sibley, Iowa are bank holding companies" },
  107263: { ticker: "WMB", at: /\bTulsa, Oklahoma\b/, why: "The Williams Companies of Tulsa; Williams Partners, L.P. of Atlanta, of 1997, is another" },
};

/** Parties the rule would give a company that are not its, by CIK, read by hand, whatever their place. */
export const NOT_THE_COMPANY: Readonly<Record<number, { ticker: string; party: RegExp; place?: RegExp; why: string }[]>> = {
  // HomeStreet's record, which took Mechanics Bank's parent's name in 2025; its own deals name it in other cities
  1518715: [{ ticker: "MCHB", party: /^Mechanics\s+Bancorp\b/i, place: /Massachusetts/, why: "Mechanics Bancorp, MHC of Taunton and North Adams, Massachusetts, not HomeStreet's record, Mechanics Bancorp" }],
};

/** Whether a party an action names is the company on the action's day, its place read against the company's own. */
export function h2PartyIsCompany(party: H2Party, day: string, cik: number, names: () => string[]): boolean {
  // a company with namesakes is a party only at one of its own places; a party whose place the release never gives is not it
  const home = HOMES[cik];
  if (home && !home.at.test(party.place)) return false;
  return partyIsCompany(party.name, day, cik, names, (p) => !!NOT_THE_COMPANY[cik]?.some((r) => r.party.test(p) && (!r.place || r.place.test(party.place))));
}

export type H2Role = "applicant" | "acquired";

/** The company's roles in an action, by the rule on each party it names. */
export function h2Roles(a: H2Action, cik: number, names: () => string[]): H2Role[] {
  const { applicants, acquired } = partiesOf(a);
  const roles: H2Role[] = [];
  if (applicants.some((p) => h2PartyIsCompany(p, a.day, cik, names))) roles.push("applicant");
  if (acquired.some((p) => h2PartyIsCompany(p, a.day, cik, names))) roles.push("acquired");
  return roles;
}

const OFFICES: Record<string, string> = {
  "Director, BS&R": "Director of Banking Supervision and Regulation",
  "Director, S&R": "Director of Supervision and Regulation",
  "Director, C&CA": "Director of Consumer and Community Affairs",
  "Director, CCA": "Director of Consumer and Community Affairs",
  "Director, IF": "Director of International Finance",
  "Director, RBOPS": "Director of Reserve Bank Operations and Payment Systems",
  "Director, OSDM": "Staff Director for Management",
};
/** Who took an action, as a row names it. */
export function actedBy(a: Pick<H2Action, "board" | "by">): string {
  if (a.board) return "The Federal Reserve Board";
  if (DISTRICTS.includes(a.by)) return `The Federal Reserve Bank of ${a.by}`;
  if (!a.by) return "The Federal Reserve";
  return `The Board's ${OFFICES[a.by] ?? a.by.replace(/^Director,\s*/, "Director, ")}`;
}

const possessive = (p: string) => (/s$/i.test(p) ? `${p}'` : `${p}'s`);
const clean = (s: string) => s.replace(/\s*\*$/, "").replace(/[.;,]+$/, "").trim();

/** What an action asks for, in a row's words: "Wells Fargo & Company's application to acquire Prime Bancshares, Inc., …". */
export function askedFor(a: Pick<H2Action, "category" | "head" | "what" | "outcome">): string {
  const what = clean(a.what);
  const { applicants, acquired } = actionParties(a);
  if (a.category === "Change in Bank Control" || /^(?:a\s+)?change in (?:bank\s+)?control\b/i.test(what)) {
    const bank = named(acquired[0]?.name ?? a.head);
    if (/^(?:a\s+)?changes? in (?:bank\s+)?control(?:\s+notices?)?\.?$/i.test(what)) return `a change in control of ${bank}`;
    if (/^(?:a\s+)?change in (?:bank\s+)?control\b/i.test(what)) return what.replace(/^(?:a\s+)?/i, "a ");
    return `a change in control of ${bank}: ${what}`;
  }
  const heads = applicants.map((p) => named(p.name));
  const who = !heads.length ? possessive(named(a.head)) : heads.length <= 2 ? possessive(heads.join(" and ")) : `${heads[0]} and ${heads.length - 1} others'`;
  if (/^(?:\(1\)\s*)?(?:to|for)\b/i.test(what)) return `${who} ${a.outcome === "Permitted" ? "notice" : "application"} ${what}`;
  if (/^(?:waiver|request)\b/i.test(what)) return `${who} request for ${/^request\b/i.test(what) ? what.replace(/^requests?\s+(?:for\s+)?/i, "") : `a ${what}`}`;
  return `${who} ${what.replace(/^(?:an?|the)\s+/i, "")}`;
}

/** An action as a row's title says it: who acted, what it did, on what. */
export function actionTitle(a: H2Action): string {
  const asked = askedFor(a);
  const who = actedBy(a);
  const delegated = a.board || who === "The Federal Reserve" ? "" : " under delegated authority";
  if (a.outcome === "Withdrawn") return `${asked[0].toUpperCase()}${asked.slice(1)} was withdrawn (${who.replace(/^The /, "the ")}${delegated})`;
  if (a.outcome === "Effective") return `${asked[0].toUpperCase()}${asked.slice(1)} took effect (${who.replace(/^The /, "the ")}${delegated})`;
  const verb = { "Approved in part": "approved in part", "Not disapproved": "did not disapprove", Announced: "announced its order on" }[a.outcome] ?? a.outcome.toLowerCase();
  return `${who} ${verb}${delegated ? `,${delegated},` : ""} ${asked}`;
}

const DAY = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m - 1]} ${dd}, ${y}`;
};

/** An action as the release prints it: its heading, who took it, its text and outcome. */
export function actionLine(a: H2Action): string {
  return `${a.category}${a.board ? ", the Board" : a.by ? `, ${a.by}` : ""}: ${clean(a.head)} — ${clean(a.what)}. ${a.outcome}, ${DAY(a.day)}.`;
}

/**
 * The line a Board action adds to the Board's own release or order of its day on the company's page (lib/fedPress.ts):
 * the H.2 of the week lists it, and the deal makes no row of its own.
 */
export function h2Line(actions: readonly H2Action[]): string {
  return `${H2_LINE_MARK} ${DAY(actions[0].week)} lists it: ${actions.map(actionLine).join(" ")}`;
}

/** Where a release's row's own words end and its H.2 line begins. */
export const H2_LINE_MARK = "The Board's weekly H.2 release of the week ending";

const keyOf = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
const LEGAL_END = /,?\s+(?:Inc|Incorporated|Corp|Corporation|Company|Co|Ltd|Limited|plc|LLC|L\.L\.C|N\.\s?A|S\.\s?A|S\.p\.A|AG|N\.\s?V|B\.\s?V|SE|GmbH|KGaA|Group|Holdings?|Companies)\.?$/i;

/**
 * The keys a release is searched for a party by: its whole name's letters and digits ("UBS AG"), and its name less "The"
 * and the legal words at its end ("Goldman Sachs", "Banco Santander Central Hispano"), a short one never.
 */
function releaseKeys(name: string): string[] {
  let core = clean(name).replace(/^The\s+/i, "");
  for (let i = 0; i < 3 && LEGAL_END.test(core); i++) core = core.replace(LEGAL_END, "");
  return [...new Set([keyOf(clean(name)), ...(keyOf(core).length >= 6 ? [keyOf(core)] : [])])].filter((k) => k.length >= 5);
}

/** Whether a release's own words name one of an action's parties, an applicant or what it acquires ("Goldman Sachs" for The Goldman Sachs Group, Inc.). */
export function releaseNamesAction(text: string, a: H2Action): boolean {
  const letters = keyOf(text);
  const { applicants, acquired } = partiesOf(a);
  return [...applicants, ...acquired].some((p) => releaseKeys(p.name).some((k) => letters.includes(k)));
}

const BOARD_DAYS = new WeakMap<readonly H2Action[], Map<string, H2Action[]>>();

/** The Board's own deals of a day, once each: an action listed again in a later week, as an addition or a correction, is one. */
export function boardDealsOn(actions: readonly H2Action[], day: string): H2Action[] {
  let byDay = BOARD_DAYS.get(actions);
  if (!byDay) {
    byDay = new Map();
    const seen = new Set<string>();
    for (const a of actions) {
      if (!a.board || !dealOf(a)) continue;
      const same = `${a.day}|${a.outcome}|${clean(a.head).toLowerCase()}|${clean(a.what).toLowerCase()}`;
      if (seen.has(same)) continue;
      seen.add(same);
      (byDay.get(a.day) ?? byDay.set(a.day, []).get(a.day)!).push(a);
    }
    BOARD_DAYS.set(actions, byDay);
  }
  return byDay.get(day) ?? [];
}

/**
 * The H.2 line of one of the Board's own releases or orders (batch 175): the Board's deals of its day that its title or
 * its row's own words name (`text`, what the row shows before the line), whichever company's page reads it, so the one
 * row every such page shares says the same on each. A Board action of the day the release does not name is no line on
 * it, and keeps its own row (`fed_h2`, which reads the same words back from the stored row).
 */
export function releaseH2Line(r: { day: string; title: string; text?: string }, actions: readonly H2Action[] = fedH2Actions()): string | undefined {
  const named = boardDealsOn(actions, r.day).filter((a) => releaseNamesAction(`${r.title} ${r.text ?? ""}`, a));
  return named.length ? h2Line([...named].sort((x, y) => x.week.localeCompare(y.week) || x.n - y.n)) : undefined;
}

const LIMIT = 900;
const SHOWN = 4;

/** The company's deals the Fed acted on, its Board actions and those under delegated authority, one row a company a day. */
export function companyActions(
  actions: readonly H2Action[],
  namesIn: (year: number) => string[],
  { cik, from = "", namesOn }: { cik: number | string; from?: string; namesOn?: (day: string) => string[] },
): { a: H2Action; roles: H2Role[] }[] {
  const tag = Number(cik);
  const byYear = new Map<number, string[]>();
  const yearNames = (year: number) => byYear.get(year) ?? byYear.set(year, namesIn(year)).get(year)!;
  const seen = new Set<string>();
  const out: { a: H2Action; roles: H2Role[] }[] = [];
  for (const a of actions) {
    if (a.day < from || !dealOf(a)) continue;
    // an action listed again in a later week, as an addition or a correction, is one action
    const same = `${a.day}|${a.outcome}|${clean(a.head).toLowerCase()}|${clean(a.what).toLowerCase()}`;
    if (seen.has(same)) continue;
    const roles = h2Roles(a, tag, () => [...yearNames(Number(a.day.slice(0, 4))), ...(namesOn?.(a.day) ?? [])]);
    if (!roles.length) continue;
    seen.add(same);
    out.push({ a, roles });
  }
  return out;
}

/**
 * The company's actions as timeline events, newest first, from `from`, its first price: one row a day. A Board
 * action `joined` gives, one a Board release or order on the page lists (`releaseH2Line`), is a line on that row and is
 * left out here.
 */
export function fedH2Events(
  actions: readonly H2Action[],
  namesIn: (year: number) => string[],
  { cik, from = "", namesOn, joined }: { cik: number | string; from?: string; namesOn?: (day: string) => string[]; joined?: (a: H2Action) => boolean },
): TimelineEvent[] {
  const tag = Number(cik);
  const byDay = new Map<string, { a: H2Action; roles: H2Role[] }[]>();
  for (const x of companyActions(actions, namesIn, { cik, from, namesOn })) {
    if (x.a.board && joined?.(x.a)) continue;
    (byDay.get(x.a.day) ?? byDay.set(x.a.day, []).get(x.a.day)!).push(x);
  }
  const rows: TimelineEvent[] = [];
  // the company's part in an action, in a row's words
  const as = (a: H2Action, roles: H2Role[]) =>
    roles
      .map((r) => (r === "applicant" ? "the applicant" : a.category === "Change in Bank Control" ? "the bank whose control changes" : "the one whose shares, assets or business are acquired"))
      .join(", and ");
  for (const [day, found] of byDay) {
    const sorted = [...found].sort((x, y) => x.a.week.localeCompare(y.a.week) || x.a.n - y.a.n);
    const one = sorted[0].a;
    const title = sorted.length === 1 ? actionTitle(one) : `The Federal Reserve acted on ${sorted.length} applications naming the company: ${sorted.map((x) => askedFor(x.a)).join("; ")}`;
    const lines = sorted.slice(0, SHOWN).map(({ a, roles }) => `${actionLine(a)} The company is ${as(a, roles)}.`);
    const more = sorted.length > SHOWN ? ` And ${sorted.length - SHOWN} more.` : "";
    const text =
      `The Board's weekly release H.2 lists what the Board, its staff and the Reserve Banks did on applications; it says what the Fed did on the day, not when the deal was announced or closed. ` +
      `${lines.join(" ")}${more}`;
    rows.push({
      id: `fed-h2-${tag}-${day}`,
      date: day,
      type: "regulation",
      title: title.length <= 300 ? title : `${title.slice(0, 299).replace(/\s+\S*$/, "")}…`,
      description: text.length <= LIMIT ? text : `${text.slice(0, LIMIT - 1).replace(/\s+\S*$/, "")}…`,
      source: "Federal Reserve Board, H.2 release",
      url: h2Pdf(one.week),
      sourceKey: "fed_h2",
      // the day's actions, compared as a set by "Also on" (lib/alsoOn.ts): week and place in its release
      externalId: sorted.map((x) => `${x.a.week}#${x.a.n}`).join(","),
      dedupBasis: `fed-h2:${tag}@${day}`,
    });
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}
