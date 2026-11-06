import { UA } from "./contact";
import { LEGAL_WORD, captionParty } from "./secCases";
import type { TimelineEvent } from "./types";
import { decodeText, eachCsvRow, readZip } from "./zip";

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

export interface EpaCase {
  /** EPA's case number, "HQ-1996-0001" */
  number: string;
  name: string;
  court: boolean;
  /** the case's public day (YYYY-MM-DD) and what happened on it */
  day: string;
  step: "lodged" | "entered" | "filed" | "order" | "complaint";
  /** the penalty assessed, in whole dollars as EPA writes it, or null for none; never a float */
  penalty: string | null;
  /** the laws, by EPA's code, in its order: "CAA", "CWA", "CERCLA" */
  laws: string[];
  defendants: string[];
  /** the Justice Department's docket number for a court case, when EPA gives one */
  docket: string | null;
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

/**
 * The cases, from the four tables' text. A case's public day: for a court case the day its
 * settlement was lodged ("Final Order Lodged"), else entered, else the day the suit was filed; for
 * an administrative case the day its final order was issued, else the day the complaint was. A
 * case with none of these days is left out (5 of 137,108).
 */
export function readCases(tables: Record<(typeof CASE_TABLES)[number], string>): EpaCase[] {
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
    const name = raw.replace(/\s+/g, " ").trim();
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
  const out: EpaCase[] = [];
  const COLUMNS = ["CASE_NUMBER", "CASE_NAME", "ACTIVITY_TYPE_CODE", "TOTAL_PENALTY_ASSESSED_AMT", "DOJ_DOCKET_NMBR"] as const;
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
    const name = r.CASE_NAME.replace(/\s+/g, " ").trim();
    const ranked = (laws.get(number) ?? []).sort((a, b) => a.rank - b.rank).map((l) => l.code);
    out.push({
      number,
      name,
      court,
      day: steps.get(pick[0]) as string,
      step: pick[1],
      penalty: penaltyOf(r.TOTAL_PENALTY_ASSESSED_AMT),
      laws: [...new Set(ranked)],
      defendants: defendants.get(number) ?? (name ? [name] : []),
      docket: r.DOJ_DOCKET_NMBR.trim() || null,
    });
  });
  return out;
}

/** The cases in EPA's zip. */
export function readCaseFile(zip: Uint8Array): EpaCase[] {
  const files = readZip(zip, CASE_TABLES);
  const missing = CASE_TABLES.filter((t) => !files.has(t));
  if (missing.length) throw new Error(`the case file lacks ${missing.join(", ")}`);
  return readCases(Object.fromEntries(CASE_TABLES.map((t) => [t, decodeText(files.get(t) as Buffer)])) as Record<(typeof CASE_TABLES)[number], string>);
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
 * hold, `NOT_THE_COMPANY` in lib/secCases.ts).
 */
export const NOT_THE_COMPANY: Readonly<Record<number, { ticker: string; defendant: RegExp; why: string }[]>> = {
  1049659: [{ ticker: "SID", defendant: /^NATIONAL STEEL\b/i, why: "National Steel Corporation, the American steelmaker of Mishawaka and Granite City, not Companhia Siderúrgica Nacional" }],
  // batch 100, the audit of batches 94–99, finding 3
  1552275: [{ ticker: "SUN", defendant: /^SUNOCO,?\s+(?:INC|INCORPORATED)\b/i, why: "Sunoco, Inc. (EDGAR CIK 95304), the refiner Energy Transfer bought in 2012, not Sunoco LP, which was Susser Petroleum Partners until 2014-10-27" }],
};

/**
 * The units a listed company owned whose cases EPA files under the unit's own name, by the owner's
 * CIK, each from the day the company owned it (the owner's call of 2026-11-06: "Put Sunoco on
 * Energy Transfer"), read by hand. `key` is the letters the stored cases are asked by.
 *
 * - Sunoco, Inc. is Energy Transfer's from 2012-10-05: Sunoco, Inc.'s own 8-K of 2012-10-11
 *   reports the completion of the acquisition and the change of control that day (items 2.01 and
 *   5.01). Its cases before are no listed company's; Sunoco LP's own stay Sunoco LP's.
 */
export const UNITS: Readonly<Record<number, { ticker: string; unit: string; defendant: RegExp; key: string; from: string; to?: string }[]>> = {
  1276187: [{ ticker: "ET", unit: "Sunoco, Inc.", defendant: /^SUNOCO,?\s+(?:INC|INCORPORATED)\b/i, key: "sunoco", from: "2012-10-05" }],
};

/** The letters a company's stored cases are asked by for its units (`UNITS`). */
export const unitKeysOf = (cik: number | string): string[] => (UNITS[Number(cik)] ?? []).map((u) => u.key);

const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const lawsOf = (codes: readonly string[]) => codes.map((c) => LAWS[c] ?? c);
const what = (c: EpaCase) =>
  c.step === "lodged" || c.step === "entered" ? "EPA consent decree" : c.step === "filed" ? "EPA suit filed in court" : c.step === "order" ? "EPA final order" : "EPA administrative complaint";
/** A case with its own row: one in court, or one with a penalty. The rest are grouped a row a month. */
export const ownRow = (c: EpaCase) => c.court || c.penalty !== null;

/** A case of this many defendants or more says so in its title: a Superfund site's settlement often names hundreds. */
export const MANY_PARTIES = 10;

/** "EPA consent decree: $11,000,000 civil penalty (Clean Air Act)", "EPA consent decree with 585 parties (Superfund law (CERCLA))" */
export function caseTitle(c: EpaCase): string {
  const law = c.laws.length ? ` (${lawsOf(c.laws).slice(0, 2).join(", ")}${c.laws.length > 2 ? "…" : ""})` : "";
  const parties = c.defendants.length >= MANY_PARTIES ? ` with ${c.defendants.length} parties` : "";
  return `${what(c)}${parties}${c.penalty ? `: ${dollars(c.penalty)} civil penalty` : ""}${law}`;
}

function caseLine(c: EpaCase): string {
  const others = c.defendants.length > 1 ? `, with ${c.defendants.length - 1} other defendant${c.defendants.length > 2 ? "s" : ""}` : "";
  return `${c.name} (case ${c.number}${c.docket ? `, Justice Department docket ${c.docket}` : ""})${others}`;
}

/**
 * The cases naming the company as a defendant, as timeline events. `namesIn(year)` gives its names
 * that year; before `from`, its first price, a case is not its. A court case or a case with a
 * penalty has its own row, the company's cases of one day one row; the orders and complaints with
 * no penalty are grouped a row a month when a month holds two or more, as the Federal Register's
 * routine notices are (`pageRegulations`). Every listed defendant gets the case, under the
 * owner's rule of 2026-11-05, and a unit the company then owned (`UNITS`).
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
      held = { names, keys: [...new Set(names.map(alnum).filter((k) => k.length >= 2))] };
      byYear.set(year, held);
    }
    return held;
  };
  for (const c of cases) {
    if (c.day < from) continue;
    const { names, keys } = namesFor(Number(c.day.slice(0, 4)));
    const named = c.defendants.some((d) => {
      const letters = alnum(d);
      if (units.some((u) => c.day >= u.from && (!u.to || c.day <= u.to) && u.defendant.test(d))) return true;
      return keys.some((k) => letters.includes(k)) && !refused.some((r) => r.defendant.test(d)) && epaParty(d, names) !== null;
    });
    if (!named) continue;
    const into = ownRow(c) ? own : routine;
    const key = ownRow(c) ? c.day : c.day.slice(0, 7);
    into.set(key, [...(into.get(key) ?? []), c]);
  }
  const tag = cik === undefined ? "" : `${Number(cik)}`;
  const events: TimelineEvent[] = [];
  const dayRow = (d: string, rows: readonly EpaCase[]) => {
    const sorted = [...rows].sort((a, b) => Number(b.penalty ?? 0) - Number(a.penalty ?? 0) || Number(b.court) - Number(a.court) || a.number.localeCompare(b.number));
    const lead = sorted[0];
    const more = sorted.length > 1 ? `, and ${sorted.length - 1} more case${sorted.length > 2 ? "s" : ""} that day` : "";
    return {
      date: d,
      type: "regulation" as const,
      title: `${caseTitle(lead)}${more}`,
      source: "EPA",
      url: caseReportUrl(lead.number),
      description: `${sorted.map(caseLine).join("; ")}. ${lead.step === "lodged" ? "The day the settlement was lodged in court." : lead.step === "order" ? "The day the final order was issued." : ""}`.trim(),
      sourceKey: "epa_cases" as const,
      externalId: sorted.map((c) => c.number).join(","),
    };
  };
  for (const [d, rows] of own) events.push({ id: `epa-${tag}-${d}`, ...dayRow(d, rows), dedupBasis: `epa:${tag}@${d}` });
  for (const [month, rows] of routine) {
    const sorted = [...rows].sort((a, b) => b.day.localeCompare(a.day) || a.number.localeCompare(b.number));
    const first = sorted[sorted.length - 1].day;
    const moved = own.has(first) ? {} : { legacyDedupBasis: `epa:${tag}@${first}` };
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
      description: `${rows.length} cases with no penalty this month, grouped into one row: ${sorted.slice(0, 3).map(caseLine).join("; ")}${rows.length > 3 ? `; and ${rows.length - 3} more` : ""}. The link opens the newest.`,
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
