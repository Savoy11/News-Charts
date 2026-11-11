import type { TimelineEvent } from "./types";
import { UA } from "./contact";
import { decodeText, eachCsvRow, eachZipLine, readZip } from "./zip";

/**
 * Deaths at mines a listed company controlled, from 2000 (batch 134, the 2026-11-09b proposal 2,
 * approved by the owner on 2026-11-10).
 *
 * Read from the Mine Safety and Health Administration's open data: the Accidents file, one row per
 * person in every accident, injury and illness a mine operator or contractor reported on MSHA's Form
 * 7000-1 since 2000, and the Mines file, one row per mine. Both are zips MSHA rebuilds and serves
 * whole, read once a week for every company (`lib/ingest/mineWalk.ts`). A row of this source is one
 * accident that killed someone: the records whose degree of injury is a fatality (MSHA's code "01"),
 * grouped by mine and day, since the victims of one accident are sometimes recorded minutes apart
 * (Kinross's two of 2026-09-03 at 15:45 and 15:50).
 *
 * Public domain. The Labor Department's terms (www.dol.gov/general/aboutdol/copyright, read
 * 2026-11-10): "Materials created by the federal government are generally part of the public domain
 * and may be used, reproduced and distributed without permission", but not "in a manner that implies
 * any affiliation or endorsement by the DOL"; credited to the Department, its seals and logos never
 * used.
 *
 * The report is the operator's own filing to its regulator, not a finding of fault, and the row says
 * so. Each record names the mine's controller and operator by the IDs they had on the accident's day
 * (all 1,124 fatal accidents with a controller, of 1,130, match MSHA's controller history for the mine
 * on that day; six give none), but by each ID's present name: Minorca's accidents of 2007 and 2019, ArcelorMittal's, carry
 * "Cleveland-Cliffs Minorca Mine Inc.", the name of the operator after Cleveland-Cliffs bought it in
 * 2020. A row's title therefore names no operator; its text gives MSHA's present names as present
 * names. The mine's place, county and state, is the Mines file's, which a mine does not leave.
 *
 * MSHA's own finding (batch 139, the 2026-11-11 proposal 1, approved by the owner on 2026-11-11, on the
 * death's row): MSHA investigates every death and assesses a penalty for each violation it cites. Two
 * more files of the same open-data page give it, read once a month: the Inspections file (every
 * inspection and investigation, by MSHA's event number and activity code) and the Assessed Violations
 * file (every violation assessed, by the event it was cited under; the violator is named as it was at
 * the assessment). An investigation of an accident (code E06 since 2005; AFA, and the older 30, before)
 * is the accident's when MSHA began it at the accident's mine on its day or within 14 days after, the
 * latest such accident at the mine; its assessed violations are the finding the row gives, after the
 * operator's report: how many, against the operator or a contractor, how many under section 104(d)
 * (an unwarrantable failure) and specially assessed, and the penalties proposed and assessed now, in
 * whole cents, never a float. A proposed penalty is not a final one: a contested case goes to the
 * Federal Mine Safety and Health Review Commission, and the figure assessed now can rise as well as
 * fall. Nothing is said where nothing was assessed: an absence is not a finding.
 */

export const ACCIDENTS_URL = "https://arlweb.msha.gov/OpenGovernmentData/DataSets/Accidents.zip";
export const MINES_URL = "https://arlweb.msha.gov/OpenGovernmentData/DataSets/Mines.zip";
/** MSHA's own finding on a death (batch 139): its investigations, and the violations it assessed under each. */
export const INSPECTIONS_URL = "https://arlweb.msha.gov/OpenGovernmentData/DataSets/Inspections.zip";
export const VIOLATIONS_URL = "https://arlweb.msha.gov/OpenGovernmentData/DataSets/AssessedViolations.zip";
/** MSHA's open-data page, which lists both files and their definitions: every row links here. */
export const DATA_PAGE = "https://arlweb.msha.gov/OpenGovernmentData/OGIMSHA.asp";
const ACCIDENTS_ENTRY = "Accidents.txt";
const MINES_ENTRY = "Mines.txt";
const TIMEOUT_MS = 300_000;
/** MSHA's code for a death in DEGREE_INJURY_CD. */
const FATAL = "01";

export interface MineController {
  /** MSHA's controller ID exactly as its files write it: "C00692", "0071891". */
  id: string;
  /** The controller's name in MSHA's files today. */
  name: string;
  /** The first day its accidents are this company's (YYYY-MM-DD). Absent when the company's first price floors it. */
  from?: string;
  /** The last day they are. */
  to?: string;
  /** Why this controller is the company's, and why from or to that day. */
  why: string;
}

/**
 * Which MSHA controllers' mines belong to which listed company, by CIK. Read by hand, never matched by
 * name at ingest: MSHA names a controller, never a listed company, and a name match would give Rogers
 * Group's quarries to Rogers Corporation. A controller is the company itself, or the company under an
 * earlier name of its own record (The Pittston Company on Brink's, Broken Hill Proprietary on BHP,
 * Newpark Resources on NPK International), or a predecessor record `lib/predecessors.ts` maps to it
 * (Legacy Vulcan on Vulcan Materials).
 *
 * An ID MSHA kept when its company changed hands counts only between the days the filings give, read
 * from data.sec.gov's filing lists on 2026-11-10 (the batch 120 rule: the 8-K reporting the completed
 * transaction, its item 2.01, and its report date): CONSOL Energy's ID is CNX Resources' to the coal
 * spin-off of 2017-11-28 and the new CONSOL's, now Core Natural Resources', after; Mosaic's was IMC
 * Global's before the combination of 2004-10-22. An acquisition's past is never the buyer's: Massey's,
 * Alpha Natural Resources', Walter Energy's, Arch Resources' (Core Natural Resources since 2025),
 * Texas Industries' (Martin Marietta), Phelps Dodge's (Freeport-McMoRan), Placer Dome's (Barrick),
 * Stillwater Mining's (Sibanye-Stillwater), Florida Rock's (Vulcan) and AK Steel's (Cleveland-Cliffs)
 * accidents are no page's. A joint venture is no one's: Bridger Coal (PacifiCorp and Idaho Power),
 * Nevada Gold Mines (Barrick and Newmont), the iron ranges Cliffs ran with Laiwu Steel and ArcelorMittal.
 *
 * Left off by hand: "Ashland Inc et al", MSHA's controller for Arch Coal's mines years after Ashland
 * gave up its Arch shares; Ashland's own quarries, old Ashland's (an unmapped predecessor record); Alcoa
 * Inc., old Alcoa's, Howmet's record, the owner's open Alcoa question; Hycroft Mining of 2015, before the
 * SPAC that bought it in 2020; U.S. Steel's, no longer listed.
 *
 * Every page also counts only from its company's first price: Peabody's accidents before its shares of
 * 2017 are no page's.
 */
export const MINE_CONTROLLERS: Readonly<Record<number, { ticker: string; controllers: readonly MineController[] }>> = {
  1086600: { ticker: "ARLP", controllers: [{ id: "C15455", name: "Alliance Resource Partners LP", why: "the partnership itself" }] },
  1070412: {
    ticker: "CNX",
    controllers: [
      {
        id: "C00692",
        name: "CONSOL Energy Inc",
        to: "2017-11-27",
        why: "CNX Resources' record was CONSOL Energy's until it spun off its coal business as a new CONSOL Energy: CNX's 8-K 0001193125-17-359483 (items 1.01, 2.01) reports the separation on 2017-11-28, and MSHA kept the ID for the coal company",
      },
    ],
  },
  1710366: {
    ticker: "CNR",
    controllers: [
      {
        id: "C00692",
        name: "CONSOL Energy Inc",
        from: "2017-11-28",
        why: "the coal business CNX spun off on 2017-11-28, this record, the new CONSOL Energy (its 8-K 0001193125-17-359478 of that report date), which kept MSHA's ID",
      },
      {
        id: "0189840",
        name: "Core Natural Resources Inc",
        why: "the record's own name since its merger with Arch Resources (its 8-K 0001193125-25-007135, item 2.01), MSHA's controller of its mines from 2025-01-14; Arch's own accidents before stay off",
      },
    ],
  },
  916076: { ticker: "MLM", controllers: [{ id: "M00174", name: "Martin Marietta Materials Inc", why: "the company itself" }] },
  1064728: { ticker: "BTU", controllers: [{ id: "C15833", name: "Peabody Energy Corporation", why: "the company itself, from its first price of 2017" }] },
  831259: { ticker: "FCX", controllers: [{ id: "0067299", name: "Freeport-McMoRan Inc", why: "the company itself, the ID MSHA gave it after it bought Phelps Dodge in 2007; Phelps Dodge's own accidents stay off" }] },
  849395: { ticker: "CRH", controllers: [{ id: "M06183", name: "CRH PLC", why: "the company itself, its American quarries" }] },
  1164727: { ticker: "NEM", controllers: [{ id: "M00165", name: "Newmont Corporation", why: "the company itself; Newmont Mining's record before 2002 is this record's predecessor (lib/predecessors.ts)" }] },
  1396009: {
    ticker: "VMC",
    controllers: [
      { id: "0071891", name: "Vulcan Materials Company", why: "the company itself, the record of 2007" },
      { id: "M00024", name: "Legacy Vulcan Corp (Form:Vulcan Materials Co)", why: "Vulcan Materials before its reorganisation of 2007, this record's predecessor (lib/predecessors.ts, until 2007-11-16); MSHA moved its mines to the new ID on 2007-11-16" },
    ],
  },
  756894: { ticker: "B", controllers: [{ id: "M06246", name: "Barrick Gold Corp", why: "the company itself; Placer Dome's accidents before 2006 stay off" }] },
  1076378: { ticker: "CX", controllers: [{ id: "M09149", name: "Cemex S A", why: "the company itself, its American quarries and cement plants" }] },
  1704715: { ticker: "AMR", controllers: [{ id: "0127321", name: "Alpha Metallurgical Resources Inc", why: "the company itself; Alpha Natural Resources' accidents before its bankruptcy of 2015 stay off" }] },
  701818: { ticker: "KGC", controllers: [{ id: "M10062", name: "Kinross Gold Corporation", why: "the company itself, its American mines" }] },
  4904: { ticker: "AEP", controllers: [{ id: "C00329", name: "American Electric Power Company Inc", why: "the company itself, its own coal mines" }] },
  67716: {
    ticker: "MDU",
    controllers: [
      {
        id: "M09717",
        name: "MDU Resources Group Inc",
        to: "2023-05-31",
        why: "Knife River's quarries until MDU spun it off: MDU's 8-K 0001140361-23-027660 (item 2.01, report date 2023-05-30), and MSHA's history ends MDU's control of them on 2023-05-31",
      },
    ],
  },
  82020: { ticker: "USLM", controllers: [{ id: "M08976", name: "United States Lime & Minerals Inc", why: "the company itself" }] },
  886986: { ticker: "TECK", controllers: [{ id: "M01474", name: "Teck Resources Limited", why: "the company itself, its American mines (Red Dog, Pend Oreille)" }] },
  1786909: { ticker: "SBSW", controllers: [{ id: "0134661", name: "Sibanye Stillwater Limited", why: "the company itself; Stillwater Mining's accidents before Sibanye bought it in 2017 stay off" }] },
  66740: { ticker: "MMM", controllers: [{ id: "M00221", name: "Minnesota Mining & Manufacturing Company", why: "3M under its former name, its roofing-granule quarries" }] },
  93410: { ticker: "CVX", controllers: [{ id: "C00877", name: "Chevron Corporation", why: "the company itself, Chevron Mining's coal and molybdenum mines" }] },
  1285785: {
    ticker: "MOS",
    controllers: [
      {
        id: "M10050",
        name: "Mosaic Company",
        from: "2004-10-22",
        why: "the ID was IMC Global's until IMC and Cargill's crop-nutrition business combined as Mosaic: Mosaic's 8-K 0001193125-04-180752 (items 1.01, 2.01, report date 2004-10-22); IMC-Agrico's accidents before stay off",
      },
    ],
  },
  1691303: { ticker: "HCC", controllers: [{ id: "0124421", name: "Warrior Met Coal Intermediate Holdco LLC", why: "Warrior Met Coal's own holding company; Walter Energy's accidents before Warrior bought its mines in 2016 stay off" }] },
  861459: { ticker: "GVA", controllers: [{ id: "M00079", name: "Granite Construction Inc", why: "the company itself, its quarries" }] },
  764065: { ticker: "CLF", controllers: [{ id: "M00106", name: "Cleveland-Cliffs Inc", why: "the company itself; ArcelorMittal USA's and AK Steel's accidents before Cliffs bought them in 2020 stay off" }] },
  863064: {
    ticker: "RIO",
    controllers: [
      { id: "M01812", name: "Rio Tinto Group", why: "the company itself, its American mines" },
      { id: "C14955", name: "RTZ-CRA Group", why: "Rio Tinto under its name of 1995–1997, Kennecott Energy's coal mines; MSHA's history ends the ID's control of them on 2009-11-19, when Rio floated them as Cloud Peak Energy" },
    ],
  },
  1227654: { ticker: "CMP", controllers: [{ id: "0041473", name: "Compass Minerals International, Inc.", why: "the company itself" }] },
  1243429: {
    ticker: "MT",
    controllers: [
      {
        id: "M12359",
        name: "ArcelorMittal USA LLC",
        to: "2020-12-08",
        why: "ArcelorMittal's American iron mines until it sold ArcelorMittal USA to Cleveland-Cliffs: Cliffs' 8-K 0000764065-20-000235 of 2020-12-09 (item 2.01), and MSHA's history ends ArcelorMittal's control on 2020-12-08",
      },
    ],
  },
  99780: {
    ticker: "TRN",
    controllers: [
      {
        id: "M09571",
        name: "Trinity Industries Inc",
        to: "2018-10-31",
        why: "Trinity's aggregates quarries until it spun off Arcosa: Trinity's 8-K 0001140361-18-042109 (item 2.01, report date 2018-10-31), and MSHA's history moves them to Arcosa's ID on 2018-11-01",
      },
    ],
  },
  1739445: { ticker: "ACA", controllers: [{ id: "0144281", name: "Arcosa, Inc", why: "the company itself, from the spin-off of 2018-11-01" }] },
  71829: { ticker: "NPKI", controllers: [{ id: "M01658", name: "Newpark Resources Inc", why: "NPK International under its former name, its barite mines" }] },
  215466: { ticker: "CDE", controllers: [{ id: "M04598", name: "Coeur Mining, Inc.", why: "the company itself" }] },
  719413: { ticker: "HL", controllers: [{ id: "M00089", name: "Hecla Mining Company", why: "the company itself; Klondex's and Revett's accidents before Hecla bought them stay off" }] },
  788965: { ticker: "HNRG", controllers: [{ id: "0141083", name: "Hallador Energy Company", why: "the company itself" }] },
  921638: { ticker: "SSRM", controllers: [{ id: "0113083", name: "SSR Mining Incorporated", why: "the company itself" }] },
  78890: { ticker: "BCO", controllers: [{ id: "C00230", name: "Pittston Company", why: "The Brink's Company under its name until 2003, Pittston Coal's mines" }] },
  40533: { ticker: "GD", controllers: [{ id: "C01339", name: "General Dynamics Corp", why: "the company itself, Freeman United Coal's mines" }] },
  918646: { ticker: "EXP", controllers: [{ id: "M00946", name: "Eagle Materials Inc", why: "the company itself; its joint venture with Heidelberg's cement company is no one's" }] },
  811809: { ticker: "BHP", controllers: [{ id: "M11001", name: "Broken Hill Proprietary Company Ltd", why: "BHP under its former name, its American copper and coal mines" }] },
  1368519: { ticker: "NOA", controllers: [{ id: "0156825", name: "North American Construction Group, LTD", why: "the company itself" }] },
  1173420: { ticker: "NG", controllers: [{ id: "M12626", name: "Novagold Resources Inc", why: "the company itself, its Rock Creek mine" }] },
  1286973: { ticker: "USAS", controllers: [{ id: "0151001", name: "Americas Gold and Silver Corporation", why: "the company itself, its Galena mine" }] },
  37785: { ticker: "FMC", controllers: [{ id: "M00472", name: "FMC Corp", why: "the company itself, its trona mines before their sale in 2015" }] },
  1687187: { ticker: "METC", controllers: [{ id: "0137341", name: "Ramaco Resources Inc", why: "the company itself" }] },
  74046: { ticker: "ODC", controllers: [{ id: "M00579", name: "Oil Dri Corporation Of America", why: "the company itself, its clay mines" }] },
  1144800: { ticker: "TAC", controllers: [{ id: "C15930", name: "Trans Alta Corp", why: "the company itself, its Centralia coal mine" }] },
  1725964: { ticker: "NTR", controllers: [{ id: "0143123", name: "Nutrien LTD", why: "the company itself; PotashCorp's and Agrium's accidents before their merger of 2018 stay off" }] },
  789933: { ticker: "NC", controllers: [{ id: "C01333", name: "NACCO Industries Inc", why: "the company itself, North American Coal's mines" }] },
  1514705: { ticker: "SXC", controllers: [{ id: "0104093", name: "SunCoke Energy Incorporated", why: "the company itself" }] },
  1627223: { ticker: "CC", controllers: [{ id: "0139041", name: "The Chemours Company", why: "the company itself, its mineral sands mines" }] },
  891014: { ticker: "MTX", controllers: [{ id: "M00362", name: "Minerals Technologies Inc", why: "the company itself" }] },
  1881487: { ticker: "ACDC", controllers: [{ id: "0171280", name: "Pro Frac Holding Corp", why: "the company itself, its frac-sand mines" }] },
  1130464: { ticker: "BKH", controllers: [{ id: "C03845", name: "Black Hills Corp", why: "the company itself, its Wyodak coal mine" }] },
};

/** The controllers mapped to a company, or null when it has none. */
export function mineControllersFor(cik: number | string): readonly MineController[] | null {
  return MINE_CONTROLLERS[Number(cik)]?.controllers ?? null;
}

/** One accident that killed someone: the fatal records of a mine on one day. */
export interface MineAccident {
  /** "<mine ID>:<day>", the row's key. */
  key: string;
  mine: string;
  day: string;
  /** The first record's time of day, "0100". */
  time: string;
  dead: number;
  /** How many of the dead worked for a contractor at the mine. */
  contractorDead: number;
  controllerId: string;
  /** The controller's and the operator's names as MSHA gives them today. */
  controllerName: string;
  operatorName: string;
  classification: string;
  accidentType: string;
  /** Where at the mine: "UNDERGROUND", "STRIP, QUARY, OPEN PIT"… */
  subunit: string;
  coal: boolean;
  /** The longest narrative of the accident's records, as MSHA wrote it. */
  narrative: string;
  /** MSHA's document numbers, one a person. */
  documents: string[];
  /** From the Mines file: the mine's present name, its county and state, its nearest town. */
  mineName: string;
  county: string;
  state: string;
  town: string;
}

const ACCIDENT_COLUMNS = [
  "MINE_ID", "CONTROLLER_ID", "CONTROLLER_NAME", "OPERATOR_NAME", "CONTRACTOR_ID", "DOCUMENT_NO", "SUBUNIT",
  "ACCIDENT_DT", "ACCIDENT_TIME", "DEGREE_INJURY_CD", "CLASSIFICATION", "ACCIDENT_TYPE", "NARRATIVE", "COAL_METAL_IND",
] as const;
const MINE_COLUMNS = ["MINE_ID", "CURRENT_MINE_NAME", "STATE", "FIPS_CNTY_NM", "NEAREST_TOWN"] as const;

const tidy = (s: string) => s.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
/** "07/27/2015" → "2015-07-27"; anything else → "". */
const isoDay = (s: string) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
  return m ? `${m[3]}-${m[1]}-${m[2]}` : "";
};

/**
 * The accidents that killed someone, from the two files' text: every fatal record, grouped by mine and
 * day, each with its mine's place from the Mines file (`minesText`; places are left blank without it).
 */
export function fatalAccidents(accidentsText: string, minesText = ""): MineAccident[] {
  const byKey = new Map<string, MineAccident>();
  eachCsvRow(accidentsText, ACCIDENT_COLUMNS, ([mine, controllerId, controllerName, operatorName, contractor, document, subunit, date, time, degree, classification, type, narrative, coalMetal]) => {
    if (degree.trim() !== FATAL) return;
    const day = isoDay(date);
    const id = mine.trim();
    if (!day || !/^\d{7}$/.test(id)) return;
    const key = `${id}:${day}`;
    const doc = document.trim();
    const was = byKey.get(key);
    if (was) {
      if (doc && was.documents.includes(doc)) return;
      was.dead++;
      if (contractor.trim()) was.contractorDead++;
      if (doc) was.documents.push(doc);
      const told = tidy(narrative);
      if (told.length > was.narrative.length) was.narrative = told;
      if (time.trim() < was.time) was.time = time.trim();
      return;
    }
    byKey.set(key, {
      key,
      mine: id,
      day,
      time: time.trim(),
      dead: 1,
      contractorDead: contractor.trim() ? 1 : 0,
      controllerId: controllerId.trim(),
      controllerName: tidy(controllerName),
      operatorName: tidy(operatorName),
      classification: tidy(classification),
      accidentType: tidy(type),
      subunit: tidy(subunit),
      coal: coalMetal.trim() === "C",
      narrative: tidy(narrative),
      documents: doc ? [doc] : [],
      mineName: "",
      county: "",
      state: "",
      town: "",
    });
  }, "|");
  if (minesText) {
    const wanted = new Set([...byKey.values()].map((a) => a.mine));
    const places = new Map<string, { mineName: string; county: string; state: string; town: string }>();
    eachCsvRow(minesText, MINE_COLUMNS, ([mine, name, state, county, town]) => {
      if (wanted.has(mine.trim())) places.set(mine.trim(), { mineName: tidy(name), county: tidy(county), state: tidy(state), town: tidy(town) });
    }, "|");
    for (const a of byKey.values()) Object.assign(a, places.get(a.mine) ?? {});
  }
  return [...byKey.values()].sort((a, b) => a.day.localeCompare(b.day) || a.mine.localeCompare(b.mine));
}

/** MSHA's activity codes for an investigation of an accident: E06 since 2005 (a fatal one), AFA and the older 30 before. */
export const INVESTIGATION_CODES: readonly string[] = ["E06", "AFA", "30"];
/** An investigation is an accident's when MSHA began it at the mine on the accident's day or at most this many days after. */
export const INVESTIGATION_DAYS = 14;

/** One investigation of an accident, from the Inspections file. */
export interface MineInvestigation {
  /** MSHA's event number, by which the Assessed Violations file names it. */
  event: string;
  mine: string;
  /** The day MSHA began it. */
  begin: string;
  code: string;
}

/** One violation MSHA assessed, from the Assessed Violations file. */
export interface MineViolation {
  /** The event it was cited under. */
  event: string;
  number: string;
  /** "Operator" or "Contractor", as MSHA writes it. */
  violatorType: string;
  /** The violator's name as it was at the assessment. */
  violator: string;
  /** The citation's or order's section: "104(a)", "104(d)(1)"… */
  action: string;
  /** "Regular", "Special" or "Single". */
  assessment: string;
  /** Penalties in dollars and cents, as digits ("70000.00"): never a float. */
  proposed: string;
  current: string;
}

const INSPECTION_COLUMNS = ["EVENT_NO", "MINE_ID", "INSPECTION_BEGIN_DT", "ACTIVITY_CODE"] as const;
const VIOLATION_COLUMNS = ["EVENT_NBR", "VIOLATION_NO", "VIOLATOR_TYPE_CD", "VIOLATOR_NAME", "PRIMARY_ACTION_CD", "ASSESS_TYPE_CD", "PROPOSED_PENALTY_AMT", "CURRENT_ASSESSMENT_AMT"] as const;

/** A figure as MSHA writes it, "70000.00" or "167600", as dollars and two digits of cents; "0.00" for none. */
export const moneyOf = (s: string): string => {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s.replace(/,/g, "").trim());
  return m ? `${BigInt(m[1])}.${(m[2] ?? "").padEnd(2, "0")}` : "0.00";
};
const centsOf = (s: string) => BigInt(moneyOf(s).replace(".", ""));
const HUNDRED = BigInt(100);
/** Whole cents as dollars: "$447,600", "$8,453,138.30". */
export const dollarsOf = (cents: bigint): string => {
  const whole = (cents / HUNDRED).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const part = cents % HUNDRED;
  return `$${whole}${part ? `.${part.toString().padStart(2, "0")}` : ""}`;
};

/** The Inspections file's investigations of accidents (`INVESTIGATION_CODES`), at the given mines when they are given. */
export function investigationsOf(text: string, mines?: ReadonlySet<string>): MineInvestigation[] {
  const out: MineInvestigation[] = [];
  eachCsvRow(text, INSPECTION_COLUMNS, ([event, mine, begin, code]) => {
    const id = mine.trim();
    const day = isoDay(begin);
    if (!INVESTIGATION_CODES.includes(code.trim()) || !day || (mines && !mines.has(id))) return;
    out.push({ event: event.trim(), mine: id, begin: day, code: code.trim() });
  }, "|");
  return out;
}

/** The Assessed Violations file's violations, under the given events when they are given. */
export function violationsOf(text: string, events?: ReadonlySet<string>): MineViolation[] {
  const out: MineViolation[] = [];
  eachCsvRow(text, VIOLATION_COLUMNS, ([event, number, type, name, action, assessment, proposed, current]) => {
    if (events && !events.has(event.trim())) return;
    out.push({
      event: event.trim(),
      number: number.trim(),
      violatorType: tidy(type),
      violator: tidy(name),
      action: tidy(action),
      assessment: tidy(assessment),
      proposed: moneyOf(proposed),
      current: moneyOf(current),
    });
  }, "|");
  return out;
}

const daysFrom = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/**
 * Each investigation's accident, by event number: the latest fatal accident at the investigation's mine
 * on or before the day MSHA began it, at most `INVESTIGATION_DAYS` before. An investigation is one
 * accident's at most; an accident may have several (Kinross's two dead at Bald Mountain on 2026-09-03,
 * one investigation each).
 */
export function linkInvestigations(accidents: readonly { key: string; mine: string; day: string }[], investigations: readonly MineInvestigation[]): Map<string, string> {
  const byMine = new Map<string, { key: string; day: string }[]>();
  for (const a of accidents) byMine.set(a.mine, [...(byMine.get(a.mine) ?? []), a]);
  const out = new Map<string, string>();
  for (const i of investigations) {
    const at = (byMine.get(i.mine) ?? []).filter((a) => a.day <= i.begin && daysFrom(a.day, i.begin) <= INVESTIGATION_DAYS);
    const latest = at.reduce<{ key: string; day: string } | null>((x, a) => (!x || a.day > x.day ? a : x), null);
    if (latest) out.set(i.event, latest.key);
  }
  return out;
}

/** Each accident's assessed violations, by its key: the violations of the investigations linked to it, by number. */
export function findingsOf(links: ReadonlyMap<string, string>, violations: readonly MineViolation[]): Map<string, MineViolation[]> {
  const out = new Map<string, MineViolation[]>();
  for (const v of violations) {
    const key = links.get(v.event);
    if (key) out.set(key, [...(out.get(key) ?? []), v]);
  }
  for (const vs of out.values()) vs.sort((a, b) => a.event.localeCompare(b.event) || a.number.localeCompare(b.number));
  return out;
}

const listOf = (names: readonly string[]) => (names.length <= 1 ? names[0] ?? "" : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/**
 * The sentence a row gives MSHA's finding in, or "" when nothing was assessed: "MSHA's investigation
 * cited 5 violations against the operator, 5 of them under section 104(d) (an unwarrantable failure) and
 * 5 specially assessed, and proposed $447,600 in penalties, the amount assessed now."
 */
export function findingSentence(violations: readonly MineViolation[]): string {
  const n = violations.length;
  if (!n) return "";
  const operator = violations.filter((v) => v.violatorType.toLowerCase() === "operator").length;
  const others = violations.filter((v) => v.violatorType.toLowerCase() !== "operator");
  const contractors = [...new Set(others.filter((v) => v.violatorType.toLowerCase() === "contractor").map((v) => v.violator).filter(Boolean))];
  const named = contractors.length > 2 ? [...contractors.slice(0, 2), `${contractors.length - 2} more`] : contractors;
  const otherKinds = [...new Set(others.filter((v) => v.violatorType.toLowerCase() !== "contractor").map((v) => v.violatorType.toLowerCase() || "another party"))];
  const against = [
    contractors.length ? `the contractor${contractors.length > 1 ? "s" : ""}${named.length ? ` ${listOf(named)}` : ""}` : "",
    ...otherKinds.map((k) => `a${/^[aeiou]/.test(k) ? "n" : ""} ${k}`),
  ].filter(Boolean).join(" and ");
  const whom = !others.length ? " against the operator" : !operator ? ` against ${against}` : `, ${operator} against the operator and ${others.length} against ${against}`;
  const unwarrantable = violations.filter((v) => /^104\(d\)/.test(v.action)).length;
  const special = violations.filter((v) => v.assessment.toLowerCase() === "special").length;
  const quals = [
    unwarrantable ? `${n === 1 ? "" : `${unwarrantable} of them `}under section 104(d) (an unwarrantable failure)` : "",
    special ? `${n === 1 ? "" : `${special} `}specially assessed` : "",
  ].filter(Boolean);
  const proposed = violations.reduce((t, v) => t + centsOf(v.proposed), BigInt(0));
  const current = violations.reduce((t, v) => t + centsOf(v.current), BigInt(0));
  return `MSHA's investigation cited ${n === 1 ? "1 violation" : `${n} violations`}${whom}${quals.length ? `, ${quals.join(" and ")}` : ""}, and proposed ${dollarsOf(proposed)} in penalties${
    current === proposed ? ", the amount assessed now" : `; ${dollarsOf(current)} as assessed now`
  }.`;
}

const STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "the District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine",
  MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", PR: "Puerto Rico", GU: "Guam", VI: "the U.S. Virgin Islands",
};

/** "Marshall", "WV" → "Marshall County, West Virginia"; a parish in Louisiana; Alaska's boroughs and Puerto Rico's municipalities as named. */
export function placeOf(county: string, state: string): string {
  const where = STATES[state] ?? state;
  const c = county.replace(/\s+/g, " ").trim();
  if (!c) return where;
  const name = c.replace(/\b([a-z])/g, (x) => x.toUpperCase());
  const unit = /\b(?:County|Parish|Borough|City|Census Area|Municipality)$/i.test(name) || state === "AK" || state === "PR" ? "" : state === "LA" ? " Parish" : " County";
  return [`${name}${unit}`, where].filter(Boolean).join(", ");
}

/** MSHA's classification, readable on a page; "" for none or "other". */
const CLASSIFICATION: Record<string, string> = {
  "POWERED HAULAGE": "powered haulage",
  "MACHINERY": "machinery",
  "SLIP OR FALL OF PERSON": "slip or fall",
  "FALL OF ROOF OR BACK": "roof fall",
  "FALLING/SLIDING/ROLLING MATERIALS": "falling, sliding or rolling material",
  "FALL OF FACE/RIB/PILLAR/SIDE/HIGHWALL": "fall of face, rib, pillar, side or highwall",
  "ELECTRICAL": "electrical",
  "IGNITION OR EXPLOSION OF GAS OR DUST": "gas or dust explosion",
  "HANDLING OF MATERIALS": "handling of materials",
  "EXPLODING VESSELS UNDER PRESSURE": "exploding vessel under pressure",
  "HOISTING": "hoisting",
  "EXPLOSIVES AND BREAKING AGENTS": "explosives",
  "FIRE": "fire",
  "HANDTOOLS (NONPOWERED)": "hand tools",
  "INUNDATION": "inundation",
  "NONPOWERED HAULAGE": "non-powered haulage",
  "STEPPING OR KNEELING ON OBJECT": "stepping or kneeling on an object",
  "STRIKING OR BUMPING": "striking or bumping",
  "IMPOUNDMENT": "impoundment",
  "ENTRAPMENT": "entrapment",
};
const classificationOf = (s: string) => CLASSIFICATION[s.toUpperCase()] ?? (/^(?:other|no value found|\?|)$/i.test(s.trim()) ? "" : s.toLowerCase());

/** Where at the mine, readable. */
const SUBUNIT: Record<string, string> = {
  "UNDERGROUND": "underground",
  "SURFACE AT UNDERGROUND": "on the surface of an underground mine",
  "STRIP, QUARY, OPEN PIT": "in a strip mine, quarry or open pit",
  "MILL OPERATION/PREPARATION PLANT": "at a mill or preparation plant",
  "DREDGE": "at a dredge",
  "AUGER": "at an auger mine",
  "CULM BANK/REFUSE PILE": "at a culm bank or refuse pile",
  "INDEPENDENT SHOPS OR YARDS": "at an independent shop or yard",
  "OFFICE WORKERS AT MINE SITE": "in the mine's offices",
};

/** "0100" → "1:00 a.m.", "1545" → "3:45 p.m."; "" for anything else. */
const clock = (t: string) => {
  const m = /^(\d{2})(\d{2})$/.exec(t);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return "";
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "a.m." : "p.m."}`;
};

const heldOn = (c: MineController, day: string) => (!c.from || day >= c.from) && (!c.to || day <= c.to);
const LIMIT = 600;
/** A text cut to `room` characters at a word and marked "…", or whole when it fits. */
const cutWords = (text: string, room: number) => (text.length > room ? `${text.slice(0, room - 1).replace(/\s+\S*$/, "")}…` : text);

/**
 * Accidents → timeline events. Every accident is checked against the controller map again: it reaches
 * a company's page only under a mapped controller ID, between its days, from `from`, the company's
 * first price.
 */
export function mineAccidentEvents(
  accidents: readonly MineAccident[],
  controllers: readonly MineController[],
  { from = "", findings }: { from?: string; findings?: ReadonlyMap<string, readonly MineViolation[]> } = {},
): TimelineEvent[] {
  const byId = new Map(controllers.map((c) => [c.id, c]));
  const out: TimelineEvent[] = [];
  for (const a of accidents) {
    const c = byId.get(a.controllerId);
    if (!c || !heldOn(c, a.day) || a.day < from) continue;
    const place = placeOf(a.county, a.state);
    const how = classificationOf(a.classification);
    const title = `${a.coal ? "Coal mine" : "Mine"} accident${place ? ` in ${place}` : ""} — ${a.dead} killed${how ? ` (${how})` : ""}`;
    const contractor =
      a.contractorDead === 0 ? "" :
      a.dead === 1 ? "The person killed worked for a contractor at the mine." :
      a.contractorDead === a.dead ? `${a.dead === 2 ? "Both" : `All ${a.dead}`} worked for contractors at the mine.` :
      `${a.contractorDead} of the ${a.dead} worked for contractors at the mine.`;
    const when = [clock(a.time), SUBUNIT[a.subunit.toUpperCase()] ?? ""].filter(Boolean).join(", ");
    const type = a.accidentType && !/^(?:NEC|unclassified.*)$/i.test(a.accidentType) ? a.accidentType.replace(/\.$/, "").replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase()) : "";
    const head = [`Form 7000-1 report to the Mine Safety and Health Administration${[when, type].filter(Boolean).length ? `: ${[when, type].filter(Boolean).join("; ")}` : ""}.`, contractor].filter(Boolean).join(" ");
    const names = [a.mineName ? `${a.mineName}${a.town ? ` near ${a.town.replace(/,\s*[A-Z]{2}$/, "")}` : ""}` : "", a.operatorName ? `operated by ${a.operatorName}` : ""].filter(Boolean).join(", ");
    const tail = "The report is the operator's own filing, not a finding of fault.";
    // MSHA's own finding comes after the report (batch 139); the account gives way to it, then the mine's names
    const finding = findingSentence(findings?.get(a.key) ?? []);
    const named = `Mine ${a.mine}${names ? `; MSHA's present names: ${names.replace(/\.+$/, "")}` : ""}.`;
    const fixed = (m: string) => [head, m, tail, finding].filter(Boolean).join(" ").length;
    const mine = fixed(named) <= LIMIT ? named : `Mine ${a.mine}.`;
    const kept = finding && fixed(mine) > LIMIT ? cutWords(finding, LIMIT - fixed(mine) + finding.length) : finding;
    const room = LIMIT - [head, mine, tail, kept].filter(Boolean).join(" ").length - 20;
    const story = a.narrative && room > 40 ? `MSHA's account: "${cutWords(a.narrative, room)}"` : "";
    out.push({
      id: `msha-${a.mine}-${a.day}`,
      date: a.day,
      type: "regulation",
      title,
      description: [head, story, mine, tail, kept].filter(Boolean).join(" ").slice(0, LIMIT),
      source: "MSHA",
      url: DATA_PAGE,
      sourceKey: "msha_accidents",
      externalId: a.key,
      // the accident is the event: one row however many runs read it
      dedupBasis: `msha:${a.key}`,
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export interface MineFilesAnswer {
  accidents: MineAccident[];
  /** The Accidents file's Last-Modified as MSHA sent it. */
  modified: string | null;
  outcome: "ok" | "unchanged" | "throttled" | "error";
  httpStatus?: number;
  detail?: string;
}

/** The marker every fatal record of the Accidents file holds: its degree code and text, quoted, between separators. */
const FATAL_MARKER = Buffer.from('|"01"|"FATALITY"|', "latin1");

/**
 * The Accidents file cut to its header and the records that hold the fatal marker, before any of it is
 * decoded: the whole file is 229 MB of text and only 1,221 of its 275,799 records are deaths, and
 * decoded whole it took 943 MB to read. A record is a line, CRLF-ended, of quoted fields; a record the
 * cut would split (an odd count of quotes: a line break inside a field) or a file without the marker
 * gives null, and the whole file is read instead. `fatalAccidents` reads every kept record again by
 * its columns, so a record the marker matched by chance is still no death.
 */
export function fatalRecordsOf(file: Uint8Array): Buffer | null {
  const b = Buffer.from(file.buffer, file.byteOffset, file.byteLength);
  const headEnd = b.indexOf(0x0a) + 1;
  if (headEnd <= 0) return null;
  const parts: Buffer[] = [b.subarray(0, headEnd)];
  for (let at = headEnd; ; ) {
    const hit = b.indexOf(FATAL_MARKER, at);
    if (hit < 0) break;
    const start = b.lastIndexOf(0x0a, hit) + 1;
    const next = b.indexOf(0x0a, hit);
    const end = next < 0 ? b.length : next + 1;
    const record = b.subarray(start, end);
    let quotes = 0;
    for (let i = 0; i < record.length; i++) if (record[i] === 0x22) quotes++;
    if (quotes % 2) return null;
    parts.push(record);
    at = end;
  }
  return parts.length > 1 ? Buffer.concat(parts) : null;
}

async function getZip(url: string, entry: string, since: string | null): Promise<{ file?: Buffer; modified: string | null; status: number; unchanged?: boolean }> {
  const res = await fetch(url, { headers: { ...UA, ...(since ? { "If-Modified-Since": since } : {}) }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status === 304) return { modified: since, status: 304, unchanged: true };
  if (!res.ok) return { modified: null, status: res.status };
  const file = readZip(new Uint8Array(await res.arrayBuffer()), [entry]).get(entry);
  if (!file) throw new Error(`${entry} is not in ${url}`);
  return { file, modified: res.headers.get("last-modified"), status: res.status };
}

/**
 * Both files, read whole: the Accidents file (52 MB zipped, 229 MB of text on 2026-11-09), asked with
 * the Last-Modified of the copy kept and cut to its fatal records (`fatalRecordsOf`), and the Mines
 * file (7 MB) for the places. A file that is not a readable zip, or lacks a column, is refused whole.
 */
export async function fetchMineFiles(since: string | null): Promise<MineFilesAnswer> {
  try {
    const acc = await getZip(ACCIDENTS_URL, ACCIDENTS_ENTRY, since);
    if (acc.unchanged) return { accidents: [], modified: since, outcome: "unchanged", httpStatus: 304 };
    if (!acc.file) return { accidents: [], modified: null, outcome: acc.status === 429 || acc.status === 503 ? "throttled" : "error", httpStatus: acc.status };
    const accidentsText = decodeText(fatalRecordsOf(acc.file) ?? acc.file);
    const mines = await getZip(MINES_URL, MINES_ENTRY, null);
    if (!mines.file) return { accidents: [], modified: null, outcome: mines.status === 429 || mines.status === 503 ? "throttled" : "error", httpStatus: mines.status, detail: "the Mines file" };
    const accidents = fatalAccidents(accidentsText, decodeText(mines.file));
    if (!accidents.length) return { accidents, modified: null, outcome: "error", httpStatus: acc.status, detail: "the Accidents file held no fatal accident" };
    return { accidents, modified: acc.modified, outcome: "ok", httpStatus: acc.status };
  } catch (err) {
    return { accidents: [], modified: null, outcome: "error", detail: String(err).slice(0, 200) };
  }
}

const INSPECTIONS_ENTRY = "Inspections.txt";
const VIOLATIONS_ENTRY = "AssessedViolations.txt";

export interface MineFindingsAnswer {
  /** The investigations linked to a kept accident, each with that accident's key. */
  investigations: (MineInvestigation & { accident: string })[];
  violations: MineViolation[];
  /** The Assessed Violations file's Last-Modified as MSHA sent it. */
  modified: string | null;
  outcome: "ok" | "throttled" | "error";
  httpStatus?: number;
  detail?: string;
}

/** The first `count` fields of a record, from its start alone, quotes taken off: the event number, then the mine. */
const leadFields = (line: Buffer, count: number) =>
  line.toString("latin1", 0, Math.min(line.length, 96)).split("|").slice(0, count).map((f) => f.replace(/^"|"$/g, "").trim());
/** An investigation's activity code as the Inspections file writes it, between separators and quotes. */
const INVESTIGATION_MARKERS = INVESTIGATION_CODES.map((c) => Buffer.from(`|"${c}"|`, "latin1"));
const CRLF = Buffer.from("\r\n");

/** A zip entry's header and the lines `keep` takes, as text: the rest is never decoded or held (`eachZipLine`). */
export async function keptLines(zip: Uint8Array, entry: string, keep: (line: Buffer) => boolean): Promise<string> {
  const parts: Buffer[] = [];
  let header = true;
  await eachZipLine(zip, entry, (line) => {
    if (header || keep(line)) parts.push(Buffer.from(line), CRLF);
    header = false;
  });
  return decodeText(Buffer.concat(parts));
}

async function zipBytes(url: string): Promise<{ zip?: Buffer; modified: string | null; status: number }> {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) return { modified: null, status: res.status };
  return { zip: Buffer.from(await res.arrayBuffer()), modified: res.headers.get("last-modified"), status: res.status };
}

/**
 * MSHA's finding on the given accidents (batch 139): the Inspections file (74 MB zipped, 349 MB of text
 * on 2026-11-10), streamed and cut to the investigations at their mines, then the Assessed Violations
 * file (110 MB zipped, 1.34 GB of text), streamed and cut to the violations under the investigations
 * linked to an accident. Neither is decoded whole. A file that is not a readable zip, lacks a column, or
 * holds no investigation at these mines is refused whole.
 */
export async function fetchMineFindings(accidents: readonly { key: string; mine: string; day: string }[]): Promise<MineFindingsAnswer> {
  const refused = (status: number, which: string): MineFindingsAnswer =>
    ({ investigations: [], violations: [], modified: null, outcome: status === 429 || status === 503 ? "throttled" : "error", httpStatus: status, detail: which });
  try {
    const mines = new Set(accidents.map((a) => a.mine));
    const inspections = await zipBytes(INSPECTIONS_URL);
    if (!inspections.zip) return refused(inspections.status, "the Inspections file");
    const found = investigationsOf(
      await keptLines(inspections.zip, INSPECTIONS_ENTRY, (line) => INVESTIGATION_MARKERS.some((m) => line.includes(m)) && mines.has(leadFields(line, 2)[1] ?? "")),
      mines,
    );
    if (!found.length) return { investigations: [], violations: [], modified: null, outcome: "error", httpStatus: inspections.status, detail: "the Inspections file held no accident investigation at these mines" };
    const links = linkInvestigations(accidents, found);
    const events = new Set(links.keys());
    const assessed = await zipBytes(VIOLATIONS_URL);
    if (!assessed.zip) return refused(assessed.status, "the Assessed Violations file");
    const violations = violationsOf(await keptLines(assessed.zip, VIOLATIONS_ENTRY, (line) => events.has(leadFields(line, 1)[0] ?? "")), events);
    return {
      investigations: found.filter((i) => links.has(i.event)).map((i) => ({ ...i, accident: links.get(i.event) as string })),
      violations,
      modified: assessed.modified,
      outcome: "ok",
      httpStatus: assessed.status,
    };
  } catch (err) {
    return { investigations: [], violations: [], modified: null, outcome: "error", detail: String(err).slice(0, 200) };
  }
}
