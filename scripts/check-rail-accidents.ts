import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { deterministicScore } from "../lib/enrich/relevance";
import { QUOTAS } from "../lib/ingest/quota";
import { SOURCE_TTL_MINUTES } from "../lib/ingest/refresh";
import { SOURCES } from "../lib/ingest/store";
import { DAMAGE_FLOOR, FIELDS, RAIL_OWNERS, accidentEvents, accidentQuery, clearsFloor, fetchRailAccidents, railRoadsFor, roadsWhere, type AccidentRow } from "../lib/railAccidents";
import type { TimelineEvent } from "../lib/types";
import { COMPANY_SOURCES } from "./ingest";
import tickerIndex from "../data/edgar-tickers.json";

/**
 * The FRA's railroad accident reports on the pages of the companies whose railroads filed them
 * (batch 127, the 2026-11-09 proposal 2, approved by the owner that day).
 *
 *   npm run check:rail-accidents
 *
 * Replays the reports the dataset answered on 2026-11-09 for the six companies' railroads and their
 * predecessors (scripts/fixtures/fra-accidents.json.gz: 1,909 records of the 60 codes with a death,
 * an evacuation or $5,000,000 of damage). Offline: the dataset is stood in for. On main none of it
 * runs: lib/railAccidents.ts does not exist.
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
const FIXTURE: { read: string; rows: AccidentRow[] } = JSON.parse(gunzipSync(readFileSync(join(root, "scripts/fixtures/fra-accidents.json.gz"))).toString("utf8"));
const rows = FIXTURE.rows;
// each company's first trading day as Yahoo's chart gives it (read 2026-11-09)
const FIRST: Record<string, string> = { UNP: "1980-01-02", CSX: "1980-11-03", NSC: "1982-06-02", "BRK-B": "1996-05-09", CNI: "1996-11-26", CP: "1983-12-30" };
const ciks = Object.fromEntries(Object.entries(RAIL_OWNERS).map(([cik, o]) => [o.ticker, Number(cik)]));
const pages = new Map<string, TimelineEvent[]>(Object.values(RAIL_OWNERS).map((o) => [o.ticker, accidentEvents(rows, o.roads, { from: FIRST[o.ticker] })]));
const keyOf = (code: string, number: string) => rows.find((r) => r.reportingrailroadcode === code && r.accidentnumber === number)?.reportkey ?? `none:${code}:${number}`;
const pagesOf = (code: string, number: string) => [...pages].filter(([, ev]) => ev.some((e) => e.externalId === keyOf(code, number))).map(([t]) => t).join(" ") || "none";
const eventOf = (code: string, number: string) => [...pages.values()].flat().find((e) => e.externalId === keyOf(code, number));

async function main(): Promise<void> {
  console.log("\nThe dataset's answer");
  check("1,909 records read on 2026-11-09, each with its railroad, report key, day and type, the first of 1975-01-12",
    FIXTURE.read === "2026-11-09" && rows.length === 1909 && rows.every((r) => r.reportingrailroadcode && r.reportkey && /^\d{4}-\d{2}-\d{2}T/.test(r.date ?? "") && r.accidenttype) &&
      [...rows].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))[0].date?.slice(0, 10) === "1975-01-12",
    `${rows.length}`);
  check("  …and every field the reader asks for", FIELDS.split(",").length === 18 && FIELDS.split(",").every((f) => rows.some((r) => f in r)));

  console.log("\nThe floor, the owner's call of 2026-11-09");
  const graniteville = eventOf("NS", "019414");
  check("Graniteville (Norfolk Southern 019414, 2005-01-06) lands on NSC: 9 killed, 292 injured, 5,200 evacuated, FRA's readout linked",
    pagesOf("NS", "019414") === "NSC" && graniteville?.date === "2005-01-06" &&
      graniteville.title === "Norfolk Southern: train accident at Graniteville, South Carolina — 9 killed, 292 injured, 5,200 evacuated" &&
      /^https:\/\/safetydata\.fra\.dot\.gov\/.*NS01941420050106$/.test(graniteville.url ?? "") && graniteville.type === "regulation" && graniteville.source === "FRA",
    JSON.stringify(graniteville).slice(0, 300));
  check("  …its description names the railroad, the hazardous car, the damage in whole dollars, its cause, and that a report is no finding of fault",
    graniteville?.description ===
      "Reported to the Federal Railroad Administration by Norfolk Southern Railway Company (accident 019414). 1 car released hazardous material. Damage to equipment and track: $2,333,400. Cause the railroad reported: Switch improperly lined. The report is the railroad's own filing to its regulator, not a finding of fault.",
    graniteville?.description);
  check("East Palestine (Norfolk Southern 152207, 2023-02-03) lands on NSC; CSX's Baltimore tunnel of 2001-07-18 (070122014) on CSX, 50,000 evacuated",
    pagesOf("NS", "152207") === "NSC" && eventOf("NS", "152207")?.date === "2023-02-03" && pagesOf("CSX", "070122014") === "CSX" && /— 50,000 evacuated$/.test(eventOf("CSX", "070122014")?.title ?? ""),
    `${eventOf("NS", "152207")?.title} | ${eventOf("CSX", "070122014")?.title}`);
  check("Minot (Soo Line 170488, 2002-01-18) lands on CPKC's page, 1 killed and 1,000 injured",
    pagesOf("SOO", "170488") === "CP" && /^Soo Line: derailment at Minot, North Dakota — 1 killed, 1,000 injured/.test(eventOf("SOO", "170488")?.title ?? ""), eventOf("SOO", "170488")?.title);
  const crossingDeaths = rows.filter((r) => r.accidenttype === "Hwy-rail crossing" && r.totalkilledform54 !== "0" && r.personsevacuated === "0" && !clearsFloor({ type: r.accidenttype, killed: "1", evacuated: "0", damage: String(r.totaldamagecost) }));
  const onPage = crossingDeaths.filter((r) => [...pages.values()].some((ev) => ev.some((e) => e.externalId === r.reportkey)));
  check("a highway-rail crossing collision with a death and no evacuation, under $5,000,000 of damage, lands on no page: 754 crossing records read, 719 of them only a death",
    rows.filter((r) => r.accidenttype === "Hwy-rail crossing").length === 754 && crossingDeaths.length === 719 && onPage.length === 0, `${crossingDeaths.length} / ${onPage.length}`);
  check("  …but one with an evacuation counts: CSX's of 1988-06-20 (068801046), 100 evacuated, on CSX",
    pagesOf("CSX", "068801046") === "CSX" && /^CSX Transportation: highway-rail crossing collision at .* — 100 evacuated$/.test(eventOf("CSX", "068801046")?.title ?? ""), eventOf("CSX", "068801046")?.title);
  check("  …and a derailment with a death counts whatever its damage; the floor's damage is compared as whole numbers, never as a float",
    clearsFloor({ type: "Derailment", killed: "1", evacuated: "0", damage: "0" }) && !clearsFloor({ type: "Derailment", killed: "0", evacuated: "0", damage: "4999999" }) &&
      clearsFloor({ type: "Derailment", killed: "0", evacuated: "0", damage: DAMAGE_FLOOR }) && clearsFloor({ type: "Hwy-rail crossing", killed: "0", evacuated: "0", damage: "12345678901234567890" }) &&
      !clearsFloor({ type: "Hwy-rail crossing", killed: "3", evacuated: "0", damage: "999999" }));
  const huge = accidentEvents([{ reportingrailroadcode: "UP", reportkey: "UPX1", accidentnumber: "X1", date: "2020-01-02T00:00:00.000", accidenttype: "Derailment", totalkilledform54: "0", personsevacuated: "0", totaldamagecost: "12345678901234567890" }], railRoadsFor(ciks.UNP) ?? []);
  check("  …and shown digit for digit: $12,345,678,901,234,567,890 of damage", huge[0]?.title === "Union Pacific: derailment — $12,345,678,901,234,567,890 of damage", huge[0]?.title);

  console.log("\nEach railroad on its owner's page, between the owner's days");
  check("Weyauwega (Wisconsin Central G2895, 1996-03-04), before CN bought it, lands on no page; Wisconsin Central's of 2005-11-02 (395377), after, on CNI",
    pagesOf("WC", "G2895") === "none" && rows.some((r) => r.accidentnumber === "G2895") && pagesOf("WC", "395377") === "CNI");
  check("Southern Pacific's Macdona of 1985-09-14 (U5725) lands on no page; Union Pacific's Macdona of 2004-06-28 (0604SA011) on UNP, and BNSF's report of the same collision (GC0604127) on none, BNSF being no listed company's until 2010",
    pagesOf("SP", "U5725") === "none" && rows.some((r) => r.accidentnumber === "U5725") && pagesOf("UP", "0604SA011") === "UNP" && /3 killed/.test(eventOf("UP", "0604SA011")?.title ?? "") && pagesOf("BNSF", "GC0604127") === "none",
    eventOf("UP", "0604SA011")?.title);
  check("BNSF's of 1996-10-27 (NC1096105) lands on no page, its of 2010-02-18 (GC0210105) on Berkshire Hathaway, which bought it on 2010-02-12",
    pagesOf("BNSF", "NC1096105") === "none" && rows.some((r) => r.accidentnumber === "NC1096105") && pagesOf("BNSF", "GC0210105") === "BRK-B" && /^BNSF: /.test(eventOf("BNSF", "GC0210105")?.title ?? ""));
  const predecessors = ["BN", "ATSF", "CR", "CRSH", "ICG", "SLSF", "MILW", "MKT", "WP", "MP", "DH"];
  const theirs = rows.filter((r) => predecessors.includes(r.reportingrailroadcode ?? ""));
  check("Burlington Northern's, Santa Fe's, Conrail's (CSX's and Norfolk Southern's joint venture) and Illinois Central Gulf's reports are no page's; Missouri Pacific's and the Delaware & Hudson's wait for a filing's text",
    theirs.length > 400 && theirs.every((r) => ![...pages.values()].some((ev) => ev.some((e) => e.externalId === r.reportkey))) && /Missouri Pacific on Union Pacific/.test(read("lib/railAccidents.ts")),
    `${theirs.length}`);
  check("Illinois Central's of 1998-12-28 (TS120198) lands on CNI: CN owned it from 1998-06-05, in a voting trust until the merger's approval",
    pagesOf("IC", "TS120198") === "CNI" && railRoadsFor(ciks.CNI)?.find((r) => r.code === "IC")?.from === "1998-06-05");
  check("CSX's railroads count from CSX's first price, the day after its 1980 merger made it: Louisville & Nashville's of 1975–1980 are no page's, its of 1981 CSX's",
    rows.some((r) => r.reportingrailroadcode === "LN" && (r.date ?? "") < "1980-11-03" && pagesOf("LN", r.accidentnumber ?? "") === "none") &&
      rows.filter((r) => r.reportingrailroadcode === "LN" && (r.date ?? "") >= "1980-11-03").every((r) => !clearsFloor({ type: r.accidenttype, killed: String(r.totalkilledform54), evacuated: String(r.personsevacuated), damage: String(r.totaldamagecost) }) || pagesOf("LN", r.accidentnumber ?? "") === "CSX"));
  const pinned = [...pages].map(([t, ev]) => `${t} ${ev.length}`).join(", ");
  const all = [...pages.values()].flat();
  check("on the six pages from their first prices: 476 accidents, 395 before 2017, 131 before 1993; CNI 36, CP 24, UNP 155, CSX 161, NSC 65, BRK-B 35",
    pinned === "CNI 36, CP 24, UNP 155, CSX 161, NSC 65, BRK-B 35" && all.filter((e) => e.date < "2017").length === 395 && all.filter((e) => e.date < "1993").length === 131,
    `${pinned}; ${all.filter((e) => e.date < "2017").length} before 2017, ${all.filter((e) => e.date < "1993").length} before 1993`);
  check("  …every one on its railroad's own row, newest first, keyed by its report, linked over https",
    [...pages.values()].every((ev) => ev.every((e, i) => i === 0 || ev[i - 1].date >= e.date)) && all.every((e) => e.dedupBasis === `fra:${e.externalId}` && e.id === `fra-${e.externalId}` && /^https:\/\//.test(e.url ?? "")) &&
      new Set(all.map((e) => e.externalId)).size === all.length);

  console.log("\nOne report, one row");
  const goodwell = eventOf("UP", "0612KC011");
  check("a report the dataset holds as two records (jointcd 1 and 3) is one row, with the larger count each gives: Union Pacific's of 2012-06-24, 2 killed and 1 injured",
    (pages.get("UNP") ?? []).filter((e) => e.externalId === keyOf("UP", "0612KC011")).length === 1 && /— 2 killed, 1 injured$/.test(goodwell?.title ?? "") && rows.filter((r) => r.reportkey === keyOf("UP", "0612KC011")).length === 2,
    goodwell?.title);
  const two = accidentEvents(
    [
      { reportingrailroadcode: "SOO", reportkey: "SOOA1", accidentnumber: "A1", incidentkey: "SOOA1201101", date: "2011-01-05T00:00:00.000", accidenttype: "Head on collision", totalkilledform54: "1", personsevacuated: "0", totaldamagecost: "100" },
      { reportingrailroadcode: "CP", reportkey: "CPB2", accidentnumber: "B2", incidentkey: "SOOA1201101", date: "2011-01-05T00:00:00.000", accidenttype: "Head on collision", totalkilledform54: "1", personsevacuated: "0", totaldamagecost: "100" },
    ],
    railRoadsFor(ciks.CP) ?? [],
  );
  check("  …and one accident two of the company's own railroads reported is one row on its page, the first report's by its key", two.length === 1 && two[0].externalId === "CPB2", JSON.stringify(two.map((e) => e.externalId)));

  console.log("\nThe request");
  const q = decodeURIComponent(accidentQuery(railRoadsFor(ciks.UNP) ?? [], "1980-01-02").replace(/\+/g, " "));
  check("one request a company: its undated codes by name, a dated one only between its days, the floor, and its first price",
    /reportingrailroadcode IN \('UP'\)/.test(q) && /\(reportingrailroadcode = 'SP' AND date >= '1996-09-11T00:00:00'\)/.test(q) && /totaldamagecost >= 5000000/.test(q) &&
      /date >= '1980-01-02T00:00:00'/.test(q) && /^https:\/\/data\.transportation\.gov\/resource\/85tf-25kj\.json\?/.test(q) && /\$limit=5000/.test(q), q.slice(0, 400));
  check("  …a code is quoted, never spliced", roadsWhere([{ code: "O'X", railroad: "x", why: "x" }]) === "reportingrailroadcode IN ('O''X')");
  const real = globalThis.fetch;
  const answer = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  try {
    globalThis.fetch = answer(200, rows.filter((r) => r.reportingrailroadcode === "NS"));
    const ns = await fetchRailAccidents(ciks.NSC, { from: FIRST.NSC });
    globalThis.fetch = answer(429, []);
    const throttled = await fetchRailAccidents(ciks.NSC);
    globalThis.fetch = answer(200, { error: true });
    const odd = await fetchRailAccidents(ciks.NSC);
    const none = await fetchRailAccidents(320193);
    check("a company's answer becomes its rows; a 429 is throttled, a non-list an error, and a company with no railroad asks nothing",
      ns.outcome === "ok" && ns.events.some((e) => e.externalId === keyOf("NS", "019414")) && throttled.outcome === "throttled" && odd.outcome === "error" && none.outcome === "empty" && /no railroad mapped/.test(none.detail ?? ""),
      JSON.stringify({ ns: ns.events.length, throttled: throttled.outcome, odd: odd.outcome, none: none.detail }));
  } finally {
    globalThis.fetch = real;
  }

  console.log("\nThe map");
  const companies = tickerIndex.companies as [number, string, string][];
  check("each company is its ticker's record: Union Pacific, CSX, Norfolk Southern, Berkshire Hathaway, CN and CPKC",
    Object.entries(RAIL_OWNERS).every(([cik, o]) => companies.some(([c, t]) => c === Number(cik) && t === o.ticker)) && Object.keys(RAIL_OWNERS).length === 6);
  const header = read("lib/railAccidents.ts").split("export const RAIL_OWNERS")[1] ?? "";
  const roads = Object.values(RAIL_OWNERS).flatMap((o) => o.roads);
  check("every railroad says why it is its owner's, and every day it carries is in its reason or the list",
    roads.every((r) => r.why.length > 20 && [r.from, r.to].every((d) => !d || header.includes(d))) && new Set(roads.map((r) => r.code)).size === roads.length, `${roads.length} codes`);

  console.log("\nRegistered, licensed, wired");
  const src = SOURCES.find((s) => s.key === "fra_accidents");
  check("the source is registered as public domain, cleared for commercial use, with the day its licence was read",
    src?.id === 37 && src.license === "public domain" && src.commercialOk && src.reviewedOn === "2026-11-09" && src.attribution === "Federal Railroad Administration, U.S. Department of Transportation" &&
      /Public Domain U\.S\. Government/.test(read("lib/ingest/store.ts")), JSON.stringify(src));
  check("  …asked once a day per company, quota noted, a company source, scored without the model",
    SOURCE_TTL_MINUTES.fra_accidents === 1440 && QUOTAS.fra_accidents?.perDay === null && (COMPANY_SOURCES as readonly string[]).includes("fra_accidents") &&
      deterministicScore({ eventId: 0, kind: "regulation", title: "Accident", sourceKey: "fra_accidents" }, { kind: "company", displayName: "Union Pacific", ticker: "UNP" }, ["union pacific"])?.score === 1);
  const ingest = read("scripts/ingest.ts");
  check("  …company ingest asks only for a mapped company, from its first price, and waits for prices",
    /const roads = railRoadsFor\(company\.cik\);\s*if \(roads\) \{[\s\S]{0,400}await run\("fra_accidents", [\s\S]{0,300}const listed = await firstPriceDay\(client, subjectId\);\s*if \(listed === null\) return NO_PRICES\(\);\s*return fetchRailAccidents\(company\.cik, \{ from: listed \}\);/.test(ingest));
  check("  …and credited on every page, in the terms and in the README",
    /railroad accident reports from the Federal Railroad Administration/.test(read("app/layout.tsx").replace(/\s+/g, " ")) &&
      /railroad accident reports from the Federal Railroad Administration/.test(read("app/legal/terms/page.tsx").replace(/\s+/g, " ")) &&
      /\| Federal Railroad Administration \|/.test(read("README.md")));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  process.exit(fail ? 1 : 0);
}

main();
