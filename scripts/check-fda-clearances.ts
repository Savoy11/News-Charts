/**
 * The FDA's 510(k) clearances and De Novo grants, 1976–2026 (batch 172, the 2026-11-22b proposal 1, approved by the
 * owner that day with call (a): one row a company a month naming each device, a De Novo grant a row of its own).
 *
 *   npm run check:fda-clearances
 *
 * Offline: the committed file (`data/fda-clearances.json.gz`, written by `npm run sync:fda-clearances` from openFDA's
 * device/510k file as served on 2026-11-22), 29 of that file's records in its own layout and zip
 * (scripts/fixtures/fda-clearances-510k.zip), and the first trading days the other checks' fixtures carry.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { PoolClient } from "pg";
import tickerIndex from "../data/edgar-tickers.json";
import { GROUPED_ROW_SOURCES } from "../lib/corroboration";
import { dojPossessive } from "../lib/doj";
import { withoutTag } from "../lib/edgarName";
import { deterministicScore } from "../lib/enrich/relevance";
import {
  FDA_510K_ENTRY,
  NOT_THE_COMPANY,
  type FdaClearance,
  candidatesFor,
  clearanceEvents,
  clearanceIsCompany,
  clearancePage,
  clearanceReader,
  fdaClearances,
  isDeNovo,
} from "../lib/fdaClearances";
import { FDA_FIRMS } from "../lib/fdaRecalls";
import { companyNames } from "../lib/frCompany";
import { fdaClearancesFor } from "../lib/ingest/fdaClearancesFor";
import { namesForYear } from "../lib/ingest/frBackfill";
import { QUOTAS } from "../lib/ingest/quota";
import { SOURCE_TTL_MINUTES } from "../lib/ingest/refresh";
import { SOURCES } from "../lib/ingest/store";
import { newsNamesFor, possessiveNameFor } from "../lib/sec";
import { eachZipLine } from "../lib/zip";
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

const EXPECTED = {
  total: 176_683,
  kept: 20_368,
  deNovo: 59,
  // every listed company in the index, under the rule, its names as the replay below builds them
  days: 18_305,
  companies: 246,
  // from first prices, for the 954 companies the fixtures read
  fromFirst: 12_056,
  fromFirstPages: 63,
  fromFirst2017: 9_285,
  fromFirst1994: 2_734,
  rows: 5_467,
  rows2017: 4_129,
  deNovoRows: 25,
  top: "JNJ 561, MDT 522, BDX 489, GE 464, PHG 452, ABT 438, SYK 389, BSX 339, MMM 321, BAX 257",
};

const companies = (tickerIndex as unknown as { companies: [number, string, string][] }).companies;
const cikOf = (ticker: string) => companies.find((c) => c[1] === ticker)![0];
/** A company's names of a year as ingest builds them, less the former names only the database holds. */
const namesOf = (cik: number) => (year: number) => {
  const title = companies.find((c) => c[0] === cik)![2];
  const own = dojPossessive(title, possessiveNameFor(cik));
  return [...companyNames(title, namesForYear(year, newsNamesFor(cik), [])), ...(own ? [own] : []), withoutTag(title)];
};

async function main(): Promise<void> {
  const slice: FdaClearance[] = [];
  const reader = clearanceReader((c) => slice.push(c));
  await eachZipLine(readFileSync(join(__dirname, "fixtures", "fda-clearances-510k.zip")), FDA_510K_ENTRY, reader.line);
  const rec = (k: string) => slice.find((c) => c.k === k)!;
  const on = (k: string, ticker: string) => clearanceIsCompany(rec(k), cikOf(ticker), namesOf(cikOf(ticker)));

  console.log("The file read");
  const meta = reader.meta();
  check("openFDA's layout read a record at a time: 29 decisions, its header's day and count",
    slice.length === 29 && meta.lastUpdated === "2026-11-18" && meta.total === 29, { n: slice.length, meta });
  const abbott = rec("K760593");
  check("  …each with its number, day, applicant as filed, device, product code and decision code: Abbott Laboratories' cardiac monitor of 1976-09-16",
    abbott.day === "1976-09-16" && /^Abbott Laboratories/.test(abbott.applicant) && abbott.code === "SESE" && !!abbott.device && /^[A-Z]{3}$/.test(abbott.product), abbott);
  check("  …a De Novo grant by its code and number: Apple's ECG app, DEN180044, of 2018-09-11", isDeNovo(rec("DEN180044")) && rec("DEN180044").day === "2018-09-11" && !isDeNovo(abbott));

  console.log("\nThe rule");
  check("the company that filed, on the day: Abbott's monitor on ABT, Apple's app on AAPL", on("K760593", "ABT") && on("DEN180044", "AAPL"));
  check("  …a unit from the day its owner took it, each day read from a filing: Howmedica's of 1981, 1988 and 1994 off SYK and Howmedica Osteonics' of 1999 on it (Stryker's from 1998-12-04)",
    !on("K803127", "SYK") && !on("K874923", "SYK") && !on("K930223", "SYK") && on("K990922", "SYK"));
  check("  …Cordis's of 1984 and DePuy's of 1997 off JNJ, DePuy Orthopaedics' of 2000 on it (Cordis J&J's from 1996-02-23, DePuy from 1998-11-04)",
    !on("K811259", "JNJ") && !on("K972568", "JNJ") && on("K000172", "JNJ"));
  check("  …Physio-Control's of 1990 off MDT and of 1999 on it (from 1998-09-30); Linvatec's of 1995 off CNMD and of 1999 on it (from 1997-12-31); Radiometer's on DHR from 2004-01-27",
    !on("K902478", "MDT") && on("K990338", "MDT") && !on("K953702", "CNMD") && on("K990524", "CNMD") && on("K043143", "DHR") &&
      !clearanceIsCompany({ applicant: "Radiometer America, Inc.", day: "1995-06-01" }, cikOf("DHR"), namesOf(cikOf("DHR"))));
  check("  …a unit's own record under its owner's later name refused before the day: \"Medtronic Minimed\" of 1988 off MDT and of 2007 on it; \"3M Health Care, Sarns\" of 1977 off MMM and of 1989 on it",
    !on("K880623", "MDT") && on("K070438", "MDT") && !on("K770431", "MMM") && on("K884659", "MMM"));
  check("  …J&J's Ortho companies only: Ortho Diagnostic Systems' of 1985 on JNJ, Ortho Development's of 2025 and Ortho-Clinical's of 2016 off",
    on("K842216", "JNJ") && !on("K251052", "JNJ") && !on("K160495", "JNJ"));
  check("  …the namesakes read by hand: Quantum Co., Ltd.'s gloves off QMCO, \"Boston Scientific, Target\" off TGT and on BSX, Adm, Inc. off ADM, Blackstone Medical off BX",
    !on("K083931", "QMCO") && !on("K002181", "TGT") && on("K002181", "BSX") && !on("K952353", "ADM") && !on("K100044", "BX"));

  console.log("\nThe rows");
  const jnj = clearanceEvents(slice, namesOf(cikOf("JNJ")), { cik: cikOf("JNJ"), from: "1962-01-02" });
  const march = jnj.find((e) => e.date.startsWith("2005-03"));
  check("one row a company a month on the month's first decision day, naming each device and its number (the owner's call): J&J's three of March 2005",
    !!march && march.date === "2005-03-04" && /^FDA cleared 3 of the company's devices in March 2005: /.test(march.title) &&
      march.externalId === "K043223,K043058,K050344" && /it says nothing of a launch/.test(march.description ?? "") && march.url === clearancePage("K043223") &&
      march.sourceKey === "fda_clearances" && jnj.filter((e) => e.date.startsWith("2005-03")).length === 1,
    march);
  const aera = jnj.find((e) => e.externalId === "DEN150056");
  check("  …a De Novo grant a row of its own: Acclarent's Aera balloon on JNJ, 2016-09-16, linked to its De Novo page",
    aera?.date === "2016-09-16" && /^FDA granted Acclarent, Inc\.'s De Novo request for .* \(DEN150056\), a new kind of device$/.test(aera.title) &&
      aera.url === "https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/denovo.cfm?id=DEN150056",
    aera?.title);
  const one = clearanceEvents(slice, namesOf(cikOf("ABT")), { cik: cikOf("ABT"), from: "1962-01-02" }).find((e) => e.date === "1976-09-16");
  check("  …a month of one clearance titled by it: \"FDA cleared Abbott Laboratories' … (K760593): substantially equivalent to a device already marketed\"",
    /^FDA cleared Abbott Laboratories's? .* \(K760593\): substantially equivalent to a device already marketed$/.test(one?.title ?? "") && one?.url === clearancePage("K760593"), one?.title);
  check("  …from the company's first price", clearanceEvents(slice, namesOf(cikOf("ABT")), { cik: cikOf("ABT"), from: "1980-03-17" }).every((e) => e.date >= "1980-03-17"));

  console.log("\nThe committed file");
  const file = JSON.parse(gunzipSync(readFileSync(join(__dirname, "..", "data", "fda-clearances.json.gz"))).toString()) as { read: string; lastUpdated: string; total: number };
  const rows = fdaClearances();
  check(`openFDA's file of 2026-11-22: ${EXPECTED.total.toLocaleString("en-US")} decisions, ${EXPECTED.kept.toLocaleString("en-US")} a listed company holds, ${EXPECTED.deNovo} of them De Novo grants`,
    file.read === "2026-11-22" && file.lastUpdated === "2026-11-18" && file.total === EXPECTED.total && rows.length === EXPECTED.kept && rows.filter(isDeNovo).length === EXPECTED.deNovo,
    { read: file.read, total: file.total, kept: rows.length, deNovo: rows.filter(isDeNovo).length });
  check("  …every one with its number, a calendar day, its applicant and its code, none twice, in order of day",
    rows.every((c) => /^(?:K|DEN)\d+/.test(c.k) && /^\d{4}-\d{2}-\d{2}$/.test(c.day) && c.applicant && c.code) && new Set(rows.map((c) => c.k)).size === rows.length &&
      rows.every((c, i) => i === 0 || rows[i - 1].day <= c.day));
  check("  …the pre-purchase clearances no company holds are not in it: Howmedica's of 1981, Cordis's of 1984",
    !rows.some((c) => c.k === "K803127" || c.k === "K811259"));
  check("the names read by hand each name their company and say why, a day before which a unit's record is refused a calendar day",
    Object.entries(NOT_THE_COMPANY).every(([cik, list]) => list.every((n) => companies.some(([x, t]) => x === Number(cik) && t === n.ticker) && n.why.length > 20 && (!n.before || /^\d{4}-\d{2}-\d{2}$/.test(n.before)))) &&
      Object.values(NOT_THE_COMPANY).flat().length === 42);
  const firmFrom = (ticker: string, search: string) => Object.values(FDA_FIRMS).find((e) => e.ticker === ticker)?.firms.find((f) => f.search === search)?.from;
  check("  …and the recall map's units dated back to their purchase, before 2000 too (batch 172)",
    firmFrom("SYK", "Howmedica") === "1998-12-04" && firmFrom("JNJ", "DePuy") === "1998-11-04" && firmFrom("JNJ", "Cordis") === "1996-02-23" && firmFrom("JNJ", "LifeScan") === "1987-01-01" &&
      firmFrom("MDT", "Physio-Control") === "1998-09-30" && firmFrom("CNMD", "Linvatec") === "1997-12-31" && firmFrom("DHR", "Radiometer") === "2004-01-27" && firmFrom("DHR", "KaVo") === "2004-06-01");

  console.log("\nEvery listed company");
  const first: Record<string, string> = {};
  for (const [f, k] of [["digest-1985-entries.json.gz", "firstPrices"], ["eeoc-listing.json.gz", "first"], ["fda-device-recalls.json.gz", "first"], ["occ-actions.json.gz", "first"]] as const) {
    Object.assign(first, JSON.parse(gunzipSync(readFileSync(join(__dirname, "fixtures", f))).toString())[k]);
  }
  let days = 0;
  let after = 0;
  let after2017 = 0;
  let after1994 = 0;
  let rowsFirst = 0;
  let rows2017 = 0;
  let deNovoRows = 0;
  const held = new Set<string>();
  const pages = new Set<string>();
  const byPage: Record<string, number> = {};
  const seen = new Set<number>();
  for (const [cik, ticker] of companies) {
    if (seen.has(cik)) continue;
    seen.add(cik);
    const nm = namesOf(cik);
    const cand = candidatesFor(rows, cik, nm);
    const mine = new Set(cand.filter((c) => clearanceIsCompany(c, cik, nm)).map((c) => c.day));
    if (!mine.size) continue;
    days += mine.size;
    held.add(ticker);
    const from = first[ticker];
    if (!from) continue;
    const d = [...mine].filter((x) => x >= from);
    after += d.length;
    after2017 += d.filter((x) => x < "2017-01-01").length;
    after1994 += d.filter((x) => x < "1994-01-01").length;
    if (d.length) pages.add(ticker);
    const ev = clearanceEvents(cand, nm, { cik, from });
    rowsFirst += ev.length;
    rows2017 += ev.filter((e) => e.date < "2017-01-01").length;
    deNovoRows += ev.filter((e) => /De Novo request/.test(e.title)).length;
    byPage[ticker] = ev.length;
  }
  const top = Object.entries(byPage).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10).map(([t, n]) => `${t} ${n}`).join(", ");
  check(`before any first price: ${EXPECTED.days.toLocaleString("en-US")} company days on ${EXPECTED.companies} companies`, days === EXPECTED.days && held.size === EXPECTED.companies, `${days} on ${held.size}`);
  check(`  …from first prices: ${EXPECTED.fromFirst.toLocaleString("en-US")} company days on ${EXPECTED.fromFirstPages} pages, ${EXPECTED.fromFirst2017.toLocaleString("en-US")} before 2017, ${EXPECTED.fromFirst1994.toLocaleString("en-US")} before 1994`,
    after === EXPECTED.fromFirst && pages.size === EXPECTED.fromFirstPages && after2017 === EXPECTED.fromFirst2017 && after1994 === EXPECTED.fromFirst1994,
    `${after} on ${pages.size}, ${after2017} before 2017, ${after1994} before 1994`);
  check(`  …as rows, a company's month one: ${EXPECTED.rows.toLocaleString("en-US")}, ${EXPECTED.rows2017.toLocaleString("en-US")} before 2017, ${EXPECTED.deNovoRows} of them De Novo grants (${EXPECTED.top})`,
    rowsFirst === EXPECTED.rows && rows2017 === EXPECTED.rows2017 && deNovoRows === EXPECTED.deNovoRows && top === EXPECTED.top,
    `${rowsFirst}, ${rows2017} before 2017, ${deNovoRows} De Novo; ${top}`);

  console.log("\nAt ingest");
  const step = await fdaClearancesFor(fakeDb("1980-03-17"), 1, { edgarName: "ABBOTT LABORATORIES", alsoKnownAs: newsNamesFor(1800), cik: 1800 });
  check("the company's clearances from its first price, with no request, as a complete answer", step.outcome === "ok" && step.events.length > 300 && step.events.every((e) => e.date >= "1980-03-17") && !!step.complete,
    `${step.outcome} ${step.events.length}`);
  const none = await fdaClearancesFor(fakeDb(null), 1, { edgarName: "ABBOTT LABORATORIES", alsoKnownAs: [], cik: 1800 });
  const fund = await fdaClearancesFor(fakeDb("1980-03-17"), 1, { edgarName: "ABBOTT LABORATORIES", alsoKnownAs: [], cik: 1800, fundSeries: true });
  check("  …asked again while it has no prices, and none for a fund's series", none.outcome === "error" && /no prices/.test(none.detail ?? "") && fund.events.length === 0 && fund.outcome === "empty");

  console.log("\nRegistered, licensed, wired");
  const src = SOURCES.find((s) => s.key === "fda_clearances");
  check("the source is id 48, CC0 like openFDA's other files, cleared for commercial use, reviewed 2026-11-22, credited to the FDA (openFDA)",
    src?.id === 48 && src.license === "public domain (CC0 1.0)" && src.commercialOk && src.reviewedOn === "2026-11-22" && src.attribution === "U.S. Food and Drug Administration (openFDA)", src);
  check("  …a company source, quota and refresh noted, scored without the model, a source whose month rows join their numbers",
    (COMPANY_SOURCES as readonly string[]).includes("fda_clearances") && QUOTAS.fda_clearances.perDay === null && SOURCE_TTL_MINUTES.fda_clearances === 1440 &&
      deterministicScore({ eventId: 0, kind: "regulation", title: "FDA cleared", sourceKey: "fda_clearances" }, { kind: "company", displayName: "Abbott", ticker: "ABT" }, ["abbott"])?.score === 0.95 &&
      GROUPED_ROW_SOURCES.includes("fda_clearances"));
  check("  …the ingest asks it for every company", /await run\("fda_clearances", [^\n]+\n\s*fdaClearancesFor\(client, subjectId, \{[^}]*cik: company\.cik, fundSeries \}\),/.test(read("scripts/ingest.ts")));
  check("  …synced by `npm run sync:fda-clearances`, and credited",
    /"sync:fda-clearances": "tsx scripts\/sync-fda-clearances\.ts"/.test(read("package.json")) &&
      /device clearances, press releases and talk papers of 1962–2014, and warning letters from the U\.S\. Food and Drug Administration/.test(read("app/layout.tsx").replace(/\s+/g, " ")) &&
      /device clearances, press releases and talk papers of 1962–2014, and warning letters from the U\.S\. Food and Drug Administration/.test(read("app/legal/terms/page.tsx").replace(/\s+/g, " ")));

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
