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
  PROJECT_CAP,
  PROJECT_TABLE,
  SETTLEMENT_TABLE,
  projectText,
  projectsQuoted,
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
  SUIT_LEAD_DAYS,
  bySettlement,
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
 * every row of the four tables the adapter reads for the 8,506 cases whose defendants hold a
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
const SLICE: { provenance: string; tables: Record<(typeof CASE_TABLES)[number] | typeof SETTLEMENT_TABLE | typeof PROJECT_TABLE, string> } = JSON.parse(gunzipSync(readFileSync(join(root, "scripts/fixtures/epa-cases-slice.json.gz"))).toString("utf8"));
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
  check("the slice holds the cases the replay reads, each with its day: 8,506, the 1,739 batch 104's units name, the 1,133 batch 114's add, the 5 batch 116's add, the 1,119 batch 120's add, the 171 batch 135's add and the 50 Amazon's unit asks, batch 142, among them", cases.length === 8506 && /Batch 142 added every row of the six tables for the 50 cases/.test(SLICE.provenance) && /Batch 135 added every row of the five tables for the 171 cases/.test(SLICE.provenance) && /Batch 114 added every row of the five tables for the 1133 cases/.test(SLICE.provenance) && /Batch 116 added every row of the five tables for the 5 cases/.test(SLICE.provenance) && /Batch 120 added every row of the five tables for the 1119 cases/.test(SLICE.provenance) && cases.every((c) => /^\d{4}-\d{2}-\d{2}$/.test(c.day)) && /Batch 104 added the 1739 cases that name one of the units/.test(SLICE.provenance), `${cases.length}`);
  const byName = (ticker: string) => epaEvents(cases, namesOf(ticker), {});
  check("  …rebuilt with the two-letter names ingest asks (batch 100, the audit of batches 94–99, finding 7): BP's and 3M's own cases are in it (3M's 68 rows count its suit filed in 1985, batch 122)",
    byName("BP").length === 4 && eventsOn("MMM").length === 68 && /two letters or more as ingest asks/.test(SLICE.provenance),
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
  check("  …one event per company and day, or month, keyed by the company, and a day's suits filed in court one more (batch 122)",
    eventsOn("GE").every((e) => /^epa:40545@\d{4}-\d{2}(?:-\d{2}(?::filed)?|:no-penalty)$/.test(e.dedupBasis ?? "")) && eventsOn("GE").some((e) => /:filed$/.test(e.dedupBasis ?? "")));
  // batch 100, the audit's finding 2: a month read when it held one case with no penalty, and again
  // when it held two, leaves one row, where the first read's row under its day stayed beside the month's
  // Olin's rows once: read per case, they made this check the suite's slowest (batch 122)
  const olnRows = eventsOn("OLN");
  const olnMonth = [...new Set(grouped.filter((c) => olnRows.some((e) => e.precision === "month" && has([e], c.number))).map((c) => c.day.slice(0, 7)))][0];
  const monthCases = grouped.filter((c) => c.day.slice(0, 7) === olnMonth && olnRows.some((e) => has([e], c.number))).sort((a, b) => a.day.localeCompare(b.day));
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
  // batch 122's suits filed in court add 228 rows, and the settlements of cases all a company's 39
  check("before any first price: 9,404 rows on 693 companies, 7,977 before 2017; 9,058 of them a case's own day, which EPA's whole file gives too (9,386, 7,974 and 9,046 before the 2026-11-11 audit's Amazon unit, 17 rows, and Brink's Inc., whose apostrophe EPA's file held as a control character, 1; on 692 before the 2026-11-10 audit moved Kroger Specialty Pharmacy's order of 2026 to Elevance Health; 9,155, 7,768 and 8,827 on 690 before batch 135's units of 13 more companies, the cases they name added to the slice; 9,156, 7,769 and 8,828 before the 2026-11-08 audit took UT Automotive's misspelled decree of 2007 off RTX; 8,889, 7,526 and 8,561 before batch 122's suits filed and settlements on their own days; 7,899, 6,754 and 7,621 on 679 before batch 120's units of 28 more companies and its \"and\" for \"&\"; 7,954, 6,806 and 7,675 on 683 before batch 117's table of taken names took Ingersoll-Rand's 36 off IR, Linde AG's 9 off LIN, Spectrum Brands' 4 off SPB, Sunoco, Inc.'s 3 off SUN and one each off HOS, VTOL and FUN; 7,969, 6,821 and 7,688 on 684 before batch 116 took old AT&T's 13 off T, Consumers Power, Inc.'s 1 off CMS and Toro Corp.'s 1 off TORO; 7,964, 6,817 and 7,683 on 683 on batch 114's slice, which lacked 5 of the file's page cases; 7,545, 6,463 and 7,268 on 670 before batch 114's utilities; 7,428, 6,368 and 7,026 before batch 113's settlement figures; 7,427, 6,367 and 7,025 before batch 111's legal-form spellings; 7,436, 6,376 and 7,034 before batch 108 took the old Waste Management's nine off WM; 7,035 before batch 107's Star Lake order joined Chevron's September 2016; 5,994 on 667 before batch 104's units, every one of whose cases is still on its page; 5,984 before batch 101's Sunoco, Inc.; 6,001 on 665 before batch 100)",
    total === 9404 && out.size === 693 && before2017 === 7977 && own === 9058 && (out.get("OLN") ?? []).some((e) => e.date === "1995-10-26"), `${total} on ${out.size}; ${before2017} before 2017; ${own} own`);
  const top = [...out].sort((a, b) => b[1].length - a[1].length).slice(0, 5).map(([t, v]) => `${t} ${v.length}`).join(", ");
  check("  …most on GE 302, ExxonMobil 295, Chevron 278, BP 255, Honeywell 252 (XOM 288, GE 284, CVX 269, BP 248, HON 246 before batch 122's suits filed and settlements; GM's 225 fifth before batch 120 gave Honeywell AlliedSignal's and old Honeywell's companies; GE 284, XOM 273, CVX 258, BP 230, GM 222 before batch 113; before the units: GE 284, GM 222, Ford 165, ExxonMobil 163, FMC 135)",
    top === "GE 302, XOM 295, CVX 278, BP 255, HON 252", top);

  console.log("\nEPA's own figures: the settlement's penalty, the work ordered, EPA's summary (batch 113, the 2026-11-07 proposal 1)");
  const rows = [...out].flatMap(([t, evs]) => evs.map((e) => ({ t, e })));
  const rowOn = (t: string, d: string) => out.get(t)?.find((e) => e.date === d);
  const aep = rowOn("AEP", "2007-10-09");
  // since batch 122 the day holds a third: Muskingum River's first settlement, $8,025,000, its case's 4
  // settlements each on its own day, so the largest penalty leads
  check("AEP's 2007 decree, a case total of none, gives both cases' settlement penalties and the work each orders, and Muskingum River's first settlement joins them (batch 122)",
    !!aep && aep.title === "EPA consent decree: $8,025,000 civil penalty (Clean Air Act), and 2 more cases that day" &&
      /\(case 05-1999-0644, settlement 1 of 4, Justice Department docket C2-05-360\): \$8,025,000 civil penalty; work ordered \$2,480,260,000, EPA's estimate;/.test(aep.description ?? "") &&
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
      rows.filter(({ e }) => e.precision === "month").length === 346, `${rows.filter(({ e }) => e.precision === "month").length} month rows (340 before the 2026-11-11 audit's Amazon unit, 328 before batch 135, 278 before batch 120)`);
  const shown = rows.filter(({ e }) => /civil penalty/.test(e.title));
  // on batch 113's slice: 2,125 rows, 1,765 before 2017, 1,250 and 890 more than before it; batch 114's units add the rest
  check("2,706 rows give a penalty, 2,208 of them before 2017 (2,703 before the 2026-11-11 audit's Amazon unit; 2,616 and 2,137 before batch 135's units; 2,595 and 2,118 before batch 122's settlements on their own days; 2,261 and 1,879 before batch 120's units and spelling; 2,271 and 1,888 before batch 117's taken names; 2,272 and 1,890 before batch 116's AT&T and Consumers Power, Inc.); none from 2017 on gave one before batch 113, since EPA's case totals stop and its settlements go on",
    shown.length === 2706 && shown.filter(({ e }) => e.date < "2017").length === 2208, `${shown.length}, ${shown.filter(({ e }) => e.date < "2017").length} before 2017`);
  check("  …3,494 rows name the work ordered, 2,894 before 2017; 7,790 carry EPA's summary, 6,474 before 2017, each case's once on a page (3,485, 2,891, 7,778 and 6,471 before the 2026-11-11 audit's Amazon unit and Brink's Inc.; 3,425, 2,841, 7,598 and 6,316 before batch 135's units; 7,599 and 6,317 before the 2026-11-08 audit's UT Automotive row came off RTX; 3,385, 2,813, 7,598 and 6,316 before batch 122's settlements on their own days; 2,942, 2,469, 6,707 and 5,634 before batch 120's units and spelling; 2,963, 2,489, 6,750 and 5,675 before batch 117's taken names; 2,968, 2,495, 6,785 and 5,703 before batch 116 dropped placeholders and old AT&T's rows; 2,805, 2,363, 6,417 and 5,395 on batch 113's slice)",
    rows.filter(({ e }) => /work ordered/.test(e.description ?? "")).length === 3494 && rows.filter(({ e }) => /work ordered/.test(e.description ?? "") && e.date < "2017").length === 2894 &&
      rows.filter(({ e }) => /EPA's summary/.test(e.description ?? "")).length === 7790 && rows.filter(({ e }) => /EPA's summary/.test(e.description ?? "") && e.date < "2017").length === 6474,
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
  check("every row the rule before kept under a month's key and this one does not moves onto the first own row of its cases: 1,232, none lost, so a row keeps its history (1,229 before the 2026-11-11 audit's Amazon unit, 1,195 before batch 135's units, 1,001 before batch 120's units and spelling, 1,008 before batch 117's taken names, 1,007 on batch 114's slice, 950 on batch 113's)",
    taken === 1232 && lost.length === 0, `${taken} taken; lost ${lost.slice(0, 4).join(" ; ")}`);
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
  const zipped = readCaseFile(makeZip(([...CASE_TABLES, SETTLEMENT_TABLE, PROJECT_TABLE] as const).map((t) => [t, SLICE.tables[t], true] as [string, string, boolean])));
  check("  …and the monthly read finds the table in EPA's zip, and since batch 141 the projects table",
    zipped.find((c) => c.number === "HQ-2020-0001")?.penalty === "1675000000" && zipped.find((c) => c.number === "HQ-1999-1049")?.projectsFigure === "20000000" &&
      /retrofit school buses/.test(zipped.find((c) => c.number === "HQ-1999-1049")?.projects?.[0] ?? ""));

  console.log("\nRead once a month, and kept");
  const db: FakeDb = { cases: new Map(), reads: null, listed: "1962-01-02" };
  const asked: (string | null)[] = [];
  const serve = (modified: string) => async (since: string | null): Promise<CaseFileAnswer> => {
    asked.push(since);
    return since === modified ? { cases: [], modified, outcome: "unchanged", httpStatus: 304 } : { cases, modified, outcome: "ok", httpStatus: 200 };
  };
  const first = await walkEpaCases(fakeDb(db), { budget: { left: 1 }, fetchFile: serve("Sat, 31 Oct 2026 16:07:24 GMT") });
  check("the first run reads the file and keeps every case", first.read === "stored" && first.cases === 8506 && db.cases.size === 8506 && db.reads?.modified === "Sat, 31 Oct 2026 16:07:24 GMT", JSON.stringify(first));
  const again = await walkEpaCases(fakeDb(db), { budget: { left: 1 }, fetchFile: serve("Sat, 31 Oct 2026 16:07:24 GMT") });
  check("  …a run within the month asks nothing", !again.due && asked.length === 1);
  db.reads = { ...(db.reads as NonNullable<FakeDb["reads"]>), ageDays: 31 };
  const same = await walkEpaCases(fakeDb(db), { budget: { left: 1 }, fetchFile: serve("Sat, 31 Oct 2026 16:07:24 GMT") });
  check("  …a month on, a copy EPA has not changed is not read again: it is asked with its Last-Modified",
    same.read === "unchanged" && asked[1] === "Sat, 31 Oct 2026 16:07:24 GMT" && db.reads?.ageDays === 0 && db.cases.size === 8506);
  db.reads = { ...(db.reads as NonNullable<FakeDb["reads"]>), ageDays: 31 };
  const spent = await walkEpaCases(fakeDb(db), { budget: { left: 0 }, fetchFile: serve("x") });
  const refused = await walkEpaCases(fakeDb(db), { budget: { left: 1 }, fetchFile: async () => ({ cases: [], modified: null, outcome: "throttled", httpStatus: 429 }) });
  check("  …one read a process, and a refusal keeps the cases kept and is asked again", spent.stopped === "this run's read is spent" && refused.failure?.httpStatus === 429 && db.cases.size === 8506 && db.reads?.ageDays === 31);
  const fetched = await withFetch(async () => new Response(new Blob([makeZip(CASE_TABLES.map((t) => [t, SLICE.tables[t], true] as [string, string, boolean])) as Uint8Array<ArrayBuffer>]), { status: 200, headers: { "last-modified": "Sun, 01 Nov 2026 00:00:00 GMT" } }), () => fetchCaseFile(null));
  check("a file that reads as a few thousand cases is refused as broken, not stored: EPA's holds 137,108", fetched.outcome === "error" && /only 8506 cases read/.test(fetched.detail ?? ""), JSON.stringify({ ...fetched, cases: fetched.cases.length }));
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
  check("  …and its units' cases by the units' keys: PSEG's 46 from its first price (of the replay's 47, one is of 1979), filed under Public Service Electric and Gas and PSEG Fossil, none under its own name (43 before batch 122 gave two suits their filing days and PSEG Fossil's 2002 settlement its own)",
    pegPage.outcome === "ok" && pegPage.events.length === eventsOn("PEG", "1980-01-02").length && pegPage.events.length === 46, `${pegPage.events.length} on PEG`);
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
  check("the replay's utilities, before first prices: PSEG 47, AEP 44, Southern 39, Dominion 36, FirstEnergy 29, National Grid 27, Exelon 22, NextEra 20 (44, 40, 37, 34, 26, 27, 22 and 19 before batch 122's suits filed and settlements on their own days, which add to ten); thirteen had no EPA row (PSEG, Exelon, NextEra, NiSource, DTE, WEC, Vistra, OGE, Hawaiian Electric, MGE, IDACORP, TXNM, Evergy). FirstEnergy, NiSource and Alliant each have one more than batch 114's slice gave: a case EPA lists with no defendant, read by its name (batch 116)",
    ["PEG 47", "AEP 44", "SO 39", "D 36", "NGG 27", "FE 29", "EXC 22", "NEE 20", "NI 19", "LNT 12", "CMS 17", "DTE 18", "WEC 16", "VST 11", "OGE 6", "HE 6", "MGEE 4", "IDA 4", "TXNM 5", "EVRG 1"].every((x) => counts.split(", ").includes(x)), counts);
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
  check("the replay, before first prices: Honeywell 252, RTX 123 (124 before the 2026-11-08 audit's UT Automotive fix), Goodyear 107, Pfizer 106, Air Products 66, Kinder Morgan 59, Berkshire 59, LyondellBasell 56, Valero 53, Rio Tinto 48, Westlake 46, Republic Services 33… (246, 121, 103, 105, 66, 59, 58, 55, 53, 43, 45 and 33 before batch 122's suits filed and settlements on their own days)",
    gains === "HON 252, RTX 123, BRK-B 59, RSG 33, APD 66, PFE 106, VLO 53, RIO 48, WLK 46, WMB 34, GT 107, TSN 64, KMI 59, SYY 30, MOS 22, LYB 56, TTE 22, PEP 22, DE 33, FCX 21, SLB 21, HUN 28, TXT 71, ENB 12, TAP 9, TRP 8, BUD 5, HMC 5, CVS 10, CLF 2, OTIS 1, SOBO 1", gains);

  // the 2026-11-08 proposal 2, approved by the owner on 2026-11-08 (batch 122)
  console.log("\nEPA's own days: the day a suit was filed in court, and each settlement of a case all the company's on its own day (batch 122, the 2026-11-08 proposal 2)");
  const wecCase = byNumber.get("05-2003-0333");
  const settledRows = eachRow(SLICE.tables[SETTLEMENT_TABLE], ["CASE_NUMBER", "FED_PENALTY_ASSESSED_AMT", "STATE_LOCAL_PENALTY_AMT", "COMPLIANCE_ACTION_COST", "SETTLEMENT_LODGED_DATE"]).filter((r) => r[0] === "05-2003-0333");
  check("the case file keeps a court case's filing day and each settlement on its own day, with its own figures: Wisconsin Electric's suit filed 2003-04-29, settled 2003-07-10 ($3,100,000 federal and $100,000 state, $620,000,000 of work) and 2014-07-08",
    wecCase?.suitFiled === "2003-04-29" && wecCase.day === "2014-07-08" && wecCase.penalty === null &&
      JSON.stringify(wecCase.settlements) === JSON.stringify([{ day: "2003-07-10", lodged: true, penalty: "3200000", work: "620000000", costRecovery: null, projectsFigure: null, projects: [] }, { day: "2014-07-08", lodged: true, penalty: null, work: null, costRecovery: null, projectsFigure: null, projects: [] }]) &&
      settledRows.some((r) => r[1] === "3100000" && r[2] === "100000" && r[3] === "620000000" && r[4] === "07/10/2003"),
    JSON.stringify(wecCase?.settlements));
  check("  …every settlement's figures digits, never a float, and its day a day; an administrative case has no filing day",
    cases.every((c) => (c.settlements ?? []).every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.day) && [x.penalty, x.work].every((m) => m === null || /^\d+(?:\.\d{2})?$/.test(m)))) &&
      cases.filter((c) => !c.court).every((c) => c.suitFiled === null) && cases.filter((c) => c.suitFiled).length > 1500,
    `${cases.filter((c) => c.suitFiled).length} filing days`);
  const undated = readCases({ ...SLICE.tables, [SETTLEMENT_TABLE]: withoutColumns(SLICE.tables[SETTLEMENT_TABLE], ["SETTLEMENT_LODGED_DATE", "SETTLEMENT_ENTERED_DATE"]) });
  check("  …and a settlements table without its two days, as the file's before batch 122, gives the figures as before and no settlement a day of its own",
    undated.every((c) => (c.settlements ?? []).length === 0) && undated.find((c) => c.number === "HQ-2020-0001")?.penalty === "1675000000" &&
      undated.every((c, k) => c.penalty === cases[k].penalty && c.workOrdered === cases[k].workOrdered));
  const aepSuit = rowOn("AEP", "1999-11-03");
  check("(a) AEP's three case numbers of its national New Source Review suit, all filed 1999-11-03, make one \"suit filed\" row that day, with no money: that is its settlements' of 2007-10-09",
    aepSuit?.title === "EPA suit filed in court (Clean Air Act), and 2 more cases that day" && aepSuit.dedupBasis === `epa:${rowOf("AEP")[0]}@1999-11-03:filed` &&
      aepSuit.externalId === "03-1999-0388,04-1999-9000,05-1999-0644" && !/civil penalty|work ordered/.test(`${aepSuit.title} ${aepSuit.description}`) &&
      /its first settlement dated 2007-10-09/.test(aepSuit.description ?? "") && /The day the suits were filed in court\.$/.test(aepSuit.description ?? ""),
    `${aepSuit?.title} · ${aepSuit?.description?.slice(0, 300)}`);
  const dukSuit = rowOn("DUK", "2000-12-22");
  check("  …Duke Energy's Clean Air Act suit (04-2000-0278) has its row on 2000-12-22, fifteen years before its settlement of 2015-09-10",
    dukSuit?.externalId === "04-2000-0278" && dukSuit.title === "EPA suit filed in court (Clean Air Act)" && /its first settlement dated 2015-09-10\. The day the suit was filed in court\.$/.test(dukSuit.description ?? "") &&
      has(eventsOn("DUK"), "04-2000-0278") && rowOn("DUK", "2015-09-10")?.externalId === "04-2000-0278", dukSuit?.description);
  const suitOf = (t: string, number: string) => eventsOn(t).find((e) => /:filed$/.test(e.dedupBasis ?? "") && has([e], number));
  check("  …under the rule's tests on the filing day: Mobil's suit of 1996 (02-1994-0104) is no ExxonMobil row, Mobil being its from 1999-11-30, while its settlement of 2001-12-13 is; Cinergy's of 2000 no Duke row; Texaco's of 1993 no Chevron row",
    !suitOf("XOM", "02-1994-0104") && rowOn("XOM", "2001-12-13")?.externalId === "02-1994-0104" && byNumber.get("02-1994-0104")?.suitFiled === "1996-03-28" &&
      !suitOf("DUK", "05-2000-0260") && has(eventsOn("DUK"), "05-2000-0260") && !suitOf("CVX", "09-1992-0137") && has(eventsOn("CVX"), "09-1992-0137"));
  check("  …only where the page's own that day are every defendant, or at least half of fewer than 10: CSX's of 1992 (one of its two) is a row; JPMorgan's BKK decree (one of three) and Chem-Dyne's Superfund suit of 174 parties are none",
    !!suitOf("CSX", "04-1990-0027") && has(eventsOn("JPM"), "09-2015-2505") && !suitOf("JPM", "09-2015-2505") && byNumber.get("09-2015-2505")?.defendants.length === 3 &&
      byNumber.get("05-1982-0016")?.defendants.length === 174 && byNumber.get("05-1982-0016")?.suitFiled === "1982-08-26" &&
      [...out.values()].every((evs) => !evs.some((e) => /:filed$/.test(e.dedupBasis ?? "") && has([e], "05-1982-0016"))) && MANY_PARTIES === 10);
  check("  …and only a suit filed more than 30 days before its first settlement: General Motors' at Van Nuys, filed 29 days before (HQ-1984-0004), and Murphy Oil USA's, filed the day before (06-1989-0135), have none; a case whose own row is its filing day has no second",
    SUIT_LEAD_DAYS === 30 && !suitOf("GM", "HQ-1984-0004") && has(eventsOn("GM"), "HQ-1984-0004") && byNumber.get("HQ-1984-0004")?.suitFiled === "1984-08-27" &&
      !suitOf("MUR", "06-1989-0135") && has(eventsOn("MUR"), "06-1989-0135") &&
      cases.filter((c) => c.step === "filed").every((c) => [...out.values()].every((evs) => !evs.some((e) => /:filed$/.test(e.dedupBasis ?? "") && has([e], c.number)))));
  const filedRows = rows.filter(({ e }) => /:filed$/.test(e.dedupBasis ?? ""));
  const filedPairs = filedRows.flatMap(({ t, e }) => (e.externalId ?? "").split(",").map((n) => `${t} ${n}`));
  check("  …237 rows on 109 pages, 263 cases (268 a page's), 223 of them before 2017 and 170 before 2001 (228, 106, 254, 259, 214 and 162 before batch 135's units); none carries a penalty or work ordered, none 10 parties or more",
    filedRows.length === 237 && new Set(filedRows.map(({ t }) => t)).size === 109 && filedPairs.length === 268 && new Set(filedPairs.map((x) => x.split(" ")[1])).size === 263 &&
      filedRows.filter(({ e }) => e.date < "2017").length === 223 && filedRows.filter(({ e }) => e.date < "2001").length === 170 &&
      filedRows.every(({ e }) => !/civil penalty|work ordered/.test(`${e.title} ${e.description}`) && (e.externalId ?? "").split(",").every((n) => (byNumber.get(n)?.defendants.length ?? 99) < MANY_PARTIES)),
    `${filedRows.length} rows on ${new Set(filedRows.map(({ t }) => t)).size}; ${filedPairs.length} pairs, ${new Set(filedPairs.map((x) => x.split(" ")[1])).size} cases; ${filedRows.filter(({ e }) => e.date < "2017").length} before 2017, ${filedRows.filter(({ e }) => e.date < "2001").length} before 2001`);
  const wec03 = rowOn("WEC", "2003-07-10");
  const wec14 = rowOn("WEC", "2014-07-08");
  check("(b) Wisconsin Electric's case of two settlements has a row for each: 2003-07-10 with its $3,200,000 penalty and $620,000,000 of work, and 2014-07-08, the row it had, keeping its key and EPA's summary; on WEC's page and on its notes record's (WELPP)",
    wec03?.title === "EPA consent decree: $3,200,000 civil penalty (Clean Air Act)" && /\(case 05-2003-0333, settlement 1 of 2\): work ordered \$620,000,000, EPA's estimate\. The day the settlement was lodged in court\.$/.test(wec03.description ?? "") &&
      wec14?.dedupBasis === `epa:${rowOf("WEC")[0]}@2014-07-08` && /settlement 2 of 2/.test(wec14.description ?? "") && /EPA's summary: WE Energies/.test(wec14.description ?? "") &&
      rowOn("WELPP", "2003-07-10")?.title === wec03.title && rowOn("WEC", "2003-04-29")?.title === "EPA suit filed in court (Clean Air Act)",
    `${wec03?.title} · ${wec03?.description}`);
  check("  …GE's Hudson River decree (02-2005-0015) on 2005-10-06 ($150,000,000 of work), 2009-03-23 and 2010-12-31 ($2,100,000,000); its Pittsfield and Housatonic case on six days from 1999-10-07 ($500,000,000)",
    /settlement 1 of 3, Justice Department docket 90-11-2-529\): work ordered \$150,000,000/.test(rowOn("GE", "2005-10-06")?.description ?? "") && /settlement 2 of 3/.test(rowOn("GE", "2009-03-23")?.description ?? "") &&
      /settlement 3 of 3, Justice Department docket 90-11-2-529\): work ordered \$2,100,000,000/.test(rowOn("GE", "2010-12-31")?.description ?? "") &&
      /settlement 1 of 6\): work ordered \$500,000,000/.test(rowOn("GE", "1999-10-07")?.description ?? "") && eventsOn("GE").filter((e) => has([e], "01-2000-0035")).length === 6);
  check("  …settlements of one day are one row, their figures added in whole cents: Dominion's case of four has its first on 2003-04-21 ($5,300,000; $1,210,900,000 of work) and \"settlements 2 to 4 of 4\" on 2016-09-20",
    rowOn("D", "2003-04-21")?.title === "EPA consent decree: $5,300,000 civil penalty (Clean Air Act)" && /work ordered \$1,210,900,000/.test(rowOn("D", "2003-04-21")?.description ?? "") &&
      /\(case 03-2000-0138, settlements 2 to 4 of 4, Justice Department docket 90-5-2-1-07122\)\./.test(rowOn("D", "2016-09-20")?.description ?? "") &&
      JSON.stringify(bySettlement({ ...(byNumber.get("03-2000-0138") as EpaCase), settlements: [{ day: "2003-04-21", lodged: true, penalty: "0.10", work: null }, { day: "2003-04-21", lodged: false, penalty: "0.20", work: "5" }, { day: "2004-01-02", lodged: false, penalty: null, work: null }] })?.map((v) => [v.day, v.step, v.penalty, v.workOrdered])) ===
        JSON.stringify([["2003-04-21", "lodged", "0.30", "5"], ["2004-01-02", "entered", null, null]]));
  const murphy = (t: string) => eventsOn(t).filter((e) => has([e], "05-2009-5506")).map((e) => e.date).sort().join(",");
  check("  …each on the page whose own are every defendant that day: Murphy Oil USA's settlements of 2010 and 2012 are Murphy Oil's, its of 2019 and 2020 Murphy USA's, the unit being MUSA's from 2013-08-30; Texaco's of 1993 no Chevron row",
    murphy("MUR") === "2010-09-28,2012-04-27" && murphy("MUSA") === "2019-05-17,2020-02-21" && rowOn("MUR", "2010-09-28")?.title === "EPA consent decree: $367,187.50 civil penalty (Clean Air Act)" &&
      eventsOn("CVX").filter((e) => has([e], "09-1992-0137")).map((e) => e.date).join(",") === "2013-07-18",
    `MUR ${murphy("MUR")}; MUSA ${murphy("MUSA")}`);
  check("  …while a case of several parties keeps one row, as before: Deepwater Horizon's four settlements, of MOEX, Transocean, BP and Anadarko",
    eventsOn("BP").filter((e) => has([e], "04-2010-9036")).length === 1 && (byNumber.get("04-2010-9036")?.settlements ?? []).length >= 4);
  // the rule before batch 122: no filing day, no settlement's day
  const before122 = (c: EpaCase): EpaCase => ({ ...c, suitFiled: null, settlements: [] });
  let kept122 = 0;
  const lost122: string[] = [];
  let gainedRows = 0;
  const splitPairs = new Set<string>();
  let views = 0;
  for (const [t, evs] of out) {
    const { held, namesIn, cik } = inputs.get(t)!;
    const keys = new Set(evs.map((e) => e.dedupBasis));
    const was = epaEvents(held.map(before122), namesIn, { cik });
    const wasKeys = new Set(was.map((e) => e.dedupBasis));
    for (const e of was) (keys.has(e.dedupBasis) ? kept122++ : lost122.push(`${t} ${e.dedupBasis}`));
    gainedRows += evs.filter((e) => !wasKeys.has(e.dedupBasis) && !/:filed$/.test(e.dedupBasis ?? "")).length;
    for (const e of evs) for (const m of (e.description ?? "").matchAll(/\(case ([^,)]+), settlements? \d+/g)) {
      splitPairs.add(`${t} ${m[1]}`);
      views++;
    }
  }
  check("  …31 cases a page's (28 cases on 27 pages) on 75 settlement rows, 39 of them new; every row the rule before gave is still given under its own key: 9,128, none moved, none lost (9,110 before the 2026-11-11 audit's Amazon unit and Brink's Inc.; 8,888 before batch 135's units; 8,889 before the 2026-11-08 audit's UT Automotive fix)",
    splitPairs.size === 31 && new Set([...splitPairs].map((x) => x.split(" ")[1])).size === 28 && new Set([...splitPairs].map((x) => x.split(" ")[0])).size === 27 && views === 75 &&
      gainedRows === 39 && kept122 === 9128 && lost122.length === 0 && rows.every(({ e }) => !e.legacyDedupBasis || /:no-penalty$/.test(e.legacyDedupBasis) || /@\d{4}-\d{2}-\d{2}$/.test(e.legacyDedupBasis)),
    `${splitPairs.size} pairs, ${views} views, ${gainedRows} new; kept ${kept122}, lost ${lost122.slice(0, 3).join(" ; ")}`);
  // a case whose own day is no settlement's leaves it: its stored row moves onto the last settlement's
  const wecCik = rowOf("WEC")[0];
  const amended: EpaCase = { ...(wecCase as EpaCase), number: "ZZ-AMENDED", day: "2015-01-05" };
  const order = (number: string, d: string): EpaCase => ({ number, name: "WISCONSIN ELECTRIC POWER COMPANY", court: false, day: d, step: "order", penalty: null, laws: ["CAA"], defendants: ["Wisconsin Electric Power Company"], docket: null });
  const moved = epaEvents([amended, order("ZZ-ORDER-1", "2015-01-05"), order("ZZ-ORDER-2", "2015-01-20")], namesOf("WEC"), { cik: wecCik });
  const unmoved = epaEvents([before122(amended)], namesOf("WEC"), { cik: wecCik });
  check("  …and a case whose own day is no settlement's moves its stored row onto its last settlement's, so the row keeps its history; the month's orders of that day never take it",
    unmoved.length === 1 && unmoved[0].dedupBasis === `epa:${wecCik}@2015-01-05` &&
      moved.find((e) => e.date === "2014-07-08")?.legacyDedupBasis === `epa:${wecCik}@2015-01-05` && !moved.some((e) => e.date === "2015-01-05" && e.precision !== "month") &&
      moved.find((e) => e.precision === "month")?.legacyDedupBasis === undefined && moved.some((e) => e.date === "2003-07-10"),
    moved.map((e) => `${e.date} ${e.dedupBasis} ${e.legacyDedupBasis ?? ""}`).join(" | "));
  const aepPage = await epaCasesFor(fakeDb({ ...db, listed: "1962-01-02" }), 1, plan("AEP"), noWalk);
  const sameRows = (a: TimelineEvent[], b: TimelineEvent[]) => JSON.stringify(a.map((e) => [e.id, e.title, e.description, e.legacyDedupBasis ?? null])) === JSON.stringify(b.map((e) => [e.id, e.title, e.description, e.legacyDedupBasis ?? null]));
  const caseDays = read("db/044_epa_case_days.sql");
  check("the store keeps them (db/044) and a company's ingest gives the same rows from it: AEP's 44, its suits filed and Muskingum River's four settlements among them; the next run reads EPA's file whole",
    aepPage.events.length === 44 && sameRows(aepPage.events, eventsOn("AEP", "1962-01-02")) && aepPage.events.filter((e) => has([e], "05-1999-0644")).length === 5 &&
      /ADD COLUMN IF NOT EXISTS suit_filed date/.test(caseDays) && /settlement_days date\[\]/.test(caseDays) && /settlement_lodged boolean\[\]/.test(caseDays) &&
      /settlement_penalties numeric\(16, 2\)\[\]/.test(caseDays) && /settlement_work numeric\(16, 2\)\[\]/.test(caseDays) && /^DELETE FROM epa_reads;$/m.test(caseDays),
    `${aepPage.events.length} on AEP`);

  // batch 129, the 2026-11-09 proposal 4, approved by the owner that day
  console.log("\nEPA's cost recovery on the rows (batch 129, the 2026-11-09 proposal 4)");
  const ford = byNumber.get("05-1991-0214");
  const kramer = byNumber.get("02-1989-0358");
  check("the case file keeps EPA's cost recovery, the case's total else its one settlement's, and each settlement's own: Ford's $55,513,499 of 1993, the 225-party decree's $95,000,000",
    ford?.costRecovery === "55513499" && ford.penalty === null && ford.workOrdered === null && ford.settlements?.[0]?.costRecovery === "55513499" &&
      kramer?.costRecovery === "95000000" && kramer.defendants.length === 225 &&
      cases.filter((c) => c.costRecovery).length === 1141 && cases.every((c) => [c.costRecovery, ...(c.settlements ?? []).map((x) => x.costRecovery)].every((m) => m == null || /^\d+(?:\.\d{2})?$/.test(m))),
    `${ford?.costRecovery} ${kramer?.costRecovery}; ${cases.filter((c) => c.costRecovery).length} cases`);
  // the slice's two tables as an older copy wrote them, without the columns
  const csvOf = (head: readonly string[], rows: string[][]) => `${[head, ...rows].map((r) => r.map((x) => `"${x.replace(/"/g, '""')}"`).join(",")).join("\n")}\n`;
  const without = (table: "CASE_ENFORCEMENTS.csv" | typeof SETTLEMENT_TABLE, column: string) => {
    const text = SLICE.tables[table];
    const head = (text.slice(0, text.indexOf("\n")).match(/"[^"]*"/g) ?? []).map((h) => h.slice(1, -1)).filter((h) => h !== column);
    const rows: string[][] = [];
    eachCsvRow(text, head, (v) => rows.push(v));
    return csvOf(head, rows);
  };
  const bare = readCases({
    ...SLICE.tables,
    "CASE_ENFORCEMENTS.csv": without("CASE_ENFORCEMENTS.csv", "TOTAL_COST_RECOVERY_AMT"),
    [SETTLEMENT_TABLE]: without(SETTLEMENT_TABLE, "COST_RECOVERY_AWARDED_AMT"),
  } as Parameters<typeof readCases>[0]);
  check("  …and a file without the columns gives none and every other figure as before: degraded, not broken",
    bare.length === cases.length && bare.every((c, k) => !c.costRecovery && !c.settlements?.some((x) => x.costRecovery) && c.penalty === cases[k].penalty && c.workOrdered === cases[k].workOrdered) &&
      SLICE.tables["CASE_ENFORCEMENTS.csv"].startsWith('"CASE_NUMBER","CASE_NAME","ACTIVITY_TYPE_CODE","TOTAL_PENALTY_ASSESSED_AMT","DOJ_DOCKET_NMBR","TOTAL_COMP_ACTION_AMT","ENF_SUMMARY_TEXT","TOTAL_COST_RECOVERY_AMT"') &&
      /Batch 129 added the case table's TOTAL_COST_RECOVERY_AMT and the settlements table's COST_RECOVERY_AWARDED_AMT/.test(SLICE.provenance));
  const costRowOn = (t: string, d: string, number: string) => eventsOn(t).find((e) => e.date === d && e.precision !== "month" && has([e], number));
  const fordRow = costRowOn("F", "1993-08-25", "05-1991-0214");
  check("Ford's Superfund decree of 1993-08-25, which showed no figure, gives its $55,513,499: \"EPA's costs recovered\", Ford alone",
    fordRow?.title === "EPA consent decree (Superfund law (CERCLA))" && /^FORD MOTOR CO\. - WDE \(case 05-1991-0214\): EPA's costs recovered \$55,513,499\. The day/.test(fordRow.description ?? ""),
    fordRow?.description?.slice(0, 120));
  const pittsfield = costRowOn("GE", "1999-10-07", "01-2000-0035");
  const hudson = costRowOn("GE", "2005-10-06", "02-2005-0015");
  const ge2006 = costRowOn("GE", "2006-09-20", "01-2006-0214");
  check("  …GE's Pittsfield and Housatonic settlement of 1999-10-07 its $71,000,000 beside its $500,000,000 of work, the Hudson River decree of 2005-10-06 its $26,000,000 beside $150,000,000, its New Hampshire case of 2006 its $13,103,095",
    /settlement 1 of 6\): work ordered \$500,000,000, EPA's estimate; EPA's costs recovered \$71,000,000\./.test(pittsfield?.description ?? "") &&
      /settlement 1 of 3, Justice Department docket 90-11-2-529\): work ordered \$150,000,000, EPA's estimate; EPA's costs recovered \$26,000,000\./.test(hudson?.description ?? "") &&
      /\(case 01-2006-0214\): EPA's costs recovered \$13,103,095\./.test(ge2006?.description ?? ""),
    `${pittsfield?.description?.slice(0, 140)} | ${hudson?.description?.slice(0, 140)}`);
  const gmLiq = byNumber.get("03-2009-7032");
  check("  …a case split by settlement gives each its own: Motors Liquidation's 2012-01-30 settlement $2,448,334, not the case's $12,501,182 the proposal counted",
    gmLiq?.costRecovery === null && JSON.stringify(gmLiq?.settlements?.map((x) => x.costRecovery)) === JSON.stringify(["10052848", "2448334"]) &&
      (bySettlement(gmLiq as EpaCase) ?? []).map((v) => v.costRecovery).join() === "10052848,2448334",
    JSON.stringify(gmLiq?.settlements));
  const kramerRow = costRowOn("HON", "1998-05-08", "02-1989-0358");
  check("  …and a settlement of several parties says among how many, as the work ordered does: the Kramer landfill decree of 1998-05-08 \"$95,000,000, among 225 parties\"",
    /KRAMER, HELEN ET AL \(case 02-1989-0358, Justice Department docket 90-11-2-433A\), against ALLIEDSIGNAL INC and 224 other defendants: EPA's costs recovered \$95,000,000, among 225 parties/.test(kramerRow?.description ?? ""),
    kramerRow?.description?.slice(0, 200));
  const suitRows = [...out.values()].flat().filter((e) => e.id.endsWith("-filed"));
  const suitCases = suitRows.flatMap((e) => (e.externalId ?? "").split(",")).map((n) => byNumber.get(n));
  check("a suit's filing row keeps no money: none of the replay's 237 says a cost recovery, though 77 of their cases have one (228 and 76 before batch 135's units)",
    suitRows.length === 237 && suitRows.every((e) => !/costs recovered|civil penalty|work ordered/.test(`${e.title} ${e.description}`)) &&
      suitCases.filter((c) => c?.costRecovery || c?.settlements?.some((x) => x.costRecovery)).length === 77,
    `${suitRows.length} filed rows; ${suitCases.filter((c) => c?.costRecovery || c?.settlements?.some((x) => x.costRecovery)).length} with a cost recovery`);
  // the replay again with the cost recovery taken away: only a row's description may differ
  let carrying = 0, bareBefore = 0, cost2017 = 0, cost2001 = 0, monthCarrying = 0, sameElse = true;
  const carryingPages = new Set<string>();
  for (const [ticker, { held, namesIn, cik }] of inputs) {
    const without = new Map(epaEvents(held.map((c) => ({ ...c, costRecovery: null, settlements: c.settlements?.map((x) => ({ ...x, costRecovery: null })) })), namesIn, { cik }).map((e) => [e.id, e]));
    for (const e of out.get(ticker) ?? []) {
      const b = without.get(e.id);
      if (!b || b.title !== e.title || b.date !== e.date || b.externalId !== e.externalId || b.dedupBasis !== e.dedupBasis) sameElse = false;
      if (!/EPA's costs recovered/.test(e.description ?? "")) continue;
      carrying++;
      carryingPages.add(ticker);
      if (e.precision === "month") monthCarrying++;
      if (b && !/civil penalty|work ordered/.test(`${b.title} ${(b.description ?? "").replace(/EPA's summary[\s\S]*$/, "")}`)) {
        bareBefore++;
        if (e.date < "2017") cost2017++;
        if (e.date < "2001") cost2001++;
      }
    }
  }
  check("before any first price, 3,008 of the replay's rows on 384 pages name a cost recovery, 117 of them a month's; 2,077 showed no money before, 1,875 of them before 2017 and 1,032 before 2001; no row's day, title or key changes (2,942, 380, 114, 2,030, 1,831 and 1,000 before batch 135's units)",
    carrying === 3008 && carryingPages.size === 384 && monthCarrying === 117 && bareBefore === 2077 && cost2017 === 1875 && cost2001 === 1032 && sameElse,
    `${carrying} on ${carryingPages.size}, ${monthCarrying} month rows; ${bareBefore} bare before, ${cost2017} before 2017, ${cost2001} before 2001; same otherwise ${sameElse}`);
  const gePage = await epaCasesFor(fakeDb({ ...db, listed: "1962-01-02" }), 1, plan("GE"), noWalk);
  const recovery = read("db/045_epa_cost_recovery.sql");
  check("the store keeps them (db/045) and a company's ingest gives the same rows from it, GE's figures among them; the next run reads EPA's file whole",
    db.cases.get("05-1991-0214")?.costRecovery === "55513499" && JSON.stringify(db.cases.get("01-2000-0035")?.stored?.cost) === JSON.stringify(["71000000", "790400", "619217", null, null, null]) &&
      sameRows(gePage.events, eventsOn("GE", "1962-01-02")) && gePage.events.some((e) => /EPA's costs recovered \$71,000,000\./.test(e.description ?? "")) &&
      /ADD COLUMN IF NOT EXISTS cost_recovery numeric\(16, 2\)/.test(recovery) && /ADD COLUMN IF NOT EXISTS settlement_cost_recovery numeric\(16, 2\)\[\]/.test(recovery) && /^DELETE FROM epa_reads;$/m.test(recovery),
    `${gePage.events.length} on GE`);

  // batch 141, the 2026-11-11 proposal 3, approved by the owner that day
  console.log("\nEPA's supplemental environmental projects on the rows (batch 141, the 2026-11-11 proposal 3)");
  const toyota = byNumber.get("HQ-1999-1049");
  const projectSettlements = cases.flatMap((c) => c.settlements ?? []).filter((x) => x.projectsFigure);
  check("the case file keeps each settlement's projects figure, the settlements table's SEP_AMT, and EPA's text of them; a case its one settlement's, or its own day's: Toyota's $20,000,000 of 2003, 278 of the slice's cases, 291 dated settlements (289 and 290 before the 2026-11-11 audit kept other days' projects off a case's row and added Amazon's cases)",
    toyota?.projectsFigure === "20000000" && JSON.stringify(toyota.projects) === JSON.stringify(["Toyota will spend $20 million to retrofit school buses and other heavy duty diesels"]) &&
      toyota.settlements?.find((x) => x.day === "2003-03-07")?.projectsFigure === "20000000" &&
      cases.filter((c) => c.projectsFigure).length === 278 && projectSettlements.length === 291 &&
      cases.every((c) => [c.projectsFigure, ...(c.settlements ?? []).map((x) => x.projectsFigure)].every((m) => m == null || /^\d+(?:\.\d{2})?$/.test(m))),
    `${toyota?.projectsFigure} ${JSON.stringify(toyota?.projects)}; ${cases.filter((c) => c.projectsFigure).length} cases, ${projectSettlements.length} settlements`);
  const projectRows: string[][] = [];
  eachCsvRow(SLICE.tables[PROJECT_TABLE], ["CASE_NUMBER", "ENF_CONCLUSION_ID", "SEP_ID", "SEP_TEXT"], (v) => projectRows.push(v));
  const textOnly = new Set(projectRows.filter((r) => r[3].trim() && !byNumber.get(r[0])?.projectsFigure).map((r) => r[0]));
  check("  …a text with no figure is not kept, and a case keeps a text only beside a figure: the slice's projects table names 678 rows, the texts of " + textOnly.size + " cases EPA gives no figure for left off",
    projectRows.length === 678 && textOnly.size > 0 && [...textOnly].every((n) => !byNumber.get(n)?.projects?.length) && cases.every((c) => !c.projects?.length || c.projectsFigure),
    `${projectRows.length} rows; ${textOnly.size} text-only cases`);
  // a project EPA lists once a category is one project: Toyota's again under a second category, and once more under a new id
  const toyotaRow = projectRows.find((r) => r[0] === "HQ-1999-1049") as string[];
  const doubled = readCases({ ...SLICE.tables, [PROJECT_TABLE]: `${SLICE.tables[PROJECT_TABLE]}"${toyotaRow[0]}","${toyotaRow[1]}","${toyotaRow[2]}","${toyotaRow[3]}"\n"${toyotaRow[0]}","${toyotaRow[1]}","9999","${toyotaRow[3]}."\n` } as Parameters<typeof readCases>[0]);
  check("  …each project once, though EPA lists it a row a category, and its spacing and last full stop tidied but its words EPA's",
    JSON.stringify(doubled.find((c) => c.number === "HQ-1999-1049")?.projects) === JSON.stringify(toyota?.projects) &&
      projectText("  WORKPLACE SYSTEMS REPLACED ITS WET PAINT SYSTEM WITH A DRDRY   POWDER PAINT SYSTEM.   ") === "WORKPLACE SYSTEMS REPLACED ITS WET PAINT SYSTEM WITH A DRDRY POWDER PAINT SYSTEM" &&
      projectText("  .  ") === null && projectText("A\u0000B project") === "A B project");
  const noProjects = readCases({
    ...SLICE.tables,
    [SETTLEMENT_TABLE]: without(SETTLEMENT_TABLE, "SEP_AMT"),
    [PROJECT_TABLE]: undefined,
  } as unknown as Parameters<typeof readCases>[0]);
  check("  …and a file without the column or the table gives none and every other figure as before: degraded, not broken",
    noProjects.length === cases.length && noProjects.every((c, k) => !c.projectsFigure && !c.projects?.length && !c.settlements?.some((x) => x.projectsFigure) && c.penalty === cases[k].penalty && c.costRecovery === cases[k].costRecovery) &&
      SLICE.tables[SETTLEMENT_TABLE].slice(0, SLICE.tables[SETTLEMENT_TABLE].indexOf("\n")).endsWith('"COST_RECOVERY_AWARDED_AMT","SEP_AMT"') &&
      /Batch 141 added the settlements table's SEP_AMT for the same rows, and every row of the projects table/.test(SLICE.provenance));

  const toyotaRows = eventsOn("TM").filter((e) => has([e], "HQ-1999-1049"));
  const decree = toyotaRows.find((e) => e.date === "2003-03-07");
  const toyotaSuit = toyotaRows.find((e) => e.date === "1999-07-12");
  check("Toyota's decree of 2003-03-07 names the $20,000,000 and EPA's text of the retrofits; its suit's row of 1999-07-12 names none",
    /^TOYOTA MOTOR CORP \(case HQ-1999-1049\), with 1 other defendant: work ordered \$14,000,000, EPA's estimate, among 2 parties; supplemental environmental projects \$20,000,000, EPA's figure, among 2 parties: "Toyota will spend \$20 million to retrofit school buses and other heavy duty diesels"\. The day the settlement was lodged in court\./.test(decree?.description ?? "") &&
      decree?.title === "EPA consent decree: $500,000 civil penalty (Clean Air Act)" && toyotaSuit?.id.endsWith("-filed") === true && !/supplemental environmental projects/.test(toyotaSuit?.description ?? ""),
    `${decree?.description?.slice(0, 300)} | ${toyotaSuit?.description}`);
  const psegRows = eventsOn("PEG").filter((e) => has([e], "02-2001-0020"));
  check("  …PSEG's case 02-2001-0020 gives its $6,000,000 to its settlement of 2002-05-31 alone, not to the amendment of 2006-11-30 or the suit of 2002-01-24",
    psegRows.length === 3 && /settlement 1 of 2, [^)]*\): work ordered \$345,000,000, EPA's estimate; supplemental environmental projects \$6,000,000, EPA's figure: "Carbon Dioxide Reduction Program, Methane Gas Recovery, Mercury Reductgion and Monitoring"\./.test(psegRows.find((e) => e.date === "2002-05-31")?.description ?? "") &&
      psegRows.filter((e) => /supplemental environmental projects/.test(e.description ?? "")).length === 1,
    psegRows.map((e) => `${e.date}: ${e.description?.slice(0, 160)}`).join(" | "));
  const bpRow = eventsOn("BP").find((e) => e.date === "2009-02-19" && has([e], "06-2006-3402"));
  const chevronDay = eventsOn("CVX").find((e) => e.date === "2018-10-24" && e.precision !== "month");
  check("  …BP's Texas City decree of 2009-02-19 its $6,000,000 to retrofit the city's vehicles; Chevron's two cases of 2018-10-24 each its own, $6,395,744.08 and $3,100,165",
    /supplemental environmental projects \$6,000,000, EPA's figure: "the Facility is going to retrofit 100 City of Texas City vehicles with LNG and build 4 refueling stations for LNG"\./.test(bpRow?.description ?? "") &&
      /\(case 09-2016-3511\): [^;]*; [^;]*; supplemental environmental projects \$6,395,744\.08, EPA's figure: "Chevron will supply emergency response equipment/.test(chevronDay?.description ?? "") &&
      /\(case 04-2016-9013, [^)]*\): [^;]*; [^;]*; supplemental environmental projects \$3,100,165, EPA's figure: "EMERGENCY PLANNING & PREPAREDNESS"\./.test(chevronDay?.description ?? ""),
    `${bpRow?.description?.slice(0, 260)} | ${chevronDay?.description?.slice(0, 500)}`);
  const motiva = eventsOn("SHEL").find((e) => e.date === "2005-09-20" && has([e], "03-2001-0334"));
  check("  …a settlement of several parties says among how many, and EPA's text as written, cut at a word and marked: Motiva's $6,385,000 of 2005 on Shell, \"among 3 parties\"",
    /supplemental environmental projects \$6,385,000, EPA's figure, among 3 parties: "1\. Hybrid Bus Project\. Motiva shall purchase hybrid transit busses for the elaware Transit Corporation [^"]*…"\./.test(motiva?.description ?? ""),
    motiva?.description?.slice(0, 600));
  const longestQuote = cases.filter((c) => c.projects?.length).map((c) => projectsQuoted(c.projects ?? [])).sort((a, b) => b.length - a.length)[0];
  check("  …however long EPA's text, a case's quote holds " + PROJECT_CAP + " characters of it at most, and says how many more projects it leaves",
    projectsQuoted(["a ".repeat(400), "second project"]).endsWith('…" and 1 more') && projectsQuoted(["short one", "second"]) === '"short one" and "second"' &&
      longestQuote.replace(/" and \d+ more$/, '"').replace(/"/g, "").replace(/ and /g, "").length <= PROJECT_CAP + 2,
    longestQuote.slice(0, 80));
  const noFigure = eventsOn("GE").find((e) => e.date === "1999-10-07" && has([e], "01-2000-0035"));
  check("  …and a case with no projects figure says nothing of one: GE's Pittsfield settlement of 1999-10-07, its other figures as before",
    !!noFigure && !/supplemental environmental projects/.test(noFigure.description ?? "") && /EPA's costs recovered \$71,000,000\./.test(noFigure.description ?? ""));
  check("a suit's filing row keeps no projects: none of the replay's 237 says one",
    suitRows.length === 237 && suitRows.every((e) => !/supplemental environmental projects/.test(e.description ?? "")));
  // the replay again with the projects taken away: only a row's description may differ
  const HUNDRED = BigInt(100);
  const cents = (x: string) => { const [w, f = ""] = x.replace(/,/g, "").split("."); return BigInt(w) * HUNDRED + BigInt(f.padEnd(2, "0")); };
  let carryingProjects = 0, projects2017 = 0, projectsBare = 0, sameOtherwise = true, quoted = 0;
  let projectsSum = BigInt(0);
  const projectPages = new Map<string, number>();
  for (const [ticker, { held, namesIn, cik }] of inputs) {
    const without = new Map(epaEvents(held.map((c) => ({ ...c, projectsFigure: null, projects: [], settlements: c.settlements?.map((x) => ({ ...x, projectsFigure: null, projects: [] })) })), namesIn, { cik }).map((e) => [e.id, e]));
    for (const e of out.get(ticker) ?? []) {
      const b = without.get(e.id);
      if (!b || b.title !== e.title || b.date !== e.date || b.externalId !== e.externalId || b.dedupBasis !== e.dedupBasis || b.legacyDedupBasis !== e.legacyDedupBasis) sameOtherwise = false;
      const figures = [...(e.description ?? "").matchAll(/supplemental environmental projects \$([\d,]+(?:\.\d{2})?), EPA's figure/g)].map((m) => m[1]);
      if (!figures.length) continue;
      carryingProjects++;
      projectPages.set(ticker, (projectPages.get(ticker) ?? 0) + 1);
      if (e.date < "2017") projects2017++;
      if (/EPA's figure(?:, among \d+ parties)?: "/.test(e.description ?? "")) quoted++;
      if (b && !/civil penalty|work ordered|costs recovered/.test(`${b.title} ${(b.description ?? "").replace(/EPA's summary[\s\S]*$/, "")}`)) projectsBare++;
      for (const f of figures) projectsSum += cents(f);
    }
  }
  const projectsTotal = `${projectsSum / HUNDRED}.${(projectsSum % HUNDRED).toString().padStart(2, "0")}`;
  const topProjects = [...projectPages].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([t, n]) => `${t} ${n}`).join(", ");
  check("before any first price, 227 of the replay's rows on 112 pages name supplemental environmental projects, 184 of them before 2017, $186,798,376.96 in all, 225 with EPA's text; 2 showed no money before; most on Chevron 12, BP 11, Valero and ExxonMobil 8, Eastman Chemical 7; no row's day, title or key changes (230 rows on 111 pages, 187 before 2017, $209,133,056.96, as the 2026-11-11 proposal measured, before its audit kept four rows' projects of other days off them, $23,858,334, and added Amazon's $1,523,654 of 2018)",
    carryingProjects === 227 && projectPages.size === 112 && projects2017 === 184 && projectsTotal === "186798376.96" && quoted === 225 && projectsBare === 2 &&
      topProjects === "CVX 12, BP 11, VLO 8, XOM 8, EMN 7" && sameOtherwise,
    JSON.stringify({ carryingProjects, pages: projectPages.size, projects2017, projectsBare, quoted, projectsTotal, topProjects, sameOtherwise }));
  const cvxPage = await epaCasesFor(fakeDb({ ...db, listed: "1962-01-02" }), 1, plan("CVX"), noWalk);
  const projectsSql = read("db/050_epa_projects.sql");
  check("the store keeps them (db/050) and a company's ingest gives the same rows from it, Chevron's projects among them; the next run reads EPA's file whole",
    db.cases.get("HQ-1999-1049")?.projectsFigure === "20000000" && JSON.stringify(db.cases.get("02-2001-0020")?.stored?.projectsFigure) === JSON.stringify(["6000000", null]) &&
      sameRows(cvxPage.events, eventsOn("CVX", "1962-01-02")) && cvxPage.events.some((e) => /supplemental environmental projects \$6,395,744\.08, EPA's figure: "Chevron will supply/.test(e.description ?? "")) &&
      /ADD COLUMN IF NOT EXISTS projects_figure numeric\(16, 2\)/.test(projectsSql) && /ADD COLUMN IF NOT EXISTS projects text\[\]/.test(projectsSql) &&
      /ADD COLUMN IF NOT EXISTS settlement_projects_figure numeric\(16, 2\)\[\]/.test(projectsSql) && /ADD COLUMN IF NOT EXISTS settlement_projects text\[\]/.test(projectsSql) && /^DELETE FROM epa_reads;$/m.test(projectsSql),
    `${cvxPage.events.length} on CVX; ${JSON.stringify(db.cases.get("02-2001-0020")?.stored?.projectsFigure)}`);

  // the 2026-11-11 audit of batches 138–141 (batch 142)
  console.log("\nThe 2026-11-11 audit of batches 138–141 (batch 142)");
  const projectsOn = (t: string, d: string, number: string) => eventsOn(t).find((e) => e.date === d && e.precision !== "month" && has([e], number));
  const deepRow = projectsOn("BP", "2015-11-30", "04-2010-9036");
  const whiting = projectsOn("BP", "2021-12-02", "05-2007-3933");
  const copRow = projectsOn("COP", "2012-02-28", "06-2000-1237");
  const owens = projectsOn("OC", "2018-01-30", "05-2017-5026");
  const moexDay = (bySettlement(byNumber.get("04-2010-9036") as EpaCase) ?? []).find((v) => v.day === "2012-02-17");
  check("finding 1: a case of several settlements gives its row only its own day's projects: BP's Deepwater Horizon row of 2015-11-30 names none of MOEX's $10,000,000 of 2012, its Whiting row of 2021 none of 2012's $2,000,000, ConocoPhillips' of 2012 none of 2005's $1,600,000; MOEX's day keeps its own",
    !!deepRow && !/supplemental environmental projects/.test(deepRow.description ?? "") && !!whiting && !/supplemental environmental projects/.test(whiting.description ?? "") &&
      !!copRow && !/supplemental environmental projects/.test(copRow.description ?? "") && byNumber.get("04-2010-9036")?.projectsFigure === null && moexDay?.projectsFigure === "10000000",
    `${deepRow?.description?.slice(0, 160)} | ${copRow?.description?.slice(0, 160)}`);
  check("  …and Owens Corning's order of 2018-01-30 names its own $1,000,000, not the $229,634 of the order of 2017-03-27 beside it",
    /supplemental environmental projects \$1,000,000, EPA's figure/.test(owens?.description ?? "") && !/1,229,634/.test(owens?.description ?? ""), owens?.description?.slice(0, 300));
  const brinks = byNumber.get("02-2014-2001");
  const c1 = /[\u0080-\u009F]/;
  check("finding 5: EPA's Windows-1252 punctuation reads as itself, not as invisible control characters: \"Puerto Rico’s North Karst\", \"Brink’s Inc.\", whose case is now on Brink's page; no name, summary or project text the slice gives holds one",
    projectText("Puerto Rico\u0092s North Karst (\u0093SEP\u0094)") === "Puerto Rico’s North Karst (“SEP”)" && projectText("a\u0081b") === "a b" &&
      brinks?.defendants.includes("Brink’s Inc.") === true && has(eventsOn("BCO"), "02-2014-2001") &&
      cases.every((c) => ![c.name, ...c.defendants, c.summary ?? "", ...(c.projects ?? [])].some((x) => c1.test(x))) &&
      eventsOn("BP").some((e) => /the area’s premiere nesting/.test(e.description ?? "")),
    JSON.stringify(brinks?.defendants));
  const amznRows = eventsOn("AMZN");
  const amznOrder = amznRows.find((e) => e.date === "2018-02-14");
  check("finding 4: Amazon's own companies and sites are Amazon's: 21 EPA rows, not 4, its $1,215,700 pesticide order of 2018 with its $1,523,654 eLearning project and its two waste penalties among them; a case naming it only as a consignee or \"c/o\" for another firm, or its site beside another firm's name, is not",
    amznRows.length === 21 && amznOrder?.title === "EPA final order: $1,215,700 civil penalty (pesticides law (FIFRA))" &&
      /supplemental environmental projects \$1,523,654, EPA's figure: "Amazon Services LLC/.test(amznOrder.description ?? "") &&
      has(amznRows, "07-2022-0131") && has(amznRows, "07-2025-0052") && has(amznRows, "06-2018-0369") && has(amznRows, "08-2023-0073") &&
      ["06-2019-0303", "09-2025-0616", "09-2026-7014", "09-2026-4341", "08-2026-0186"].every((n) => !has(amznRows, n)) && unitKeysOf(rowOf("AMZN")[0]).includes("amazon"),
    `${amznRows.length} rows; ${amznOrder?.description?.slice(0, 200)}`);

  // the 2026-11-08 audit of batches 117–123 (batch 124)
  // batch 135, the 2026-11-09b proposal 3, approved by the owner on 2026-11-10
  console.log("\nA fourth round of units: names the caption rule refuses, each on its owner's page on its days (batch 135, the 2026-11-09b proposal 3)");
  check("Seaboard Farms' three settlements of 2006-09 (08-2003-0023, $205,000) are Seaboard's first EPA rows; Seaboard Asphalt and the Seaboard railroads are not its",
    has(eventsOn("SEB"), "08-2003-0023") && has(eventsOn("SEB"), "06-2002-3708") && has(eventsOn("SEB"), "06-2002-0999") &&
      !onPage("SEB", unitCase("SEABOARD ASPHALT PRODUCTS COMPANY", "2014-09-30")) && !onPage("SEB", unitCase("SEABOARD COAST LINE R.R. CO.", "2001-12-17")) &&
      onPage("SEB", unitCase("SEABOARD FARMS OF CHATTANOOGA, INC.", "2000-01-02")) && !onPage("SEB", unitCase("SEABOARD FARMS OF CHATTANOOGA, INC.", "2000-01-03")));
  check("Morgan Stanley Capital Group's $1,119,000 of 2017 (EF-2017-0003) is Morgan Stanley's; its two orders of 1997-05-20, before Dean Witter, Discover & Co.'s record merged with Morgan Stanley Group on 1997-05-31, are old Morgan Stanley's",
    has(eventsOn("MS"), "EF-2017-0003") && has(eventsOn("MS"), "EF-2009-7151") && !has(eventsOn("MS"), "HQ-1997-0324") && !has(eventsOn("MS"), "HQ-2001-0014"));
  check("Novartis Crop Protection is Novartis's to 2000-11-12, the eve of Syngenta: its case of 2000-11-06 is on the page, the same name a day after Syngenta's formation is no one's",
    has(eventsOn("NVS"), "04-1986-0063") && onPage("NVS", unitCase("NOVARTIS CROP PROTECTION, INC.", "2000-11-12")) && !onPage("NVS", unitCase("NOVARTIS CROP PROTECTION, INC.", "2000-11-13")) &&
      has(eventsOn("NVS"), "05-2006-0064") && !onPage("NVS", unitCase("NOVARTIS ANIMAL HEALTH US, INC.", "2015-01-01")) && !onPage("NVS", unitCase("NOVARTIS CONSUMER HEALTH, INC.", "2015-03-02")));
  check("GATX Terminals is GATX's to 2001-03-01 (GATX's 8-K of the sale to Kinder Morgan): its two Region 6 orders of 1999-12-15 are GATX's, its Superfund settlements of 2002, 2003 and 2008 and its orders of 2018 and 2022 no page's",
    has(eventsOn("GATX"), "06-1999-0364") && has(eventsOn("GATX"), "06-1999-0365") && ["04-2002-3753", "04-2003-3504", "04-2003-9007", "03-2018-4031", "03-2023-4004"].every((n) => !has(eventsOn("GATX"), n)));
  check("Akzo Nobel's chemicals companies are its to 2018-09-30: Surface Chemistry's $35,000 of 2017 is on the page, Functional Chemicals' $300,000 of 2019, filed beside Nouryon Functional Chemicals, is not; Akzo Chemicals of 1988–1994 is",
    has(eventsOn("AKZOY"), "05-2017-5020") && !has(eventsOn("AKZOY"), "04-2014-9008") && has(eventsOn("AKZOY"), "02-1991-0192") && !onPage("AKZOY", unitCase("AKZO NOBEL CHEMICALS, INC.", "2018-10-01")));
  check("Ashland's chemical companies are its own; Ashland Petroleum to 1997-12-31, the eve of the Marathon Ashland Petroleum venture, so its decree of 1998-10-01 is no one's; Ashland Distribution to its sale of 2011-03-31; Ashland Aqualon from Hercules' purchase, 2008-11-13",
    has(eventsOn("ASH"), "06-2006-0611") && has(eventsOn("ASH"), "04-1986-0051") && !has(eventsOn("ASH"), "05-1997-0237") &&
      onPage("ASH", unitCase("ASHLAND PETROLEUM COMPANY", "1997-12-31")) && !onPage("ASH", unitCase("ASHLAND PETROLEUM COMPANY", "1998-01-01")) &&
      !onPage("ASH", unitCase("ASHLAND DISTRIBUTION COMPANY", "2011-03-31")) && !onPage("ASH", unitCase("ASHLAND AQUALON FUNCTIONAL INGREDIENTS", "2008-11-12")) &&
      onPage("ASH", unitCase("ASHLAND AQUALON FUNCTIONAL INGREDIENTS", "2008-11-13")) && !onPage("ASH", unitCase("ASHLAND METAL CO", "1999-01-05")));
  check("The Andersons' ethanol companies were a joint venture with Marathon until it bought Marathon's share on 2025-07-31: the venture's $1,522,015 of 2022 (05-2022-0157) is no one's, its own divisions' orders are its",
    !has(eventsOn("ANDE"), "05-2022-0157") && has(eventsOn("ANDE"), "04-2024-3501") && !onPage("ANDE", unitCase("THE ANDERSONS MARATHON HOLDINGS LLC", "2025-07-30")) &&
      onPage("ANDE", unitCase("THE ANDERSONS MARATHON HOLDINGS LLC", "2025-07-31")));
  check("Gerdau's first EPA rows: Gerdau Ameristeel's of 2026 (06-2026-6204) and Gerdau MacSteel's $325,000 of 2018; Kirby Inland Marine's on Kirby, not Kirby Forest Industries' $11,200,000",
    has(eventsOn("GGB"), "06-2026-6204") && has(eventsOn("GGB"), "05-2015-5086") && has(eventsOn("KEX"), "06-2025-0950") && !has(eventsOn("KEX"), "10-1991-0206"));
  check("Ball's metal packaging companies are its own and Ball Aerospace to 2024-02-15 (Ball's 8-K of the sale to BAE, reporting 2024-02-16); Ball Metal & Chemical is not Ball's",
    has(eventsOn("BALL"), "02-2015-3302") && has(eventsOn("BALL"), "08-2000-0327") && !onPage("BALL", unitCase("BALL AEROSPACE & TECHNOLOGIES CORP.", "2024-02-16")) && !has(eventsOn("BALL"), "05-2004-0524"));
  check("Kroger's partnerships, Lennar's homebuilders and Waste Management's disposal companies (from the merger of 1998-07-16) are on their pages; a disposal company's case of 1997 is old Waste Management's; \"CABOT OIL & GAS\" is not Cabot Corporation's",
    has(eventsOn("KR"), "04-2015-8008") && has(eventsOn("LEN"), "04-2017-4501") && has(eventsOn("WM"), "HQ-1999-1044") && !has(eventsOn("WM"), "09-1993-0010") &&
      !onPage("CBT", unitCase("CABOT OIL & GAS CORPORATION", "2010-01-01")));
  const added135 = [1674862, 3124, 1114448, 40211, 895421, 920760, 1073404, 88121, 56873, 821026, 56047, 9389, 823768].map((c) => companies.find(([k]) => k === c)?.[1]);
  check("the round's 13 companies are their tickers' records, and every unit of the round names its days in lib/epaCases.ts",
    added135.join(" ") === "ASH AKZOY NVS GATX MS LEN GGB SEB KR ANDE KEX BALL WM" && /Batch 135, the fourth round/.test(read("lib/epaCases.ts")), added135.join(" "));

  console.log("\nThe 2026-11-10 audit of batches 131–136, fixed (batch 137)");
  // finding 1: Kroger sold Kroger Specialty Pharmacy to Elevance Health in 2024
  const kspCase = (day: string) => unitCase("Kroger Specialty Pharmacy 5-60 (Axium Healthcare)", day);
  check("Kroger Specialty Pharmacy's order of 2026-07-28 (02-2026-7204, $1,250) is Elevance Health's, not Kroger's: Kroger's 10-Q to 2024-08-17 books no gain on its sale, the next does, and Elevance's 10-K of 2025-02-20 names it among its subsidiaries",
    !has(eventsOn("KR"), "02-2026-7204") && has(eventsOn("ELV"), "02-2026-7204") && has(eventsOn("KR"), "04-2023-0209"),
    eventsOn("ELV").map((e) => e.externalId).join(" "));
  check("  …the pharmacy is Kroger's to 2024-08-17 and Elevance's from 2025-02-20, no one's between; Kroger's partnerships and plants stay its own on every day",
    onPage("KR", kspCase("2024-08-17")) && !onPage("KR", kspCase("2024-08-18")) && !onPage("ELV", kspCase("2025-02-19")) && onPage("ELV", kspCase("2025-02-20")) &&
      !onPage("ELV", kspCase("2024-08-17")) && onPage("KR", unitCase("KROGER LIMITED PARTNERSHIP II", "2026-07-28")) && !onPage("ELV", unitCase("KROGER LIMITED PARTNERSHIP II", "2026-07-28")));
  // finding 4: the coverage map's EPA row gives the figures the checks above give
  check("the coverage map's EPA row gives 9,386 rows on 693 companies, 7,974 before 2017, and 237 suit-filed rows on 109 pages, not the figures before batch 135",
    /9,386 rows on 693 companies, 7,974 before 2017/.test(read("docs/COVERAGE-MAP.md")) && /237 rows on 109 pages/.test(read("docs/COVERAGE-MAP.md")) &&
      !/9,155 rows on 690 companies|228 rows on 106 pages/.test(read("docs/COVERAGE-MAP.md")));
  check("  …and the stored case file finds it on Elevance's page by the unit's key",
    unitKeysOf(1156039).includes("krogerspecialtypharmacy") && "Kroger Specialty Pharmacy 5-60 (Axium Healthcare)".toLowerCase().replace(/[^a-z0-9]/g, "").includes("krogerspecialtypharmacy"));

  console.log("\nThe 2026-11-08 audit of batches 117–123, fixed (batch 124)");
  const utAuto = cases.filter((c) => c.defendants.some((d) => /^UNITED TECHNOLOGIES\s+AUTOM/i.test(d)));
  const rtxRows = eventsOn("RTX");
  check("finding 2: UT Automotive's cases are RTX's only to the sale to Lear (1999-05-03), whatever EPA's spelling: \"UNITED TECHNOLOGIES AUTOMOVTIVE, INC\", a defendant of the Lakeland Disposal decree of 2007 (05-2005-0635), is not RTX's, while the decree stays on its other parties' pages",
    utAuto.length >= 10 && utAuto.every((c) => has(rtxRows, c.number) === (c.day <= "1999-05-03")) && utAuto.some((c) => c.day <= "1999-05-03") &&
      !has(rtxRows, "05-2005-0635") && !has(out.get("RTX") ?? [], "05-2005-0635") && [...out.values()].some((evs) => has(evs, "05-2005-0635")) &&
      !unitsOf("RTX").find((u) => u.unit === "United Technologies' divisions")?.defendant.test("UNITED TECHNOLOGIES AUTOMOVTIVE, INC") &&
      !!unitsOf("RTX").find((u) => u.unit === "United Technologies Automotive")?.defendant.test("UNITED TECHNOLOGIES AUTOMOVTIVE, INC") &&
      !!unitsOf("RTX").find((u) => u.unit === "United Technologies' divisions")?.defendant.test("UNITED TECHNOLOGIES CORPORATION"),
    utAuto.map((c) => `${c.number} ${c.day} ${has(rtxRows, c.number) ? "RTX" : "-"}`).join("; "));
  check("finding 3: the README's sources table counts the units of 108 companies, as UNITS holds them (107 before Amazon's, batch 142; 106 before Elevance Health's pharmacy, batch 137; 95 before batch 135)",
    Object.keys(UNITS).length === 108 && /one of the operating units 108 companies held/.test(read("README.md")) && !/operating units (?:35|95|106|107) companies held/.test(read("README.md")),
    `${Object.keys(UNITS).length}`);

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

/** A CSV table's rows, in the columns asked. */
function eachRow(text: string, columns: readonly string[]): string[][] {
  const out: string[][] = [];
  eachCsvRow(text, columns, (v) => out.push(v));
  return out;
}

/** A CSV table without the columns named, as an older copy of EPA's file writes it. */
function withoutColumns(text: string, drop: readonly string[]): string {
  const head = text.slice(0, text.indexOf("\n")).split(",").map((h) => h.replace(/^"|"$/g, ""));
  const keep = head.filter((h) => !drop.includes(h));
  const quote = (x: string) => `"${x.replace(/"/g, '""')}"`;
  return [keep.map(quote).join(","), ...eachRow(text, keep).map((r) => r.map(quote).join(","))].join("\n") + "\n";
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

/** A dollar amount as numeric(16, 2)::text gives it back: "3200000.00". */
const numeric = (x: string | null) => (x === null ? null : x.includes(".") ? x : `${x}.00`);

interface FakeDb {
  cases: Map<
    string,
    EpaCase & { keys: string; stored?: { days: string[]; lodged: boolean[]; penalties: (string | null)[]; work: (string | null)[]; cost: (string | null)[]; projectsFigure: (string | null)[]; projects: string[] } }
  >;
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
      if (/^INSERT INTO epa_cases \(case_number, name, court, filed_on, step, penalty, laws, defendants, docket, name_keys, penalty_settled, work_ordered, summary,\s+suit_filed, settlement_days, settlement_lodged, settlement_penalties, settlement_work, cost_recovery, settlement_cost_recovery,\s+projects_figure, projects, settlement_projects_figure, settlement_projects\)/.test(s) &&
        /string_to_array\(pj, chr\(10\)\), string_to_array\(spf, '\|', ''\)::numeric\(16, 2\)\[\], string_to_array\(spj, chr\(30\)\)/.test(s)) {
        const [n, nm, ct, d, st, p, l, df, dk, k, ps, w, sm, sf, sd, sl, sp, sw, cr, sc, pf, pj, spf, spj] = params as [string[], string[], boolean[], string[], EpaCase["step"][], (string | null)[], string[], string[], (string | null)[], string[], boolean[], (string | null)[], (string | null)[], (string | null)[], string[], string[], string[], string[], (string | null)[], string[], (string | null)[], string[], string[], string[]];
        // as Postgres reads them: string_to_array(x, '|') of "" is no element, and '' a null where asked
        const list = (x: string) => (x === "" ? [] : x.split("|"));
        n.forEach((number, i) =>
          db.cases.set(number, {
            number, name: nm[i], court: ct[i], day: d[i], step: st[i], penalty: p[i], laws: l[i] ? l[i].split("|") : [], defendants: df[i] ? df[i].split("|") : [], docket: dk[i], keys: k[i],
            settled: ps[i], workOrdered: w[i], summary: sm[i], suitFiled: sf[i], costRecovery: cr[i], projectsFigure: pf[i], projects: pj[i] === "" ? [] : pj[i].split("\n"),
            stored: {
              days: list(sd[i]), lodged: list(sl[i]).map((x) => x === "true"), penalties: list(sp[i]).map((x) => x || null), work: list(sw[i]).map((x) => x || null), cost: list(sc[i]).map((x) => x || null),
              projectsFigure: list(spf[i]).map((x) => x || null), projects: spj[i] === "" ? [] : spj[i].split("\u001e"),
            },
          }),
        );
        return { rows: [] };
      }
      if (/^INSERT INTO epa_reads \(id, modified, cases\)/.test(s)) {
        const [modified, count] = params as [string | null, number];
        db.reads = { modified, cases: count, ageDays: 0 };
        return { rows: [] };
      }
      if (/^SELECT case_number, name, court, filed_on::text AS day, step, penalty::text AS penalty, laws, defendants, docket, penalty_settled, work_ordered::text AS work_ordered, summary,\s+suit_filed::text AS suit_filed, settlement_days::text\[\] AS settlement_days, settlement_lodged, settlement_penalties::text\[\] AS settlement_penalties, settlement_work::text\[\] AS settlement_work,\s+cost_recovery::text AS cost_recovery, settlement_cost_recovery::text\[\] AS settlement_cost_recovery,\s+projects_figure::text AS projects_figure, projects, settlement_projects_figure::text\[\] AS settlement_projects_figure, settlement_projects\s+FROM epa_cases WHERE filed_on >= \$1::date AND name_keys LIKE ANY \(\$2::text\[\]\) ORDER BY filed_on, case_number$/.test(s)) {
        const [from, patterns] = params as [string, string[]];
        const keys = patterns.map((p) => p.replace(/^%|%$/g, ""));
        const rows = [...db.cases.values()]
          .filter((c) => c.day >= from && keys.some((k) => c.keys.includes(k)))
          .sort((a, b) => a.day.localeCompare(b.day) || a.number.localeCompare(b.number))
          .map((c) => ({
            case_number: c.number, name: c.name, court: c.court, day: c.day, step: c.step, penalty: c.penalty === null ? null : `${c.penalty}${c.penalty.includes(".") ? "" : ".00"}`, laws: c.laws, defendants: c.defendants, docket: c.docket,
            penalty_settled: !!c.settled, work_ordered: c.workOrdered ? `${c.workOrdered}${c.workOrdered.includes(".") ? "" : ".00"}` : null, summary: c.summary ?? null,
            // numeric(16, 2)[]::text[] gives each figure with its cents, and a null as null
            suit_filed: c.suitFiled ?? null, settlement_days: c.stored?.days ?? [], settlement_lodged: c.stored?.lodged ?? [],
            settlement_penalties: (c.stored?.penalties ?? []).map(numeric), settlement_work: (c.stored?.work ?? []).map(numeric),
            cost_recovery: numeric(c.costRecovery ?? null), settlement_cost_recovery: (c.stored?.cost ?? []).map(numeric),
            projects_figure: numeric(c.projectsFigure ?? null), projects: c.projects ?? [], settlement_projects_figure: (c.stored?.projectsFigure ?? []).map(numeric),
            settlement_projects: c.stored?.projects ?? [],
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
