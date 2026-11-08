import { UA } from "./contact";
import { andSpellings } from "./edgarName";
import { LEGAL_WORD, captionParty } from "./secCases";
import type { TimelineEvent } from "./types";
import { decodeText, eachCsvRow, readZip } from "./zip";
import { takenBefore } from "./takenNames";

/**
 * The EPA's civil enforcement cases on the pages of the companies they charge (batch 95, the
 * 2026-11-05 proposal 1, approved by the owner that day).
 *
 * EPA publishes its whole case file as one zip of CSV tables, refreshed every few weeks:
 * `echo.epa.gov/files/echodownloads/case_downloads.zip`, 82 MB, 137,108 cases from the 1970s on,
 * every case EPA leads, in court or before its own judges (measured 2026-11-05, the copy of
 * 2026-10-31). It is read once a month and kept (`lib/ingest/epaWalk.ts`, db/037); each company's
 * ingest keeps the cases one of whose defendants is the company by the caption rule
 * (`captionParty`), under its names that year, from its first price.
 *
 * Licence: "Unless otherwise specified, all data produced by the U.S EPA is by default in the
 * public domain and is not subject to domestic copyright protection under 17 U.S.C. § 105." (EPA
 * Standard Open Data License, edg.epa.gov/EPA_Data_License.html, read 2026-11-05.) EPA's
 * disclaimers page says of documents on its sites: "These documents may be freely distributed and
 * used for non-commercial, scientific and educational purposes. Commercial use of the documents
 * available from the EPA websites may be protected under the U.S. and Foreign Copyright Laws."
 * (www.epa.gov/web-policies-and-procedures/epa-disclaimers, read 2026-11-05.) What is kept is the
 * file's fields, data EPA produced, and a link to EPA's own case report; no document is copied.
 * The owner approved the source with both texts in front of them.
 */
export const CASE_FILE_URL = "https://echo.epa.gov/files/echodownloads/case_downloads.zip";
export const caseReportUrl = (caseNumber: string) => `https://echo.epa.gov/enforcement-case-report?id=${encodeURIComponent(caseNumber)}`;

/** The four tables a case is read from. */
export const CASE_TABLES = ["CASE_ENFORCEMENTS.csv", "CASE_DEFENDANTS.csv", "CASE_MILESTONES.csv", "CASE_LAW_SECTIONS.csv"] as const;
/**
 * The settlements table, each settlement's penalty and the cost of the work it orders (batch 113,
 * the 2026-11-07 proposal 1). Read when the file holds it; a file without it gives the case totals
 * alone, as before.
 */
export const SETTLEMENT_TABLE = "CASE_ENFORCEMENT_CONCLUSIONS.csv";
export type CaseTables = Record<(typeof CASE_TABLES)[number], string> & { [SETTLEMENT_TABLE]?: string };

export interface EpaCase {
  /** EPA's case number, "HQ-1996-0001" */
  number: string;
  name: string;
  court: boolean;
  /** the case's public day (YYYY-MM-DD) and what happened on it */
  day: string;
  step: "lodged" | "entered" | "filed" | "order" | "complaint";
  /**
   * the penalty assessed, in whole dollars as EPA writes it, or null for none; never a float. The
   * case's total, or, where EPA gives none, its one settlement's federal and state penalty (batch 113)
   */
  penalty: string | null;
  /** the penalty is the settlement's, EPA giving the case no total (batch 113) */
  settled?: boolean;
  /** EPA's estimate of the cost of the work the case orders, by the same rule; null for none */
  workOrdered?: string | null;
  /** EPA's own summary of the case, when it says something (`summaryOf`); null for none */
  summary?: string | null;
  /** the laws, by EPA's code, in its order: "CAA", "CWA", "CERCLA" */
  laws: string[];
  defendants: string[];
  /** the Justice Department's docket number for a court case, when EPA gives one */
  docket: string | null;
  /**
   * the day the suit was filed in court, EPA's milestone "Complaint Filed With Court", for a court
   * case; null for none (batch 122, the 2026-11-08 proposal 2(a))
   */
  suitFiled?: string | null;
  /** each settlement EPA dates, in day order: its own day, penalty and work ordered (batch 122, the proposal's 2(b)) */
  settlements?: EpaSettlement[];
  /**
   * a row's view of one settlement day of a case split by settlement (`epaEvents`): which of the
   * case's settlements, in day order, it holds, of how many
   */
  settlementOf?: { first: number; last: number; of: number };
}

/** One settlement of a case: the day it was lodged in court, else entered, and its own figures, as `penaltyOf` keeps them. */
export interface EpaSettlement {
  day: string;
  /** the day is its lodging's; false when EPA gives only the day it was entered */
  lodged: boolean;
  penalty: string | null;
  work: string | null;
}

/** The laws by EPA's code, as a reader knows them. */
export const LAWS: Readonly<Record<string, string>> = {
  CAA: "Clean Air Act",
  CWA: "Clean Water Act",
  FIFRA: "pesticides law (FIFRA)",
  SDWA: "Safe Drinking Water Act",
  RCRA: "hazardous waste law (RCRA)",
  CERCLA: "Superfund law (CERCLA)",
  EPCRA: "Emergency Planning and Community Right-to-Know Act",
  TSCA: "Toxic Substances Control Act",
  AIM: "American Innovation and Manufacturing Act",
  MPRSA: "Ocean Dumping Act",
  MWTA: "Medical Waste Tracking Act",
};

/** "05/14/1990" as "1990-05-14", or null when it is no day. */
function day(us: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(us.trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[1]}-${m[2]}`;
  const t = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== iso ? null : iso;
}

/** A dollar amount as EPA writes it, "11000000" or "5100.5", kept as digits; null for none or zero. */
export function penaltyOf(raw: string): string | null {
  const m = /^\s*(\d+)(?:\.(\d{1,2}))?\s*$/.exec(raw);
  if (!m) return null;
  const whole = m[1].replace(/^0+(?=\d)/, "");
  const cents = (m[2] ?? "").replace(/0+$/, "");
  if (whole === "0" && !cents) return null;
  return cents ? `${whole}.${cents.padEnd(2, "0")}` : whole;
}

/** "11000000" as "$11,000,000", by its digits. */
export const dollars = (amount: string) => {
  const [whole, cents] = amount.split(".");
  return `$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${cents ? `.${cents}` : ""}`;
};

/** Two amounts as `penaltyOf` gives them, added in whole cents: never through a float. Null when both are. */
export function addAmounts(a: string | null, b: string | null): string | null {
  if (a === null || b === null) return a ?? b;
  const HUNDRED = BigInt(100);
  const cents = (x: string) => {
    const [whole, part = ""] = x.split(".");
    return BigInt(whole) * HUNDRED + BigInt(part.padEnd(2, "0"));
  };
  const sum = cents(a) + cents(b);
  return penaltyOf(`${sum / HUNDRED}.${(sum % HUNDRED).toString().padStart(2, "0")}`);
}

/** A summary this short says too little to show: EPA's case report link holds the rest. */
export const SUMMARY_FLOOR = 25;
/** …and one this long is cut at a word, so a page with hundreds of cases still carries its news. */
export const SUMMARY_CAP = 600;
// a summary that is only a placeholder, a step or a form note, read by hand on the 5,318 cases the
// replay's pages hold (batch 113): "CASE SUMMARY REQUESTED", "TO BE ENTERED", "CONSENT DECREE ENTERED
// ON 12/10/07", "COST RECOVERY AGMT."
const SUMMARY_SAYS_NOTHING = new RegExp(
  [
    String.raw`(?:no\s+)?case summary(?:\s+(?:requested|submitted))?`,
    // batch 116, the audit's finding 5: "AWAITING CASE SUMMARY FROM ATTORNEY", "WILL PROVIDE AT A LATER
    // DATE", and a summary that only points to another's: "PLEASE SEE BLUFF ROAD SUMMARY", "SEE CASE
    // SUMMARY OF 08-97-0150", "ALSO SEE 05-2000-0575 FOR SUMMARY ON SCREEN 6"
    String.raw`awaiting case summary(?:\s+from\s+[a-z ]+)?|will provide (?:at a later date|later)`,
    String.raw`-*\s*(?:[a-z-]+\s+){0,3}?(?:please\s+|also\s+)?see\s+(?:case\s+summary\s+(?:of\s+)?[\w#-]+|[\w#.,\s-]{1,40}?\s+summary|[\w#-]+\s+for\s+summary(?:\s+on\s+screen\s+\d+)?)\s*-*`,
    String.raw`to be (?:entered|determined|added)`,
    String.raw`pending|tbd|n\/?a|none|x+|see (?:attached|case|file)|need(?:s)? additional information`,
    String.raw`'?cost recovery(?: agmt| agreement)?'?|field citation|order issued to one respondent`,
    String.raw`(?:consent decree|cafo|order|final order|complaint)\s+(?:was\s+)?(?:entered|issued|filed|lodged|signed)\s+(?:on\s+)?\d{1,2}\/\d{1,2}\/\d{2,4}`,
  ].map((p) => `(?:${p})`).join("|"),
  "i",
);
// a step and its day and no more: "CAFO effective 10/28/2022", "This order was signed 8/13/25", "On
// 8/11/26 a NOW was issued.", "Case finish date January 6, 2025." (batch 116): every word but the day
// is one of these
const SUMMARY_DAY = String.raw`(?:\d{1,2}\/\d{1,2}\/\d{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})`;
const STEP_WORDS = new Set(
  "this the a an was is on as of into effect effective issued signed entered filed lodged finish date case cafo order now notice determination agreement consent decree final administrative ao aoc complaint and".split(" "),
);
function onlyAStepAndADay(bare: string): boolean {
  if (!new RegExp(SUMMARY_DAY, "i").test(bare)) return false;
  const words = bare.replace(new RegExp(SUMMARY_DAY, "gi"), " ").toLowerCase().split(/[^a-z]+/).filter(Boolean);
  return words.length > 0 && words.every((w) => STEP_WORDS.has(w));
}

/**
 * What a run of replacement characters stood for, read by its length and its place (batch 116, the
 * audit's finding 5, on the 39 page cases of the whole file that hold one). EPA's text lost one
 * character as one mark (a Windows character), two (a two-byte one, "§") or three (a three-byte one, a
 * curly quote or apostrophe), and two "§" as four:
 *  - before a number, a section sign: "42 U.S.C. �� 9607" is "§ 9607"; two before a list or for four
 *    marks: "�� 9606, 9607 AND 9622", "���� 11004(b) and 11004(c)";
 *  - between a letter and an "s" that ends the word, an apostrophe: "EPA���s", "SPENCER�S";
 *  - alone between two spaces, a dash: "(Denver, CO � April 20, 2023)";
 *  - before a word, an opening quotation mark, and the next run after a word its closing one:
 *    "(�AOC�)", "REFERRED TO AS �RESPONDENTS�.";
 *  - after a word's "s" and no open quotation, a plural's apostrophe: "Defendants� Nelson Dewey",
 *    "the United States� claims";
 *  - else a quotation mark.
 */
function repairLost(text: string): string {
  let open = false;
  return text.replace(/\uFFFD+/g, (run: string, at: number, all: string) => {
    const before = all[at - 1] ?? "";
    const after = all[at + run.length] ?? "";
    const rest = all.slice(at + run.length);
    // …two when four marks stood for them, or when the number begins a list: "§§ 9606, 9607 AND 9622"
    if (/^\s*\d/.test(rest)) return run.length >= 4 || /^\s*\d[\w().]*,\s*\d/.test(rest) ? "§§" : "§";
    if (/[A-Za-z]/.test(before) && /^[sS](?![A-Za-z])/.test(rest)) return "'";
    if (before === " " && after === " ") return "–";
    if ((before === "" || /[\s(\[]/.test(before)) && /[\w$]/.test(after)) {
      open = true;
      return '"';
    }
    if (open) {
      open = false;
      return '"';
    }
    return /[sS]/.test(before) ? "'" : '"';
  });
}

// a facility's record and no more: "FACILITY ADDR: 800 PHILLIPS RD…", "* FACILITY NAME: TEXAS INSTRUMENTS INC 34 FOREST ST…"
const SUMMARY_IS_ADDRESS = /^\W*(?:facility\s*(?:name|addr(?:ess)?|location|info(?:rmation)?)|address|location)\b/i;

/**
 * EPA's own summary of a case, as the row's description says it (batch 113): its spaces collapsed, a
 * word broken across a line ("INITIA-\nTIVE") joined, its capitals as EPA wrote them. A word EPA wrote
 * broken with a space, "ENVIRONMEN- TAL" (172 cases on the replay's pages), is left as written: in
 * capitals nothing but a dictionary tells it from "OZONE- DEPLETING".
 *
 * EPA's file holds a replacement character, sometimes two to four, where its text lost one: each run
 * is read by its length and its place (`repairLost`).
 *
 * Null when it says nothing: under `SUMMARY_FLOOR` characters, a placeholder or form note, a pointer
 * to another case's summary, a step and its day alone, or a facility's address. Cut at a word after
 * `SUMMARY_CAP` characters.
 */
export function summaryOf(raw: string): string | null {
  const text = raw
    .replace(/\r\n?/g, "\n")
    .replace(/([A-Za-z])-\n\s*([A-Za-z])/g, "$1$2")
    .replace(/\*{2,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const repaired = repairLost(text);
  const bare = repaired.replace(/[.\s]+$/, "");
  if (bare.length < SUMMARY_FLOOR || SUMMARY_IS_ADDRESS.test(bare) || new RegExp(`^(?:${SUMMARY_SAYS_NOTHING.source})$`, "i").test(bare) || onlyAStepAndADay(bare)) return null;
  return capped(repaired);
}

function capped(text: string): string {
  if (text.length <= SUMMARY_CAP) return text;
  const cut = text.slice(0, SUMMARY_CAP);
  const space = cut.lastIndexOf(" ");
  return `${(space > SUMMARY_CAP / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, "")}…`;
}

/**
 * A text field as Postgres can hold it: without NUL and the other control characters. EPA's file
 * holds 15 NULs (2026-10-31), one in the case "H.O.D. LANDFILL \u0000", and Postgres refuses any text
 * holding one, so the whole month's read failed and kept nothing (batch 113, found storing the
 * slice in a real database).
 */
const plain = (x: string) => x.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ");

/**
 * The cases, from the four tables' text. A case's public day: for a court case the day its
 * settlement was lodged ("Final Order Lodged"), else entered, else the day the suit was filed; for
 * an administrative case the day its final order was issued, else the day the complaint was. A
 * case with none of these days is left out (5 of 137,108).
 *
 * Since batch 122 (the 2026-11-08 proposal 2) a court case also keeps the day its suit was filed
 * ("Complaint Filed With Court"), and every case each settlement the settlements table dates, on its
 * own day, lodged else entered, with its own penalty and work ordered. A table without the two day
 * columns, as an older copy's, gives no settlement a day: the case figures stay as before.
 */
export function readCases(tables: CaseTables): EpaCase[] {
  const first = new Map<string, Map<string, string>>();
  const WANTED = new Set(["FOL", "FOE", "CMF", "CAFO", "CPOA"]);
  eachCsvRow(tables["CASE_MILESTONES.csv"], ["CASE_NUMBER", "SUB_ACTIVITY_TYPE_CODE", "ACTUAL_DATE"], ([caseNumber, code, actual]) => {
    if (!WANTED.has(code)) return;
    const d = day(actual);
    if (!d) return;
    const held = first.get(caseNumber) ?? new Map<string, string>();
    const was = held.get(code);
    if (!was || d < was) held.set(code, d);
    first.set(caseNumber, held);
  });
  const defendants = new Map<string, string[]>();
  eachCsvRow(tables["CASE_DEFENDANTS.csv"], ["CASE_NUMBER", "DEFENDANT_NAME"], ([caseNumber, raw]) => {
    const name = plain(raw).replace(/\s+/g, " ").trim();
    if (!name) return;
    const list = defendants.get(caseNumber) ?? [];
    if (!list.includes(name)) list.push(name);
    defendants.set(caseNumber, list);
  });
  const laws = new Map<string, { rank: number; code: string }[]>();
  eachCsvRow(tables["CASE_LAW_SECTIONS.csv"], ["CASE_NUMBER", "RANK_ORDER", "STATUTE_CODE"], ([caseNumber, rank, raw]) => {
    const code = raw.trim();
    if (!code) return;
    const list = laws.get(caseNumber) ?? [];
    list.push({ rank: Number(rank) || 99, code });
    laws.set(caseNumber, list);
  });
  // each settlement once, by its id: its federal and state penalty, the work it orders and, since
  // batch 122, its own day, lodged else entered, where the table has those columns
  const settlements = new Map<string, Map<string, { penalty: string | null; work: string | null; day: string | null; lodged: boolean }>>();
  const SETTLED = tables[SETTLEMENT_TABLE];
  if (SETTLED !== undefined) {
    const dated = SETTLED.slice(0, SETTLED.indexOf("\n")).includes("SETTLEMENT_LODGED_DATE");
    const columns = ["CASE_NUMBER", "ENF_CONCLUSION_ID", "FED_PENALTY_ASSESSED_AMT", "STATE_LOCAL_PENALTY_AMT", "COMPLIANCE_ACTION_COST", ...(dated ? ["SETTLEMENT_LODGED_DATE", "SETTLEMENT_ENTERED_DATE"] : [])];
    eachCsvRow(SETTLED, columns, ([caseNumber, id, fed, state, work, lodged = "", entered = ""]) => {
      const held = settlements.get(caseNumber) ?? new Map();
      held.set(id || `${held.size}`, { penalty: addAmounts(penaltyOf(fed), penaltyOf(state)), work: penaltyOf(work), day: day(lodged) ?? day(entered), lodged: day(lodged) !== null });
      settlements.set(caseNumber, held);
    });
  }
  const datedSettlements = (caseNumber: string): EpaSettlement[] =>
    [...(settlements.get(caseNumber)?.values() ?? [])]
      .filter((s): s is { penalty: string | null; work: string | null; day: string; lodged: boolean } => s.day !== null)
      .map(({ day: d, lodged, penalty, work }) => ({ day: d, lodged, penalty, work }))
      .sort((a, b) => a.day.localeCompare(b.day));
  // a case of one settlement and no total of its own takes the settlement's figure; a case of
  // several keeps its own total, since a sum would put other parties' settlements of other years on
  // one row (Deepwater Horizon's four, 2012–2015)
  const only = (caseNumber: string) => {
    const held = settlements.get(caseNumber);
    return held && held.size === 1 ? [...held.values()][0] : null;
  };
  const out: EpaCase[] = [];
  const COLUMNS = ["CASE_NUMBER", "CASE_NAME", "ACTIVITY_TYPE_CODE", "TOTAL_PENALTY_ASSESSED_AMT", "DOJ_DOCKET_NMBR", "TOTAL_COMP_ACTION_AMT", "ENF_SUMMARY_TEXT"] as const;
  eachCsvRow(tables["CASE_ENFORCEMENTS.csv"], COLUMNS, (values) => {
    const r = Object.fromEntries(COLUMNS.map((c, k) => [c, values[k]])) as Record<(typeof COLUMNS)[number], string>;
    const number = r.CASE_NUMBER.trim();
    const steps = first.get(number) ?? new Map<string, string>();
    const court = r.ACTIVITY_TYPE_CODE === "JDC";
    const pick = (court
      ? [["FOL", "lodged"], ["FOE", "entered"], ["CMF", "filed"]]
      : [["CAFO", "order"], ["CPOA", "complaint"]]
    ).find(([code]) => steps.has(code)) as [string, EpaCase["step"]] | undefined;
    if (!number || !pick) return;
    const name = plain(r.CASE_NAME).replace(/\s+/g, " ").trim();
    const ranked = (laws.get(number) ?? []).sort((a, b) => a.rank - b.rank).map((l) => l.code);
    out.push({
      number,
      name,
      court,
      day: steps.get(pick[0]) as string,
      step: pick[1],
      penalty: penaltyOf(r.TOTAL_PENALTY_ASSESSED_AMT) ?? only(number)?.penalty ?? null,
      settled: !penaltyOf(r.TOTAL_PENALTY_ASSESSED_AMT) && !!only(number)?.penalty,
      workOrdered: penaltyOf(r.TOTAL_COMP_ACTION_AMT ?? "") ?? only(number)?.work ?? null,
      summary: summaryOf(plain(r.ENF_SUMMARY_TEXT ?? "")),
      laws: [...new Set(ranked)],
      defendants: defendants.get(number) ?? (name ? [name] : []),
      docket: plain(r.DOJ_DOCKET_NMBR).trim() || null,
      suitFiled: court ? (steps.get("CMF") ?? null) : null,
      settlements: datedSettlements(number),
    });
  });
  return out;
}

/** The cases in EPA's zip. */
export function readCaseFile(zip: Uint8Array): EpaCase[] {
  const files = readZip(zip, [...CASE_TABLES, SETTLEMENT_TABLE]);
  const missing = CASE_TABLES.filter((t) => !files.has(t));
  if (missing.length) throw new Error(`the case file lacks ${missing.join(", ")}`);
  const settled = files.get(SETTLEMENT_TABLE);
  return readCases({
    ...(Object.fromEntries(CASE_TABLES.map((t) => [t, decodeText(files.get(t) as Buffer)])) as Record<(typeof CASE_TABLES)[number], string>),
    ...(settled ? { [SETTLEMENT_TABLE]: decodeText(settled) } : {}),
  });
}

const alnum = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
const ENDS_LEGAL = new RegExp(String.raw`(?:${LEGAL_WORD})\.?\s*$`, "i");
const HAS_LEGAL = new RegExp(LEGAL_WORD, "i");

/**
 * The defendant is the company, under one of its names, by the caption rule (`captionParty`): its
 * name with its legal words and nothing else, from one separator to the next. Two guards a case
 * file needs beyond the SEC's captions (measured on the 202,602 defendant rows, 2026-11-05):
 *
 * - One name joined by "and" is one name: "PENNSYLVANIA POWER AND LIGHT COMPANY" is no "Light
 *   Company". The rule reads "and" as parting two parties, which gave Light S.A. 56 utilities'
 *   cases. Two parties an "and" parts each carry their legal word ("X, INC. AND Y CORP.").
 * - A person written surname first: "RETHERFORD, DANA" is no Dana, "FAYE, BALL" no Ball.
 */
export function epaParty(defendant: string, names: readonly string[]): string | null {
  const d = defendant.replace(/\s+/g, " ").trim();
  if (/^[A-Z][A-Za-z'.-]+,\s*[A-Z][A-Za-z'.-]+(?:\s+[A-Z]\.?)?$/.test(d) && !HAS_LEGAL.test(d)) return null;
  const party = captionParty(d, names);
  if (!party) return null;
  const at = d.toLowerCase().indexOf(party.toLowerCase());
  const before = at > 0 ? d.slice(0, at) : "";
  const joined = /\b(?:and|&)\s*$/i.exec(before);
  if (joined && !ENDS_LEGAL.test(before.slice(0, joined.index).trim())) return null;
  return party;
}

/**
 * The defendants a case names that are another company's though they carry a listed company's
 * name, read by hand on 2026-11-05, by CIK. "NATIONAL STEEL CORP." is the American steelmaker,
 * not Companhia Siderúrgica Nacional, whose EDGAR name is NATIONAL STEEL CO (as the SEC's cases
 * hold, `NOT_THE_COMPANY` in lib/secCases.ts). A name a company's record took from another company
 * is refused before the day it took it by lib/takenNames.ts, for every source (batch 117).
 */
export const NOT_THE_COMPANY: Readonly<Record<number, { ticker: string; defendant: RegExp; why: string }[]>> = {
  1049659: [{ ticker: "SID", defendant: /^NATIONAL STEEL\b/i, why: "National Steel Corporation, the American steelmaker of Mishawaka and Granite City, not Companhia Siderúrgica Nacional" }],
  // batch 100, the audit of batches 94–99, finding 3
  1552275: [{ ticker: "SUN", defendant: /^SUNOCO,?\s+(?:INC|INCORPORATED)\b/i, why: "Sunoco, Inc. (EDGAR CIK 95304), the refiner Energy Transfer bought in 2012, not Sunoco LP, which was Susser Petroleum Partners until 2014-10-27" }],
  // batch 108's WM and batch 116's T, names a record took from a company it bought, are in lib/takenNames.ts (batch 117)
  // …finding 6: EPA's "THE TORO CORPORATION" of 2001 is the mower maker's Superfund order, whose
  // respondent its summary calls "TORO"; Toro Corp. is a shipping company formed in 2022
  1941131: [
    {
      ticker: "TORO",
      defendant: /^THE\s+TORO\s+CORPORATION$/i,
      why: "EPA's spelling of The Toro Company in its 2001 Chippewa Avenue order (05-2002-0076), not Toro Corp., the shipping company formed in 2022, which files as \"Toro Corp.\"",
    },
  ],
};

/**
 * The units a listed company owned whose cases EPA files under the unit's own name, by the owner's
 * CIK, each between the days the company owned it, read by hand. `key` is the letters the stored
 * cases are asked by; a unit with no `from` is the company's own from its first price, which every
 * rule reads from anyway. A unit `branded` is a brand others also trade under: a station, store or
 * numbered site under the name (`BRANDED_SITE`) is not the owner's unit. Joint ventures are no
 * owner's unit (Chevron Phillips Chemical, Motiva, Equilon, Nucor-Yamato). Each day is read from
 * the owner's or the other party's EDGAR filing list (data.sec.gov, 2026-11-06, batch 104):
 *
 * - Sunoco, Inc. is Energy Transfer's from 2012-10-05: Sunoco, Inc.'s own 8-K of 2012-10-11
 *   reports the completion of the acquisition and the change of control that day (items 2.01 and
 *   5.01). Its cases before are no listed company's; Sunoco LP's own stay Sunoco LP's (batch 101).
 * - Chevron: its operating companies (Chevron U.S.A., its products, pipeline, environmental
 *   management and other companies) its own; Chevron Chemical to 2000-06-30, the day before Phillips
 *   Petroleum's 8-K reports the joint venture formed (item 2, 2000-07-01); Texaco from 2001-10-09
 *   (Chevron's 8-K, item 2; Texaco deregistered the next day); Unocal and Union Oil Company of
 *   California from 2005-08-10 (Chevron's 8-K, item 2.01; Unocal's Form 15 that day).
 * - Shell: Shell Oil Company and its chemical, pipeline, offshore and other US companies from
 *   2005-07-20, when Royal Dutch Shell plc, Shell plc's record, became the group's single parent
 *   (its listing and S-8 filings of that day): the owner's call of 2026-11-06.
 * - BP: its US companies its own; Amoco from 1998-12-31 (Amoco's 8-K, items 1 and 4); Atlantic
 *   Richfield and its units from 2000-04-18 (ARCO's 8-K, items 1 and 4), ARCO Products and BP West
 *   Coast Products to 2013-05-31 (Tesoro's 8-K of their purchase, item 2.01, 2013-06-01). ARCO
 *   Chemical went to Lyondell in 1998 and ARCO Alaska to Phillips in 2000, so neither is BP's; a
 *   bare "ARCO" is left out, since Arco is also a town in Idaho.
 * - ExxonMobil: Exxon's and ExxonMobil's companies its own; Mobil's from 1999-11-30, when EXXON
 *   CORP became EXXON MOBIL CORP (its record; Mobil's Form 4 and 13D that day).
 * - Union Pacific: Union Pacific Railroad its own; Union Pacific Resources to 1996-10-14 (UNP's
 *   8-K of its distribution, item 2, 1996-10-15). CSX Transportation, Norfolk Southern Railway and
 *   Consolidated Edison Company of New York their owners' own.
 * - Waste Management: the state companies ("Waste Management of Illinois") from 1998-07-16, when
 *   USA Waste Services completed its merger with Waste Management (its 8-K, item 2).
 * - Murphy Oil USA: Murphy Oil's to 2013-08-29, Murphy USA's from 2013-08-30, the day of the
 *   spin-off (Murphy USA's 8-K filed 2013-09-05, items 2.01 and 5.01).
 * - Northrop Grumman: its companies its own, its shipbuilders to 2011-03-30 and Huntington
 *   Ingalls's from 2011-03-31, the day of the spin-off (HII's 8-K of 2011-04-04, item 2.01).
 * - Dow Inc.: The Dow Chemical Company and Union Carbide from 2019-04-01, when Dow Inc. became
 *   their parent (its 8-K of that day).
 * - PPL: its companies its own, PPL Montana and the other generation companies to 2015-05-31 (Talen
 *   Energy's 8-K of the spin-off, item 2.01, filed 2015-06-02).
 * - Verizon: its telephone companies its own; Verizon Information Services and Directories to
 *   2006-11-16 (Idearc's 8-K of the spin-off, item 2.01); Verizon California, Florida, Texas and
 *   Southwest to 2016-03-31 and Verizon Northwest, North and West Virginia to 2010-06-30
 *   (Frontier's 8-Ks of their purchase, item 2.01, 2016-04-01 and 2010-06-30). Verizon Hawaii and
 *   Micronesia/Pacifica are left out: no filing here gives their sale.
 * - Akzo Nobel: its coatings companies its own. Its chemicals companies (now Nouryon) are left out:
 *   AkzoNobel files nothing with the SEC, and the day of their 2018 sale was not read here.
 * - The rest are each company's own operating companies, under its name: Clean Harbors,
 *   Halliburton, Nucor, Occidental, Lockheed Martin, General Dynamics, Boeing, Entergy, Duke Energy's
 *   utilities, Toyota Motor, Home Depot U.S.A., Lowe's Home Centers, Procter & Gamble,
 *   Kimberly-Clark, Bunge, CEMEX and Silgan.
 *
 * The utilities' operating companies (batch 114, the 2026-11-07 proposal 3, approved by the owner
 * that day), each day read from data.sec.gov's filing lists on 2026-11-07: the buyer's 8-K reporting
 * the completed merger (its report day; item 2.01, or item 2 before 2004), else the bought company's
 * 8-K reporting the change in control (item 5.01, or 1), else its deregistration that day (Form 15):
 * - Southern: Alabama, Georgia and Mississippi Power, Southern Nuclear, Southern Company Services and
 *   Southern Power its own; Gulf Power to 2018-12-31 and NextEra's from 2019-01-01 (Gulf Power's 8-K,
 *   item 5.01, of that day); Southern Company Gas's utilities from 2016-07-01 (AGL Resources' 8-K,
 *   items 2.01 and 5.01). Savannah Electric from 1994-03-28, its 10-K for 1993 being one filing with
 *   Southern's: Southern bought it in 1988, before EDGAR, so its cases of 1990 and 1993 wait for that
 *   day. "MISSISSIPPI POWER & LIGHT" is Entergy Mississippi's old name, not Southern's.
 * - AEP: its operating companies its own; Central and South West's from 2000-06-15 (AEP's 8-K, item 2).
 * - FirstEnergy: Ohio Edison's and Centerior's companies its own from its first price (1997-11-10);
 *   GPU's from 2001-11-07 (FirstEnergy's 8-K, item 2); Allegheny Energy's from 2011-02-25 (Allegheny's
 *   8-K, items 3.03 and 5.01); FirstEnergy Solutions and its generation and nuclear companies to
 *   2018-03-30 (FirstEnergy's 8-K reporting their deconsolidation in bankruptcy, items 1.03 and 2.01,
 *   2018-03-31).
 * - Dominion: Virginia Electric and Power its own; Consolidated Natural Gas's from 2000-01-28
 *   (Dominion's 8-K, item 2); SCANA's from 2019-01-01 (SCANA's 8-K, items 2.01 and 5.01).
 * - Xcel: Northern States Power its own; New Century Energies' from 2000-08-18 (Xcel's 8-K, item 2).
 * - Exelon: Commonwealth Edison, PECO and Exelon Generation from 2000-10-20 (Exelon's 8-K, item 2),
 *   Exelon Generation to 2022-01-31 and Constellation's from 2022-02-01 (both 8-Ks of the separation,
 *   2022-02-02); Baltimore Gas and Electric from 2012-03-12 (Exelon's 8-K, items 2.01 and 5.01, filed
 *   2012-03-14; no case falls in the days around it); Pepco Holdings' from 2016-03-23 (its 8-K, items
 *   2.01 and 5.01).
 * - Sempra: San Diego Gas & Electric and Southern California Gas from 1998-06-26 (Sempra's 8-K, item 1).
 * - Ameren: Union Electric and Central Illinois Public Service from 1997-12-31 (CIPSCO's 8-K, item 2);
 *   Central Illinois Light from 2003-01-31 (CILCORP's 8-K, item 1); Illinois Power from 2004-10-01
 *   (its 8-K, item 5.01).
 * - DTE: Detroit Edison its own; Michigan Consolidated Gas from 2001-05-31 (DTE's 8-K, item 2).
 * - NiSource: NIPSCO its own; Columbia Gas's distribution companies from 2000-11-01 (Columbia
 *   Energy's Form 15 that day), Columbia Gas of Massachusetts to 2020-10-08 (NiSource's 8-K of its
 *   sale, 2020-10-09).
 * - WEC: Wisconsin Electric its own; Wisconsin Gas from 2000-04-26 (WICOR's 8-K, item 1); Integrys's
 *   from 2015-06-29 (Integrys's 8-K12B, items 2.01 and 5.01).
 * - Alliant: Wisconsin Power and Light its own; IES Utilities and Interstate Power from 1998-04-21
 *   (both deregistered that day).
 * - Evergy: Kansas City Power & Light and Westar's companies from 2018-06-04 (Evergy's 8-K12B).
 * - Eversource: Connecticut Light and Power its own; Public Service of New Hampshire from 1994-02-09,
 *   its first filing in Northeast Utilities' system (Northeast Utilities bought it in 1992, before
 *   EDGAR; its 10-K for 1993 was filed by Northeast Utilities); NSTAR's from 2012-04-10 (Eversource's
 *   8-K, item 2.01).
 * - National Grid: Niagara Mohawk from 2002-01-31 and New England Electric System's from 2000-03-22
 *   (each deregistered that day); KeySpan's from 2007-08-24 (KeySpan's 8-K, item 5.01); Narragansett
 *   Electric to 2022-05-24 and PPL's from 2022-05-25 (PPL's 8-K, item 2.01).
 * - PPL: Louisville Gas and Electric and Kentucky Utilities from 2010-11-01 (PPL's 8-K, item 2.01).
 * - CenterPoint: Houston Lighting & Power its own; Vectren's from 2019-02-01 (Vectren's 8-K, items 2.01
 *   and 5.01).
 * - AES: Indianapolis Power & Light from 2001-03-27 (IPALCO's Form 15 that day); Dayton Power and
 *   Light from 2011-11-28 (DPL's 8-K, item 5.01).
 * - Duke: Duke Power its own; Cinergy's from 2006-04-03 (Cinergy's Form 15 that day); Progress
 *   Energy's from 2012-07-02 (Progress's 8-K, items 2.01 and 5.01).
 * - Con Edison: Orange and Rockland from 1999-07-08 (its 8-K, item 1).
 * - Vistra: Luminant and TXU Energy its own from its first price (2016-10-05), TXU Electric Delivery
 *   (now Oncor) not; Dynegy's from 2018-04-09 (Vistra's 8-K, item 2.01).
 * - Each company's own and no more: NextEra's Florida Power & Light, PSEG's PSE&G, Edison
 *   International's Southern California Edison, PG&E, CMS's Consumers, Pinnacle West's Arizona Public
 *   Service, OGE, IDACORP, TXNM's Public Service of New Mexico, Hawaiian Electric and MGE.
 *
 * 28 more companies' operating units (batch 120, the 2026-11-08 proposal 1, approved by the owner that
 * day with its two calls), each day read from data.sec.gov's filing lists on 2026-11-08 by the same
 * rule, the earliest report day the deal's filings give; where an 8-K's report day is a day or two
 * before it was filed (Kinder Morgan's, Cleveland-Cliffs', RTX's), no case falls in the days around it:
 * - Berkshire Hathaway: BNSF Railway from 2010-02-12 (BNSF's 8-K, items 2.01 and 5.01); PacifiCorp from
 *   2006-03-21 (MidAmerican's 8-K, items 1.01 and 2.01); MidAmerican Energy, Northern Natural Gas and
 *   Kern River from 2006-02-09 (MidAmerican's 8-K, item 5.01): Berkshire held about 80% of MidAmerican
 *   from 2000 but under 10% of its vote until then, the owner's call; Nevada Power and Sierra Pacific
 *   Power from 2013-12-19 (NV Energy's 8-K, items 2.01 and 5.01); Lubrizol from 2011-09-16 and Precision
 *   Castparts from 2016-01-29 (each one's 8-K, items 2.01 and 5.01); Johns Manville from 2001-02-24 (its
 *   8-K, item 1); Shaw Industries from 2001-01-10 and Fruit of the Loom from 2002-05-02 (each one's Form
 *   15). Benjamin Moore, Marmon, McLane and Clayton Homes are left out: no filing here gives their days,
 *   and EPA files no case under Clayton Homes.
 * - RTX, United Technologies' record: Pratt & Whitney, Hamilton Sundstrand and its divisions its own;
 *   Sikorsky to 2015-11-05 (UTC's 8-K reporting 2015-11-06, item 8.01); Otis, Carrier and the
 *   divisions' names to 2020-04-01 (RTX's 8-K of the separations and the Raytheon merger, items 1.01 and
 *   2.01, reporting 2020-04-02), Otis Elevator Otis Worldwide's from 2020-04-02 (Carrier Global's own
 *   rule reads "Carrier Corporation"); United Technologies Automotive to 1999-05-03 (Lear's 8-K
 *   reporting 1999-05-04, items 5 and 7); Pratt & Whitney Rocketdyne to 2013-06-11 (GenCorp's 8-K of its purchase,
 *   items 1.01 and 2.01, 2013-06-12); Goodrich from 2012-07-26, Rockwell Collins from 2018-11-26 and
 *   Raytheon Company from 2020-04-02 (the 8-Ks, item 2.01).
 * - Kinder Morgan: its companies and SFPP its own; El Paso's pipelines and companies from 2012-05-24
 *   (Kinder Morgan's 8-K, item 2.01), never El Paso's exploration and production companies, sold to
 *   others with the merger.
 * - Williams: Northwest Pipeline and its companies its own, its production companies to 2011-12-29 (WPX
 *   Energy's 8-K of the spin-off, items 2.01 and 5.01, 2011-12-30); Transco from 1995-01-18 (Williams's
 *   8-K, item 2).
 * - Enbridge: its US companies its own, Enbridge Energy's among them; Spectra Energy's pipelines from
 *   2017-02-27 (Enbridge's 6-K of the merger).
 * - Duke: PanEnergy's pipelines from 1997-06-18 (Duke Power's 8-K, item 2); Panhandle Eastern and
 *   Trunkline to 1999-03-28 (CMS Energy's 8-K of their purchase, item 2, 1999-03-29), and Energy
 *   Transfer's from 2012-03-23 (Southern Union's 8-K, items 2.01 and 5.01); Texas Eastern, Algonquin and
 *   East Tennessee to 2007-01-01 (Spectra Energy's first 8-K, of the spin-off on 2007-01-02, and Duke's,
 *   item 2.01), Enbridge's from 2017-02-27.
 * - TC Energy: its US companies its own, Keystone Pipeline to 2024-09-30 and South Bow's from
 *   2024-10-01 (South Bow's registration and TC Energy's 6-Ks of that day); ANR Pipeline from 2007-02-27
 *   (ANR's 8-K, item 5.01); Columbia's pipelines from 2016-07-01 (TC Energy's 6-K).
 * - Valero: its refining, marketing, logistics and renewable fuels companies its own (not Valero
 *   Terrestrial, a West Virginia landfill, nor old Valero's gas companies); Ultramar Diamond Shamrock
 *   from 2001-12-31 and Premcor from 2005-09-01 (Valero's 8-Ks, item 2 and item 2.01).
 * - Tyson: its companies its own; IBP from 2001-09-28 and Hillshire from 2014-08-28 (Tyson's 8-Ks).
 * - Honeywell, AlliedSignal's record: AlliedSignal's companies its own, old Honeywell's from 1999-12-01
 *   (its 8-K of the merger, item 2).
 * - Freeport-McMoRan: Phelps Dodge's, Cyprus Amax's and Climax Molybdenum's companies from 2007-03-19
 *   (Freeport's 8-K, item 2.01), and the mines that then took Freeport's name; Freeport-McMoRan Resource
 *   Partners, Sulphur, Gold and Energy were other companies' (IMC's, McMoRan's), and are not.
 * - Schlumberger: its companies its own; Smith International from 2010-08-27, Cameron from 2016-04-01.
 * - Mosaic: Mosaic's, IMC's and Cargill Fertilizer's companies from 2004-10-22 (Mosaic's 8-K, item 2.01).
 * - Westlake: its vinyls, polymers and petrochemicals companies its own; Axiall's, Georgia Gulf's and
 *   Eagle's from 2016-08-31 (Westlake's 8-K, item 2.01).
 * - Republic Services: its companies its own; Allied Waste's and Browning-Ferris's from 2008-12-05.
 * - Pfizer: Warner-Lambert and Parke-Davis from 2000-06-19; Pharmacia and Upjohn from 2003-04-16, with
 *   Pharmacia LLC, the old Monsanto Company's legal entity, the owner's call; Wyeth from 2009-10-15.
 * - PepsiCo: Frito-Lay its own; Quaker Oats from 2001-08-02 (PepsiCo's 8-K of that day; its item 2
 *   report followed on 2001-08-08); Pepsi Bottling Group from 2010-02-26.
 * - Molson Coors: Coors Brewing its own; MillerCoors, a joint venture before, from 2016-10-11.
 * - AB InBev: Anheuser-Busch from 2008-11-18 (Anheuser-Busch's 8-K, item 5.01).
 * - Textron: Bell Helicopter and E-Z-GO its own; Cessna from 1994-03-30, Textron's 10-K for 1993, its
 *   first on EDGAR: Textron bought Cessna from General Dynamics in 1992, before EDGAR.
 * - Cleveland-Cliffs: AK Steel from 2020-03-13 and ArcelorMittal USA's plants from 2020-12-07 (Cliffs'
 *   8-Ks, item 2.01).
 * - Each company's own and no more: Huntsman's, LyondellBasell's (Equistar, Lyondell, Houston Refining,
 *   Millennium Petrochemicals; not the Lyondell Environmental Custodial Trust), TotalEnergies' US
 *   companies (Fina and Atofina are left out: no filing here gives their days), Rio Tinto's (Kennecott,
 *   U.S. Borax), Sysco's, CVS's, Honda's US companies (no dealer) and John Deere's works.
 */
export interface EpaUnit {
  ticker: string;
  unit: string;
  defendant: RegExp;
  key: string;
  from?: string;
  to?: string;
  branded?: true;
}

/**
 * A station, store, dealer or numbered site under an oil brand, or the brand listed with the business
 * that trades under it ("BP AMOCO; PARTY PLACE"): the brand owner's unit only by name.
 */
export const BRANDED_SITE = /\b(?:SERVICE\s+STATIONS?|STATIONS?|STA\b|SVC|TRUCK\s+STOP|CAR\s+WASH|FOOD\s*MART|MINI[- ]?MART|MART|STORES?|DEALER|JOBBER|DISTRIBUTOR|CONVENIENCE|AM\s*\/?\s*PM)\b|#\s*\d|;\s*\S/i;

const unit = (ticker: string, name: string, defendant: RegExp, key: string, days: { from?: string; to?: string; branded?: true } = {}): EpaUnit => ({ ticker, unit: name, defendant, key, ...days });
const OIL = { branded: true as const };
/** United Technologies' name before its unit's, as EPA writes it: "UNITED TECHNOLOGIES CORP PRATT & WHITNEY", "UNITED TECHNOLOGIES/PRATT & WHITNEY DIV". */
const UTC = String.raw`^(?:UNITED TECHNOLOGIES(?: CORP(?:ORATION)?)?\.?,?\s*[-/(]?\s*(?:DIV(?:ISION)?\.?\s*(?:OF\s*)?)?)?`;

export const UNITS: Readonly<Record<number, readonly EpaUnit[]>> = {
  // Energy Transfer (batch 101)
  1276187: [
    unit("ET", "Sunoco, Inc.", /^SUNOCO,?\s+(?:INC|INCORPORATED)\b/i, "sunoco", { from: "2012-10-05" }),
    // batch 120: Southern Union's pipelines, from its merger with Energy Transfer Equity
    unit("ET", "Panhandle Eastern and Trunkline", /^PANHANDLE EASTERN PIPE ?LINE\b/i, "panhandleeastern", { from: "2012-03-23" }),
    unit("ET", "Panhandle Eastern and Trunkline", /^TRUNKLINE GAS\b/i, "trunklinegas", { from: "2012-03-23" }),
  ],
  // Chevron
  93410: [
    unit("CVX", "Chevron U.S.A.", /^CHEVRON,?\s+U\.?\s?S\.?\s?A\b/i, "chevron", OIL),
    unit("CVX", "Chevron's products, pipeline, environmental and other companies", /^CHEVRON,?\s+(?:PRODUCTS|PIPE ?LINE|ENVIRONMENTAL|ORONITE|RESEARCH|MINING|SHIPPING|NORTH AMERICA|ENERGY TECHNOLOGY)\b/i, "chevron", OIL),
    unit("CVX", "Chevron Chemical", /^CHEVRON CHEMICAL\b/i, "chevron", { to: "2000-06-30" }),
    unit("CVX", "Texaco", /^TEXACO,?\s+(?:INC|INCORPORATED|REFINING|CHEMICAL|EXPLORATION|PIPELINE|OIL|U\.?S\.?A|CORP|PRODUCTS|DOWNSTREAM)\b/i, "texaco", { from: "2001-10-09", ...OIL }),
    unit("CVX", "Unocal", /^UNOCAL\b/i, "unocal", { from: "2005-08-10", ...OIL }),
    unit("CVX", "Union Oil Company of California", /^UNION OIL CO(?:MPANY)?\.?,? OF CALIFORNIA\b/i, "unionoil", { from: "2005-08-10", ...OIL }),
  ],
  // Shell, from the day Shell plc's record became the group's parent (the owner's call)
  1306965: [unit("SHEL", "Shell Oil Company and its US companies", /^SHELL\s+(?:OIL|CHEMICALS?|PIPE ?LINE|OFFSHORE|WESTERN|DEER PARK|MARTINEZ|EXPLORATION)\b/i, "shell", { from: "2005-07-20", ...OIL })],
  // BP
  313807: [
    unit("BP", "BP's US companies", /^BP\s+(?:PRODUCTS|EXPLORATION|AMOCO|OIL|AMERICA|PIPELINES?|CHEMICALS?|CORPORATION NORTH AMERICA|NORTH AMERICA)\b/i, "bp", OIL),
    unit("BP", "BP West Coast Products", /^BP\s+WEST COAST\b/i, "bpwestcoast", { to: "2013-05-31", ...OIL }),
    unit("BP", "Amoco", /^AMOCO,?\s+(?:OIL|CHEMICALS?|CORP|PRODUCTION|PIPE ?LINE|REFINING|COMPANY|POLYMERS)\b/i, "amoco", { from: "1998-12-31", ...OIL }),
    unit("BP", "Atlantic Richfield", /^ATLANTIC RICHFIELD\b/i, "atlanticrichfield", { from: "2000-04-18", ...OIL }),
    unit("BP", "ARCO's units", /^ARCO\s+(?:METALS?|TERMINAL|ENVIRONMENTAL|PIPE ?LINE|OIL|COAL|TRANSPORTATION|MARINE)\b/i, "arco", { from: "2000-04-18", ...OIL }),
    unit("BP", "ARCO Products", /^ARCO\s+PRODUCTS\b/i, "arcoproducts", { from: "2000-04-18", to: "2013-05-31", ...OIL }),
  ],
  // ExxonMobil (its record of 2026; the predecessor's to the handover, lib/predecessors.ts)
  2115436: [
    unit("XOM", "Exxon's and ExxonMobil's companies", /^EXXON\s?MOBIL\s+(?:OIL|PRODUCTION|PIPELINE|CHEMICAL|REFINING|RESEARCH|GLOBAL)\b|^EXXON,?\s+(?:CHEMICAL|COMPANY,?\s+U\.?S\.?A|U\.?S\.?A|PIPELINE|RESEARCH|PRODUCTION|COAL)\b/i, "exxon", OIL),
    unit("XOM", "Mobil", /^MOBIL\s+(?:OIL|CHEMICAL|CORP|EXPLORATION|PIPE ?LINE|PRODUCING)\b/i, "mobil", { from: "1999-11-30", ...OIL }),
  ],
  // the railroads
  100885: [
    unit("UNP", "Union Pacific Railroad", /^UNION PACIFIC RAIL ?ROAD\b/i, "unionpacific"),
    unit("UNP", "Union Pacific Resources", /^UNION PACIFIC RESOURCES\b/i, "unionpacific", { to: "1996-10-14" }),
  ],
  277948: [unit("CSX", "CSX Transportation", /^CSX\s+(?:TRANSPORTATION|TRANSPORATION|INTERMODAL|REAL PROPERTY)\b/i, "csx")],
  702165: [unit("NSC", "Norfolk Southern Railway", /^NORFOLK SOUTHERN RAILWAY\b/i, "norfolksouthern")],
  // Waste Management, from its merger with USA Waste Services
  823768: [unit("WM", "Waste Management's state companies", /^WASTE MANAGEMENT,?\s+(?:INC\.?,?\s+)?OF\b/i, "wastemanagement", { from: "1998-07-16" })],
  // Murphy Oil USA, before and after its spin-off
  717423: [unit("MUR", "Murphy Oil USA", /^MURPHY OIL\s+U\.?\s?S\.?\s?A\b/i, "murphyoil", { to: "2013-08-29" })],
  1573516: [unit("MUSA", "Murphy Oil USA", /^MURPHY OIL\s+U\.?\s?S\.?\s?A\b/i, "murphyoil", { from: "2013-08-30" })],
  // Northrop Grumman's shipbuilders, Huntington Ingalls's from the spin-off
  1133421: [
    unit("NOC", "Northrop Grumman's companies", /^NORTHROP GRUMMAN\b(?!\s*[-,]?\s*(?:SHIP|SHIPBUILDING|NEWPORT|GULFPORT|AVONDALE|INGALLS|PASCAGOULA))/i, "northropgrumman"),
    unit("NOC", "Northrop Grumman's shipbuilders", /^NORTHROP GRUMMAN\s*[-,]?\s*(?:SHIP|SHIPBUILDING|NEWPORT|GULFPORT|AVONDALE|INGALLS|PASCAGOULA)/i, "northropgrumman", { to: "2011-03-30" }),
  ],
  1501585: [unit("HII", "Northrop Grumman's shipbuilders", /^NORTHROP GRUMMAN\s*[-,]?\s*(?:SHIP|SHIPBUILDING|NEWPORT|GULFPORT|AVONDALE|INGALLS|PASCAGOULA)/i, "northropgrumman", { from: "2011-03-31" })],
  // Dow Inc., from the day it became the parent
  1751788: [unit("DOW", "The Dow Chemical Company", /^(?:THE\s+)?DOW CHEMICAL\b/i, "dowchemical", { from: "2019-04-01" }), unit("DOW", "Union Carbide", /^UNION CARBIDE\b/i, "unioncarbide", { from: "2019-04-01" })],
  // PPL, its generation companies to the Talen spin-off
  922224: [
    unit("PPL", "PPL's companies", /^PPL\b(?!\s+(?:MONTANA|ENERGY SUPPLY|GENERATION|ENERGYPLUS|SUSQUEHANNA|BRUNNER|MARTINS CREEK|HOLTWOOD))/i, "ppl"),
    unit("PPL", "PPL Montana and the generation companies", /^PPL\s+(?:MONTANA|ENERGY SUPPLY|GENERATION|ENERGYPLUS|SUSQUEHANNA|BRUNNER|MARTINS CREEK|HOLTWOOD)\b/i, "ppl", { to: "2015-05-31" }),
    unit("PPL", "Narragansett Electric", /^(?:THE\s+)?NARRAGANSETT ELECTRIC\b/i, "narragansettelectric", { from: "2022-05-25" }),
    unit("PPL", "Narragansett Electric", /^RHODE ISLAND ENERGY\b/i, "rhodeislandenergy", { from: "2022-05-25" }),
    unit("PPL", "Louisville Gas and Electric and Kentucky Utilities", /^LOUISVILLE GAS\s*(?:&|AND)\s*ELECTRIC\b/i, "louisvillegas", { from: "2010-11-01" }),
    unit("PPL", "Louisville Gas and Electric and Kentucky Utilities", /^KENTUCKY UTILITIES\b/i, "kentuckyutilities", { from: "2010-11-01" }),
  ],
  // Verizon, each sold company to its sale
  732712: [
    unit("VZ", "Verizon's telephone companies", /^VERIZON\b(?![\s/,]+(?:MICRONESIA|PACIFICA|HAWAII|INFORMATION SERVICES|DIRECTORIES|CALIFORNIA|FLORIDA|TEXAS|SOUTHWEST|SW|NORTHWEST|NORTH|WEST VIRGINIA)\b)/i, "verizon"),
    unit("VZ", "Verizon Information Services", /^VERIZON\s+(?:INFORMATION SERVICES|DIRECTORIES)\b/i, "verizon", { to: "2006-11-16" }),
    unit("VZ", "Verizon California, Florida, Texas and Southwest", /^VERIZON\s+(?:CALIFORNIA|FLORIDA|TEXAS|SOUTHWEST|SW)\b/i, "verizon", { to: "2016-03-31" }),
    unit("VZ", "Verizon Northwest, North and West Virginia", /^VERIZON\s+(?:NORTHWEST|NORTH|WEST VIRGINIA)\b/i, "verizon", { to: "2010-06-30" }),
  ],
  // Akzo Nobel's coatings companies
  3124: [unit("AKZOY", "Akzo Nobel's coatings companies", /^AKZO[- ]?NOBEL\b(?![\s,]+(?:CHEMICALS?|SURFACE|FUNCTIONAL|POLYMER|PULP|INDUSTRIAL|BASE|SALT)\b)/i, "akzonobel")],
  // each company's own operating companies
  822818: [unit("CLH", "Clean Harbors' companies", /^CLEAN HARBORS\b/i, "cleanharbors")],
  1047862: [
    unit("ED", "Consolidated Edison Company of New York", /^CONSOLIDATED EDISON\s+(?:CO(?:MPANY)?\.?\s+)?OF\s+N/i, "consolidatededison"),
    unit("ED", "Orange and Rockland", /^ORANGE\s*(?:&|AND)\s*ROCKLAND\b/i, "rockland", { from: "1999-07-08" }),
  ],
  45012: [unit("HAL", "Halliburton's companies", /^HALLIBURTON\b/i, "halliburton")],
  73309: [unit("NUE", "Nucor's steel companies", /^NUCOR\b(?![- ]?\s*(?:YAMATO|TAMATO))/i, "nucor")],
  797468: [unit("OXY", "Occidental Chemical and Occidental's companies", /^OCCIDENTAL\s+(?:CHEMICAL|PETROLEUM|OIL|EXPLORATION|PERMIAN)\b/i, "occidental")],
  936468: [unit("LMT", "Lockheed Martin's companies", /^LOCKHEED MARTIN\b/i, "lockheedmartin")],
  40533: [unit("GD", "General Dynamics' companies", /^GENERAL DYNAMICS\b/i, "generaldynamics")],
  12927: [unit("BA", "Boeing's companies", /^BOEING\b/i, "boeing")],
  65984: [unit("ETR", "Entergy's utilities", /^ENTERGY\b/i, "entergy")],
  1326160: [
    unit("DUK", "Duke Energy's utilities", /^DUKE ENERGY\s+(?:CAROLINAS|FLORIDA|INDIANA|OHIO|PROGRESS|KENTUCKY)\b/i, "dukeenergy"),
    unit("DUK", "Duke Power", /^DUKE POWER\b/i, "dukepower"),
    unit("DUK", "Cinergy's companies", /^CINCINNATI GAS\s*(?:&|AND)\s*ELECTRIC\b/i, "cincinnatigas", { from: "2006-04-03" }),
    unit("DUK", "Cinergy's companies", /^PSI ENERGY\b/i, "psienergy", { from: "2006-04-03" }),
    unit("DUK", "Cinergy's companies", /^CINERGY\b/i, "cinergy", { from: "2006-04-03" }),
    unit("DUK", "Cinergy's companies", /^UNION LIGHT,?\s*HEAT\b/i, "unionlight", { from: "2006-04-03" }),
    unit("DUK", "Progress Energy's companies", /^CAROLINA POWER\s*(?:&|AND)\s*LIGHT\b/i, "carolinapower", { from: "2012-07-02" }),
    unit("DUK", "Progress Energy's companies", /^PROGRESS ENERGY\b/i, "progressenergy", { from: "2012-07-02" }),
    unit("DUK", "Progress Energy's companies", /^FLORIDA POWER CORP(?:ORATION)?\b/i, "floridapowercorp", { from: "2012-07-02" }),
    // batch 120: PanEnergy's pipelines, from the merger to their sale or spin-off (above)
    unit("DUK", "PanEnergy's pipelines", /^TEXAS EASTERN TRANSMISSION\b/i, "texaseastern", { from: "1997-06-18", to: "2007-01-01" }),
    unit("DUK", "PanEnergy's pipelines", /^ALGONQUIN GAS TRANSMISSION\b/i, "algonquingas", { from: "1997-06-18", to: "2007-01-01" }),
    unit("DUK", "PanEnergy's pipelines", /^EAST TENNESSEE NATURAL GAS\b/i, "easttennessee", { from: "1997-06-18", to: "2007-01-01" }),
    unit("DUK", "PanEnergy's pipelines", /^PANHANDLE EASTERN PIPE ?LINE\b/i, "panhandleeastern", { from: "1997-06-18", to: "1999-03-28" }),
    unit("DUK", "PanEnergy's pipelines", /^TRUNKLINE GAS\b/i, "trunklinegas", { from: "1997-06-18", to: "1999-03-28" }),
  ],
  1094517: [unit("TM", "Toyota Motor's US companies", /^TOYOTA MOTOR\b/i, "toyotamotor")],
  354950: [unit("HD", "Home Depot U.S.A.", /^(?:THE\s+)?HOME DEPOT,?\s+(?:U\.?\s?S\.?\s?A|NORTHEASTERN)/i, "homedepot")],
  60667: [unit("LOW", "Lowe's Home Centers", /^LOWE'?S\s+HOME\s+CENTER/i, "loweshomecenter")],
  80424: [unit("PG", "Procter & Gamble's companies", /^PROCTER\s+(?:&|AND)\s+GAMBLE\b/i, "procter")],
  55785: [unit("KMB", "Kimberly-Clark's companies", /^KIMBERLY[- ]?CLARK\b(?!\s+PRINTING)/i, "kimberlyclark")],
  1996862: [unit("BG", "Bunge North America", /^BUNGE\b/i, "bunge")],
  1076378: [unit("CX", "CEMEX's US companies", /^CEMEX\b/i, "cemex")],
  849869: [unit("SLGN", "Silgan's companies", /^SILGAN\b/i, "silgan")],
  // batch 114, the 2026-11-07 proposal 3: the utilities' operating companies, each day read from a filing (above)
  92122: [
    unit("SO", "Southern's operating companies", /^ALABAMA POWER\b/i, "alabamapower"),
    unit("SO", "Southern's operating companies", /^GEORGIA POWER\b/i, "georgiapower"),
    unit("SO", "Southern's operating companies", /^MISSISSIPPI POWER\b(?!\s*(?:&|AND)\s*LIGHT)/i, "mississippipower"),
    unit("SO", "Southern's operating companies", /^SOUTHERN COMPANY SERVICES\b/i, "southerncompanyservices"),
    unit("SO", "Southern's operating companies", /^SOUTHERN NUCLEAR\b/i, "southernnuclear"),
    unit("SO", "Southern's operating companies", /^SOUTHERN POWER CO(?:MPANY)?\b/i, "southernpowerco"),
    unit("SO", "Savannah Electric", /^SAVANNAH ELECTRIC\b/i, "savannahelectric", { from: "1994-03-28" }),
    unit("SO", "Gulf Power", /^GULF POWER\b/i, "gulfpower", { to: "2018-12-31" }),
    unit("SO", "Southern Company Gas and its utilities", /^SOUTHERN COMPANY GAS\b/i, "southerncompanygas", { from: "2016-07-01" }),
    unit("SO", "Southern Company Gas and its utilities", /^ATLANTA GAS LIGHT\b/i, "atlantagaslight", { from: "2016-07-01" }),
    unit("SO", "Southern Company Gas and its utilities", /^NICOR GAS\b/i, "nicorgas", { from: "2016-07-01" }),
    unit("SO", "Southern Company Gas and its utilities", /^NORTHERN ILLINOIS GAS\b/i, "northernillinoisgas", { from: "2016-07-01" }),
  ],
  753308: [
    unit("NEE", "Florida Power & Light and NextEra's companies", /^FLORIDA POWER\s*(?:&|AND)\s*LIGHT\b/i, "floridapower"),
    unit("NEE", "Florida Power & Light and NextEra's companies", /^FPL ENERGY\b/i, "fplenergy"),
    unit("NEE", "Florida Power & Light and NextEra's companies", /^NEXTERA ENERGY RESOURCES\b/i, "nexteraenergyresources"),
    unit("NEE", "Gulf Power", /^GULF POWER\b/i, "gulfpower", { from: "2019-01-01" }),
  ],
  4904: [
    unit("AEP", "AEP's operating companies", /^APPALACHIAN POWER\b/i, "appalachianpower"),
    unit("AEP", "AEP's operating companies", /^OHIO POWER\b/i, "ohiopower"),
    unit("AEP", "AEP's operating companies", /^COLUMBUS SOUTHERN POWER\b/i, "columbussouthernpower"),
    unit("AEP", "AEP's operating companies", /^INDIANA\s*(?:&|AND)?\s*MICHIGAN POWER\b/i, "michiganpower"),
    unit("AEP", "AEP's operating companies", /^KENTUCKY POWER\b/i, "kentuckypower"),
    unit("AEP", "AEP's operating companies", /^AMERICAN ELECTRIC POWER SERV/i, "americanelectricpowerserv"),
    unit("AEP", "AEP's operating companies", /^AEP (?:GENERATING|OHIO|TEXAS|APPALACHIAN)\b/i, "aep"),
    unit("AEP", "AEP's operating companies", /^WHEELING POWER\b/i, "wheelingpower"),
    unit("AEP", "AEP's operating companies", /^KINGSPORT POWER\b/i, "kingsportpower"),
    unit("AEP", "Central and South West's companies", /^SOUTHWESTERN ELECTRIC POWER\b/i, "southwesternelectricpower", { from: "2000-06-15" }),
    unit("AEP", "Central and South West's companies", /^CENTRAL POWER\s*(?:&|AND)\s*LIGHT\b/i, "centralpower", { from: "2000-06-15" }),
    unit("AEP", "Central and South West's companies", /^WEST TEXAS UTILITIES\b/i, "westtexasutilities", { from: "2000-06-15" }),
    unit("AEP", "Central and South West's companies", /^PUBLIC SERVICE CO(?:MPANY)?\.?,? OF OKLAHOMA\b/i, "oklahoma", { from: "2000-06-15" }),
  ],
  1031296: [
    unit("FE", "Ohio Edison's and Centerior's companies", /^OHIO EDISON\b/i, "ohioedison"),
    unit("FE", "Ohio Edison's and Centerior's companies", /^CLEVELAND ELECTRIC ILLUMINATING\b/i, "clevelandelectricilluminating"),
    unit("FE", "Ohio Edison's and Centerior's companies", /^TOLEDO EDISON\b/i, "toledoedison"),
    unit("FE", "Ohio Edison's and Centerior's companies", /^PENNSYLVANIA POWER CO(?:MPANY)?\b/i, "pennsylvaniapowerco"),
    unit("FE", "Ohio Edison's and Centerior's companies", /^FIRSTENERGY SERVICE\b/i, "firstenergyservice"),
    unit("FE", "FirstEnergy Solutions and its generation and nuclear companies", /^FIRSTENERGY (?:GENERATION|NUCLEAR|SOLUTIONS)\b/i, "firstenergy", { to: "2018-03-30" }),
    unit("FE", "GPU's companies", /^JERSEY CENTRAL POWER\b/i, "jerseycentralpower", { from: "2001-11-07" }),
    unit("FE", "GPU's companies", /^METROPOLITAN EDISON\b/i, "metropolitanedison", { from: "2001-11-07" }),
    unit("FE", "GPU's companies", /^PENNSYLVANIA ELECTRIC CO(?:MPANY)?\b/i, "pennsylvaniaelectricco", { from: "2001-11-07" }),
    unit("FE", "Allegheny Energy's companies", /^MONONGAHELA POWER\b/i, "monongahelapower", { from: "2011-02-25" }),
    unit("FE", "Allegheny Energy's companies", /^POTOMAC EDISON\b/i, "potomacedison", { from: "2011-02-25" }),
    unit("FE", "Allegheny Energy's companies", /^WEST PENN POWER\b/i, "westpennpower", { from: "2011-02-25" }),
    unit("FE", "Allegheny Energy's companies", /^ALLEGHENY ENERGY\b/i, "alleghenyenergy", { from: "2011-02-25" }),
  ],
  715957: [
    unit("D", "Virginia Electric and Power and Dominion's companies", /^VIRGINIA ELECTRIC\s*(?:&|AND)\s*POWER\b/i, "virginiaelectric"),
    unit("D", "Virginia Electric and Power and Dominion's companies", /^VIRGINIA POWER\b/i, "virginiapower"),
    unit("D", "Virginia Electric and Power and Dominion's companies", /^DOMINION (?:VIRGINIA POWER|RESOURCES|TRANSMISSION|GENERATION|ENERGY (?:BRAYTON|KINCAID|STATE LINE|SALEM|MANCHESTER|NEW ENGLAND|TRANSMISSION|COVE POINT|SOUTH CAROLINA))\b/i, "dominion"),
    unit("D", "Consolidated Natural Gas's companies", /^EAST OHIO GAS\b/i, "eastohiogas", { from: "2000-01-28" }),
    unit("D", "Consolidated Natural Gas's companies", /^CNG TRANSMISSION\b/i, "cngtransmission", { from: "2000-01-28" }),
    unit("D", "Consolidated Natural Gas's companies", /^CONSOLIDATED NATURAL GAS\b/i, "consolidatednaturalgas", { from: "2000-01-28" }),
    unit("D", "SCANA's companies", /^SOUTH CAROLINA ELECTRIC\s*(?:&|AND)\s*GAS\b/i, "southcarolinaelectric", { from: "2019-01-01" }),
    unit("D", "SCANA's companies", /^SCANA\b/i, "scana", { from: "2019-01-01" }),
  ],
  72903: [
    unit("XEL", "Northern States Power", /^NORTHERN STATES POWER\b/i, "northernstatespower"),
    unit("XEL", "New Century Energies' companies", /^PUBLIC SERVICE CO(?:MPANY)?\.?,? OF COLORADO\b/i, "colorado", { from: "2000-08-18" }),
    unit("XEL", "New Century Energies' companies", /^SOUTHWESTERN PUBLIC SERVICE\b/i, "southwesternpublicservice", { from: "2000-08-18" }),
  ],
  1109357: [
    unit("EXC", "Commonwealth Edison and PECO", /^COMMONWEALTH EDISON\b/i, "commonwealthedison", { from: "2000-10-20" }),
    unit("EXC", "Commonwealth Edison and PECO", /^PECO ENERGY\b/i, "pecoenergy", { from: "2000-10-20" }),
    unit("EXC", "Commonwealth Edison and PECO", /^PHILADELPHIA ELECTRIC\b/i, "philadelphiaelectric", { from: "2000-10-20" }),
    unit("EXC", "Exelon Generation", /^EXELON GENERATION\b/i, "exelongeneration", { from: "2000-10-20", to: "2022-01-31" }),
    unit("EXC", "Baltimore Gas and Electric", /^BALTIMORE GAS\s*(?:&|AND)\s*ELECTRIC\b/i, "baltimoregas", { from: "2012-03-12" }),
    unit("EXC", "Pepco Holdings' companies", /^POTOMAC ELECTRIC POWER\b/i, "potomacelectricpower", { from: "2016-03-23" }),
    unit("EXC", "Pepco Holdings' companies", /^DELMARVA POWER\b/i, "delmarvapower", { from: "2016-03-23" }),
    unit("EXC", "Pepco Holdings' companies", /^ATLANTIC CITY ELECTRIC\b/i, "atlanticcityelectric", { from: "2016-03-23" }),
  ],
  1868275: [
    unit("CEG", "Constellation Energy Generation", /^EXELON GENERATION\b/i, "exelongeneration", { from: "2022-02-01" }),
    unit("CEG", "Constellation Energy Generation", /^CONSTELLATION ENERGY GENERATION\b/i, "constellationenergygeneration", { from: "2022-02-01" }),
  ],
  788784: [
    unit("PEG", "Public Service Electric and Gas and PSEG's companies", /^PUBLIC SERVICE ELECTRIC\s*(?:&|AND)\s*GAS\b/i, "publicserviceelectric"),
    unit("PEG", "Public Service Electric and Gas and PSEG's companies", /^PSE\s?&\s?G\b/i, "pseg"),
    unit("PEG", "Public Service Electric and Gas and PSEG's companies", /^PSEG (?:POWER|FOSSIL|NUCLEAR)\b/i, "pseg"),
  ],
  827052: [
    unit("EIX", "Southern California Edison", /^SOUTHERN CALIFORNIA EDISON\b/i, "southerncaliforniaedison"),
  ],
  1004980: [
    unit("PCG", "Pacific Gas and Electric", /^PACIFIC GAS\s*(?:&|AND)\s*ELECTRIC\b/i, "pacificgas"),
  ],
  1032208: [
    unit("SRE", "San Diego Gas & Electric and Southern California Gas", /^SAN DIEGO GAS\s*(?:&|AND)\s*ELECTRIC\b/i, "sandiegogas", { from: "1998-06-26" }),
    unit("SRE", "San Diego Gas & Electric and Southern California Gas", /^SOUTHERN CALIFORNIA GAS\b/i, "southerncaliforniagas", { from: "1998-06-26" }),
  ],
  1002910: [
    unit("AEE", "Union Electric and Central Illinois Public Service", /^UNION ELECTRIC CO(?:MPANY)?\b(?!.*STEEL)/i, "unionelectricco", { from: "1997-12-31" }),
    unit("AEE", "Union Electric and Central Illinois Public Service", /^CENTRAL ILLINOIS PUBLIC SERVICE\b/i, "centralillinoispublicservice", { from: "1997-12-31" }),
    unit("AEE", "Central Illinois Light", /^CENTRAL ILLINOIS LIGHT\b/i, "centralillinoislight", { from: "2003-01-31" }),
    unit("AEE", "Illinois Power", /^ILLINOIS POWER CO(?:MPANY)?\b/i, "illinoispowerco", { from: "2004-10-01" }),
  ],
  936340: [
    unit("DTE", "Detroit Edison and DTE's companies", /^DETROIT EDISON\b/i, "detroitedison"),
    unit("DTE", "Detroit Edison and DTE's companies", /^DTE ELECTRIC\b/i, "dteelectric"),
    unit("DTE", "Detroit Edison and DTE's companies", /^DTE GAS\b/i, "dtegas"),
    unit("DTE", "Detroit Edison and DTE's companies", /^DTE ENERGY SERVICES\b/i, "dteenergyservices"),
    unit("DTE", "Michigan Consolidated Gas", /^MICHIGAN CONSOLIDATED GAS\b/i, "michiganconsolidatedgas", { from: "2001-05-31" }),
    unit("DTE", "Michigan Consolidated Gas", /^MICHCON\b/i, "michcon", { from: "2001-05-31" }),
  ],
  811156: [
    // "CONSUMERS POWER CO(MPANY)" and "Consumers Energy Company"; "CONSUMERS POWER, INC.", a Region 10
    // case of 1993 at an Illinois facility, is not Michigan's company (batch 116, the audit's finding 2)
    unit("CMS", "Consumers Energy", /^CONSUMERS (?:POWER\s+CO(?:MPANY)?\b|ENERGY\b)/i, "consumers"),
  ],
  1111711: [
    unit("NI", "Northern Indiana Public Service", /^NORTHERN INDIANA PUBLIC SERVICE\b/i, "northernindianapublicservice"),
    unit("NI", "Northern Indiana Public Service", /^NIPSCO\b/i, "nipsco"),
    unit("NI", "Columbia Gas's distribution companies", /^COLUMBIA GAS OF\b(?!\s+MASSACHUSETTS)/i, "columbiagasof", { from: "2000-11-01" }),
    unit("NI", "Columbia Gas of Massachusetts", /^COLUMBIA GAS OF MASSACHUSETTS\b/i, "columbiagasofmassachusetts", { from: "2000-11-01", to: "2020-10-08" }),
  ],
  783325: [
    unit("WEC", "Wisconsin Electric Power", /^WISCONSIN ELECTRIC POWER\b/i, "wisconsinelectricpower"),
    unit("WEC", "Wisconsin Electric Power", /^WE ENERGIES\b/i, "weenergies"),
    unit("WEC", "Wisconsin Gas", /^WISCONSIN GAS\b/i, "wisconsingas", { from: "2000-04-26" }),
    unit("WEC", "Integrys's companies", /^WISCONSIN PUBLIC SERVICE\b/i, "wisconsinpublicservice", { from: "2015-06-29" }),
    unit("WEC", "Integrys's companies", /^PEOPLES GAS LIGHT\b/i, "peoplesgaslight", { from: "2015-06-29" }),
    unit("WEC", "Integrys's companies", /^NORTH SHORE GAS\b/i, "northshoregas", { from: "2015-06-29" }),
  ],
  352541: [
    unit("LNT", "Wisconsin Power and Light", /^WISCONSIN POWER\s*(?:&|AND)\s*LIGHT\b/i, "wisconsinpower"),
    unit("LNT", "IES Utilities and Interstate Power", /^INTERSTATE POWER\b(?!\s+SYSTEMS)/i, "interstatepower", { from: "1998-04-21" }),
    unit("LNT", "IES Utilities and Interstate Power", /^IES UTILITIES\b/i, "iesutilities", { from: "1998-04-21" }),
    unit("LNT", "IES Utilities and Interstate Power", /^IOWA ELECTRIC\b/i, "iowaelectric", { from: "1998-04-21" }),
  ],
  1711269: [
    unit("EVRG", "Kansas City Power & Light and Westar's companies", /^KANSAS CITY POWER\b/i, "kansascitypower", { from: "2018-06-04" }),
    unit("EVRG", "Kansas City Power & Light and Westar's companies", /^WESTAR ENERGY\b/i, "westarenergy", { from: "2018-06-04" }),
    unit("EVRG", "Kansas City Power & Light and Westar's companies", /^KANSAS GAS\s*(?:&|AND)\s*ELECTRIC\b/i, "kansasgas", { from: "2018-06-04" }),
  ],
  72741: [
    unit("ES", "Connecticut Light and Power and Western Massachusetts Electric", /^CONNECTICUT LIGHT\s*(?:&|AND)\s*POWER\b/i, "connecticutlight"),
    unit("ES", "Connecticut Light and Power and Western Massachusetts Electric", /^WESTERN MASSACHUSETTS ELECTRIC\b/i, "westernmassachusettselectric"),
    unit("ES", "Public Service Company of New Hampshire", /^PUBLIC SERVICE CO(?:MPANY)?\.?,? OF NEW HAMPSHIRE\b/i, "newhampshire", { from: "1994-02-09" }),
    unit("ES", "NSTAR's companies", /^BOSTON EDISON\b/i, "bostonedison", { from: "2012-04-10" }),
    unit("ES", "NSTAR's companies", /^NSTAR\b/i, "nstar", { from: "2012-04-10" }),
    unit("ES", "NSTAR's companies", /^COMMONWEALTH ELECTRIC\b/i, "commonwealthelectric", { from: "2012-04-10" }),
    unit("ES", "NSTAR's companies", /^CAMBRIDGE ELECTRIC\b/i, "cambridgeelectric", { from: "2012-04-10" }),
  ],
  1004315: [
    unit("NGG", "Niagara Mohawk", /^NIAGARA MOHAWK\b/i, "niagaramohawk", { from: "2002-01-31" }),
    unit("NGG", "New England Electric System's companies", /^NEW ENGLAND POWER\b/i, "newenglandpower", { from: "2000-03-22" }),
    unit("NGG", "New England Electric System's companies", /^MASSACHUSETTS ELECTRIC\b(?!\s+CONSTRUCTION)/i, "massachusettselectric", { from: "2000-03-22" }),
    unit("NGG", "New England Electric System's companies", /^NEW ENGLAND ELECTRIC SYSTEM\b/i, "newenglandelectricsystem", { from: "2000-03-22" }),
    unit("NGG", "Narragansett Electric", /^(?:THE\s+)?NARRAGANSETT ELECTRIC\b/i, "narragansettelectric", { from: "2000-03-22", to: "2022-05-24" }),
    unit("NGG", "KeySpan's companies", /^KEYSPAN\b/i, "keyspan", { from: "2007-08-24" }),
    unit("NGG", "KeySpan's companies", /^BROOKLYN UNION GAS\b/i, "brooklynuniongas", { from: "2007-08-24" }),
  ],
  764622: [
    unit("PNW", "Arizona Public Service", /^ARIZONA PUBLIC SERVICE\b/i, "arizonapublicservice"),
  ],
  1130310: [
    unit("CNP", "Houston Lighting & Power and CenterPoint's companies", /^HOUSTON LIGHTING\s*(?:&|AND)\s*POWER\b/i, "houstonlighting"),
    unit("CNP", "Houston Lighting & Power and CenterPoint's companies", /^CENTERPOINT ENERGY (?:HOUSTON|RESOURCES)\b/i, "centerpointenergy"),
    unit("CNP", "Vectren's companies", /^SOUTHERN INDIANA GAS\s*(?:&|AND)\s*ELECTRIC\b/i, "southernindianagas", { from: "2019-02-01" }),
    unit("CNP", "Vectren's companies", /^VECTREN\b/i, "vectren", { from: "2019-02-01" }),
  ],
  1021635: [
    unit("OGE", "Oklahoma Gas and Electric", /^OKLAHOMA GAS\s*(?:&|AND)\s*ELECTRIC\b/i, "oklahomagas"),
  ],
  1057877: [
    unit("IDA", "Idaho Power", /^IDAHO POWER\b/i, "idahopower"),
  ],
  1108426: [
    unit("TXNM", "Public Service Company of New Mexico", /^PUBLIC SERVICE CO(?:MPANY)?\.?,? OF NEW MEXICO\b/i, "newmexico"),
  ],
  354707: [
    unit("HE", "Hawaiian Electric", /^HAWAIIAN ELECTRIC CO(?:MPANY)?\b/i, "hawaiianelectricco"),
  ],
  1161728: [
    unit("MGEE", "Madison Gas and Electric", /^MADISON GAS\s*(?:&|AND)\s*ELECTRIC\b/i, "madisongas"),
  ],
  874761: [
    unit("AES", "Indianapolis Power & Light", /^INDIANAPOLIS POWER\s*(?:&|AND)\s*LIGHT\b/i, "indianapolispower", { from: "2001-03-27" }),
    unit("AES", "Dayton Power and Light", /^DAYTON POWER\s*(?:&|AND)\s*LIGHT\b/i, "daytonpower", { from: "2011-11-28" }),
  ],
  1692819: [
    unit("VST", "Luminant and TXU Energy", /^LUMINANT\b/i, "luminant"),
    unit("VST", "Luminant and TXU Energy", /^TXU (?:GENERATION|ENERGY|ELECTRIC(?!\s+DELIVERY))\b/i, "txu"),
    unit("VST", "Dynegy's companies", /^DYNEGY\b/i, "dynegy", { from: "2018-04-09" }),
  ],
  // batch 120, the 2026-11-08 proposal 1(a): 28 more companies' operating units, each day read from a filing (above)
  // Berkshire Hathaway
  1067983: [
    unit("BRK-B", "BNSF Railway", /^(?:THE\s+)?BNSF\b/i, "bnsf", { from: "2010-02-12" }),
    unit("BRK-B", "BNSF Railway", /^(?:THE\s+)?BURLINGTON NORTHERN\b/i, "burlingtonnorthern", { from: "2010-02-12" }),
    unit("BRK-B", "PacifiCorp", /^PACIFICORP\b/i, "pacificorp", { from: "2006-03-21" }),
    unit("BRK-B", "MidAmerican Energy and its pipelines", /^MIDAMERICAN ENERGY\b/i, "midamericanenergy", { from: "2006-02-09" }),
    unit("BRK-B", "MidAmerican Energy and its pipelines", /^NORTHERN NATURAL GAS\b/i, "northernnaturalgas", { from: "2006-02-09" }),
    unit("BRK-B", "MidAmerican Energy and its pipelines", /^KERN RIVER GAS\b/i, "kernrivergas", { from: "2006-02-09" }),
    unit("BRK-B", "NV Energy's utilities", /^NEVADA POWER\b/i, "nevadapower", { from: "2013-12-19" }),
    unit("BRK-B", "NV Energy's utilities", /^SIERRA PACIFIC POWER\b/i, "sierrapacificpower", { from: "2013-12-19" }),
    unit("BRK-B", "Lubrizol", /^(?:THE\s+)?LUBRIZOL\b/i, "lubrizol", { from: "2011-09-16" }),
    unit("BRK-B", "Shaw Industries", /^SHAW INDUSTRIES\b/i, "shawindustries", { from: "2001-01-10" }),
    unit("BRK-B", "Johns Manville", /^JOHNS[- ]MANVILLE\b/i, "johnsmanville", { from: "2001-02-24" }),
    unit("BRK-B", "Precision Castparts", /^PRECISION CASTPARTS\b/i, "precisioncastparts", { from: "2016-01-29" }),
    unit("BRK-B", "Fruit of the Loom", /^FRUIT OF THE LOOM\b/i, "fruitoftheloom", { from: "2002-05-02" }),
  ],
  // RTX, United Technologies' record: its divisions to the separations, the bought companies from their days
  101829: [
    unit("RTX", "Pratt & Whitney", new RegExp(UTC + String.raw`PRATT\s*(?:&|AND)\s*WHITNEY\b(?!\s+ROCKETDYNE)`, "i"), "pratt"),
    unit("RTX", "Pratt & Whitney Rocketdyne", /^PRATT\s*(?:&|AND)\s*WHITNEY\s+ROCKETDYNE\b/i, "pratt", { to: "2013-06-11" }),
    unit("RTX", "Hamilton Sundstrand", new RegExp(UTC + String.raw`HAMILTON (?:SUNDSTRAND|STANDARD)\b`, "i"), "hamilton"),
    // UT Automotive by its stem, so EPA's misspellings stay Lear's after the sale: "UNITED TECHNOLOGIES
    // AUTOMOVTIVE, INC", a defendant of 2007, took the divisions' pattern (the 2026-11-08 audit, finding 2)
    unit("RTX", "United Technologies' divisions", /^UNITED TECHNOLOGIES\b(?!\s+AUTOM)/i, "unitedtechnologies", { to: "2020-04-01" }),
    unit("RTX", "United Technologies Automotive", /^UNITED TECHNOLOGIES\s+AUTOM[A-Z]*\b/i, "unitedtechnologies", { to: "1999-05-03" }),
    unit("RTX", "Sikorsky", new RegExp(UTC + "SIKORSKY AIRCRAFT", "i"), "sikorsky", { to: "2015-11-05" }),
    unit("RTX", "Otis Elevator", new RegExp(UTC + "OTIS ELEVATOR", "i"), "otiselevator", { to: "2020-04-01" }),
    unit("RTX", "Carrier", new RegExp(UTC + String.raw`CARRIER (?:CORP|CORPORATION)\b`, "i"), "carriercorp", { to: "2020-04-01" }),
    unit("RTX", "Goodrich", /^GOODRICH (?:CORP|CORPORATION)\b/i, "goodrich", { from: "2012-07-26" }),
    unit("RTX", "Rockwell Collins", /^ROCKWELL COLLINS\b/i, "rockwellcollins", { from: "2018-11-26" }),
    unit("RTX", "Raytheon Company", /^RAYTHEON\b/i, "raytheon", { from: "2020-04-02" }),
  ],
  // Otis Worldwide, from its separation from United Technologies (Carrier Global's own rule reads "Carrier Corporation")
  1781335: [unit("OTIS", "Otis Elevator", new RegExp(UTC + "OTIS ELEVATOR", "i"), "otiselevator", { from: "2020-04-02" })],
  // the pipelines
  1506307: [
    unit("KMI", "Kinder Morgan's companies", /^KINDER MORGAN\b/i, "kindermorgan"),
    unit("KMI", "SFPP", /^SFPP\b/i, "sfpp"),
    unit("KMI", "El Paso's companies", /^EL PASO (?:NATURAL GAS|CORP(?:ORATION)?|ENERGY CORP(?:ORATION)?|TENNESSEE PIPELINE|MERCHANT ENERGY|CGP|FIELD SERVICES|PIPELINE PARTNERS)\b/i, "elpaso", { from: "2012-05-24" }),
    unit("KMI", "El Paso's companies", /^TENNESSEE GAS PIPELINE\b/i, "tennesseegaspipeline", { from: "2012-05-24" }),
    unit("KMI", "El Paso's companies", /^SOUTHERN NATURAL GAS\b/i, "southernnaturalgas", { from: "2012-05-24" }),
    unit("KMI", "El Paso's companies", /^COLORADO INTERSTATE GAS\b/i, "coloradointerstategas", { from: "2012-05-24" }),
  ],
  107263: [
    unit("WMB", "Northwest Pipeline", /^NORTHWEST PIPELINE\b/i, "northwestpipeline"),
    unit("WMB", "Williams' companies", /^(?:THE\s+)?WILLIAMS (?:FIELD SERVICES|GAS PIPELINE|MIDSTREAM|OLEFINS|FOUR CORNERS|PARTNERS|ENERGY (?:SERVICES|MARKETING))\b/i, "williams"),
    unit("WMB", "Williams' production companies", /^(?:THE\s+)?WILLIAMS (?:PRODUCTION|E&P|EXPLORATION)\b/i, "williams", { to: "2011-12-29" }),
    unit("WMB", "Transco", /^TRANSCONTINENTAL GAS PIPE ?LINE\b/i, "transcontinentalgas", { from: "1995-01-18" }),
  ],
  895728: [
    unit("ENB", "Enbridge's US companies", /^ENBRIDGE\b/i, "enbridge"),
    unit("ENB", "Spectra Energy's pipelines", /^TEXAS EASTERN TRANSMISSION\b/i, "texaseastern", { from: "2017-02-27" }),
    unit("ENB", "Spectra Energy's pipelines", /^ALGONQUIN GAS TRANSMISSION\b/i, "algonquingas", { from: "2017-02-27" }),
    unit("ENB", "Spectra Energy's pipelines", /^EAST TENNESSEE NATURAL GAS\b/i, "easttennessee", { from: "2017-02-27" }),
    unit("ENB", "Spectra Energy's pipelines", /^SPECTRA ENERGY\b/i, "spectraenergy", { from: "2017-02-27" }),
  ],
  1232384: [
    unit("TRP", "TransCanada's US companies", /^TRANSCANADA\b(?!\s+KEYSTONE)/i, "transcanada"),
    unit("TRP", "TransCanada's US companies", /^TC ENERGY\b(?!\s+KEYSTONE)/i, "tcenergy"),
    unit("TRP", "Keystone Pipeline", /^(?:TRANSCANADA|TC (?:ENERGY|OIL))\s+KEYSTONE\b/i, "keystone", { to: "2024-09-30" }),
    unit("TRP", "ANR Pipeline", /^ANR PIPE ?LINE\b/i, "anrpipe", { from: "2007-02-27" }),
    unit("TRP", "Columbia's pipelines", /^COLUMBIA GAS TRANSMISSION\b/i, "columbiagastransmission", { from: "2016-07-01" }),
    unit("TRP", "Columbia's pipelines", /^COLUMBIA GULF TRANSMISSION\b/i, "columbiagulf", { from: "2016-07-01" }),
  ],
  // South Bow, TC Energy's liquids pipelines, from the spin-off
  2019061: [unit("SOBO", "Keystone Pipeline", /^(?:TRANSCANADA|TC (?:ENERGY|OIL))\s+KEYSTONE\b/i, "keystone", { from: "2024-10-01" })],
  // the refiners and chemical makers
  1035002: [
    unit("VLO", "Valero's companies", /^VALERO\s+(?:ENERGY|REFINING|REFINERY|MARKETING|RENEWABLE|LOGISTICS|LIMA|PAULSBORO)\b/i, "valero", OIL),
    unit("VLO", "Ultramar Diamond Shamrock", /^ULTRAMAR\b/i, "ultramar", { from: "2001-12-31", ...OIL }),
    unit("VLO", "Ultramar Diamond Shamrock", /^DIAMOND SHAMROCK (?:REFINING|THREE RIVERS|MCKEE)\b/i, "diamondshamrock", { from: "2001-12-31", ...OIL }),
    unit("VLO", "Premcor", /^(?:THE\s+)?PREMCOR\b/i, "premcor", { from: "2005-09-01" }),
  ],
  773840: [
    unit("HON", "AlliedSignal's companies", /^ALLIED[- ]?SIGNAL\b/i, "alliedsignal"),
    unit("HON", "Honeywell's companies", /^HONEYWELL\b/i, "honeywell", { from: "1999-12-01" }),
  ],
  1307954: [unit("HUN", "Huntsman's companies", /^HUNTSMAN (?:CORP(?:ORATION)?|INTERNATIONAL|POLYMERS|PETROCHEMICAL|CHEMICAL|ADVANCED|BUILDING|EXPANDABLE|SPECIALTY|ETHYLENEAMINES|ICI)\b/i, "huntsman")],
  1262823: [
    unit("WLK", "Westlake's companies", /^WESTLAKE (?:VINYLS?|PETROCHEMICALS|POLYMERS|CHEMICALS?|STYRENE|LONGVIEW|CA&O|PVC|NATRIUM|MONOMERS)\b/i, "westlake"),
    unit("WLK", "Axiall and Georgia Gulf", /^AXIALL\b/i, "axiall", { from: "2016-08-31" }),
    unit("WLK", "Axiall and Georgia Gulf", /^GEORGIA GULF\b/i, "georgiagulf", { from: "2016-08-31" }),
    unit("WLK", "Axiall and Georgia Gulf", /^EAGLE (?:US 2|NATRIUM)\b/i, "eagle", { from: "2016-08-31" }),
  ],
  1489393: [
    unit("LYB", "Equistar, Lyondell and Houston Refining", /^EQUISTAR\b/i, "equistar"),
    unit("LYB", "Equistar, Lyondell and Houston Refining", /^LYONDELL\b(?!\s+ENVIRONMENTAL CUSTODIAL)/i, "lyondell"),
    unit("LYB", "Equistar, Lyondell and Houston Refining", /^HOUSTON REFINING\b/i, "houstonrefining"),
    unit("LYB", "Equistar, Lyondell and Houston Refining", /^MILLENNIUM (?:PETROCHEMICALS|CHEMICALS)\b/i, "millennium"),
  ],
  1060391: [
    unit("RSG", "Republic's companies", /^REPUBLIC (?:SERVICES|WASTE)\b/i, "republic"),
    unit("RSG", "Allied Waste and Browning-Ferris", /^ALLIED WASTE\b/i, "alliedwaste", { from: "2008-12-05" }),
    unit("RSG", "Allied Waste and Browning-Ferris", /^BROWNING[- ]?FERRIS\b/i, "browningferris", { from: "2008-12-05" }),
    unit("RSG", "Allied Waste and Browning-Ferris", /^BFI\b/i, "bfi", { from: "2008-12-05" }),
  ],
  879764: [unit("TTE", "Total's US companies", /^TOTAL\s+(?:FINA\s*ELF\s+)?(?:PETROCHEMICALS?|E&P USA|SPECIALTIES USA|HOLDINGS USA)\b/i, "total")],
  // the miners
  831259: [
    unit("FCX", "Freeport-McMoRan's companies", /^FREEPORT[- ]?MCMORAN\b(?![-,.\s]*(?:RESOURCE|SULPHUR|GOLD|ENERGY)\b)/i, "freeport", { from: "2007-03-19" }),
    unit("FCX", "Phelps Dodge's companies", /^PHELPS DODGE\b/i, "phelpsdodge", { from: "2007-03-19" }),
    unit("FCX", "Phelps Dodge's companies", /^CYPRUS (?:AMAX|MINES|CLIMAX|MIAMI|BAGDAD|SIERRITA|TOHONO)\b/i, "cyprus", { from: "2007-03-19" }),
    unit("FCX", "Phelps Dodge's companies", /^CLIMAX MOLYBDENUM\b/i, "climaxmolybdenum", { from: "2007-03-19" }),
  ],
  863064: [
    unit("RIO", "Kennecott, U.S. Borax and Rio Tinto's companies", /^KENNECOTT\b/i, "kennecott"),
    unit("RIO", "Kennecott, U.S. Borax and Rio Tinto's companies", /^U\.?\s?S\.?\s?BORAX\b/i, "usborax"),
    unit("RIO", "Kennecott, U.S. Borax and Rio Tinto's companies", /^RIO TINTO\b/i, "riotinto"),
  ],
  1285785: [
    unit("MOS", "Mosaic's companies", /^(?:THE\s+)?MOSAIC (?:FERTILIZER|PHOSPHATES?|CROP|POTASH|COMPANY|CO\b|GLOBAL|USA)/i, "mosaic", { from: "2004-10-22" }),
    unit("MOS", "IMC and Cargill Fertilizer", /^IMC\s*-?\s*(?:PHOSPHATES?|GLOBAL|AGRICO|FERTILIZER|KALIUM|AGRIBUSINESS|NITROGEN)\b/i, "imc", { from: "2004-10-22" }),
    unit("MOS", "IMC and Cargill Fertilizer", /^CARGILL FERTILIZER\b/i, "cargillfertilizer", { from: "2004-10-22" }),
  ],
  764065: [
    unit("CLF", "AK Steel", /^AK STEEL\b/i, "aksteel", { from: "2020-03-13" }),
    unit("CLF", "ArcelorMittal USA", /^ARCELOR\s?MITTAL\s*\(?\s*(?:USA|STEEL USA|BURNS|INDIANA HARBOR|CLEVELAND|RIVERDALE|WEIRTON|COATESVILLE|STEELTON|CONSHOHOCKEN|MONESSEN|WARREN|COLUMBUS|MINORCA|HIBBING|PLATE)\b/i, "arcelormittal", { from: "2020-12-07" }),
    unit("CLF", "ArcelorMittal USA", /^ISPAT INLAND\b/i, "ispatinland", { from: "2020-12-07" }),
  ],
  // the oilfield-services company, the drugmaker, the food and drink companies
  87347: [
    unit("SLB", "Schlumberger's companies", /^SCHLUMBERGER\b/i, "schlumberger"),
    unit("SLB", "Smith International", /^SMITH INTERNATIONAL\b/i, "smithinternational", { from: "2010-08-27" }),
    unit("SLB", "Cameron", /^CAMERON INTERNATIONAL\b/i, "cameroninternational", { from: "2016-04-01" }),
  ],
  78003: [
    unit("PFE", "Warner-Lambert and Parke-Davis", /^WARNER[- ]LAMBERT\b/i, "warnerlambert", { from: "2000-06-19" }),
    unit("PFE", "Warner-Lambert and Parke-Davis", /^PARKE[- ]DAVIS\b/i, "parkedavis", { from: "2000-06-19" }),
    // Pharmacia LLC, the old Monsanto Company's legal entity, from 2003: the owner's call of 2026-11-08
    unit("PFE", "Pharmacia and Upjohn", /^PHARMACIA\b/i, "pharmacia", { from: "2003-04-16" }),
    unit("PFE", "Pharmacia and Upjohn", /^(?:THE\s+)?UPJOHN\b/i, "upjohn", { from: "2003-04-16" }),
    unit("PFE", "Wyeth", /^WYETH\b/i, "wyeth", { from: "2009-10-15" }),
  ],
  96021: [unit("SYY", "Sysco's companies", /^SYSCO\b/i, "sysco")],
  100493: [
    unit("TSN", "Tyson's companies", /^TYSONS? (?:FRESH MEATS|POULTRY|FARMS|PREPARED|DELI|REFRIGERATED|FOODS?|CHICKEN|PORK)\b/i, "tyson"),
    unit("TSN", "IBP", /^IBP\b/i, "ibp", { from: "2001-09-28" }),
    unit("TSN", "Hillshire Brands", /^HILLSHIRE\b/i, "hillshire", { from: "2014-08-28" }),
  ],
  77476: [
    unit("PEP", "Frito-Lay", /^FRITO[- ]?LAY\b/i, "fritolay"),
    unit("PEP", "Quaker Oats", /^(?:THE\s+)?QUAKER OATS\b/i, "quakeroats", { from: "2001-08-02" }),
    unit("PEP", "Pepsi Bottling Group", /^(?:PEPSI BOTTLING GROUP|BOTTLING GROUP)\b/i, "bottlinggroup", { from: "2010-02-26" }),
  ],
  24545: [
    unit("TAP", "Coors Brewing and Molson Coors", /^COORS BREWING\b/i, "coorsbrewing"),
    unit("TAP", "Coors Brewing and Molson Coors", /^MOLSON COORS\b/i, "molsoncoors"),
    unit("TAP", "MillerCoors", /^MILLERCOORS\b/i, "millercoors", { from: "2016-10-11" }),
  ],
  1668717: [unit("BUD", "Anheuser-Busch", /^ANHEUSER[- ]?BUS?CH\b/i, "anheuser", { from: "2008-11-18" })],
  64803: [unit("CVS", "CVS Pharmacy and CVS's companies", /^CVS\b/i, "cvs")],
  // the makers
  715153: [unit("HMC", "Honda's US companies", /^(?:AMERICAN HONDA|HONDA (?:OF AMERICA|MANUFACTURING|TRANSMISSION|ENGINEERING|R&D|NORTH AMERICA|POWER))\b/i, "honda")],
  315189: [unit("DE", "John Deere's companies", /^JOHN DEERE\b/i, "johndeere")],
  217346: [
    unit("TXT", "Bell Helicopter", /^BELL HELICOPTER\b/i, "bellhelicopter"),
    unit("TXT", "E-Z-GO", /^E-?Z-?GO\b/i, "ezgo"),
    unit("TXT", "Cessna", /^(?:THE\s+)?CESSNA AIRCRAFT\b/i, "cessna", { from: "1994-03-30" }),
  ],
};

/** The letters a company's stored cases are asked by for its units (`UNITS`). */
export const unitKeysOf = (cik: number | string): string[] => (UNITS[Number(cik)] ?? []).map((u) => u.key);

const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const lawsOf = (codes: readonly string[]) => codes.map((c) => LAWS[c] ?? c);
const what = (c: EpaCase) =>
  c.step === "lodged" || c.step === "entered" ? "EPA consent decree" : c.step === "filed" ? "EPA suit filed in court" : c.step === "order" ? "EPA final order" : "EPA administrative complaint";
/** A case with its own row: one in court, or one with a penalty. The rest are grouped a row a month. */
export const ownRow = (c: EpaCase) => c.court || c.penalty !== null;
/** …as it was before batch 113, when a penalty was the case total alone: where its stored row is kept. */
const ownRowBefore = (c: EpaCase) => c.court || (c.penalty !== null && !c.settled);

/** A case of this many defendants or more says so in its title: a Superfund site's settlement often names hundreds. */
export const MANY_PARTIES = 10;

/** "EPA consent decree: $11,000,000 civil penalty (Clean Air Act)", "EPA consent decree with 585 parties (Superfund law (CERCLA))" */
export function caseTitle(c: EpaCase): string {
  const law = c.laws.length ? ` (${lawsOf(c.laws).slice(0, 2).join(", ")}${c.laws.length > 2 ? "…" : ""})` : "";
  const parties = c.defendants.length >= MANY_PARTIES ? ` with ${c.defendants.length} parties` : "";
  return `${what(c)}${parties}${c.penalty ? `: ${dollars(c.penalty)} civil penalty` : ""}${law}`;
}

/**
 * "AEP (case 03-1999-0388), with 8 other defendants: $6,225,000 civil penalty; work ordered
 * $1,923,940,000, EPA's estimate, among 9 parties". The penalty is said here when the row's title
 * does not: on a day of several cases. The work ordered is the settlement's whole, so a case of
 * several parties says among how many (batch 113).
 *
 * A case of several defendants named for its site or another party, not the company, names the
 * page's own defendants (`mine`), up to three: "AMERICAN CYANAMID (FIKE CHEMICAL SITE) (case 03-1990-0627), against SCHERING-PLOUGH CORP.
 * and 63 other defendants". A reader sees why the row is on the page, and a row of Schering-Plough's
 * own past on Merck's page carries its label (batch 116, the audit's finding 3).
 */
/** A row's lines as a sentence: one full stop, though a line ends in "INC." */
const sentence = (x: string) => `${x.replace(/\.+$/, "")}.`;

function caseLine(c: EpaCase, withPenalty = false, mine: readonly string[] = []): string {
  // a case of one defendant is that defendant's case, whatever spelling its name has
  const shown = c.defendants.length > 1 ? mine.filter((d) => !alnum(c.name).includes(alnum(d))).slice(0, 3) : [];
  const rest = c.defendants.length - (shown.length ? shown.length : 1);
  const others = shown.length
    ? `, against ${shown.join(", ")}${rest > 0 ? ` and ${rest} other defendant${rest > 1 ? "s" : ""}` : ""}`
    : c.defendants.length > 1
      ? `, with ${c.defendants.length - 1} other defendant${c.defendants.length > 2 ? "s" : ""}`
      : "";
  const money = [
    ...(withPenalty && c.penalty ? [`${dollars(c.penalty)} civil penalty`] : []),
    ...(c.workOrdered ? [`work ordered ${dollars(c.workOrdered)}, EPA's estimate${c.defendants.length > 1 ? `, among ${c.defendants.length} parties` : ""}`] : []),
  ];
  const of = c.settlementOf;
  const settlement = of ? (of.first === of.last ? `, settlement ${of.first} of ${of.of}` : `, settlements ${of.first} to ${of.last} of ${of.of}`) : "";
  return `${c.name} (case ${c.number}${settlement}${c.docket ? `, Justice Department docket ${c.docket}` : ""})${others}${money.length ? `: ${money.join("; ")}` : ""}`;
}

/** A suit filed this many days or fewer before its first settlement has no row of its own: the settlement's day says it. */
export const SUIT_LEAD_DAYS = 30;

const daysFrom = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/**
 * A court case's first settlement: its own day when it is a settlement's (lodged or entered), else
 * the first settlement EPA dates; null for a case with none.
 */
export function firstSettled(c: EpaCase): string | null {
  const days = [...(c.court && (c.step === "lodged" || c.step === "entered") ? [c.day] : []), ...(c.settlements ?? []).map((x) => x.day)].sort();
  return days[0] ?? null;
}

/**
 * A court case of settlements on two days or more, as one view a settlement day: that day's
 * settlements' own penalty and work ordered, added in whole cents when two were lodged the same day.
 * Null for any other case (batch 122, the 2026-11-08 proposal 2(b)).
 */
export function bySettlement(c: EpaCase): EpaCase[] | null {
  const all = c.court ? (c.settlements ?? []) : [];
  const days = [...new Set(all.map((x) => x.day))];
  if (days.length < 2) return null;
  return days.map((d) => {
    const first = all.findIndex((x) => x.day === d);
    const held = all.filter((x) => x.day === d);
    const penalty = held.reduce<string | null>((sum, x) => addAmounts(sum, x.penalty), null);
    return {
      ...c,
      day: d,
      step: held.some((x) => x.lodged) ? ("lodged" as const) : ("entered" as const),
      penalty,
      settled: penalty !== null,
      workOrdered: held.reduce<string | null>((sum, x) => addAmounts(sum, x.work), null),
      settlementOf: { first: first + 1, last: first + held.length, of: all.length },
    };
  });
}

/**
 * The cases naming the company as a defendant, as timeline events. `namesIn(year)` gives its names
 * that year; before `from`, its first price, a case is not its. A court case or a case with a
 * penalty has its own row, the company's cases of one day one row; the orders and complaints with
 * no penalty are grouped a row a month when a month holds two or more, as the Federal Register's
 * routine notices are (`pageRegulations`). Every listed defendant gets the case, under the
 * owner's rule of 2026-11-05, and a unit the company then owned (`UNITS`).
 *
 * EPA's own days (batch 122, the 2026-11-08 proposal 2, approved by the owner that day):
 *  - (a) A court case's suit filed more than `SUIT_LEAD_DAYS` before its first settlement has a row
 *    of its own on the filing day, "EPA suit filed in court", with no money: that stays on the
 *    settlement's row. The rule's tests run on the filing day, a unit counting only if its owner
 *    held it then (Mobil's suit of 1996 is no ExxonMobil row), and the row is kept only where the
 *    page's own that day are every defendant, or at least half of fewer than `MANY_PARTIES`. A day's
 *    suits are one row, keyed apart from the day's settlements (`…@day:filed`).
 *  - (b) A court case of settlements on two days or more has a row for each settlement day, with that
 *    day's own penalty and work ordered, on the page whose own are every defendant that day: a
 *    unit's settlements before its sale stay its seller's. A case of several parties keeps one row.
 *    The case's own day is almost always a settlement's (267 of the slice's 268 such cases), so its
 *    row keeps its key; where it is not, the stored row moves onto the last settlement's row
 *    (`legacyDedupBasis`). EPA's summary of the case goes on that one row.
 *
 * A month's cases with no penalty are kept under the month's key from the first (batch 100, the
 * audit's finding 2), so a month read again when it holds two updates one row; a row stored under
 * the old day key moves onto it (`legacyDedupBasis`) when no case of the company's own row is that day.
 */
export function epaEvents(cases: readonly EpaCase[], namesIn: (year: number) => string[], { cik, from = "" }: { cik?: number | string; from?: string } = {}): TimelineEvent[] {
  const refused = cik === undefined ? [] : (NOT_THE_COMPANY[Number(cik)] ?? []);
  const units = cik === undefined ? [] : (UNITS[Number(cik)] ?? []);
  const own = new Map<string, EpaCase[]>();
  const routine = new Map<string, EpaCase[]>();
  // the rule runs only on a defendant that holds one of the names' letters at all: a case can name
  // hundreds of parties, and the names are the same through a year
  const byYear = new Map<number, { names: string[]; keys: string[] }>();
  const namesFor = (year: number) => {
    let held = byYear.get(year);
    if (!held) {
      const names = namesIn(year);
      held = { names, keys: [...new Set(names.flatMap(andSpellings).map(alnum).filter((k) => k.length >= 2))] };
      byYear.set(year, held);
    }
    return held;
  };
  // the page's own defendants of a case on a day: by its names that year, and the units it then held
  const mineOn = (c: EpaCase, on: string): string[] => {
    const { names, keys } = namesFor(Number(on.slice(0, 4)));
    return c.defendants.filter((d) => {
      const letters = alnum(d);
      if (units.some((u) => on >= (u.from ?? "") && (!u.to || on <= u.to) && u.defendant.test(d.trim()) && !(u.branded && BRANDED_SITE.test(d)))) return true;
      // …and not a name the record took from another company, before the day (lib/takenNames.ts, batch 117)
      return keys.some((k) => letters.includes(k)) && !refused.some((r) => r.defendant.test(d)) && !takenBefore(cik, on, d) && epaParty(d, names) !== null;
    });
  };
  // …which a row names only where the case's own name does not already name the company: AEP's
  // "AMERICAN ELECTRIC POWER CO (NATIONAL CASE)" needs no list of its operating companies
  const shownOf = (c: EpaCase, on: string, mine: string[]) => (epaParty(c.name, namesFor(Number(on.slice(0, 4))).names) === null ? mine : []);
  // the page's own defendants of each case it holds, which its row names (`caseLine`)
  const mineOf = new Map<EpaCase, string[]>();
  // the suits filed in court before their first settlement, by the filing day (batch 122)
  const suits = new Map<string, { c: EpaCase; settled: string }[]>();
  // a day whose stored row a split case leaves, and the settlement day it moves to
  const leaves = new Map<string, string>();
  for (const c of cases) {
    if (c.day < from) continue;
    // (a) the day the suit was filed, where the page's own that day are every defendant or at least
    // half of fewer than `MANY_PARTIES`, under the rule's tests on that day
    const settled = c.court && c.step !== "filed" && c.suitFiled && c.suitFiled >= from ? firstSettled(c) : null;
    if (c.suitFiled && settled && daysFrom(c.suitFiled, settled) > SUIT_LEAD_DAYS) {
      const then = mineOn(c, c.suitFiled);
      if (then.length && (then.length === c.defendants.length || (c.defendants.length < MANY_PARTIES && then.length * 2 >= c.defendants.length))) {
        const view = { ...c, penalty: null, settled: false, workOrdered: null };
        mineOf.set(view, shownOf(c, c.suitFiled, then));
        suits.set(c.suitFiled, [...(suits.get(c.suitFiled) ?? []), { c: view, settled }]);
      }
    }
    const mine = mineOn(c, c.day);
    // (b) a case of several settlements: each settlement on its own day, with its own figures, on the
    // page whose own are every defendant that day. A unit's settlements before its sale stay its
    // seller's: Murphy Oil USA's of 2010 are Murphy Oil's, its of 2019 and 2020 Murphy USA's
    const split = (bySettlement(c) ?? []).filter((v) => v.day >= from && mineOn(c, v.day).length === c.defendants.length);
    if (!mine.length && !split.length) continue;
    // the case's own day keeps its row, or the last settlement takes it; that row alone carries EPA's
    // summary of the case, which says the same on every settlement's
    const home = split.find((v) => v.day === c.day) ?? split[split.length - 1];
    if (mine.length && home && home.day !== c.day && !leaves.has(c.day)) leaves.set(c.day, home.day);
    for (const v of split.length ? split.map((x) => (x === home ? x : { ...x, summary: null })) : [c]) {
      mineOf.set(v, shownOf(c, v.day, v === c ? mine : mineOn(c, v.day)));
      const into = ownRow(v) ? own : routine;
      const key = ownRow(v) ? v.day : v.day.slice(0, 7);
      into.set(key, [...(into.get(key) ?? []), v]);
    }
  }
  const tag = cik === undefined ? "" : `${Number(cik)}`;
  const events: TimelineEvent[] = [];
  const dayRow = (d: string, rows: readonly EpaCase[]) => {
    const sorted = [...rows].sort((a, b) => Number(b.penalty ?? 0) - Number(a.penalty ?? 0) || Number(b.court) - Number(a.court) || a.number.localeCompare(b.number));
    const lead = sorted[0];
    const more = sorted.length > 1 ? `, and ${sorted.length - 1} more case${sorted.length > 2 ? "s" : ""} that day` : "";
    // EPA's own words, from the first case that says something: the lead's, else the next one's
    const said = sorted.find((c) => c.summary);
    const summary = said?.summary ? ` EPA's summary${sorted.length > 1 ? ` of case ${said.number}` : ""}: ${said.summary}` : "";
    return {
      date: d,
      type: "regulation" as const,
      title: `${caseTitle(lead)}${more}`,
      source: "EPA",
      url: caseReportUrl(lead.number),
      description: `${sentence(sorted.map((c) => caseLine(c, sorted.length > 1, mineOf.get(c))).join("; "))} ${lead.step === "lodged" ? "The day the settlement was lodged in court." : lead.step === "order" ? "The day the final order was issued." : ""}${summary}`.replace(/\s+/g, " ").trim(),
      sourceKey: "epa_cases" as const,
      externalId: sorted.map((c) => c.number).join(","),
    };
  };
  // a month whose cases had no penalty before batch 113 and all have one now: its stored row moves
  // onto the first of their own rows, so the case keeps its history and a follower sees nothing new
  const movedFrom = new Map<string, string>();
  for (const [d, rows] of own) {
    const month = d.slice(0, 7);
    if (routine.has(month) || !rows.some((c) => !ownRowBefore(c))) continue;
    const was = movedFrom.get(month);
    if (!was || d < was) movedFrom.set(month, d);
  }
  // a day a split case left with no row of its own: its stored row moves onto the case's last
  // settlement's, so the row keeps its history (batch 122; one case of the slice's 268, on no page)
  const arriving = new Map<string, string>();
  for (const [left, to] of leaves) if (!own.has(left) && !arriving.has(to)) arriving.set(to, left);
  for (const [d, rows] of own) {
    const month = d.slice(0, 7);
    const left = arriving.get(d);
    const moved = movedFrom.get(month) === d ? { legacyDedupBasis: `epa:${tag}@${month}:no-penalty` } : left ? { legacyDedupBasis: `epa:${tag}@${left}` } : {};
    events.push({ id: `epa-${tag}-${d}`, ...dayRow(d, rows), dedupBasis: `epa:${tag}@${d}`, ...moved });
  }
  for (const [d, rows] of suits) {
    const sorted = [...rows].sort((a, b) => a.c.number.localeCompare(b.c.number));
    const lead = sorted[0].c;
    const more = sorted.length > 1 ? `, and ${sorted.length - 1} more case${sorted.length > 2 ? "s" : ""} that day` : "";
    events.push({
      id: `epa-${tag}-${d}-filed`,
      date: d,
      type: "regulation",
      title: `${caseTitle({ ...lead, step: "filed" })}${more}`,
      source: "EPA",
      url: caseReportUrl(lead.number),
      description: `${sentence(sorted.map(({ c, settled }) => `${caseLine(c, false, mineOf.get(c))}, its first settlement dated ${settled}`).join("; "))} The day the suit${sorted.length > 1 ? "s were" : " was"} filed in court.`,
      sourceKey: "epa_cases",
      externalId: sorted.map(({ c }) => c.number).join(","),
      dedupBasis: `epa:${tag}@${d}:filed`,
    });
  }
  for (const [month, rows] of routine) {
    const sorted = [...rows].sort((a, b) => b.day.localeCompare(a.day) || a.number.localeCompare(b.number));
    const first = sorted[sorted.length - 1].day;
    // …never a day a split case left, whose stored row is a court case's, not this month's
    const moved = own.has(first) || leaves.has(first) ? {} : { legacyDedupBasis: `epa:${tag}@${first}` };
    if (rows.length === 1) {
      events.push({ id: `epa-${tag}-${month}-orders`, ...dayRow(rows[0].day, rows), dedupBasis: `epa:${tag}@${month}:no-penalty`, ...moved });
      continue;
    }
    const codes = [...new Set(sorted.flatMap((c) => c.laws))];
    const [y, m] = month.split("-");
    events.push({
      id: `epa-${tag}-${month}-orders`,
      date: `${month}-01`,
      precision: "month",
      type: "regulation",
      title: `EPA: ${rows.length} orders or complaints with no penalty, ${MONTH[Number(m) - 1]} ${y}${codes.length ? ` (${lawsOf(codes).slice(0, 2).join(", ")}${codes.length > 2 ? "…" : ""})` : ""}`,
      source: "EPA",
      url: caseReportUrl(sorted[0].number),
      description: `${rows.length} cases with no penalty this month, grouped into one row: ${sentence(`${sorted.slice(0, 3).map((c) => caseLine(c, false, mineOf.get(c))).join("; ")}${rows.length > 3 ? `; and ${rows.length - 3} more` : ""}`)} The link opens the newest.`,
      sourceKey: "epa_cases",
      externalId: sorted.map((c) => c.number).join(","),
      dedupBasis: `epa:${tag}@${month}:no-penalty`,
      ...moved,
    });
  }
  return events.sort((a, b) => b.date.localeCompare(a.date));
}

export interface CaseFileAnswer {
  cases: EpaCase[];
  /** the file's own Last-Modified, as EPA sends it */
  modified: string | null;
  outcome: "ok" | "unchanged" | "throttled" | "error";
  httpStatus?: number;
  detail?: string;
}

const TIMEOUT_MS = 300_000;

/**
 * EPA's case file, read whole. `since` is the Last-Modified of the copy already kept: a file EPA
 * has not changed answers "unchanged" without being read again.
 */
export async function fetchCaseFile(since: string | null = null): Promise<CaseFileAnswer> {
  try {
    const res = await fetch(CASE_FILE_URL, { headers: { ...UA, ...(since ? { "If-Modified-Since": since } : {}) }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const modified = res.headers.get("last-modified");
    if (res.status === 304 || (since && modified === since)) return { cases: [], modified: modified ?? since, outcome: "unchanged", httpStatus: res.status };
    if (res.status === 429 || res.status === 503) return { cases: [], modified, outcome: "throttled", httpStatus: res.status };
    if (!res.ok) return { cases: [], modified, outcome: "error", httpStatus: res.status };
    const cases = readCaseFile(new Uint8Array(await res.arrayBuffer()));
    // a file that reads as a few cases is a broken one, not EPA's: it held 137,108 (2026-10-31)
    if (cases.length < 100_000) return { cases: [], modified, outcome: "error", httpStatus: res.status, detail: `only ${cases.length} cases read` };
    return { cases, modified, outcome: "ok", httpStatus: res.status };
  } catch (err) {
    return { cases: [], modified: null, outcome: "error", detail: String(err).slice(0, 200) };
  }
}
