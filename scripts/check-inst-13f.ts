/**
 * Big investors' 13F holdings changes (batch 179, the owner's call of 2026-11-24: 13F, N-PORT and insider trades, and
 * "one row per quarter naming the biggest buyers and sellers, plus a separate row for any single holder whose change
 * equals 1% or more of the company's shares").
 *
 *   npm run check:inst-13f
 *
 * Offline: the committed files (`data/13f/`, written by `npm run sync:13f` from the SEC's 54 Form 13F data sets, 172
 * fails-to-deliver files and 59 share-count frames of 2026-11-24), hand-built cases for each rule, and the first trading
 * days the other checks' fixtures carry.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { PoolClient } from "pg";
import { type Seen, buildCusipMap, cusipMap, fundNamesAgree, namesAgree, nameWords, readFailsFile } from "../lib/cusipMap";
import { deterministicScore } from "../lib/enrich/relevance";
import { instHoldingsFor } from "../lib/ingest/instHoldingsFor";
import { QUOTAS } from "../lib/ingest/quota";
import { SOURCE_TTL_MINUTES } from "../lib/ingest/refresh";
import { SOURCES } from "../lib/ingest/store";
import {
  type Holding,
  INST_HOLDINGS_DIR,
  MIN_MANAGERS,
  comparable,
  confirmedSplit,
  deadlineOf,
  dollars,
  effectiveFilings,
  instHoldings,
  instHoldingsEvents,
  markSuspect,
  nextPeriod,
  pageQuarter,
  previousPeriod,
  shareBasis,
  splitFactor,
  submissionOf,
} from "../lib/instHoldings";
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
  cusipsSeen: 49_951,
  // 11,081 in batch 179; ETFs' share classes by their series' names since batch 180
  cusipsMapped: 16_297,
  years: 14,
  firstPeriod: "2013-09-30",
  lastPeriod: "2026-06-30",
  // 6,705 and 195,271 in batch 179, the 4,225 pages more ETFs', whose trusts state no share count and so have no 1% moves
  pages: 10_930,
  // 284,274 quarters, 201,204 moves and 61,227 rows from first prices in batch 180, before batch 184 confirmed each split
  summaries: 284_259,
  moves: 201_107,
  // from first prices, for the pages the fixtures read
  fromFirst: 61_221,
  fromFirstPages: 637,
};

const h = (shares: number, value?: number, filedOn = "2024-08-14", accession = "x"): Holding => ({ shares, value, filedOn, accession });
const report = (filedOn = "2024-08-14", accession = "r") => ({ filedOn, accession });

async function main(): Promise<void> {
  console.log("The CUSIP map");
  check("a name's words: punctuation off, a run of single letters one word (\"U.S.PHYSICAL\", \"U S PHYSICAL\"; \"C&F\", \"C & F\")",
    same(nameWords("U.S.PHYSICAL THERAPY INC"), nameWords("U S PHYSICAL THERAPY INC /NV").slice(0, 4)) && same(nameWords("C&F FINANCIAL CORP"), nameWords("C & F FINANCIAL CORP")) &&
      same(nameWords("THE BOEING COMPANY"), ["BOEING", "COMPANY"]));
  check("  …a description agrees by its first word, cut as the files cut it (\"BERKSHIRE HATHWY INC(HLDG CO)B\"); a common first word needs its second (\"FIRST BANCORP\" is not First Solar)",
    namesAgree("BERKSHIRE HATHWY INC(HLDG CO)B", ["BERKSHIRE HATHAWAY INC"]) && namesAgree("CISCOSYSINC", ["CISCO SYSTEMS, INC."]) &&
      !namesAgree("FIRST BANCORP P R COM NEW", ["First Solar, Inc."]) && namesAgree("FIRST SOLAR INC", ["First Solar, Inc."]) && !namesAgree("CARDIONET INC", ["HeartBeam, Inc."]) &&
      // a fund's description can lead with its sponsor's brand; a company's cannot
      namesAgree("STATE STREET SPDR S&P 500 ETF", ["SPDR S&P 500 ETF TRUST"]) && !namesAgree("STATE STREET CORP", ["SPDR S&P 500 ETF TRUST"]));
  const seen = new Map<string, Map<string, Seen>>();
  readFailsFile(
    "SETTLEMENT DATE|CUSIP|SYMBOL|QUANTITY (FAILS)|DESCRIPTION|PRICE\n20261015|037833100|AAPL|231|APPLE INC;COM NPV|342.96\n20261015|084670702|BRKB|9|BERKSHIRE HATHWY INC(HLDG CO)B|500\n" +
      "20130715|14159L103|BEAT|5|CARDIONET INC COM STK (CA)|7\n20261015|30303M102|META|10|META PLATFORMS, INC. CLASS A C|600\n20210615|30303M102|FB|10|FACEBOOK INC CL A|300",
    seen,
  );
  const tickers = new Map([["AAPL", { ticker: "AAPL", cik: 320193 }], ["BRKB", { ticker: "BRK-B", cik: 1067983 }], ["BEAT", { ticker: "BEAT", cik: 1 }], ["META", { ticker: "META", cik: 1326801 }]]);
  const names: Record<number, string[]> = { 320193: ["Apple Inc."], 1067983: ["BERKSHIRE HATHAWAY INC"], 1: ["HeartBeam, Inc."], 1326801: ["Meta Platforms, Inc."] };
  const built = buildCusipMap(seen, tickers, (cik) => names[cik] ?? []);
  check("each CUSIP to the index ticker it last had, \"BRKB\" read as BRK-B, Facebook's CUSIP as META's; CardioNet's old CUSIP refused, its BEAT HeartBeam's since 2021",
    same(built.map, { "037833100": "AAPL", "084670702": "BRK-B", "30303M102": "META" }) && built.refused.length === 1 && built.refused[0].cusip === "14159L103", built);
  check("an ETF's class by its series' name (batch 180): a CUSIP still trading under the ticker by its sponsor's brand, the files' cut trust names (\"VANGUARD INDEX FDS VANGUARD MO\" VTI's, \"SELECT SECTOR SPDR TR STATE ST\" XLF's); an old one by two of its own words too",
    fundNamesAgree("VANGUARD INDEX FDS VANGUARD MO", ["Vanguard Morningstar Total Stock Market Index Fund"], true) && fundNamesAgree("SELECT SECTOR SPDR TR STATE ST", ["State Street(R) Financial Select Sector SPDR(R) ETF"], true) &&
      fundNamesAgree("J P MORGAN EXCHANGE-TRADED FD ", ["JPMorgan Equity Premium Income ETF"], true) && !fundNamesAgree("PROSHARES TR ULTRA QQQ", ["Invesco QQQ Trust, Series 1"], true) &&
      fundNamesAgree("ISHARES CORE S&P 500 ETF", ["iShares Core S&P 500 ETF"]) && fundNamesAgree("VANGUARD S&P 500 ETF", ["Vanguard 500 Index Fund"]) &&
      !fundNamesAgree("ISHARES 20+ YEAR TREASURY BOND", ["iShares Core S&P 500 ETF"]) && !fundNamesAgree("VANGUARD EXTENDED DURATION TREA", ["Vanguard 500 Index Fund"]));
  const fundSeen = new Map<string, Map<string, Seen>>();
  readFailsFile("SETTLEMENT DATE|CUSIP|SYMBOL|QUANTITY (FAILS)|DESCRIPTION|PRICE\n20261029|922908769|VTI|5|VANGUARD INDEX FDS VANGUARD MO|300\n20161028|464286848|EWJ|5|ISHARES MSCI JAPAN ETF|50\n20261030|46434G822|EWJ|5|ISHARES MSCI JAPAN ETF|70\n20150101|000000001|VTI|5|VANGUARD INDEX FDS VANGUARD EX|10", fundSeen);
  const fundBuilt = buildCusipMap(fundSeen, new Map([["VTI", { ticker: "VTI", cik: 36405, names: ["Vanguard Morningstar Total Stock Market Index Fund"] }], ["EWJ", { ticker: "EWJ", cik: 930667, names: ["iShares MSCI Japan ETF"] }]]), () => ["VANGUARD INDEX FUNDS"]);
  check("  …the current CUSIP alone takes the brand's rule, a fund's old CUSIP its own words' (EWJ's of 2016 and now), a reused ticker's older CUSIP none, and the trust's names never",
    same(fundBuilt.map, { "922908769": "VTI", "464286848": "EWJ", "46434G822": "EWJ" }) && fundBuilt.refused.length === 1 && fundBuilt.refused[0].fund === true, fundBuilt);
  const map = cusipMap();
  const file = JSON.parse(gunzipSync(readFileSync(join(INST_HOLDINGS_DIR, "cusips.json.gz"))).toString()) as { seen: number; map: Record<string, string> };
  check(`the committed map: ${EXPECTED.cusipsMapped.toLocaleString("en-US")} of ${EXPECTED.cusipsSeen.toLocaleString("en-US")} CUSIPs seen; Apple, Alphabet's two classes, Berkshire's B shares, SPY, QQQ, IVV, VOO, VTI`,
    file.seen === EXPECTED.cusipsSeen && map.size === EXPECTED.cusipsMapped && map.get("037833100") === "AAPL" && map.get("02079K305") === "GOOGL" && map.get("02079K107") === "GOOG" &&
      map.get("084670702") === "BRK-B" && map.get("78462F103") === "SPY" && map.get("46090E103") === "QQQ" && map.get("464287200") === "IVV" && map.get("922908363") === "VOO" && map.get("922908769") === "VTI",
    { seen: file.seen, mapped: map.size });

  console.log("\nThe reports");
  const subs = [
    submissionOf("a1", ["1374170", "2025-03-31", "2025-05-13", "13F-HR", "", "", "13F HOLDINGS REPORT", "NORGES BANK", 1743, 712472908814, "Y"]),
    submissionOf("a2", ["1374170", "2025-03-31", "2026-05-11", "13F-HR/A", "Y", "NEW HOLDINGS", "13F HOLDINGS REPORT", "NORGES BANK", 1743, 712472908814, ""]),
    submissionOf("b1", ["2011335", "2025-12-31", "2026-02-17", "13F-HR", "", "", "13F HOLDINGS REPORT", "J. Stern & Co. LLP", 43, 1, ""]),
    submissionOf("b2", ["2011335", "2025-12-31", "2026-02-24", "13F-HR/A", "Y", "RESTATEMENT", "13F HOLDINGS REPORT", "J. Stern & Co. LLP", 43, 1, ""]),
    submissionOf("c1", ["102909", "2026-03-31", "2026-05-08", "13F-NT", "N", "", "13F NOTICE", "VANGUARD GROUP INC", 0, 0, ""]),
    submissionOf("d1", ["895421", "2024-03-31", "2024-05-15", "13F-HR", "", "", "13F HOLDINGS REPORT", "MORGAN STANLEY", 46942, 1, ""]),
    submissionOf("d2", ["895421", "2024-03-31", "2024-08-16", "13F-HR/A", "Y", "NEW HOLDINGS", "13F HOLDINGS REPORT", "MORGAN STANLEY", 46943, 1, ""]),
    submissionOf("d3", ["895421", "2024-03-31", "2024-10-17", "13F-HR/A", "Y", "NEW HOLDINGS", "13F HOLDINGS REPORT", "MORGAN STANLEY", 12, 1, ""]),
  ];
  const eff = effectiveFilings(subs);
  check("a manager's quarter: its latest original or restatement and the \"new holdings\" amendments after it; a notice none (Vanguard Group's of 2026)",
    same(eff.get("2011335|2025-12-31")?.map((s) => s.accession), ["b2"]) && !eff.has("102909|2026-03-31") && same(eff.get("895421|2024-03-31")?.map((s) => s.accession), ["d2", "d3"]));
  check("  …a \"new holdings\" amendment half the size of what it amends or more is the report filed again, and replaces it: Morgan Stanley's of 2024 (46,943 entries beside 46,942), and Norges Bank's 1,743 holdings of 2025's first quarter, all omitted as confidential then and filed a year later",
    same(eff.get("1374170|2025-03-31")?.map((s) => s.accession), ["a2"]) && eff.get("895421|2024-03-31")?.[0].accession === "d2");
  check("the deadline: the 45th day after the quarter, a weekend's the Monday after; the quarter before",
    deadlineOf("2024-06-30") === "2024-08-14" && deadlineOf("2025-12-31") === "2026-02-16" && deadlineOf("2026-03-31") === "2026-05-15" &&
      previousPeriod("2024-03-31") === "2023-12-31" && previousPeriod("2024-12-31") === "2024-09-30" && previousPeriod("2024-06-30") === "2024-03-31");
  check("a value in dollars: thousands before 2023-01-03, dollars since", dollars(5, "2022-11-14") === 5_000 && dollars(5, "2023-02-14") === 5);
  check("two reports compared only where both hold positions, neither a quarter of the other's count", comparable(100, 90) && !comparable(100, 20) && !comparable(0, 50) && !comparable(20, 100));

  console.log("\nThe rules");
  check("a split read from the holders' own ratios: NVIDIA's ten for one of 2024 (10.004), a reverse split; none from fewer than five, or ratios near one",
    splitFactor([10.004, 9.99, 10.01, 10, 10.02]) === 10 && splitFactor([0.1, 0.1, 0.101, 0.0999, 0.1]) === 0.1 && splitFactor([10, 10, 10, 10]) === 1 && splitFactor([1.2, 1.3, 1.1, 1.25, 1.3]) === 1 &&
      // any simple ratio: GeneDx's one for 33 of 2023, three for two
      splitFactor([1 / 33, 1 / 33, 0.0302, 0.0305, 1 / 33]) === 1 / 33 && splitFactor([1.5, 1.49, 1.51, 1.5, 1.5]) === 1.5);
  check("  …a share count stated before the split read in the later unit: NVIDIA's 2,460,000,000 of its May cover page as 24,600,000,000",
    shareBasis(2_460_000_000, 18_000_000_000, 10) === 24_600_000_000 && shareBasis(15_204_137_000, 9_000_000_000, 1) === 15_204_137_000 && shareBasis(undefined, 5, 1) === undefined && shareBasis(100, 1_000, 1) === undefined);
  check("a split up confirmed where a twenty-fifth of the holders show its factor exactly (batch 184): NVIDIA's ten for one; First Citizens' CIT quarter, each holder grown by its own amount, none",
    confirmedSplit(10, [10, 10.0001, 12, 9.5, 10.3], 0.14) === 10 && confirmedSplit(1.5, [1.43, 1.47, 1.52, 1.55, 1.49, 1.6], 0.8) === 1 && confirmedSplit(1, [1, 1, 1, 1, 1], 1) === 1);
  check("  …a split down confirmed where the price rose to three tenths of its factor, or a twenty-fifth show it within a hundredth; else the quarter reads nothing (News Corp's exchange of 2013)",
    confirmedSplit(0.05, [0.049, 0.0475, 0.053, 0.0465, 0.052], 10.6) === 0.05 && confirmedSplit(0.25, [0.27, 0.24, 0.26, 0.23, 0.265], 0.49) === null && confirmedSplit(0.25, [0.25, 0.27, 0.24, 0.26, 0.23], 0.49) === 0.25);
  check("  …a split down's stated count read by the next quarter's (the audit's finding 7): 200,000,000 before a one for twenty, the next 10,500,000, is 10,000,000; a count already after it, the next agreeing, as stated; with no next as before",
    shareBasis(200_000_000, 8_000_000, 0.05, 10_500_000) === 10_000_000 && shareBasis(10_000_000, 300_000, 0.05, 10_200_000) === 10_000_000 && shareBasis(200_000_000, 8_000_000, 0.05) === 200_000_000 &&
      nextPeriod("2024-12-31") === "2025-03-31" && nextPeriod("2024-03-31") === "2024-06-30" && previousPeriod(nextPeriod("2024-09-30")) === "2024-09-30");
  const fcPrev = new Map(Array.from({ length: 8 }, (_, i) => [`m${i}`, h(100_000 * (i + 1), 83_000_000 * (i + 1))] as [string, Holding]));
  const fcNow = new Map(Array.from({ length: 8 }, (_, i) => [`m${i}`, h(Math.round(100_000 * (i + 1) * [1.43, 1.47, 1.52, 1.55, 1.49, 1.6, 1.38, 1.51][i]), 0)] as [string, Holding]));
  for (const x of fcNow.values()) x.value = Math.round(x.shares * 665);
  const fc = pageQuarter("2022-03-31", fcPrev, fcNow, new Map([...fcPrev.keys()].map((k) => [k, report()])), { sharesOutstanding: 16_000_000 });
  check("  …a stock merger's quarter reads as stated, each holder's shares received a change (First Citizens' CIT quarter of 2022, read in batch 179 as three for two)",
    fc?.split === 1 && fc.buyers.length === 3 && fc.sellers.length === 0, fc?.split);
  const stern = new Map([["s", h(125_760_307, 164_000_000)], ...["a", "b", "c", "d", "e"].map((k, i) => [k, h(1_000 + i, 180_000 + i * 180)] as [string, Holding]), ["u", h(2_000, 360)]]);
  markSuspect(stern);
  check("a position whose stated value gives no other manager's price is set aside (J. Stern & Co.'s 125,760,307 NVIDIA shares of 2025); a value a thousand times off keeps its shares",
    stern.get("s")?.suspect === true && !stern.get("u")?.suspect && !stern.get("a")?.suspect);
  const prev = new Map([["berk", h(789_368_450)], ["van", h(1_300_000_000)], ["new", h(0)], ["conf", h(5_000_000)], ["odd", h(1_000_000)]]);
  const cur = new Map([["berk", h(400_000_000, undefined, "2024-08-14", "0000950123-24-008740")], ["van", h(1_310_000_000)], ["new", h(160_000_000, undefined, "2024-08-13", "n")], ["odd", { ...h(900_000_000), suspect: true }]]);
  const compared = new Map([["berk", report("2024-08-14", "0000950123-24-008740")], ["van", report()], ["new", report("2024-08-13", "n")], ["conf", report()], ["odd", report()]]);
  const q = pageQuarter("2024-06-30", prev, cur, compared, { sharesOutstanding: 15_204_137_000, confidentialNow: new Set(["conf"]) });
  check("a quarter's changes: Berkshire's sale of 389,368,450 Apple shares (2.6% of the company) a 1% move, a new position of 160,000,000 one; a sale to nothing in a report that omits confidential holdings no change; a suspect position not compared",
    !!q && q.sellers[0]?.filer === "berk" && q.sellers[0].delta === -389_368_450 && same(q.moves.map((m) => [m.filer, m.bp]), [["berk", 256], ["new", 105]]) &&
      !q.sellers.some((m) => m.filer === "conf") && ![...q.buyers, ...q.sellers].some((m) => m.filer === "odd") && q.compared === 4,
    q);
  check("  …a security held by fewer than three managers the quarter before has none", pageQuarter("2024-06-30", new Map([["a", h(1)]]), cur, compared) === null);
  const few = new Map([["x", h(263_369_307)], ["y", h(258_169_208)], ["z", h(10)]]);
  const fewNow = new Map([["x", h(13_168_465)], ["y", h(12_908_460)], ["z", h(10)]]);
  const fewCompared = new Map([["x", report()], ["y", report()], ["z", report()]]);
  const wheels = pageQuarter("2026-06-30", few, fewNow, fewCompared, { sharesOutstanding: 36_000_000, sharesBefore: 720_000_000 });
  check("  …a split too few held through read from the company's stated counts (Wheels Up's one for twenty of 2026: Delta's 263,369,307 shares to 13,168,465 no sale); a change greater than the company none",
    !!wheels && wheels.split === 0.05 && !wheels.moves.length && pageQuarter("2026-06-30", few, fewNow, fewCompared, { sharesOutstanding: 36_000_000 }) === null,
    wheels);
  const many = new Map(["a", "b", "c", "d", "e"].map((k) => [k, h(2_144_784_623)] as [string, Holding]));
  const manyNow = new Map(["a", "b", "c", "d", "e"].map((k, i) => [k, h(2_143_786_860 + i)] as [string, Holding]));
  const after = pageQuarter("2024-09-30", many, manyNow, new Map([...many.keys()].map((k) => [k, report()])), { sharesOutstanding: 24_530_000_000, sharesBefore: 2_460_000_000 });
  check("  …but never beside holders who show none: NVIDIA's count stated before its split of June 2024 reads no second split the quarter after (Vanguard's 2,144,784,623 shares to 2,143,786,860)",
    after?.split === 1 && !after.moves.length, after?.split);

  console.log("\nThe committed files");
  const { filers, pages } = instHoldings();
  let summaries = 0;
  let moves = 0;
  const periods = new Set<string>();
  for (const qs of pages.values()) for (const x of qs) {
    summaries++;
    moves += x.moves.length;
    periods.add(x.period);
  }
  const sorted = [...periods].sort();
  check(`${EXPECTED.years} years of quarters, ${EXPECTED.firstPeriod} to ${EXPECTED.lastPeriod} (2013's first two, fewer than ${MIN_MANAGERS} managers compared, left out): ${EXPECTED.pages.toLocaleString("en-US")} pages, ${EXPECTED.summaries.toLocaleString("en-US")} quarters, ${EXPECTED.moves.toLocaleString("en-US")} moves of 1% or more`,
    sorted[0] === EXPECTED.firstPeriod && sorted.at(-1) === EXPECTED.lastPeriod && pages.size === EXPECTED.pages && summaries === EXPECTED.summaries && moves === EXPECTED.moves,
    { first: sorted[0], last: sorted.at(-1), pages: pages.size, summaries, moves });

  console.log("\nThe rows");
  const aapl = instHoldingsEvents(pages.get("AAPL") ?? [], filers, { ticker: "AAPL", name: "Apple Inc." });
  const berkshire = aapl.find((e) => e.date === "2024-08-14" && /BERKSHIRE HATHAWAY/i.test(e.title) && !/^Big investors/.test(e.title));
  check("Apple's page: Berkshire Hathaway's sale of 389,368,450 shares in 2024's second quarter, on its report's day, linked to the filing",
    !!berkshire && /selling 389,368,450 Apple Inc\. shares in the quarter ended June 30, 2024 \(2\.\d% of the company\)/.test(berkshire.title) && /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/1067983\//.test(berkshire.url ?? ""),
    berkshire?.title);
  const summary = aapl.find((e) => e.date === "2024-08-14" && /^Big investors' 13F reports for the quarter ended June 30, 2024/.test(e.title));
  check("  …the quarter's summary on its deadline, its biggest buyers and sellers named, the managers holding counted, the caveat that a change is not a trade",
    !!summary && /managers reported holding Apple Inc\. \(AAPL\)/.test(summary.description ?? "") && /not a trade's day or price/.test(summary.description ?? "") && summary.sourceKey === "inst_13f",
    summary?.title);
  const nvda = instHoldingsEvents(pages.get("NVDA") ?? [], filers, { ticker: "NVDA", name: "NVIDIA CORP" });
  check("NVIDIA's second quarter of 2024 read across its ten-for-one split; J. Stern & Co.'s misstated position of 2025 makes no row",
    /after a 10-for-1 split/.test(nvda.find((e) => e.date === "2024-08-14" && /^Big investors/.test(e.title))?.description ?? "") && !nvda.some((e) => /J\. Stern/.test(e.title)),
    nvda.filter((e) => e.date === "2024-08-14").map((e) => e.title.slice(0, 90)));
  check("a row's id and key are the page and the quarter, a move's its manager too", !!summary && summary.dedupBasis === "inst13f:AAPL@2024-06-30" && berkshire?.dedupBasis === "inst13f:AAPL@2024-06-30:1067983");

  console.log("\nEvery page");
  const first: Record<string, string> = {};
  for (const [f, k] of [["digest-1985-entries.json.gz", "firstPrices"], ["eeoc-listing.json.gz", "first"], ["fda-device-recalls.json.gz", "first"], ["occ-actions.json.gz", "first"]] as const) {
    Object.assign(first, JSON.parse(gunzipSync(readFileSync(join(__dirname, "fixtures", f))).toString())[k]);
  }
  let fromFirst = 0;
  const fromPages = new Set<string>();
  for (const [ticker, qs] of pages) {
    if (!first[ticker]) continue;
    const n = instHoldingsEvents(qs, filers, { ticker, from: first[ticker], name: ticker }).length;
    fromFirst += n;
    if (n) fromPages.add(ticker);
  }
  check(`from first prices: ${EXPECTED.fromFirst.toLocaleString("en-US")} rows on ${EXPECTED.fromFirstPages} pages`, fromFirst === EXPECTED.fromFirst && fromPages.size === EXPECTED.fromFirstPages, `${fromFirst} on ${fromPages.size}`);
  const quarterOf = (t: string, p: string) => (pages.get(t) ?? []).find((x) => x.period === p);
  check("the audit's merger quarters read as stated (batch 184): First Citizens' CIT quarter, Agnico Eagle's and Mativ's no split; NVIDIA's ten for one, Apple's four for one, Old Dominion's three for two kept",
    quarterOf("FCNCA", "2022-03-31")?.split === 1 && quarterOf("AEM", "2022-03-31")?.split === 1 && quarterOf("MATV", "2022-09-30")?.split === 1 &&
      quarterOf("NVDA", "2024-06-30")?.split === 10 && quarterOf("AAPL", "2020-09-30")?.split === 4 && quarterOf("ODFL", "2020-03-31")?.split === 1.5,
    ["FCNCA", "AEM", "MATV"].map((t) => quarterOf(t, t === "MATV" ? "2022-09-30" : "2022-03-31")?.split));

  console.log("\nAt ingest");
  const step = await instHoldingsFor(fakeDb("1980-12-12"), 1, { edgarName: "Apple Inc.", alsoKnownAs: [], cik: 320193, ticker: "AAPL" });
  check("the page's quarters from its first price, with no request, as a complete answer", step.outcome === "ok" && step.events.length === aapl.length && !!step.complete, `${step.outcome} ${step.events.length}`);
  const none = await instHoldingsFor(fakeDb(null), 1, { edgarName: "Apple Inc.", alsoKnownAs: [], cik: 320193, ticker: "AAPL" });
  const fund = await instHoldingsFor(fakeDb("2000-01-03"), 1, { edgarName: "Vanguard 500 Index Fund", alsoKnownAs: [], cik: 36405, ticker: "VFIAX", fundSeries: true });
  check("  …asked again while it has no prices; a mutual fund, which no exchange trades, none", none.outcome === "error" && /no prices/.test(none.detail ?? "") && fund.events.length === 0 && fund.outcome === "empty");

  console.log("\nRegistered, licensed, wired");
  const src = SOURCES.find((s) => s.key === "inst_13f");
  check("the source is id 53, public domain, cleared for commercial use, reviewed 2026-11-24, credited to the SEC",
    src?.id === 53 && src.license === "public domain" && src.commercialOk && src.reviewedOn === "2026-11-24" && src.attribution === "U.S. Securities and Exchange Commission", src);
  check("  …a company source, quota and refresh noted, scored without the model: a 1% move 0.9, a quarter's summary 0.8",
    (COMPANY_SOURCES as readonly string[]).includes("inst_13f") && QUOTAS.inst_13f.perDay === null && SOURCE_TTL_MINUTES.inst_13f === 1440 &&
      deterministicScore({ eventId: 0, kind: "filing", title: "BERKSHIRE HATHAWAY INC reported selling 389,368,450 Apple Inc. shares", sourceKey: "inst_13f" }, { kind: "company", displayName: "Apple", ticker: "AAPL" }, ["apple"])?.score === 0.9 &&
      deterministicScore({ eventId: 0, kind: "filing", title: "Big investors' 13F reports for the quarter ended June 30, 2024: biggest buyer", sourceKey: "inst_13f" }, { kind: "company", displayName: "Apple", ticker: "AAPL" }, ["apple"])?.score === 0.8);
  check("  …the ingest asks it for every page, by its ticker", /await run\("inst_13f", [^\n]+\n\s*instHoldingsFor\(client, subjectId, \{[^}]*ticker: company\.ticker[^}]*\}\),/.test(read("scripts/ingest.ts")));
  check("  …synced monthly by `npm run sync:13f`, its cache git-ignored, and credited on the footer and the terms page",
    /"sync:13f": "NODE_OPTIONS=--max-old-space-size=10240 tsx scripts\/sync-13f\.ts"/.test(read("package.json")) && /^\/\.cache$/m.test(read(".gitignore")) &&
      /filings, insiders&apos; trades, big investors&apos; 13F and funds&apos; N-PORT holdings reports from SEC EDGAR/.test(read("app/layout.tsx").replace(/\s+/g, " ")) &&
      /filings, insiders&apos; trades, big investors&apos; 13F and funds&apos; N-PORT holdings reports from the SEC/.test(read("app/legal/terms/page.tsx").replace(/\s+/g, " ")));

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
