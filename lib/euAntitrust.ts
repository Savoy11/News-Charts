import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { named, partyIsCompany } from "./hsrEarly";
import { EU_SPARQL, eurLexPage } from "./euMergers";
import type { TimelineEvent } from "./types";

/**
 * The European Commission's antitrust and cartel decisions, 1973 on, and its State aid decisions naming the company as
 * the beneficiary (batch 177; the 2026-11-22c proposal 2, approved by the owner that day with call (a): the antitrust
 * and cartel decisions addressed to the company, and the State aid notices and decisions naming it as the beneficiary,
 * each on its day).
 *
 * The decisions are the Official Journal's English edition's, listed by the EU Publications Office's SPARQL endpoint
 * year by year (`decisionQuery`): a decision "relating to a proceeding" under the competition articles (and the older
 * wordings, "relating to proceedings", "relating to a procedure"), its full text, its summary or the Commission's archive
 * copy, each read once from the Publications Office's document store, CELLAR, as batch 174 reads the merger notices; a
 * draft, a meeting's agenda and a Euratom safeguards decision are not listed (`isDecisionTitle`), and a decision held
 * twice is one by its case and day, the archive scans' days read ("2. VII. 1987", `decidedOn`). A decision's addressees
 * are its own passages' (`decisionAddressees`): "This Decision is addressed to: 1. … 2. …" with their addresses (an item
 * after a bare comma a name only with a legal word, a postcode or a street never), a summary's groups ("— MAGNA: Magna
 * International Inc., …", "(b) for Dow: The Dow Chemical Company from 1 July 1996 to …"), the fines' list, the fines
 * imposed and on whom, a finding of who infringed, and the commitments made binding; "made binding the commitments
 * offered by" recalls an earlier decision's parties and is read only where nothing else names one. Its fines
 * (`decisionFines`) are whole euros or ecus, never a float, each with the names liable for it jointly, a parent liable
 * for a part only given none and an immunity's nothing no fine. An addressee is the company's by the merger notices' rule
 * (`partyIsCompany`) on its full name or its short name, its namesakes in `NOT_THE_COMPANY`, its units no other map
 * holds in `EU_UNITS`. The State aid notices (an invitation to comment, opening a formal investigation) and decisions
 * are read by their titles: the aid's beneficiary, "implemented by Ireland to Apple", "in favour of Ryanair", by the
 * same rule; the member state is the addressee, so the row says the company is the beneficiary.
 * `npm run sync:eu-antitrust` commits all of it (`data/eu-antitrust.json.gz`); ingest asks nothing. "© European Union,
 * https://eur-lex.europa.eu".
 */

export const EU_ANTITRUST_DATA = join(__dirname, "..", "data", "eu-antitrust.json.gz");

export type DecisionKind = "antitrust" | "stateaid";
const PHRASE: Record<DecisionKind, string> = {
  antitrust: `"relating to a proceeding" OR "relating to proceedings" OR "relating to a procedure" OR "relating to proceeding"`,
  stateaid: `"state aid" AND ("aid to" OR "in favour of" OR "granted to" OR "implemented by")`,
};

/** The endpoint's query for one year's English titles of a kind, each with its formats; a year holds under 5,000. */
export function decisionQuery(kind: DecisionKind, year: number): string {
  return `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
SELECT ?w ?d ?t (GROUP_CONCAT(DISTINCT ?mt; separator=",") AS ?types) WHERE {
  ?e cdm:expression_title ?t .
  ?t bif:contains '${PHRASE[kind]}' .
  ?e cdm:expression_belongs_to_work ?w .
  ?e cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/ENG> .
  ?w cdm:work_date_document ?d .
  FILTER(?d >= "${year}-01-01"^^xsd:date && ?d <= "${year}-12-31"^^xsd:date)
  OPTIONAL { ?m cdm:manifestation_manifests_expression ?e . ?m cdm:manifestation_type ?mt . }
} GROUP BY ?w ?d ?t ORDER BY ?d ?w LIMIT 5000`;
}
export const decisionQueryUrl = (kind: DecisionKind, year: number) =>
  `${EU_SPARQL}?${new URLSearchParams({ query: decisionQuery(kind, year), format: "application/sparql-results+json", timeout: "120000" })}`;

/** The first year asked: no year before the English edition's first, 1973 (the United Kingdom's accession), lists a decision in English. */
export const FIRST_YEAR = 1960;

/**
 * A title that is no Commission decision under the competition rules: a court's, a question, a corrigendum, a merger
 * decision, the EFTA Authority's, a communication, a Euratom safeguards decision, and the archive's drafts and meeting
 * agendas ("AG 762 - 12.12.1984 Draft COMMISSION DECISION …", "Special Chefs de Cabinet meeting").
 */
const NOT_A_DECISION =
  /^(?:Case [CT]-|Cases [CT]-|Joined Cases|Judgment|Order|Action brought|Appeal brought|Reference for a preliminary|Opinion|Written question|Question|Corrigendum|Communication|Commission communication)|\bconcentration\b|EFTA Surveillance Authority|\bEuratom\b|\bDraft\b|Chefs de Cabinet|^(?:\d\)\s*)?(?:AG|OJ)\s+\d{3,4}\b/i;

/** Whether a listed title is one of the Commission's antitrust decisions or their summaries. */
export const isDecisionTitle = (title: string) => !NOT_A_DECISION.test(title) && /\b(?:Decision|DECISION)\b/.test(title);

/** Whether a listed title is a State aid notice or decision (an invitation to comment opens a formal investigation). */
export const isStateAidTitle = (title: string) =>
  !NOT_A_DECISION.test(title) && !/Staff Working Document|Réunion|NOTE A L|^Ag \d/i.test(title) && /\bstate aid\b/i.test(title);

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

/**
 * The day a title gives its decision: "Commission Decision of 27 June 2017", "Decision (EU) 2017/1283 of 30 August 2016",
 * and as the archive's scans write it, "of 2. VII. 1987", "of 24.11.1987", "of 26. 7. 88", "of 30 ApriI 1984" (a month
 * read by its first three letters, an OCR'd "l" a Roman "I").
 */
export function decidedOn(title: string): string | null {
  const m = /\bDecision\b(?:\s*\([A-Z]{2,8}\))?[^()]{0,40}?\bof\s+(\d{1,2})(?:\s+([A-Za-z]{3,})|\.\s?([IVXl]{1,5}|\d{1,2})\.)\s?(\d{4}|\d{2})\b/i.exec(title);
  if (!m) return null;
  const month = m[2] ? MONTHS.findIndex((x) => x.slice(0, 3) === m[2].slice(0, 3).toLowerCase()) : /^\d/.test(m[3]) ? Number(m[3]) - 1 : ROMAN.indexOf(m[3].replace(/l/g, "I").toUpperCase());
  if (month < 0 || month > 11) return null;
  const year = m[4].length === 2 ? 1900 + Number(m[4]) : Number(m[4]);
  const d = new Date(Date.UTC(year, month, Number(m[1])));
  return d.getUTCMonth() === month && d.getUTCDate() === Number(m[1]) ? d.toISOString().slice(0, 10) : null;
}

/** A decision's case numbers as its title writes them: "AT.39740", "COMP/38.899", "IV/30.696", "COMP/C-3/37.990", "COMP/F/38.456", "SA.38373". */
export function caseNumbers(title: string): string[] {
  const out: string[] = [];
  // a scan's stray space before the point, "IV/31 .902", is the same number
  for (const m of title.matchAll(/\b(AT|SA|DMA|DSA|COMP(?:\/[A-Z](?:-?\d)?)?|IV(?:\/[A-Z])?|C|N|NN)\s?[./]\s?(\d{1,3}(?:\s?[. ]\s?\d{3})?|\d{4,6})\b/g)) {
    const digits = m[2].replace(/[. ]/g, "");
    if (/^(?:C|N|NN)$/.test(m[1])) continue;
    out.push(m[1] === "AT" || m[1] === "SA" || m[1] === "DMA" || m[1] === "DSA" ? `${m[1]}.${digits}` : `${m[1]}/${digits}`);
  }
  // "(Cases IV/31.370 and 31.446 — …)": a second number after "and" is the same register's
  const and = /\b(?:IV|COMP)\/[\d.]+\s+and\s+(\d{2}\.\d{3})\b/.exec(title);
  if (and && out[0]) out.push(`${out[0].split("/")[0]}/${and[1].replace(".", "")}`);
  return [...new Set(out)];
}

/** The aid's beneficiary a State aid title names: "implemented by Ireland to Apple", "Alleged aid to Apple", "in favour of Ryanair". */
export function beneficiaryOf(title: string): string | null {
  const m =
    /\b(?:implemented|granted|awarded|planned|notified|paid)\s+by\s+[A-Z][\w ,&'’-]{1,60}?\s+(?:to|for|in favour of)\s+|\bwhich\s+[A-Z][\w ,&'’-]{1,40}?\s+(?:granted|awarded|gave|paid)\s+to\s+|\b(?:alleged\s+)?(?:state\s+)?aid\s+(?:to|for|in favour of|granted to)\s+|\b(?:granted|awarded|given|paid)\s+to\s+(?=\p{Lu})/iu.exec(title);
  if (!m) return null;
  const rest = title.slice(m.index + m[0].length);
  const end = rest.search(/\s+(?:\(notified|—|–|-\s|\(|Invitation\b|concerning\b|in the form\b|in respect of\b|in connection\b|through\b|for the\b|in relation\b)|[;:]|$/);
  const name = rest.slice(0, end < 0 ? undefined : end).replace(/[.,\s]+$/, "").trim();
  return name && /^\p{Lu}/u.test(name) ? name : null;
}

/** Where an address begins in an addressee's entry: a postcode, a street, a box ("Postfach 110846", "D-6100", "Quai des …", "99 Kensington"). */
const ADDRESS = /\s+(?=(?:[A-Z]{1,3}-?\s?\d{3,6}\b|[A-Z][\w'’-]*\s+(?:Building|Tower|Centre|Center|Plaza)\b|\d{1,5}[a-z]?(?:\s|,)|Postfach\b|P\.?\s?O\.?\s?Box\b|BP\s?\d|rue\b|Rue\b|Quai\b|Avenue\b|avenue\b|Via\b|Viale\b|Piazza\b|Place\b|place\b|Platz\b|Strasse\b|Straße\b|Street\b|Road\b|Square\b|House\b|Calle\b|Paseo\b|Boulevard\b|boulevard\b|Chaussée\b|Weg\b|Laan\b|Gate\b))/;

/** A street written as one word, as German, Dutch and Nordic addresses are: "Heinrich-von-Stephan-Straße", "Affolternstrasse". */
const ONE_WORD_STREET = /\s+(?=[\p{L}-]*(?:straße|strasse|Straße|Strasse|allee|Allee|platz|Platz|straat|gracht|plein|gasse|vej|gade|vägen|gatan)\b)/u;

/** The legal words a name ends with; a capitalised word after one is its address ("Deutsche Post AG Heinrich-von-Stephan-Straße"). */
const LEGAL =
  "Corporation|Incorporated|Inc|Ltd|Limited|plc|PLC|p\\.l\\.c|AG|SE|KGaA|KG|OHG|GmbH|mbH|SpA|S\\.p\\.A|Srl|SRL|S\\.r\\.l|NV|N\\.V|BV|B\\.V|BVBA|SPRL|SA|S\\.A|SAU|S\\.A\\.U|SASU|SAS|SARL|Sàrl|Sarl|SL|S\\.L|SLU|AB|ASA|AS|A\\/S|ApS|Oyj|Oy|a\\.s|s\\.r\\.o|Kft|Zrt|Lda|Ltda|LLC|LLP|L\\.P|LP|KK|K\\.K|Pty|Pte|N\\.A";
const LEGAL_END = new RegExp(`\\b(?:${LEGAL})\\.?(?=\\s+(?:c\\/o\\b|\\d|(?!(?:${LEGAL}|Co|Company|Holdings?|Group)\\b)\\p{Lu}))`, "u");
const ENDS_LEGAL = new RegExp(`\\b(?:${LEGAL})\\.?$`, "u");
const LEGAL_ALONE = new RegExp(`^(?:${LEGAL}|Co|Corp)\\.?$`, "u");

/** An addressee's name, its number, address and short name off: "4. L. C. Nungesser KG Postfach 110846 D-6100 Darmstadt 11" → "L. C. Nungesser KG". */
export function addresseeName(entry: string): string | null {
  let e = entry
    .replace(/\s+/g, " ")
    .replace(/^(?:\(?[0-9]{1,2}[.)]|\(?[a-z]{1,3}\)|\(?[ivx]{1,5}\)|[—–•-])\s*/i, "")
    .replace(/^(?:and|the|to|on|each|for)\s+/i, "")
    .replace(/^(?:the\s+)?(?:undertakings?|companies|company|entities|legal entities|following)\s+/i, "")
    .trim();
  // a short name in brackets and what follows it, closed or not: "Delivery Hero SE (‘Delivery Hero’)", "Glovoapp23 SA (‘Glovo’"
  e = e.replace(/\s*\([\s\S]*$/, "");
  // the period it is liable for: "Dow Deutschland Inc. from 1 July 1996 to 27 November 2001"
  e = e.replace(/\s+(?:from|between|until|for the period)(?:\s+(?:\d|the\b)[\s\S]*)?$/i, "");
  // the address after a comma, but a legal word written after its comma stays ("Ziegler, Inc.")
  const parts = e.split(/,\s*/);
  let name = parts[0];
  for (let k = 1; k < parts.length && LEGAL_ALONE.test(parts[k].trim()); k++) name = `${name}, ${parts[k].trim()}`;
  // a legal word that begins the name is its own ("AB Volvo")
  const end = LEGAL_END.exec(name);
  if (end && end.index > 0) name = name.slice(0, end.index + end[0].length);
  // a name that ends in its legal word has no address left in it: "Penguin Random House Limited" keeps its "House"
  const street = ENDS_LEGAL.test(name.trim()) ? name : name.split(ADDRESS)[0].split(ONE_WORD_STREET)[0];
  // a word left before a street or a building is the address's, never a name: "Beacon House", "Newmarket Road"
  if (street !== name && !/\s/.test(street.trim()) && !new RegExp(`\\b(?:${LEGAL})\\b`, "u").test(street)) return null;
  name = street.replace(/\s+(?:for\s+)?(?:EUR|ECU)\b[\s\S]*$/, "");
  name = name
    .replace(/\s*:[\s\S]*$/, "")
    // a footnote's figure: "Alphabet. 2", "Autoliv ( 2 )"
    .replace(/(?:\.\s+\d{1,2}|\s*\(\s*\d{1,2}\s*\))$/, "")
    .replace(/\s+(?:jointly and severally\b|whose|which|having|with its registered office|registered|located|established|is|are|has|have|shall|will|was|were)\b[\s\S]*$/i, "")
    .replace(/[;:,\s]+$/, "")
    .trim();
  // a full stop the text put after the name is off, an abbreviation's kept: "Google Inc.", "Koninklijke Philips N.V."
  const last = name.replace(/\.+$/, "").split(/\s+/).at(-1) ?? "";
  name = /\.$/.test(name) && (/^(?:Inc|Corp|Co|Ltd|Bros|Mfg|Cos|Intl|Jr|Sr)$/i.test(last) || /\./.test(last)) ? name.replace(/\.+$/, ".") : name.replace(/[.,\s]+$/, "");
  // a bracket the cut left open is the text's, not the name's: "Zeon)"
  if (!name.includes("(")) name = name.replace(/\)+$/, "").trim();
  if (!/^\p{Lu}/u.test(name) || name.length < 2 || name.length > 120 || name.split(/\s+/).length > 12) return null;
  // an address the entry gave before or without a name: a postcode ("NL-6500 AB", "USA-Illinois 61265"), a box
  if (/\d{4,}|^[A-Z]{1,3}-\s?\d|^(?:P\.?\s?O\.?\s?Box|Postfach)\b|^BP\s?\d/.test(name)) return null;
  // a legal word alone, a heading, or a court's case number: "Co", "LTD", "Fines", "T-47/98"
  if (/^(?:Co|Corp|Company|Inc|Ltd|LTD|Limited|SA|AG|Fines?|Convention|[CT]-\d+\/\d+)$|^Infringements?\b/.test(name)) return null;
  if (/^(?:Mr|Mrs|Ms|Messrs|Dr|Herr|Monsieur|Madame|OJ|Article|Regulation|Case|Commission|Decision|In|The|This|For|On)\b/.test(name)) return null;
  return name;
}

/** Where a sentence ends: a full stop before a capital or a footnote's bracket, never the point of "Inc. and". */
const STOP = String.raw`\.\s+(?=\p{Lu}|\(?\s?\d)`;

/**
 * The passages of a decision that name its addressees: its closing article, a summary's list, its fines and its finding,
 * each whole and its names alone; a `list` is an article or a list of fines that can give each addressee with its address
 * ("Brose Beteiligungs-Kommanditgesellschaft, Coburg").
 */
function addresseePassages(t: string): { whole: string; names: string; list: boolean; recall: boolean }[] {
  const out: { whole: string; names: string; list: boolean; recall: boolean }[] = [];
  const take = (re: RegExp, list = false) => {
    for (const m of t.matchAll(re)) out.push({ whole: m[0], names: m[1], list, recall: /^\s*made\b/i.test(m[0].replace(/^\W*/, "")) });
  };
  const prose = (source: string) => new RegExp(source.replaceAll("STOP", STOP), "gu");
  // "This Decision is addressed to: 1. … 2. …", up to the signature or the next article
  take(/\b(?:This|The) Decision (?:is|shall be) addressed to(?: the following (?:undertakings|companies|legal entities|entities|associations of undertakings))?(?: the undertakings listed (?:below|in the Annex(?: hereto)?))?\s*(?:\([^)]*\)\s*)?:?\s*([\s\S]{0,3000}?)(?=\s*(?:Done at|This Decision shall be enforceable|Article \d+\b|\(\d+\)\s|\(\s\d+\s\)\s+(?:OJ\b|[A-Z][a-z])|\d\.\s+[A-Z]{3,}|$))/g, true);
  // "a fine of EUR 553 000 000 is imposed on each E.ON Ruhrgas, jointly and severally with E.ON, and GDF Suez"
  take(prose(String.raw`\bfines? of (?:EUR|ECU|ecu|units of account)\s?[\d  .,]+(?:\s*\([^)]*\))?(?:\s+each)?\s+(?:is|are|was|were|shall be|has been|have been) (?:hereby )?imposed (?:on|upon)\s+(?:each\s+)?([\s\S]{0,500}?)(?=STOP|\s+in respect\b|\s+for (?:the|its|their)\b|$)`));
  // "The Decision therefore only imposes fines on the undertakings NatWest, Nomura, Portigon, UBS and UniCredit.";
  // "imposes a fine in relation to the abusive conduct upon Google Inc. with respect to …"
  take(prose(String.raw`\bimposes? (?:a )?fines? (?:[^.]{0,80}? )?(?:on|upon) (?:the undertakings |the companies |each of )?([\s\S]{0,400}?)(?=STOP|\s+(?:for|in respect|with respect|totall?ing|amounting)\b|$)`));
  // "the final amount of the fine imposed on Alphabet Inc. and Google Inc. is: EUR 1 494 459 000"
  take(prose(String.raw`\bthe (?:final )?(?:amount of the )?fines? imposed on\s+([\s\S]{0,300}?)(?=\s+(?:is|are|amounts? to|for|in respect)\b|STOP|$)`));
  // "The following fines were imposed …: (i) Delivery Hero SE: EUR 223 285 000 (ii) …"
  take(/\bfollowing fines (?:are|were|shall be|have been) (?:hereby )?imposed[^:]{0,120}:\s*([\s\S]{0,3000}?)(?=\s*(?:Done at|Article \d+\b|\(\d+\)\s+[A-Z][a-z]|\(\s\d+\s\)\s+(?:OJ\b|[A-Z][a-z])|\d\.\s+[A-Z]{3,}|$))/g, true);
  // a commitments decision: "The Decision makes binding the commitments offered by Renfe"
  take(prose(String.raw`\bma(?:kes|king|de) (?:legally )?binding (?:on [^.]{0,80}? )?(?:the )?commitments (?:offered|submitted|proposed|given) by\s+([\s\S]{0,300}?)(?=\s+(?:to|in|on|for|and)\s+\p{Ll}|\s+\(|STOP|,\s+\p{Ll}|$)`));
  // "the Commission made these commitments binding upon Microsoft"
  take(prose(String.raw`\bma(?:kes|king|de) (?:these |the )?commitments (?:legally )?binding (?:up)?on\s+([\s\S]{0,300}?)(?=\s+(?:to|in|on|for|and)\s+\p{Ll}|\s+\(|STOP|,\s+\p{Ll}|$)`));
  // a summary's finding: "The Decision finds that E.ON AG (…), jointly and severally with …, and GDF Suez SA (…) have infringed"
  take(/\bThe (?:Decision|decision) (?:finds|concludes|establishes) that\s+([\s\S]{0,700}?)\s+(?:have|has|had) (?:infringed|committed|participated|abused|breached)/g);
  return out;
}

/** A word that makes an item of an address list a name: a legal word, or a bank's or a group's ("JPMorgan Chase Bank"). */
const LEGAL_WORD = new RegExp(`\\b(?:${LEGAL}|Co|Corp|Company|Bank|Banking|Association|Group|Holdings?)\\b`, "u");
/**
 * What separates the names of an entry: "jointly and severally with", "and" (never in "Deere and Company"), a group's
 * label's colon ("— MAGNA: Magna International Inc., …"), or a comma before a capital that begins no legal word
 * ("Ziegler, Inc." is one name).
 */
const SEPARATOR = new RegExp(String.raw`(,?\s+jointly and severally with\s+|,\s+and\s+|\s+and\s+(?=\p{Lu})(?!(?:Company|Co)\b)|:\s+(?=\p{Lu}|\(\w{1,4}\)\s)|,\s+(?!(?:${LEGAL}|Co)\b)(?=\p{Lu}[\w&.'’-]*(?:\s+[\w&.'’-]+){0,5}(?:\s|$)))`, "u");

/**
 * A decision's addressees, as its own passages name them (`addresseePassages`): "This Decision is addressed to: 1. … 2.
 * …" with their addresses, a summary's "addressed to the following legal entities", the fines imposed and on whom, and
 * a summary's finding of who infringed; each passage split into its names (`addresseeName`). A company the text names
 * elsewhere, a customer or a complainant, is no addressee.
 */
export function decisionAddressees(text: string): string[] {
  // the file's excerpt joins its passages with " ¶ ": each is read alone
  const passages = text.replace(/\s+/g, " ").split(/\s*¶\s*/).flatMap((piece) => addresseePassages(piece));
  // "made binding the commitments offered by" recalls an earlier decision's parties ("… by the four publishers and
  // Apple", in Penguin's decision of 2013): read only where no other passage names an addressee (Microsoft's of 2009)
  const own = passageNames(passages.filter((p) => !p.recall));
  return own.length ? own : passageNames(passages);
}

/**
 * The names of one entry of a passage: split at its separators (`SEPARATOR`), "The Shell Transport and Trading Company
 * Ltd" and "Marks and Spencer plc" kept whole (the words before the "and" hold no legal word, no footnote or figure, and
 * the words after it end in one); in an article that gives each addressee's address, an item after a bare comma is a
 * name only with a legal word.
 */
function entryNames(entry: string, list: boolean): string[] {
  // its items with the separator before each: [item, separator, item, …]
  const parts = entry.split(SEPARATOR);
  for (let k = parts.length - 2; k > 0; k -= 2)
    if (/^\s+and\s+$/.test(parts[k]) && !LEGAL_WORD.test(parts[k - 1]) && !/[(\d]/.test(parts[k - 1]) && ENDS_LEGAL.test(parts[k + 1].trim().replace(/[.,]$/, "")))
      parts.splice(k - 1, 3, `${parts[k - 1]} and ${parts[k + 1]}`);
  const out: string[] = [];
  for (let k = 0; k < parts.length; k += 2) {
    if (list && k > 0 && /^,\s+$/.test(parts[k - 1]) && !LEGAL_WORD.test(parts[k])) continue;
    const n = addresseeName(parts[k]);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

/** The names a decision's passages give, each once. */
function passageNames(passages: { names: string; list: boolean }[]): string[] {
  const out: string[] = [];
  for (const { names: passage, list } of passages) {
    // the passage's entries: numbered, lettered or dashed items ("— MAGNA: …", the older texts' ". - NV John Deere SA"), then semicolons
    const entries = passage
      .replace(/\s*:\s*(?:EUR|ECU)\s?[\d  .,]+(?:\s*million)?/g, ";")
      .split(/\s*;\s*|\s+(?=\(?\d{1,2}[.)]\s+\p{Lu})|\s+(?=[—–]\s*\p{Lu})|\.?\s+-\s+(?=\p{Lu})|\s+(?=\(?[a-z]{1,2}\)\s+\p{Lu})|\s+(?=\([ivx]{1,5}\)\s+\p{Lu})/u);
    for (const entry of entries) for (const n of entryNames(entry, list)) if (!out.includes(n)) out.push(n);
  }
  return out;
}

/**
 * What the committed file keeps of a decision's text: its addressee and fine passages, each whole, joined by " ¶ ";
 * `decisionAddressees` and `decisionFines` read the same names from it as from the whole text, so a rule's change is
 * read again with no request.
 */
export function addresseeExcerpt(text: string): string {
  const t = text.replace(/\s+/g, " ");
  const fines = [
    ...t.matchAll(/\b[Aa] fine of (?:EUR|ECU|ecu)\s?[\d  .,]+[^.;]{0,260}?(?:is|shall be|has been) (?:hereby )?imposed (?:up)?on[^.;]{0,220}/g),
    ...t.matchAll(/\bimposes? a fine of (?:EUR|ECU)\s?[\d  .,]+\s+(?:up)?on\s+[^.;]{2,220}/g),
    ...t.matchAll(/\bthe (?:final )?(?:amount of the )?fines? imposed on [^:;]{2,200}?\s+(?:is|amounts? to):?\s*(?:EUR|ECU)\s?[\d  .,]+(?:,\s*of which (?:EUR|ECU)\s?[\d  .,]+\s+jointly and severally with\s+[^.;]{2,120})?/g),
  ].map((m) => m[0]);
  return [...new Set([...addresseePassages(t).map((p) => p.whole), ...fines])].join(" ¶ ");
}

/**
 * The fines a decision's text states, each on the addressee it names, as a number of euros (or ecus) and never a float:
 * the summaries' list ("Delivery Hero SE: EUR 223 285 000"), the older article ("A fine of ECU 600 000 is hereby imposed
 * on Tretorn Sport Limited", "A fine of EUR 1 060 000 000 has been imposed on Intel Corporation"), and the abuse cases'
 * sentences ("imposes a fine of EUR 4 342 865 000 on Google, of which EUR 1 921 666 000 jointly and severally with
 * Alphabet"; "the final amount of the fine imposed on Alphabet Inc. and Google Inc. is: EUR 1 494 459 000, of which …"),
 * where a parent liable for a part only is given none. A fine the text states some other way is not read.
 */
export function decisionFines(text: string): EuFine[] {
  // the excerpt's passages are read apart, as a list's items are
  const t = text.replace(/\s+/g, " ").replace(/\s*¶\s*/g, "; ");
  const out: EuFine[] = [];
  const push = (who: string, cur: string, figure: string, million: string | undefined, partOnly?: string) => {
    const amount = amountOf(figure, !!million);
    // a fine of nothing, an immunity's, is no fine
    if (!amount || amount.length > 13 || /^0+$/.test(amount)) return;
    const part = partOnly ? addresseeName(partOnly) : null;
    const names = entryNames(who.replace(/,?\s*jointly and severally(?: liable)?\s*$/, ""), false).filter((n) => n !== part);
    const currency = /ecu/i.test(cur) ? "ECU" : "EUR";
    if (names.length && !out.some((f) => f.amount === amount && f.names.join("|") === names.join("|"))) out.push({ names, currency, amount });
  };
  // the summaries' list: "(b) on Autoliv, Inc. and Autoliv B.V. & Co KG., jointly and severally: EUR 121 211 000",
  // "(b) BAM NBM: BAM NBM Wegenbouw BV: EUR 13,5 million"
  // an item is never read across a sentence's end, nor from a sentence that says on whom a fine is imposed (read below)
  for (const m of t.matchAll(new RegExp(String.raw`(?:^|[;:]|\(\w{1,4}\))\s*(?:on\s+)?(?![^;:]*\bimposed\b)((?:[^;:().]|\.(?!\s+(?:\p{Lu}|\())|\([^()]*\))+?)\s*:\s*(EUR|ECU)\s?${FIGURE}`, "gu"))) push(m[1], m[2], m[3], m[4]);
  for (const m of t.matchAll(new RegExp(String.raw`\b[Aa] fine of (EUR|ECU|ecu)\s?${FIGURE}(?:\s*\([^)]*\))?\s+(?:is|shall be|has been) (?:hereby )?imposed (?:up)?on\s+([\s\S]{0,200}?)(?=\s+(?:jointly|in respect|for the)\b|[.;]|$)`, "g"))) push(m[4], m[1], m[2], m[3]);
  for (const m of t.matchAll(new RegExp(String.raw`\bimposes? a fine of (EUR|ECU)\s?${FIGURE}\s+(?:up)?on\s+([^,.;]{2,120}?)(?=,\s*of which|\s+jointly|\s+for\b|[.;,]|$)`, "g"))) push(m[4], m[1], m[2], m[3]);
  for (const m of t.matchAll(new RegExp(String.raw`\bthe (?:final )?(?:amount of the )?fines? imposed on\s+([^:;]{2,200}?)\s+(?:is|amounts? to):?\s*(EUR|ECU)\s?${FIGURE}(?:,\s*of which (?:EUR|ECU)\s?[\d  .,]+\s+jointly and severally with\s+([^.;]{2,120}?)(?=\.\s|\.$|[;]|$))?`, "g")))
    push(m[1], m[2], m[3], m[4], m[5]);
  return out;
}

/** A fine's figure as the texts write it: "1 494 459 000", "553.000.000", "4,65 million" (a decimal comma before "million"). */
const FIGURE = String.raw`((?:\d{1,3}(?:[  .,]\d{3})+|\d+)(?:,\d{1,3}(?=\s*million))?)(\s*million)?\b`;

/** A figure's whole number of euros, as a string of digits: "4,65" million is 4650000. */
function amountOf(figure: string, million: boolean): string {
  if (!million) return figure.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
  const [whole, frac = ""] = figure.replace(/[  ]/g, "").split(/[,.](?=\d{1,3}$)/);
  return `${whole.replace(/[^\d]/g, "")}${frac.padEnd(6, "0").slice(0, 6)}`.replace(/^0+(?=\d)/, "");
}

/** The name a decision's title gives its case: "(Case AT.39740 — Google Search (Shopping))" → "Google Search (Shopping)". */
export function caseTitle(title: string): string | null {
  // the dash after the number, never the hyphen in it ("COMP/C-3/37.990 — Intel")
  const m = /\((?:Cases?\s+)?(?:AT|COMP|IV|SA|DMA|DSA)[^—–()]{0,40}?(?:\s*[—–]\s*|\s+-\s+)/.exec(title);
  if (!m) return null;
  const rest = title.slice(m.index + m[0].length);
  let depth = 1;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "(") depth++;
    else if (rest[i] === ")" && --depth === 0) return rest.slice(0, i).trim() || null;
  }
  return null;
}

/** A fine a decision imposes, in whole euros (or ecus) as a string of digits, on the addressees liable for it jointly. */
export interface EuFine {
  names: string[];
  currency: "EUR" | "ECU";
  amount: string;
}

export interface EuDecision {
  work: string;
  published: string;
  title: string;
  /** the day the title gives the decision, else its publication's */
  day: string;
  cases: string[];
  addressees: string[];
  fines: EuFine[];
  /** whether its text was read */
  read: boolean;
}

export interface EuStateAid {
  work: string;
  published: string;
  title: string;
  /** a final decision's day, from its title; an invitation to comment's is its publication's */
  day: string;
  cases: string[];
  beneficiaries: string[];
  /** an invitation to comment opens a formal investigation; the rest are decisions */
  opening: boolean;
}

/** The names a State aid title's beneficiary phrase holds: "Flughafen Lübeck GmbH and Ryanair", "Wizz Air, Ryanair and other airlines". */
export function beneficiaryNames(phrase: string): string[] {
  return phrase
    .split(/\s*(?:,|;|\(|\)|\band\b|&(?=\s+other)|—|–)\s*|\s+(?:at|in|for|concerning|regarding|with|through|using)\s+/)
    .map((x) => x.replace(/^(?:the|its|other)\s+/i, "").replace(/['’]s\s[\s\S]*$/, "").trim())
    .filter((x) => x && /^\p{Lu}/u.test(x) && !/\b(?:airport|airports|airlines|carriers|Chamber|sector|region|undertakings|companies)\b/i.test(x));
}

export const LIST_COLUMNS = ["work", "published", "title", "types"] as const;
export const TEXT_COLUMNS = ["work", "excerpt"] as const;

let cached: { path: string; decisions: EuDecision[]; aid: EuStateAid[] } | null = null;
const alnum = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The committed file's decisions, each once by case and day (a decision printed whole and summarised is one), and its State aid titles. */
export function euAntitrust(path = EU_ANTITRUST_DATA): { decisions: readonly EuDecision[]; aid: readonly EuStateAid[] } {
  if (cached?.path === path) return cached;
  const body = JSON.parse(gunzipSync(readFileSync(path)).toString("utf8")) as { antitrust: unknown[][]; stateaid: unknown[][]; texts: unknown[][] };
  // each decision's addressees and fines, read from the excerpt the file keeps of its text
  const texts = new Map(body.texts.map((r) => [String(r[0]), { addressees: decisionAddressees(String(r[1] ?? "")), fines: decisionFines(String(r[1] ?? "")) }]));
  const decisions: EuDecision[] = [];
  const byKey = new Map<string, EuDecision>();
  for (const r of body.antitrust) {
    const [work, published, title] = r.map(String);
    const cases = caseNumbers(title);
    const day = decidedOn(title) ?? published;
    const t = texts.get(work);
    const key = `${cases[0] ?? work}@${day}`;
    const held = byKey.get(key);
    if (held) {
      // the decision's full text and its summary: their addressees and fines are one decision's
      for (const a of t?.addressees ?? []) if (!held.addressees.includes(a)) held.addressees.push(a);
      for (const f of t?.fines ?? []) if (!held.fines.some((x) => x.amount === f.amount && x.names.join("|") === f.names.join("|"))) held.fines.push(f);
      held.read ||= !!t;
      continue;
    }
    const d: EuDecision = { work, published, title, day, cases, addressees: [...(t?.addressees ?? [])], fines: [...(t?.fines ?? [])], read: !!t };
    byKey.set(key, d);
    decisions.push(d);
  }
  const aid: EuStateAid[] = body.stateaid.map((r) => {
    const [work, published, title] = r.map(String);
    const opening = /Invitation to submit comments/i.test(title);
    const phrase = beneficiaryOf(title);
    return { work, published, title, day: opening ? published : (decidedOn(title) ?? published), cases: caseNumbers(title), beneficiaries: phrase ? beneficiaryNames(phrase) : [], opening };
  });
  cached = { path, decisions, aid };
  return cached;
}

/**
 * The namesakes, and the old records' names, the rule would give a company that are not its, by CIK, read by hand
 * (batch 177) among every addressee and beneficiary a replay of every listed company matched; one with `before` only
 * before that day.
 */
export const NOT_THE_COMPANY: Readonly<Record<number, { ticker: string; party: RegExp; before?: string; why: string }[]>> = {
  1751788: [
    {
      ticker: "DOW",
      party: /^(?:The )?Dow(?: Chemical(?: Company)?)?\b/,
      before: "2019-04-01",
      why: "The Dow Chemical Company of before 2019 (\"Dow\" in the chloroprene rubber decision of 2007), whose own record is not Dow Inc.'s; Dow Inc. became its parent on the separation from DowDuPont of 2019-04-01",
    },
  ],
  1530950: [
    {
      ticker: "POST",
      party: /^Post$/,
      why: "\"Post\", the REIMS II decision's short name for a postal operator (1999), not Post Holdings, the cereal maker, whose own decisions would name it in full",
    },
  ],
};

/**
 * The units the decisions name that no other map holds, each on its owner's page between the days a filing gives, or
 * through the record's life where the unit is the company's own (batch 177), read by hand among the addressees the
 * rule left to no page.
 */
export const EU_UNITS: Readonly<Record<number, { ticker: string; party: RegExp; from?: string; to?: string; why: string }[]>> = {
  37996: [{ ticker: "F", party: /^Ford[- ]Werke\b/, why: "Ford's German company, Ford-Werke, the company's own since 1925, through the record's life" }],
  313807: [{ ticker: "BP", party: /^BP Chemicals\b/, why: "BP's own chemicals company, named after it, through the record's life" }],
};

/** Whether a decision's addressee or an aid's beneficiary is the company on the day. */
export function competitionPartyIsCompany(party: string, day: string, cik: number, names: () => string[]): boolean {
  const refused = (p: string) => !!NOT_THE_COMPANY[cik]?.some((r) => r.party.test(p) && (!r.before || day < r.before));
  if (refused(party)) return false;
  if (EU_UNITS[cik]?.some((u) => (!u.from || day >= u.from) && (!u.to || day <= u.to) && u.party.test(party))) return true;
  return partyIsCompany(party, day, cik, names, refused);
}

const DAY = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m - 1]} ${dd}, ${y}`;
};
const figure = (amount: string) => amount.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
/**
 * The names a row shows and counts: a one-word short name of a name given whole is that name ("Hitachi" of "Hitachi,
 * Ltd", "Shell" of "Shell Nederland Verkoopmaatschappij BV"), and a short name stays where it is all the decision gives.
 */
const whole = (names: string[]) => names.filter((a) => /\s/.test(a.trim()) || !names.some((b) => b !== a && /\s/.test(b.trim()) && alnum(b).startsWith(alnum(a))));
const LIMIT = 1_200;

/** The company's antitrust decisions and State aid notices and decisions as timeline events, newest first, from `from`: one row a day. */
export function euAntitrustEvents(
  decisions: readonly EuDecision[],
  aid: readonly EuStateAid[],
  namesIn: (year: number) => string[],
  { cik, from = "", namesOn }: { cik: number | string; from?: string; namesOn?: (day: string) => string[] },
): TimelineEvent[] {
  const tag = Number(cik);
  const byYear = new Map<number, string[]>();
  const yearNames = (year: number) => byYear.get(year) ?? byYear.set(year, namesIn(year)).get(year)!;
  const names = (day: string) => () => [...yearNames(Number(day.slice(0, 4))), ...(namesOn?.(day) ?? [])];
  type Found = { kind: "antitrust"; d: EuDecision; mine: string[] } | { kind: "aid"; a: EuStateAid; mine: string[] };
  const byDay = new Map<string, Found[]>();
  for (const d of decisions) {
    if (d.day < from || !d.addressees.length) continue;
    const mine = d.addressees.filter((p) => competitionPartyIsCompany(p, d.day, tag, names(d.day)));
    if (mine.length) (byDay.get(d.day) ?? byDay.set(d.day, []).get(d.day)!).push({ kind: "antitrust", d, mine });
  }
  const seenAid = new Set<string>();
  for (const a of aid) {
    if (a.day < from || !a.beneficiaries.length) continue;
    const mine = a.beneficiaries.filter((p) => competitionPartyIsCompany(p, a.day, tag, names(a.day)));
    // a notice and its corrigendum, or one printed twice, is one
    const key = `${a.cases[0] ?? a.work}@${a.day}@${a.opening}`;
    if (!mine.length || seenAid.has(key)) continue;
    seenAid.add(key);
    (byDay.get(a.day) ?? byDay.set(a.day, []).get(a.day)!).push({ kind: "aid", a, mine });
  }
  const rows: TimelineEvent[] = [];
  for (const [day, found] of byDay) {
    const parts = found.map((f) => {
      if (f.kind === "antitrust") {
        const ref = f.d.cases[0] ? `Case ${f.d.cases[0]}${caseTitle(f.d.title) ? ` (${caseTitle(f.d.title)})` : ""}` : (caseTitle(f.d.title) ?? "a competition case");
        const fines = f.d.fines.filter((x) => x.names.some((n) => f.mine.some((m) => alnum(m).startsWith(alnum(n)) || alnum(n).startsWith(alnum(m)))));
        const shown = whole(f.mine);
        const count = whole(f.d.addressees).length;
        const fined = fines.length
          ? ` Fines: ${fines.map((x) => `${x.currency} ${figure(x.amount)} on ${x.names.map(named).join(" and ")}${x.names.length > 1 ? ", jointly and severally" : ""}`).join("; ")}.`
          : "";
        return {
          title: `The European Commission's decision in ${ref} was addressed to ${shown.map(named).join(" and ")}`,
          line: `${ref}: the Commission's decision of ${DAY(day)}, addressed to ${shown.map(named).join(" and ")} among ${count} addressee${count === 1 ? "" : "s"}.${fined}`,
          id: f.d.cases[0] ?? f.d.work,
          url: eurLexPage(f.d.work),
        };
      }
      const ref = f.a.cases[0] ? `State aid ${f.a.cases[0]}` : "a State aid case";
      return {
        title: f.a.opening
          ? `The European Commission invited comments on ${ref}, its formal investigation of aid to ${f.mine.map(named).join(" and ")}`
          : `The European Commission decided on ${ref}, aid to ${f.mine.map(named).join(" and ")}`,
        line: f.a.opening
          ? `${ref}: the Commission's invitation to comment, opening a formal investigation, published in the Official Journal on ${DAY(day)}; the company the aid's beneficiary (${f.mine.map(named).join(", ")}), the member state the addressee.`
          : `${ref}: the Commission's decision of ${DAY(day)}; the company the aid's beneficiary (${f.mine.map(named).join(", ")}), the member state the addressee.`,
        id: f.a.cases[0] ?? f.a.work,
        url: eurLexPage(f.a.work),
      };
    });
    const title = parts.length === 1 ? parts[0].title : `The European Commission's ${parts.length} competition decisions naming the company: ${parts.map((p) => p.title.replace(/^The European Commission(?:'s)? /, "")).join("; ")}`;
    const text =
      "A decision of the European Commission under the EU's competition rules, as the Official Journal prints it, or its State aid notice; a decision can be appealed to the EU courts, and the row says what the Commission did on its day. " +
      parts.map((p) => p.line).join(" ");
    rows.push({
      id: `eu-antitrust-${tag}-${day}`,
      date: day,
      type: "regulation",
      title: title.length <= 300 ? title : `${title.slice(0, 299).replace(/\s+\S*$/, "")}…`,
      description: text.length <= LIMIT ? text : `${text.slice(0, LIMIT - 1).replace(/\s+\S*$/, "")}…`,
      source: "European Commission, Official Journal (© European Union)",
      url: parts[0].url,
      sourceKey: "eu_antitrust",
      // the day's case numbers, compared as a set by "Also on" (lib/alsoOn.ts)
      externalId: [...new Set(parts.map((p) => p.id))].join(","),
      dedupBasis: `eu-antitrust:${tag}@${day}`,
    });
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

