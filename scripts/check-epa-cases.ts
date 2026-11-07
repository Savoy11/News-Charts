import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deflateRawSync, gunzipSync } from "node:zlib";
import type { PoolClient } from "pg";
import tickerIndex from "../data/edgar-tickers.json";
import { dojPossessive } from "../lib/doj";
import { withoutTag } from "../lib/edgarName";
import { deterministicScore } from "../lib/enrich/relevance";
import {
  CASE_FILE_URL,
  CASE_TABLES,
  MANY_PARTIES,
  NOT_THE_COMPANY,
  BRANDED_SITE,
  UNITS,
  unitKeysOf,
  caseReportUrl,
  caseTitle,
  dollars,
  epaEvents,
  epaParty,
  fetchCaseFile,
  penaltyOf,
  readCases,
  type CaseFileAnswer,
  type EpaCase,
} from "../lib/epaCases";
import { companyNames } from "../lib/frCompany";
import { epaCasesFor, walkEpaCases, type EpaWalk } from "../lib/ingest/epaWalk";
import { namesForYear } from "../lib/ingest/frBackfill";
import { QUOTAS } from "../lib/ingest/quota";
import { SOURCE_TTL_MINUTES } from "../lib/ingest/refresh";
import { SOURCES } from "../lib/ingest/store";
import { isNotesRecord } from "../lib/releaseNames";
import { newsNamesFor, possessiveNameFor } from "../lib/sec";
import type { TimelineEvent } from "../lib/types";
import { eachCsvRow, readZip } from "../lib/zip";
import { COMPANY_SOURCES } from "./ingest";

/**
 * The EPA's civil enforcement cases on the pages of the companies they charge (batch 95, the
 * 2026-11-05 proposal 1).
 *
 *   npm run check:epa-cases
 *
 * Replays a committed slice of EPA's case file of 2026-10-31 (scripts/fixtures/epa-cases-slice.json.gz):
 * every row of the four tables the adapter reads for the 4,289 cases whose defendants hold a
 * listed company's name, and the cases the guards are measured on. Offline: the file's fetch and
 * the database are stood in for. On main none of it runs: lib/epaCases.ts does not exist.
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
const companies = tickerIndex.companies as [number, string, string][];
const SLICE: { provenance: string; tables: Record<(typeof CASE_TABLES)[number], string> } = JSON.parse(gunzipSync(readFileSync(join(root, "scripts/fixtures/epa-cases-slice.json.gz"))).toString("utf8"));
const cases = readCases(SLICE.tables);
const byNumber = new Map(cases.map((c) => [c.number, c]));
const rowOf = (ticker: string) => {
  const r = companies.find(([, t]) => t === ticker);
  if (!r) throw new Error(`no ${ticker} in the ticker index`);
  return r;
};
/** The names a company's ingest matches under (`partyNamesFor`), from the committed indexes, former names aside. */
function namesOf(ticker: string): (year: number) => string[] {
  const [cik, , title] = rowOf(ticker);
  const own = dojPossessive(title, possessiveNameFor(cik));
  return (year) => [...companyNames(title, namesForYear(year, newsNamesFor(cik), [])), ...(own ? [own] : []), withoutTag(title)];
}
/** First trading days as Yahoo gave them on 2026-11-05 (`firstTradeDate`), which a company's stored prices begin with. */
const FIRST_PRICES: Record<string, string> = { CAT: "1962-01-02", GM: "2010-11-18", KODK: "2013-09-23", SLND: "2021-12-23", SUN: "2012-09-20" };
const eventsOn = (ticker: string, from = "") => epaEvents(cases, namesOf(ticker), { cik: rowOf(ticker)[0], from });
const has = (events: TimelineEvent[], number: string) => events.some((e) => (e.externalId ?? "").split(",").includes(number));

async function main(): Promise<void> {
  console.log("\nThe case file: four tables, read from the zip");
  const csv = 'A,B,C\n"x, y","say ""hi""","two\nlines"\r\nplain,,last\n';
  const got: string[][] = [];
  eachCsvRow(csv, ["C", "A"], (v) => got.push(v));
  check("a CSV row keeps quoted commas, doubled quotes, line breaks and empty fields, in the columns asked",
    JSON.stringify(got) === JSON.stringify([["two\nlines", "x, y"], ["last", "plain"]]), JSON.stringify(got));
  let missing = "";
  try {
    eachCsvRow(csv, ["A", "Z"], () => undefined);
  } catch (err) {
    missing = String(err);
  }
  check("  …and a table without a column asked for is refused, not read as empty", /lacks Z/.test(missing), missing);
  const zip = makeZip([["CASE_ENFORCEMENTS.csv", "a,b\n1,2\n", true], ["other.txt", "skip", false]]);
  const files = readZip(zip, ["CASE_ENFORCEMENTS.csv", "absent.csv"]);
  check("the zip reader finds a deflated file by its name and skips the rest", files.get("CASE_ENFORCEMENTS.csv")?.toString() === "a,b\n1,2\n" && files.size === 1);
  let broken = "";
  try {
    readZip(new Uint8Array(100), ["x"]);
  } catch (err) {
    broken = String(err);
  }
  check("  …and refuses what is no zip", /no end of central directory/.test(broken), broken);
  check("the slice holds the cases the replay reads, each with its day: 6,028, the 1,739 its units name among them (batch 104)", cases.length === 6028 && cases.every((c) => /^\d{4}-\d{2}-\d{2}$/.test(c.day)) && /Batch 104 added the 1739 cases that name one of the units/.test(SLICE.provenance), `${cases.length}`);
  const byName = (ticker: string) => epaEvents(cases, namesOf(ticker), {});
  check("  …rebuilt with the two-letter names ingest asks (batch 100, the audit of batches 94–99, finding 7): BP's and 3M's own cases are in it",
    byName("BP").length === 4 && eventsOn("MMM").length === 67 && /two letters or more as ingest asks/.test(SLICE.provenance),
    `BP ${byName("BP").length}, MMM ${eventsOn("MMM").length}`);

  const gm = byNumber.get("HQ-1996-0001");
  const cat = byNumber.get("HQ-1998-0303");
  const kodak = byNumber.get("02-1991-0208");
  check("GM's consent decree HQ-1996-0001: in court, lodged 1995-11-30, an $11,000,000 penalty under the Clean Air Act",
    gm?.court === true && gm.day === "1995-11-30" && gm.step === "lodged" && gm.penalty === "11000000" && gm.laws[0] === "CAA" &&
      caseTitle(gm) === "EPA consent decree: $11,000,000 civil penalty (Clean Air Act)" && gm.docket === "90-5-2-1-2011A", JSON.stringify(gm));
  check("  …Caterpillar's HQ-1998-0303 dated by its lodging, 1998-10-22, not its entry of 1999-07-01; $25,000,000",
    cat?.day === "1998-10-22" && cat.step === "lodged" && cat.penalty === "25000000", JSON.stringify(cat));
  check("  …and Kodak's 02-1991-0208 lodged 1995-03-10, $5,000,000", kodak?.day === "1995-03-10" && kodak.penalty === "5000000", JSON.stringify(kodak));
  check("an administrative case is dated by its final order, else its complaint; money is kept as digits, never a float",
    cases.filter((c) => !c.court).every((c) => c.step === "order" || c.step === "complaint") &&
      penaltyOf("5100.5") === "5100.50" && penaltyOf("0") === null && penaltyOf("") === null && penaltyOf("12,000") === null &&
      dollars("11000000") === "$11,000,000" && dollars("5100.50") === "$5,100.50" && penaltyOf("123456789012345") === "123456789012345");

  console.log("\nA defendant is the company by the caption rule, with the case file's guards");
  check("\"GENERAL MOTORS CORPORATION\" is GM, \"Caterpillar Inc.\" Caterpillar, \"EASTMAN KODAK CO\" Kodak",
    epaParty("GENERAL MOTORS CORPORATION", namesOf("GM")(1995)) !== null && epaParty("CATERPILLAR, INC.", namesOf("CAT")(1998)) !== null &&
      epaParty("EASTMAN KODAK CO", namesOf("KODK")(1995)) !== null);
  const light = cases.filter((c) => c.defendants.some((d) => /(?:POWER|WATER|FUEL) AND LIGHT/i.test(d)));
  check("one name joined by \"and\" is one name: no \"… Power and Light Company\" is Light S.A.'s, among the slice's",
    light.length >= 40 && eventsOn("LGSXY").length === 0 && epaParty("PENNSYLVANIA POWER AND LIGHT COMPANY", namesOf("LGSXY")(2000)) === null,
    `${light.length} cases; ${eventsOn("LGSXY").length} on LGSXY`);
  check("  …while two parties an \"and\" parts, each with its legal word, are still each read",
    epaParty("ACME WIDGETS, INC. AND GENERAL MOTORS CORPORATION", namesOf("GM")(1995)) !== null);
  check("a person written surname first is no company: \"RETHERFORD, DANA\" is not Dana's, \"FAYE, BALL\" not Ball's",
    epaParty("RETHERFORD, DANA", namesOf("DAN")(2000)) === null && epaParty("FAYE, BALL", namesOf("BALL")(2000)) === null &&
      !eventsOn("DAN").some((e) => /RETHERFORD/i.test(e.description ?? "")) && cases.some((c) => c.defendants.includes("RETHERFORD, DANA")));
  check("National Steel's cases are not Companhia Siderúrgica Nacional's (SID)", eventsOn("SID").length === 0 && cases.some((c) => c.defendants.some((d) => /^NATIONAL STEEL/i.test(d))));

  console.log("\nOn the company's page");
  check("GM's 1995 decree names General Motors, but today's GM listed 2010-11-18: the old GM's cases are not its, as every rule reads",
    has(eventsOn("GM"), "HQ-1996-0001") && !has(eventsOn("GM", FIRST_PRICES.GM), "HQ-1996-0001") && eventsOn("GM", FIRST_PRICES.GM).length > 0);
  const catDay = eventsOn("CAT", FIRST_PRICES.CAT).find((e) => has([e], "HQ-1998-0303"));
  check("Caterpillar's lands on CAT on 1998-10-22, titled with its penalty, linked to EPA's case report",
    catDay?.date === "1998-10-22" && /^EPA consent decree: \$25,000,000 civil penalty/.test(catDay.title) && catDay.url === caseReportUrl("HQ-1998-0303") &&
      catDay.sourceKey === "epa_cases" && catDay.source === "EPA" && catDay.type === "regulation", JSON.stringify(catDay));
  check("  …and Kodak's of 1995 is kept off KODK by its first price, 2013-09-23, the stock that came out of its restructuring",
    has(eventsOn("KODK"), "02-1991-0208") && !has(eventsOn("KODK", FIRST_PRICES.KODK), "02-1991-0208"));
  check("Southland Corporation's of 1985 is refused by SLND's first price, 2021-12-23",
    eventsOn("SLND").some((e) => e.date.startsWith("1985")) && !eventsOn("SLND", FIRST_PRICES.SLND).some((e) => e.date < FIRST_PRICES.SLND));
  const big = cases.find((c) => c.number === "05-1982-0017");
  const bigOnGm = eventsOn("GM").find((e) => has([e], "05-1982-0017"));
  check("a Superfund settlement of hundreds of parties goes on each listed party's page, and says how many",
    !!big && big.defendants.length >= 100 && /with \d{3} parties/.test(caseTitle(big)) && !!bigOnGm && eventsOn("DAN").some((e) => has([e], "05-1982-0017")),
    `${big?.defendants.length} defendants; ${bigOnGm?.title}`);
  const days = new Map<string, number>();
  for (const e of eventsOn("DAN").filter((x) => !/:no-penalty$/.test(x.dedupBasis ?? ""))) days.set(e.date, (days.get(e.date) ?? 0) + 1);
  const dana2008 = eventsOn("DAN").find((e) => e.date === "2008-06-18");
  check("a company's cases of one day make one event, the largest penalty's title, every case number kept",
    [...days.values()].every((k) => k === 1) && !!dana2008 && /and 3 more cases that day$/.test(dana2008.title) && (dana2008.externalId ?? "").split(",").length === 4,
    dana2008?.title);
  const grouped = cases.filter((c) => !c.court && c.penalty === null);
  const olin = eventsOn("OLN").find((e) => e.precision === "month");
  check("orders with no penalty are grouped a row a month where a month holds two or more, a lone one keeps its day",
    !!olin && /^EPA: \d+ orders or complaints with no penalty, [A-Z][a-z]+ \d{4}/.test(olin.title) && olin.date.endsWith("-01") &&
      eventsOn("OLN").filter((e) => e.precision !== "month").some((e) => grouped.some((c) => has([e], c.number))), olin?.title);
  check("  …one event per company and day, or month, keyed by the company", eventsOn("GE").every((e) => /^epa:40545@\d{4}-\d{2}(?:-\d{2}|:no-penalty)$/.test(e.dedupBasis ?? "")));
  // batch 100, the audit's finding 2: a month read when it held one case with no penalty, and again
  // when it held two, leaves one row, where the first read's row under its day stayed beside the month's
  const olnMonth = [...new Set(grouped.filter((c) => eventsOn("OLN").some((e) => e.precision === "month" && has([e], c.number))).map((c) => c.day.slice(0, 7)))][0];
  const monthCases = grouped.filter((c) => c.day.slice(0, 7) === olnMonth && eventsOn("OLN").some((e) => has([e], c.number))).sort((a, b) => a.day.localeCompare(b.day));
  const firstRead = epaEvents(cases.filter((c) => !monthCases.slice(1).includes(c)), namesOf("OLN"), { cik: rowOf("OLN")[0] });
  const secondRead = epaEvents(cases, namesOf("OLN"), { cik: rowOf("OLN")[0] });
  const kept = new Set(secondRead.map((e) => e.dedupBasis));
  const lone = firstRead.find((e) => has([e], monthCases[0].number));
  check("a month's cases with no penalty keep the month's key from the first: read with one, then two, every row the first read stored is one the second updates",
    monthCases.length >= 2 && firstRead.every((e) => kept.has(e.dedupBasis)) && lone?.dedupBasis === `epa:${rowOf("OLN")[0]}@${olnMonth}:no-penalty` && lone.date === monthCases[0].day && lone.precision !== "month",
    `${olnMonth}: ${monthCases.length} cases; lone ${lone?.dedupBasis} ${lone?.date}`);
  check("  …and a row stored under the old day key moves onto the month's, unless the company has its own row that day",
    secondRead.filter((e) => /:no-penalty$/.test(e.dedupBasis ?? "")).every((e) => {
      const first = cases.filter((c) => (e.externalId ?? "").split(",").includes(c.number)).map((c) => c.day).sort()[0];
      const ownThatDay = secondRead.some((x) => x.dedupBasis === `epa:${rowOf("OLN")[0]}@${first}`);
      return ownThatDay ? e.legacyDedupBasis === undefined : e.legacyDedupBasis === `epa:${rowOf("OLN")[0]}@${first}`;
    }));
  const sunoco = cases.find((c) => c.day === "2013-04-18" && c.defendants.some((d) => /^SUNOCO,?\s+INC\b/i.test(d)));
  const sunFrom = eventsOn("SUN", FIRST_PRICES.SUN);
  check("Sunoco, Inc.'s cases are not Sunoco LP's (finding 3): the Superfund order of 2013-04-18, 253 parties, is refused by name; from its first price Sunoco LP keeps its own five",
    !!sunoco && !has(eventsOn("SUN"), sunoco.number) && has(epaEvents(cases, namesOf("SUN"), {}), sunoco.number) &&
      sunFrom.length === 5 && sunFrom.every((e) => cases.filter((c) => has([e], c.number)).some((c) => c.defendants.some((d) => /^SUNOCO(?:,?\s+(?:LP|LLC))?$|^SUNOCO LP\b/i.test(d)))) &&
      NOT_THE_COMPANY[1552275]?.[0].defendant.test("SUNOCO INCORPORATED (R & M)") && NOT_THE_COMPANY[1552275]?.[0].defendant.test("Sunoco, Inc. (R&M)"),
    `${sunoco?.number} ${sunoco?.defendants.length} parties; SUN ${eventsOn("SUN").length}, from its first price ${sunFrom.length}`);
  // batch 107, the 2026-11-07 audit's finding 4: a typed trailing semicolon is no brand listed with its dealer
  const starLake = cases.find((c) => c.number === "06-2016-2953");
  const cvxSept = eventsOn("CVX").filter((e) => e.date.slice(0, 7) === "2016-09");
  const cvxSeptMonth = cvxSept.find((e) => e.precision === "month");
  check("Texaco's Star Lake Canal order of 2016-09-26 (\"Texaco Inc;\", 10 parties) is Chevron's, Texaco being its from 2001-10-09; it joins Chevron's other no-penalty order that month (04-2016-3757) in one row",
    !!starLake && starLake.defendants.some((d) => /^Texaco Inc;\s*$/i.test(d)) && has(eventsOn("CVX"), "06-2016-2953") && cvxSept.length === 2 &&
      cvxSeptMonth?.externalId === "04-2016-3757,06-2016-2953" && cvxSept.some((e) => e.precision !== "month" && e.externalId === "04-2016-9012"),
    `${starLake?.defendants.join(" | ")} · ${cvxSept.map((e) => `${e.date} ${e.precision} ${e.externalId}`).join("; ")}`);
  check("  …while a brand listed with the business trading under it is still no unit of the brand's",
    BRANDED_SITE.test("BP AMOCO; PARTY PLACE") && BRANDED_SITE.test("BP AMOCO;PARTY PLACE") && !BRANDED_SITE.test("Texaco Inc;") && !BRANDED_SITE.test("Texaco Inc; "));
  // batch 108, the 2026-11-07 audit's question 3: the old Waste Management's cases are not WM's
  const oldWm = ["01-1994-0020", "04-1995-0519", "10-1997-0149", "04-1989-0133", "04-1998-0171", "04-1996-0208"];
  const wmRows = eventsOn("WM");
  const wmAfter = wmRows.filter((e) => e.date >= "1998-07-16");
  check("the old Waste Management's six cases of 1994–1998 are not WM's, whose record was USA Waste Services until it bought the company and took its name on 1998-07-16",
    oldWm.every((n) => cases.some((c) => c.number === n)) && oldWm.every((n) => !has(wmRows, n)) && wmRows.every((e) => e.date >= "1998-07-16"),
    `${oldWm.filter((n) => has(wmRows, n)).join(", ") || "none on WM"}; WM's first row ${wmRows.map((e) => e.date).sort()[0]}`);
  check("  …while its own cases from that day are, by its name and its state companies'",
    wmAfter.length > 20 && cases.some((c) => c.day >= "1998-07-16" && c.defendants.some((d) => /^WASTE MANAGEMENT,?\s+INC\b/i.test(d)) && has(wmRows, c.number)), String(wmAfter.length));
  check("a case title never runs past two laws", cases.every((c) => (caseTitle(c).match(/\(/g) ?? []).length <= 3) && MANY_PARTIES === 10);

  console.log("\nEvery listed company against the slice");
  const alnum = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  const keysOf = cases.map((c) => c.defendants.map(alnum).join("|"));
  // one pass over every defendant at once tells which names appear at all, so only those are matched case by case
  const everyKey = keysOf.join("#");
  const out = new Map<string, TimelineEvent[]>();
  const seen = new Set<number>();
  for (const [cik, ticker, title] of companies) {
    if (seen.has(cik) || isNotesRecord(cik)) continue;
    seen.add(cik);
    const own = dojPossessive(title, possessiveNameFor(cik));
    const namesIn = (year: number) => [...companyNames(title, namesForYear(year, newsNamesFor(cik), [])), ...(own ? [own] : []), withoutTag(title)];
    // …and its units' names, as its ingest asks them (`unitKeysOf`, batch 101)
    const keys = [...new Set([...namesIn(2020).map(alnum).filter((k) => k.length >= 2), ...unitKeysOf(cik)])].filter((k) => everyKey.includes(k));
    if (!keys.length) continue;
    const held = cases.filter((_, i) => keys.some((k) => keysOf[i].includes(k)));
    const ev = held.length ? epaEvents(held, namesIn, { cik }) : [];
    if (ev.length) out.set(ticker, ev);
  }
  const total = [...out.values()].reduce((n, v) => n + v.length, 0);
  const before2017 = [...out.values()].flat().filter((e) => e.date < "2017").length;
  const own = [...out.values()].flat().filter((e) => e.precision !== "month").length;
  check("before any first price: 7,427 rows on 670 companies, 6,367 before 2017; 7,025 of them a case's own day (7,436, 6,376 and 7,034 before batch 108 took the old Waste Management's nine off WM; 7,035 before batch 107's Star Lake order joined Chevron's September 2016; 5,994 on 667 before batch 104's units, every one of whose cases is still on its page; 5,984 before batch 101's Sunoco, Inc.; 6,001 on 665 before batch 100)",
    total === 7427 && out.size === 670 && before2017 === 6367 && own === 7025, `${total} on ${out.size}; ${before2017} before 2017; ${own} own`);
  const top = [...out].sort((a, b) => b[1].length - a[1].length).slice(0, 5).map(([t, v]) => `${t} ${v.length}`).join(", ");
  check("  …most on GE 284, ExxonMobil 273, Chevron 258, BP 230, GM 222 (before the units: GE 284, GM 222, Ford 165, ExxonMobil 163, FMC 135)", top === "GE 284, XOM 273, CVX 258, BP 230, GM 222", top);

  console.log("\nRead once a month, and kept");
  const db: FakeDb = { cases: new Map(), reads: null, listed: "1962-01-02" };
  const asked: (string | null)[] = [];
  const serve = (modified: string) => async (since: string | null): Promise<CaseFileAnswer> => {
    asked.push(since);
    return since === modified ? { cases: [], modified, outcome: "unchanged", httpStatus: 304 } : { cases, modified, outcome: "ok", httpStatus: 200 };
  };
  const first = await walkEpaCases(fakeDb(db), { budget: { left: 1 }, fetchFile: serve("Sat, 31 Oct 2026 16:07:24 GMT") });
  check("the first run reads the file and keeps every case", first.read === "stored" && first.cases === 6028 && db.cases.size === 6028 && db.reads?.modified === "Sat, 31 Oct 2026 16:07:24 GMT", JSON.stringify(first));
  const again = await walkEpaCases(fakeDb(db), { budget: { left: 1 }, fetchFile: serve("Sat, 31 Oct 2026 16:07:24 GMT") });
  check("  …a run within the month asks nothing", !again.due && asked.length === 1);
  db.reads = { ...(db.reads as NonNullable<FakeDb["reads"]>), ageDays: 31 };
  const same = await walkEpaCases(fakeDb(db), { budget: { left: 1 }, fetchFile: serve("Sat, 31 Oct 2026 16:07:24 GMT") });
  check("  …a month on, a copy EPA has not changed is not read again: it is asked with its Last-Modified",
    same.read === "unchanged" && asked[1] === "Sat, 31 Oct 2026 16:07:24 GMT" && db.reads?.ageDays === 0 && db.cases.size === 6028);
  db.reads = { ...(db.reads as NonNullable<FakeDb["reads"]>), ageDays: 31 };
  const spent = await walkEpaCases(fakeDb(db), { budget: { left: 0 }, fetchFile: serve("x") });
  const refused = await walkEpaCases(fakeDb(db), { budget: { left: 1 }, fetchFile: async () => ({ cases: [], modified: null, outcome: "throttled", httpStatus: 429 }) });
  check("  …one read a process, and a refusal keeps the cases kept and is asked again", spent.stopped === "this run's read is spent" && refused.failure?.httpStatus === 429 && db.cases.size === 6028 && db.reads?.ageDays === 31);
  const fetched = await withFetch(async () => new Response(new Blob([makeZip(CASE_TABLES.map((t) => [t, SLICE.tables[t], true] as [string, string, boolean])) as Uint8Array<ArrayBuffer>]), { status: 200, headers: { "last-modified": "Sun, 01 Nov 2026 00:00:00 GMT" } }), () => fetchCaseFile(null));
  check("a file that reads as a few thousand cases is refused as broken, not stored: EPA's holds 137,108", fetched.outcome === "error" && /only 6028 cases read/.test(fetched.detail ?? ""), JSON.stringify({ ...fetched, cases: fetched.cases.length }));
  const unchanged = await withFetch(async () => new Response(null, { status: 304, headers: { "last-modified": "Sat, 31 Oct 2026 16:07:24 GMT" } }), () => fetchCaseFile("Sat, 31 Oct 2026 16:07:24 GMT"));
  check("  …and EPA's \"not modified\" is no read", unchanged.outcome === "unchanged");

  const plan = (t: string) => {
    const [cik, , name] = rowOf(t);
    return { edgarName: name, alsoKnownAs: newsNamesFor(cik), possessive: dojPossessive(name, possessiveNameFor(cik)), cik };
  };
  const noWalk: EpaWalk = { due: false, cases: 0 };
  const catPage = await epaCasesFor(fakeDb({ ...db, listed: FIRST_PRICES.CAT }), 1, plan("CAT"), noWalk);
  const gmPage = await epaCasesFor(fakeDb({ ...db, listed: FIRST_PRICES.GM }), 1, plan("GM"), noWalk);
  check("a company's ingest finds its kept cases by its names and keeps them from its first price",
    catPage.outcome === "ok" && catPage.events.length === eventsOn("CAT", FIRST_PRICES.CAT).length && has(catPage.events, "HQ-1998-0303") &&
      gmPage.events.length === eventsOn("GM", FIRST_PRICES.GM).length && gmPage.events.every((e) => e.date >= FIRST_PRICES.GM),
    `${catPage.events.length} on CAT; ${gmPage.events.length} on GM`);
  const none = await epaCasesFor(fakeDb({ ...db, listed: null }), 1, plan("CAT"), noWalk);
  const fund = await epaCasesFor(fakeDb(db), 1, { ...plan("CAT"), fundSeries: true }, noWalk);
  const failed = await epaCasesFor(fakeDb({ ...db, listed: FIRST_PRICES.CAT }), 1, plan("CAT"), { due: true, cases: 0, failure: { outcome: "throttled", httpStatus: 429 } });
  check("  …asks again while it has no prices, takes none for a fund's series, and a refused read is the run's failure with the kept cases still given",
    none.outcome === "error" && fund.events.length === 0 && failed.outcome === "throttled" && failed.events.length === catPage.events.length);
  // the owner's call of 2026-11-06 (batch 101): Sunoco, Inc. is Energy Transfer's from 2012-10-05
  const sunocoInc = cases.filter((c) => c.defendants.some((d) => /^SUNOCO,?\s+(?:INC|INCORPORATED)\b/i.test(d)));
  const etPage = await epaCasesFor(fakeDb({ ...db, listed: "2012-01-03" }), 1, plan("ET"), noWalk); // a stand-in first price before the purchase
  const onEt = sunocoInc.filter((c) => has(etPage.events, c.number));
  check("Sunoco, Inc.'s cases are Energy Transfer's from the day it bought Sunoco, 2012-10-05: ten, from 2012-10-16 to 2020-01-13, the Superfund order of 2013-04-18 among them, asked under Sunoco's name",
    onEt.length === 10 && onEt.every((c) => c.day >= "2012-10-05") && has(etPage.events, "04-2013-3751") && !has(etPage.events, "02-2012-7305") &&
      UNITS[rowOf("ET")[0]]?.[0].from === "2012-10-05" && !has(eventsOn("SUN"), "04-2013-3751") && sunocoInc.some((c) => c.day === "2012-09-27"),
    `${onEt.length} on ET: ${onEt.map((c) => c.day).join(",")}`);

  // the 2026-11-06 proposal 2, approved by the owner with Shell from 2005-07-20 (batch 104)
  console.log("\nThe companies' own operating units, each on its owner's page on its days (batch 104)");
  const unitsOf = (t: string) => UNITS[rowOf(t)[0]] ?? [];
  const cvx = eventsOn("CVX");
  check("Chevron U.S.A.'s court case of 1995-12-08 (02-1992-0107, $155,000) is Chevron's; Texaco's from 2001-10-09 are, its decree of 1989 is not; Chevron Phillips Chemical's alone (02-2009-2006) no page's",
    has(cvx, "02-1992-0107") && has(cvx, "02-1998-0193") && !has(cvx, "01-1988-0016") && !has(cvx, "02-2009-2006") && has(cvx, "04-2010-3768"),
    `${cvx.length}`);
  const shel = eventsOn("SHEL");
  check("Shell Oil Company's $775,000 decree of 1996-03-27 (06-1991-0011) is on no page: Shell's units count from 2005-07-20, the owner's call; its decree of 2005-08-22 (08-2000-0037) is Shell's",
    !has(shel, "06-1991-0011") && has(shel, "08-2000-0037") && unitsOf("SHEL").every((u) => u.from === "2005-07-20") && !has(epaEvents(cases, namesOf("SHEL"), {}), "06-1991-0011"),
    `${shel.length}`);
  const bp = eventsOn("BP");
  check("Atlantic Richfield's case of 2011-12-22 (03-1997-0379) is BP's, its case of 1997-05-01 (08-1996-0057) no page's; Amoco Oil's of 1984-10-19 (07-1980-0011) no page's; ARCO Chemical, Lyondell's from 1998, never BP's",
    has(bp, "03-1997-0379") && !has(bp, "08-1996-0057") && !has(bp, "07-1980-0011") && !has(bp, "06-1999-0323") && !has(bp, "06-1991-0172"),
    `${bp.length}`);
  check("  …a bare \"ARCO\" is no unit of BP's, nor Arco, Idaho's airport; nor a station, a numbered site or a brand listed with its dealer",
    ["ARCO", "ARCO/BUTTE COUNTY AIRPORT", "Arco / Butte County Airport", "ARCO CHEMICAL COMPANY", "ARCO ALASKA, INC."].every((d) => !unitsOf("BP").some((u) => u.defendant.test(d))) &&
      ["AMOCO OIL CO. (#0234)", "BP OIL COMPANY (#06015)", "AMOCO OIL SS #7493", "BP AMOCO; PARTY PLACE", "MOBIL OIL R/S #12634", "UNOCAL (SERVICE STATIONS)", "SHELL SERVICE STATION #000329", "ARCO AM / PM"].every((d) => BRANDED_SITE.test(d)) &&
      !unitsOf("SHEL").some((u) => u.defendant.test("SHELL SERVICE STATION #000329")) && unitsOf("BP").some((u) => u.branded && u.defendant.test("AMOCO OIL CO. (#0234)")));
  check("Occidental Chemical's case of 1998-02-12 (06-1996-0541) is Occidental's; Union Pacific Railroad's of 2003-07-17 (08-2002-0155) Union Pacific's",
    has(eventsOn("OXY"), "06-1996-0541") && has(eventsOn("UNP"), "08-2002-0155"));
  check("Murphy Oil USA's $5,500,000 decree of 2002-01-24 (05-1998-0719) is Murphy Oil's, not Murphy USA's, which owns the unit from 2013-08-30",
    has(eventsOn("MUR"), "05-1998-0719") && !has(eventsOn("MUSA"), "05-1998-0719") && unitsOf("MUSA")[0]?.from === "2013-08-30" && unitsOf("MUR")[0]?.to === "2013-08-29");
  const xom = eventsOn("XOM");
  check("Mobil's cases are ExxonMobil's from the merger of 1999-11-30 (05-1998-0604, 2010), not before (01-1993-0013, 1993)",
    has(xom, "05-1998-0604") && !has(xom, "01-1993-0013") && unitsOf("XOM").find((u) => u.unit === "Mobil")?.from === "1999-11-30", `${xom.length}`);
  check("Union Carbide's cases are Dow Inc.'s from 2019-04-01 (06-2019-3369), not before (02-1993-0149)",
    has(eventsOn("DOW"), "06-2019-3369") && !has(eventsOn("DOW"), "02-1993-0149"));
  check("Northrop Grumman Ship Systems' decree of 2016-06-30 (02-2006-0015) is Huntington Ingalls's, spun off 2011-03-31, not Northrop's",
    has(eventsOn("HII"), "02-2006-0015") && !has(eventsOn("NOC"), "02-2006-0015"));
  check("Verizon Information Services' orders of 2002 are Verizon's, before Idearc's spin-off of 2006",
    has(eventsOn("VZ"), "06-2002-4356") && unitsOf("VZ").find((u) => /Information/.test(u.unit))?.to === "2006-11-16");
  check("joint ventures are no owner's unit: Nucor-Yamato, Chevron Phillips Chemical",
    !unitsOf("NUE").some((u) => u.defendant.test("NUCOR-YAMATO STEEL COMPANY")) && !unitsOf("CVX").some((u) => u.defendant.test("CHEVRON PHILLIPS CHEMICAL COMPANY LP")) &&
      unitsOf("NUE").some((u) => u.defendant.test("NUCOR STEEL LOUISIANA, LLC")));
  const bpPage = await epaCasesFor(fakeDb({ ...db, listed: "1962-01-02" }), 1, plan("BP"), noWalk);
  check("the company step asks the stored cases by its units' names too: Atlantic Richfield's order of 2000-08-18 (09-2000-0286) reaches BP's page",
    unitKeysOf(rowOf("BP")[0]).includes("atlanticrichfield") && has(bpPage.events, "09-2000-0286") && bpPage.events.length === bp.length, `${bpPage.events.length} vs ${bp.length}`);

  console.log("\nRegistered, licensed, wired");
  const src = SOURCES.find((s) => s.key === "epa_cases");
  check("the source is registered as public domain, cleared for commercial use, with the day it was read",
    src?.id === 31 && src.license === "public domain" && src.commercialOk && src.reviewedOn === "2026-11-05" && src.attribution === "U.S. Environmental Protection Agency", JSON.stringify(src));
  const lib = read("lib/epaCases.ts");
  check("  …the build quotes both of EPA's texts, the data licence and the disclaimers' note on documents",
    /all data produced by the U\.S EPA is by default in the\s+\* public domain/.test(lib) && /Commercial use of the documents\s+\* available from the EPA websites may be protected/.test(lib) && CASE_FILE_URL === "https://echo.epa.gov/files/echodownloads/case_downloads.zip");
  check("  …asked once a day per company, quota noted, a company source, scored without the model",
    SOURCE_TTL_MINUTES.epa_cases === 1440 && QUOTAS.epa_cases.perDay === null && (COMPANY_SOURCES as readonly string[]).includes("epa_cases") &&
      deterministicScore({ eventId: 0, kind: "regulation", title: "EPA final order", sourceKey: "epa_cases" }, { kind: "company", displayName: "Caterpillar Inc.", ticker: "CAT" }, ["caterpillar"])?.score === 0.95);
  const ingest = read("scripts/ingest.ts");
  check("  …company ingest walks the file, then keeps the company's cases", /await run\("epa_cases", [^\n]+\n\s*const walked = await walkEpaCases\(client\);[\s\S]{0,400}return epaCasesFor\(client, subjectId, \{[^}]*cik: company\.cik, fundSeries \}, walked\);/.test(ingest));
  check("  …into tables of its own (db/037)", /CREATE TABLE IF NOT EXISTS epa_cases \(\s*case_number\s+text PRIMARY KEY/.test(read("db/037_epa_cases.sql")) && /penalty\s+numeric\(16, 2\)/.test(read("db/037_epa_cases.sql")));
  check("  …and EPA is credited where the other sources are",
    /civil enforcement cases from the U\.S\. Environmental Protection Agency/.test(read("app/layout.tsx").replace(/\s+/g, " ")) &&
      /civil enforcement cases from the U\.S\. Environmental Protection Agency/.test(read("app/legal/terms/page.tsx").replace(/\s+/g, " ")) &&
      /\| U\.S\. Environmental Protection Agency \|/.test(read("README.md")));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  process.exit(fail ? 1 : 0);
}

/** A zip of the given files, stored or deflated, as the reader expects one. */
function makeZip(files: [name: string, text: string, deflate: boolean][]): Uint8Array {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text, deflate] of files) {
    const raw = Buffer.from(text);
    const data = deflate ? deflateRawSync(raw) : raw;
    const n = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(n.length, 26);
    locals.push(local, n, data);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(deflate ? 8 : 0, 10);
    dir.writeUInt32LE(data.length, 20);
    dir.writeUInt32LE(raw.length, 24);
    dir.writeUInt16LE(n.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, n);
    offset += 30 + n.length + data.length;
  }
  const dirBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dirBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, dirBytes, end]));
}

async function withFetch<T>(stand: () => Promise<Response>, fn: () => Promise<T>): Promise<T> {
  const real = globalThis.fetch;
  globalThis.fetch = stand as unknown as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = real;
  }
}

interface FakeDb {
  cases: Map<string, EpaCase & { keys: string }>;
  reads: { modified: string | null; cases: number; ageDays: number } | null;
  listed: string | null;
}
function fakeDb(db: FakeDb): PoolClient {
  return {
    query: async (sql: string, params: unknown[] = []) => {
      const s = sql.trim();
      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(s)) return { rows: [] };
      if (/^SELECT modified, read_at < now\(\) - make_interval\(days => 30\) AS stale FROM epa_reads WHERE id = 1$/.test(s)) {
        return { rows: db.reads ? [{ modified: db.reads.modified, stale: db.reads.ageDays > 30 }] : [] };
      }
      if (/^UPDATE epa_reads SET read_at = now\(\) WHERE id = 1$/.test(s)) {
        if (db.reads) db.reads.ageDays = 0;
        return { rows: [] };
      }
      if (/^DELETE FROM epa_cases$/.test(s)) {
        db.cases.clear();
        return { rows: [] };
      }
      if (/^INSERT INTO epa_cases \(case_number, name, court, filed_on, step, penalty, laws, defendants, docket, name_keys\)/.test(s)) {
        const [n, nm, ct, d, st, p, l, df, dk, k] = params as [string[], string[], boolean[], string[], EpaCase["step"][], (string | null)[], string[], string[], (string | null)[], string[]];
        n.forEach((number, i) =>
          db.cases.set(number, { number, name: nm[i], court: ct[i], day: d[i], step: st[i], penalty: p[i], laws: l[i] ? l[i].split("|") : [], defendants: df[i] ? df[i].split("|") : [], docket: dk[i], keys: k[i] }),
        );
        return { rows: [] };
      }
      if (/^INSERT INTO epa_reads \(id, modified, cases\)/.test(s)) {
        const [modified, count] = params as [string | null, number];
        db.reads = { modified, cases: count, ageDays: 0 };
        return { rows: [] };
      }
      if (/^SELECT case_number, name, court, filed_on::text AS day, step, penalty::text AS penalty, laws, defendants, docket\s+FROM epa_cases WHERE filed_on >= \$1::date AND name_keys LIKE ANY \(\$2::text\[\]\) ORDER BY filed_on, case_number$/.test(s)) {
        const [from, patterns] = params as [string, string[]];
        const keys = patterns.map((p) => p.replace(/^%|%$/g, ""));
        const rows = [...db.cases.values()]
          .filter((c) => c.day >= from && keys.some((k) => c.keys.includes(k)))
          .sort((a, b) => a.day.localeCompare(b.day) || a.number.localeCompare(b.number))
          .map((c) => ({ case_number: c.number, name: c.name, court: c.court, day: c.day, step: c.step, penalty: c.penalty === null ? null : `${c.penalty}${c.penalty.includes(".") ? "" : ".00"}`, laws: c.laws, defendants: c.defendants, docket: c.docket }));
        return { rows };
      }
      if (/FROM prices/.test(s)) return { rows: [{ listed: db.listed }] };
      if (/FROM events e/.test(s)) return { rows: [] };
      throw new Error(`unexpected query: ${s.slice(0, 80)}`);
    },
  } as unknown as PoolClient;
}

main();
