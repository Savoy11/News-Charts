import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { deflateRawSync, gunzipSync } from "node:zlib";
import type { PoolClient } from "pg";
import { deterministicScore } from "../lib/enrich/relevance";
import { FINDINGS_EVERY_DAYS, mineAccidentsFor, storedMineFindings, walkMineAccidents, type MineWalk } from "../lib/ingest/mineWalk";
import { QUOTAS } from "../lib/ingest/quota";
import { SOURCE_TTL_MINUTES } from "../lib/ingest/refresh";
import { SOURCES } from "../lib/ingest/store";
import {
  ACCIDENTS_URL, DATA_PAGE, INSPECTIONS_URL, INVESTIGATION_DAYS, MINES_URL, MINE_CONTROLLERS, VIOLATIONS_URL, dollarsOf, fatalAccidents, fatalRecordsOf, fetchMineFiles, fetchMineFindings,
  findingSentence, findingsOf, investigationsOf, keptLines, linkInvestigations, mineAccidentEvents, mineControllersFor, moneyOf, placeOf, violationsOf,
  type MineAccident, type MineFilesAnswer, type MineFindingsAnswer, type MineInvestigation, type MineViolation,
} from "../lib/mineAccidents";
import type { TimelineEvent } from "../lib/types";
import { eachCsvRow, eachZipLine } from "../lib/zip";
import { COMPANY_SOURCES } from "./ingest";
import tickerIndex from "../data/edgar-tickers.json";

/**
 * Deaths at mines on the pages of the companies that controlled them (batch 134, the 2026-11-09b
 * proposal 2, approved by the owner on 2026-11-10 once the Labor Department's terms were read).
 *
 *   npm run check:mine-accidents
 *
 * Replays MSHA's two files as arlweb.msha.gov served them on 2026-11-09 (scripts/fixtures/
 * msha-accidents.json.gz: the Accidents file's header, its first 40 records that are not deaths and
 * all 1,221 that are, byte for byte; the Mines file's header and the 910 mines they name). Offline:
 * MSHA and the database are stood in for. On main none of it runs: lib/mineAccidents.ts does not exist.
 *
 * Batch 139 (the 2026-11-11 proposal 1): MSHA's own finding on each death, replayed from its Inspections
 * and Assessed Violations files of 2026-11-10 (scripts/fixtures/msha-findings.json.gz: each file's
 * header, the accident investigations at the fatal accidents' mines, the violations assessed under those
 * linked to one, and a few lines that must be left out, byte for byte). On main those checks fail: the
 * files are not read.
 */

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}
const root = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const FIXTURE: { read: string; lastModified: string; provenance: string; accidents: string; mines: string } = JSON.parse(gunzipSync(readFileSync(join(root, "scripts/fixtures/msha-accidents.json.gz"))).toString("utf8"));
// the files' bytes as MSHA served them: Windows-1252, which the fixture keeps one character a byte
const accidentBytes = Buffer.from(FIXTURE.accidents, "latin1");
const mineBytes = Buffer.from(FIXTURE.mines, "latin1");
const all = fatalAccidents(FIXTURE.accidents, FIXTURE.mines);
// batch 139: MSHA's findings files of 2026-11-10, the slice kept byte for byte
const FINDINGS: { read: string; lastModified: { inspections: string; violations: string }; provenance: string; inspections: string; violations: string } = existsSync(join(root, "scripts/fixtures/msha-findings.json.gz"))
  ? JSON.parse(gunzipSync(readFileSync(join(root, "scripts/fixtures/msha-findings.json.gz"))).toString("utf8"))
  : { read: "", lastModified: { inspections: "", violations: "" }, provenance: "", inspections: "", violations: "" };
const byKey = new Map(all.map((a) => [a.key, a]));
/** Each company's first trading day as Yahoo's chart gives it (`firstTradeDate`, read 2026-11-10), which its stored prices begin with. */
const FIRST: Record<string, string> = {
  ACA: "2026-07-17", ACDC: "2022-05-13", AEP: "1962-01-02", AMR: "2021-02-08", ARLP: "1999-08-17", B: "1985-02-13", BCO: "1996-01-03", BHP: "1980-03-17", BKH: "1973-02-22",
  BTU: "2017-04-03", CC: "2015-06-19", CDE: "1980-03-17", CLF: "1973-02-21", CMP: "2003-12-12", CNR: "2017-11-14", CNX: "1999-04-30", CRH: "1989-07-13", CVX: "1962-01-02",
  CX: "1999-09-15", EXP: "1994-04-12", FCX: "1995-07-10", FMC: "1980-03-17", GD: "1962-01-02", GVA: "1990-04-20", HCC: "2017-04-13", HL: "1980-03-17", HNRG: "1994-04-06",
  KGC: "1981-03-17", MDU: "1973-02-21", METC: "2017-02-03", MLM: "1994-02-17", MMM: "1962-01-02", MOS: "1988-01-26", MT: "1997-08-07", MTX: "1992-10-23", NC: "1977-06-17",
  NEM: "1980-03-17", NG: "2003-12-04", NOA: "2006-11-22", NPKI: "1990-09-06", NTR: "2018-01-02", ODC: "1980-03-19", RIO: "1990-06-28", SBSW: "2013-02-11", SSRM: "1996-08-01",
  SXC: "2011-07-21", TAC: "2001-07-31", TECK: "2002-07-18", TRN: "1973-05-03", USAS: "2003-10-27", USLM: "1980-03-17", VMC: "1973-02-21",
};
const ciks = Object.fromEntries(Object.entries(MINE_CONTROLLERS).map(([cik, o]) => [o.ticker, Number(cik)]));
const pages = new Map<string, TimelineEvent[]>(Object.values(MINE_CONTROLLERS).map((o) => [o.ticker, mineAccidentEvents(all, o.controllers, { from: FIRST[o.ticker] })]));
const pagesOf = (key: string) => [...pages].filter(([, ev]) => ev.some((e) => e.externalId === key)).map(([t]) => t).join(" ") || "none";
const eventOf = (key: string) => [...pages.values()].flat().find((e) => e.externalId === key);

function makeZip(name: string, data: Buffer): Buffer {
  const packed = deflateRawSync(data);
  const n = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(packed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(n.length, 26);
  const dir = Buffer.alloc(46);
  dir.writeUInt32LE(0x02014b50, 0);
  dir.writeUInt16LE(8, 10);
  dir.writeUInt32LE(packed.length, 20);
  dir.writeUInt32LE(data.length, 24);
  dir.writeUInt16LE(n.length, 28);
  dir.writeUInt32LE(0, 42);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(46 + n.length, 12);
  end.writeUInt32LE(30 + n.length + packed.length, 16);
  return Buffer.concat([local, n, packed, dir, n, end]);
}

interface FakeDb {
  reads: { modified: string | null; accidents: number; ageDays: number } | null;
  accidents: Map<string, MineAccident>;
  listed: string | null;
  /** batch 139: the findings' read (days since; null for never) and the kept tables */
  findingsAge?: number | null;
  investigations?: Map<string, { accident: string; mine: string; begin: string; code: string }>;
  violations?: Map<string, MineViolation>;
}
function fakeDb(db: FakeDb): PoolClient {
  return {
    query: async (sql: string, params: unknown[] = []) => {
      const s = sql.trim().replace(/\s+/g, " ");
      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(s)) return { rows: [] };
      if (s === "SELECT modified, read_at < now() - make_interval(days => 7) AS stale FROM mine_reads WHERE id = 1") {
        return { rows: db.reads ? [{ modified: db.reads.modified, stale: db.reads.ageDays > 7 }] : [] };
      }
      if (s === "UPDATE mine_reads SET read_at = now() WHERE id = 1") {
        if (db.reads) db.reads.ageDays = 0;
        return { rows: [] };
      }
      if (s === "SELECT count(*)::int AS n FROM mine_reads") return { rows: [{ n: db.reads ? 1 : 0 }] };
      if (s === "DELETE FROM mine_accidents") {
        db.accidents.clear();
        return { rows: [] };
      }
      if (s.startsWith("INSERT INTO mine_accidents (accident_key, mine_id, day, time_of_day, dead, contractor_dead, controller_id, controller_name, operator_name, classification, accident_type, subunit, coal, narrative, documents, mine_name, county, state, town)")) {
        const p = params as unknown[][];
        p[0].forEach((key, i) => {
          const at = (k: number) => p[k][i];
          db.accidents.set(String(key), {
            key: String(key), mine: String(at(1)), day: String(at(2)), time: String(at(3)), dead: Number(at(4)), contractorDead: Number(at(5)), controllerId: String(at(6)),
            controllerName: String(at(7)), operatorName: String(at(8)), classification: String(at(9)), accidentType: String(at(10)), subunit: String(at(11)), coal: Boolean(at(12)),
            narrative: String(at(13)), documents: String(at(14)) ? String(at(14)).split("|") : [], mineName: String(at(15)), county: String(at(16)), state: String(at(17)), town: String(at(18)),
          });
        });
        return { rows: [] };
      }
      if (s.startsWith("INSERT INTO mine_reads (id, modified, accidents)")) {
        const [modified, count] = params as [string | null, number];
        db.reads = { modified, accidents: count, ageDays: 0 };
        return { rows: [] };
      }
      if (s.startsWith("SELECT accident_key, mine_id, day::text AS day, time_of_day, dead, contractor_dead, controller_id, controller_name, operator_name, classification, accident_type, subunit, coal, narrative, documents, mine_name, county, state, town FROM mine_accidents WHERE day >= $1::date AND controller_id = ANY ($2::text[]) ORDER BY day, mine_id")) {
        const [from, ids] = params as [string, string[]];
        const rows = [...db.accidents.values()]
          .filter((a) => a.day >= from && ids.includes(a.controllerId))
          .sort((a, b) => a.day.localeCompare(b.day) || a.mine.localeCompare(b.mine))
          .map((a) => ({
            accident_key: a.key, mine_id: a.mine, day: a.day, time_of_day: a.time, dead: a.dead, contractor_dead: a.contractorDead, controller_id: a.controllerId, controller_name: a.controllerName,
            operator_name: a.operatorName, classification: a.classification, accident_type: a.accidentType, subunit: a.subunit, coal: a.coal, narrative: a.narrative, documents: a.documents,
            mine_name: a.mineName, county: a.county, state: a.state, town: a.town,
          }));
        return { rows };
      }
      if (s === "SELECT min(on_date)::text AS listed FROM prices WHERE subject_id = $1") return { rows: [{ listed: db.listed }] };
      // batch 139: MSHA's findings
      if (s === "SELECT findings_read_at IS NULL OR findings_read_at < now() - make_interval(days => 30) AS stale FROM mine_reads WHERE id = 1") {
        return { rows: db.reads ? [{ stale: db.findingsAge == null || db.findingsAge > 30 }] : [] };
      }
      if (s === "SELECT accident_key, mine_id, day::text AS day FROM mine_accidents") return { rows: [...db.accidents.values()].map((a) => ({ accident_key: a.key, mine_id: a.mine, day: a.day })) };
      if (s === "DELETE FROM mine_violations") {
        db.violations = new Map();
        return { rows: [] };
      }
      if (s === "DELETE FROM mine_investigations") {
        db.investigations = new Map();
        return { rows: [] };
      }
      if (s.startsWith("INSERT INTO mine_investigations (event_no, accident_key, mine_id, begin_day, activity_code)")) {
        const p = params as string[][];
        db.investigations ??= new Map();
        p[0].forEach((event, i) => db.investigations!.set(event, { accident: p[1][i], mine: p[2][i], begin: p[3][i], code: p[4][i] }));
        return { rows: [] };
      }
      if (s.startsWith("INSERT INTO mine_violations (event_no, violation_no, violator_type, violator_name, action, assessment, proposed_amount, current_amount)")) {
        const p = params as string[][];
        db.violations ??= new Map();
        p[0].forEach((event, i) => {
          if (db.violations!.has(`${event}|${p[1][i]}`)) throw new Error("duplicate key value violates unique constraint");
          db.violations!.set(`${event}|${p[1][i]}`, { event, number: p[1][i], violatorType: p[2][i], violator: p[3][i], action: p[4][i], assessment: p[5][i], proposed: p[6][i], current: p[7][i] });
        });
        return { rows: [] };
      }
      if (s === "UPDATE mine_reads SET findings_modified = $1, findings_read_at = now() WHERE id = 1") {
        db.findingsAge = 0;
        return { rows: [] };
      }
      if (s.startsWith("SELECT i.accident_key, v.event_no, v.violation_no, v.violator_type, v.violator_name, v.action, v.assessment, v.proposed_amount::text AS proposed, v.current_amount::text AS current FROM mine_investigations i JOIN mine_violations v ON v.event_no = i.event_no WHERE i.accident_key = ANY ($1::text[])")) {
        const [keys] = params as [string[]];
        const rows = [...(db.violations ?? new Map<string, MineViolation>()).values()]
          .map((v) => ({ v, i: db.investigations?.get(v.event) }))
          .filter(({ i }) => i && keys.includes(i.accident))
          .sort((a, b) => a.i!.accident.localeCompare(b.i!.accident) || a.v.event.localeCompare(b.v.event) || a.v.number.localeCompare(b.v.number))
          .map(({ v, i }) => ({ accident_key: i!.accident, event_no: v.event, violation_no: v.number, violator_type: v.violatorType, violator_name: v.violator, action: v.action, assessment: v.assessment, proposed: v.proposed, current: v.current }));
        return { rows };
      }
      throw new Error(`the stand-in database does not know: ${s.slice(0, 160)}`);
    },
  } as unknown as PoolClient;
}

async function main(): Promise<void> {
  console.log("\nThe files, read as MSHA writes them");
  const piped: string[][] = [];
  eachCsvRow('A|B|C\r\n"x | y"|"say ""hi"""|7\r\n"last"||\r\n', ["C", "A", "B"], (v) => piped.push(v), "|");
  check("a \"|\"-separated row keeps a quoted separator, doubled quotes, a bare number and empty fields, in the columns asked; a comma stays a comma",
    JSON.stringify(piped) === JSON.stringify([["7", "x | y", 'say "hi"'], ["", "last", ""]]), JSON.stringify(piped));
  check("the slice: the Accidents file's header, 40 records that are no death and all 1,221 that are, of 275,799; the Mines file's 910 mines they name; read 2026-11-09",
    FIXTURE.read === "2026-11-09" && /first 40 records that are not deaths, and all 1221 records whose degree of injury is a fatality, of 275799/.test(FIXTURE.provenance) &&
      FIXTURE.accidents.split("\r\n").filter(Boolean).length === 1 + 40 + 1221 && FIXTURE.mines.split("\r\n").filter(Boolean).length === 1 + 910 && FIXTURE.lastModified === "Mon, 09 Nov 2026 23:15:21 GMT");
  const cut = fatalRecordsOf(accidentBytes);
  const cutLines = cut ? cut.toString("latin1").split("\r\n").filter(Boolean) : [];
  check("the cut keeps the header and the 1,221 fatal records before anything is decoded, byte for byte, and drops the 40 others",
    cutLines.length === 1222 && cutLines[0].startsWith("MINE_ID|CONTROLLER_ID|") && cutLines.slice(1).every((l) => l.includes('|"01"|"FATALITY"|')) &&
      FIXTURE.accidents.includes(cutLines[1]) && JSON.stringify(fatalAccidents(cut!.toString("latin1"), FIXTURE.mines)) === JSON.stringify(all), `${cutLines.length}`);
  const header = FIXTURE.accidents.slice(0, FIXTURE.accidents.indexOf("\r\n") + 2);
  const split = Buffer.from(`${header}"1234567"|"x"|"y\r\n"|"01"|"FATALITY"|\r\n`, "latin1");
  check("  …and gives the whole file back to be read instead when a record would be split (a line break inside a field) or no record holds the marker",
    fatalRecordsOf(split) === null && fatalRecordsOf(Buffer.from(header, "latin1")) === null && fatalRecordsOf(Buffer.alloc(0)) === null);
  check("1,130 accidents that killed 1,221 people, from 2000-01-10, each a mine's fatal records of one day, each with its place from the Mines file",
    all.length === 1130 && all.reduce((s, a) => s + a.dead, 0) === 1221 && all[0].day === "2000-01-10" && all.every((a) => /^\d{7}:\d{4}-\d{2}-\d{2}$/.test(a.key) && a.state && a.county && a.documents.length === a.dead),
    `${all.length} / ${all.reduce((s, a) => s + a.dead, 0)} / ${all[0]?.day}`);
  const kinross = byKey.get("2601842:2026-09-03");
  check("  …two records minutes apart are one accident: Kinross's at Bald Mountain on 2026-09-03, 15:45 and 15:50, 2 killed, the earlier time kept",
    kinross?.dead === 2 && kinross.time === "1545" && FIXTURE.accidents.split("\r\n").filter((l) => l.startsWith('"2601842"') && l.includes('"09/03/2026"')).length === 2);
  const plain = FIXTURE.accidents.split("\r\n").slice(1, 41);
  check("  …and the 40 records that are no death make no accident", plain.every((l) => !l.includes('|"01"|"FATALITY"|') && !byKey.has(`${l.slice(1, 8)}:${l.split("|")[9]?.replace(/"/g, "").replace(/^(\d\d)\/(\d\d)\/(\d{4})$/, "$3-$1-$2")}`)) && plain.length === 40);
  check("Upper Big Branch of 2010-04-05 is one accident of 29 dead; Sago of 2006-01-02 one of 12",
    byKey.get("4608436:2010-04-05")?.dead === 29 && byKey.get("4608791:2006-01-02")?.dead === 12);
  check("a place reads as a county and its state, a parish in Louisiana, Alaska's boroughs as named",
    placeOf("Marshall", "WV") === "Marshall County, West Virginia" && placeOf("Calcasieu", "LA") === "Calcasieu Parish, Louisiana" && placeOf("Fairbanks North Star", "AK") === "Fairbanks North Star, Alaska" && placeOf("", "NV") === "Nevada");

  console.log("\nEach controller on its company's page, between the company's days");
  const mcelroy = eventOf("4601437:2003-01-22");
  check("McElroy's explosion of 2003-01-22 lands on CNX (old CONSOL Energy's record): 3 killed, contractors' men, MSHA's account quoted, no finding of fault",
    pagesOf("4601437:2003-01-22") === "CNX" && mcelroy?.title === "Coal mine accident in Marshall County, West Virginia — 3 killed (gas or dust explosion)" &&
      /^Form 7000-1 report to the Mine Safety and Health Administration: 1:00 a\.m\., underground; contact with hot objects or substances\. All 3 worked for contractors at the mine\. MSHA's account: "AN APPARENT METHANE EXPLOSION/.test(mcelroy.description ?? "") &&
      /Mine 4601437; MSHA's present names: MARSHALL COUNTY MINE near Cameron, operated by McElroy Coal Company\. The report is the operator's own filing, not a finding of fault\.$/.test(mcelroy.description ?? "") &&
      mcelroy.url === DATA_PAGE && mcelroy.source === "MSHA" && mcelroy.type === "regulation",
    `${mcelroy?.title} | ${mcelroy?.description}`);
  check("Gibson County's shaft of 2007-08-10 lands on ARLP: 3 killed in a fall, MSHA's account whole",
    pagesOf("1202215:2007-08-10") === "ARLP" && eventOf("1202215:2007-08-10")?.title === "Coal mine accident in Gibson County, Indiana — 3 killed (slip or fall)" &&
      /resulting in three fatalities\."/.test(eventOf("1202215:2007-08-10")?.description ?? ""), eventOf("1202215:2007-08-10")?.title);
  check("CONSOL Energy's ID is CNX's to the spin-off of 2017-11-28 and the new CONSOL's after: Buchanan's of 2014-08-20 on CNX, the Pennsylvania complex's of 2019-08-29 on CNR, and 2026's under Core Natural Resources' own ID on CNR",
    pagesOf("4404856:2014-08-20") === "CNX" && pagesOf("3607416:2019-08-29") === "CNR" && pagesOf("3607230:2026-05-19") === "CNR" && pagesOf("3607230:2026-07-11") === "CNR" &&
      mineControllersFor(ciks.CNX)?.[0].to === "2017-11-27" && mineControllersFor(ciks.CNR)?.[0].from === "2017-11-28");
  check("  …and Arch Resources' accidents before its merger into Core Natural Resources are no page's: 21, the last of 2024-09-28",
    all.filter((a) => a.controllerId === "C15561").length === 21 && all.filter((a) => a.controllerId === "C15561").every((a) => pagesOf(a.key) === "none") && byKey.get("4609192:2024-09-28")?.controllerId === "C15561");
  check("Mosaic's ID was IMC Global's before 2004-10-22: IMC-Agrico's of 2002-11-01 is no page's, Mosaic Phosphates' of 2005-09-27 MOS's, though MOS's chart begins in 1988",
    pagesOf("0800388:2002-11-01") === "none" && pagesOf("0800768:2005-09-27") === "MOS" && FIRST.MOS < "2002-11-01" && mineControllersFor(ciks.MOS)?.[0].from === "2004-10-22");
  check("Trinity's quarries are TRN's until Arcosa's spin-off: 2017-03-14 and 2018-04-12 on TRN, though MSHA names their operator Arcosa Aggregates today",
    pagesOf("4104553:2017-03-14") === "TRN" && pagesOf("4102547:2018-04-12") === "TRN" && /operated by Arcosa Aggregates, Inc\./.test(eventOf("4104553:2017-03-14")?.description ?? "") && !/Arcosa/.test(eventOf("4104553:2017-03-14")?.title ?? ""));
  check("  …and Arcosa's own two, of 2022 and 2024, wait: Yahoo's ACA chart begins 2026-07-17",
    mineAccidentEvents(all, mineControllersFor(ciks.ACA) ?? []).length === 2 && (pages.get("ACA") ?? []).length === 0);
  check("Minorca's of 2007-06-08 and 2019-11-05 land on ArcelorMittal's page, not Cleveland-Cliffs', though MSHA names the mine's operator Cleveland-Cliffs Minorca Mine today",
    pagesOf("2102449:2007-06-08") === "MT" && pagesOf("2102449:2019-11-05") === "MT" && /Cleveland-Cliffs Minorca Mine Inc/.test(eventOf("2102449:2007-06-08")?.description ?? ""));
  check("Knife River's quarries are MDU's until its spin-off of 2023: three, of 2005, 2011 and 2015",
    (pages.get("MDU") ?? []).map((e) => e.date).join() === "2015-01-08,2011-12-08,2005-06-27" && mineControllersFor(ciks.MDU)?.[0].to === "2023-05-31");
  check("Legacy Vulcan's six of 2000–2006, Vulcan Materials before its reorganisation, land on VMC with the record of 2007's nine",
    all.filter((a) => a.controllerId === "M00024").length === 6 && all.filter((a) => a.controllerId === "M00024").every((a) => pagesOf(a.key) === "VMC") && (pages.get("VMC") ?? []).length === 15);
  check("Peabody's accidents count from its first price of 2017-04-03: Whites Branch of 2001-04-12 is no page's, Bear Run's fire of 2018-09-07 BTU's",
    pagesOf("4608827:2001-04-12") === "none" && byKey.get("4608827:2001-04-12")?.controllerId === "C15833" && pagesOf("1202422:2018-09-07") === "BTU" && eventOf("1202422:2018-09-07")?.title === "Coal mine accident in Sullivan County, Indiana — 1 killed (fire)",
    eventOf("1202422:2018-09-07")?.title);
  const noPage = (ids: string[]) => all.filter((a) => ids.includes(a.controllerId));
  check("Upper Big Branch (Massey), Sago (ICG), Crandall Canyon (Murray) and Walter's Brookwood are no page's",
    ["4608436:2010-04-05", "4608791:2006-01-02", "4201715:2007-08-06", "4201715:2007-08-16", "0101322:2001-09-23"].every((k) => byKey.has(k) && pagesOf(k) === "none"));
  check("\"Ashland Inc et al\", MSHA's controller of Arch Coal's mines to 2004, is no page's: Hobet's of 2004-08-29 among its 11",
    noPage(["C00012"]).length === 11 && noPage(["C00012"]).every((a) => pagesOf(a.key) === "none") && byKey.get("4604670:2004-08-29")?.controllerId === "C00012");
  check("a joint venture is no one's: Bridger Coal's four (PacifiCorp and Idaho Power), Nevada Gold Mines' three (Barrick and Newmont)",
    noPage(["C00514"]).length === 4 && noPage(["0149763"]).length === 3 && noPage(["C00514", "0149763"]).every((a) => pagesOf(a.key) === "none"));
  check("Rogers Group's quarries are not Rogers Corporation's; Stillwater Mining's six before 2017 are not Sibanye-Stillwater's; Alcoa Inc.'s three wait on the owner's Alcoa question",
    noPage(["M00452"]).length === 3 && noPage(["M11292"]).length === 6 && noPage(["M00137"]).length === 3 && noPage(["M00452", "M11292", "M00137"]).every((a) => pagesOf(a.key) === "none") && !mineControllersFor(ciks.ROG ?? 84748));
  const shown = [...pages.values()].flat();
  const pinned = [...pages].filter(([, ev]) => ev.length >= 9).sort((a, b) => b[1].length - a[1].length).map(([t, ev]) => `${t} ${ev.length}`).join(", ");
  check("on 51 pages from their first prices: 224 accidents, 237 dead, 144 before 2017; ARLP 30, CNX 29, MLM 19, VMC 15, FCX 12, CRH 11, NEM 10, B 9",
    shown.length === 224 && shown.reduce((s, e) => s + Number(/— (\d+) killed/.exec(e.title)?.[1] ?? 0), 0) === 237 && shown.filter((e) => e.date < "2017").length === 144 &&
      [...pages.values()].filter((ev) => ev.length).length === 51 && pinned === "ARLP 30, CNX 29, MLM 19, VMC 15, FCX 12, CRH 11, NEM 10, B 9",
    `${shown.length}; ${shown.filter((e) => e.date < "2017").length} before 2017; ${pinned}`);
  check("  …each accident on one page only, newest first, keyed by its mine and day, no description over 600 characters, each saying it is no finding of fault",
    new Set(shown.map((e) => e.externalId)).size === shown.length && [...pages.values()].every((ev) => ev.every((e, i) => i === 0 || ev[i - 1].date >= e.date)) &&
      shown.every((e) => e.id === `msha-${e.externalId!.replace(":", "-")}` && e.dedupBasis === `msha:${e.externalId}` && (e.description ?? "").length <= 600 && /not a finding of fault\.$/.test(e.description ?? "") && e.sourceKey === "msha_accidents" && /^https:\/\//.test(e.url ?? "")));
  check("  …and every title names a place and a count, and no operator", shown.every((e) => /^(?:Coal mine|Mine) accident in [^—]+ — \d+ killed(?: \([^)]+\))?$/.test(e.title) && !/operated|Inc\b|LLC/.test(e.title)));

  console.log("\nThe map");
  const companies = tickerIndex.companies as [number, string, string][];
  const controllers = Object.values(MINE_CONTROLLERS).flatMap((o) => o.controllers);
  check("each company is its ticker's record, 52 of them, and every controller ID is MSHA's for a mine that had a death, by the name MSHA gives it",
    Object.entries(MINE_CONTROLLERS).every(([cik, o]) => companies.some(([c, t]) => c === Number(cik) && t === o.ticker)) && Object.keys(MINE_CONTROLLERS).length === 52 &&
      controllers.every((c) => all.some((a) => a.controllerId === c.id && a.controllerName === c.name)),
    controllers.filter((c) => !all.some((a) => a.controllerId === c.id && a.controllerName === c.name)).map((c) => c.id).join(", "));
  const mapText = read("lib/mineAccidents.ts").split("export const MINE_CONTROLLERS")[1] ?? "";
  check("every controller says why it is its company's, every day it carries is in its reason or a filing's, and no ID is two companies' on one day",
    controllers.every((c) => c.why.length > 15) && controllers.every((c) => [c.from, c.to].every((d) => !d || mapText.includes(d))) &&
      all.every((a) => Object.values(MINE_CONTROLLERS).filter((o) => o.controllers.some((c) => c.id === a.controllerId && (!c.from || a.day >= c.from) && (!c.to || a.day <= c.to))).length <= 1));

  console.log("\nThe read");
  const real = globalThis.fetch;
  const asked: { url: string; since: string | null }[] = [];
  const serve = (status: Record<string, number>, bodies: Record<string, Buffer>) =>
    (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      asked.push({ url, since: headers.get("if-modified-since") });
      const code = status[url] ?? 200;
      return new Response(code === 200 ? new Uint8Array(bodies[url]) : null, { status: code, headers: code === 200 ? { "last-modified": FIXTURE.lastModified } : {} });
    }) as unknown as typeof fetch;
  const zips = { [ACCIDENTS_URL]: makeZip("Accidents.txt", accidentBytes), [MINES_URL]: makeZip("Mines.txt", mineBytes) };
  let ok: MineFilesAnswer, same: MineFilesAnswer, busy: MineFilesAnswer, broken: MineFilesAnswer;
  try {
    globalThis.fetch = serve({}, zips);
    ok = await fetchMineFiles(null);
    const firstAsked = asked.splice(0);
    globalThis.fetch = serve({ [ACCIDENTS_URL]: 304 }, zips);
    same = await fetchMineFiles(FIXTURE.lastModified);
    const secondAsked = asked.splice(0);
    globalThis.fetch = serve({ [ACCIDENTS_URL]: 429 }, zips);
    busy = await fetchMineFiles(null);
    globalThis.fetch = serve({}, { ...zips, [ACCIDENTS_URL]: Buffer.from("no zip") });
    broken = await fetchMineFiles(null);
    check("both zips read whole, the Accidents file cut to its deaths: the same 1,130 accidents, its Last-Modified kept, no If-Modified-Since on a first read",
      ok.outcome === "ok" && JSON.stringify(ok.accidents) === JSON.stringify(all) && ok.modified === FIXTURE.lastModified &&
        firstAsked.map((a) => `${a.url}|${a.since}`).join() === `${ACCIDENTS_URL}|null,${MINES_URL}|null`, `${ok.outcome} ${ok.accidents.length} ${JSON.stringify(firstAsked)}`);
    check("  …a copy MSHA has not changed is asked with its Last-Modified and not read again (304); the Mines file is not asked",
      same.outcome === "unchanged" && secondAsked.length === 1 && secondAsked[0].since === FIXTURE.lastModified);
    check("  …a 429 is throttled, a body that is no zip an error, and neither is a list of accidents",
      busy.outcome === "throttled" && busy.httpStatus === 429 && broken.outcome === "error" && /no end of central directory/.test(broken.detail ?? "") && !busy.accidents.length && !broken.accidents.length, `${busy.outcome} ${broken.outcome} ${broken.detail}`);
  } finally {
    globalThis.fetch = real;
  }

  console.log("\nKept once a week, read for every company");
  const db: FakeDb = { reads: null, accidents: new Map(), listed: FIRST.CNX };
  const give = (answer: MineFilesAnswer) => async () => answer;
  const noFindings = { findingsBudget: { left: 0 } };
  const stored = await walkMineAccidents(fakeDb(db), { budget: { left: 1 }, fetchFiles: give({ accidents: all, modified: FIXTURE.lastModified, outcome: "ok", httpStatus: 200 }), ...noFindings });
  const fresh = await walkMineAccidents(fakeDb(db), { budget: { left: 1 }, fetchFiles: async () => { throw new Error("asked while fresh"); }, ...noFindings });
  db.reads!.ageDays = 8;
  const unchanged = await walkMineAccidents(fakeDb(db), { budget: { left: 1 }, fetchFiles: give({ accidents: [], modified: FIXTURE.lastModified, outcome: "unchanged", httpStatus: 304 }), ...noFindings });
  const renewed = db.reads?.ageDays === 0 && db.accidents.size === 1130;
  db.reads!.ageDays = 8;
  const spent = await walkMineAccidents(fakeDb(db), { budget: { left: 0 }, ...noFindings });
  const refused = await walkMineAccidents(fakeDb(db), { budget: { left: 1 }, fetchFiles: give({ accidents: [], modified: null, outcome: "throttled", httpStatus: 429 }), ...noFindings });
  check("a first read stores the 1,130 accidents; a read within the week asks nothing; an unchanged copy only renews the read; a spent budget or a refusal keeps what is kept",
    stored.read === "stored" && stored.accidents === 1130 && db.accidents.size === 1130 && !fresh.due && unchanged.read === "unchanged" && renewed &&
      spent.stopped === "this run's read is spent" && refused.failure?.outcome === "throttled" && db.accidents.size === 1130,
    JSON.stringify({ stored, fresh, unchanged, spent, refused }));
  const noWalk: MineWalk = { due: false, accidents: 0 };
  const cnx = await mineAccidentsFor(fakeDb(db), 1, ciks.CNX, noWalk);
  const btu = await mineAccidentsFor(fakeDb({ ...db, listed: FIRST.BTU }), 1, ciks.BTU, noWalk);
  const unpriced = await mineAccidentsFor(fakeDb({ ...db, listed: null }), 1, ciks.CNX, noWalk);
  const unmapped = await mineAccidentsFor(fakeDb(db), 1, 320193, noWalk);
  const throttled = await mineAccidentsFor(fakeDb(db), 1, ciks.CNX, { due: true, accidents: 0, failure: { outcome: "throttled", httpStatus: 429 } });
  const neverRead = await mineAccidentsFor(fakeDb({ reads: null, accidents: new Map(), listed: FIRST.CNX }), 1, ciks.CNX, { due: true, accidents: 0, failure: { outcome: "error", detail: "x" } });
  check("a company's rows come from the kept copy, from its first price: CNX's 29, BTU's 3, a complete answer, so a row the map stops giving comes off",
    cnx.outcome === "ok" && cnx.events.length === 29 && JSON.stringify(cnx.events) === JSON.stringify(pages.get("CNX")) && btu.events.length === 3 && !!cnx.complete && !!btu.complete,
    `${cnx.events.length} ${btu.events.length}`);
  check("  …no prices yet is a failure asked again; a company with no controller asks nothing; a refused read still gives the kept rows and reports the refusal; with no copy ever kept nothing is complete",
    unpriced.outcome === "error" && /no prices/.test(unpriced.detail ?? "") && unmapped.outcome === "empty" && /no mine controller/.test(unmapped.detail ?? "") &&
      throttled.outcome === "throttled" && throttled.events.length === 29 && !!throttled.complete && neverRead.outcome === "error" && !neverRead.complete && !neverRead.events.length,
    JSON.stringify({ unpriced: unpriced.outcome, unmapped: unmapped.detail, throttled: throttled.outcome, neverRead: neverRead.complete }));

  // ─── batch 139: MSHA's own finding on the death's row, the 2026-11-11 proposal 1 ─────────────────
  console.log("\nMSHA's own finding on the death's row (batch 139, the 2026-11-11 proposal 1, approved by the owner on 2026-11-11)");
  const lines = ["HEAD|ER", ...Array.from({ length: 300_000 }, (_, i) => `"${i}"|"m${i % 7}"|${"y".repeat(i % 61)}`)];
  const text = Buffer.from(`${lines.join("\r\n")}\r\n`);
  const zipped = makeZip("big.txt", text);
  const streamed: string[] = [];
  await eachZipLine(zipped, "big.txt", (line) => streamed.push(line.toString("latin1")));
  // the same zip with its directory's size one byte off: refused, not half-read
  const wrong = Buffer.from(zipped);
  const dirAt = wrong.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  wrong.writeUInt32LE(text.length + 1, dirAt + 24);
  const refusedSize = await eachZipLine(wrong, "big.txt", () => {}).then(() => "", (e: Error) => e.message);
  const kept = await keptLines(zipped, "big.txt", (line) => line.toString("latin1").includes('"m3"'));
  check("a zip entry is read a line at a time as it inflates, never decoded whole: 300,001 lines across its chunks, each whole, its CRLF off; a size its directory does not give is refused",
    streamed.length === lines.length && streamed.every((l, i) => l === lines[i]) && /unpacked to \d+ bytes, not the \d+ its directory gives/.test(refusedSize),
    `${streamed.length} ${refusedSize}`);
  check("  …and the lines a reader keeps are its header and the ones it asked for, as text",
    kept.split("\r\n").filter(Boolean).length === 1 + lines.filter((l) => l.includes('"m3"')).length && kept.startsWith("HEAD|ER\r\n"));

  const atMines = new Set(all.map((a) => a.mine));
  const investigations = investigationsOf(FINDINGS.inspections, atMines);
  const links = linkInvestigations(all, investigations);
  const violations = violationsOf(FINDINGS.violations, new Set(links.keys()));
  const findings = findingsOf(links, violations);
  const codes = investigations.reduce<Record<string, number>>((t, i) => ({ ...t, [i.code]: (t[i.code] ?? 0) + 1 }), {});
  const perAccident = [...links.values()].reduce<Record<string, number>>((t, k) => ({ ...t, [k]: (t[k] ?? 0) + 1 }), {});
  check("the files of 2026-11-10: 1,484 accident investigations at the fatal accidents' mines (E06 866, AFA 170, 30 448), and two other inspections at Goldstrike left out by their code; 1,102 linked to 1,095 accidents, 7 with two or more; 1,966 violations assessed under them",
    FINDINGS.read === "2026-11-10" && investigations.length === 1484 && codes.E06 === 866 && codes.AFA === 170 && codes["30"] === 448 &&
      investigationsOf(FINDINGS.inspections).length === 1484 && FINDINGS.inspections.split("\r\n").filter(Boolean).length === 1 + 1484 + 2 &&
      links.size === 1102 && Object.keys(perAccident).length === 1095 && Object.values(perAccident).filter((n) => n > 1).length === 7 && violations.length === 1966,
    `${investigations.length} ${JSON.stringify(codes)} ${links.size} ${Object.keys(perAccident).length} ${violations.length}`);
  const at = (mine: string, day: string) => ({ key: `${mine}:${day}`, mine, day });
  const inv = (event: string, mine: string, begin: string): MineInvestigation => ({ event, mine, begin, code: "E06" });
  const linkTest = linkInvestigations([at("1", "2020-01-10"), at("1", "2020-01-15"), at("2", "2020-01-10")], [
    inv("a", "1", "2020-01-10"), inv("b", "1", "2020-01-14"), inv("c", "1", "2020-01-16"), inv("d", "1", "2020-01-30"), inv("e", "2", "2020-01-24"), inv("f", "2", "2020-01-25"), inv("g", "2", "2020-01-09"), inv("h", "3", "2020-01-10"),
  ]);
  check(`an investigation is an accident's when MSHA began it at the mine on the accident's day or up to ${INVESTIGATION_DAYS} days after, the latest such accident at the mine: never a day before, a 15th day after, or another mine`,
    INVESTIGATION_DAYS === 14 && linkTest.get("a") === "1:2020-01-10" && linkTest.get("b") === "1:2020-01-10" && linkTest.get("c") === "1:2020-01-15" && !linkTest.has("d") &&
      linkTest.get("e") === "2:2020-01-10" && !linkTest.has("f") && !linkTest.has("g") && !linkTest.has("h"), JSON.stringify([...linkTest]));
  check("money stays digits: MSHA's \"167600\" is 167600.00, sums are whole cents, and $8,453,138.30 is written so",
    moneyOf("167600") === "167600.00" && moneyOf("70000.00") === "70000.00" && moneyOf("") === "0.00" && moneyOf("1,250.5") === "1250.50" && dollarsOf(BigInt(845313830)) === "$8,453,138.30" && dollarsOf(BigInt(44760000)) === "$447,600");

  const withFindings = new Map(Object.values(MINE_CONTROLLERS).map((o) => [o.ticker, mineAccidentEvents(all, o.controllers, { from: FIRST[o.ticker], findings })]));
  const findingOn = (key: string) => [...withFindings.values()].flat().find((e) => e.externalId === key);
  const goldstrike = findingOn("2602246:2010-08-12");
  check("Barrick's Goldstrike, 2010-08-12, 2 killed: MSHA's investigation cited 5 violations against the operator, all under section 104(d) and specially assessed, $447,600, unchanged",
    (goldstrike?.description ?? "").endsWith("The report is the operator's own filing, not a finding of fault. MSHA's investigation cited 5 violations against the operator, 5 of them under section 104(d) (an unwarrantable failure) and 5 specially assessed, and proposed $447,600 in penalties, the amount assessed now."),
    goldstrike?.description);
  const mcelroyRow = findingOn("4601437:2003-01-22");
  check("  …CONSOL's McElroy, 2003-01-22, 3 killed in the shaft explosion: 3 violations, all against the contractor Central Cambria Drilling Co, none against the operator, $110,060",
    / MSHA's investigation cited 3 violations against the contractor Central Cambria Drilling Co, 2 of them under section 104\(d\) \(an unwarrantable failure\) and 2 specially assessed, and proposed \$110,060 in penalties, the amount assessed now\.$/.test(mcelroyRow?.description ?? "") &&
      (findings.get("4601437:2003-01-22") ?? []).every((v) => v.violatorType === "Contractor"), mcelroyRow?.description);
  const lucky = findingOn("1000088:2011-04-15");
  check("  …Hecla's Lucky Friday, 2011-04-15: one 104(d)(1) violation specially assessed at $159,100 and $180,000 as assessed now: a figure can rise",
    / MSHA's investigation cited 1 violation against the operator, under section 104\(d\) \(an unwarrantable failure\) and specially assessed, and proposed \$159,100 in penalties; \$180,000 as assessed now\.$/.test(lucky?.description ?? ""), lucky?.description);
  const others = violationsOf(FINDINGS.violations).filter((v) => v.event !== "1148152" && !links.has(v.event));
  check("  …a violation of another event at Goldstrike that week, or of an investigation linked to no accident, is not counted: the row's are its 5 of event 1148152",
    others.length === 6 && others.filter((v) => v.number && FINDINGS.violations.includes(`"${v.event}"|"${v.number}"|"2602246"`)).length === 3 &&
      (findings.get("2602246:2010-08-12") ?? []).length === 5 && (findings.get("2602246:2010-08-12") ?? []).every((v) => v.event === "1148152"),
    `${others.length}`);
  const rowsAll = [...withFindings.values()].flat();
  const rowsBare = [...pages.values()].flat();
  const keys = new Set(links.values());
  const found = rowsAll.filter((e) => findings.has(e.externalId ?? ""));
  const cited = found.flatMap((e) => findings.get(e.externalId ?? "") ?? []);
  const cents = (vs: readonly MineViolation[], f: (v: MineViolation) => string) => vs.reduce((t, v) => t + BigInt(f(v).replace(".", "")), BigInt(0));
  check("on the 224 rows from first prices, 213 have MSHA's investigation and 168, on 45 pages, 114 before 2017, carry what it assessed: 316 violations, 241 against the operator and 75 against a contractor; $11,586,940 proposed, $8,453,138.30 as assessed now",
    rowsAll.length === 224 && rowsAll.filter((e) => keys.has(e.externalId ?? "")).length === 213 && found.length === 168 &&
      new Set([...withFindings].filter(([, ev]) => ev.some((e) => findings.has(e.externalId ?? ""))).map(([t]) => t)).size === 45 && found.filter((e) => e.date < "2017").length === 114 &&
      cited.length === 316 && cited.filter((v) => v.violatorType === "Operator").length === 241 && cited.filter((v) => v.violatorType === "Contractor").length === 75 &&
      dollarsOf(cents(cited, (v) => v.proposed)) === "$11,586,940" && dollarsOf(cents(cited, (v) => v.current)) === "$8,453,138.30",
    `${rowsAll.length} ${found.length} ${cited.length} ${dollarsOf(cents(cited, (v) => v.proposed))} ${dollarsOf(cents(cited, (v) => v.current))}`);
  check("  …98 of them carry a special assessment and 49 a section 104(d) citation or order; a row with no investigation, or whose investigation assessed nothing, says nothing of one",
    found.filter((e) => (findings.get(e.externalId ?? "") ?? []).some((v) => v.assessment === "Special")).length === 98 &&
      found.filter((e) => (findings.get(e.externalId ?? "") ?? []).some((v) => /^104\(d\)/.test(v.action))).length === 49 &&
      rowsAll.filter((e) => !findings.has(e.externalId ?? "")).every((e) => !/MSHA's investigation/.test(e.description ?? "") && e.description === rowsBare.find((b) => b.id === e.id)?.description) &&
      findingSentence([]) === "");
  check("  …no row's id, day, title or key changes; every description is at most 600 characters, ends with the finding where there is one, and still says the report is no finding of fault",
    rowsAll.length === rowsBare.length && rowsAll.every((e, i) => e.id === rowsBare[i].id && e.date === rowsBare[i].date && e.title === rowsBare[i].title && e.dedupBasis === rowsBare[i].dedupBasis && e.externalId === rowsBare[i].externalId) &&
      rowsAll.every((e) => (e.description ?? "").length <= 600 && /The report is the operator's own filing, not a finding of fault\./.test(e.description ?? "")) &&
      found.every((e) => (e.description ?? "").endsWith(findingSentence(findings.get(e.externalId ?? "") ?? []))));

  // the account runs to the mine's sentence: a narrative can hold quote marks of its own (24" pipe)
  const account = (d: string) => /MSHA's account: "(.*)" Mine \d{7}[.;]/.exec(d)?.[1] ?? "";
  check("  …MSHA's account gives way to the finding, cut at a word and marked: 136 of the 168 keep it, 32 lose it whole, and 6 the mine's present names, but never its number",
    found.filter((e) => account(e.description ?? "")).length === 136 && found.filter((e) => !/MSHA's present names/.test(e.description ?? "")).length === 6 &&
      found.every((e) => /Mine \d{7}[.;]/.test(e.description ?? "")) && found.filter((e) => account(e.description ?? "")).every((e) => {
        const kept = account(e.description ?? "");
        const told = byKey.get(e.externalId ?? "")?.narrative ?? "";
        return kept === told || (kept.endsWith("…") && told.startsWith(kept.slice(0, -1)));
      }),
    `${found.filter((e) => account(e.description ?? "")).length} keep it; ${found.filter((e) => !/MSHA's present names/.test(e.description ?? "")).length} without names`);

  // the read, served from the slice's own bytes
  const findingZips = {
    [INSPECTIONS_URL]: makeZip("Inspections.txt", Buffer.from(FINDINGS.inspections, "latin1")),
    [VIOLATIONS_URL]: makeZip("AssessedViolations.txt", Buffer.from(FINDINGS.violations, "latin1")),
  };
  const accidentsKept = all.map((a) => ({ key: a.key, mine: a.mine, day: a.day }));
  let readAnswer: MineFindingsAnswer | undefined, busy2: MineFindingsAnswer, none: MineFindingsAnswer;
  try {
    asked.splice(0);
    globalThis.fetch = serve({}, findingZips);
    readAnswer = await fetchMineFindings(accidentsKept);
    const order = asked.splice(0).map((a) => a.url);
    globalThis.fetch = serve({ [VIOLATIONS_URL]: 429 }, findingZips);
    busy2 = await fetchMineFindings(accidentsKept);
    globalThis.fetch = serve({}, { ...findingZips, [INSPECTIONS_URL]: makeZip("Inspections.txt", Buffer.from(FINDINGS.inspections.split("\r\n")[0] + "\r\n", "latin1")) });
    none = await fetchMineFindings(accidentsKept);
    asked.splice(0);
    check("the two files are streamed and cut: the Inspections file to the investigations at the kept accidents' mines, then the Assessed Violations file to the violations under those linked to one, the same as their text read whole",
      readAnswer.outcome === "ok" && readAnswer.investigations.length === 1102 && readAnswer.violations.length === 1966 &&
        JSON.stringify(readAnswer.violations) === JSON.stringify(violations) && readAnswer.investigations.every((i) => links.get(i.event) === i.accident) && readAnswer.modified === FIXTURE.lastModified &&
        order.join() === `${INSPECTIONS_URL},${VIOLATIONS_URL}`, `${readAnswer.outcome} ${readAnswer.investigations.length} ${readAnswer.violations.length} ${order}`);
    check("  …a 429 is throttled; a file holding no investigation at these mines is refused, not read as no finding",
      busy2.outcome === "throttled" && busy2.httpStatus === 429 && none.outcome === "error" && /no accident investigation/.test(none.detail ?? ""), `${busy2.outcome} ${none.outcome} ${none.detail}`);
  } finally {
    globalThis.fetch = real;
  }

  // kept once a month, in db/048, and given at a company's ingest
  const fdb: FakeDb = { reads: null, accidents: new Map(), listed: FIRST.B, findingsAge: null };
  const answer: MineFindingsAnswer = { investigations: readAnswer?.investigations ?? [], violations: readAnswer?.violations ?? [], modified: FINDINGS.lastModified.violations, outcome: "ok", httpStatus: 200 };
  let askedFor = 0;
  const first = await walkMineAccidents(fakeDb(fdb), {
    budget: { left: 1 }, fetchFiles: give({ accidents: all, modified: FIXTURE.lastModified, outcome: "ok", httpStatus: 200 }),
    findingsBudget: { left: 1 }, fetchFindings: async (acc) => { askedFor = acc.length; return answer; },
  });
  const within = await walkMineAccidents(fakeDb(fdb), { budget: { left: 0 }, findingsBudget: { left: 1 }, fetchFindings: async () => { throw new Error("asked within the month"); } });
  fdb.findingsAge = FINDINGS_EVERY_DAYS + 1;
  const failedRead = await walkMineAccidents(fakeDb(fdb), { budget: { left: 0 }, findingsBudget: { left: 1 }, fetchFindings: async () => ({ investigations: [], violations: [], modified: null, outcome: "throttled", httpStatus: 429 }) });
  check(`the findings are read once every ${FINDINGS_EVERY_DAYS} days, for every kept accident, after the accidents: a first read keeps 1,102 investigations and 1,966 violations; within the month nothing is asked; a refused read keeps what is kept`,
    FINDINGS_EVERY_DAYS === 30 && first.read === "stored" && first.findings?.read === "stored" && askedFor === 1130 && fdb.investigations?.size === 1102 && fdb.violations?.size === 1966 &&
      !within.findings?.due && failedRead.findings?.failure?.outcome === "throttled" && fdb.investigations?.size === 1102 && fdb.violations?.size === 1966,
    JSON.stringify({ first: first.findings, within: within.findings, failedRead: failedRead.findings }));
  const barrick = await mineAccidentsFor(fakeDb(fdb), 1, ciks.B, { due: false, accidents: 0 });
  const barrickRefused = await mineAccidentsFor(fakeDb(fdb), 1, ciks.B, { due: false, accidents: 0, findings: failedRead.findings });
  const kept139 = await storedMineFindings(fakeDb(fdb), ["2602246:2010-08-12", "4601437:2003-01-22"]);
  check("  …a company's rows carry the kept findings, the same as read from the files: Barrick's 9; a refused findings read still gives them, and its log line says the kept findings stand",
    barrick.outcome === "ok" && JSON.stringify(barrick.events) === JSON.stringify(withFindings.get("B")) && barrick.events.length === 9 &&
      JSON.stringify(barrickRefused.events) === JSON.stringify(barrick.events) && barrickRefused.outcome === "ok" && /MSHA's findings files: throttled; the kept findings stand/.test(barrickRefused.detail ?? "") &&
      (kept139.get("2602246:2010-08-12") ?? []).length === 5 && (kept139.get("4601437:2003-01-22") ?? []).length === 3,
    `${barrick.events.length} ${barrickRefused.detail}`);
  const migration = existsSync(join(root, "db/048_mine_findings.sql")) ? read("db/048_mine_findings.sql") : "";
  check("  …in db/048: the investigations by event, each with its accident's key, the violations by event and number with their penalties numeric, the read's day beside the accidents'",
    /CREATE TABLE IF NOT EXISTS mine_investigations \(\s*event_no\s+text PRIMARY KEY/.test(migration) && /accident_key\s+text NOT NULL/.test(migration) &&
      /proposed_amount\s+numeric\(14, 2\) NOT NULL/.test(migration) && /current_amount\s+numeric\(14, 2\) NOT NULL/.test(migration) && /PRIMARY KEY \(event_no, violation_no\)/.test(migration) &&
      /ADD COLUMN IF NOT EXISTS findings_read_at timestamptz/.test(migration));
  check("  …and said where it is used: the quota's note names the two files and their month, the README and the coverage map the finding",
    /Inspections and Assessed Violations zips \(74 MB and 110 MB\) once a month/.test(QUOTAS.msha_accidents?.note ?? "") &&
      /MSHA's own finding/.test(read("README.md")) && /MSHA's own finding/.test(read("docs/COVERAGE-MAP.md")), QUOTAS.msha_accidents?.note);

  // the 2026-11-10 audit of batches 131–136, finding 4 (batch 137): the counts the comments give are the files'
  console.log("\nThe counts the code and the migration give (the 2026-11-10 audit, batch 137)");
  check("the code and db/046 give the Accidents file's 275,799 records and its 1,124 fatal accidents with a controller, of 1,130, as the file does",
    /all 1,124 fatal accidents with a controller, of 1,130/.test(read("lib/mineAccidents.ts")) && /1,221 of its 275,799 records/.test(read("lib/mineAccidents.ts")) &&
      /\(275,799 records, 2026-11-09\)/.test(read("db/046_mine_accidents.sql")) && !/275,800|1,125 fatal/.test(read("lib/mineAccidents.ts") + read("db/046_mine_accidents.sql")));

  console.log("\nRegistered, licensed, wired");
  const src = SOURCES.find((s) => s.key === "msha_accidents");
  check("the source is registered as public domain, cleared for commercial use, with the day the Labor Department's terms were read and their words",
    src?.id === 38 && src.license === "public domain" && src.commercialOk && src.reviewedOn === "2026-11-10" && src.attribution === "Mine Safety and Health Administration, U.S. Department of Labor" &&
      /"Materials created by the federal government are generally part of the public domain and may be\s+\/\/ used, reproduced and distributed without permission"/.test(read("lib/ingest/store.ts")) &&
      /implies any affiliation or endorsement by the DOL/.test(read("lib/ingest/store.ts")), JSON.stringify(src));
  check("  …read once a day from the kept copy, quota noted, a company source, scored without the model",
    SOURCE_TTL_MINUTES.msha_accidents === 1440 && QUOTAS.msha_accidents?.perDay === null && (COMPANY_SOURCES as readonly string[]).includes("msha_accidents") &&
      deterministicScore({ eventId: 0, kind: "regulation", title: "Coal mine accident", sourceKey: "msha_accidents" }, { kind: "company", displayName: "CONSOL", ticker: "CNX" }, ["consol"])?.score === 1);
  const ingest = read("scripts/ingest.ts");
  check("  …company ingest asks only for a mapped company: the weekly walk, then the kept rows",
    /const mineControllers = mineControllersFor\(company\.cik\);\s*if \(mineControllers\) \{\s*await run\("msha_accidents", [\s\S]{0,200}const walked = await walkMineAccidents\(client\);[\s\S]{0,300}return mineAccidentsFor\(client, subjectId, company\.cik, walked\);/.test(ingest));
  const sql = existsSync(join(root, "db/046_mine_accidents.sql")) ? read("db/046_mine_accidents.sql") : "";
  check("  …its tables in db/046, the accidents keyed by mine and day, the read kept once",
    /CREATE TABLE IF NOT EXISTS mine_accidents \(\s*accident_key\s+text PRIMARY KEY/.test(sql) && /CREATE TABLE IF NOT EXISTS mine_reads \(\s*id\s+integer PRIMARY KEY CHECK \(id = 1\)/.test(sql) && /documents\s+text\[\] NOT NULL/.test(sql));
  check("  …and credited on every page, in the terms, the README and the coverage map, with the check in the offline chain",
    /mine accident reports from the Mine Safety and Health Administration of the U\.S\. Department of Labor/.test(read("app/layout.tsx").replace(/\s+/g, " ")) &&
      /mine accident reports from the Mine Safety and Health Administration of the U\.S\. Department of Labor/.test(read("app/legal/terms/page.tsx").replace(/\s+/g, " ")) &&
      /\| Mine Safety and Health Administration \|/.test(read("README.md")) && /MSHA mine accidents/.test(read("docs/COVERAGE-MAP.md")) &&
      /npm run check:rail-accidents && npm run check:mine-accidents && /.test(read("package.json")));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  process.exit(fail ? 1 : 0);
}

main();
