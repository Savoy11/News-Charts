/**
 * Insiders' open-market purchases and sales (batch 181, the owner's call of 2026-11-24, "Insider trades, Form 4",
 * reversing the call of 2026-10-18 to leave insider forms out).
 *
 *   npm run check:insiders
 *
 * Offline: the committed files (`data/insiders/`, written by `npm run sync:insiders` from the SEC's 83 insider
 * transactions data sets of 2026-11-24), hand-built cases for each rule, and the first trading days the other checks'
 * fixtures carry.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { PoolClient } from "pg";
import index from "../data/edgar-tickers.json";
import { deterministicScore } from "../lib/enrich/relevance";
import { insiderTradesFor } from "../lib/ingest/insiderTradesFor";
import { QUOTAS } from "../lib/ingest/quota";
import { SOURCE_TTL_MINUTES } from "../lib/ingest/refresh";
import { SOURCES } from "../lib/ingest/store";
import {
  type Filing,
  INSIDER_TRADES_DIR,
  MIN_DAY_VALUE,
  REL,
  addDay,
  bigEnough,
  companyDays,
  dayOf,
  dayValue,
  effectiveFilings,
  insiderEvents,
  insiderTrades,
  isInsider,
  MAX_PRICE,
  MAX_TRADE,
  newYear,
  ownShares,
  readPrices,
  relOf,
  roleOf,
} from "../lib/insiderTrades";
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
  years: 21,
  // 5,508 issuers and 521,851 days in batch 181, before the $1 million minimum of batch 182
  // 4,121 and 141,131 in batch 182, before batch 184 read the security's title, the prices and the blocks reported twice
  issuers: 4_002,
  days: 139_994,
  first: "2006-01-03",
  last: "2026-09-30",
  // from first prices, for the pages the fixtures read
  // 105,719 on 615 in batch 181
  // 35,318 on 564 in batch 182
  fromFirst: 35_190,
  fromFirstPages: 558,
};

const filing = (over: Partial<Filing>): Filing => ({
  accession: "0000000000-22-000001",
  filedOn: "2022-12-14",
  form: "4",
  issuerCik: 1318605,
  issuerName: "Tesla, Inc.",
  period: "2022-12-12",
  plan: false,
  ownerCik: "1494730",
  owner: "Musk Elon",
  rel: REL.director | REL.officer | REL.tenPercent,
  title: "CEO",
  joint: 0,
  trades: [{ code: "S", shares: 1_000, value: 162_810, day: "2022-12-12" }],
  ...over,
});

async function main(): Promise<void> {
  console.log("The filings");
  check("a day as the data sets write it; none where it is none", dayOf("26-SEP-2024") === "2024-09-26" && dayOf("") === "" && dayOf("2024-09-26") === "");
  check("a reporting owner's relationship: director, officer, 10% owner, other; an insider is any of the first three, \"Other\" alone none",
    relOf("Director,Officer,TenPercentOwner") === 7 && relOf("Other") === 8 && isInsider(relOf("Officer")) && !isInsider(relOf("Other")) && !isInsider(0));
  check("  …a role as a row says it: the officer's title the filing gives, then director and 10% owner",
    roleOf({ rel: 7, title: "CEO" }) === "CEO, director, 10% owner" && roleOf({ rel: REL.officer }) === "officer" && roleOf({ rel: REL.tenPercent }) === "10% owner");
  const eff = effectiveFilings([
    filing({ accession: "a1", filedOn: "2022-12-14" }),
    filing({ accession: "a2", filedOn: "2022-12-20", form: "4/A", trades: [{ code: "S", shares: 2_000, value: 325_620, day: "2022-12-12" }] }),
    filing({ accession: "b1", filedOn: "2022-12-14", ownerCik: "2", owner: "Kirkhorn Zachary", period: "2022-12-12" }),
    filing({ accession: "c1", filedOn: "2010-01-05", form: "4/A", period: "2009-12-30" }),
    filing({ accession: "d1", filedOn: "2022-02-02", ownerCik: "9", owner: "Seeger Laureen", period: "2022-01-31", trades: [{ code: "S", shares: 10, value: 2_500, day: "2022-01-31" }] }),
    filing({ accession: "d2", filedOn: "2022-02-10", form: "4/A", ownerCik: "9", owner: "Seeger Laureen", period: "2022-01-31", trades: [{ code: "S", shares: 10, value: 2_500, day: "2022-01-31" }, { code: "S", shares: 20, value: 5_000, day: "2022-02-08" }] }),
  ]);
  check("an amendment restates the last filing before it by the same owner for the same issuer and period, on that filing's day; another owner's stands; an amendment with none before it is its own",
    eff.length === 5 && eff.find((f) => f.accession === "a1")?.trades[0].shares === 2_000 && eff.find((f) => f.accession === "a1")?.amended === true && !eff.some((f) => f.accession === "a2") &&
      !!eff.find((f) => f.accession === "b1") && !!eff.find((f) => f.accession === "c1"),
    eff.map((f) => [f.accession, f.filedOn, f.trades[0].shares, f.amended]));
  check("  …its trades dated after that filing's day, which it could not have reported, a filing of their own on the amendment's day (batch 184)",
    same(eff.filter((f) => f.ownerCik === "9").map((f) => [f.accession, f.filedOn, f.trades.map((t) => t.day)]), [["d1", "2022-02-02", ["2022-01-31"]], ["d2", "2022-02-10", ["2022-02-08"]]]),
    eff.filter((f) => f.ownerCik === "9").map((f) => [f.accession, f.filedOn, f.trades.map((t) => t.day)]));
  const days = companyDays([
    filing({ accession: "x1", trades: [{ code: "S", shares: 1_000, value: 160_000, day: "2022-12-12" }, { code: "S", shares: 500, value: 81_000, day: "2022-12-13" }] }),
    filing({ accession: "x2", ownerCik: "2", owner: "Kirkhorn Zachary", rel: REL.officer, title: "Chief Financial Officer", trades: [{ code: "S", shares: 300, value: 54_000, day: "2022-12-13" }] }),
    filing({ accession: "x3", ownerCik: "3", owner: "Ellison Larry", rel: REL.director, title: undefined, trades: [{ code: "P", shares: 100, day: "2022-12-12" }] }),
    filing({ accession: "y1", filedOn: "2022-12-20" }),
  ]);
  const tsla = days.get(1318605) ?? [];
  check("one row a company a filing day: an insider's sales one entry, its shares and value added, its trade days a span; the largest trade's filing linked; a purchase with no price its shares alone",
    tsla.length === 2 && tsla[0].entries.length === 3 && same(tsla[0].entries.map((e) => [e.owner, e.code, e.shares, e.value ?? null, e.first, e.last]), [
      ["Musk Elon", "S", 1_500, 241_000, "2022-12-12", "2022-12-13"],
      ["Kirkhorn Zachary", "S", 300, 54_000, "2022-12-13", "2022-12-13"],
      ["Ellison Larry", "P", 100, null, "2022-12-12", "2022-12-12"],
    ]) && tsla[0].accession === "x1",
    tsla);
  const entry = (code: "P" | "S", value?: number) => ({ owner: "x", rel: REL.officer, code, shares: 1, value, first: "", last: "", plan: false, amended: false, joint: 0 });
  check("the owner's $1 million minimum (batch 182): a day's purchases and sales together, a trade with no price adding nothing; $999,999 none, $1,000,000 kept",
    MIN_DAY_VALUE === 1_000_000 && dayValue({ entries: [entry("S", 600_000), entry("P", 400_000), entry("S")] }) === 1_000_000 && bigEnough({ entries: [entry("S", 600_000), entry("P", 400_000)] }) &&
      !bigEnough({ entries: [entry("S", 999_999)] }) && !bigEnough({ entries: [entry("P"), entry("S")] }));

  console.log("\nBatch 184: the audit of 2026-11-25");
  check("only the company's own shares: common, ordinary, units, ADSs, never a preferred share, a note, a warrant or an option; a title's attached rights not its own",
    ownShares("Common stock, par value $0.01 per share") && ownShares("Common Stock (including associated preferred stock purchase rights)") && ownShares("Common stock and attached common stock purchase rights") &&
      ownShares("Units of limited partner interest") && ownShares("Sponsored ADRs, each convertible into 5 ordinary shares") && !ownShares("Series A Preferred Stock") &&
      !ownShares("5.5% Convertible Senior Notes due 2026") && !ownShares("Common Stock Warrants") && !ownShares("Rights for common shares") && !ownShares("Employee Stock Option (Right to Buy)"));
  const amd = (accession: string, day: string, shares: number, price: number, owner = "o") =>
    filing({ accession, issuerCik: 2488, issuerName: "ADVANCED MICRO DEVICES INC", ownerCik: owner, owner, filedOn: day, period: day, trades: [{ code: "S", shares, value: Math.round(shares * price), day }] });
  const priced = readPrices([
    amd("m1", "2017-08-01", 10_000, 13.1, "a"),
    amd("m2", "2017-08-02", 5_000, 12.9, "b"),
    amd("m3", "2017-08-07", 2_000, 13.4, "c"),
    amd("slip", "2017-08-04", 40_000_000, 525_600_000, "Mubadala"),
    amd("odd", "2017-08-04", 1_000, 90_000, "d"),
  ]);
  const at = (acc: string) => priced.find((f) => f.accession === acc)!.trades[0];
  check("a price that is the trade's total is read as the total (Mubadala's 40,000,000 AMD shares \"at $525,600,000.00\", 2017-08-04); another impossible price set aside; the others as stated",
    at("slip").value === 525_600_000 && at("slip").read === "total" && at("odd").value === undefined && at("odd").read === "aside" && at("m1").value === 131_000 && at("m1").read === undefined,
    priced.map((f) => [f.accession, f.trades[0].value, f.trades[0].read]));
  const lone = readPrices([
    amd("l1", "2008-04-08", 10_651_896, 250_000_000, "WL ROSS"),
    amd("l2", "2008-04-08", 10_651_896, 250_000_000, "WLR Master"),
    amd("l3", "2009-06-01", 1_000_000, 6_000, "e"),
    amd("l4", "2011-06-01", 1_000, 25, "f"),
  ]);
  const lat = (acc: string) => lone.find((f) => f.accession === acc)!.trades[0];
  check("  …with no three other prices to compare, over $1,000,000 a share or $5 billion a trade set aside, a group's repeated slip no comparison; a plausible lone trade as stated",
    MAX_PRICE === 1_000_000 && MAX_TRADE === 5_000_000_000 && lat("l1").read === "aside" && lat("l2").read === "aside" && lat("l3").read === "aside" && lat("l4").value === 25_000,
    lone.map((f) => [f.accession, f.trades[0].value, f.trades[0].read]));
  const record = readPrices([2014, 2016, 2018, 2020, 2022].map((y, i) => amd(`r${i}`, `${y}-03-01`, 1_000, 5, `r${i}`)).concat([amd("far", "2024-03-01", 2_000, 900, "g")]));
  check("  …a price a hundred times the median of the company's whole record set aside, which a year's slips cannot move",
    record.find((f) => f.accession === "far")!.trades[0].read === "aside" && record.find((f) => f.accession === "r0")!.trades[0].read === undefined);
  const ar = (accession: string, owner: string, direct: boolean, after = 208_965_909, rows?: { shares: number; after: number }[]) =>
    filing({ accession, issuerCik: 1433270, issuerName: "ANTERO RESOURCES Corp", filedOn: "2014-05-21", ownerCik: owner, owner, rel: REL.tenPercent, title: undefined,
      trades: (rows ?? [{ shares: 12_000_000, after }]).map((r) => ({ code: "S" as const, shares: r.shares, value: r.shares * 62, day: "2014-05-19", after: r.after, direct })) });
  const block = companyDays([ar("d1", "Antero Resources Investment LLC", true), ar("d2", "WP Antero", false), ar("d3", "RADY PAUL M", false, 208_965_911)]).get(1433270)![0];
  check("one block its owners each reported counts once (Antero's 12,000,000 shares of 2014-05-21, thirteen times): the one held directly keeps it, naming the others, holdings after within a ten-thousandth",
    block.entries.length === 1 && block.entries[0].owner === "Antero Resources Investment LLC" && same(block.entries[0].also, ["WP Antero", "RADY PAUL M"]) && dayValue(block) === 744_000_000,
    block.entries.map((e) => [e.owner, e.also]));
  const sold = companyDays([ar("s1", "A", true, 0), ar("s2", "B", true, 0)]).get(1433270)![0];
  const spouses = companyDays([ar("h1", "REITZEL RUFUS H JR", true, 10_404_542), ar("h2", "REITZEL HEATHER", true, 10_404_542)]).get(1433270)![0];
  const rows2 = [{ shares: 72_421_091, after: 44_002_828 }, { shares: 7_268_143, after: 4_325_050 }];
  const order = companyDays([ar("o1", "BLACKSTONE", false, 0, rows2), ar("o2", "SCHWARZMAN", false, 0, [...rows2].reverse())]).get(1433270)![0];
  check("  …two who each sold out alike, both directly, stay two; two holding alike what is more than the trade are one (a husband and wife); a filing's holdings in any order are added",
    sold.entries.length === 2 && spouses.entries.length === 1 && order.entries.length === 1 && order.entries[0].shares === 79_689_234, [sold.entries.length, spouses.entries.length, order.entries.length]);
  const partly = companyDays([filing({ accession: "p1", trades: [{ code: "S", shares: 1_000_000, value: 50_000_000, day: "2022-12-12" }, { code: "S", shares: 100, day: "2022-12-12" }] })]).get(1318605)![0];
  check("  …a trade with no price leaves its entry's priced trades counted (the audit's finding 6: a $50 million sale beside an unpriced 100 shares)",
    partly.entries[0].value === undefined && partly.entries[0].priced === 50_000_000 && dayValue(partly) === 50_000_000 && bigEnough(partly), partly.entries[0]);
  const blockRow = insiderEvents([block], { ticker: "AR", cik: 1433270 })[0];
  const partRow = insiderEvents([partly], { ticker: "TSLA", cik: 1318605 })[0];
  check("  …the rows say so: the block's other filers, the priced trades' value, a price read as the total or set aside",
    blockRow.title === "Antero Resources Investment LLC (10% owner), reported also by 2 other filers, sold 12,000,000 ANTERO RESOURCES Corp shares, about $744 million" &&
      /the same shares reported also by WP Antero and RADY PAUL M: sold 12,000,000 shares/.test(blockRow.description ?? "") && /\(about \$50 million for the trades with a price\)/.test(partRow.description ?? "") &&
      /a price the filing gives read as the trade's total/.test(insiderEvents([{ ...partly, entries: [{ ...partly.entries[0], total: true }] }], { ticker: "TSLA", cik: 1318605 })[0].description ?? ""),
    [blockRow.title, blockRow.description?.slice(300, 500)]);
  check("  …the sync reads the security's title, the holdings after, direct or indirect, and no trade day after its filing's",
    /!ownShares\(r\.SECURITY_TITLE/.test(read("scripts/sync-insiders.ts")) && /SHRS_OWND_FOLWNG_TRANS/.test(read("scripts/sync-insiders.ts")) && /day > f\.filedOn \? "" : day/.test(read("scripts/sync-insiders.ts")) &&
      /readPrices\(effectiveFilings\(all\)\)/.test(read("scripts/sync-insiders.ts")));

  const year = newYear();
  for (const d of tsla) addDay(year, 1318605, d);
  check("a year's file: owners and titles once each, a company's days by its CIK", same(year.owners, ["Musk Elon", "Kirkhorn Zachary", "Ellison Larry"]) && same(year.titles, ["CEO", "Chief Financial Officer"]) && year.pages["1318605"].length === 2);

  console.log("\nThe rows");
  const rows = insiderEvents(tsla, { ticker: "TSLA", cik: 1318605 });
  const one = insiderEvents([{ day: "2022-09-28", issuerName: "OCCIDENTAL PETROLEUM CORP /DE/", accession: "0000950170-22-019383", entries: [{ owner: "BERKSHIRE HATHAWAY INC", rel: REL.tenPercent, code: "P", shares: 5_985_190, value: 352_525_691, first: "2022-09-26", last: "2022-09-28", plan: false, amended: false, joint: 1 }] }], { ticker: "OXY", cik: 797468 });
  check("one insider's day: the owner as filed, its joint filers, its role, the shares and value; EDGAR's state suffix off the company's name; linked to the filing",
    one[0]?.title === "BERKSHIRE HATHAWAY INC and 1 joint filer (10% owner) bought 5,985,190 OCCIDENTAL PETROLEUM CORP shares, about $352.5 million" &&
      one[0].url === "https://www.sec.gov/Archives/edgar/data/797468/000095017022019383/" && /from September 26, 2022 to September 28, 2022 at about \$58\.90 a share/.test(one[0].description ?? ""),
    one[0]);
  check("  …several insiders' day: how many sold and bought, the total, led by the largest; each named in the text with the caveat that only open-market trades are shown",
    rows.find((r) => r.date === "2022-12-14")?.title === "Insiders' trades in Tesla, Inc.: 2 sold 1,800 shares (about $295,000); one bought 100 shares, led by Musk Elon" &&
      /never grants, option exercises, tax withholding or gifts/.test(rows[0].description ?? "") && rows.every((r) => r.sourceKey === "insider_trades"),
    rows.map((r) => r.title));
  check("  …a trade under a Rule 10b5-1 plan or an amended filing says so; a row's id and key are the page, the issuer's CIK and the day",
    /under a Rule 10b5-1 trading plan, as amended/.test(insiderEvents([{ ...tsla[1], entries: [{ ...tsla[1].entries[0], plan: true, amended: true }] }], { ticker: "TSLA", cik: 1318605 })[0].description ?? "") &&
      rows[0].dedupBasis === "insider:TSLA:1318605@2022-12-20" && rows[0].id === "insider-TSLA-1318605-2022-12-20");

  console.log("\nThe committed files");
  const pages = insiderTrades();
  let n = 0;
  const all: string[] = [];
  for (const ds of pages.values()) for (const d of ds) {
    n++;
    all.push(d.day);
  }
  all.sort();
  const files = readdirSync(INSIDER_TRADES_DIR).filter((f) => /^\d{4}\.json\.gz$/.test(f));
  check(`${EXPECTED.years} years of filings, ${EXPECTED.first} to ${EXPECTED.last}: ${EXPECTED.days.toLocaleString("en-US")} company days on ${EXPECTED.issuers.toLocaleString("en-US")} issuers`,
    files.length === EXPECTED.years && pages.size === EXPECTED.issuers && n === EXPECTED.days && all[0] === EXPECTED.first && all.at(-1) === EXPECTED.last,
    { years: files.length, issuers: pages.size, days: n, first: all[0], last: all.at(-1) });
  check("  …each file says what it holds, credits the SEC and names its batch",
    files.every((f) => {
      const body = JSON.parse(gunzipSync(readFileSync(join(INSIDER_TRADES_DIR, f))).toString()) as { about: string; read: string };
      return /insider transactions data sets/.test(body.about) && /17 U\.S\.C\. § 105/.test(body.about) && /\$1 million or more/.test(body.about) && /batches 181–182/.test(body.about) && body.read === "2026-11-24";
    }));
  check("  …every committed day $1 million or more", [...pages.values()].every((ds) => ds.every(bigEnough)));
  let implausible = 0;
  let lateDays = 0;
  for (const ds of pages.values()) for (const d of ds) for (const e of d.entries) {
    if (e.value && e.value / e.shares > MAX_PRICE) implausible++;
    if (e.last > d.day) lateDays++;
  }
  check("  …no entry at over $1,000,000 a share, nor a trade day after its filing day (batch 184)", implausible === 0 && lateDays === 0, { implausible, lateDays });
  const amdRow = insiderEvents(pages.get(2488) ?? [], { ticker: "AMD", cik: 2488 }).find((e) => e.date === "2017-08-04");
  const arRow = insiderEvents(pages.get(1433270) ?? [], { ticker: "AR", cik: 1433270 }).find((e) => e.date === "2014-05-21");
  check("AMD's page: Mubadala's 40,000,000 shares of 2017-08-04, about $525.6 million, its price read as the total; Antero's block of 2014-05-21 once, about $744 million",
    !!amdRow && /sold 40,000,000 ADVANCED MICRO DEVICES INC shares, about \$525\.6 million$/.test(amdRow.title) && /read as the trade's total/.test(amdRow.description ?? "") &&
      !!arRow && /reported also by 12 other filers, sold 12,000,000 ANTERO RESOURCES Corp shares, about \$744 million$/.test(arRow.title),
    [amdRow?.title, arRow?.title]);
  const musk = insiderEvents(pages.get(1318605) ?? [], { ticker: "TSLA", cik: 1318605 }).find((e) => e.date === "2022-12-14");
  check("Tesla's page: Musk's sale of 21,995,000 shares filed December 14, 2022, about $3.6 billion",
    !!musk && /^Musk Elon \(CEO, director, 10% owner\) sold 21,995,000 Tesla, Inc\. shares, about \$3\.6 billion$/.test(musk.title), musk?.title);
  const oxy = insiderEvents(pages.get(797468) ?? [], { ticker: "OXY", cik: 797468 }).filter((e) => e.date >= "2022-01-01" && e.date <= "2022-12-31" && /BERKSHIRE HATHAWAY/.test(e.title));
  check("Occidental's page: Berkshire Hathaway's purchases of 2022 as a 10% owner", oxy.length >= 10 && oxy.every((e) => / bought /.test(e.title)), `${oxy.length}`);

  console.log("\nEvery page");
  const first: Record<string, string> = {};
  for (const [f, k] of [["digest-1985-entries.json.gz", "firstPrices"], ["eeoc-listing.json.gz", "first"], ["fda-device-recalls.json.gz", "first"], ["occ-actions.json.gz", "first"]] as const) {
    Object.assign(first, JSON.parse(gunzipSync(readFileSync(join(__dirname, "fixtures", f))).toString())[k]);
  }
  const cikOf = new Map((index as unknown as { companies: [number, string, string][] }).companies.map((c) => [c[1], c[0]]));
  let fromFirst = 0;
  const fromPages = new Set<string>();
  for (const [ticker, day] of Object.entries(first)) {
    const cik = cikOf.get(ticker);
    if (cik === undefined) continue;
    const k = insiderEvents(pages.get(cik) ?? [], { ticker, cik, from: day }).length;
    fromFirst += k;
    if (k) fromPages.add(ticker);
  }
  check(`from first prices: ${EXPECTED.fromFirst.toLocaleString("en-US")} rows on ${EXPECTED.fromFirstPages} pages`, fromFirst === EXPECTED.fromFirst && fromPages.size === EXPECTED.fromFirstPages, `${fromFirst} on ${fromPages.size}`);

  console.log("\nAt ingest");
  const step = await insiderTradesFor(fakeDb("2010-06-29"), 1, { edgarName: "Tesla, Inc.", alsoKnownAs: [], cik: 1318605, ticker: "TSLA" });
  check("the page's days from its first price, with no request, as a complete answer", step.outcome === "ok" && step.events.length === insiderEvents(pages.get(1318605) ?? [], { ticker: "TSLA", cik: 1318605, from: "2010-06-29" }).length && !!step.complete, `${step.outcome} ${step.events.length}`);
  const none = await insiderTradesFor(fakeDb(null), 1, { edgarName: "Tesla, Inc.", alsoKnownAs: [], cik: 1318605, ticker: "TSLA" });
  const fund = await insiderTradesFor(fakeDb("2000-01-03"), 1, { edgarName: "Vanguard 500 Index Fund", alsoKnownAs: [], cik: 36405, ticker: "VFIAX", fundSeries: true });
  check("  …asked again while it has no prices; a fund's series has none", none.outcome === "error" && /no prices/.test(none.detail ?? "") && fund.events.length === 0 && fund.outcome === "empty");
  const xom = await insiderTradesFor(fakeDb("1980-01-02"), 1, { edgarName: "ExxonMobil Holdings Corp", alsoKnownAs: [], cik: 2115436, ticker: "XOM" });
  check("  …a predecessor's record to its handover day: Exxon Mobil Corporation's insiders on XOM's page before 2026-07-01",
    xom.events.some((e) => e.date < "2026-07-01" && /Archives\/edgar\/data\/34088\//.test(e.url ?? "")) && !xom.events.some((e) => e.date > "2026-07-01" && /data\/34088\//.test(e.url ?? "")), `${xom.events.length}`);

  console.log("\nRegistered, licensed, wired");
  const src = SOURCES.find((s) => s.key === "insider_trades");
  check("the source is id 55, public domain, cleared for commercial use, reviewed 2026-11-24, credited to the SEC",
    src?.id === 55 && src.license === "public domain" && src.commercialOk && src.reviewedOn === "2026-11-24" && src.attribution === "U.S. Securities and Exchange Commission", src);
  check("  …a company source, quota and refresh noted, scored without the model as filed under the company's CIK",
    (COMPANY_SOURCES as readonly string[]).includes("insider_trades") && QUOTAS.insider_trades.perDay === null && SOURCE_TTL_MINUTES.insider_trades === 1440 &&
      deterministicScore({ eventId: 0, kind: "filing", title: "Musk Elon (CEO, director, 10% owner) sold 21,995,000 Tesla, Inc. shares", sourceKey: "insider_trades" }, { kind: "company", displayName: "Tesla", ticker: "TSLA" }, ["tesla"])?.score === 1);
  check("  …the ingest asks it for every page, by its CIK", /await run\("insider_trades", [^\n]+\n\s*insiderTradesFor\(client, subjectId, \{[^}]*cik: company\.cik[^}]*\}\),/.test(read("scripts/ingest.ts")));
  check("  …synced quarterly by `npm run sync:insiders`, and credited on the footer and the terms page",
    /"sync:insiders": "NODE_OPTIONS=--max-old-space-size=6144 tsx scripts\/sync-insiders\.ts"/.test(read("package.json")) &&
      /filings, insiders&apos; trades, big investors&apos; 13F/.test(read("app/layout.tsx").replace(/\s+/g, " ")) &&
      /filings, insiders&apos; trades, big investors&apos; 13F/.test(read("app/legal/terms/page.tsx").replace(/\s+/g, " ")));

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
