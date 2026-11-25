/**
 * Mutual funds' and ETFs' N-PORT holdings changes (batch 180, the owner's call of 2026-11-24 with 13F's: "Mutual funds
 * and ETFs, N-PORT").
 *
 *   npm run check:nport
 *
 * Offline: the committed files (`data/nport/`, written by `npm run sync:nport` from the SEC's 28 Form N-PORT data sets of
 * 2026-11-24), hand-built cases for each rule, and the first trading days the other checks' fixtures carry.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { PoolClient } from "pg";
import { deterministicScore } from "../lib/enrich/relevance";
import {
  BIG_SHARE,
  type Change,
  type FundPair,
  type Position,
  addMonth,
  basisOf,
  biggest,
  compareMonth,
  effectiveReports,
  fundHoldings,
  fundMoveEvents,
  fundReportEvents,
  heldSplit,
  markSuspect,
  monthsBetween,
  newYear,
  pairable,
  priceAgrees,
  quarterNoSplit,
  quarterSplitsIn,
  rekeyRenamed,
  reportOf,
  usdText,
} from "../lib/fundHoldings";
import { fundHoldingsFor } from "../lib/ingest/fundHoldingsFor";
import { QUOTAS } from "../lib/ingest/quota";
import { SOURCE_TTL_MINUTES } from "../lib/ingest/refresh";
import { SOURCES } from "../lib/ingest/store";
import { fundSeriesId } from "../lib/sec";
import { COMPANY_SOURCES } from "./ingest";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail: unknown = ""): void {
  if (ok) pass++;
  else fail++;
  const d = typeof detail === "string" ? detail : JSON.stringify(detail);
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${d ? ` — ${d.slice(0, 300)}` : ""}`);
}
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The files as written on 2026-11-24, and every page replayed against them. */
const EXPECTED = {
  years: 8,
  firstReport: "2019-12-31",
  lastReport: "2026-07-31",
  // 9,754 funds, 9,669 pages, 151,326 reports, 2,326 company pages and 15,733 moves in batch 180
  // 9,756 funds, 151,362 reports and 15,829 moves in batch 184
  funds: 9_755,
  fundPages: 9_671,
  reports: 151_361,
  companyPages: 2_332,
  moves: 15_812,
  // from first prices, for the pages the fixtures read
  // 2,777 on 379 in batch 180
  fromFirst: 2_789,
  fromFirstPages: 379,
};

const p = (shares: number, value?: number, name = "ACME INC"): Position => ({ shares, value, name });
const pair = (series: string, priorDate = "2026-03-31", reportDate = "2026-06-30", netAssets = 1_000_000): FundPair => ({
  series,
  cik: "1",
  reportDate,
  priorDate,
  filedOn: "2026-08-28",
  accession: `0000000001-26-${series}`,
  amended: false,
  netAssets,
});

async function main(): Promise<void> {
  console.log("The reports");
  const row = ["2026-06-30", "2026-08-28", "NPORT-P", "0000036405", "S000002839", "Vanguard 500 Index Fund", 1.4e12];
  const r1 = reportOf("0000932471-26-001", row, "2026q3_nport");
  check("a public report: its series, month's end, filing day, registrant CIK and net assets; a row no series names none; an amendment marked",
    !!r1 && r1.series === "S000002839" && r1.cik === "36405" && r1.reportDate === "2026-06-30" && r1.netAssets === 1.4e12 && !r1.amended &&
      reportOf("x", ["2026-06-30", "2026-08-28", "NPORT-P", "1", "", "", 0], "w") === null && reportOf("y", ["2026-06-30", "2026-09-10", "NPORT-P/A", ...row.slice(3)], "w")?.amended === true,
    r1);
  const eff = effectiveReports([
    reportOf("a1", row, "w")!,
    reportOf("a2", ["2026-06-30", "2026-09-10", "NPORT-P/A", ...row.slice(3)], "w")!,
    reportOf("a0", ["2026-03-31", "2026-05-29", "NPORT-P", ...row.slice(3)], "w")!,
  ]);
  check("  …a fund's month: the report filed last, an amendment restating the whole; its reports in order", same(eff.get("S000002839")?.map((r) => r.accession), ["a0", "a2"]));
  check("two reports compared when two to four months apart: a fiscal quarter, or one a changed fiscal year moved",
    monthsBetween("2026-03-31", "2026-06-30") === 3 && pairable("2026-03-31", "2026-06-30") && pairable("2025-11-30", "2026-01-31") && pairable("2025-12-31", "2026-04-30") &&
      !pairable("2026-05-31", "2026-06-30") && !pairable("2025-12-31", "2026-05-31"));

  console.log("\nThe rules");
  const funds = [p(1_000, 100_000), p(2_000, 200_000), p(3_000, 300_000), p(500, 50_000), p(700, 70_000), p(1_000_000, 100_000)];
  markSuspect(funds);
  check("a position whose stated value gives no other fund's price is set aside (a count given in thousands); the others kept; fewer than five priced none",
    funds[5].suspect === true && !funds.slice(0, 5).some((x) => x.suspect) && (() => {
      const few = [p(1, 100), p(1_000_000, 100)];
      markSuspect(few);
      return !few.some((x) => x.suspect);
    })());
  check("a fund's own split where fewer than five held through: its shares doubled as the price halved; not where the value doubled with them, nor with a value missing; a one for twenty in a falling market",
    heldSplit(p(100, 10_000), p(200, 10_400)) === 2 && heldSplit(p(100, 10_000), p(200, 20_000)) === 1 && heldSplit(p(100), p(200, 10_000)) === 1 && heldSplit(p(1_000, 1_000), p(50, 1_100)) === 0.05);
  check("a 13F split in an overlapping quarter: NVIDIA's of 2024's second quarter falls between March 31 and June 30, and between April 30 and July 31; not between June 30 and September 30",
    same(quarterSplitsIn([{ period: "2024-06-30", split: 10 }], "2024-03-31", "2024-06-30"), [10]) && same(quarterSplitsIn([{ period: "2024-06-30", split: 10 }], "2024-04-30", "2024-07-31"), [10]) &&
      same(quarterSplitsIn([{ period: "2024-06-30", split: 10 }], "2024-06-30", "2024-09-30"), []));
  const he = [{ period: "2024-09-30", split: 1, compared: 328 }, { period: "2024-12-31", split: 1, compared: 331 }];
  check("the 13F holders read no split in every overlapping quarter, each from 20 managers or more (batch 184): Hawaiian Electric's two quarters cover July 31 to October 31; a quarter missing, a split read or too few managers leave it unknown",
    quarterNoSplit(he, "2024-07-31", "2024-10-31") && !quarterNoSplit(he.slice(0, 1), "2024-07-31", "2024-10-31") && quarterNoSplit(he.slice(0, 1), "2024-06-30", "2024-09-30") &&
      !quarterNoSplit([{ ...he[0], split: 1.5 }, he[1]], "2024-07-31", "2024-10-31") && !quarterNoSplit([{ ...he[0], compared: 19 }, he[1]], "2024-07-31", "2024-10-31") && !quarterNoSplit([], "2024-06-30", "2024-09-30"));
  // six index funds each grown by about half in an offering as the price fell to three fifths (Hawaiian Electric's of 2024)
  const offer = (noSplit: boolean) =>
    compareMonth(
      [1, 2, 3, 4, 5, 6].map((i) => ({ pair: pair(`S00000003${i}`, "2024-07-31", "2024-10-31"), before: new Map([["T:HE", p(1_000 * i, 20_000 * i)]]), now: new Map([["T:HE", p(1_490 * i, 17_880 * i)]]) })),
      { tickerOf: (k) => k.slice(2), noSplitOf: () => noSplit },
    );
  check("  …the funds' three-for-two in a falling price, no fund showing it exactly, overruled where the 13F holders read none: each fund's purchase kept",
    offer(true).every((m) => m.changes[0]?.split === 1 && m.changes[0].delta === 490 * Number(m.pair.series.slice(-1))) && offer(false).every((m) => m.changes.length === 0 || m.changes[0].split === 1.5),
    offer(true).map((m) => m.changes.map((c) => [c.delta, c.split])));
  // six funds through a two for one, five exactly, the 13F holders reading none (National Beverage's of 2021, a 13F median of 1.89)
  const fizz = compareMonth(
    [1, 2, 3, 4, 5, 6].map((i) => ({ pair: pair(`S00000006${i}`), before: new Map([["T:FIZZ", p(1_000 * i, 85_000 * i)]]), now: new Map([["T:FIZZ", p(i === 6 ? 2_300 * i : 2_000 * i, (i === 6 ? 2_300 : 2_000) * i * 49)]]) })),
    { tickerOf: (k) => k.slice(2), noSplitOf: () => true },
  );
  check("  …the funds' own exact evidence before a 13F quarter read as none: five funds exactly two for one change nothing, a sixth bought 1,800",
    fizz.slice(0, 5).every((m) => m.changes.length === 0) && fizz[5].changes[0]?.delta === 1_800 && fizz[5].changes[0].split === 2, fizz.map((m) => m.changes.map((c) => [c.delta, c.split])));
  // six funds unchanged as the price halved, a seventh that doubled (the audit's reproduction of finding 3)
  const crash = compareMonth(
    [
      ...[1, 2, 3, 4, 5, 6].map((i) => ({ pair: pair(`S00000004${i}`), before: new Map([["T:ACME", p(1_000 * i, 100_000 * i)]]), now: new Map([["T:ACME", p(1_000 * i, 50_000 * i)]]) })),
      { pair: pair("S000000047"), before: new Map([["T:ACME", p(10_000, 1_000_000)]]), now: new Map([["T:ACME", p(20_000, 1_000_000)]]) },
    ],
    { tickerOf: (k) => k.slice(2), sharesOf: () => ({ now: 1_000_000, before: 1_000_000 }) },
  );
  const seventh = crash.find((m) => m.pair.series === "S000000047")!;
  check("  …a fund's own split only where fewer than five held through: six funds unchanged as the price halved read none, so a seventh's doubling is 10,000 bought, a 1% move",
    seventh.changes[0]?.delta === 10_000 && seventh.changes[0].split === 1 && same(seventh.moves.map((m) => m.bp), [100]), seventh);
  // six funds cut to about a quarter while the price fell: a split down nothing confirms reads nothing (a spin-off's exchange)
  const down = compareMonth(
    [1, 2, 3, 4, 5, 6].map((i) => ({ pair: pair(`S00000005${i}`), before: new Map([["T:NWSA", p(10_000 * i, 200_000 * i)]]), now: new Map([["T:NWSA", p(2_560 * i, 24_800 * i)]]) })),
    { tickerOf: (k) => k.slice(2) },
  );
  check("  …a split down the price does not confirm, nor a twenty-fifth of the funds exactly, compares no fund held through", down.every((m) => m.changes.length === 0 && m.compared === 0), down.map((m) => m.changes.map((c) => [c.delta, c.split])));
  const renamed = rekeyRenamed(new Map([["111111111", p(500, 5_000, "Wheels Up Experience Inc")], ["222222222", p(1, 1, "Other Co")]]), new Map([["333333333", p(25, 5_100, "WHEELS UP EXPERIENCE INC")], ["222222222", p(1, 1, "Other Co")]]));
  check("a security that took a new CUSIP between two reports, gone and new under one name, is one security (a reverse split's)", same([...renamed.keys()].sort(), ["111111111", "222222222"]) && renamed.get("111111111")?.shares === 25);

  // five funds through NVIDIA's ten for one, a sixth that bought besides, a seventh that sold out
  const nvda = (before: number, after: number, priced = true) => ({ before: new Map([["T:NVDA", p(before, priced ? before * 1_000 : undefined, "NVIDIA Corp")]]), now: new Map(after ? [["T:NVDA", p(after, priced ? after * 102 : undefined, "NVIDIA Corp")]] : []) as Map<string, Position> });
  const month = compareMonth(
    [
      ...[1, 2, 3, 4, 5].map((i) => ({ pair: pair(`S00000000${i}`), ...nvda(1_000 * i, 10_000 * i) })),
      { pair: pair("S000000006"), ...nvda(1_000, 12_000) },
      { pair: pair("S000000007"), ...nvda(5_000, 0) },
    ],
    { tickerOf: (k) => (k.startsWith("T:") ? k.slice(2) : undefined), splitsOf: () => [10], sharesOf: () => ({ now: 1_000_000, before: 100_000 }) },
  );
  const of = (s: string) => month.find((m) => m.pair.series === s)!;
  check("a month's changes on the split the funds that held through show: five at ten for one change nothing; a sixth's 12,000 from 1,000 is 2,000 bought; a seventh's sale to nothing the 50,000 shares its 5,000 became",
    of("S000000001").changes.length === 0 && of("S000000006").changes[0]?.delta === 2_000 && of("S000000007").changes[0]?.delta === -50_000 && of("S000000006").changes[0]?.split === 10,
    month.map((m) => m.changes.map((c) => [c.delta, c.split])));
  check("  …a change of 1% or more of the company's shares a move, in hundredths of a percent (the seventh's 50,000 of 1,000,000: 5%); the sixth's 2,000 (0.2%) none",
    same(of("S000000007").moves.map((m) => m.bp), [500]) && of("S000000006").moves.length === 0);
  const unsure = compareMonth([{ pair: pair("S000000008"), ...nvda(1_000, 1_500) }], { tickerOf: (k) => k.slice(2), splitsOf: () => [10] });
  check("  …a security the 13F holders read a split for in an overlapping quarter, which the fund's own positions do not show, is not compared", unsure[0].changes.length === 0 && unsure[0].compared === 0, unsure);
  const huge = compareMonth([{ pair: pair("S000000009"), ...nvda(1_000, 1_200_000) }], { tickerOf: (k) => k.slice(2), sharesOf: () => ({ now: 1_000_000, before: 1_000_000 }) });
  check("  …a change greater than the company's every share reads nothing that month", huge[0].changes.length === 0);
  // six funds that each grew a stake by half in an offering, the price unmoved: no three-for-two split (BWIN's of 2020)
  const offering = compareMonth(
    [1, 2, 3, 4, 5, 6].map((i) => ({ pair: pair(`S00000001${i}`), before: new Map([["T:BWIN", p(1_000 * i, 20_000 * i)]]), now: new Map([["T:BWIN", p(1_500 * i, 31_000 * i)]]) })),
    { tickerOf: (k) => k.slice(2) },
  );
  check("  …funds' shares all grown by a simple ratio while the price held read no split: each bought half again (BWIN's offering of 2020, read in a first run as a three-for-two split)",
    offering.every((m) => m.changes[0]?.split === 1 && m.changes[0].delta > 0), offering.map((m) => m.changes.map((c) => [c.delta, c.split])));
  const stated = compareMonth([{ pair: pair("S000000020"), before: new Map([["T:KALA", p(858_720, 858_720)]]), now: new Map([["T:KALA", p(617_901, 400_000)]]) }], {
    tickerOf: (k) => k.slice(2),
    sharesOf: () => ({ now: 1_518_424, before: 55_715_876 }),
  });
  check("  …a position held through is not compared where the company's stated counts show a split its shares do not (Kala's 1,518,424 shares after a reverse split, beside 55,715,876)",
    stated[0].changes.length === 0 && stated[0].compared === 0, stated);
  const regis = compareMonth(
    [
      { pair: pair("S000000021", "2023-10-31", "2024-01-31"), before: new Map([["T:RGS", p(1_049_823, 630_000)]]), now: new Map() as Map<string, Position> },
      { pair: pair("S000000022", "2023-10-31", "2024-01-31"), before: new Map([["T:RGS", p(10_000, 6_000)]]), now: new Map([["T:RGS", p(510, 5_870)]]) },
      { pair: pair("S000000023", "2023-10-31", "2024-01-31"), before: new Map([["T:RGS", p(40_000, 24_000)]]), now: new Map([["T:RGS", p(2_100, 24_150)]]) },
    ],
    { tickerOf: (k) => k.slice(2), sharesOf: () => ({ now: 2_280_000, before: 2_270_000 }) },
  );
  const sold = regis[0].changes[0];
  check("  …a position closed beside a split the funds' prices show and no count reads (Regis's one for twenty of 2023, both counts stated after it) is a sale in its report's own shares on the fund's page, and no move",
    sold?.delta === -1_049_823 && sold.noMove === true && regis[0].moves.length === 0, regis.map((m) => m.changes));
  check("a 1% move's count: the later quarter's where the earlier and the next agree, in the split's later unit where both were stated before it; none where they disagree (Holley's 1,093,750 beside 118,241,747)",
    basisOf({ now: 118_000_000, before: 117_000_000 }, 1) === 118_000_000 && basisOf({ now: 2_460_000_000, before: 2_450_000_000 }, 10) === 24_600_000_000 &&
      basisOf({ now: 24_530_000_000, before: 2_460_000_000 }, 10) === 24_530_000_000 && basisOf({ now: 1_093_750, before: 118_241_747 }, 1) === undefined &&
      basisOf({ now: 1_000_000 }, 1) === undefined && basisOf(undefined, 1) === undefined &&
      // the quarter after too, where its frame is read: NRx's blank-check count of 2021 before its merger
      basisOf({ before: 2_688_242, now: 2_688_242, next: 58_810_338 }, 1) === undefined && basisOf({ before: 2_688_242, now: 2_688_242, next: null }, 1) === undefined &&
      basisOf({ before: 2_460_000_000, now: 2_460_000_000, next: 24_500_000_000 }, 10) === 24_600_000_000);
  check("a price moved the other way from a split, within a fifth for two for one, a third for five for one, half beyond",
    priceAgrees(0.55, 2) && !priceAgrees(0.9, 2) && priceAgrees(0.15, 5) && !priceAgrees(0.3, 5) && priceAgrees(14, 0.05) && !priceAgrees(10, 0.05) && !priceAgrees(1, 0.05));
  const changes: Change[] = [
    { key: "a", name: "A", delta: 10, after: 10, usd: 9_000, split: 1 },
    { key: "b", name: "B", delta: 5, after: 5, usd: 4_000, split: 1 },
    { key: "c", name: "C", delta: -3, after: 0, usd: 6_000, split: 1 },
    { key: "d", name: "D", delta: 1, after: 2, usd: 20_000, split: 1 },
    { key: "e", name: "E", delta: 2, after: 2, usd: 15_000, split: 1 },
    { key: "f", name: "F", delta: 7, after: 9, usd: 12_000, split: 1 },
  ];
  const big = biggest(changes, 1_000_000);
  check(`a fund's report names its three biggest purchases and sales by value, each ${BIG_SHARE * 100}% of its net assets or more`,
    same(big.buys.map((c) => c.key), ["d", "e", "f"]) && same(big.sells.map((c) => c.key), ["c"]) && biggest(changes, 1e9).buys.length === 0);
  check("dollars as a row says them", usdText(2_345_678) === "$2.3 million" && usdText(840_000) === "$840,000" && usdText(1_000_000_000) === "$1 billion" && usdText(1_409_200_000_000) === "$1.4 trillion");
  const year = newYear();
  addMonth(year, month, () => "Test Fund", (s) => s === "S000000007");
  check("a year's file: the fund page's reports with a big change, each company's moves, the funds they name, the securities' names once",
    Object.keys(year.series).length === 1 && !!year.series.S000000007 && (year.pages.NVDA ?? []).length === 1 && !!year.funds.S000000007 && !year.funds.S000000006 && same(year.names, ["NVIDIA Corp"]), {
      series: Object.keys(year.series),
      pages: year.pages,
    });

  console.log("\nThe rows");
  const reportRows = fundReportEvents(
    [{ reportDate: "2026-06-30", priorDate: "2026-03-31", filedOn: "2026-08-28", accession: "0000000001-26-000007", amended: false, compared: 1, netAssets: 1_000_000, buys: [], sells: [{ ...changes[2], name: "NVIDIA Corp", ticker: "NVDA", delta: -50_000, after: 0, usd: 5_100_000, split: 10 }] }],
    { series: "S000000007", name: "Test Fund", cik: "1" },
  );
  check("a fund's report on its filing day, its biggest sale named with its ticker, the split read, linked to the filing, with the caveat that a change is not a trade",
    reportRows.length === 1 && reportRows[0].date === "2026-08-28" && reportRows[0].title === "Test Fund's N-PORT report for June 30, 2026: biggest sale NVIDIA Corp (NVDA) (−50,000)" &&
      /after a 10-for-1 split/.test(reportRows[0].description ?? "") && /not a trade's day or price/.test(reportRows[0].description ?? "") &&
      reportRows[0].url === "https://www.sec.gov/Archives/edgar/data/1/000000000126000007/" && reportRows[0].dedupBasis === "nport:S000000007@2026-06-30",
    reportRows[0]);
  const moveRows = fundMoveEvents(
    [{ reportDate: "2026-06-30", priorDate: "2026-03-31", series: "S000000007", delta: -50_000, after: 0, filedOn: "2026-08-28", accession: "0000000001-26-000007", bp: 500, amended: false, split: 10 }],
    new Map([["S000000007", ["Test Fund", "1"]]]),
    { ticker: "NVDA", name: "NVIDIA CORP" },
  );
  check("  …a company's move: the fund, the shares sold, the two reports' month ends and the share of the company, the whole position sold",
    moveRows[0]?.title === "Test Fund reported selling 50,000 NVIDIA CORP shares between March 31, 2026 and June 30, 2026 (5.0% of the company)" && /the whole position sold/.test(moveRows[0].description ?? "") &&
      moveRows[0].dedupBasis === "nport:NVDA@2026-06-30:S000000007",
    moveRows[0]?.title);

  console.log("\nThe committed files");
  const held = fundHoldings();
  let reports = 0;
  const dates = new Set<string>();
  for (const qs of held.series.values()) for (const q of qs) {
    reports++;
    dates.add(q.reportDate);
  }
  let moves = 0;
  for (const ms of held.pages.values()) for (const m of ms) {
    moves++;
    dates.add(m.reportDate);
  }
  const sorted = [...dates].sort();
  const files = (await import("node:fs")).readdirSync(join(__dirname, "..", "data", "nport")).filter((f) => /^\d{4}\.json\.gz$/.test(f));
  check(`${EXPECTED.years} years of reports, ${EXPECTED.firstReport} to ${EXPECTED.lastReport}: ${EXPECTED.reports.toLocaleString("en-US")} reports on ${EXPECTED.fundPages.toLocaleString("en-US")} fund pages, ${EXPECTED.moves.toLocaleString("en-US")} moves on ${EXPECTED.companyPages.toLocaleString("en-US")} company pages, ${EXPECTED.funds.toLocaleString("en-US")} funds named`,
    files.length === EXPECTED.years && sorted[0] === EXPECTED.firstReport && sorted.at(-1) === EXPECTED.lastReport && reports === EXPECTED.reports && held.series.size === EXPECTED.fundPages &&
      moves === EXPECTED.moves && held.pages.size === EXPECTED.companyPages && held.funds.size === EXPECTED.funds,
    { years: files.length, first: sorted[0], last: sorted.at(-1), reports, fundPages: held.series.size, moves, companyPages: held.pages.size, funds: held.funds.size });
  check("  …each file says what it holds, credits the SEC and names its batch",
    files.every((f) => {
      const body = JSON.parse(gunzipSync(readFileSync(join(__dirname, "..", "data", "nport", f))).toString()) as { about: string; read: string };
      return /N-PORT data sets/.test(body.about) && /17 U\.S\.C\. § 105/.test(body.about) && /batches 180, 184/.test(body.about) && body.read === "2026-11-24";
    }));

  console.log("\nEvery page");
  const first: Record<string, string> = {};
  for (const [f, k] of [["digest-1985-entries.json.gz", "firstPrices"], ["eeoc-listing.json.gz", "first"], ["fda-device-recalls.json.gz", "first"], ["occ-actions.json.gz", "first"]] as const) {
    Object.assign(first, JSON.parse(gunzipSync(readFileSync(join(__dirname, "fixtures", f))).toString())[k]);
  }
  let fromFirst = 0;
  const fromPages = new Set<string>();
  for (const [ticker, ms] of held.pages) {
    if (!first[ticker]) continue;
    const n = fundMoveEvents(ms, held.funds, { ticker, from: first[ticker], name: ticker }).length;
    fromFirst += n;
    if (n) fromPages.add(ticker);
  }
  check(`from first prices: ${EXPECTED.fromFirst.toLocaleString("en-US")} moves on ${EXPECTED.fromFirstPages} company pages`, fromFirst === EXPECTED.fromFirst && fromPages.size === EXPECTED.fromFirstPages, `${fromFirst} on ${fromPages.size}`);

  console.log("\nAt ingest");
  const none = await fundHoldingsFor(fakeDb(null), 1, { edgarName: "Apple Inc.", alsoKnownAs: [], cik: 320193, ticker: "AAPL" });
  check("asked again while a page has no prices", none.outcome === "error" && /no prices/.test(none.detail ?? ""));
  check("a fund page's series from the ticker index: VOO's and VFIAX's one series, QQQ's its trust's", !!fundSeriesId("VOO") && fundSeriesId("VOO") === fundSeriesId("VFIAX") && !!fundSeriesId("QQQ") && fundSeriesId("AAPL") === null);

  console.log("\nRegistered, licensed, wired");
  const src = SOURCES.find((s) => s.key === "fund_nport");
  check("the source is id 54, public domain, cleared for commercial use, reviewed 2026-11-24, credited to the SEC",
    src?.id === 54 && src.license === "public domain" && src.commercialOk && src.reviewedOn === "2026-11-24" && src.attribution === "U.S. Securities and Exchange Commission", src);
  check("  …a company source, quota and refresh noted, scored without the model: a fund's report and a 1% move 0.9",
    (COMPANY_SOURCES as readonly string[]).includes("fund_nport") && QUOTAS.fund_nport.perDay === null && SOURCE_TTL_MINUTES.fund_nport === 1440 &&
      deterministicScore({ eventId: 0, kind: "filing", title: "Test Fund reported selling 50,000 NVIDIA CORP shares", sourceKey: "fund_nport" }, { kind: "company", displayName: "NVIDIA", ticker: "NVDA" }, ["nvidia"])?.score === 0.9 &&
      deterministicScore({ eventId: 0, kind: "filing", title: "Test Fund's N-PORT report for June 30, 2026: biggest sale", sourceKey: "fund_nport" }, { kind: "company", displayName: "Test Fund", ticker: "TEST" }, ["test"])?.score === 0.9);
  check("  …the ingest asks it for every page, by its ticker", /await run\("fund_nport", [^\n]+\n\s*fundHoldingsFor\(client, subjectId, \{[^}]*ticker: company\.ticker[^}]*\}\),/.test(read("scripts/ingest.ts")));
  check("  …synced quarterly by `npm run sync:nport`, and credited on the footer and the terms page",
    /"sync:nport": "NODE_OPTIONS=--max-old-space-size=8192 tsx scripts\/sync-nport\.ts"/.test(read("package.json")) &&
      /funds&apos; N-PORT holdings reports from SEC EDGAR/.test(read("app/layout.tsx").replace(/\s+/g, " ")) &&
      /funds&apos; N-PORT holdings reports from the SEC/.test(read("app/legal/terms/page.tsx").replace(/\s+/g, " ")));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  if (fail) process.exit(1);
}

function fakeDb(listed: string | null): PoolClient {
  return {
    query: async (sql: string) => {
      if (/FROM prices/.test(sql)) return { rows: [{ listed }] };
      if (/sec:%:rename:%/.test(sql)) return { rows: [] };
      throw new Error(`unexpected query: ${sql.slice(0, 80)}`);
    },
  } as unknown as PoolClient;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
