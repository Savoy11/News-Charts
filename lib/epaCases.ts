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
export const BRANDED_SITE = /\b(?:SERVICE\s+STATIONS?|STATIONS?|STA\b|SVC|TRUCK\s+STOP|CAR\s+WASH|FOOD\s*MART|MINI[- ]?MART|MART|STORES?|DEALER|JOBBER|DISTRIBUTOR|CONVENIENCE|AM\s*\/?\s*PM)\b|#\s*\d|;/i;

const unit = (ticker: string, name: string, defendant: RegExp, key: string, days: { from?: string; to?: string; branded?: true } = {}): EpaUnit => ({ ticker, unit: name, defendant, key, ...days });
const OIL = { branded: true as const };

export const UNITS: Readonly<Record<number, readonly EpaUnit[]>> = {
  // Energy Transfer (batch 101)
  1276187: [unit("ET", "Sunoco, Inc.", /^SUNOCO,?\s+(?:INC|INCORPORATED)\b/i, "sunoco", { from: "2012-10-05" })],
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
  1047862: [unit("ED", "Consolidated Edison Company of New York", /^CONSOLIDATED EDISON\s+(?:CO(?:MPANY)?\.?\s+)?OF\s+N/i, "consolidatededison")],
  45012: [unit("HAL", "Halliburton's companies", /^HALLIBURTON\b/i, "halliburton")],
  73309: [unit("NUE", "Nucor's steel companies", /^NUCOR\b(?![- ]?\s*(?:YAMATO|TAMATO))/i, "nucor")],
  797468: [unit("OXY", "Occidental Chemical and Occidental's companies", /^OCCIDENTAL\s+(?:CHEMICAL|PETROLEUM|OIL|EXPLORATION|PERMIAN)\b/i, "occidental")],
  936468: [unit("LMT", "Lockheed Martin's companies", /^LOCKHEED MARTIN\b/i, "lockheedmartin")],
  40533: [unit("GD", "General Dynamics' companies", /^GENERAL DYNAMICS\b/i, "generaldynamics")],
  12927: [unit("BA", "Boeing's companies", /^BOEING\b/i, "boeing")],
  65984: [unit("ETR", "Entergy's utilities", /^ENTERGY\b/i, "entergy")],
  1326160: [unit("DUK", "Duke Energy's utilities", /^DUKE ENERGY\s+(?:CAROLINAS|FLORIDA|INDIANA|OHIO|PROGRESS|KENTUCKY)\b/i, "dukeenergy")],
  1094517: [unit("TM", "Toyota Motor's US companies", /^TOYOTA MOTOR\b/i, "toyotamotor")],
  354950: [unit("HD", "Home Depot U.S.A.", /^(?:THE\s+)?HOME DEPOT,?\s+(?:U\.?\s?S\.?\s?A|NORTHEASTERN)/i, "homedepot")],
  60667: [unit("LOW", "Lowe's Home Centers", /^LOWE'?S\s+HOME\s+CENTER/i, "loweshomecenter")],
  80424: [unit("PG", "Procter & Gamble's companies", /^PROCTER\s+(?:&|AND)\s+GAMBLE\b/i, "procter")],
  55785: [unit("KMB", "Kimberly-Clark's companies", /^KIMBERLY[- ]?CLARK\b(?!\s+PRINTING)/i, "kimberlyclark")],
  1996862: [unit("BG", "Bunge North America", /^BUNGE\b/i, "bunge")],
  1076378: [unit("CX", "CEMEX's US companies", /^CEMEX\b/i, "cemex")],
  849869: [unit("SLGN", "Silgan's companies", /^SILGAN\b/i, "silgan")],
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
      if (units.some((u) => c.day >= (u.from ?? "") && (!u.to || c.day <= u.to) && u.defendant.test(d.trim()) && !(u.branded && BRANDED_SITE.test(d)))) return true;
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
