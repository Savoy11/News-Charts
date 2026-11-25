import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { EU_SPARQL, eurLexPage } from "./euMergers";
import { named, partyIsCompany } from "./hsrEarly";
import type { TimelineEvent } from "./types";

/**
 * The EU courts' judgments in the company's own cases, 1955 on, the year lists asked from 1954 (batch 183; the 2026-11-22c proposal 3, approved by the
 * owner that day with call (a): every judgment naming the company as a party, but the trade mark and design cases against
 * the EU's intellectual property office and staff cases).
 *
 * The judgments are the Court of Justice's, the General Court's (the Court of First Instance's to 2009) and, until 2016,
 * the Civil Service Tribunal's, listed by the EU Publications Office's SPARQL endpoint year by year by their English
 * titles holding "judgment of the" (`courtsQuery`), as batches 174 and 177 read the Commission's notices. A judgment is two
 * works: the judgment itself, its title the court, the day, the parties and the subject ("Judgment of the Court of First
 * Instance (Second Chamber, extended composition) of 14 December 2005.#General Electric Company v Commission of the
 * European Communities.#Action for annulment - Competition - …#Case T-210/01."), and the Official Journal's notice of it,
 * printed weeks later ("Judgment of the Court (Fourth Chamber) of 20 January 2005 in Case C-300/03 (reference for a
 * preliminary ruling …): Honeywell Aerospace GmbH v Hauptzollamt Gießen (Community transit — …)"), whose text gives the
 * judgment's operative part (`operativePart`). The two are one judgment by their cases and day (`mergeJudgments`). The
 * parties are the title's, each side's names split only where every part is a legal name (`sideParties`: "Apple and Pear
 * Australia Ltd" is one), a case naming the EU's intellectual property office a trade mark or design case, the Civil
 * Service Tribunal's a staff case, neither kept. A party is the company's by the merger notices' rule (`partyIsCompany`),
 * its namesakes in `NOT_THE_COMPANY`, its units in `EU_COURT_UNITS`. `npm run sync:eu-courts` commits the file
 * (`data/eu-courts.json.gz`); ingest asks nothing. Credit: "Court of Justice of the European Union", whose copyright page
 * lets the case-law be reproduced with the source acknowledged; the notices "© European Union, https://eur-lex.europa.eu".
 */
export const EU_COURTS_DATA = join(__dirname, "..", "data", "eu-courts.json.gz");

/** The first year asked: the Court of Justice's first judgment, of 1954. */
export const FIRST_YEAR = 1954;

/** The endpoint's query for one year's English titles holding "judgment of the", each with its formats; a year holds under 5,000. */
export function courtsQuery(year: number): string {
  return `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
SELECT ?w ?d ?t (GROUP_CONCAT(DISTINCT ?mt; separator=",") AS ?types) WHERE {
  ?e cdm:expression_title ?t .
  ?t bif:contains '"judgment of the"' .
  ?e cdm:expression_belongs_to_work ?w .
  ?e cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/ENG> .
  ?w cdm:work_date_document ?d .
  FILTER(?d >= "${year}-01-01"^^xsd:date && ?d <= "${year}-12-31"^^xsd:date)
  OPTIONAL { ?m cdm:manifestation_manifests_expression ?e . ?m cdm:manifestation_type ?mt . }
} GROUP BY ?w ?d ?t ORDER BY ?d ?w LIMIT 5000`;
}
export const courtsQueryUrl = (year: number) => `${EU_SPARQL}?${new URLSearchParams({ query: courtsQuery(year), format: "application/sparql-results+json", timeout: "120000" })}`;

export type Court = "Court of Justice" | "General Court" | "Civil Service Tribunal";

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const dayOf = (d: string, m: string, y: string) => {
  const mm = MONTHS.indexOf(m.toLowerCase()) + 1;
  return mm > 0 ? `${y}-${String(mm).padStart(2, "0")}-${d.padStart(2, "0")}` : null;
};

/**
 * A title's case numbers, "T-210/01", "C-12/03 P" (an appeal), "F-1/05", each once, in order; in a case list (`bare`) a
 * number with no letter is the Court of Justice's of before 1989, "Case 1/55" read as C-1/55.
 */
export function caseNumbers(text: string, bare = false): string[] {
  const out: string[] = [];
  const re = bare ? /(?:\b([CTF])\s*[-‑–]?\s*|(?<![\w/-]))(\d{1,4})\s*\/\s*(\d{2,4})\b(\s*P\b)?/g : /\b([CTF])\s*[-‑–]\s*(\d{1,4})\s*\/\s*(\d{2,4})\b(\s*P\b)?/g;
  for (const m of text.matchAll(re)) {
    const n = `${m[1] ?? "C"}-${m[2]}/${m[3]}${m[4] ? " P" : ""}`;
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

/** A case list at a text's head ("C-124/03", "242/83", "T-125/03 and T-253/03"), and what follows it. */
// (an item may give its number alone where the next gives the year, "63 and 69/72", "13 to 28/82"; "C 169/88" writes no dash)
const CASE_LIST = /^((?:[CTF]\s*[-‑–]?\s*)?\d{1,4}(?:\s*\/\s*\d{2,4})?(?:\s*P\b)?(?:\s*(?:,|and|to|&)\s*(?:[CTF]\s*[-‑–]?\s*)?\d{1,4}(?:\s*\/\s*\d{2,4})?(?:\s*P\b)?)*)\s*(.*)$/;

/** A balanced bracket a text begins with, and what follows it. */
function leadingBracket(s: string): { inside: string; after: string } | null {
  if (!s.startsWith("(")) return null;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")" && --depth === 0) return { inside: s.slice(1, i), after: s.slice(i + 1).trim() };
  }
  return null;
}

/** A judgment as a title gives it. */
export interface TitleRead {
  form: "judgment" | "notice";
  court: Court;
  day: string;
  cases: string[];
  /** the sides, "X v Y": each its parties' names as the title writes them */
  sides: string[];
  subject: string;
  /** a reference for a preliminary ruling's court and country */
  reference?: string;
}

const COURT = /^Judgment of the (Court of First Instance|General Court|Civil Service Tribunal|Court of Justice|Court)\b/i;
const courtOf = (s: string): Court => (/First Instance|General Court/i.test(s) ? "General Court" : /Civil Service/i.test(s) ? "Civil Service Tribunal" : "Court of Justice");

/** The balanced bracket a text ends with, and what is before it: "Parties (Subject — …)" or "((Subject))". */
function trailingBracket(s: string): { before: string; inside: string } | null {
  const t = s.trimEnd().replace(/\.$/, "");
  if (!t.endsWith(")")) return null;
  let depth = 0;
  for (let i = t.length - 1; i >= 0; i--) {
    if (t[i] === ")") depth++;
    else if (t[i] === "(") {
      depth--;
      if (depth === 0) {
        let inside = t.slice(i + 1, -1).trim();
        if (inside.startsWith("(") && inside.endsWith(")")) inside = inside.slice(1, -1).trim();
        return { before: t.slice(0, i).trim(), inside };
      }
    }
  }
  return null;
}

/** A reference's court, as a title writes it: "Reference for a preliminary ruling from the Hoge Raad der Nederlanden" is the Hoge Raad der Nederlanden. */
const refOf = (s: string) =>
  s.replace(/^\(?\s*(?:references?|requests?) for (?:a )?preliminary rulings?\s*(?:made\s+)?(?:under [^:]*?)?(?:from|by)?\s*:?\s*(?:the\s+)?/i, "").replace(/[.)]$/, "").trim();

/** The notice whose case list leads its title, read from the "Judgment of the …" that follows it. */
function leadNotice(caseText: string, rest: string): TitleRead | null {
  const c = COURT.exec(rest);
  const d = /\bof\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b/.exec(rest);
  const day = d && dayOf(d[1], d[2], d[3]);
  if (!c || !d || !day) return null;
  let after = rest.slice(d.index + d[0].length).trim();
  let reference: string | undefined;
  const lead = leadingBracket(after);
  if (lead) {
    if (/preliminary ruling/i.test(lead.inside)) reference = refOf(lead.inside);
    after = lead.after;
  }
  after = after.replace(/^[—–-]\s*/, "").trim();
  const tail = trailingBracket(after);
  const parties = (tail ? tail.before : after).replace(/[.:]$/, "").trim();
  if (!parties) return null;
  return { form: "notice", court: courtOf(c[1]), day, cases: [...new Set([...caseNumbers(caseText, true), ...caseNumbers(parties)])], sides: sidesOf(parties), subject: tail?.inside ?? "", ...(reference ? { reference } : {}) };
}

/** Reads a listed title, the judgment's own or its notice's; null where it is neither (an order, an opinion, a summary). */
export function readJudgmentTitle(title: string): TitleRead | null {
  const whole = title.replace(/\s+/g, " ").trim();
  // the Official Journal's notice since 2008: "Case C-498/06: Judgment of the Court (Fourth Chamber) of 21 February 2008
  // (reference for a preliminary ruling from …) — A v B (subject)"
  const caseLed = /^((?:Joined\s+)?Cases?\s+[^:]{1,200}?):\s*(Judgment of the .+)$/i.exec(whole);
  if (caseLed) return leadNotice(caseLed[1], caseLed[2]);
  const t = whole;
  const c = COURT.exec(t);
  if (!c) return null;
  const court = courtOf(c[1]);
  if (t.includes("#")) {
    const seg = t.split("#").map((s) => s.trim()).filter(Boolean);
    // "of 14 December 2005.", "(First Chamber), 19 July 2012.", "of 24 October 2019 (Extracts)."
    const d = /(?:\bof|,)\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})(?:\s*\([^)]*\))?\.?$/.exec(seg[0]);
    const day = d && dayOf(d[1], d[2], d[3]);
    if (!day || seg.length < 2) return null;
    const parties = seg[1].replace(/\.$/, "");
    const rest = seg.slice(2);
    const ref = rest.find((s) => /^(?:Reference|Request) for a preliminary ruling/i.test(s));
    const caseSeg = rest.filter((s) => /^(?:Joined )?Cases?\b/i.test(s));
    const subject = rest.filter((s) => s !== ref && !caseSeg.includes(s)).map((s) => s.replace(/\.$/, "")).join(" — ");
    const cases = [...new Set([...caseNumbers(caseSeg.join(" "), true), ...caseNumbers(parties)])];
    return { form: "judgment", court, day, cases, sides: sidesOf(parties), subject, ...(ref ? { reference: refOf(ref) } : {}) };
  }
  // the Official Journal's notice: "Judgment of the Court (…) of 28 October 2004 in Case C-124/03 (reference …): A v B ((subject))",
  // its colon left out in some ("in Case T-354/03 Gemma Reggimenti v European Parliament (Officials — …)")
  const n = /\bof\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s+in\s+(?:Joined\s+)?Cases?\s+(.+)$/i.exec(t);
  if (!n) return null;
  const day = dayOf(n[1], n[2], n[3]);
  const list = CASE_LIST.exec(n[4]);
  if (!day || !list) return null;
  let rest = list[2].trim();
  let reference: string | undefined;
  const lead = leadingBracket(rest);
  if (lead && /^(?:references?|requests?) for (?:a )?preliminary rulings?/i.test(lead.inside)) {
    reference = refOf(lead.inside);
    rest = lead.after;
  }
  const phrase = /^Reference for a preliminary ruling (?:from|by) (?:the )?(.+?) in (?=\S)/i.exec(rest);
  if (phrase) {
    reference = phrase[1].trim();
    rest = rest.slice(phrase[0].length);
  }
  rest = rest.replace(/^:\s*/, "").replace(/^in the (?:proceedings|case|matter)(?: of)?(?: between)?\s+/i, "").trim();
  const tail = trailingBracket(rest);
  const parties = (tail ? tail.before : rest).replace(/[.:]$/, "").trim();
  if (!parties) return null;
  return { form: "notice", court, day, cases: [...new Set([...caseNumbers(list[1], true), ...caseNumbers(parties)])], sides: sidesOf(parties), subject: tail?.inside ?? "", ...(reference ? { reference } : {}) };
}

/** The words a legal name ends with, in the EU's languages as its courts write them. */
const LEGAL_END =
  /\b(?:Inc|Corp|Corporation|Company|Co|Ltd|Limited|plc|PLC|LLC|LP|L\.P|AG|SE|SA|S\.A|SpA|S\.p\.A|Srl|S\.r\.l|NV|N\.V|BV|B\.V|GmbH|KG|KGaA|AB|A\/S|ASA|Oyj|Oy|SAS|SARL|Sàrl|SL|S\.L|Lda|ApS|AS|SNC|DAC|UC|ULC|a\.s|s\.r\.o|z o\.o|Kft|Zrt|Nyrt|OOO|OAO|PAO|JSC|ehf|hf|AE|SAE|Holding|Holdings|International|Group|Bank|& Co)\.?$/i;

/**
 * A public body a caption names beside a company: a ministry, a tax or customs office, a state, a region, an authority.
 * Its end is no ASCII word boundary, which a word ending in "à" never has (batch 184: "Autorità Garante").
 */
const PUBLIC_BODY =
  /\b(?:Ministero|Ministry|Minister|Ministre|Ministerio|Ministerie|Commission|Council|Parliament|Republic|Republik|Kingdom|Grand Duchy|Duchy|State|Staat|Stato|Estado|Hauptzollamt|Finanzamt|Zollamt|Autorità|Autoridad|Agencia|Agency|Bundesrepublik|Land|Revenue|Customs|Government|Région|Region|Regione|Comune|Ville|Gemeente|City|Municipality|Authority|Board|Commissioners?|Staatssecretaris|Administration|Inspectorate|Directorate|Préfet|Inspector|Bundesamt|Bundesanstalt|Office|Tribunal)(?![\p{L}\p{N}])/u;

/**
 * A side's parties: its names split at commas and "and" only where every part is a legal name or a public body (so
 * "Ministero dello Sviluppo economico and ENI SpA" is two, "Apple and Pear Australia Ltd" one); "and Others" off, and
 * "and Co." a name's own ("Eli Lilly and Co.").
 */
export function sideParties(side: string): string[] {
  const { s, parts } = sideParts(side);
  if (!s) return [];
  return parts.length > 1 && parts.every(namedPart) ? parts : [s];
}

/**
 * The parts of a side `sideParties` keeps whole that end in a legal word: the name a row prints for the company where the
 * whole side names it (batch 184, the audit's finding 9: "Matina Stevi and The New York Times Company" prints "The New York
 * Times Company").
 */
export function legalParts(side: string): string[] {
  const { parts } = sideParts(side);
  return parts.length > 1 ? parts.filter((p) => LEGAL_END.test(p.replace(/\s*\([^)]*\)\s*$/, ""))) : [];
}

const namedPart = (p: string) => LEGAL_END.test(p.replace(/\s*\([^)]*\)\s*$/, "")) || PUBLIC_BODY.test(p);

function sideParts(side: string): { s: string; parts: string[] } {
  const s = side
    .replace(/\s*\((?:Case|Joined Cases)?\s*[CTF]-\d[^)]*\)/gi, "")
    .replace(/,?\s+and (?:Others|others|Other)\b\.?/g, "")
    // a party's former name, or the one it succeeded, is a name of its own ("Ryanair DAC, formerly Ryanair Ltd")
    .replace(/,?\s+(?:formerly|successor in law to|venant aux droits de)\s+/gi, ", ")
    .replace(/\s+and\s+(Co\.?)(?=,|\s|$)/g, " & $1")
    .replace(/\s+/g, " ")
    .trim();
  return { s, parts: s ? s.split(/,\s+(?!(?:Inc|Ltd|LLC|S\.?A|N\.?V|B\.?V|AG|SE|plc)\b)|\s+and\s+/).map((p) => p.trim()).filter(Boolean) : [] };
}

/** A title's sides, "X v Y", each its text; a reference naming one party is one side. */
export function sidesOf(parties: string): string[] {
  return parties.split(/\s+v\.?\s+/).map((s) => s.trim()).filter(Boolean);
}

/** Whether a judgment is a trade mark or design case against the EU's intellectual property office (call (a) leaves them off). */
export const isTradeMarkCase = (sides: readonly string[]) =>
  sides.some((s) => /Office for Harmoni[sz]ation in the Internal Market|European Union Intellectual Property Office|\bOHIM\b|\bEUIPO\b/i.test(s));

/** A judgment, its two works joined: the judgment's own and the Official Journal's notice of it. */
export interface Judgment {
  court: Court;
  day: string;
  cases: string[];
  sides: string[];
  subject: string;
  reference?: string;
  judgment?: string;
  notice?: string;
  /** the operative part, from the notice's text or the judgment's */
  operative?: string;
}

/** Joins the works of one judgment, by its first case and day; the judgment's own title gives the parties where both are held. */
export function mergeJudgments(read: readonly (TitleRead & { work: string })[]): Judgment[] {
  const by = new Map<string, Judgment>();
  for (const r of [...read].sort((a, b) => (a.form === b.form ? 0 : a.form === "judgment" ? -1 : 1))) {
    if (!r.cases.length) continue;
    const key = `${r.cases[0]}|${r.day}`;
    const had = by.get(key);
    if (!had) {
      by.set(key, { court: r.court, day: r.day, cases: r.cases, sides: r.sides, subject: r.subject, ...(r.reference ? { reference: r.reference } : {}), [r.form]: r.work });
      continue;
    }
    if (!had[r.form]) had[r.form] = r.work;
    for (const c of r.cases) if (!had.cases.includes(c)) had.cases.push(c);
    if (!had.subject && r.subject) had.subject = r.subject;
  }
  return [...by.values()].filter((j) => j.court !== "Civil Service Tribunal" && !isTradeMarkCase(j.sides));
}

/**
 * A judgment's operative part, as its notice prints it ("Operative part of the judgment: 1. Annuls …; 2. Orders …") or
 * its own text closes ("On those grounds, the Court hereby: 1. Dismisses the action; …"), its numbered items joined; null
 * where neither is found.
 */
export function operativePart(text: string): string | null {
  const t = text.replace(/\s+/g, " ");
  const m = /Operative part of the judgment[:.]?\s*(?:The Court(?: \([^)]*\))?\s*(?:hereby)?\s*:?\s*)?(.+)$/i.exec(t) ?? /On those grounds,?[^:]{0,200}?hereby(?: rules)?\s*:\s*(.+)$/i.exec(t);
  if (!m) return null;
  let s = m[1].replace(/\[?Signatures\]?.*$/i, "").replace(/\s*\(\d+\)\s*OJ\b.*$/i, "").replace(/\s+Delivered in open court.*$/i, "").trim();
  if (s.length > 600) s = `${s.slice(0, 599).replace(/\s+\S*$/, "")}…`;
  return s || null;
}

/** The committed file's columns for a judgment. */
export const JUDGMENT_COLUMNS = ["court", "day", "cases", "sides", "subject", "reference", "judgment", "notice", "operative"] as const;
const COURT_CODE: Record<Court, string> = { "Court of Justice": "CJ", "General Court": "GC", "Civil Service Tribunal": "CST" };
const CODE_COURT: Record<string, Court> = { CJ: "Court of Justice", GC: "General Court", CST: "Civil Service Tribunal" };
export const judgmentRow = (j: Judgment) => [COURT_CODE[j.court], j.day, j.cases, j.sides, j.subject, j.reference ?? null, j.judgment ?? null, j.notice ?? null, j.operative ?? null];
export const judgmentOf = (r: readonly unknown[]): Judgment => ({
  court: CODE_COURT[String(r[0])] ?? "Court of Justice",
  day: String(r[1]),
  cases: (r[2] as string[]) ?? [],
  sides: (r[3] as string[]) ?? [],
  subject: String(r[4] ?? ""),
  ...(r[5] ? { reference: String(r[5]) } : {}),
  ...(r[6] ? { judgment: String(r[6]) } : {}),
  ...(r[7] ? { notice: String(r[7]) } : {}),
  ...(r[8] ? { operative: String(r[8]) } : {}),
});

let cached: { path: string; judgments: Judgment[] } | null = null;

/** The committed judgments. */
export function euCourts(path = EU_COURTS_DATA): readonly Judgment[] {
  if (cached?.path === path) return cached.judgments;
  const body = existsSync(path) ? (JSON.parse(gunzipSync(readFileSync(path)).toString("utf8")) as { judgments: unknown[][] }) : { judgments: [] };
  cached = { path, judgments: body.judgments.map(judgmentOf) };
  return cached.judgments;
}

/**
 * The namesakes the rule would give a company that are not its, by CIK, read by hand (batch 183) among every party a
 * replay of every listed company matched; one with `before` only before that day.
 */
export const NOT_THE_COMPANY: Readonly<Record<number, { ticker: string; party: RegExp; before?: string; why: string }[]>> = {
  1467858: [
    {
      ticker: "GM",
      party: /^General Motors Corporation$/i,
      why: "General Motors Corporation, the old company of before its bankruptcy of 2009 (General Motors v Yplon, 1999), whose record is not General Motors Company's, as the Supreme Court's map holds",
    },
  ],
  37785: [{ ticker: "FMC", party: /^FMC (?:plc|\(Meat\) Ltd)$/i, why: "FMC plc, the British meat company (the Fatstock Marketing Corporation's, in the BSE export case of 1996), not FMC Corporation, the chemicals maker" }],
  100493: [
    { ticker: "TSN", party: /^IBP (?:Ltd|Limited)$/i, why: "IBP Limited, the British copper fittings maker of the 2006 copper fittings decision's appeal (2011), not IBP, inc., the meatpacker Tyson bought in 2001; batch 177's map refuses it too" },
  ],
  66382: [
    {
      ticker: "MLKN",
      party: /^Knoll International S\.?p\.?A\.?$/i,
      why: "Knoll International SpA's reference of 2015, years before Herman Miller bought Knoll in 2021: Knoll's own record is not MillerKnoll's, and a bought company's past is never the buyer's",
    },
  ],
  2089271: [
    {
      ticker: "HONA",
      party: /^Honeywell Aerospace GmbH$/i,
      before: "2025-10-01",
      why: "Honeywell Aerospace GmbH's customs case of 2005, Honeywell's own German company's then (EU_COURT_UNITS), before the spin-off's record began with its draft registration of 2025-10-01 (0001628279-25-000665)",
    },
  ],
};

/** The units the judgments name that no other map holds, each on its owner's page between the days a filing gives (batch 183). */
export const EU_COURT_UNITS: Readonly<Record<number, { ticker: string; party: RegExp; from?: string; to?: string; why: string }[]>> = {
  773840: [
    {
      ticker: "HON",
      party: /^Honeywell Aerospace GmbH$/i,
      to: "2025-09-30",
      why: "Honeywell's own German aerospace company (its customs case of 2005), the company's until the record of its spin-off, Honeywell Aerospace Inc., began with a draft registration on 2025-10-01 (0001628279-25-000665)",
    },
  ],
};

/** Whether a judgment's party is the company on the day. */
export function courtPartyIsCompany(party: string, day: string, cik: number, names: () => string[]): boolean {
  const refused = (p: string) => !!NOT_THE_COMPANY[cik]?.some((r) => r.party.test(p) && (!r.before || day < r.before));
  if (refused(party)) return false;
  if (EU_COURT_UNITS[cik]?.some((u) => (!u.from || day >= u.from) && (!u.to || day <= u.to) && u.party.test(party))) return true;
  return partyIsCompany(party, day, cik, names, refused);
}

/**
 * The company's side in a judgment: in a reference, a party to the national case; in a judgment of one case between two
 * sides, the applicant (an appeal's appellant) or the defendant (its respondent); else a party, as joined cases' titles
 * run their captions together.
 */
export function sideOf(j: Pick<Judgment, "sides" | "reference" | "cases">, side: number): string {
  if (j.reference) return "a party to the national case referred";
  if (j.cases.length !== 1 || j.sides.length !== 2) return "a party";
  const appeal = / P$/.test(j.cases[0]);
  return side === 0 ? (appeal ? "the appellant" : "the applicant") : appeal ? "the respondent" : "the defendant";
}

const DAY = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m - 1]} ${dd}, ${y}`;
};
const LIMIT = 1_200;
const shortSide = (s: string) =>
  s.replace(/\bof the European Communities\b|\bof the European Union\b/g, "").replace(/\s*\((?:Case\s+)?[CTF]-\d[^)]*\)/g, "").replace(/\s+/g, " ").trim();
const caption = (j: Judgment) => j.sides.map(shortSide).join(" v ");

/** The company's judgments as timeline events, newest first, from `from`: one row a day. */
export function euCourtsEvents(
  judgments: readonly Judgment[],
  namesIn: (year: number) => string[],
  { cik, from = "", namesOn }: { cik: number | string; from?: string; namesOn?: (day: string) => string[] },
): TimelineEvent[] {
  const tag = Number(cik);
  const byYear = new Map<number, string[]>();
  const yearNames = (year: number) => byYear.get(year) ?? byYear.set(year, namesIn(year)).get(year)!;
  const names = (day: string) => () => [...yearNames(Number(day.slice(0, 4))), ...(namesOn?.(day) ?? [])];
  const byDay = new Map<string, { j: Judgment; mine: string[]; side: number }[]>();
  for (const j of judgments) {
    if (j.day < from) continue;
    let found: { mine: string[]; side: number } | null = null;
    j.sides.forEach((s, i) => {
      if (found) return;
      const is = (p: string) => courtPartyIsCompany(p, j.day, tag, names(j.day));
      const whole = sideParties(s);
      let mine = whole.filter(is);
      // a side kept whole prints the company's own part where one names it alone
      if (whole.length === 1 && mine.length === 1) {
        const own = legalParts(s).filter(is);
        if (own.length) mine = own;
      }
      if (mine.length) found = { mine, side: i };
    });
    if (found) (byDay.get(j.day) ?? byDay.set(j.day, []).get(j.day)!).push({ j, ...(found as { mine: string[]; side: number }) });
  }
  const rows: TimelineEvent[] = [];
  for (const [day, found] of byDay) {
    const parts = found.map(({ j, mine, side }) => {
      const ref = `${caption(j)} (${j.cases.join(", ")})`;
      return {
        title: `The ${j.court === "Court of Justice" ? "Court of Justice of the EU" : "EU General Court"} ruled in ${ref}${j.subject ? `: ${j.subject}` : ""}`,
        line:
          `${ref}: the ${j.court === "Court of Justice" ? "Court of Justice's" : "General Court's"} judgment of ${DAY(day)}, ${mine.map(named).join(" and ")} ${sideOf(j, side)}` +
          `${j.reference ? ` (a reference from ${j.reference})` : ""}.${j.operative ? ` The operative part: ${j.operative}` : ""}`,
        id: j.cases[0],
        url: eurLexPage(j.judgment ?? j.notice!),
      };
    });
    const title = parts.length === 1 ? parts[0].title : `The EU courts' ${parts.length} judgments in the company's cases: ${parts.map((p) => p.title.replace(/^The [^ ]+(?: [^ ]+)*? ruled in /, "")).join("; ")}`;
    const text = "A judgment of the EU courts in a case naming the company as a party, as the Publications Office lists it; the row gives the court's operative part where its text is read, never a summary of its reasons. " + parts.map((p) => p.line).join(" ");
    rows.push({
      id: `eu-courts-${tag}-${day}`,
      date: day,
      type: "regulation",
      title: title.length <= 300 ? title : `${title.slice(0, 299).replace(/\s+\S*$/, "")}…`,
      description: text.length <= LIMIT ? text : `${text.slice(0, LIMIT - 1).replace(/\s+\S*$/, "")}…`,
      source: "Court of Justice of the European Union",
      url: parts[0].url,
      sourceKey: "eu_courts",
      // the day's case numbers, compared as a set by "Also on" (lib/alsoOn.ts)
      externalId: [...new Set(parts.map((p) => p.id))].join(","),
      dedupBasis: `eu-courts:${tag}@${day}`,
    });
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}
