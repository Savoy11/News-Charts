import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { partyIsCompany } from "./hsrEarly";
import { eeocUnitNamesOn } from "./eeoc";
import { NLRB_UNITS } from "./nlrbDecisions";
import { RAIL_OWNERS } from "./railAccidents";
import { TAA_UNITS } from "./taaPetitions";
import { takenBefore } from "./takenNames";
import type { TimelineEvent } from "./types";

/**
 * The Supreme Court's decisions in the company's own cases, 1962 on (batch 176; the 2026-11-22c proposal 1, approved
 * by the owner that day with call (a): the U.S. Reports to volume 586 and the Court's slip-opinion lists from the 2018
 * term, every decision in which the company is a named party, per curiam dispositions and in-chambers opinions
 * included, each on its decided day).
 *
 * The U.S. Reports are the Government Publishing Office's collection on govinfo (`USREPORTS`): each volume's record
 * (`/metadata/pkg/USREPORTS-<n>/mods.xml`) lists its cases, each with its title ("Comcast Corp. v. Behrend, 569 U.S.
 * 27 (2013)"), its PDF and, for most argued cases, the Supreme Court Database's fields: the decision's day, its kind
 * and the Court's disposition. A case the record gives no day, most of the older volumes' per curiam dispositions and
 * every case of volumes 585 and 586, has its PDF read once for the day and the disposition its first page prints
 * (`caseHead`). After the bound volumes, the Court's own slip-opinion list of each term from 2018
 * (`supremecourt.gov/opinions/slipopinion/<yy>`) gives each opinion's day, docket number, name and PDF; a candidate's
 * PDF gives its disposition. `npm run sync:supreme-court` commits all of it (`data/supreme-court.json.gz`); ingest
 * asks nothing.
 *
 * A party is the company's by the merger notices' rule (`partyIsCompany`) on each side of the caption, read as the
 * Reports abbreviate it ("Pacific Gas & Elec. Co.", "Union Pacific R. Co.", `expandAbbreviations`) and as printed,
 * under the company's names of the year, the release map's and EPA's and the CPSC's units on their days and the taken
 * names, from its first price; and only with a legal word or a name of two words or more (`corporateParty`), as a
 * caption names persons by their surnames alone ("Parker Seal Co. v. Cummins", "Pearson v. Dodd", "Vale v.
 * Louisiana"). The namesakes read by hand are refused in `NOT_THE_COMPANY`; a company a caption names by one word and
 * no legal form ("FCC v. AT&T") is given its case by hand in `NAMED_BY_HAND`. One row a company a day; the row says the
 * Court's disposition and the company's side, never a summary of the holding.
 */

export const SUPREME_COURT_DATA = join(__dirname, "..", "data", "supreme-court.json.gz");
export const GOVINFO = "https://www.govinfo.gov";
export const volumeRecord = (volume: number) => `${GOVINFO}/metadata/pkg/USREPORTS-${volume}/mods.xml`;
export const slipList = (term: number) => `https://www.supremecourt.gov/opinions/slipopinion/${String(term).padStart(2, "0")}`;
/** The first and last volumes read: the first prices begin in 1962 (volume 368's cases), and govinfo's newest is 586. */
export const FIRST_VOLUME = 368;
export const LAST_VOLUME = 586;
/** The first term the Court's own lists are read for: the bound volumes end with the 2017 term's (volume 585). */
export const FIRST_SLIP_TERM = 18;

export interface ScCase {
  /** govinfo's granule id ("USREPORTS-569-27"), or "slip-<term>-<docket>" */
  id: string;
  /** "569 U.S. 27", or null for a slip opinion not yet given a page */
  cite: string | null;
  /** the case's name as printed, without its citation: "Comcast Corp. v. Behrend" */
  title: string;
  day: string | null;
  disposition: string | null;
  /** the decision's kind: "Opinion of the court (orally argued)", "Per curiam (no oral argument)", "In-chambers opinion" */
  kind: string | null;
  /** how the case came to the Court: "Cert", "Appeal", "Original", "Certification" */
  jurisdiction: string | null;
  docket: string | null;
  /** the PDF of the case, whole */
  pdf: string;
  /** the record that gives the case: the U.S. Reports' or the Court's slip list */
  from: "reports" | "slip";
  /** where its day and disposition come from: the volume's record, its PDF, or the slip list (`null`: not read) */
  read: "record" | "pdf" | "slip" | null;
}

/** The committed file's columns, a row a case. */
export const CASE_COLUMNS = ["id", "cite", "title", "day", "disposition", "kind", "jurisdiction", "docket", "pdf", "from", "read"] as const;

const ENTITY: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", nbsp: " " };
const unescape = (x: string) =>
  x
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e: string) => {
      if (ENTITY[e]) return ENTITY[e];
      if (/^#x/i.test(e)) return String.fromCodePoint(parseInt(e.slice(2), 16));
      if (/^#\d/.test(e)) return String.fromCodePoint(Number(e.slice(1)));
      return m;
    })
    .replace(/\s+/g, " ")
    .trim();
const field = (block: string, tag: string) => {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(block);
  return m ? unescape(m[1]) : null;
};

/** A case's name without its citation: "Comcast Corp. v. Behrend, 569 U.S. 27 (2013)" → "Comcast Corp. v. Behrend". */
export const caseName = (title: string) => title.replace(/,\s*\d+\s+U\.\s?S\.\s+\d+\s*(?:\(\d{4}\))?\s*$/, "").trim();

/** Every case a volume's record lists, front and back matter left out. */
export function volumeCases(xml: string, volume: number): ScCase[] {
  const out: ScCase[] = [];
  const starts = [...xml.matchAll(/<relatedItem type="constituent" ID="id-(USREPORTS-\d+-[^"]+)"/g)];
  starts.forEach((m, i) => {
    const block = xml.slice(m.index, i + 1 < starts.length ? starts[i + 1].index : xml.length);
    if (field(block, "partName") !== "Case") return;
    const title = field(block, "title") ?? "";
    const pdf = /<url access="raw object" displayLabel="PDF rendition">([^<]+)<\/url>/.exec(block)?.[1] ?? /type="otherFormat" xlink:href="([^"]+\.pdf)"/.exec(block)?.[1] ?? "";
    const cite = field(block, "usCitation") ?? field(block, "partNumber");
    const day = field(block, "decisionDate");
    out.push({
      id: m[1],
      cite: cite ? cite.replace(/\s+/g, " ") : null,
      title: caseName(title),
      day: day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null,
      disposition: field(block, "disposition"),
      kind: field(block, "decisionType"),
      jurisdiction: field(block, "jurisdiction"),
      docket: null,
      pdf: pdf.replace(/^http:/, "https:"),
      from: "reports",
      read: day ? "record" : null,
    });
    void volume;
  });
  return out;
}

const COURT = "https://www.supremecourt.gov";

/** Every opinion a term's slip list gives: its day, docket number, name, PDF and the U.S. Reports page once given one. */
export function slipCases(html: string, term: number): ScCase[] {
  const out: ScCase[] = [];
  const row = /<tr>\s*<td[^>]*>(\d+)<\/td>\s*<td[^>]*>(\d{1,2})\/(\d{1,2})\/(\d{2})<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td><a href='([^']+)'[^>]*>([\s\S]*?)<\/a><\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/g;
  for (const m of html.matchAll(row)) {
    const docket = unescape(m[5].replace(/<[^>]+>/g, ""));
    const cite = unescape(m[9].replace(/<[^>]+>/g, ""));
    const author = unescape(m[8].replace(/<[^>]+>/g, ""));
    out.push({
      id: `slip-${term}-${docket.replace(/[^\w.-]+/g, "")}`,
      cite: /^\d+\s+U\.\s?S\.\s+\d+$/.test(cite) ? cite.replace(/\s+/g, " ") : null,
      title: unescape(m[7].replace(/<[^>]+>/g, "")),
      day: `20${m[4]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`,
      disposition: null,
      kind: author === "PC" ? "Per curiam" : /^D$/.test(author) ? "Decree" : "Opinion of the Court",
      jurisdiction: /A\d/.test(docket) ? "Application" : /Orig/.test(docket) ? "Original" : null,
      docket,
      pdf: new URL(m[6], COURT).toString(),
      from: "slip",
      read: "slip",
    });
  }
  return out;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** A day the PDF prints, "October 23, 1967", read through the OCR's spaces and full stops and its letters for figures ("June IO, 1963"). */
function dayIn(text: string): string | null {
  const figures = (x: string) => x.replace(/[Il|]/g, "1").replace(/[Oo]/g, "0");
  const raw = /^([A-Z][a-z]+)\.?\s+([\dIlOo|]{1,2})\s*,\s*\*?\s*([\dIlOo|]{4})/.exec(text.trim());
  const m = raw ? [raw[0], raw[1], figures(raw[2]), figures(raw[3])] : null;
  if (!m || !/^\d+$/.test(m[2]) || !/^\d{4}$/.test(m[3])) return null;
  const month = MONTHS.findIndex((x) => x.startsWith(m[1].toLowerCase().slice(0, 3)));
  if (month < 0) return null;
  const d = new Date(Date.UTC(Number(m[3]), month, Number(m[2])));
  if (d.getUTCMonth() !== month) return null;
  return d.toISOString().slice(0, 10);
}

/** The words of a disposition the scans break with a stray space ("Judgme nt vacated and case reman ded"), closed up. */
const BROKEN = ["Judgments", "Judgment", "vacated", "remanded", "affirmed", "reversed", "dismissed", "denied", "granted", "Certiorari", "certiorari", "Appeals", "Appeal", "Rehearing", "Petition", "Motion"].map(
  (w) => [new RegExp(`\\b${w.split("").join("\\s?")}\\b`, "g"), w] as const,
);
const closeWords = (line: string) => BROKEN.reduce((l, [re, w]) => l.replace(re, w), line);

/** A disposition as the Court prints it: "Vacated and remanded.", "348 F. 2d 34, affirmed.", "Reversed." */
const DISPOSITION = /\b(affirm(?:ed)?|revers(?:ed)?|vacat(?:ed)?|remand(?:ed)?|dismiss(?:ed)?|modif(?:ied)?|denied|granted|stay(?:ed)?)\b/i;

/** A disposition's words, its leading citation off and its first letter capital: "348 F. 2d 34, affirmed." → "Affirmed". */
function dispositionOf(line: string): string | null {
  // the decision below's report, and a second case's number in a consolidated line, are not the disposition
  const s = line
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.?\s*Reported below:.*$/i, "")
    .replace(/;\s*(?:and\s+)?No\b.*$/i, "")
    .replace(/\.$/, "");
  if (!DISPOSITION.test(s) || s.length > 160) return null;
  // the decision below's citation goes before it: "… 886 F. 3d 1179, reversed and remanded"
  const tail = s.replace(/^.*?,\s*(?=(?:judgment\s+)?(?:affirm|revers|vacat|remand|dismiss|modif|certiorari|appeal|petition|motion)\w*)/i, "");
  const t = tail.replace(/\s*,\s*$/, "");
  return t ? `${t[0].toUpperCase()}${t.slice(1)}` : null;
}

/**
 * Where a case's own caption begins on its first page, which may end the case before it: its first side's first word
 * in capitals, the scans' stray spaces allowed, before "v." ("UNITED STATES v. ALUMINUM CO. OF AMERICA"); 0 when the
 * caption is not found.
 */
export function captionAt(text: string, title: string): number {
  const word = /[A-Za-z][A-Za-z'’&-]{2,}/.exec(caseParties(title)[0]?.name.replace(/^(?:The|A)\s+/, "") ?? "")?.[0];
  if (!word) return 0;
  const letters = word.toUpperCase().split("").map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s?");
  const m = new RegExp(`(?:^|\\n)[^\\n]{0,40}?\\b${letters}\\b[^\\n]{0,120}?(?:\\n[^\\n]{0,120}?)?\\s[vV]\\s?\\.\\s`).exec(text);
  return m ? m.index : 0;
}

/**
 * A case's day and disposition from its PDF's first pages, as pdftotext gives them, read from its own caption on (a
 * page can end the case before it): "Decided October 23, 1967." and the line after it ("Vacated and remanded."), or the
 * syllabus's last sentence before the opinion begins ("… 886 F. 3d 1179, reversed and remanded."); an in-chambers
 * opinion's day is the one it is dated.
 */
export function caseHead(text: string, title?: string): { day: string | null; disposition: string | null } {
  // the "fi" ligature pdftotext drops from the newer PDFs: "affrmed", "fled"
  const whole = text
    .replace(/\f/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\b([Aa])ff?rm/g, "$1ffirm");
  const t = title ? whole.slice(captionAt(whole, title)) : whole;
  let day: string | null = null;
  let disposition: string | null = null;
  // the day the case was decided, a footnote's star sometimes before its year ("Decided June 22, *\n1964")
  const decided = /Decided\s+([A-Z][a-z]+\.?\s+[\dIlOo|]{1,2}\s*,\s*\*?\s*[\dIlOo|]{4})\s*\.?/.exec(t);
  if (decided) {
    day = dayIn(decided[1]);
    // the per curiam form: the disposition on the line after the day
    // a footnote's star on a line of its own is no disposition, and the scans' stray spaces inside a word are closed up
    const after = t
      .slice(decided.index + decided[0].length)
      .split("\n")
      .map((l) => closeWords(l.trim()))
      .filter((l) => l && !/^[*†‡]+$/.test(l));
    if (after[0] && /^(?:[\d\s\w.,'’&-]{0,80}?,\s*)?(?:Judgments?\s+)?(?:Affirm|Revers|Vacat|Remand|Dismiss|Modif|Certiorari|Appeal|Petition|Motion|Application|Probable|Rehearing|Per\s+Curiam)/i.test(after[0])) {
      // a disposition that runs on: its next lines up to the one that ends it, never the report below or counsel's lines
      let line = after[0];
      for (let k = 1; k < 4 && !/[.]$/.test(line) && after[k] && !/^Reported below\b|\bfor\s+(?:the\s+)?(?:petitioners?|respondents?|appellants?|appellees?|United States|applicants?)\b|\bpro se\b/i.test(after[k]); k++) line = `${line} ${after[k]}`;
      disposition = dispositionOf(line);
    }
  } else {
    // an in-chambers opinion is dated at its end of its first page: "October 3, 1980."
    const dated = /\n\s*([A-Z][a-z]+\.?\s+\d{1,2}\s*,\s*\d{4})\s*\.\s*\n/.exec(t);
    if (dated) day = dayIn(dated[1]);
  }
  // the opinion's first words; a scan writes "PER CuRIAM" and "PER CURIA M"
  const start = /\b(?:delivered the opinion\b|announced the judgment of the Court|per\s?curi\s?a\s?m\b)/i.exec(t);
  if (!disposition && start) {
    // the syllabus's line that cites the decision below and disposes of it: "848 F. 3d 590, affirmed.", "212 So. 3d 977,
    // reversed and remanded.", wherever a long syllabus puts it before the opinion's first words
    const lines = t.split("\n").map((l) => l.trim());
    const cites = (l: string) => l.length <= 140 && /\d/.test(l) && /,\s*(?:judgment\s+)?(?:affirm|revers|vacat|remand|dismiss|modif)\w*[\w ,;()-]*\.?$/i.test(l) && !/\bv\.\s/.test(l);
    // …or a line of its own: "Vacated and remanded.", "Appeal dismissed. Reported below: 326 F. Supp. 3d 128."
    const alone = (l: string) => /^(?:Judgment\s+)?(?:Affirmed|Reversed|Vacated|Dismissed|Appeal dismissed|Certiorari dismissed|Writ of certiorari dismissed)\b[\w ,;-]*\.(?:\s+Reported below:.*)?$/.test(l);
    const at = lines.findIndex((l) => cites(l) || alone(l) || (/,\s*(?:affirm|revers|vacat)\w*(?:\s+in\s+part)?,?\s*(?:and)?$/i.test(l) && /\d/.test(l) && !/\bv\.\s/.test(l)));
    // a disposition the line's end breaks: "952 F. 3d 1157, vacated and" / "remanded."
    const found = at < 0 ? null : /(?:\band|,)$/.test(lines[at]) && lines[at + 1] ? `${lines[at]} ${lines[at + 1]}` : lines[at];
    if (found) disposition = dispositionOf(found.replace(/^Certiorari granted;\s*/i, ""));
  }
  if (!disposition && decided && start) {
    // a per curiam's own first sentence when the line after the day gives none: "Per Curiam. The appeal is dismissed.",
    // "The motions to affirm are granted and the judgment is affirmed."
    const first = t.slice(start.index, start.index + 400).replace(/\s+/g, " ");
    const said = /\b(?:is|are)\s+(?:hereby\s+)?(affirmed|reversed|vacated|dismissed)\b(?:[^.]*?\b(remanded)\b)?/i.exec(first);
    if (said && /^per\s?curi\s?a\s?m\b/i.test(first)) {
      const verb = said[1].toLowerCase();
      disposition = verb === "dismissed" ? (/\bappeal\b/i.test(first.slice(0, said.index + said[0].length)) ? "Appeal dismissed" : "Dismissed") : `${verb[0].toUpperCase()}${verb.slice(1)}${said[2] ? " and remanded" : ""}`;
    }
  }
  if (!disposition) {
    // the syllabus's last sentence, before the opinion's first words
    if (start) {
      const before = t.slice(Math.max(0, start.index - 1500), start.index).replace(/\n/g, " ");
      const sentences = before.split(/(?<=\.)\s+(?=[A-Z0-9])/).map((x) => x.trim()).filter(Boolean);
      for (let i = sentences.length - 1; i >= Math.max(0, sentences.length - 6); i--) {
        if (/,\s*(?:judgment\s+)?(?:affirm|revers|vacat|remand|dismiss|modif)\w*/i.test(sentences[i]) || /^(?:Judgment\s+)?(?:Affirm|Revers|Vacat|Dismiss|Modif)\w*/.test(sentences[i])) {
          disposition = dispositionOf(sentences[i]);
          if (disposition) break;
        }
      }
    }
  }
  return { day, disposition };
}

/** The Reports' abbreviations in a party's name, read as words. */
const ABBREVIATIONS: readonly [RegExp, string][] = [
  [/\bR\.\s?R\.\s?Co\./g, "Railroad Co."],
  [/\bR\.\s?Co\./g, "Railroad Co."],
  [/\bRy\.\s?Co\./g, "Railway Co."],
  [/\bR\.\s?R\./g, "Railroad"],
  [/\bRy\./g, "Railway"],
  [/\bElec\./g, "Electric"],
  [/\bInt['’]l\b/g, "International"],
  [/\bIns\./g, "Insurance"],
  [/\bTel\./g, "Telephone"],
  [/\bTeleg\./g, "Telegraph"],
  [/\bMfg\./g, "Manufacturing"],
  [/\bNat['’]l\b/g, "National"],
  [/\bAss['’]n\b|\bAssn\./g, "Association"],
  [/\bChem\./g, "Chemical"],
  [/\bCal\./g, "California"],
  [/\bPac\./g, "Pacific"],
  [/\bAm\./g, "American"],
  [/\bBros\./g, "Brothers"],
  [/\bSys\./g, "Systems"],
  [/\bIndus\./g, "Industries"],
  [/\bProds\./g, "Products"],
  [/\bServs\./g, "Services"],
  [/\bMut\./g, "Mutual"],
  [/\bSav\./g, "Savings"],
  [/\bFin\./g, "Financial"],
  [/\bLabs\./g, "Laboratories"],
  [/\bPharms\./g, "Pharmaceuticals"],
  [/\bTransp\./g, "Transportation"],
  [/\bConstr\./g, "Construction"],
  [/\bMach\./g, "Machinery"],
  [/\bCommc['’]ns\b/g, "Communications"],
  [/\bU\.\s?S\.(?=\s+[A-Z])/g, "United States"],
];

/** A party's name with the Reports' abbreviations read as words: "Pacific Gas & Elec. Co." → "Pacific Gas & Electric Co.". */
export function expandAbbreviations(party: string): string {
  let p = party;
  for (const [re, word] of ABBREVIATIONS) p = p.replace(re, word);
  return p.replace(/\s+/g, " ").trim();
}

export type ScSide = 0 | 1;
export interface ScParty {
  name: string;
  side: ScSide;
}

/** The parties a case's name gives, each with its side: "Comcast Corp. v. Behrend" → Comcast Corp. (0), Behrend (1). */
export function caseParties(title: string): ScParty[] {
  // govinfo's titles write some "&" as "& (and)": "E. I. du Pont de Nemours & (and) Co."
  const t = title.replace(/\s+/g, " ").replace(/&\s*\(and\)/g, "&").trim();
  // "PPL Montana LLC. V. Montana": the Reports' "v." once printed in capitals
  const sides = t.split(/\s+[vV]\.\s+/);
  const clean = (x: string) =>
    x
      .replace(/^(?:In re|Ex parte|In the Matter of)\s+/i, "")
      .replace(/,?\s+et al\.?$/i, "")
      .replace(/\s*\((?:[^()]*)\)\s*$/, "")
      .trim();
  if (sides.length === 1) return t ? [{ name: clean(t), side: 0 }] : [];
  const parties: ScParty[] = [
    { name: clean(sides[0]), side: 0 },
    { name: clean(sides.slice(1).join(" v. ")), side: 1 },
  ];
  return parties.filter((p) => p.name);
}

/** A legal word as the Reports write one, its abbreviations included: "Co.", "Corp.", "Inc.", "R. Co.", "N. A.". */
const LEGAL = /\b(?:Inc|Incorporated|Corp|Corporation|Company|Co|Cos|Companies|L\.\s?L\.\s?C|LLC|L\.\s?P|LP|Ltd|Limited|plc|P\.\s?L\.\s?C|N\.\s?A|S\.\s?A|AG|N\.\s?V|B\.\s?V|GmbH|Bancorp|Bancorporation)\b\.?/;

/**
 * Whether a party can be a company: a legal word, or a name of two words or more ("General Electric", "Eli Lilly"); a
 * caption names a person by the surname alone ("Cummins", "Pearson", "Vale", "Box"), or with an initial ("Erica P.
 * John"), and a one-word company with no legal form is read by hand (`NAMED_BY_HAND`).
 */
export function corporateParty(party: string): boolean {
  const p = party.trim();
  if (LEGAL.test(p)) return true;
  const words = p.split(/\s+/).filter((w) => /[A-Za-z]/.test(w));
  if (words.length < 2) return false;
  return !/^(?:(?:Mr|Mrs|Ms|Dr)\.?\s+)?[A-Z][a-z'’-]+\s+(?:[A-Z]\.\s*)+[A-Z][a-z'’-]+(?:,?\s+(?:Jr|Sr|II|III)\.?)?$/.test(p);
}

/**
 * The namesakes the rule gives a company that are not its, by CIK, read by hand among every company's matched captions
 * (batch 176).
 */
export const NOT_THE_COMPANY: Readonly<Record<number, { ticker: string; party: RegExp; why: string }[]>> = {
  759944: [{ ticker: "CFG", party: /^The Citizens Bank$/, why: "The Citizens Bank of Winfield, Alabama, in its debt case with Alafabco (2003), not Citizens Financial Group's banks" }],
  1699150: [{ ticker: "IR", party: /^Gardner-Denver Co\.?$/, why: "the Gardner-Denver Company of 1974, which Cooper Industries bought in 1979, not Ingersoll Rand Inc., whose record was Gardner Denver Holdings' of 2013" }],
  60086: [{ ticker: "L", party: /^Loew's Incorporated$/, why: "Loew's Incorporated, the film distributor sued over block-booking its films to television, whose film business became Metro-Goldwyn-Mayer, not Loews Corporation, the theatre chain's successor" }],
  842162: [{ ticker: "LEA", party: /^Lear, Inc\.?$/, why: "Lear, Inc., the avionics maker of Lear v. Adkins (1969), merged into Lear Siegler in 1962, not Lear Corporation, the seat maker" }],
  1365135: [{ ticker: "WU", party: /^Western Union Co\.?$/, why: "the Western Union Telegraph Company of 1961, not The Western Union Company, First Data's spin-off of 2006" }],
  1883814: [{ ticker: "SLND", party: /^Southland Corp\.?$/, why: "the Southland Corporation of 7-Eleven (Southland Corp. v. Keating, 1984), not Southland Holdings, the construction company listed in 2021" }],
  1467858: [{ ticker: "GM", party: /^General Motors(?: Corp\.?| Corporation)?$/, why: "the old General Motors Corporation, Motors Liquidation Company from 2009, not General Motors Company, the record that bought its business in 2009" }],
};

/**
 * The units the Court's captions name that no other map holds, each on its owner's page between the days a filing gives
 * (batch 176), read by hand among the cases the rule left to no page.
 */
export const SC_UNITS: Readonly<Record<number, { ticker: string; party: RegExp; from?: string; to?: string; why: string }[]>> = {
  86312: [
    {
      ticker: "TRV",
      party: /^Travelers (?:Casualty (?:&|and) Surety|Indemnity|Property Casualty)\b/,
      from: "2004-04-01",
      why: "Travelers Property Casualty's insurers, The St. Paul Companies' from their merger of 2004-04-01 (its 8-K filed that day, items 1 and 2, 0000950103-04-000472)",
    },
  ],
  1108524: [{ ticker: "CRM", party: /^Slack Technologies\b/, from: "2021-07-21", why: "Salesforce's from its purchase of Slack (its 8-K filed 2021-07-21, item 2.01, 0001193125-21-220235)" }],
  1020859: [{ ticker: "UNFI", party: /^Super ?[Vv]alu\b|^SUPERVALU\b/, from: "2018-10-22", why: "UNFI's from its purchase of Supervalu (its 8-K filed 2018-10-22, item 2.01, 0001104659-18-063185)" }],
  732717: [
    {
      ticker: "T",
      party: /^(?:Wisconsin|Illinois|Indiana|Michigan|Ohio) Bell\b/,
      from: "1999-10-08",
      why: "Ameritech's Bell companies, SBC's from its merger with Ameritech of 1999-10-08 (SBC's 8-K filed 1999-10-12, items 2 and 7, 0000732717-99-000046)",
    },
  ],
  40545: [
    {
      ticker: "GE",
      party: /^GE Energy Power Conversion\b/,
      from: "2011-10-01",
      why: "Converteam, GE's from its purchase of 90% \"during the third quarter of 2011\" (its 10-Q filed 2011-11-08), so from the first day surely after",
    },
  ],
  87347: [{ ticker: "SLB", party: /^WesternGeco\b/, from: "2006-04-28", why: "Schlumberger's whole from its purchase of Baker Hughes' 30% on 2006-04-28 (its 10-Q filed 2006-07-27, note 5)" }],
  1637459: [{ ticker: "KHC", party: /^Kraft Foods Group\b/, from: "2015-07-02", why: "Kraft Heinz's from the merger of 2015-07-02 (its 8-K filed that day, item 2.01, 0001193125-15-244356)" }],
  60086: [{ ticker: "L", party: /^Lorillard\b/, to: "2008-06-09", why: "Loews's tobacco company until it distributed Lorillard's shares on 2008-06-10 (Loews's 8-K filed that day, item 2.01, 0001193125-08-131150)" }],
  313838: [
    {
      ticker: "SONY",
      party: /^Sony Music Entertainment\b/,
      from: "2008-10-01",
      why: "Sony BMG, \"a wholly-owned subsidiary of Sony\" from 2008-10-01 and renamed Sony Music Entertainment (Sony's 20-F filed 2009-06-23)",
    },
  ],
  764180: [{ ticker: "MO", party: /^Philip Morris USA\b/, why: "Altria's own tobacco company, Philip Morris Incorporated until 2003, through the record's life" }],
};

/** The cases a caption names the company in by one word and no legal form, which the rule refuses, read by hand (batch 176). */
export const NAMED_BY_HAND: Readonly<Record<number, { ticker: string; id: string; party: string; side: ScSide; why: string }[]>> = {
  732717: [
    { ticker: "T", id: "USREPORTS-562-397", party: "AT&T", side: 1, why: "FCC v. AT&T Inc. (2011), the personal-privacy exemption of the Freedom of Information Act, AT&T Inc. the respondent" },
    { ticker: "T", id: "slip-25-25-406", party: "AT&T", side: 1, why: "FCC v. AT&T (No. 25-406, 2026), the 2025 term's case of AT&T Inc." },
  ],
  1045810: [{ ticker: "NVDA", id: "slip-24-23-970", party: "NVIDIA", side: 0, why: "NVIDIA Corp. v. E. Ohman J:or Fonder AB (2024), the shareholders' suit over NVIDIA's crypto-mining sales, dismissed as improvidently granted" }],
  1121404: [{ ticker: "SNY", id: "slip-22-21-757", party: "Sanofi", side: 1, why: "Amgen Inc. v. Sanofi (2023), the patent case over Sanofi's and Regeneron's cholesterol drug, Sanofi the respondent" }],
  78003: [
    {
      ticker: "PFE",
      id: "USREPORTS-562-223",
      party: "Wyeth",
      side: 1,
      why: "Bruesewitz v. Wyeth (2011), Wyeth Pfizer's from its purchase of 2009-10-15 (Pfizer's 8-K filed 2009-10-21, item 2.01)",
    },
  ],
};

/**
 * The spellings a party is read in: as printed, with the Reports' abbreviations read, with its initials closed up ("U. S.
 * Bank N. A." as "U.S. Bank N.A.") and "N.A." read as "National Association", and without "USA" before its legal word, as a
 * unit named after its owner writes it ("Teva Pharmaceuticals USA, Inc.").
 */
export function partySpellings(party: string): string[] {
  const closed = party.replace(/\b([A-Z])\.\s+(?=[A-Z]\.)/g, "$1.");
  const national = closed.replace(/,?\s+N\.A\.?$/, " National Association");
  const noUsa = closed.replace(/\s+(?:U\.S\.A\.|USA)(?=,?\s+(?:Inc|Corp|Co|LLC|L\.L\.C|Ltd)\b)/, "");
  return [...new Set([party, expandAbbreviations(party), closed, national, noUsa])];
}

/** A name with "Railway" read as "Railroad", as the Reports' "R. Co." stands for either. */
const railKey = (x: string) =>
  expandAbbreviations(x)
    .replace(/\bRailway\b/gi, "Railroad")
    .replace(/\s+and\s+/gi, " & ")
    .toLowerCase();

/**
 * Whether a party is one of the railroads the company owned on the day (`RAIL_OWNERS`, lib/railAccidents.ts, each between
 * its owner's days read from a filing): the railroad's name, then a railroad's or a legal word ("Norfolk & Western R. Co.",
 * "Wisconsin Central Ltd.", "CSX Transp., Inc.").
 */
export function railroadOf(party: string, day: string, cik: number): boolean {
  const p = railKey(party);
  return !!RAIL_OWNERS[cik]?.roads.some((r) => {
    if ((r.from && day < r.from) || (r.to && day > r.to) || r.railroad.length < 3) return false;
    const name = railKey(r.railroad).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`^(?:the\\s+)?${name}(?:\\s+(?:railroad|transportation|system|lines?))?,?\\s+(?:railroad|transportation|system|lines?|co\\b|company|corp\\b|corporation|inc\\b|incorporated|ltd\\b|limited|llc)`, "i").test(p);
  });
}

/**
 * Whether a party is one of the units the other sources' maps read by hand give the company on the day: the Labor
 * Department's certifications' (`TAA_UNITS`: Oracle America, Sun renamed) and the NLRB's (`NLRB_UNITS`: Allstate
 * Insurance Company), each between its days; a unit read for one map is read for this one too.
 */
export function unitOf(party: string, day: string, cik: number): boolean {
  const within = (u: { from?: string; to?: string }) => (!u.from || day >= u.from) && (!u.to || day <= u.to);
  return partySpellings(party).some(
    (p) =>
      !!SC_UNITS[cik]?.some((u) => within(u) && u.party.test(p)) ||
      !!TAA_UNITS[cik]?.some((u) => within(u) && u.firm.test(p)) ||
      !!NLRB_UNITS[cik]?.some((u) => within(u) && u.name.test(p)),
  );
}

/** Whether a party a caption names is the company on the case's day, as printed or with the Reports' abbreviations read. */
export function scPartyIsCompany(party: string, day: string, cik: number, names: () => string[]): boolean {
  if (!corporateParty(party)) return false;
  const refused = (p: string) => !!NOT_THE_COMPANY[cik]?.some((r) => r.party.test(p));
  // a name the record took from another company is that company's before the day (lib/takenNames.ts): "Wells Fargo
  // Bank" of 1988 is the old Wells Fargo's, not Norwest's record's, for the units' lists as for the names
  if (refused(party) || takenBefore(cik, day, party) || takenBefore(cik, day, expandAbbreviations(party))) return false;
  if (railroadOf(party, day, cik) || unitOf(party, day, cik)) return true;
  const held = () => [...names(), ...eeocUnitNamesOn(cik, day)];
  return partySpellings(party).some((v) => partyIsCompany(v, day, cik, held, refused));
}

/** The company's parties in a case: each side naming it. */
export function scRoles(c: Pick<ScCase, "id" | "title" | "day">, cik: number, names: () => string[]): ScParty[] {
  const hand = NAMED_BY_HAND[cik]?.filter((h) => h.id === c.id).map((h) => ({ name: h.party, side: h.side })) ?? [];
  if (!c.day) return [];
  return [...hand, ...caseParties(c.title).filter((p) => !hand.some((h) => h.side === p.side) && scPartyIsCompany(p.name, c.day!, cik, names))];
}

let cached: { path: string; cases: ScCase[] } | null = null;

/** Every case in the committed file, read once a process. */
export function supremeCourtCases(path = SUPREME_COURT_DATA): readonly ScCase[] {
  if (cached?.path === path) return cached.cases;
  const body = JSON.parse(gunzipSync(readFileSync(path)).toString("utf8")) as { cases: unknown[][] };
  const cases = body.cases.map((r) => Object.fromEntries(CASE_COLUMNS.map((k, i) => [k, r[i] ?? null])) as unknown as ScCase);
  cached = { path, cases };
  return cases;
}

const DAY = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m - 1]} ${dd}, ${y}`;
};

/** The company's side as the Court names it, by how the case came to the Court. */
export function sideName(side: ScSide, c: Pick<ScCase, "jurisdiction" | "docket" | "title">): string {
  const j = (c.jurisdiction ?? "").toLowerCase();
  if (/^(?:in re|ex parte)\b/i.test(c.title)) return "the party the case is named for";
  if (j.includes("appeal")) return side === 0 ? "the appellant" : "the appellee";
  if (j.includes("original")) return side === 0 ? "the plaintiff" : "the defendant";
  if (j.includes("application") || /A\d/.test(c.docket ?? "")) return side === 0 ? "the applicant" : "the respondent";
  if (j.includes("cert") || c.docket || j === "") return side === 0 ? "the petitioner" : "the respondent";
  return side === 0 ? "the first-named party" : "the second-named party";
}

/** A case as a row names it: "Comcast Corp. v. Behrend, 569 U.S. 27 (2013)", or with its docket number before a page is given. */
export const caseRef = (c: Pick<ScCase, "title" | "cite" | "day" | "docket">) =>
  c.cite ? `${c.title}, ${c.cite}${c.day ? ` (${c.day.slice(0, 4)})` : ""}` : `${c.title}${c.docket ? ` (No. ${c.docket})` : ""}`;

/** Where a case is read: govinfo's page of it, or the Court's own PDF. */
export const caseUrl = (c: Pick<ScCase, "id" | "pdf" | "from">) => {
  const m = /^USREPORTS-(\d+)-/.exec(c.id);
  return c.from === "reports" && m ? `${GOVINFO}/app/details/USREPORTS-${m[1]}/${c.id}` : c.pdf;
};

const LIMIT = 1_200;

/** A disposition as a row says it: the Supreme Court Database's note on a modified affirmance left off ("Affirmed (includes modified)"). */
export const shownDisposition = (d: string | null) => (d ? d.replace(/\s*\(includes modified\)$/, "") : null);

/** The cases a day holds once: a slip opinion the bound volumes print is the volume's case. */
export function distinctCases(cases: readonly ScCase[]): ScCase[] {
  const reports = new Set(cases.filter((c) => c.from === "reports" && c.cite).map((c) => c.cite));
  return cases.filter((c) => c.from === "reports" || !c.cite || !reports.has(c.cite));
}

/** The company's cases as timeline events, newest first, from `from`, its first price: one row a day. */
export function supremeCourtEvents(
  cases: readonly ScCase[],
  namesIn: (year: number) => string[],
  { cik, from = "", namesOn }: { cik: number | string; from?: string; namesOn?: (day: string) => string[] },
): TimelineEvent[] {
  const tag = Number(cik);
  const byYear = new Map<number, string[]>();
  const yearNames = (year: number) => byYear.get(year) ?? byYear.set(year, namesIn(year)).get(year)!;
  const byDay = new Map<string, { c: ScCase; mine: ScParty[] }[]>();
  for (const c of distinctCases(cases)) {
    if (!c.day || c.day < from) continue;
    const mine = scRoles(c, tag, () => [...yearNames(Number(c.day!.slice(0, 4))), ...(namesOn?.(c.day!) ?? [])]);
    if (!mine.length) continue;
    (byDay.get(c.day) ?? byDay.set(c.day, []).get(c.day)!).push({ c, mine });
  }
  const rows: TimelineEvent[] = [];
  for (const [day, found] of byDay) {
    const sorted = [...found].sort((a, b) => (a.c.cite ?? a.c.id).localeCompare(b.c.cite ?? b.c.id, "en", { numeric: true }));
    const one = sorted[0].c;
    const decided = (c: ScCase) => `${caseRef(c)}${c.disposition ? `: ${shownDisposition(c.disposition)}` : ""}`;
    const title = sorted.length === 1 ? `The Supreme Court decided ${decided(one)}` : `The Supreme Court decided ${sorted.length} cases naming the company: ${sorted.map((x) => decided(x.c)).join("; ")}`;
    const lines = sorted.map(({ c, mine }) => {
      const kind = c.kind ? ` (${c.kind.replace(/\s+/g, " ")})` : "";
      const how = c.disposition ? `: ${shownDisposition(c.disposition)}.` : ".";
      return `${caseRef(c)}, decided ${DAY(day)}${kind}${how} The company is ${mine.map((p) => `${sideName(p.side, c)} (${p.name})`).join(" and ")}.`;
    });
    const text =
      "A decision of the Supreme Court of the United States in a case naming the company as a party, as the U.S. Reports or the Court's own list print it; the row gives the Court's disposition, never a summary of its holding. " +
      lines.join(" ");
    rows.push({
      id: `supreme-court-${tag}-${day}`,
      date: day,
      type: "regulation",
      title: title.length <= 300 ? title : `${title.slice(0, 299).replace(/\s+\S*$/, "")}…`,
      description: text.length <= LIMIT ? text : `${text.slice(0, LIMIT - 1).replace(/\s+\S*$/, "")}…`,
      source: one.from === "reports" ? "Supreme Court of the United States, U.S. Reports (govinfo)" : "Supreme Court of the United States",
      url: caseUrl(one),
      sourceKey: "supreme_court",
      // the day's cases, compared as a set by "Also on" (lib/alsoOn.ts)
      externalId: sorted.map((x) => x.c.cite ?? x.c.id).join(","),
      dedupBasis: `supreme-court:${tag}@${day}`,
    });
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}
