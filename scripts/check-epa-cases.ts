import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deflateRawSync, gunzipSync } from "node:zlib";
import type { PoolClient } from "pg";
import tickerIndex from "../data/edgar-tickers.json";
import { dojPossessive } from "../lib/doj";
import { andSpellings, withoutTag } from "../lib/edgarName";
import { deterministicScore } from "../lib/enrich/relevance";
import { OWN_RECORD_FROM, ownPastLabelled } from "../lib/predecessors";
import {
  CASE_FILE_URL,
  CASE_TABLES,
  MANY_PARTIES,
  SETTLEMENT_TABLE,
  SUMMARY_CAP,
  addAmounts,
  readCaseFile,
  summaryOf,
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
import { TAKEN_NAMES, takenBefore } from "../lib/takenNames";

/**
 * The EPA's civil enforcement cases on the pages of the companies they charge (batch 95, the
 * 2026-11-05 proposal 1).
 *
 *   npm run check:epa-cases
 *
 * Replays a committed slice of EPA's case file of 2026-10-31 (scripts/fixtures/epa-cases-slice.json.gz):
 * every row of the four tables the adapter reads for the 8,285 cases whose defendants hold a
 * listed company's name, and the cases the guards are measured on; and, since batch 113, the
 * settlements table and the case table's work-ordered and summary columns for the same cases. Offline: the file's fetch and
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
const SLICE: { provenance: string; tables: Record<(typeof CASE_TABLES)[number] | typeof SETTLEMENT_TABLE, string> } = JSON.parse(gunzipSync(readFileSync(join(root, "scripts/fixtures/epa-cases-slice.json.gz"))).toString("utf8"));
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
  check("the slice holds the cases the replay reads, each with its day: 8,285, the 1,739 batch 104's units name, the 1,133 batch 114's add, the 5 batch 116's add and the 1,119 batch 120's add among them", cases.length === 8285 && /Batch 114 added every row of the five tables for the 1133 cases/.test(SLICE.provenance) && /Batch 116 added every row of the five tables for the 5 cases/.test(SLICE.provenance) && /Batch 120 added every row of the five tables for the 1119 cases/.test(SLICE.provenance) && cases.every((c) => /^\d{4}-\d{2}-\d{2}$/.test(c.day)) && /Batch 104 added the 1739 cases that name one of the units/.test(SLICE.provenance), `${cases.length}`);
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
    oldWm.every((n) => cases.some((c) => c.number === n)) && oldWm.every((n) => !has(wmRows, n)) && wmRows.every((e) => e.date >= "1998-07-16") &&
      TAKEN_NAMES[rowOf("WM")[0]]?.from === "1998-07-16" && !NOT_THE_COMPANY[rowOf("WM")[0]],
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
  // each page's cases and names, for replaying a rule before this one (batch 113)
  const inputs = new Map<string, { held: EpaCase[]; namesIn: (year: number) => string[]; cik: number }>();
  const seen = new Set<number>();
  for (const [cik, ticker, title] of companies) {
    if (seen.has(cik) || isNotesRecord(cik)) continue;
    seen.add(cik);
    const own = dojPossessive(title, possessiveNameFor(cik));
    const namesIn = (year: number) => [...companyNames(title, namesForYear(year, newsNamesFor(cik), [])), ...(own ? [own] : []), withoutTag(title)];
    // …and its units' names, as its ingest asks them (`unitKeysOf`, batch 101), and a name's "&" as "and" (batch 120)
    const keys = [...new Set([...namesIn(2020).flatMap(andSpellings).map(alnum).filter((k) => k.length >= 2), ...unitKeysOf(cik)])].filter((k) => everyKey.includes(k));
    if (!keys.length) continue;
    const held = cases.filter((_, i) => keys.some((k) => keysOf[i].includes(k)));
    const ev = held.length ? epaEvents(held, namesIn, { cik }) : [];
    if (ev.length) {
      out.set(ticker, ev);
      inputs.set(ticker, { held, namesIn, cik });
    }
  }
  const total = [...out.values()].reduce((n, v) => n + v.length, 0);
  const before2017 = [...out.values()].flat().filter((e) => e.date < "2017").length;
  const own = [...out.values()].flat().filter((e) => e.precision !== "month").length;
  // batch 111's legal-form spellings add one: "OLIN-CORPORATION", Olin's legal name spelled out, among
  // the Distler Brickyard settlement's 55 defendants of 1995-10-26
  // batch 113's settlement figures: a case of one settlement and no case total takes the settlement's
  // penalty, so 1,250 more rows give one and a no-penalty month's cases that all have one now each
  // have their own row (402 month rows become 277)
  // batch 114's utilities' operating companies add 419 rows on 31 companies, 13 of which had none
  // batch 120's 28 companies' units and the "and" spelling of "&" add 990 rows, 11 companies more
  check("before any first price: 8,889 rows on 690 companies, 7,526 before 2017; 8,561 of them a case's own day, which EPA's whole file gives too (7,899, 6,754 and 7,621 on 679 before batch 120's units of 28 more companies and its \"and\" for \"&\"; 7,954, 6,806 and 7,675 on 683 before batch 117's table of taken names took Ingersoll-Rand's 36 off IR, Linde AG's 9 off LIN, Spectrum Brands' 4 off SPB, Sunoco, Inc.'s 3 off SUN and one each off HOS, VTOL and FUN; 7,969, 6,821 and 7,688 on 684 before batch 116 took old AT&T's 13 off T, Consumers Power, Inc.'s 1 off CMS and Toro Corp.'s 1 off TORO; 7,964, 6,817 and 7,683 on 683 on batch 114's slice, which lacked 5 of the file's page cases; 7,545, 6,463 and 7,268 on 670 before batch 114's utilities; 7,428, 6,368 and 7,026 before batch 113's settlement figures; 7,427, 6,367 and 7,025 before batch 111's legal-form spellings; 7,436, 6,376 and 7,034 before batch 108 took the old Waste Management's nine off WM; 7,035 before batch 107's Star Lake order joined Chevron's September 2016; 5,994 on 667 before batch 104's units, every one of whose cases is still on its page; 5,984 before batch 101's Sunoco, Inc.; 6,001 on 665 before batch 100)",
    total === 8889 && out.size === 690 && before2017 === 7526 && own === 8561 && (out.get("OLN") ?? []).some((e) => e.date === "1995-10-26"), `${total} on ${out.size}; ${before2017} before 2017; ${own} own`);
  const top = [...out].sort((a, b) => b[1].length - a[1].length).slice(0, 5).map(([t, v]) => `${t} ${v.length}`).join(", ");
  check("  …most on ExxonMobil 288, GE 284, Chevron 269, BP 248, Honeywell 246 (GM's 225 fifth before batch 120 gave Honeywell AlliedSignal's and old Honeywell's companies; GE 284, XOM 273, CVX 258, BP 230, GM 222 before batch 113; before the units: GE 284, GM 222, Ford 165, ExxonMobil 163, FMC 135)",
    top === "XOM 288, GE 284, CVX 269, BP 248, HON 246", top);

  console.log("\nEPA's own figures: the settlement's penalty, the work ordered, EPA's summary (batch 113, the 2026-11-07 proposal 1)");
  const rows = [...out].flatMap(([t, evs]) => evs.map((e) => ({ t, e })));
  const rowOn = (t: string, d: string) => out.get(t)?.find((e) => e.date === d);
  const aep = rowOn("AEP", "2007-10-09");
  check("AEP's 2007 decree, a case total of none, gives both cases' settlement penalties and the work each orders",
    !!aep && aep.title === "EPA consent decree: $6,225,000 civil penalty (Clean Air Act), and 1 more case that day" &&
      /\(case 03-1999-0388\), with 5 other defendants: \$6,225,000 civil penalty; work ordered \$1,923,940,000, EPA's estimate, among 6 parties/.test(aep.description ?? "") &&
      /\(case 04-1999-9000\): \$750,000 civil penalty; work ordered \$231,800,000, EPA's estimate\./.test(aep.description ?? ""),
    aep?.description?.slice(0, 400));
  const cummins = rowOn("CMI", "2024-01-10");
  check("  …Cummins's diesel decree of 2024, whose row gave no penalty, gives its $1,675,000,000: federal $1,478,000,000 and state $197,000,000",
    cummins?.title === "EPA consent decree: $1,675,000,000 civil penalty (Clean Air Act)" && byNumber.get("HQ-2020-0001")?.settled === true && /work ordered \$326,000,000/.test(cummins.description ?? ""),
    cummins?.title);
  const deepwater = byNumber.get("04-2010-9036");
  const bpSpill = rowOn("BP", "2015-11-30");
  check("a case of several settlements and no total keeps no penalty: Deepwater Horizon's four (MOEX, Transocean, BP and Anadarko) are not added on one row",
    !!deepwater && deepwater.penalty === null && !deepwater.settled && deepwater.workOrdered === null && !!bpSpill && !/civil penalty/.test(bpSpill.title), bpSpill?.title);
  const omega = rowOn("CVX", "2010-07-16");
  check("  …the work a many-party settlement orders is the whole settlement's, and says among how many: Omega Chemical's 271",
    /work ordered \$5,600,000, EPA's estimate, among 271 parties/.test(omega?.description ?? "") &&
      rows.filter(({ e }) => /work ordered/.test(e.description ?? "")).every(({ e }) => !/with \d+ other defendants?: (?:[^;]*; )?work ordered [^;.]*EPA's estimate(?!, among)/.test(e.description ?? "")),
    omega?.description?.slice(0, 200));
  check("no month of orders \"with no penalty\" holds a case EPA's settlement gives a penalty",
    rows.filter(({ e }) => e.precision === "month").every(({ e }) => (e.externalId ?? "").split(",").every((n) => byNumber.get(n)?.penalty === null)) &&
      rows.filter(({ e }) => e.precision === "month").length === 328, `${rows.filter(({ e }) => e.precision === "month").length} month rows (278 before batch 120)`);
  const shown = rows.filter(({ e }) => /civil penalty/.test(e.title));
  // on batch 113's slice: 2,125 rows, 1,765 before 2017, 1,250 and 890 more than before it; batch 114's units add the rest
  check("2,595 rows give a penalty, 2,118 of them before 2017 (2,261 and 1,879 before batch 120's units and spelling; 2,271 and 1,888 before batch 117's taken names; 2,272 and 1,890 before batch 116's AT&T and Consumers Power, Inc.); none from 2017 on gave one before batch 113, since EPA's case totals stop and its settlements go on",
    shown.length === 2595 && shown.filter(({ e }) => e.date < "2017").length === 2118, `${shown.length}, ${shown.filter(({ e }) => e.date < "2017").length} before 2017`);
  check("  …3,385 rows name the work ordered, 2,813 before 2017; 7,598 carry EPA's summary, 6,316 before 2017 (2,942, 2,469, 6,707 and 5,634 before batch 120's units and spelling; 2,963, 2,489, 6,750 and 5,675 before batch 117's taken names; 2,968, 2,495, 6,785 and 5,703 before batch 116 dropped placeholders and old AT&T's rows; 2,805, 2,363, 6,417 and 5,395 on batch 113's slice)",
    rows.filter(({ e }) => /work ordered/.test(e.description ?? "")).length === 3385 && rows.filter(({ e }) => /work ordered/.test(e.description ?? "") && e.date < "2017").length === 2813 &&
      rows.filter(({ e }) => /EPA's summary/.test(e.description ?? "")).length === 7598 && rows.filter(({ e }) => /EPA's summary/.test(e.description ?? "") && e.date < "2017").length === 6316,
    `${rows.filter(({ e }) => /work ordered/.test(e.description ?? "")).length} work, ${rows.filter(({ e }) => /work ordered/.test(e.description ?? "") && e.date < "2017").length} before 2017; ${rows.filter(({ e }) => /EPA's summary/.test(e.description ?? "")).length} summaries, ${rows.filter(({ e }) => /EPA's summary/.test(e.description ?? "") && e.date < "2017").length} before 2017`);
  // the rule before batch 113: a penalty was the case total alone
  const before113 = (c: EpaCase): EpaCase => (c.settled ? { ...c, penalty: null, settled: false } : c);
  let taken = 0;
  const lost: string[] = [];
  for (const [t, evs] of out) {
    const { held, namesIn, cik } = inputs.get(t)!;
    const keys = new Set(evs.map((e) => e.dedupBasis));
    const legacy = new Set(evs.map((e) => e.legacyDedupBasis).filter(Boolean));
    const was = epaEvents(held.map(before113), namesIn, { cik });
    for (const e of was) {
      if (keys.has(e.dedupBasis)) continue;
      if (legacy.has(e.dedupBasis)) taken++;
      else lost.push(`${t} ${e.dedupBasis}`);
    }
  }
  check("every row the rule before kept under a month's key and this one does not moves onto the first own row of its cases: 1,195, none lost, so a row keeps its history (1,001 before batch 120's units and spelling, 1,008 before batch 117's taken names, 1,007 on batch 114's slice, 950 on batch 113's)",
    taken === 1195 && lost.length === 0, `${taken} taken; lost ${lost.slice(0, 4).join(" ; ")}`);
  check("money is digits throughout: added in whole cents, never through a float",
    addAmounts("1478000000", "197000000") === "1675000000" && addAmounts("4505902", "900000") === "5405902" && addAmounts("0.10", "0.20") === "0.30" &&
      addAmounts("5100.5", null) === "5100.5" && addAmounts(null, null) === null && cases.every((c) => [c.penalty, c.workOrdered].every((m) => m == null || /^\d+(?:\.\d{2})?$/.test(m))));
  check("EPA's summary: spaces collapsed, a word broken across a line joined, and its lost characters read as an apostrophe, a section sign or a quotation mark",
    summaryOf("THE FACILITY FAILED TO SUBMIT\r\n  ITS REPORTS FOR THE INITIA-\nTIVE, AS REQUIRED.") === "THE FACILITY FAILED TO SUBMIT ITS REPORTS FOR THE INITIATIVE, AS REQUIRED." &&
      // batch 116: two marks before a number are one "§" (a two-byte character lost), as the 13 such cases read
      summaryOf("Ohio EPA\uFFFDs order under 42 U.S.C. \uFFFD\uFFFD 9607 and the \uFFFD\uFFFD\uFFFDAOC\uFFFD\uFFFD\uFFFD.") === "Ohio EPA's order under 42 U.S.C. § 9607 and the \"AOC\".");
  check("  …nothing shown when it says nothing: a placeholder, a step and a day, a facility's address, a fragment",
    ["CASE SUMMARY REQUESTED", "TO BE ENTERED", "Pending.", "X", "CONSENT DECREE ENTERED ON 12/10/07", "COST RECOVERY AGMT.", "FACILITY ADDR: 800 PHILLIPS RD WEBSTER, NY 14580", "* FACILITY NAME: TEXAS INSTRUMENTS INC 34 FOREST ST ATTLEBORO, MA 02703 OWNERSHIP: P", "PCB VIOLATIONS", " ."].every((t) => summaryOf(t) === null) &&
      summaryOf("The pesticide product being imported was misbranded.") !== null && byNumber.get("03-1999-0388")?.summary === null);
  const cut = cases.map((c) => c.summary ?? "").filter((t) => t.endsWith("…"));
  const longest = summaryOf(`${"WORD ".repeat(200)}END`) ?? "";
  check("  …and a long one is cut at a word, so a page with hundreds of cases still carries its news",
    cut.length > 1000 && cases.every((c) => (c.summary ?? "").length <= SUMMARY_CAP + 1) && longest.length <= SUMMARY_CAP + 1 && /WORD…$/.test(longest), `${cut.length} cut`);
  const plain = readCases(Object.fromEntries(CASE_TABLES.map((t) => [t, SLICE.tables[t]])) as Parameters<typeof readCases>[0]);
  check("a file without the settlements table gives the case totals alone, as before: degraded, not broken",
    plain.length === cases.length && plain.every((c) => !c.settled) && plain.find((c) => c.number === "HQ-2020-0001")?.penalty === null && plain.find((c) => c.number === "HQ-1996-0001")?.penalty === "11000000");
  const zipped = readCaseFile(makeZip(([...CASE_TABLES, SETTLEMENT_TABLE] as const).map((t) => [t, SLICE.tables[t], true] as [string, string, boolean])));
  check("  …and the monthly read finds the table in EPA's zip", zipped.find((c) => c.number === "HQ-2020-0001")?.penalty === "1675000000");

  console.log("\nRead once a month, and kept");
  const db: FakeDb = { cases: new Map(), reads: null, listed: "1962-01-02" };
  const asked: (string | null)[] = [];
  const serve = (modified: string) => async (since: string | null): Promise<CaseFileAnswer> => {
    asked.push(since);
    return since === modified ? { cases: [], modified, outcome: "unchanged", httpStatus: 304 } : { cases, modified, outcome: "ok", httpStatus: 200 };
  };
  const first = await walkEpaCases(fakeDb(db), { budget: { left: 1 }, fetchFile: serve("Sat, 31 Oct 2026 16:07:24 GMT") });
  check("the first run reads the file and keeps every case", first.read === "stored" && first.cases === 8285 && db.cases.size === 8285 && db.reads?.modified === "Sat, 31 Oct 2026 16:07:24 GMT", JSON.stringify(first));
  const again = await walkEpaCases(fakeDb(db), { budget: { left: 1 }, fetchFile: serve("Sat, 31 Oct 2026 16:07:24 GMT") });
  check("  …a run within the month asks nothing", !again.due && asked.length === 1);
  db.reads = { ...(db.reads as NonNullable<FakeDb["reads"]>), ageDays: 31 };
  const same = await walkEpaCases(fakeDb(db), { budget: { left: 1 }, fetchFile: serve("Sat, 31 Oct 2026 16:07:24 GMT") });
  check("  …a month on, a copy EPA has not changed is not read again: it is asked with its Last-Modified",
    same.read === "unchanged" && asked[1] === "Sat, 31 Oct 2026 16:07:24 GMT" && db.reads?.ageDays === 0 && db.cases.size === 8285);
  db.reads = { ...(db.reads as NonNullable<FakeDb["reads"]>), ageDays: 31 };
  const spent = await walkEpaCases(fakeDb(db), { budget: { left: 0 }, fetchFile: serve("x") });
  const refused = await walkEpaCases(fakeDb(db), { budget: { left: 1 }, fetchFile: async () => ({ cases: [], modified: null, outcome: "throttled", httpStatus: 429 }) });
  check("  …one read a process, and a refusal keeps the cases kept and is asked again", spent.stopped === "this run's read is spent" && refused.failure?.httpStatus === 429 && db.cases.size === 8285 && db.reads?.ageDays === 31);
  const fetched = await withFetch(async () => new Response(new Blob([makeZip(CASE_TABLES.map((t) => [t, SLICE.tables[t], true] as [string, string, boolean])) as Uint8Array<ArrayBuffer>]), { status: 200, headers: { "last-modified": "Sun, 01 Nov 2026 00:00:00 GMT" } }), () => fetchCaseFile(null));
  check("a file that reads as a few thousand cases is refused as broken, not stored: EPA's holds 137,108", fetched.outcome === "error" && /only 8285 cases read/.test(fetched.detail ?? ""), JSON.stringify({ ...fetched, cases: fetched.cases.length }));
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
  // batch 114: PSEG's cases are all its units', none under its own name, so only the units' keys find them
  const pegPage = await epaCasesFor(fakeDb({ ...db, listed: "1980-01-02" }), 1, plan("PEG"), noWalk);
  check("  …and its units' cases by the units' keys: PSEG's 43 from its first price (of the replay's 44, one is of 1979), filed under Public Service Electric and Gas and PSEG Fossil, none under its own name",
    pegPage.outcome === "ok" && pegPage.events.length === eventsOn("PEG", "1980-01-02").length && pegPage.events.length === 43, `${pegPage.events.length} on PEG`);
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

  console.log("\nThe utilities' operating companies, each on its owner's page on its days (batch 114, the 2026-11-07 proposal 3)");
  check("NIPSCO's Clean Air Act decree of 2011-07-22 is NiSource's, Consumers Energy's of 2014-09-16 CMS's, Ohio Edison's of 2005-03-18 FirstEnergy's",
    has(eventsOn("NI"), "05-2004-4533") && has(eventsOn("CMS"), "05-2008-3000") && has(eventsOn("FE"), "03-2000-0016"));
  const fePre = eventsOn("FE", "1997-11-10").filter((e) => e.date < "1997-11-10");
  check("  …and an Ohio Edison case before FirstEnergy's first price (1997-11-10) is on no page of its, as Ohio Edison's own past is not its buyer's",
    eventsOn("FE").some((e) => e.date < "1997-11-10") && fePre.length === 0);
  const gulf = (day: string): EpaCase => ({ number: "ZZ-GULF", name: "GULF POWER COMPANY", court: true, day, step: "lodged", penalty: "100000", laws: ["CAA"], defendants: ["GULF POWER COMPANY"], docket: null });
  const onPage = (t: string, c: EpaCase) => epaEvents([c], namesOf(t), { cik: rowOf(t)[0] }).length > 0;
  check("Gulf Power is Southern's to 2018-12-31 and NextEra's from 2019-01-01, the day its own 8-K gives for the change in control",
    has(eventsOn("SO"), "04-2011-9183") && onPage("SO", gulf("2018-12-31")) && !onPage("NEE", gulf("2018-12-31")) && !onPage("SO", gulf("2019-01-01")) && onPage("NEE", gulf("2019-01-01")));
  const nar = (day: string): EpaCase => ({ ...gulf(day), number: "ZZ-NAR", name: "THE NARRAGANSETT ELECTRIC COMPANY", defendants: ["THE NARRAGANSETT ELECTRIC COMPANY"] });
  check("  …Narragansett Electric National Grid's to 2022-05-24 and PPL's from 2022-05-25 (PPL's 8-K, item 2.01); Columbia Gas of Massachusetts NiSource's to its sale of 2020-10-09",
    onPage("NGG", nar("2022-05-24")) && !onPage("PPL", nar("2022-05-24")) && onPage("PPL", nar("2022-05-25")) && !onPage("NGG", nar("2022-05-25")) &&
      onPage("NI", { ...gulf("2020-10-08"), defendants: ["COLUMBIA GAS OF MASSACHUSETTS"] }) && !onPage("NI", { ...gulf("2020-10-09"), defendants: ["COLUMBIA GAS OF MASSACHUSETTS"] }));
  check("  …and a company bought is its buyer's only from the day it was bought: Progress Energy's cases, all before 2012-07-02, are not Duke's; PECO's before 2000-10-20 not Exelon's",
    !eventsOn("DUK").some((e) => /CAROLINA POWER|PROGRESS ENERGY|FLORIDA POWER CORP/i.test(e.description ?? "")) &&
      onPage("DUK", { ...gulf("2012-07-02"), defendants: ["PROGRESS ENERGY CAROLINAS, INC."] }) && !onPage("DUK", { ...gulf("2012-07-01"), defendants: ["PROGRESS ENERGY CAROLINAS, INC."] }) &&
      !onPage("EXC", { ...gulf("2000-10-19"), defendants: ["PECO ENERGY COMPANY"] }) && onPage("EXC", { ...gulf("2000-10-20"), defendants: ["PECO ENERGY COMPANY"] }));
  const soUnits = UNITS[rowOf("SO")[0]] ?? [];
  check("\"MISSISSIPPI POWER & LIGHT\" is Entergy Mississippi's old name, not Southern's Mississippi Power; nor is Nebraska's Southern Power District Southern's",
    !soUnits.some((u) => u.defendant.test("MISSISSIPPI POWER & LIGHT aka ENTERGY")) && soUnits.some((u) => u.defendant.test("MISSISSIPPI POWER COMPANY")) &&
      !soUnits.some((u) => u.defendant.test("SOUTHERN POWER DISTRICT")) && soUnits.some((u) => u.defendant.test("SOUTHERN POWER COMPANY")));
  check("  …nor an engine dealer's \"INTERSTATE POWER SYSTEMS\" Alliant's, nor Oncor's \"TXU ELECTRIC DELIVERY\" Vistra's",
    !(UNITS[rowOf("LNT")[0]] ?? []).some((u) => u.defendant.test("INTERSTATE POWER SYSTEMS, INC.")) && (UNITS[rowOf("LNT")[0]] ?? []).some((u) => u.defendant.test("INTERSTATE POWER & LIGHT CO")) &&
      !(UNITS[rowOf("VST")[0]] ?? []).some((u) => u.defendant.test("TXU ELECTRIC DELIVERY COMPANY")) && (UNITS[rowOf("VST")[0]] ?? []).some((u) => u.defendant.test("LUMINANT GENERATION COMPANY LLC")));
  check("a Georgia Power case of 2023 is on Southern's page and Georgia Power's own (GPJA), one of 1995 on Southern's alone: GPJA lists from 2018-11-28",
    has(eventsOn("SO"), "04-2022-3204") && has(eventsOn("GPJA", "2018-11-28"), "04-2022-3204") && has(eventsOn("SO"), "04-1995-0057") && !has(eventsOn("GPJA", "2018-11-28"), "04-1995-0057"));
  const utilities = ["PEG", "AEP", "SO", "D", "NGG", "EXC", "FE", "NEE", "CMS", "NI", "DTE", "XEL", "WEC", "PNW", "VST", "ES", "PCG", "LNT", "AEE", "EIX", "DUK", "OGE", "HE", "MGEE", "CNP", "IDA", "TXNM", "PPL", "AES", "ED", "EVRG"];
  const counts = utilities.map((t) => `${t} ${out.get(t)?.length ?? 0}`).join(", ");
  check("the replay's utilities, before first prices: PSEG 44, AEP 40, Southern 37, Dominion 34, National Grid 27, FirstEnergy 26, Exelon 22, NextEra 19; thirteen had no EPA row (PSEG, Exelon, NextEra, NiSource, DTE, WEC, Vistra, OGE, Hawaiian Electric, MGE, IDACORP, TXNM, Evergy). FirstEnergy, NiSource and Alliant each have one more than batch 114's slice gave: a case EPA lists with no defendant, read by its name (batch 116)",
    ["PEG 44", "AEP 40", "SO 37", "D 34", "NGG 27", "FE 26", "EXC 22", "NEE 19", "NI 17", "LNT 12", "CMS 17", "DTE 16", "WEC 13", "VST 11", "OGE 6", "HE 5", "MGEE 4", "IDA 4", "TXNM 4", "EVRG 1"].every((x) => counts.split(", ").includes(x)), counts);
  // every key a unit is asked by sits inside every name its pattern takes, so ingest's search finds them
  const keyless = cases.flatMap((c) => c.defendants.flatMap((d) => Object.values(UNITS).flat().filter((u) => u.defendant.test(d.trim()) && !alnum(d).includes(u.key)).map((u) => `${u.ticker} ${u.key}: ${d}`)));
  check("  …and every unit's key sits inside every name its pattern takes in the slice, so a company's ingest asks the store for all its cases", keyless.length === 0, keyless.slice(0, 4).join(" | "));

  console.log("\n28 more companies' operating units, each on its owner's page on its days, and \"&\" read as \"and\" (batch 120, the 2026-11-08 proposal 1)");
  const unitCase = (defendant: string, day: string): EpaCase => ({ ...gulf(day), number: "ZZ-UNIT", name: defendant, defendants: [defendant] });
  const enb = rowOn("ENB", "2016-07-20");
  check("Enbridge Energy's decree of 2016-07-20 for the Marshall and Romeoville spills, $62,000,000 (05-2011-7061), is on Enbridge's page; American Honda's of 1998, $10,100,000 (HQ-1998-0104), on Honda's",
    has(eventsOn("ENB"), "05-2011-7061") && /\$62,000,000 civil penalty/.test(enb?.title ?? "") && has(eventsOn("HMC"), "HQ-1998-0104"), enb?.title);
  check("BNSF Railway is Berkshire's from 2010-02-12, the day BNSF's own 8-K reports the merger (items 2.01 and 5.01): its $1,513,750 of 2021 is on the page, none of its four cases of 2009",
    has(eventsOn("BRK-B"), "07-2019-0252") && ["10-2009-0082", "09-2009-2513", "08-2009-0198", "08-2010-0005"].every((n) => !has(eventsOn("BRK-B"), n)) &&
      !onPage("BRK-B", unitCase("BNSF RAILWAY COMPANY", "2010-02-11")) && onPage("BRK-B", unitCase("BNSF RAILWAY COMPANY", "2010-02-12")) && onPage("BRK-B", unitCase("BURLINGTON NORTHERN SANTA FE, LLC", "2021-05-11")));
  check("  …MidAmerican Energy from 2006-02-09 and Pharmacia LLC on Pfizer's page from 2003-04-16, the owner's two calls of 2026-11-08: MidAmerican's case of 2004 is not Berkshire's, its decree of 2007 is",
    !has(eventsOn("BRK-B"), "07-2004-0258") && has(eventsOn("BRK-B"), "07-2007-0218") && has(eventsOn("PFE"), "05-2013-1028") &&
      !onPage("PFE", unitCase("PHARMACIA LLC", "2003-04-15")) && onPage("PFE", unitCase("PHARMACIA LLC", "2003-04-16")));
  check("Sikorsky is United Technologies' to 2015-11-05, the day before its sale to Lockheed closed (UTC's 8-K of 2015-11-06): its $176,000 order of 2006 is RTX's; \"Sikorsky Autowerk\" is no one's",
    has(eventsOn("RTX"), "01-2006-1005") && !onPage("RTX", unitCase("SIKORSKY AIRCRAFT CORPORATION", "2015-11-06")) && onPage("RTX", unitCase("SIKORSKY AIRCRAFT CORPORATION", "2015-11-05")) &&
      !onPage("RTX", unitCase("SIKORSKY AUTOWERK, INC.", "2010-01-01")) && !onPage("LMT", unitCase("SIKORSKY AUTOWERK, INC.", "2018-07-20")));
  check("  …Otis Elevator United Technologies' to 2020-04-01 and Otis Worldwide's from 2020-04-02, the report day of RTX's 8-K of the separations: its Diamond Alkali decree of 2022 is OTIS's, not RTX's; Carrier Global's own name reads \"Carrier Corporation\" already",
    has(eventsOn("OTIS"), "02-2023-0003") && !has(eventsOn("RTX"), "02-2023-0003") && has(eventsOn("CARR"), "04-2025-3022") && !has(eventsOn("RTX"), "04-2025-3022") &&
      onPage("RTX", unitCase("UNITED TECHNOLOGIES CORP - OTIS ELEVATOR", "2020-04-01")) && !onPage("RTX", unitCase("OTIS ELEVATOR COMPANY", "2020-04-02")) && onPage("OTIS", unitCase("OTIS ELEVATOR COMPANY", "2020-04-02")));
  check("  …United Technologies Automotive to 1999-05-03, Lear's 8-K reporting its purchase on 1999-05-04: the Four County Landfill decree of 2002 is not RTX's; Raytheon Company RTX's from 2020-04-02",
    !has(eventsOn("RTX"), "05-2001-0638") && has(eventsOn("RTX"), "07-2000-0118") && !onPage("RTX", unitCase("RAYTHEON COMPANY", "2020-04-01")) && onPage("RTX", unitCase("RAYTHEON COMPANY", "2020-04-02")) &&
      !onPage("RTX", unitCase("PRATT & WHITNEY ROCKETDYNE", "2013-06-12")) && onPage("RTX", unitCase("PRATT & WHITNEY", "2026-09-21")));
  check("Premcor is Valero's from 2005-09-01 (Valero's 8-K, item 2.01): its order of 2002 is on no page, its decree of 2007 on Valero's; Valero Refining's national decree of 2005 ($3,592,308) is Valero's; Valero Terrestrial, a landfill, is not",
    !has(eventsOn("VLO"), "HQ-1999-1019") && has(eventsOn("VLO"), "04-2007-9017") && has(eventsOn("VLO"), "06-2000-1220") && !has(eventsOn("VLO"), "03-2004-0198"));
  check("the pipelines change hands on their days: Keystone is South Bow's from its spin-off of 2024-10-01, not TC Energy's; Trunkline's order of 2019 is Energy Transfer's, its case of 1998 Duke's; Transco's $1,400,000 of 2002 is Williams's",
    has(eventsOn("SOBO"), "07-2024-1004") && !has(eventsOn("TRP"), "07-2024-1004") && has(eventsOn("ET"), "06-2019-3336") && !has(eventsOn("DUK"), "06-2019-3336") &&
      has(eventsOn("DUK"), "05-1997-0349") && has(eventsOn("WMB"), "06-1997-0440") && !onPage("DUK", unitCase("TRUNKLINE GAS COMPANY", "1999-03-29")) &&
      !onPage("WMB", unitCase("WILLIAMS PRODUCTION RMT COMPANY", "2011-12-30")) && onPage("WMB", unitCase("WILLIAMS PRODUCTION RMT COMPANY", "2011-12-29")));
  check("a namesake is no unit: Huntsman Springs, Mosaic Life Care, the Lyondell Environmental Custodial Trust, El Paso Electric, Westlake Hardware, the old Total Petroleum (Ultramar Diamond Shamrock's from 1997) and McMoRan's Freeport-McMoRan Energy are on none of these pages",
    !has(eventsOn("HUN"), "10-2007-0169") && !has(eventsOn("MOS"), "07-2016-0144") && !has(eventsOn("LYB"), "03-2010-0309") && !has(eventsOn("KMI"), "09-2008-2509") &&
      !has(eventsOn("WLK"), "07-2019-0182") && !has(eventsOn("TTE"), "05-1996-0241") && !has(eventsOn("FCX"), "06-2010-1876") &&
      !onPage("KMI", unitCase("EL PASO PRODUCTION OIL & GAS COMPANY", "2013-01-01")) && onPage("KMI", unitCase("EL PASO NATURAL GAS COMPANY, LLC", "2013-01-01")));
  check("  …and a bought company is its buyer's only from the day: Phelps Dodge's cases of 2006 and of 2007-03-01 are not Freeport's (from 2007-03-19), Kennecott Utah Copper's of 2025 is Rio Tinto's",
    !has(eventsOn("FCX"), "06-2005-0912") && !has(eventsOn("FCX"), "04-2007-3759") && onPage("FCX", unitCase("PHELPS DODGE REFINING CORPORATION", "2011-07-07")) && has(eventsOn("RIO"), "08-2025-0185"));
  check("\"&\" read as \"and\" (lib/edgarName.ts): Air Products and Chemicals, Inc. is Air Products & Chemicals's, The Goodyear Tire and Rubber Company Goodyear's, Deere and Company Deere's",
    JSON.stringify(andSpellings("GOODYEAR TIRE & RUBBER CO")) === JSON.stringify(["GOODYEAR TIRE & RUBBER CO", "GOODYEAR TIRE and RUBBER CO"]) && JSON.stringify(andSpellings("Nucor Corp")) === JSON.stringify(["Nucor Corp"]) &&
      epaParty("Air Products and Chemicals, Inc.", namesOf("APD")(2011)) !== null && has(eventsOn("APD"), "02-2010-2024") && has(eventsOn("GT"), "02-2018-9241") && epaParty("DEERE AND COMPANY", namesOf("DE")(2000)) !== null);
  check("  …and \"AT AND T\", a 1993 order (03-1993-0248), is AT&T Corp.'s, not T's: the spelling reads it, and the table of taken names, which now reads \"AT AND T\" too, refuses it before 2005-11-18",
    epaParty("AT AND T", namesOf("T")(1993)) !== null && takenBefore(rowOf("T")[0], "1993-03-31", "AT AND T") && !has(eventsOn("T"), "03-1993-0248") && !takenBefore(rowOf("T")[0], "2005-11-18", "AT AND T"));
  const gains = ["HON", "RTX", "BRK-B", "RSG", "APD", "PFE", "VLO", "RIO", "WLK", "WMB", "GT", "TSN", "KMI", "SYY", "MOS", "LYB", "TTE", "PEP", "DE", "FCX", "SLB", "HUN", "TXT", "ENB", "TAP", "TRP", "BUD", "HMC", "CVS", "CLF", "OTIS", "SOBO"].map((t) => `${t} ${out.get(t)?.length ?? 0}`).join(", ");
  // from first prices and under EDGAR's former names, EPA's whole file gives these 28 companies, Otis, South Bow, Energy
  // Transfer, Duke and the 11 whose names hold "&" 906 cases and 818 rows more, none fewer; 9 of them had no EPA row
  check("the replay, before first prices: Honeywell 246, RTX 121, Pfizer 105, Goodyear 103, Air Products 66, Kinder Morgan 59, Berkshire 58, LyondellBasell 55, Valero 53, Westlake 45, Rio Tinto 43, Republic Services 33…",
    gains === "HON 246, RTX 121, BRK-B 58, RSG 33, APD 66, PFE 105, VLO 53, RIO 43, WLK 45, WMB 34, GT 103, TSN 64, KMI 59, SYY 30, MOS 22, LYB 55, TTE 21, PEP 22, DE 31, FCX 21, SLB 19, HUN 28, TXT 71, ENB 12, TAP 9, TRP 8, BUD 5, HMC 5, CVS 10, CLF 2, OTIS 1, SOBO 1", gains);

  console.log("\nThe 2026-11-07 audit of batches 108–115, fixed (batch 116)");
  const att = eventsOn("T");
  check("finding 1: old AT&T Corp.'s 13 rows of 1986–2002 are off T, whose record was SBC's until it took AT&T's name on 2005-11-18; its EPCRA penalty of 2001 among them; T's own 5 stay",
    att.length === 5 && !has(att, "HQ-2000-6010") && !has(att, "03-1981-0363") && att.every((e) => e.date >= "2005-11-18") && has(att, "04-2012-3754") &&
      TAKEN_NAMES[rowOf("T")[0]]?.from === "2005-11-18" && !NOT_THE_COMPANY[rowOf("T")[0]],
    att.map((e) => `${e.date} ${e.externalId}`).join(" | "));
  const cmsUnit = (UNITS[rowOf("CMS")[0]] ?? []).find((u) => u.key === "consumers")!;
  check("finding 2: \"CONSUMERS POWER, INC.\", a Region 10 case of 1993 at an Illinois facility, is not Michigan's Consumers Power Company; \"CONSUMERS POWER CO.\" and \"Consumers Energy Company\" are",
    !has(eventsOn("CMS"), "10-1993-0130") && !cmsUnit.defendant.test("CONSUMERS POWER, INC.") && ["CONSUMERS POWER CO.", "CONSUMERS POWER COMPANY", "CONSUMERS POWER CO", "Consumers Energy Company"].every((d) => cmsUnit.defendant.test(d)) &&
      has(eventsOn("CMS"), "05-2013-1012"));
  // MRK's record held SCHERING PLOUGH CORP to 2009-10-29, as data.sec.gov gives it and its ingest reads it (`partyNamesFor`)
  const mrkTitle = rowOf("MRK")[2];
  const mrkFormer = [{ name: "SCHERING PLOUGH CORP", until: "2009-10-29" }];
  const mrkNames = (year: number) => [...companyNames(mrkTitle, namesForYear(year, newsNamesFor(310158), mrkFormer)), ...[mrkTitle, ...mrkFormer.filter((f) => f.until >= `${year}-01-01`).map((f) => f.name)].map(withoutTag)];
  const mrk = epaEvents(cases, mrkNames, { cik: 310158 });
  const fike = mrk.find((e) => has([e], "03-1990-0627"));
  const caldwell = mrk.find((e) => has([e], "02-1993-0104"));
  const labelled = (e?: TimelineEvent) => !!e && ownPastLabelled(e, 310158).source === `EPA · ${OWN_RECORD_FROM[310158].label}`;
  check("finding 3: a case named for its site names the page's own defendant, so Schering-Plough's Fike Chemical decree of 2009 and Caldwell Trucking order of 1994 carry its label on MRK",
    /AMERICAN CYANAMID \(FIKE CHEMICAL SITE\) \(case 03-1990-0627[^)]*\), against SCHERING-PLOUGH CORP\. and 63 other defendants/.test(fike?.description ?? "") && labelled(fike) && labelled(caldwell),
    `${fike?.description?.slice(0, 160)} | ${caldwell?.description?.slice(0, 120)}`);
  const aepRow = rowOn("AEP", "2007-10-09");
  check("  …but a case whose own name names the company lists no operating companies (AEP's national case), and a case of one defendant names none twice (Tesla)",
    /NATIONAL CASE\) \(case 03-1999-0388\), with 5 other defendants:/.test(aepRow?.description ?? "") && !(eventsOn("TSLA") ?? []).some((e) => /, against /.test(e.description ?? "")) &&
      rows.every(({ e }) => !/\.\.\s+The day/.test(e.description ?? "")));
  check("finding 5: EPA's placeholders and pointers are no summary: \"NO CASE SUMMARY SUBMITTED\", \"WILL PROVIDE AT A LATER DATE.\", \"AWAITING CASE SUMMARY FROM ATTORNEY.\", \"PLEASE SEE BLUFF ROAD SUMMARY.\", \"SEE CASE SUMMARY OF 08-97-0150\"",
    ["NO CASE SUMMARY SUBMITTED", "no case summary submitted.", "WILL PROVIDE AT A LATER DATE.", "AWAITING CASE SUMMARY FROM ATTORNEY.", "PLEASE SEE BLUFF ROAD SUMMARY.", "SEE CASE SUMMARY OF 08-97-0150", "---------SEE CASE SUMMARY OF 08-97-0150----------", "ALSO SEE 05-2000-0575 FOR SUMMARY ON SCREEN 6."].every((t) => summaryOf(t) === null) &&
      summaryOf("SEE CASE NO. 05-87-0412, NAMED FORSTER, LEONARD FOR CASE SUMMARY. - THIS ACTION IS TO RECOVER THE REMAINING MONEY EXPENDED ON THE SITE") !== null);
  check("  …nor a step and its day alone; a step that says what was done stays",
    ["CAFO effective 10/28/2022", "This order was signed 8/13/25", "On 8/11/26 a NOW was issued.", "Case finish date January 6, 2025.", "Notice of Determination issued December 5, 2022.", "This CAFO was signed into effect 12/22/23", "Agreement effective as of 03/02/2023."].every((t) => summaryOf(t) === null) &&
      ["4/8/16 - PESTICIDE DENIED ENTRY INTO U.S.", "AOC FOR REMOVAL ISSUED 9/30/97.", "7/28/06 - COMPLIANCE ORDER ISSUED.", "IMPROPER ASBESTOS REMOVAL."].every((t) => summaryOf(`${t} AT THE FACILITY`) !== null || summaryOf(t) !== null));
  check("  …and a lost character is read by its run's length and place: a plural's apostrophe, a dash, two section signs before a list or for four marks, closing quotation marks",
    summaryOf("modifications at Defendants\uFFFD Nelson Dewey, Columbia and Edgewater stations") === "modifications at Defendants' Nelson Dewey, Columbia and Edgewater stations" &&
      summaryOf("(Denver, CO \uFFFD April 20, 2023) - The U.S. Environmental Protection Agency") === "(Denver, CO – April 20, 2023) - The U.S. Environmental Protection Agency" &&
      summaryOf("of EPCRA, 42 U.S.C. \uFFFD\uFFFD\uFFFD\uFFFD 11004(b) and 11004(c), required") === "of EPCRA, 42 U.S.C. §§ 11004(b) and 11004(c), required" &&
      summaryOf("CERCLA, 42 U.S.C.\uFFFD\uFFFD 9606, 9607 AND 9622 CONCERNING THE SITE") === "CERCLA, 42 U.S.C.§§ 9606, 9607 AND 9622 CONCERNING THE SITE" &&
      summaryOf("HEREINAFTER REFERRED TO AS \uFFFDRESPONDENTS\uFFFD. UNDER THE TERMS OF THE ORDER") === "HEREINAFTER REFERRED TO AS \"RESPONDENTS\". UNDER THE TERMS OF THE ORDER" &&
      summaryOf("to resolve the United States\uFFFD claims against these 31 parties") === "to resolve the United States' claims against these 31 parties");
  check("finding 6: EPA's \"THE TORO CORPORATION\" of 2001, The Toro Company's Superfund order, is not Toro Corp.'s, the shipping company formed in 2022; Toro's own order of 2022 is TTC's",
    !has(eventsOn("TORO"), "05-2002-0076") && !has(eventsOn("TTC"), "05-2002-0076") && has(eventsOn("TTC"), "05-2022-9903") &&
      epaEvents(cases, namesOf("TORO"), { cik: rowOf("TORO")[0] }).every((e) => !/TORO CORPORATION/.test(e.description ?? "")));
  check("finding 7: the slice holds the cases EPA lists with no defendant that a page reads by name, and those batch 111's spellings read: the whole file's page cases",
    ["05-1985-0398", "05-1987-0182", "05-1987-0496", "05-2002-0076", "05-2022-9903"].every((n) => byNumber.has(n)) &&
      has(eventsOn("NI"), "05-1985-0398") && ["05-1987-0182", "05-1987-0496"].every((n) => has(eventsOn("FE"), n) || has(eventsOn("LNT"), n)) &&
      byNumber.get("05-1985-0398")?.defendants.length === 1);

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
  const figures = read("db/043_epa_case_figures.sql");
  check("  …which keep, since db/043, whether a penalty is the settlement's, the work ordered as a number and EPA's summary, and forget the last read so the next run reads the file whole (batch 113)",
    /ADD COLUMN IF NOT EXISTS penalty_settled boolean NOT NULL DEFAULT false/.test(figures) && /ADD COLUMN IF NOT EXISTS work_ordered numeric\(16, 2\)/.test(figures) &&
      /ADD COLUMN IF NOT EXISTS summary text/.test(figures) && /^DELETE FROM epa_reads;$/m.test(figures));
  const nul = cases.find((c) => c.number === "05-1992-0130");
  check("  …and text without control characters: Postgres refuses a NUL, and EPA's \"H.O.D. LANDFILL \\u0000\" made it refuse the whole month's read",
    !!nul && nul.name === "H.O.D. LANDFILL" && /\u0000/.test(SLICE.tables["CASE_ENFORCEMENTS.csv"]) &&
      cases.every((c) => ![c.name, c.summary ?? "", c.docket ?? "", ...c.defendants].some((t) => /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(t))),
    JSON.stringify(nul?.name));
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
      if (/^INSERT INTO epa_cases \(case_number, name, court, filed_on, step, penalty, laws, defendants, docket, name_keys, penalty_settled, work_ordered, summary\)/.test(s)) {
        const [n, nm, ct, d, st, p, l, df, dk, k, ps, w, sm] = params as [string[], string[], boolean[], string[], EpaCase["step"][], (string | null)[], string[], string[], (string | null)[], string[], boolean[], (string | null)[], (string | null)[]];
        n.forEach((number, i) =>
          db.cases.set(number, {
            number, name: nm[i], court: ct[i], day: d[i], step: st[i], penalty: p[i], laws: l[i] ? l[i].split("|") : [], defendants: df[i] ? df[i].split("|") : [], docket: dk[i], keys: k[i],
            settled: ps[i], workOrdered: w[i], summary: sm[i],
          }),
        );
        return { rows: [] };
      }
      if (/^INSERT INTO epa_reads \(id, modified, cases\)/.test(s)) {
        const [modified, count] = params as [string | null, number];
        db.reads = { modified, cases: count, ageDays: 0 };
        return { rows: [] };
      }
      if (/^SELECT case_number, name, court, filed_on::text AS day, step, penalty::text AS penalty, laws, defendants, docket, penalty_settled, work_ordered::text AS work_ordered, summary\s+FROM epa_cases WHERE filed_on >= \$1::date AND name_keys LIKE ANY \(\$2::text\[\]\) ORDER BY filed_on, case_number$/.test(s)) {
        const [from, patterns] = params as [string, string[]];
        const keys = patterns.map((p) => p.replace(/^%|%$/g, ""));
        const rows = [...db.cases.values()]
          .filter((c) => c.day >= from && keys.some((k) => c.keys.includes(k)))
          .sort((a, b) => a.day.localeCompare(b.day) || a.number.localeCompare(b.number))
          .map((c) => ({
            case_number: c.number, name: c.name, court: c.court, day: c.day, step: c.step, penalty: c.penalty === null ? null : `${c.penalty}${c.penalty.includes(".") ? "" : ".00"}`, laws: c.laws, defendants: c.defendants, docket: c.docket,
            penalty_settled: !!c.settled, work_ordered: c.workOrdered ? `${c.workOrdered}${c.workOrdered.includes(".") ? "" : ".00"}` : null, summary: c.summary ?? null,
          }));
        return { rows };
      }
      if (/FROM prices/.test(s)) return { rows: [{ listed: db.listed }] };
      if (/FROM events e/.test(s)) return { rows: [] };
      throw new Error(`unexpected query: ${s.slice(0, 80)}`);
    },
  } as unknown as PoolClient;
}

main();
