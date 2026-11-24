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
import { type Filing, INSIDER_TRADES_DIR, REL, addDay, companyDays, dayOf, effectiveFilings, insiderEvents, insiderTrades, isInsider, newYear, relOf, roleOf } from "../lib/insiderTrades";
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
  issuers: 5_508,
  days: 521_851,
  first: "2006-01-03",
  last: "2026-09-30",
  // from first prices, for the pages the fixtures read
  fromFirst: 105_719,
  fromFirstPages: 615,
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
  ]);
  check("an amendment restates the last filing before it by the same owner for the same issuer and period, on that filing's day; another owner's stands; an amendment with none before it is its own",
    eff.length === 3 && eff.find((f) => f.accession === "a1")?.trades[0].shares === 2_000 && eff.find((f) => f.accession === "a1")?.amended === true && !eff.some((f) => f.accession === "a2") &&
      !!eff.find((f) => f.accession === "b1") && !!eff.find((f) => f.accession === "c1"),
    eff.map((f) => [f.accession, f.filedOn, f.trades[0].shares, f.amended]));
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
      return /insider transactions data sets/.test(body.about) && /17 U\.S\.C\. § 105/.test(body.about) && /batch 181/.test(body.about) && body.read === "2026-11-24";
    }));
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
