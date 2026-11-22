import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { andSpellings } from "./edgarName";
import { captionParty } from "./secCases";
import { takenBefore } from "./takenNames";
import type { TimelineEvent } from "./types";
import { decodeText, readZip, zipEntryNames } from "./zip";

/**
 * The FDA's own press releases and talk papers, 1962–2014 (batch 169, the 2026-11-22 proposal 3, approved by the
 * owner that day with its recommended call: a release on the day of an approval the page holds adds its words to
 * that approval's row and makes no row of its own; since batch 170 only a release naming the approval's drug,
 * `releaseFor`).
 *
 * openFDA publishes the agency's historical documents, press releases and talk papers of 1913–2014, as one keyless
 * file of OCR text (`FDA_HISTORY_FILE`, 13,869,827 bytes on 2026-11-22, "last_updated" 2026-11-18): 8,858
 * documents, each with its year, its kind and its text. The FDA's held sources begin late (new-drug approvals in
 * 1985, device recalls in 2000, enforcement reports in 2012, warning letters in 2021); these reach the 1960s.
 *
 * A document's day is read from its head, a day of its own year ("FOR IMMEDIATE RELEASE … April 26, 1993",
 * `documentDay`); one whose head gives none makes no row. A company is named by the prose rule (`proseParty`): its
 * name of the year with a legal word after it ("Eli Lilly and Company", "Abbott Laboratories, Inc."), or its whole
 * name of two words or more printed capitalised ("Procter & Gamble"), then the caption rule's guards (a name two
 * listed companies share, a longer listed name), the table of taken names, and the company's first price. A
 * document naming more than two listed companies (a list of drug makers, the pharmacies of a campaign) names none.
 * Every kept row was read by hand once: 65 refused (`REFUSED`), and three the rule refuses kept (`NAMED_BY_HAND`).
 *
 * `npm run sync:fda-history` reads the file into the committed `data/fda-history.json.gz`, keeping the dated
 * documents of 1962 on that name a listed company in the index, with the companies each names, its kind, its day,
 * its lead and the sentence naming each company. The file ends in 2014 and is closed in practice; the sync is run
 * again after `npm run sync:tickers`. A name only EDGAR's former names give, which the index does not hold, is not
 * read. Ingest asks nothing.
 *
 * Licence: openFDA's terms (open.fda.gov/license, as recorded for source 40): "unless otherwise noted, the content,
 * data, documentation, code, and related materials on openFDA is public domain and made available with a Creative
 * Commons CC0 1.0 Universal dedication". The file's own header points to it and adds: "Do not rely on openFDA to
 * make decisions regarding medical care … you should assume all results are unvalidated." A row quotes the
 * document's own words as the OCR gives them, never rewritten.
 */

export const FDA_HISTORY_FILE = "https://download.open.fda.gov/other/historicaldocument/other-historicaldocument-0001-of-0001.json.zip";
/** The dataset's page: the documents have no page of their own. */
export const FDA_HISTORY_PAGE = "https://open.fda.gov/apis/other/historicaldocument/";
export const FDA_HISTORY_DATA = join(__dirname, "..", "data", "fda-history.json.gz");

export interface FdaHistoricalDocument {
  /** a hash of the document's year, kind and text: the file gives no id */
  id: string;
  year: number;
  type: string;
  day: string | null;
  text: string;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const SPELLED = /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)\.?\s+(\d{1,2})\s*[,.]?\s*((?:19|20)\d\d)\b/gi;
/** The same with the OCR's letters for figures ("Sept. l8, 1989", "October 4, l976"), read only beside a release line. */
const SPELLED_OCR = /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)\.?\s+([\dlIO]{1,2})\s*[,.]?\s*((?:19|20|[lI]9)[\dlO]{2})\b/gi;
/** A release line or a talk paper's or release's number, the day printed beside it the document's own. */
const RELEASE_LINE = /\bFOR\s+(?:IMMEDIATE\s+)?RELEASE\b:?|\bT\s?\d\d\s?[-—–]\s?\d{1,3}\b/g;
/** A day's figures as the OCR may print them: "l8" and "I8" are 18, "O" a 0 (batch 170, the audit's finding 4). */
const figures = (x: string) => Number(x.replace(/[lI]/g, "1").replace(/O/g, "0"));
/** The words before a day that make it a revision's, not the document's: "This press release was revised on March 21, 2007". */
const REVISED = /\b(?:(?:revised|updated|corrected|amended|issued)(?:\s+again)?\s+(?:on\s+)?|update:?\s+(?:on\s+)?)$/i;

const FIGURES = /\b(\d{1,2})\/(\d{1,2})\/((?:19|20)?\d\d)\b/g;

/**
 * The day a document's head gives and where it ends: the first in its first 1,500 characters that falls in its own
 * year, spelled ("Wednesday, January 15, 1964", the OCR's "Sept. l8, 1989" read as the 18th) before figures
 * ("1/15/64"), the day beside a release line or a talk paper's number first, where the OCR's letters for figures are
 * read too ("T89-55 … Sept. l8, 1989" the 18th), a revision's day ("revised on March 21, 2007") or one closing a note of
 * what it updates ("(Updates press release 76—l4 issued … May ll, 1976)") never; null where none does, as when the
 * OCR's year differs (batch 170, the audit's finding 4).
 */
export function headDate(year: number, text: string): { day: string; end: number } | null {
  const head = text.slice(0, 1500);
  const iso = (yy: number, mm: number, dd: number) => `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  const spelled = (m: RegExpMatchArray, at: number) => {
    const word = m[1].toLowerCase();
    const month = MONTHS[word.startsWith("sept") ? "sept" : word.slice(0, 3)];
    const yy = figures(m[3]);
    const dd = figures(m[2]);
    const before = head.slice(Math.max(0, at - 30), at).replace(/\s+/g, " ");
    // a revision's day, or one closing a note of what the document updates ("… May ll, 1976)"), is not its own
    if (REVISED.test(before) || /^\s?\)/.test(head.slice(at + m[0].length, at + m[0].length + 2))) return null;
    return month && yy === year && dd >= 1 && dd <= 31 ? { day: iso(yy, month, dd), end: at + m[0].length } : null;
  };
  // the day beside the release line or the talk paper's number first, the OCR's letters for figures read there
  for (const r of head.matchAll(RELEASE_LINE)) {
    const from = r.index! + r[0].length;
    for (const m of head.slice(from, from + 80).matchAll(SPELLED_OCR)) {
      // only a writer's name between, never prose ("T77-28, dated June 17, 1977, on the status of …")
      if (/(?:^|[\s,(])[a-z]{2,}/.test(head.slice(from, from + m.index!))) break;
      const hit = spelled(m, from + m.index!);
      if (hit) return hit;
    }
  }
  for (const m of head.matchAll(SPELLED)) {
    const hit = spelled(m, m.index!);
    if (hit) return hit;
  }
  for (const m of head.matchAll(FIGURES)) {
    const month = Number(m[1]);
    const dd = Number(m[2]);
    const yy = m[3].length === 4 ? Number(m[3]) : Number(m[3]) > 20 ? 1900 + Number(m[3]) : 2000 + Number(m[3]);
    if (yy === year && month >= 1 && month <= 12 && dd >= 1 && dd <= 31) return { day: iso(yy, month, dd), end: m.index! + m[0].length };
  }
  return null;
}

/** A document's day, from its head (`headDate`). */
export const documentDay = (year: number, text: string): string | null => headDate(year, text)?.day ?? null;

/** openFDA's file read: every document with its year, kind, text and the day its head gives. */
export function readHistoricalDocuments(zip: Uint8Array): { documents: FdaHistoricalDocument[]; lastUpdated: string | null } {
  const entry = zipEntryNames(zip).find((n) => n.endsWith(".json"));
  if (!entry) throw new Error("no JSON in the zip");
  const body = JSON.parse(decodeText(readZip(zip, [entry]).get(entry)!)) as { meta?: { last_updated?: string }; results: { year: string | number; doc_type: string; text: string }[] };
  const documents = body.results.map((r) => {
    const year = Number(r.year);
    const text = r.text ?? "";
    const id = createHash("sha1").update(`${year}\u0000${r.doc_type}\u0000${text}`).digest("hex").slice(0, 16);
    return { id, year, type: String(r.doc_type ?? ""), day: Number.isInteger(year) ? documentDay(year, text) : null, text };
  });
  return { documents, lastUpdated: body.meta?.last_updated ?? null };
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
/** Legal words a company's name stands before in prose. */
const LEGAL = String.raw`(?:,?\s+(?:Inc|Incorporated|Co|Corp|Corporation|Company|Companies|Laboratories|Labs|Ltd|Limited|plc|PLC|AG|N\.\s?V|S\.\s?A|LLC|L\.P|Pharmaceuticals?|Products))+\.?`;
const SMALL = /^(?:and|of|the|for|de|du|la)$/i;
/** Capitalised words a company's name may follow in prose without being part of another name. */
const LEADS = /^(?:The|A|An|By|From|And|With|For|Of|To|In|On|At|As|That|Its|Their|Firm|FDA|Today|Also|Both|Manufacturer|Maker|Sponsor|Applicant|Regarding|Division|Inc|Corp|Ltd|Co)\.?$/;
/** A word a name may follow anyway: a town's "-based" ("Indianapolis-based Eli Lilly and Co.") */
const BASED = /-?based$/i;

/**
 * The company's party in a document's prose, by its names of the year: a name with a legal word after it, or a
 * whole name of two words or more each printed capitalised, as a company's name is printed ("Procter & Gamble"),
 * through the caption rule's guards; null where none is.
 */
export function proseParty(text: string, names: readonly string[]): { party: string; at: number } | null {
  const flat = text.replace(/\s+/g, " ");
  for (const name of [...new Set(names.flatMap(andSpellings))]) {
    if (name.replace(/[^A-Za-z]/g, "").length < 5) continue;
    const multi = /\s|&|-/.test(name.trim());
    const re = new RegExp(String.raw`(?<![A-Za-z])(${esc(name.trim())}(${LEGAL})?)(?![A-Za-z])`, "gi");
    for (const m of flat.matchAll(re)) {
      // a one-word name only with a legal word after it
      if (!m[2] && !multi) continue;
      const words = m[1].replace(m[2] ?? "", "").trim().split(/[\s-]+/).filter((w) => /^[A-Za-z]/.test(w) && !SMALL.test(w));
      if (!words.every((w) => /^[A-Z]/.test(w))) continue;
      // a name after a capitalised word is the end of another firm's ("Marion Merrell Dow Inc.", "Hoechst Celanese
      // Corp.", "Dow Corning Corporation"), unless that word begins a sentence or is a word a name follows
      // or a word a name follows (`LEADS`, `BASED`), or a headline's last word in capitals before a name that is not
      // ("HUMAN INSULIN Eli Lilly and Company yesterday announced")
      const before = flat.slice(Math.max(0, m.index! - 40), m.index!).match(/([A-Za-z][\w&'.-]*)\s*$/)?.[1];
      const headline = !!before && /^[A-Z]{3,}$/.test(before) && /[a-z]/.test(m[1]);
      if (before && /^[A-Z]/.test(before) && !LEADS.test(before) && !BASED.test(before) && !headline && !/[.!?:;]\s*$/.test(flat.slice(Math.max(0, m.index! - 3), m.index!))) continue;
      const party = captionParty(m[1], names);
      if (party) return { party, at: m.index! };
    }
  }
  return null;
}

/** Words a full stop never ends a sentence after: titles, months, initials. */
const NEVER_ENDS = /(?:^|[\s(])(?:Dr|Mr|Mrs|Ms|St|No|Nos|vs|Jan|Feb|Mar|Apr|Aug|Sept|Sep|Oct|Nov|Dec|U\.S|U\.K|[A-Z])$/;
/** Words a full stop ends a sentence after only before a capitalised word that is not a legal word: legal words, states, degrees. */
const MAY_END = /(?:^|[\s(])(?:Inc|Co|Corp|Ltd|Bros|Mfg|Div|Dept|Jr|Sr|Ph\.D|M\.D|Ala|Ariz|Ark|Calif|Colo|Conn|Del|Fla|Ga|Ill|Ind|Kan|Ky|La|Md|Mass|Mich|Minn|Miss|Mo|Mont|Neb|Nev|N\.[A-Z]|Okla|Ore|Pa|Penn|Tenn|Tex|Va|Vt|Wash|Wis|Wyo)$/;
/** Where a sentence ends at a full stop and a space: not after a title or an initial, and after a legal word only before a new sentence. */
function endsSentence(flat: string, dot: number): boolean {
  const before = flat.slice(Math.max(0, dot - 12), dot);
  if (NEVER_ENDS.test(before)) return false;
  if (MAY_END.test(before)) return /^ [A-Z]/.test(flat.slice(dot + 1, dot + 3)) && !/^ (?:Inc|Ltd|Corp|Co|LLC|L\.P)\b/.test(flat.slice(dot + 1, dot + 8));
  return true;
}
const PHONE = /(?:\(?\s*(?:Home|Office)\s*\)?\s*[-—–]*\s*)?\(\s*[\dlO]{3,4}\s*\)?\s*[-—–]*\s*[\dlO]{3}\s*[-—–]+\s*[\dlO]{4}/g;
/** What a sentence taken from a head may begin with that is not the document's prose: a talk paper's number, writer and day, or a day's year. */
const HEAD_LEFTOVER = new RegExp(String.raw`^(?:T\d\d-\d+\b.{0,60}?${SPELLED.source}|(?:19|20)\d\d\b)[\s~.,;:—–-]*`, "i");

/**
 * The sentence a position falls in, its spacing tidied: the document's own words, as the OCR gives them, at most
 * 250 characters before the position and 400 in all.
 */
export function sentenceAt(text: string, at: number): string {
  const flat = text.replace(/\s+/g, " ");
  let start = 0;
  for (let i = at - 1; i > 0; i--) if (/[.!?]/.test(flat[i - 1]) && flat[i] === " " && (flat[i - 1] !== "." || endsSentence(flat, i - 1))) { start = i + 1; break; }
  let end = flat.length;
  for (let i = at; i < flat.length - 1; i++) if (/[.!?]/.test(flat[i]) && flat[i + 1] === " " && (flat[i] !== "." || endsSentence(flat, i))) { end = i + 1; break; }
  const cut = at - start > 250;
  if (cut) start = flat.indexOf(" ", at - 250) + 1;
  const out = flat.slice(start, Math.min(end, start + (cut ? 399 : 400))).replace(PHONE, " ").replace(/\s+/g, " ").trim().replace(HEAD_LEFTOVER, "");
  // a sentence that begins in a talk paper's heading begins after its day, where the heading holds no prose word
  // ("Rockville, Maryland 20852 T75-75 Michael Shaffer November 5, l975 GENERAL ELECTRIC MICROWAVE OVENS …", batch 170)
  const day = new RegExp(SPELLED_OCR.source, "i").exec(out);
  const rest = day ? out.slice(day.index + day[0].length).replace(/^[\s(~.,;:—–-]*(?:[\dlO][\dlO'\-—–)~]*\s+)?/, "") : "";
  // …and its title in capitals after the day, as every talk paper prints one
  if (day && day.index < 200 && !/(?:^|[\s,(])[a-z]{2,}/.test(out.slice(0, day.index)) && /^[A-Z][A-Z'.&-]{2,}\b/.test(rest) && at - start > day.index + day[0].length) return `…${rest}`;
  return cut ? `…${out}` : out;
}

/** The note every talk paper of the 1970s and 1980s opens with, the agency's letterhead and its telephone numbers. */
const FURNITURE = [
  /Talk\s*Papers?\s*(?:are|is)\s*prepared[\s\S]{0,700}?(?:upon\s+request|releasable)\.?/gi,
  /(?:F\s*D\s*A\s*)?FOOD AND DRUG ADMINISTRATION\s*Public Health Service\s*5600 Fishers Lane\s*Rockville,?\s*(?:Maryland|MD)\.?\s*20857/gi,
  PHONE,
];

/**
 * A document's lead: its text after the day its head gives, where the release line, the talk paper's number and
 * its writer end, the talk paper's note, the letterhead and the telephone numbers left off; from the release line
 * where the head gives no day of the document's year.
 */
export function leadOf(text: string, year?: number): string {
  let flat = text.replace(/\s+/g, " ");
  for (const re of FURNITURE) flat = flat.replace(re, " ");
  flat = flat.replace(/\s+/g, " ");
  const dated = year ? headDate(year, flat) : null;
  if (dated) return flat.slice(dated.end).replace(/^[\s~.,;:—–-]+/, "").slice(0, 600).trim();
  const after = flat.search(/FOR IMMEDIATE RELEASE|FOR RELEASE|TALK PAPER/i);
  const from = after >= 0 ? after : 0;
  const body = flat.slice(from).replace(/^(?:FOR (?:IMMEDIATE )?RELEASE|TALK PAPER)[^.]*?\b(?:19|20)\d\d\b\.?;?\s*/i, "");
  return body.slice(0, 600).trim();
}

/** A kept document, as the committed file holds it: the companies it names, each with its party and its sentence. */
export interface FdaKept {
  id: string;
  year: number;
  type: string;
  day: string;
  lead: string;
  named: { cik: number; party: string; sentence: string }[];
}

/** Whether a document names the company on its day: the prose rule under its names, never a name its record took later. */
export function namedBy(doc: Pick<FdaHistoricalDocument, "text" | "day">, cik: number, names: readonly string[]): { party: string; sentence: string } | null {
  const hit = proseParty(doc.text, names);
  if (!hit || !doc.day || takenBefore(cik, doc.day, hit.party)) return null;
  return { party: hit.party, sentence: sentenceAt(doc.text, hit.at) };
}

let cached: { path: string; docs: FdaKept[] } | null = null;

/** Every kept document in the committed file, read once a process. */
export function fdaHistory(path = FDA_HISTORY_DATA): readonly FdaKept[] {
  if (cached?.path === path) return cached.docs;
  const body = JSON.parse(gunzipSync(readFileSync(path)).toString("utf8")) as { documents: FdaKept[] };
  cached = { path, docs: body.documents };
  return body.documents;
}

/** A document naming more than this many listed companies names none: a list of firms is no company's news. */
export const MOST_COMPANIES = 2;

/**
 * The rows read by hand that are not the company's, by document and CIK (batch 169): a namesake, a person's
 * employer, a newspaper quoted, a table or list of firms with no FDA action on the company's own product. A list
 * that reports such an action, the first generic makers of a drug or the season's flu vaccines approved, is kept
 * for each maker it names; the rule's two-company limit and the guard against another firm's name take the rest.
 */
export const REFUSED: Readonly<Record<string, { ticker: string; why: string }>> = {
  // batch 170: dated since the head's day is read beside its talk paper's number
  "1b1aa23ca032f829:78003": { ticker: "PFE", why: "1988-02-12: a table of AIDS drugs in development, one of many sponsors" },
  "1b1aa23ca032f829:1666700": { ticker: "DD", why: "1988-02-12: a table of AIDS drugs in development, one of many sponsors" },
  "bce193e7be05c042:1800": { ticker: "ABT", why: "1969-11-14: the company's lawyer named among a hearing's participants; no FDA action on its products" },
  "f5bc51544474a041:1800": { ticker: "ABT", why: "1973-01-19: a court case citation in a rule's text; no FDA action on its products" },
  "32bbf8efcda484d0:1800": { ticker: "ABT", why: "1989-12-01: a staff appointment naming the official's former employer" },
  "72c0637dd4063dad:1800": { ticker: "ABT", why: "2007-05-01: a passing mention of another firm's drug; no FDA action on its products" },
  "7087892a4f728c9a:8670": { ticker: "ADP", why: "1985-10-25: \"Automatic Data Processing\" as a common term, not the company" },
  "dfc6827ccb67e342:318154": { ticker: "AMGN", why: "1994-01-07: a table of drugs in development, one of many sponsors" },
  "6e05fc7a54188cb5:318154": { ticker: "AMGN", why: "1994-08-29: a table of drugs in development, one of many sponsors" },
  "14253fa3d32a33e7:313927": { ticker: "CHD", why: "1971-06-29: a list of detergents and their phosphate content, one brand of many" },
  "14253fa3d32a33e7:21665": { ticker: "CL", why: "1971-06-29: a list of detergents and their phosphate content, one brand of many" },
  "eda9e70d24e8dc0b:1744489": { ticker: "DIS", why: "1994-10-15: a passing mention of a film; no FDA action on the company" },
  "5e028c2f78d4981f:719402": { ticker: "FXNC", why: "1963-10-20: \"First National\" a congress's name, not the bank" },
  "b7d44590d8b9dc8d:719402": { ticker: "FXNC", why: "1965-02-08: \"First National\" the grocery chain First National Stores, not the bank" },
  "ea1f13c74670c58c:719402": { ticker: "FXNC", why: "1974-11-26: \"First National\" the grocery chain First National Stores, not the bank" },
  "88ed770b24bd1bdc:40533": { ticker: "GD", why: "1967-11-10: a speaker's affiliation; no FDA action on the company's products" },
  "43f3ae6251949546:40545": { ticker: "GE", why: "1967-04-29: a speaker's affiliation; no FDA action on the company's products" },
  "b3d7979a66d0d183:932021": { ticker: "GTLL", why: "2012-04-27: Global Technologies, LLC, a supplement seller sent a warning letter, a namesake of the company" },
  "b07b990c2515ce91:1000228": { ticker: "HSIC", why: "1967-07-01: a list of drug products and their distributors, one of many" },
  "e923241fb016e139:811641": { ticker: "ICCC", why: "1992-01-05: a table of drugs in development, one of many sponsors" },
  "1ebe7c767109ce6c:312257": { ticker: "IVFH", why: "2008-09-30: \"Innovative Food\" a program's name, not the company" },
  "2fa19506a431eb11:312257": { ticker: "IVFH", why: "2009-06-02: \"Innovative Food\" a program's name, not the company" },
  "f9cff7949a5e720f:312257": { ticker: "IVFH", why: "2009-10-09: \"Innovative Food\" a program's name, not the company" },
  "deaa6141e3f3d7c7:312257": { ticker: "IVFH", why: "2010-10-27: \"Innovative Food\" a program's name, not the company" },
  "56d65c702a4f5bd3:200406": { ticker: "JNJ", why: "1968-11-30: a person's affiliation; no FDA action on the company's products" },
  "073b750bf7f5f78b:200406": { ticker: "JNJ", why: "1987-12-10: a list of antibiotic makers, one of many" },
  "404618c5c921850f:200406": { ticker: "JNJ", why: "1988-10-25: a doctor's affiliation; no FDA action on the company's products" },
  "8927363a404bc96e:200406": { ticker: "JNJ", why: "1992-01-15: a table of drugs in development, one of many sponsors" },
  "bce193e7be05c042:21344": { ticker: "KO", why: "1969-11-14: a person's affiliation among a hearing's participants" },
  "bace1895faf4b5a6:59478": { ticker: "LLY", why: "1968-04-11: a passing mention of an imprint; no FDA action on the company's products" },
  "442e747988e4ee05:59478": { ticker: "LLY", why: "1969-06-16: a table of sulfonamide drugs and their makers, one of many" },
  "90d23d4631cb0b73:59478": { ticker: "LLY", why: "2003-12-12: an official's biography naming a former employer" },
  "0e23ab9035c83925:59478": { ticker: "LLY", why: "2007-06-08: an advisory committee's membership naming an employer" },
  "65adabcccd730639:1438472": { ticker: "MIAX", why: "2005-12-16: \"Miami International\" another firm's name, not the company" },
  "442e747988e4ee05:310158": { ticker: "MRK", why: "1969-06-16: a table of sulfonamide drugs and their makers, one of many" },
  "1c5fa4582afd5188:310158": { ticker: "MRK", why: "1986-02-13: a list of firms and institutions, one of many" },
  "03f5b73b0eaf5e10:310158": { ticker: "MRK", why: "1988-01-07: a table of the year's approvals, one of many sponsors" },
  "3dacf3a0722eaeb0:310158": { ticker: "MRK", why: "1993-11-23: a list of people naming the company's chief executive" },
  "6e05fc7a54188cb5:310158": { ticker: "MRK", why: "1994-08-29: a table of drugs in development, one of many sponsors" },
  "3d3f6df02315809f:310158": { ticker: "MRK", why: "2006-03-16: a consortium's membership list, no FDA action on the company" },
  "ebb4f342b8651363:71691": { ticker: "NYT", why: "1982-12-01: the newspaper quoted as a source, not news of the company" },
  "59906e896bd648df:71691": { ticker: "NYT", why: "1983-03-22: the newspaper quoted as a source, not news of the company" },
  "6091bf0b061a6b1f:71691": { ticker: "NYT", why: "1995-08-10: the newspaper quoted as a source, not news of the company" },
  "66b282c0d4613bc1:1821825": { ticker: "OGN", why: "1977-12-28: Akzo Nobel's Organon unit of the time, not this record's company, Merck's spin-off of 2021" },
  "d13e0ca132231ea6:1821825": { ticker: "OGN", why: "1986-05-28: Akzo Nobel's Organon unit of the time, not this record's company, Merck's spin-off of 2021" },
  "473c5dccb9d0bdcf:1821825": { ticker: "OGN", why: "1995-02-24: Akzo Nobel's Organon unit of the time, not this record's company, Merck's spin-off of 2021" },
  "83ef0b0346e8fa05:1821825": { ticker: "OGN", why: "1997-12-15: Akzo Nobel's Organon unit of the time, not this record's company, Merck's spin-off of 2021" },
  "ec235876c0c4bb7b:812074": { ticker: "OI", why: "1970-12-07: a person's affiliation; no FDA action on the company's products" },
  "7fb791773663c39f:78003": { ticker: "PFE", why: "1989-04-27: a table of AIDS drugs in development, one of many sponsors" },
  "eb4601dcc8d91a24:78003": { ticker: "PFE", why: "1990-01-19: a table of AIDS drugs in development, one of many sponsors" },
  "c319842036245b94:78003": { ticker: "PFE", why: "1992-10-19: a table of AIDS drugs in development, one of many sponsors" },
  "3d3f6df02315809f:78003": { ticker: "PFE", why: "2006-03-16: a consortium's membership list, no FDA action on the company" },
  "3e82c20e809a3792:80424": { ticker: "PG", why: "1972-06-29: a list of detergents and their phosphate content, one brand of many" },
  "b0906ebf7d097d5b:80424": { ticker: "PG", why: "1985-01-11: a foundation's member list, no FDA action on the company" },
  "f0b947307751bd99:80424": { ticker: "PG", why: "1985-11-19: a foundation's member list, no FDA action on the company" },
  "7276ba2bb9a0f4cd:79879": { ticker: "PPG", why: "1970-04-03: a list of people and their employers at a hearing" },
  "56c0a44b3870e72c:79879": { ticker: "PPG", why: "1970-11-17: a list of people and their employers at a hearing" },
  "b8efac6057b622f6:1903508": { ticker: "PPHC", why: "1985-05-16: \"Public Policy\" a common term, not the company" },
  "a525976af90fd615:1903508": { ticker: "PPHC", why: "2011-12-16: \"Public Policy\" a common term, not the company" },
  "c4e39071e04e3c40:1046568": { ticker: "PRDO", why: "1970-04-07: \"Career Education\" a common term, not the company" },
  "2949f22d567cb6b0:1121404": { ticker: "SNY", why: "2005-10-17: a supply update listing the season's distributors, no FDA action on the company's vaccine" },
  "9481126fc07ec0b2:1579684": { ticker: "TDAY", why: "2000-11-30: USA Today quoted as a source, not news of the company" },
  "1f8ebb3fb7f60c7f:1090727": { ticker: "UPS", why: "1978-03-02: a passing mention of a delivery; no FDA action on the company" },
  "0c9ae0013a04bafb:1090727": { ticker: "UPS", why: "1983-05-16: a passing mention of a delivery; no FDA action on the company" },
  "7859218ba29c3bad:717720": { ticker: "VALU", why: "1987-01-16: \"Value Line\" a brand of canned goods, not the company" },
};

/**
 * The rows the rule refuses that the hand read keeps (batch 169): a name a table or a heading runs into, by document
 * and CIK, with the party as the document prints it and the sentence of the document's that says what the FDA did,
 * quoted as the OCR text gives it, for the row's title.
 */
export const NAMED_BY_HAND: Readonly<Record<string, { ticker: string; party: string; quote: string; why: string }>> = {
  "85a96fe6db186104:46080": {
    ticker: "HAS",
    party: "Hasbro Industries",
    quote: "HEw's Food and Drug Administration today banned certain toys with mechanical hazards and proposed a repurchase or adjustment plan for consumers affected by such actions.",
    why: "1970-12-19: the toys the FDA banned, Hasbro Industries' Kooky Eyes squeeze toy among them, in a table after another firm's town",
  },
  "cd8f0362f5a38050:59478": {
    ticker: "LLY",
    party: "Eli Lilly and Company",
    quote: "The Food and Drug Administration today announced it will move to revoke the licenses of eight skin tests used to detect a variety of medical conditions.",
    why: "1977-09-29: the skin tests whose licences the FDA moved to revoke, Lilly's among them, in a table after \"Lederle Laboratories\"",
  },
  "c3f0bdc573935fa8:78003": {
    ticker: "PFE",
    party: "Pfizer Inc.",
    quote: "Pfizer Inc. today announced the voluntary withdrawal from the U.S. market of the drug Mylotarg (gemtuzumab ozogamicin) for patients with acute myeloid leukemia (AML), a bone marrow cancer.",
    why: "2010-06-21: Mylotarg's withdrawal at the FDA's request, its heading running into \"Pfizer Inc. today announced\"",
  },
};

/** A row kept by hand (`NAMED_BY_HAND`): its party and quoted sentence, where the document prints both. */
export function namedByHand(doc: Pick<FdaHistoricalDocument, "id" | "text" | "day">, cik: number): { party: string; sentence: string } | null {
  const kept = NAMED_BY_HAND[`${doc.id}:${cik}`];
  if (!kept || !doc.day) return null;
  const flat = doc.text.replace(/\s+/g, " ");
  return flat.includes(kept.party) && flat.includes(kept.quote) ? { party: kept.party, sentence: kept.quote } : null;
}

/** The company's documents: those naming it and at most one other listed company, not refused by hand. */
export function companyDocuments(docs: readonly FdaKept[], cik: number | string): { doc: FdaKept; party: string; sentence: string }[] {
  const tag = Number(cik);
  return docs.flatMap((doc) => {
    if (doc.named.length > MOST_COMPANIES) return [];
    const n = doc.named.find((x) => x.cik === tag);
    if (!n || REFUSED[`${doc.id}:${tag}`]) return [];
    return [{ doc, party: n.party, sentence: n.sentence }];
  });
}

const LIMIT = 900;
const kind = (t: string) => (/talk/i.test(t) ? "talk paper" : "press release");

/**
 * The company's documents as timeline events, newest first, from `from`, its first price: one row a day, its
 * title the document's own sentence naming the company, a document about one of its approvals that day left to that
 * approval's row, which carries its words instead (`joined`, from `releaseFor`, the owner's call).
 */
export function fdaHistoryEvents(docs: readonly FdaKept[], { cik, from = "", joined = new Set<string>() }: { cik: number | string; from?: string; joined?: ReadonlySet<string> }): TimelineEvent[] {
  const tag = Number(cik);
  const byDay = new Map<string, { doc: FdaKept; sentence: string }[]>();
  for (const x of companyDocuments(docs, tag)) {
    if (x.doc.day < from || joined.has(x.doc.id)) continue;
    (byDay.get(x.doc.day) ?? byDay.set(x.doc.day, []).get(x.doc.day)!).push(x);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, found]) => {
      const one = found[0];
      const title = `FDA ${kind(one.doc.type)}: ${one.sentence}`;
      const text =
        `The FDA's own ${kind(one.doc.type)}${found.length > 1 ? ` and ${found.length - 1} more that day` : ""}, as its OCR text reads: ${one.doc.lead}` +
        `${found.length > 1 ? ` ${found.slice(1).map((x) => `The ${kind(x.doc.type)}: ${x.sentence}`).join(" ")}` : ""}` +
        (/talk/i.test(one.doc.type) ? " A talk paper was written for FDA staff answering questions, not for release." : "");
      return {
        id: `fda-history-${tag}-${day}`,
        date: day,
        type: "regulation" as const,
        title: title.length <= 300 ? title : `${title.slice(0, 299).replace(/\s+\S*$/, "")}…`,
        description: text.length <= LIMIT ? text : `${text.slice(0, LIMIT - 1).replace(/\s+\S*$/, "")}…`,
        source: "FDA",
        url: FDA_HISTORY_PAGE,
        sourceKey: "fda_history" as const,
        externalId: found.map((x) => x.doc.id).join(","),
        dedupBasis: `fda-history:${tag}@${day}`,
      };
    });
}

/** A release of the company's on a day, for the approvals' rows (`releaseFor`). */
export interface DayRelease {
  id: string;
  kind: string;
  sentence: string;
  lead: string;
}

/** The company's releases by day, every one of a day kept, in the file's order. */
export function releasesByDay(docs: readonly FdaKept[], cik: number | string): Map<string, DayRelease[]> {
  const out = new Map<string, DayRelease[]>();
  for (const x of companyDocuments(docs, cik)) {
    (out.get(x.doc.day) ?? out.set(x.doc.day, []).get(x.doc.day)!).push({ id: x.doc.id, kind: kind(x.doc.type), sentence: x.sentence, lead: x.doc.lead });
  }
  return out;
}

/** The words of a drug a release must hold to be about it: its trade name, and each word of five letters or more of its ingredient. */
const drugWords = (a: { name: string; ingredient: string }) =>
  [a.name, ...a.ingredient.split(/[^A-Za-z]+/)].map((w) => w.trim().toLowerCase()).filter((w) => w.replace(/[^a-z]/g, "").length >= 5);

/**
 * The release of an approval's day that is about it: one whose sentence or lead names its drug, by trade name or
 * ingredient (batch 170, the audit's finding 5: Lilly's Forteo paper of 2002-11-26 is not Strattera's, nor Merck's
 * trientine release of 1985-11-26 Primaxin's). None where no release that day names it.
 */
export function releaseFor(a: { day: string; name: string; ingredient: string }, releases: ReadonlyMap<string, readonly DayRelease[]>): DayRelease | undefined {
  const words = drugWords(a);
  return (releases.get(a.day) ?? []).find((r) => {
    const text = `${r.sentence} ${r.lead}`.toLowerCase();
    return words.some((w) => text.includes(w));
  });
}

/** The words a release about an approval adds to that approval's row (the owner's call): the sentence naming the company. */
export const releaseWords = (r: DayRelease) => `The FDA's ${r.kind} that day: "${r.sentence}"`;

/** The documents that are about one of the company's approvals that day, left to the approval's row (`releaseFor`). */
export function joinedReleases(approvals: readonly { day: string; name: string; ingredient: string }[], releases: ReadonlyMap<string, readonly DayRelease[]>): Set<string> {
  return new Set(approvals.flatMap((a) => releaseFor(a, releases)?.id ?? []));
}
