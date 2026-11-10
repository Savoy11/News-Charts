import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { deflateRawSync, gunzipSync } from "node:zlib";
import type { PoolClient } from "pg";
import { deterministicScore } from "../lib/enrich/relevance";
import { mineAccidentsFor, walkMineAccidents, type MineWalk } from "../lib/ingest/mineWalk";
import { QUOTAS } from "../lib/ingest/quota";
import { SOURCE_TTL_MINUTES } from "../lib/ingest/refresh";
import { SOURCES } from "../lib/ingest/store";
import { ACCIDENTS_URL, DATA_PAGE, MINES_URL, MINE_CONTROLLERS, fatalAccidents, fatalRecordsOf, fetchMineFiles, mineAccidentEvents, mineControllersFor, placeOf, type MineAccident, type MineFilesAnswer } from "../lib/mineAccidents";
import type { TimelineEvent } from "../lib/types";
import { eachCsvRow } from "../lib/zip";
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
  const stored = await walkMineAccidents(fakeDb(db), { budget: { left: 1 }, fetchFiles: give({ accidents: all, modified: FIXTURE.lastModified, outcome: "ok", httpStatus: 200 }) });
  const fresh = await walkMineAccidents(fakeDb(db), { budget: { left: 1 }, fetchFiles: async () => { throw new Error("asked while fresh"); } });
  db.reads!.ageDays = 8;
  const unchanged = await walkMineAccidents(fakeDb(db), { budget: { left: 1 }, fetchFiles: give({ accidents: [], modified: FIXTURE.lastModified, outcome: "unchanged", httpStatus: 304 }) });
  const renewed = db.reads?.ageDays === 0 && db.accidents.size === 1130;
  db.reads!.ageDays = 8;
  const spent = await walkMineAccidents(fakeDb(db), { budget: { left: 0 } });
  const refused = await walkMineAccidents(fakeDb(db), { budget: { left: 1 }, fetchFiles: give({ accidents: [], modified: null, outcome: "throttled", httpStatus: 429 }) });
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
