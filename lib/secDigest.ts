import { execFile } from "node:child_process";
import { commonName, withoutTag } from "./edgarName";
import { captionParty } from "./secCases";
import { newsNamesFor, TICKER_INDEX_COMPANIES } from "./sec";

/**
 * The SEC News Digest, 1956 to the mid-1990s (2026-11-02 proposal 1, approved with the count
 * first): the SEC's own daily summary of the business it handled before EDGAR — the 8-K reports
 * filed, the registration statements, the 13D and 14D-1 filings, the Holding Company and
 * Investment Company Act orders, the enforcement actions, the listing and delisting orders.
 *
 * Step 1 (batch 87) is a count and stores nothing: the yearly archive page, an issue's PDF read as
 * text with poppler's `pdftotext`, the issue's sections and entries, and the rule that says which
 * entries name a company. `npm run digest-report -- <year>` runs it over one year. A walk that
 * stores entries is step 2, built only if the count holds.
 *
 * The archive: `www.sec.gov/news/digest/digarchives/digarchYYYY.shtml` for each year 1956–2013,
 * one PDF an issue, each with a text layer. On sec.gov under the licence `lib/secCases.ts` quotes
 * ("Information presented on sec.gov is considered public information and may be copied or further
 * distributed…", re-read 2026-11-02). No key.
 */
export const DIGEST_FROM = 1956;
export const DIGEST_LAST = 2013;
const UA = { "User-Agent": "News Charts Research marcusowens94@gmail.com" };
const TIMEOUT_MS = 60_000;

export const digestArchiveUrl = (year: number): string =>
  `https://www.sec.gov/news/digest/digarchives/digarch${year}.shtml`;

export interface DigestIssue {
  /** the issue's day, as the archive page dates it */
  day: string;
  url: string;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** `<a href="/news/digest/1985/dig123185.pdf">December 31, 1985 issue (dig123185.pdf)</a>` */
const ISSUE_LINK = /<a href="(\/news\/digest\/(\d{4})\/[^"]+\.pdf)">\s*([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})\s+issue/g;
const pad = (n: number | string) => String(n).padStart(2, "0");

/** The year's issues from its archive page, oldest first; a link dated in another year is not the year's. */
export function parseDigestArchive(html: string, year: number): DigestIssue[] {
  const seen = new Set<string>();
  const out: DigestIssue[] = [];
  for (const m of html.matchAll(ISSUE_LINK)) {
    const month = MONTHS.indexOf(m[3]) + 1;
    if (!month || Number(m[2]) !== year || Number(m[5]) !== year) continue;
    const url = `https://www.sec.gov${m[1]}`;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ day: `${year}-${pad(month)}-${pad(m[4])}`, url });
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || a.url.localeCompare(b.url));
}

export type DigestFetch<T> = ({ ok: true } & T) | { ok: false; httpStatus?: number; detail: string };

export async function fetchDigestArchive(year: number): Promise<DigestFetch<{ issues: DigestIssue[] }>> {
  try {
    const res = await fetch(digestArchiveUrl(year), { headers: UA, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return { ok: false, httpStatus: res.status, detail: `HTTP ${res.status}` };
    return { ok: true, issues: parseDigestArchive(await res.text(), year) };
  } catch (err) {
    return { ok: false, detail: String(err).slice(0, 200) };
  }
}

export async function fetchDigestIssue(url: string): Promise<DigestFetch<{ pdf: Buffer }>> {
  try {
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return { ok: false, httpStatus: res.status, detail: `HTTP ${res.status}` };
    return { ok: true, pdf: Buffer.from(await res.arrayBuffer()) };
  } catch (err) {
    return { ok: false, detail: String(err).slice(0, 200) };
  }
}

/**
 * An issue's text layer, columns kept where the page has them (`pdftotext -layout`, poppler's
 * reader; it is on the host that runs the count, not a package). The scans' text is the SEC's own
 * OCR, noisy in places ("RECENT 81( FILINGS", "AIERICAI EIPRESS CO" for American Express): the
 * rule below costs matches on it, never accuracy.
 */
export function digestPdfText(pdf: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile("pdftotext", ["-layout", "-enc", "UTF-8", "-", "-"], { maxBuffer: 32 << 20, encoding: "utf8" }, (err, stdout) => {
      if (err) reject((err as NodeJS.ErrnoException).code === "ENOENT" ? new Error("pdftotext is not installed (poppler-utils)") : err);
      else resolve(stdout);
    });
    child.stdin?.end(pdf);
  });
}

// ─── sections and entries ──────────────────────────────────────────────────────────────────────

/**
 * What an entry is, from the section it sits in:
 *  - `8-K report`: the list of current reports filed, a row a company;
 *  - `registration`: a Securities Act registration statement, by registrant;
 *  - `registration effective`: the run-in list of statements declared effective;
 *  - `stake`: a 13D or 14D-1 filing, by the company whose shares were bought;
 *  - `order`: an order or notice under the Holding Company, Investment Company or another Act;
 *  - `enforcement`: an injunction, a proceeding, a sentence, a trading suspension;
 *  - `listing`: a listing, delisting, withdrawal or unlisted-trading order;
 *  - `other`: anything else under a heading (rules, speeches, announcements).
 */
export type DigestKind = "8-K report" | "registration" | "registration effective" | "stake" | "order" | "enforcement" | "listing" | "other";

export interface DigestEntry {
  kind: DigestKind;
  /** the name the entry is about, as printed: a row's name, a heading cut to its parties, or a listing's item */
  party: string;
  /** a row of a column table (8-K reports, stakes) — the SEC's own conformed name, cut to 40 characters */
  row: boolean;
  /** the line it came from, trimmed, for the report */
  line: string;
}

/** A line's letters only, capitals, single-spaced: the form a heading is recognised in through the OCR. */
const loose = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
/** The first column of a laid-out line: the text up to a run of three spaces. */
const firstChunk = (line: string) => line.trim().split(/\s{3,}/)[0];
/**
 * A heading's text: the line up to a wide gap, single-spaced. The 1975 scans space a heading's words
 * apart ("SECURITIES      ACT REGISTRATIONS", "ARKANSAS      POWER       LIGHT     COMPANY"); what
 * stands past a gap of twelve spaces is the masthead or a rule of dots, not the heading.
 */
const headText = (line: string) => line.trim().split(/\s{12,}/)[0].replace(/\s+/g, " ");
const letters = (s: string) => s.replace(/[^A-Za-z]/g, "");
/** Mostly capitals, with enough letters to be words: a heading, a table row's name. */
const capitals = (s: string, min = 4) => {
  const l = letters(s);
  return l.length >= min && l.replace(/[^A-Z]/g, "").length / l.length >= 0.85;
};

/**
 * The section headings, matched on `loose` text, so the scans' OCR still reads ("RECENT 81(
 * FILINGS", "SECURITIES ~CT REGISTRATIONS", "LlSTING,DELlSTING AND UNLISTED TRADING ACTIONS",
 * "DELI STING GRANTED"). A heading carried on to a new page ("ACQUISITIONS CONT.") is the same section.
 */
const SECTIONS: [RegExp, DigestKind][] = [
  [/^(?:RECENT )?(?:8 ?K|8 1|81|BK)\b.*\b(?:FILINGS|REPORTS)\b/, "8-K report"],
  [/^ACQUISITIONS?\b(?: OF SECURITIES| CONT)/, "stake"],
  [/^SECURITIES [A-Z]{0,3} ?CT REGISTRATIONS\b/, "registration"],
  [/^REGISTRATIONS? EFFECTIVE\b/, "registration effective"],
  [/^(?:INVESTMENT COMPANY|HOLDING COMPANY|TRUST INDENTURE|SECURITIES EXCHANGE|SECURITIES) ACT RELEASES\b/, "order"],
  [/^MISCELLANEOUS\b/, "order"],
  [/^(?:CIVIL|CRIMINAL|ADMINISTRATIVE|INJUNCTIVE) (?:PROCEEDINGS|ACTIONS)$/, "enforcement"],
  [/^(?:TRADING SUSPENSIONS?|COURT ENFORCEMENT ACTIONS|ORDERS FOR PUBLIC PROCEEDINGS|DECISIONS? IN ADMINISTRATIVE PROCEEDINGS?)\b/, "enforcement"],
  [/^L ?[IL]STING\b.*\bTRADING\b/, "listing"],
  [/^(?:DEL ?[IL] ?STINGS?|UNLISTED TRADING|WITHDRAWALS?|LISTINGS?) (?:GRANTED|SOUGHT|APPROVED|ACTIONS?)\b/, "listing"],
  [/^(?:COMMISSION ANNOUNCEMENTS?|RULES AND RELATED MATTERS|SELF REGULATORY ORGANIZATIONS?|NOTICE OF PROPOSED RULE CHANGES?)\b/, "other"],
];

/** The section a line heads, or null: a line of capitals alone, as a run-in paragraph's lead-in ("UNLISTED TRADING SOUGHT. The SEC has…") heads only itself. */
const sectionOf = (line: string): DigestKind | null => {
  for (const text of [firstChunk(line), headText(line)]) {
    if (!capitals(text)) continue;
    const head = loose(text);
    const found = SECTIONS.find(([re]) => re.test(head))?.[1];
    if (found) return found;
  }
  return null;
};

/**
 * The sentence a table's section opens with, which stands in for its heading where the scan lost
 * that ("Form 8-K is used by companies to file current reports…", 1990, under a heading drawn as a
 * graphic).
 */
const PREAMBLES: [RegExp, DigestKind][] = [
  [/\bForm\s+8\s?-?\s?K\s+is\s+used\s+by\s+companies\b/i, "8-K report"],
  [/\bmust\s+report\s+to\s+the\s+Commission\s+within\s+ten\s+days\b/i, "stake"],
  [/\bfollowing\s+registration\s+statements\s+have\s+been\s+filed\b/i, "registration"],
];

/** A page's running header, never an entry: "NEWS DIGEST, June 15, 1990", "SEC NEWS DIGEST, JUNE 15, 1965". */
const RUNNING_HEAD = /\bNEWS\s+DI/i;
/** A table's column header: "COMPANY  ITEMS NO.  DATE", "NAME OF ISSUER  CODE 1 2 3…", "NAME AND CLASS OF STOCK/OWNER". */
const COLUMN_HEAD = /^(?:COMPANY\b|.AME (?:OF ISSUER|AND CLASS)\b|EVENT\b|FORM\b|CUSIP\b|STATE\b|CODE\b)/;

/**
 * The words a heading's verb phrase starts with: a heading names its parties and then says what
 * happened to them — "CLARENCE E. LONG AND JOSEPH A. LUGO ENJOINED", "GOLDEN SANDS CORP., OTHERS
 * ENJOINED", "CONSOLIDATED NATURAL GAS RECEIVES ORDER", "GORDON JEWELRY FILES STOCK PLANS".
 */
const HEADING_VERB = new Set(
  ("ENJOINED ENJOINS PERMANENTLY PRELIMINARILY TEMPORARILY SENTENCED INDICTED CONVICTED CHARGED SUED SUES " +
    "CITED SANCTIONED CENSURED BARRED SUSPENDED EXPELLED REVOKED RESTRAINED FINED ACQUITTED PLEADS PLEAD " +
    "FILES FILE FILED PROPOSES PROPOSED RECEIVES SEEKS SELLS PLANS REGISTERS OFFERING OFFERS APPLIES " +
    "ORDER ORDERS GRANTED DENIED EXEMPTED EXEMPTION HEARING TRADING NAMED COMPLAINT CONTEMPT").split(" "),
);

/**
 * A heading cut to the names it is about: what follows "AGAINST" ("PROCEEDINGS INSTITUTED AGAINST
 * HARRY ABRAMS"), up to the first word of its verb phrase. A heading that is only a name ("DEUTSCHE
 * BANK AG", "MIDDLE SOUTH UTILITIES, INC.") is its own party.
 */
export function headingParties(heading: string): string {
  let t = heading.replace(/\s+/g, " ").trim();
  const against = t.toUpperCase().lastIndexOf(" AGAINST ");
  if (against >= 0) t = t.slice(against + " AGAINST ".length);
  const words = t.split(" ");
  const cut = words.findIndex((w, i) => i > 0 && HEADING_VERB.has(w.toUpperCase().replace(/[^A-Z]/g, "")));
  return (cut > 0 ? words.slice(0, cut) : words).join(" ").replace(/[\s,;:.]+$/, "");
}

/**
 * What an entry is by the release it cites, where the OCR lost its section's heading: an
 * Investment Company or Holding Company Act release ("Rel. IC-17530", "Rel. 35-23554") is an
 * order, a litigation release ("LR-12512") an enforcement action.
 */
function releaseKind(body: string): DigestKind | null {
  if (/\bIC\s?-?\s?\d{3,}|\bRe[l1!I]\.?\s*35\s?-\s?\d/.test(body)) return "order";
  if (/\bLR\s?-\s?\d{3,}|\bAAER\b/.test(body)) return "enforcement";
  return null;
}

/** What a run-in heading of the 1950s–60s layout ("GORDON JEWELRY FILES STOCK PLANS.") is, from its words. */
function runInKind(heading: string): DigestKind {
  const h = loose(heading);
  if (/\b(?:DELISTED|DELISTING|UNLISTED|LISTING)\b/.test(h)) return "listing";
  if (/\b(?:ENJOINED|INDICTED|SENTENCED|CONVICTED|CHARGED|SUSPENDED|SUSPENSION|BAN|COMPLAINT|CONTEMPT|REVOKED|EXPELLED|BARRED|CITED)\b/.test(h)) return "enforcement";
  if (/\b(?:FILES|PROPOSES|OFFERING|REGISTERS|REGISTRATION)\b/.test(h)) return "registration";
  if (/\b(?:ORDER|EXEMPTION|HEARING|APPLICATION)\b/.test(h)) return "order";
  return "other";
}

/** "     CONSOLIDATED NATURAL GAS RECEIVES ORDER. The SEC has issued…" — a paragraph's capitals lead-in. */
const RUN_IN = /^\s{2,10}([A-Z0-9][A-Z0-9 ,.'&/()-]{6,}?)\.\s+(?=(?:The|A|An|In|On)\b|[A-Z][a-z])/;

/** A form code at a registration row's head: "S-16  HUMANA INC", "(S-8)  THE PARKER PEN COMPANY, 219 East…", "5-1" and "S-l" as the OCR reads "S-1". */
const FORM_CODE = /^\s*\(?\s*((?:[S5F]|N)\s*-\s*[0-9lIBO]{1,2}[A-Z]?)\s*\)?\s+/;

/**
 * A registration row's registrant: the capitals after the form code, up to where the address begins
 * — a comma before an address, a street number, or mixed-case text ("RAILWAY SERVICES CORPORATION,
 * 1801 K Street…", "MODTECH INC. 195 EAST MORGAN ST.", "CENTRAL TELEPHONE & UTILITIES CORPORATION
 * 5725 East River Rd.").
 */
function registrant(rest: string): string {
  const words = rest.trim().split(/\s+/);
  const out: string[] = [];
  for (const w of words) {
    if (/^\d/.test(w) || (/[a-z]/.test(w) && !/^(?:of|and|the|&)$/.test(w))) break;
    if (/^P\.?O\.?$|^POBOX$/i.test(w)) break;
    out.push(w);
    if (w.endsWith(",") && out.length > 1 && !/^(?:INC|CORP|CO|LTD|L\.?P|N\.?A|S\.?A|PLC)\b/i.test(w)) {
      // a comma ends the name unless a legal form follows it ("MIDDLE SOUTH UTILITIES, INC.")
      const next = words[out.length];
      if (!next || !/^(?:INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LTD|LIMITED|L\.?P|N\.?A|S\.?A|PLC|AG|N\.?V)\b/i.test(next)) break;
    }
  }
  return out.join(" ").replace(/[\s,;:.]+$/, "");
}

/** A 13D or 14D-1 row's security class, where the name of the company bought ends: "HASBRO INC   COM   50   41805610". */
const SECURITY_CLASS = /^(?:COM|CL|CLASS|PFD|PREF|PREFERRED|SUB|SUBORD|DEPOSITARY|DEPOSITORY|UNIT|UNITS|UNT|WT|WTS|WARRANTS?|SH|SHS|CAP|CV|CONV|ORD|ADR|ADS|BEN|NOTES?|DEB|DEBS?)$/;
/** A filing's date in a row — the buyer's line under the company bought carries one, as an 8-K row does. */
const SLASH_DATE = /\d{1,2}\s?\/\s?\d{1,2}\s?\/\s?\d{2}|\d{2}\/\d{2}/;

/**
 * An 8-K row's company. Where the table has a state column ("NAME OF ISSUER  CODE…", 1990s) the
 * names are single-spaced and the first column is the name; otherwise (1970s–80s) the name runs to
 * the first item number or date, as the 1975 scans space a name's words wide ("MINNESOTA   MINING
 * MANUFACTURING   CO   11   05/75").
 */
function eightKName(line: string, stateColumn: boolean): string {
  if (stateColumn) return firstChunk(line).replace(/[\s,;:.]+$/, "");
  const words = line.trim().split(/\s+/);
  const cut = words.findIndex((w) => /\d/.test(w) && !/^\d+(?:ST|ND|RD|TH)$/.test(w) && w.length <= 12);
  return (cut >= 0 ? words.slice(0, cut) : words).join(" ").replace(/\s+(?:X|AMEND)$/g, "").replace(/[\s,;:.]+$/, "");
}

/**
 * A listing order's companies, each an item: "…the following securities: McGraw-Hill, Inc, 3 7/8%
 * Convertible Subordinated Debentures … (Rel. 34-28113); Bowater Incorporated. 12 3/8% …; and U.S.
 * Home Corporation Reset Notes…". The release numbers and the words before a class of security part them.
 */
function listingItems(body: string): string[] {
  return body
    .replace(/\(\s*Re[l1!I]\.?[^)]*\)/gi, ";")
    .replace(/\b(?:common|preferred|capital)?\s*(?:stock|shares|securities|debentures|bonds|notes|warrants|units|privileges)\s+(?:in|of)\s+(?:the\s+)?(?=[A-Z])/g, ";")
    .split(/[;:]|\s\(\d\)\s|\band\s+(?=[A-Z])/)
    .map((s) => s.replace(/^\s*(?:and\s+)?/, "").trim())
    .filter((s) => /[A-Z]/.test(s));
}

/** The run-in list of statements declared effective (1970s): "June 12  Robins Company Inc 251143 American Express 253772 …". */
function effectiveItems(body: string): string[] {
  return body
    // the file numbers part the items: "2-53772" and the scans' "253772" (1970s), "33-312" (from 1983)
    .split(/\b2\s?-?\s?\d{4,5}(?:-[A-Z]\d?)?\b|\b25\d{4}\b|\b33\s?-\s?\d{1,5}(?:-[A-Z]\d?)?\b|;/)
    .map((s) => s.replace(/^\s*(?:(?:Jan|Feb|Mar|Apr|May|June?|July?|Aug|Sept?|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}\s*)/i, "").trim())
    // a legal word the scan set down in the next column: "Duke Power 253783 Co", "Portland General Electric 253749 Co"
    .map((s) => s.replace(/^(?:Co|Inc|Corp)\.?\s+(?=[A-Z])/, ""))
    .filter((s) => /[A-Z]/.test(s) && s.length > 2);
}

/**
 * An issue's entries, section by section. Each is about one name, as printed: a table row's company
 * (an 8-K report, the company bought in a 13D or 14D-1), a registration's registrant, a heading cut
 * to its parties, or an item of a listing order. Text in an entry's body is never its party — so the
 * managing underwriter of another company's registration ("Underwriter: Morgan Stanley & Co.
 * Incorporated", 1980) and a parent named in its subsidiary's order ("subsidiary of The Southern
 * Company", 1985) are no one's entry.
 */
export function digestEntries(text: string): DigestEntry[] {
  const lines = text.split(/\r?\n/);
  const out: DigestEntry[] = [];
  let section: DigestKind | null = null;
  let stateColumn = false;
  let heading: { text: string; line: string; kind: DigestKind } | null = null;
  let body: string[] = [];
  const add = (e: DigestEntry) => {
    if (e.party.replace(/[^A-Za-z]/g, "").length >= 2) out.push({ ...e, party: e.party.replace(/\s+/g, " ").trim() });
  };
  const close = () => {
    if (heading) {
      if (heading.kind === "listing") {
        for (const item of listingItems(body.join(" "))) add({ kind: "listing", party: item, row: false, line: heading.line });
      } else if (heading.kind === "registration effective") {
        for (const item of effectiveItems(body.join(" "))) add({ kind: "registration effective", party: item, row: false, line: heading.line });
      } else {
        add({ kind: releaseKind(body.join(" ")) ?? heading.kind, party: headingParties(heading.text), row: false, line: heading.line });
      }
    }
    heading = null;
    body = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || RUNNING_HEAD.test(trimmed)) continue;
    const opens = PREAMBLES.find(([re]) => re.test(trimmed))?.[1];
    if (opens && opens !== section) {
      close();
      stateColumn = false;
      section = opens;
      continue;
    }
    const found = sectionOf(line);
    if (found) {
      close();
      // a table carried on to the next page ("8K REPORTS CONT.") keeps the first page's columns
      if (found !== section) stateColumn = false;
      section = found;
      // a section whose own heading is the listing order ("DELISTINGS GRANTED") reads its body for items
      if (found === "listing" || found === "registration effective") heading = { text: headText(line), line: trimmed, kind: found };
      continue;
    }
    const chunk = firstChunk(line);
    const head = headText(line);
    if (COLUMN_HEAD.test(loose(chunk))) {
      if (/\bCODE\b/.test(loose(line))) stateColumn = true;
      continue;
    }

    if (section === "8-K report") {
      if (capitals(chunk, 3) && /\d/.test(line.slice(line.indexOf(chunk) + chunk.length))) {
        close();
        add({ kind: "8-K report", party: eightKName(line, stateColumn), row: true, line: trimmed });
      }
      continue;
    }
    if (section === "stake") {
      const words = trimmed.split(/\s+/);
      const cls = words.findIndex((w, j) => j > 0 && SECURITY_CLASS.test(w.replace(/[^A-Z]/gi, "").toUpperCase()));
      if (cls > 0 && !SLASH_DATE.test(trimmed) && capitals(words.slice(0, cls).join(" "), 2)) {
        close();
        add({ kind: "stake", party: words.slice(0, cls).join(" "), row: true, line: trimmed });
      }
      continue;
    }
    if (section === "registration") {
      const form = FORM_CODE.exec(line);
      if (form) {
        close();
        let name = registrant(line.slice(form[0].length));
        // a name the 1975 scans wrap onto the next line: "STANDARD POORS/INTERCAPITAL LIQUID / ASSET FUND INC"
        const next = lines[i + 1]?.trim() ?? "";
        if (name === line.slice(form[0].length).trim().replace(/[\s,;:.]+$/, "") && next && capitals(next) && !/\d/.test(next) && next.length < 50) name += ` ${next}`;
        add({ kind: "registration", party: name, row: false, line: trimmed });
      }
      // the rest of a registration — its address, securities and underwriters — is no one's entry,
      // capitals or not (the 1990s print the whole entry in capitals)
      continue;
    }

    const runIn = RUN_IN.exec(line);
    if (runIn && capitals(runIn[1])) {
      close();
      heading = { text: runIn[1], line: trimmed, kind: section && section !== "other" ? section : runInKind(runIn[1]) };
      body.push(line.slice(runIn[0].length));
      continue;
    }
    if (capitals(head) && head.length < 110 && !/^\(?\s*(?:Rel|File)\b/i.test(trimmed)) {
      // consecutive capitals lines are one heading: "ADMINISTRATIVE PROCEEDINGS INSTITUTED" / "AGAINST RAPHAEL DAVID BLOOM"
      if (heading && !body.length && heading.kind !== "listing" && heading.kind !== "registration effective") {
        heading.text += ` ${head}`;
        continue;
      }
      close();
      const kind: DigestKind = section ?? runInKind(head);
      heading = { text: head, line: trimmed, kind };
      continue;
    }
    if (heading) body.push(trimmed);
  }
  close();
  return out;
}

// ─── whether an entry names a company ──────────────────────────────────────────────────────────

/** The names a company is matched under in the Digest, the names it had then among them. */
export interface DigestNames {
  /** the SEC's conformed names for it — its EDGAR title and the former names EDGAR keeps — as the tables print them */
  conformed: readonly string[];
  /** the names a heading or a listing item may write: the everyday name, the company's own other names, the legal names */
  names: readonly string[];
}

/**
 * A company's Digest names from its EDGAR title and other EDGAR names: those as the tables print
 * them, and for headings and listing items its everyday name, its own other names (`newsNamesFor`)
 * and each EDGAR name without its tag. Undated, this is every name the company could match under:
 * the count finds its candidates with it, and `digestNamesOn` decides.
 */
/** An EDGAR name as a name: "SAFEGUARD SCIENTIFICS INC ET AL", a filing group's label, is Safeguard Scientifics Inc. */
const asName = (n: string) => n.replace(/\s+ET\s+AL\.?\s*$/i, "").trim();

export function digestNames(cik: number, title: string, edgarNames: readonly string[] = []): DigestNames {
  const conformed = [...new Set([title, ...edgarNames].map(asName))];
  return { conformed, names: [...new Set([commonName(title), ...newsNamesFor(cik), ...conformed.map(withoutTag)])] };
}

/** A company's EDGAR record as dating its names needs it: the former names with their days, and its first filing. */
export interface EdgarRecord {
  formerNames: { name: string; from: string; to: string }[];
  firstFiled: string | null;
  /**
   * the names it filed under in its first quarter in EDGAR's company indexes of 1993–1996
   * (`firstNamesIn`), [] when it is in none of them; the names it had before EDGAR
   */
  firstNames?: string[];
}

/** The quarters of EDGAR's first years, whose company indexes say what each record was called when it began. */
export const FIRST_QUARTERS: { year: number; quarter: number }[] = [1993, 1994, 1995, 1996].flatMap((year) => [1, 2, 3, 4].map((quarter) => ({ year, quarter })));
export const companyIndexUrl = (q: { year: number; quarter: number }): string =>
  `https://www.sec.gov/Archives/edgar/full-index/${q.year}/QTR${q.quarter}/company.zip`;

/** A quarter's company index (`company.idx`): each filing's company as EDGAR named it that quarter, its CIK and day. */
export function parseCompanyIndex(text: string): { name: string; cik: number; filed: string }[] {
  const out: { name: string; cik: number; filed: string }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^(.+?)\s{2,}\S.*?\s{2,}(\d{1,10})\s{2,}(\d{4}-\d{2}-\d{2})\s{2,}\S+\s*$/.exec(line);
    if (m) out.push({ name: m[1].trim(), cik: Number(m[2]), filed: m[3] });
  }
  return out;
}

/**
 * Each record's names in its first quarter across the indexes given, oldest quarter first: what
 * EDGAR called the company when it began, which the record's own former names do not always say —
 * ACE's lists "ACE LTD" only from 2009, though it filed as ACE LTD in 1995; Chevron's lists only
 * "CHEVRONTEXACO CORP", though it filed as CHEVRON CORP from 1994.
 */
export function firstNamesIn(quarters: readonly { name: string; cik: number }[][]): Map<number, string[]> {
  const out = new Map<number, string[]>();
  for (const rows of quarters) {
    const seen = new Map<number, Set<string>>();
    for (const r of rows) {
      if (out.has(r.cik)) continue;
      if (!seen.has(r.cik)) seen.set(r.cik, new Set());
      seen.get(r.cik)!.add(r.name);
    }
    for (const [cik, names] of seen) out.set(cik, [...names]);
  }
  return out;
}

/** The record from EDGAR's submissions file (`data.sec.gov/submissions/CIK##########.json`). */
export function parseEdgarRecord(json: unknown): EdgarRecord {
  const j = (json ?? {}) as {
    formerNames?: { name?: string; from?: string; to?: string }[];
    filings?: { recent?: { filingDate?: string[] }; files?: { filingFrom?: string }[] };
  };
  const days = [...(j.filings?.recent?.filingDate ?? []), ...(j.filings?.files ?? []).map((f) => f.filingFrom ?? "")].filter((d) => /^\d{4}-\d{2}-\d{2}/.test(d));
  return {
    formerNames: (j.formerNames ?? [])
      .filter((f) => f.name && f.from && f.to)
      .map((f) => ({ name: f.name!.trim(), from: f.from!.slice(0, 10), to: f.to!.slice(0, 10) })),
    firstFiled: days.length ? days.map((d) => d.slice(0, 10)).sort()[0] : null,
  };
}

/**
 * When EDGAR's phase-in was over: every registrant filed electronically from May 1996, so a record
 * EDGAR first saw by then is a company that was already filing, and one it opened later is a company
 * that came later — a new listing, a new holding company, a namesake.
 */
export const EDGAR_PHASED_IN = "1996-12-31";

/**
 * The names a company's record had on a day, from EDGAR's own dates. On a day EDGAR covers, each
 * former name between its first and last day, and the present title from the day the last one
 * stopped. Before the record's first filing, the name it had then, and only for a record EDGAR
 * opened in its first years (`EDGAR_PHASED_IN`). So a name the company took later is not its name
 * in an older issue — Bank of America's record took "BANKAMERICA CORP" in 1998 from the company it
 * bought, JPMorgan's took "CHASE MANHATTAN CORP" in 1996, and neither is theirs in 1985 — and a
 * record younger than its name has none of the years before it: McGraw Hill (MH), opened 2021, is
 * not the McGraw-Hill of 1990, which S&P Global's record was.
 */
const daysBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000;

/** The day a record begins: its first filing, or its first name's first day if EDGAR dates that earlier. */
export const recordStart = (record: EdgarRecord): string | undefined =>
  [record.firstFiled, ...record.formerNames.map((f) => f.from)].filter((d): d is string => !!d).sort()[0];

export function namesInUse(day: string, title: string, record: EdgarRecord): string[] {
  const former = [...record.formerNames].sort((a, b) => a.from.localeCompare(b.from));
  const start = recordStart(record);
  if (!start) return [];
  // each name holds from its first day — the first from the record's first filing, which EDGAR
  // dates a few days before the name (Southern Co: filed 1994-01-21, "SOUTHERN CO" from 1994-01-28)
  // — until its last, or until the next name began where EDGAR leaves a gap between them
  // — until its last, or until the next name began where EDGAR leaves a gap between them. EDGAR
  // does not list a name the company has again today: where the first name it lists began more than
  // a year after the record, the record began under its present title (Chevron's lists only
  // "CHEVRONTEXACO CORP", 2001–2005; it filed as Chevron Corp from 1994, and in 1985).
  const reaches = former.length > 0 && daysBetween(start, former[0].from) <= 365;
  const spans = former.map((f, i) => ({ name: f.name, from: i === 0 && reaches ? start : f.from, to: [f.to, former[i + 1]?.from ?? f.to].sort().at(-1)! }));
  if (former.length && !reaches) spans.push({ name: title, from: start, to: former[0].from });
  // the present title, unless EDGAR lists it among them (JPMorgan's does, to the day it was read),
  // from the day the last other name stopped
  const titleKey = conformedKey(title);
  if (!former.some((f) => conformedKey(f.name) === titleKey)) {
    const renamed = former.map((f) => f.to).sort().at(-1);
    spans.push({ name: title, from: renamed && renamed > start ? renamed : start, to: "9999-12-31" });
  }
  // before the record began: the names it filed under in its first quarter, where the indexes were
  // read, and only for a record EDGAR opened in its first years
  if (day < start) {
    if (start > EDGAR_PHASED_IN) return [];
    if (record.firstNames) return [...record.firstNames];
  }
  const on = day >= start ? day : start;
  return [...new Set(spans.filter((s) => s.from <= on && on <= s.to).map((s) => s.name))];
}

/**
 * A company's Digest names on a day: those of `digestNames` that it had then (`namesInUse`), and
 * before a handover in `lib/predecessors.ts` the names its predecessor's record had then (Cigna's
 * history before 2018 is Cigna Corporation's record). Its everyday name and own other names go
 * with its present title; a former name stands for itself.
 */
export function digestNamesOn(
  day: string,
  cik: number,
  title: string,
  record: EdgarRecord,
  predecessors: readonly { name: string; until: string; record: EdgarRecord }[] = [],
): DigestNames {
  const inUse = [
    ...namesInUse(day, title, record),
    ...predecessors.filter((p) => day < p.until).flatMap((p) => namesInUse(day, p.name, p.record)),
  ].map(asName);
  const present = inUse.some((n) => conformedKey(n) === conformedKey(title));
  return {
    conformed: [...new Set(inUse)],
    names: [...new Set([...(present ? [commonName(title), ...newsNamesFor(cik)] : []), ...inUse.map(withoutTag)])],
  };
}

/**
 * The key a conformed name is compared under: tag gone ("ENTERGY CORP /DE/"), capitals, letters and
 * digits as words, "&" and "AND" dropped, since the 8-K lists drop them ("MINNESOTA MINING
 * MANUFACTURING CO" is 3M's "MINNESOTA MINING & MANUFACTURING CO").
 */
export const conformedKey = (name: string): string =>
  loose(withoutTag(name).replace(/&/g, " "))
    .split(" ")
    .filter((w) => w && w !== "AND")
    .map((w) => FORM[w] ?? w)
    .join(" ");

/**
 * A legal form's long word as its short one: the SEC writes both, and EDGAR counts a change between
 * them as a rename ("STAAR SURGICAL COMPANY" until 2019, "STAAR SURGICAL CO" after, one company).
 */
const FORM: Record<string, string> = { COMPANY: "CO", CORPORATION: "CORP", INCORPORATED: "INC", LIMITED: "LTD" };

/**
 * The same key through the scans' commonest misreadings, to find a table row's candidates when the
 * exact key missed: N, M, X, L and 1 all as I, 0 and Q as O. It only finds them; `ocrReads` decides.
 */
export const foldedKey = (name: string): string =>
  conformedKey(name).replace(/[NMXL1]/g, "I").replace(/[0Q]/g, "O");

/** A row's key with its letters' case kept, so a lowercase "l" in a table of capitals reads as the misreading it is. */
const casedKey = (raw: string): string =>
  withoutTag(raw)
    .replace(/&/g, " ")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w && w.toUpperCase() !== "AND")
    .map((w) => FORM[w.toUpperCase()] ?? w)
    .join(" ");

/**
 * Whether a table row is the name read through the scans' misreadings, letter by letter and one way
 * only: what the scanner printed for what was there. It prints I, 1 or a lowercase l for N, M, X, L
 * or I ("AIERICAI EIPRESS CO", "SOUTHERI CALIFORIIA EDISOI CO", "CMS ElERGY CORP", 1990), N for M
 * and M for N ("NEWNONT MINING CORP"), 0 or Q for O ("SMITH A 0 CORP"). A capital it printed stands
 * for itself otherwise, so "MITEL CORP" is not Intel, "NCNB CORP" not LCNB, "INTL INC" not MNTN —
 * all three were the 1985 count's, before this rule. At most four letters read back.
 */
export function ocrReads(raw: string, name: string): boolean {
  const r = casedKey(raw);
  const c = conformedKey(name);
  if (r.length !== c.length || !c.includes(" ")) return false;
  let read = 0;
  for (let i = 0; i < r.length; i++) {
    const a = r[i];
    const b = c[i];
    if (a === b) continue;
    if (a === " " || b === " ") return false;
    if (a === a.toLowerCase() && a.toUpperCase() === b && a !== "l") continue; // a lowercase letter the scan printed small
    const ok = ("I1l".includes(a) && "NMXLI".includes(b)) || (a === "N" && b === "M") || (a === "M" && b === "N") || ("0Q".includes(a) && b === "O");
    if (!ok || ++read > 4) return false;
  }
  return true;
}

/**
 * The registration tag a row or name carries, as the SEC sets it apart from a namesake ("FIRST
 * NATIONAL CORP/LA/", "ENTERGY CORP /DE/"), or null: two letters after a slash, the closing slash
 * often read as I or l ("/LAI", "/lAI").
 */
const tagOf = (s: string): string | null => /\/\s*([A-Za-z]{2})(?:[\s/Il]|$)/.exec(s)?.[1]?.toUpperCase() ?? null;

const presentKeys = new Map<string, Set<number>>();
const presentFolded = new Map<string, Set<number>>();
for (const [cik, title] of TICKER_INDEX_COMPANIES) {
  for (const [map, key] of [[presentKeys, conformedKey(title)], [presentFolded, foldedKey(title)]] as const) {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(cik);
  }
}

/** Whether another listed company's present title has this key, so the key names no one company for certain. */
const sharedKey = (map: Map<string, Set<number>>, key: string, cik: number | undefined) =>
  [...(map.get(key) ?? [])].some((c) => c !== cik);

export type DigestMatch = "conformed" | "caption" | "folded";

/** A legal form at a party's end, to find the name it follows. */
const LEGAL_TAIL = /(?:[\s,]+(?:INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LTD|LIMITED|LLC|L\.?P|PLC|N\.?A|S\.?A|AG|N\.?V)\.?)+$/i;

/**
 * Whether the entry is the company's, and how:
 *  - `conformed`: its row or party is one of the company's conformed names, of two words or more
 *    ("ORANGE", a scan's broken row, is not Orange S.A.), and a tag the row carries is one of the
 *    company's ("FIRST NATIONAL CORP/LA/" is not Virginia's First National Corp);
 *  - `caption`: a heading or listing item names the company as a caption names a party
 *    (`captionParty`, the SEC cases' rule: the name or the legal name with legal words after it, a
 *    longer listed name owning the mention, a name two listed companies share naming neither); a
 *    one-word name only with its legal words and at the entry's head, since "AND" parts a caption's
 *    parties but not "ARKANSAS POWER AND LIGHT COMPANY", which is no "Light Company";
 *  - `folded`: a table row only, one of its conformed names read through the scans' misreadings
 *    (`ocrReads`).
 * A conformed name another listed company has today names neither.
 */
export function digestEntryNames(entry: DigestEntry, names: DigestNames, cik?: number): DigestMatch | null {
  const key = conformedKey(entry.party);
  const tag = entry.row ? tagOf(entry.party) : null;
  const tagged = (n: string) => !tag || tagOf(n) === tag;
  if (key.includes(" ") && names.conformed.some((n) => conformedKey(n) === key && tagged(n)) && !sharedKey(presentKeys, key, cik)) return "conformed";
  if (!entry.row) {
    const party = captionParty(entry.party, names.names);
    if (party) {
      const stem = party.trim().replace(LEGAL_TAIL, "").replace(/^the\s+/i, "");
      const leads = loose(entry.party).startsWith(loose(party));
      if (/\s/.test(stem.trim()) || (stem.trim() !== party.trim() && leads)) return "caption";
    }
  }
  if (entry.row) {
    const folded = foldedKey(entry.party);
    if (names.conformed.some((n) => foldedKey(n) === folded && ocrReads(entry.party, n) && tagged(n)) && !sharedKey(presentFolded, folded, cik)) return "folded";
  }
  return null;
}

/**
 * The companies an entry could be, found fast for a count over every listed company: those with a
 * conformed name of the same key or folded key, and those with a name whose first two words (the
 * first, for a one-word name) the party carries in order. Each is then put to `digestEntryNames`,
 * so the count applies exactly the per-company rule.
 */
export class DigestNameIndex {
  private byKey = new Map<string, Set<number>>();
  private byFolded = new Map<string, Set<number>>();
  private byLead = new Map<string, Set<number>>();
  constructor(private readonly companies: ReadonlyMap<number, DigestNames>) {
    const put = (map: Map<string, Set<number>>, k: string, cik: number) => {
      if (!k) return;
      if (!map.has(k)) map.set(k, new Set());
      map.get(k)!.add(cik);
    };
    for (const [cik, n] of companies) {
      for (const c of n.conformed) {
        put(this.byKey, conformedKey(c), cik);
        put(this.byFolded, foldedKey(c), cik);
      }
      for (const name of n.names) put(this.byLead, lead(name), cik);
    }
  }

  candidates(entry: DigestEntry): number[] {
    const found = new Set<number>(this.byKey.get(conformedKey(entry.party)) ?? []);
    if (entry.row) for (const c of this.byFolded.get(foldedKey(entry.party)) ?? []) found.add(c);
    else {
      const w = loose(entry.party).split(" ");
      for (let i = 0; i < w.length; i++) {
        for (const k of [w[i], `${w[i]} ${w[i + 1] ?? ""}`.trim()]) for (const c of this.byLead.get(k) ?? []) found.add(c);
      }
    }
    return [...found];
  }

  /**
   * The companies the entry is, each with how it matched: under each candidate's names on the day
   * where `namesOn` gives them (`digestNamesOn`), under all its names where it does not.
   */
  match(entry: DigestEntry, namesOn?: (cik: number) => DigestNames | null | undefined): { cik: number; how: DigestMatch }[] {
    const out: { cik: number; how: DigestMatch }[] = [];
    for (const cik of this.candidates(entry)) {
      const names = namesOn ? namesOn(cik) : this.companies.get(cik)!;
      const how = names ? digestEntryNames(entry, names, cik) : null;
      if (how) out.push({ cik, how });
    }
    return out;
  }
}

/** A name's first two words (one, for a one-word name) in `loose` form, a leading "THE" and the legal words off. */
function lead(name: string): string {
  const w = loose(name.replace(/^the\s+/i, "")).split(" ").filter((x) => !/^(?:INC|CORP|CO|COMPANY|CORPORATION|LTD|LLC|LP|PLC|AG|SA|NV)$/.test(x));
  return w.slice(0, 2).join(" ");
}

/** One company's row from one issue: its entries in one section, and how the first matched. */
export interface DigestRow {
  cik: number;
  day: string;
  kind: DigestKind;
  how: DigestMatch;
  entries: DigestEntry[];
}

/**
 * An issue's rows, under each company's names on the issue's day where `namesOn` gives them. An
 * issue's entries on one company in one section are one row — Hasbro's five 13D filings in the
 * 1990-06-15 issue, the Hassenfeld family's, are one row on HAS — as a page shows one event for
 * them. An entry two companies' names both claim on the day is neither's (`onShared` hears of it):
 * an entry is about one name.
 */
export function digestIssueRows(
  day: string,
  entries: readonly DigestEntry[],
  index: DigestNameIndex,
  namesOn?: (cik: number) => DigestNames | null | undefined,
  onShared?: (entry: DigestEntry, ciks: number[]) => void,
): DigestRow[] {
  const rows = new Map<string, DigestRow>();
  for (const e of entries) {
    const matched = index.match(e, namesOn);
    if (matched.length > 1) {
      onShared?.(e, matched.map((m) => m.cik));
      continue;
    }
    for (const m of matched) {
      const key = `${m.cik}|${e.kind}`;
      const row = rows.get(key);
      if (row) row.entries.push(e);
      else rows.set(key, { cik: m.cik, day, kind: e.kind, how: m.how, entries: [e] });
    }
  }
  return [...rows.values()];
}

/**
 * Today's rule for every source, the first-price floor: a row before the company's first price is
 * not on its page, and a company with no prices has none. Whether the Digest keeps it is open with
 * the owner after the count; the names' dates (`namesInUse`), not the floor, keep a name off a
 * record younger than the name.
 */
export const digestOnPage = (day: string, firstPrice: string | null | undefined): boolean => !!firstPrice && day >= firstPrice;
