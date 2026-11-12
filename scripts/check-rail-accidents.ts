import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { deterministicScore } from "../lib/enrich/relevance";
import { QUOTAS } from "../lib/ingest/quota";
import { SOURCE_TTL_MINUTES } from "../lib/ingest/refresh";
import { SOURCES } from "../lib/ingest/store";
import { DAMAGE_FLOOR, FIELDS, RAIL_OWNERS, accidentEvents, accidentQuery, clearsFloor, fetchRailAccidents, narrativeOf, railRoadsFor, roadsWhere, type AccidentRow } from "../lib/railAccidents";
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
/** A record's dead as the reader counts them (batch 130): the accident's Form 55a count, or its own Form 54 count where larger. */
const killedOf = (r: AccidentRow) => String(Math.max(Number(r.totalpersonskilled ?? 0), Number(r.totalkilledform54 ?? 0)));

async function main(): Promise<void> {
  console.log("\nThe dataset's answer");
  // batch 130 (the 2026-11-09 audit's finding 1): the answer again, with the accident's own counts and
  // the deaths only they give; batch 127's 1,909 records, every one of them in it unchanged, read neither
  // batch 136: read again on 2026-11-10 with the narrative and the dead by kind, every earlier field as it was
  check("2,957 records read on 2026-11-10 (1,909 before the per-accident counts), each with its railroad, report key, day and type, the first of 1975-01-12",
    FIXTURE.read === "2026-11-10" && rows.length === 2957 && rows.every((r) => r.reportingrailroadcode && r.reportkey && /^\d{4}-\d{2}-\d{2}T/.test(r.date ?? "") && r.accidenttype) &&
      [...rows].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))[0].date?.slice(0, 10) === "1975-01-12",
    `${rows.length}`);
  check("  …and every field the reader asks for, the accident's counts, the narrative and the dead by kind among them", FIELDS.split(",").length === 24 && /totalpersonskilled,totalpersonsinjured/.test(FIELDS) && /narrative,railroademployeeskilled,passengerskilled,otherskilled/.test(FIELDS) && FIELDS.split(",").every((f) => rows.some((r) => f in r)));

  console.log("\nThe floor, the owner's call of 2026-11-09");
  const graniteville = eventOf("NS", "019414");
  check("Graniteville (Norfolk Southern 019414, 2005-01-06) lands on NSC: 9 killed, 292 injured, 5,200 evacuated, FRA's readout linked",
    pagesOf("NS", "019414") === "NSC" && graniteville?.date === "2005-01-06" &&
      graniteville.title === "Norfolk Southern: train accident at Graniteville, South Carolina — 9 killed, 292 injured, 5,200 evacuated" &&
      /^https:\/\/safetydata\.fra\.dot\.gov\/.*NS01941420050106$/.test(graniteville.url ?? "") && graniteville.type === "regulation" && graniteville.source === "FRA",
    JSON.stringify(graniteville).slice(0, 300));
  check("  …its description names the railroad, the dead by kind, the hazardous car, the damage in whole dollars, its cause, the railroad's own account and that a report is no finding of fault (batch 136)",
    (graniteville?.description ?? "").startsWith(
      "Reported to the Federal Railroad Administration by Norfolk Southern Railway Company (accident 019414). Killed, by kind: 1 railroad employee and 8 others. 1 car released hazardous material. Damage to equipment and track: $2,333,400. Cause the railroad reported: Switch improperly lined. The railroad's account: \"TRAIN 192P005 MOVING NORTH ON MAIN TRACK ENTERED OPEN SWITCH INTO AVONDALE MILLS INDUSTRY",
    ) && /…" The report is the railroad's own filing to its regulator, not a finding of fault\.$/.test(graniteville?.description ?? ""),
    graniteville?.description);
  check("East Palestine (Norfolk Southern 152207, 2023-02-03) lands on NSC; CSX's Baltimore tunnel of 2001-07-18 (070122014) on CSX, 50,000 evacuated",
    pagesOf("NS", "152207") === "NSC" && eventOf("NS", "152207")?.date === "2023-02-03" && pagesOf("CSX", "070122014") === "CSX" && /— 50,000 evacuated$/.test(eventOf("CSX", "070122014")?.title ?? ""),
    `${eventOf("NS", "152207")?.title} | ${eventOf("CSX", "070122014")?.title}`);
  check("Minot (Soo Line 170488, 2002-01-18) lands on CPKC's page, 1 killed and 1,000 injured",
    pagesOf("SOO", "170488") === "CP" && /^Soo Line: derailment at Minot, North Dakota — 1 killed, 1,000 injured/.test(eventOf("SOO", "170488")?.title ?? ""), eventOf("SOO", "170488")?.title);
  const crossingDeaths = rows.filter((r) => r.accidenttype === "Hwy-rail crossing" && killedOf(r) !== "0" && r.personsevacuated === "0" && !clearsFloor({ type: r.accidenttype, killed: "1", evacuated: "0", damage: String(r.totaldamagecost) }));
  const onPage = crossingDeaths.filter((r) => [...pages.values()].some((ev) => ev.some((e) => e.externalId === r.reportkey)));
  check("a highway-rail crossing collision with a death and no evacuation, under $5,000,000 of damage, lands on no page: 1,601 crossing records read, 1,566 of them only a death (754 and 719 by Form 54's count alone)",
    rows.filter((r) => r.accidenttype === "Hwy-rail crossing").length === 1601 && crossingDeaths.length === 1566 && onPage.length === 0, `${crossingDeaths.length} / ${onPage.length}`);
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
      rows.filter((r) => r.reportingrailroadcode === "LN" && (r.date ?? "") >= "1980-11-03").every((r) => !clearsFloor({ type: r.accidenttype, killed: killedOf(r), evacuated: String(r.personsevacuated), damage: String(r.totaldamagecost) }) || pagesOf("LN", r.accidentnumber ?? "") === "CSX"));
  const pinned = [...pages].map(([t, ev]) => `${t} ${ev.length}`).join(", ");
  const all = [...pages.values()].flat();
  // batch 130: the accidents only the per-accident count gives a death, 14 of them, CSX's Lugoff derailment of 1991 (8 killed) the largest
  check("on the six pages from their first prices: 490 accidents, 404 before 2017, 135 before 1993; CNI 36, CP 24, UNP 158, CSX 166, NSC 69, BRK-B 37 (476, 395 and 131 before batch 130's per-accident counts)",
    pinned === "CNI 36, CP 24, UNP 158, CSX 166, NSC 69, BRK-B 37" && all.filter((e) => e.date < "2017").length === 404 && all.filter((e) => e.date < "1993").length === 135,
    `${pinned}; ${all.filter((e) => e.date < "2017").length} before 2017, ${all.filter((e) => e.date < "1993").length} before 1993`);
  check("  …every one on its railroad's own row, newest first, keyed by its report, linked over https",
    [...pages.values()].every((ev) => ev.every((e, i) => i === 0 || ev[i - 1].date >= e.date)) && all.every((e) => e.dedupBasis === `fra:${e.externalId}` && e.id === `fra-${e.externalId}` && /^https:\/\//.test(e.url ?? "")) &&
      new Set(all.map((e) => e.externalId)).size === all.length);

  console.log("\nOne report, one row");
  const goodwell = eventOf("UP", "0612KC011");
  const goodwellRecords = rows.filter((r) => r.reportkey === keyOf("UP", "0612KC011"));
  check("a report the dataset holds as two records (jointcd 1 and 3) is one row, with the accident's count: Union Pacific's of 2012-06-24, 3 killed and 1 injured, though its records' own Form 54 counts are 2 and 1",
    (pages.get("UNP") ?? []).filter((e) => e.externalId === keyOf("UP", "0612KC011")).length === 1 && /— 3 killed, 1 injured$/.test(goodwell?.title ?? "") && goodwellRecords.length === 2 &&
      goodwellRecords.map((r) => `${r.jointcd}:${r.totalkilledform54}/${r.totalpersonskilled}`).sort().join() === "1:2/3,3:1/3",
    goodwell?.title);

  console.log("\nThe accident's own count (batch 130, the 2026-11-09 audit's finding 1)");
  // FRA's dataset: Form 54's count "Do not use this field to sum fatalities"; Form 55a's totalpersonskilled
  // "the total fatalities for all reports filled for the single accident"
  const akka = eventOf("CSX", "099308020");
  const chatsworth = eventOf("UP", "0908LA014");
  check("the deadliest accidents give their dead: Big Bayou Canot of 1993 (CSX 099308020) 47 killed, which read \"$11,369,400 of damage\"; Chatsworth of 2008 (Union Pacific 0908LA014) 25 killed, Metrolink's passengers its Form 54 left out; Bourbonnais of 1999 on CN 11 killed",
    akka?.title === "CSX Transportation: derailment at Akka, Alabama — 47 killed, 103 injured" && chatsworth?.title === "Union Pacific: head-on collision at Chatsworth, California — 25 killed, 61 injured" &&
      /^Illinois Central: highway-rail crossing collision at Bourbonnais, Illinois — 11 killed, 50 injured$/.test((pages.get("CNI") ?? []).find((e) => e.date === "1999-03-15")?.title ?? ""),
    `${akka?.title} | ${chatsworth?.title}`);
  check("  …an accident only that count gives a death now clears the floor: CSX's Lugoff derailment of 1991-07-31 (079105051), 8 killed, every Form 54 record 0",
    pagesOf("CSX", "079105051") === "CSX" && eventOf("CSX", "079105051")?.title === "CSX Transportation: derailment at Lugoff, South Carolina — 8 killed, 32 injured" &&
      rows.filter((r) => r.reportkey === keyOf("CSX", "079105051")).every((r) => r.totalkilledform54 === "0"),
    eventOf("CSX", "079105051")?.title);
  const disagree = rows.filter((r) => r.totalkilledform54 !== "0" && r.totalpersonskilled === "0");
  check("  …and a death a railroad's own Form 54 reports is kept where Form 55a holds none (6 records): CSX's of 2016-09-06 (000162754), 1 killed",
    disagree.length === 6 && /— 1 killed$/.test(eventOf("CSX", "000162754")?.title ?? "") &&
      accidentEvents([{ reportingrailroadcode: "UP", reportkey: "UPZ1", accidentnumber: "Z1", date: "2020-01-02T00:00:00.000", accidenttype: "Derailment", totalkilledform54: "2", totalpersonskilled: "0", totalinjuredform54: "0", totalpersonsinjured: "5", personsevacuated: "0", totaldamagecost: "100" }], railRoadsFor(ciks.UNP) ?? [])[0]?.title === "Union Pacific: derailment — 2 killed, 5 injured",
    disagree.map((r) => r.reportkey).join(", "));
  // batch 146: the owner's open call, decided on the owner's instruction of 2026-11-12 (best judgment): keep the
  // larger count, as built, and say on the row whose count it is
  const laGrange = eventOf("CSX", "000162754"), yazoo = eventOf("IC", "1112131");
  check("such a row says whose count it is: CSX at La Grange (2016-09-06) and Illinois Central at Yazoo City (2022-08-25), \"The 1 killed is the railroad's own report's count; FRA's count for the accident gives none\"; a row FRA's count gives says nothing of it",
    [laGrange, yazoo].every((e) => /The 1 killed is the railroad's own report's count; FRA's count for the accident gives none\./.test(e?.description ?? "")) &&
      pagesOf("IC", "1112131") === "CNI" && !/railroad's own report's count/.test(eventOf("CSX", "079105051")?.description ?? "x") &&
      !/railroad's own report's count/.test(eventOf("NS", "019414")?.description ?? "x") && [laGrange, yazoo].every((e) => (e?.description ?? "").length <= 600),
    `${laGrange?.description?.slice(0, 220)} | ${yazoo?.date}`);
  const two = accidentEvents(
    [
      { reportingrailroadcode: "SOO", reportkey: "SOOA1", accidentnumber: "A1", incidentkey: "SOOA1201101", date: "2011-01-05T00:00:00.000", accidenttype: "Head on collision", totalkilledform54: "1", personsevacuated: "0", totaldamagecost: "100" },
      { reportingrailroadcode: "CP", reportkey: "CPB2", accidentnumber: "B2", incidentkey: "SOOA1201101", date: "2011-01-05T00:00:00.000", accidenttype: "Head on collision", totalkilledform54: "1", personsevacuated: "0", totaldamagecost: "100" },
    ],
    railRoadsFor(ciks.CP) ?? [],
  );
  check("  …and one accident two of the company's own railroads reported is one row on its page, the first report's by its key", two.length === 1 && two[0].externalId === "CPB2", JSON.stringify(two.map((e) => e.externalId)));

  // batch 136, the 2026-11-09b proposal 4 (b), approved by the owner on 2026-11-10
  console.log("\nThe railroad's own account, and the dead by kind (batch 136, the 2026-11-09b proposal 4, part b)");
  check("a narrative loses the dataset's filler for empty parts: one of empty parts is none, a short one keeps its text",
    narrativeOf("NoneNoneNoneNone") === "" && narrativeOf("TRAIN STRUCK A TRUCK.  NoneNoneNone") === "TRAIN STRUCK A TRUCK." && narrativeOf(undefined) === "" &&
      rows.filter((r) => /^(?:None)+$/.test(r.narrative ?? "")).length > 0);
  const bourbonnais = eventOf("IC", "MAR3699");
  check("Bourbonnais on CN (1999-03-15) carries the railroad's account: \"AMTRAK #59 COLLIDED WITH A TRACTOR TRAILER LOADED WITH STEEL REBAR…\"; its 11 dead are on Amtrak's report, so the count stands alone",
    /The railroad's account: "AMTRAK #59 COLLIDED WITH A TRACTOR TRAILER LOADED WITH STEEL REBAR AT MCKNIGHT ROAD CROSSING/.test(bourbonnais?.description ?? "") && !/Killed, by kind/.test(bourbonnais?.description ?? "") &&
      bourbonnais?.title === "Illinois Central: highway-rail crossing collision at Bourbonnais, Illinois — 11 killed, 50 injured",
    bourbonnais?.description?.slice(0, 300));
  check("  …Chatsworth's (Union Pacific 0908LA014), whose dead are on Metrolink's report, gives no split; Lonjct's of 1993, whose records give 2 of its 5, none either; Minot's 1 is \"1 other\"",
    /The railroad's account: "SCAX'S METROLINK TRAIN 111 RAN BY A RED SIGNAL/.test(eventOf("UP", "0908LA014")?.description ?? "") && !/Killed, by kind/.test(eventOf("UP", "0908LA014")?.description ?? "") &&
      !/Killed, by kind/.test(eventOf("UP", "1193CR009")?.description ?? "") && /Killed, by kind: 1 other\./.test(eventOf("SOO", "170488")?.description ?? ""));
  const rowsAll = [...pages.values()].flat();
  const accounts = rowsAll.filter((e) => (/The railroad's account: "([^"]*)"/.exec(e.description ?? "")?.[1] ?? "").length >= 20);
  const dead = rowsAll.filter((e) => / \d[\d,]* killed/.test(e.title));
  const split = dead.filter((e) => /Killed, by kind: /.test(e.description ?? ""));
  check("on the six pages: 476 of the 490 rows carry an account of 20 characters or more, 390 before 2017; 113 of the 136 rows with a death give the dead by kind; no description runs past 600 characters and no title changes",
    accounts.length === 476 && accounts.filter((e) => e.date < "2017").length === 390 && dead.length === 136 && split.length === 113 && rowsAll.every((e) => (e.description ?? "").length <= 600) &&
      rowsAll.every((e) => !/account|by kind/.test(e.title)),
    `${accounts.length}, ${accounts.filter((e) => e.date < "2017").length} before 2017; ${split.length} of ${dead.length}`);
  check("  …a split is shown only where it adds up to the row's count, the counts added as whole numbers",
    split.every((e) => {
      const n = (/ (\d[\d,]*) killed/.exec(e.title)?.[1] ?? "0").replace(/,/g, "");
      const parts = [...(/Killed, by kind: ([^.]*)\./.exec(e.description ?? "")?.[1] ?? "").matchAll(/(\d[\d,]*) /g)].map((m) => BigInt(m[1].replace(/,/g, "")));
      return parts.reduce((a, b) => a + b, BigInt(0)) === BigInt(n);
    }));

  console.log("\nThe request");
  const q = decodeURIComponent(accidentQuery(railRoadsFor(ciks.UNP) ?? [], "1980-01-02").replace(/\+/g, " "));
  check("one request a company: its undated codes by name, a dated one only between its days, the floor by either count of the dead (batch 130), and its first price",
    /\(totalkilledform54 > 0 OR totalpersonskilled > 0 OR personsevacuated > 0 OR totaldamagecost >= 5000000\)/.test(q) && /reportingrailroadcode IN \('UP'\)/.test(q) && /\(reportingrailroadcode = 'SP' AND date >= '1996-09-11T00:00:00'\)/.test(q) && /totaldamagecost >= 5000000/.test(q) &&
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
