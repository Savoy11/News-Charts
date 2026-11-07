import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { PoolClient } from "pg";
import tickerIndex from "../data/edgar-tickers.json";
import { NOT_THE_COMPANY, RECALLS_URL, UNITS, cpscEvents, fetchRecalls, firmIsCompany, firmName, parseRecalls, roleIn, soldAtCompany, unitsOf, type CpscRecall } from "../lib/cpscRecalls";
import { dojPossessive } from "../lib/doj";
import { withoutTag } from "../lib/edgarName";
import { deterministicScore } from "../lib/enrich/relevance";
import { companyNames } from "../lib/frCompany";
import { cpscFor, walkCpsc, type CpscWalk } from "../lib/ingest/cpscWalk";
import { namesForYear } from "../lib/ingest/frBackfill";
import { QUOTAS } from "../lib/ingest/quota";
import { SOURCE_TTL_MINUTES } from "../lib/ingest/refresh";
import { SOURCES } from "../lib/ingest/store";
import { isNotesRecord } from "../lib/releaseNames";
import { newsNamesFor, possessiveNameFor } from "../lib/sec";
import type { TimelineEvent } from "../lib/types";
import { COMPANY_SOURCES } from "./ingest";

/**
 * The CPSC's product recalls on the pages of the companies behind the product (batch 96).
 *
 *   npm run check:cpsc
 *
 * Replays every recall the Commission's service answered on 2026-11-05
 * (scripts/fixtures/cpsc-recalls.json.gz, 10,070 recalls, the fields the adapter reads). Offline:
 * the service and the database are stood in for. On main none of it runs: lib/cpscRecalls.ts does
 * not exist.
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
const FIXTURE: { recalls: unknown[] } = JSON.parse(gunzipSync(readFileSync(join(root, "scripts/fixtures/cpsc-recalls.json.gz"))).toString("utf8"));
const recalls = parseRecalls(FIXTURE.recalls);
const rowOf = (ticker: string) => {
  const r = companies.find(([, t]) => t === ticker);
  if (!r) throw new Error(`no ${ticker} in the ticker index`);
  return r;
};
function namesOf(ticker: string): (year: number) => string[] {
  const [cik, , title] = rowOf(ticker);
  const own = dojPossessive(title, possessiveNameFor(cik));
  return (year) => [...companyNames(title, namesForYear(year, newsNamesFor(cik), [])), ...(own ? [own] : []), withoutTag(title)];
}
const on = (ticker: string, from = "") => cpscEvents(recalls, namesOf(ticker), { cik: rowOf(ticker)[0], from });
const recall = (number: string) => recalls.find((r) => r.number === number) as CpscRecall;
const has = (events: TimelineEvent[], number: string) => events.some((e) => (e.externalId ?? "").split(",").includes(number));

async function main(): Promise<void> {
  console.log("\nThe service's answer");
  check("10,070 recalls, each with its number, day and title, the first of 1973-06-08",
    recalls.length === 10070 && recalls.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.day) && r.title) && [...recalls].sort((a, b) => a.day.localeCompare(b.day))[0].day === "1973-06-08",
    `${recalls.length}`);
  const bodum = recall("27055");
  check("Bodum's of 2026-10-29: its importer by name, the stores in one line, its units and hazard, its notice on cpsc.gov",
    bodum?.day === "2026-10-29" && bodum.importers[0] === "Bodum USA, Inc., of New York, New York" && /^Sold At: Target, Walmart, and coffee and home goods stores/.test(bodum.soldAt) &&
      bodum.units === "5.9 million" && /^The carafe can unexpectedly break/.test(bodum.hazard ?? "") && /^https:\/\/cpsc\.gov\/Recalls\/2027\//.test(bodum.url ?? ""), JSON.stringify(bodum).slice(0, 300));
  check("a firm without its place: \"Office Depot, Inc., of Boca Raton, Fla.\", \"The Wick & Petal Co. of Indianapolis, Ind.\"",
    firmName("Office Depot, Inc., of Boca Raton, Fla.") === "Office Depot, Inc." && firmName("The Wick & Petal Co. of Indianapolis, Ind.") === "The Wick & Petal Co." && firmName("Titan") === "Titan");
  check("units read as the Commission wrote them", unitsOf("5.9 million") === "about 5.9 million units" && unitsOf("About 1.7 million") === "about 1.7 million" && unitsOf("14,000 units") === "about 14,000 units");
  const qualified = recalls.map((r) => r.units ?? "").filter((u) => /^(?:approximately|more than|up to)\b/i.test(u));
  check("  …a count it qualified otherwise keeps its own word: \"approximately 39,000\", \"more than 3.2 Million\", never \"about Approximately\" (74 recalls, batch 111)",
    unitsOf("Approximately 39,000") === "approximately 39,000" && unitsOf("More than 3.2 Million") === "more than 3.2 Million" && unitsOf("Up to 500") === "up to 500" &&
      qualified.length === 74 && qualified.every((u) => !/^about /.test(unitsOf(u))),
    `${qualified.length}: ${qualified.filter((u) => /^about /.test(unitsOf(u))).slice(0, 3).join(" | ")}`);

  console.log("\nThe company is the maker, importer or distributor");
  check("Mattel's first of 1978-12-08, GE's of 1979-05-21 and Dollar Tree's of 1996-03-25 as their makers",
    roleIn(recalls.find((r) => r.day === "1978-12-08" && /Mattel/.test(r.title)) as CpscRecall, namesOf("MAT")(1978)) === "maker" &&
      has(on("GE"), recalls.find((r) => r.day === "1979-05-21" && /Hair Dryers/.test(r.title))?.number ?? "-") &&
      on("DLTR").some((e) => e.date === "1996-03-25" && /the company made it/.test(e.description ?? "")));
  check("Mohawk's rugs of 2014-11-19 on MHK as their importer, and on Home Depot as the store, \"Sold Exclusively at The Home Depot\"",
    on("MHK").some((e) => e.date === "2014-11-19" && /imported it/.test(e.description ?? "")) && on("HD").some((e) => e.date === "2014-11-19" && /^Sold in its stores: Mohawk/.test(e.title)));
  check("Lenovo's and IBM's ThinkPad batteries of 2006-09-28 on IBM, their distributor", on("IBM").some((e) => e.date === "2006-09-28" && /distributed it/.test(e.description ?? "")));
  check("a firm's owner named after it is the company: \"Swinton Avenue Trading, a division of Office Depot\"",
    firmIsCompany("Swinton Avenue Trading, a division of Office Depot, Inc.", ["Office Depot"]) && !firmIsCompany("Swinton Avenue Trading", ["Office Depot"]));

  console.log("\nThe company is a store that sold it");
  check("Bodum's French presses sold at Target, Walmart and Amazon.com go on each of the three, not on Home Depot for \"home goods stores\"",
    soldAtCompany(bodum.soldAt, namesOf("TGT")(2026)) && soldAtCompany(bodum.soldAt, namesOf("WMT")(2026)) && soldAtCompany(bodum.soldAt, namesOf("AMZN")(2026)) && !soldAtCompany(bodum.soldAt, namesOf("HD")(2026)));
  check("  …a store counts only as a whole item of the list: \"Target Marketplace\" and \"Target Plus\" are not \"Target\"",
    !soldAtCompany("Walmart Marketplace, Target Marketplace, and Amazon from March 2024", ["Target"]) && soldAtCompany("Walmart Marketplace, Target Marketplace, and Amazon from March 2024", ["Amazon"]));
  const wmt = on("WMT");
  const grouped = wmt.filter((e) => e.precision === "month");
  check("a store's recalls of other makers' products are grouped a row a month, a lone one keeps its day",
    grouped.length > 20 && grouped.every((e) => /^CPSC: \d+ recalls of products sold in its stores, [A-Z][a-z]+ \d{4}$/.test(e.title) && e.date.endsWith("-01")) &&
      wmt.some((e) => e.precision !== "month" && /^Sold in its stores: /.test(e.title)), `${grouped.length} month rows of ${wmt.length}`);
  check("  …while Walmart's own imports keep their own rows", wmt.some((e) => e.precision !== "month" && /imported it|made it/.test(e.description ?? "")));
  const days = new Map<string, number>();
  for (const e of on("TGT")) days.set(e.dedupBasis ?? "", (days.get(e.dedupBasis ?? "") ?? 0) + 1);
  check("one event per company and day, or month", [...days.values()].every((n) => n === 1) && on("TGT").every((e) => /^cpsc:27419@\d{4}-\d{2}(?:-\d{2}|:sold)$/.test(e.dedupBasis ?? "")));
  // batch 100, the audit of batches 94–99, finding 2: the service read once a week, as the walk
  // reads it (READ_EVERY_DAYS), leaves no stored row that the latest read does not update
  const orphans = (ticker: string) => {
    const stored = new Set<string>();
    let latest = new Set<string>();
    for (let d = new Date("2025-01-01T00:00:00Z"); d <= new Date("2026-11-05T00:00:00Z"); d = new Date(d.getTime() + 7 * 86_400_000)) {
      const day = d.toISOString().slice(0, 10);
      latest = new Set(cpscEvents(recalls.filter((r) => r.day <= day), namesOf(ticker), { cik: rowOf(ticker)[0] }).map((e) => e.dedupBasis ?? ""));
      for (const k of latest) stored.add(k);
    }
    return [...stored].filter((k) => !latest.has(k)).length;
  };
  const left = ["TGT", "WMT", "HD", "AMZN"].map((t) => `${t} ${orphans(t)}`).join(", ");
  check("a month's sold recalls keep the month's key from the first: read weekly through 2025–2026, no row is left beside its month's (11, 10, 6 and 3 were)",
    left === "TGT 0, WMT 0, HD 0, AMZN 0", left);
  const lone = on("TGT").find((e) => /:sold$/.test(e.dedupBasis ?? "") && e.precision !== "month");
  check("  …a lone one keeps its day and title, and a row stored under the old day key moves onto the month's",
    !!lone && /^Sold in its stores: /.test(lone.title) && lone.legacyDedupBasis === `cpsc:27419@${lone.date}` && lone.dedupBasis === `cpsc:27419@${lone.date.slice(0, 7)}:sold`, JSON.stringify(lone).slice(0, 200));

  console.log("\nOther firms and stores of a listed company's name (batch 100, the audit's finding 1)");
  check("a place whose name holds \"of\" is a place: \"Asweets Global Inc., City of Industry, California\" is not City Holding's",
    firmName("Asweets Global Inc., City of Industry, California") === "Asweets Global Inc." && firmName("CBB Group Inc., City of Commerce, Calif.") === "CBB Group Inc." &&
      firmName("Office Depot, Inc., of Boca Raton, Fla.") === "Office Depot, Inc." && !on("CHCO").some((e) => /the company (?:made|imported|distributed) it/.test(e.description ?? "")),
    on("CHCO").map((e) => e.title).join(" | ").slice(0, 200));
  check("  …one name joined by \"and\" is one name: \"Allied Tube and Conduit Corporation\" is not Conduit's, \"Adam and Eve\" not Eve's; two firms each with its legal word are two",
    !firmIsCompany("Allied Tube and Conduit Corporation", ["Conduit"]) && !firmIsCompany("Adam and Eve, of Hillsborough, N.C.", ["Eve"]) && firmIsCompany("Kohl's, Inc. and Target Corp.", ["Target"]));
  const refusedFirms = [["GGG", /^Graco$/i], ["SLM", /^SLM\b/], ["SR", /^Spire LLC\b/], ["WWD", /^Woodward$/], ["ETN", /^Eaton$/], ["IVDN", /^Innovative Designs LLC\b/]] as const;
  const firmsOf = (r: CpscRecall) => [...r.makers, ...r.importers, ...r.distributors].map(firmName);
  const firmCase = refusedFirms.map(([t, re]) => {
    const theirs = recalls.filter((r) => firmsOf(r).some((f) => re.test(f)));
    const unguarded = cpscEvents(recalls, namesOf(t), {});
    return { t, n: theirs.length, kept: theirs.filter((r) => has(on(t), r.number)).length, before: theirs.filter((r) => has(unguarded, r.number)).length };
  });
  check("namesakes read by hand are kept off by CIK: Graco Children's Products (10), SLM International's toys (2), Spire LLC, Woodward & Lothrop, a 1970s \"Eaton\" bat maker, Innovative Designs LLC",
    firmCase.every((c) => c.n > 0 && c.kept === 0 && c.before > 0) && firmCase.find((c) => c.t === "GGG")?.before === 10 && refusedFirms.every(([t]) => NOT_THE_COMPANY[rowOf(t)[0]]?.some((n) => n.firm)),
    firmCase.map((c) => `${c.t} ${c.before}→${c.kept}`).join(", "));
  const hsn = recalls.find((r) => r.day === "2026-06-11" && firmsOf(r).some((f) => /^HSN\b/.test(f)));
  check("  …HSN, Inc. is People Inc.'s only until IAC spun it off on 2008-08-20", !!hsn && !has(on("PPLI"), hsn.number) && has(cpscEvents([hsn], namesOf("PPLI"), {}), hsn.number) && NOT_THE_COMPANY[rowOf("PPLI")[0]]?.[0].from === "2008-08-20");
  const never = ["NE", "WNRS", "POWW", "BJRI", "OSK", "QMCO", "OVTZ", "BPOP"];
  check("a company that is no retailer takes no store line: Noble (\"Barnes and Noble\"), Winners, Outdoor Holding, BJ's Restaurants (\"BJ's\"), Oshkosh, Quantum, Oculus, Popular",
    never.every((t) => !on(t).some((e) => /:sold$/.test(e.dedupBasis ?? "") || /sold it/.test(e.description ?? ""))) && never.every((t) => NOT_THE_COMPANY[rowOf(t)[0]]?.some((n) => n.store === "never")) &&
      on("BJ").some((e) => /sold it|stores/.test(`${e.title} ${e.description}`)),
    never.filter((t) => on(t).some((e) => /:sold$/.test(e.dedupBasis ?? ""))).join(" "));
  const poolCorp = recalls.find((r) => r.day === "2017-06-07" && /Pool Corp\./.test(r.soldAt));
  check("  …\"Pool and Spa dealers\" are not Pool Corporation, which keeps the line that names it (2017-06-07); Shop LC's channel on Comcast and Roku is no store of theirs",
    !on("POOL").some((e) => recalls.some((r) => /\bPool and Spa\b/i.test(r.soldAt) && has([e], r.number))) && !!poolCorp && has(on("POOL"), poolCorp.number) &&
      !on("CMCSA").some((e) => recalls.some((r) => /television networks? airing on/i.test(r.soldAt) && has([e], r.number))) && !on("ROKU").some((e) => /:sold$/.test(e.dedupBasis ?? "") && /Shop LC/.test(e.description ?? "")));
  check("a store is a proper name: \"coffee and home goods stores\" is no Coffee Holding's, \"A&E stores\" no AES's, while \"Lowe's\" is Lowe's and \"amazon.com\" Amazon's",
    !soldAtCompany(bodum.soldAt, namesOf("JVA")(2026)) && !soldAtCompany("A&E stores, Concord Stores", ["AES"]) && soldAtCompany("Lowe's stores nationwide", ["Lowes"]) &&
      soldAtCompany("online at amazon.com", ["Amazon"]) && !has(on("JVA"), "27055") && !on("AES").length);

  console.log("\nEvery listed company against every recall");
  const letters = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const all = letters(recalls.map((r) => [...r.makers, ...r.importers, ...r.distributors, r.soldAt].join(" ")).join("#"));
  // batch 109, the 2026-11-07 audit's question 2: "Toro" is the mower maker's (TTC) and a shipping
  // company's (TORO), so "Toro and Exmark commercial dealers" is neither's store line
  const toroDealers = recall("01526");
  const ttcDealers = on("TTC").find((e) => has([e], "01526"));
  check("a store line naming a name two listed companies hold is neither's: Toro's riding-mower recall of 2001-07-20 is no store's of TTC's or of Toro Corp.'s",
    !!toroDealers && /Toro and Exmark commercial dealers/.test(JSON.stringify(toroDealers)) && !/sold it|Sold in its stores/.test(`${ttcDealers?.title} ${ttcDealers?.description}`) && !has(on("TORO"), "01526"));
  // batch 111: EDGAR's "TORO CO" is the recalls' "The Toro Company", so the mower maker's own recalls are its page's
  const ttcMade = on("TTC").filter((e) => /the company made it/.test(e.description ?? ""));
  check("  …but the firm the recall names by its legal name, \"The Toro Company\" for EDGAR's \"TORO CO\", is TTC: 19 of its recalls, 16 as maker, 14 more than the record's spelling found, and none Toro Corp.'s",
    on("TTC").length === 19 && ttcMade.length === 16 && /the company made it/.test(ttcDealers?.description ?? "") && ttcMade.some((e) => e.date === "2021-02-17") && !on("TORO").length,
    `${ttcMade.length}: ${ttcMade.map((e) => e.date).join(" ")}`);
  const out = new Map<string, TimelineEvent[]>();
  const seen = new Set<number>();
  for (const [cik, ticker, title] of companies) {
    if (seen.has(cik) || isNotesRecord(cik)) continue;
    seen.add(cik);
    const own = dojPossessive(title, possessiveNameFor(cik));
    const namesIn = (year: number) => [...companyNames(title, namesForYear(year, newsNamesFor(cik), [])), ...(own ? [own] : []), withoutTag(title)];
    if (!namesIn(2020).map(letters).some((k) => k.length >= 2 && all.includes(k))) continue;
    const ev = cpscEvents(recalls, namesIn, { cik });
    if (ev.length) out.set(ticker, ev);
  }
  const flat = [...out.values()].flat();
  const ownRows = flat.filter((e) => e.precision !== "month" && !/^Sold in its stores: /.test(e.title)).length;
  check("before any first price: 2,302 rows on 196 companies, 1,660 a recall's own day, 723 as maker, importer or distributor; Target 296, Walmart 236, Amazon 206, Home Depot 196 (2,288 before batch 111's legal-form spellings; 2,290 on 197 before batch 109's shared names; 2,268 before batch 101's Graco on Newell; 2,331 on 218 before batch 100)",
    flat.length === 2302 && out.size === 196 && flat.filter((e) => e.precision !== "month").length === 1660 && ownRows === 723 &&
      [...out].sort((a, b) => b[1].length - a[1].length).slice(0, 4).map(([t, v]) => `${t} ${v.length}`).join(", ") === "TGT 296, WMT 236, AMZN 206, HD 196",
    `${flat.length} on ${out.size}; ${flat.filter((e) => e.precision !== "month").length} own; ${ownRows} as maker, importer or distributor; ${[...out].sort((a, b) => b[1].length - a[1].length).slice(0, 4).map(([t, v]) => `${t} ${v.length}`).join(", ")}`);

  console.log("\nRead once a week, and kept");
  const db: FakeDb = { recalls: new Map(), read: null, listed: "1972-08-25" };
  let asked = 0;
  const serve = async () => {
    asked++;
    return { recalls, outcome: "ok" as const, httpStatus: 200 };
  };
  const first = await walkCpsc(fakeDb(db), { budget: { left: 1 }, fetchAll: serve });
  const again = await walkCpsc(fakeDb(db), { budget: { left: 1 }, fetchAll: serve });
  check("the first run reads every recall and keeps it; a run within the week asks nothing", first.recalls === 10070 && db.recalls.size === 10070 && !again.due && asked === 1);
  db.read = { ageDays: 8 };
  const spent = await walkCpsc(fakeDb(db), { budget: { left: 0 }, fetchAll: serve });
  const refused = await walkCpsc(fakeDb(db), { budget: { left: 1 }, fetchAll: async () => ({ recalls: [], outcome: "throttled", httpStatus: 403 }) });
  check("  …one read a process, and a refusal keeps what is kept and is asked again", spent.stopped === "this run's read is spent" && refused.failure?.httpStatus === 403 && db.recalls.size === 10070 && db.read?.ageDays === 8);
  const real = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify(FIXTURE.recalls.slice(0, 50)), { status: 200 })) as typeof fetch;
  let short;
  try {
    short = await fetchRecalls();
  } finally {
    globalThis.fetch = real;
  }
  check("  …and an answer of a few recalls is refused as broken, not stored: the service holds 10,070", short.outcome === "error" && /only 50 recalls read/.test(short.detail ?? ""), JSON.stringify({ ...short, recalls: short.recalls.length }));
  const plan = (t: string) => {
    const [cik, , name] = rowOf(t);
    return { edgarName: name, alsoKnownAs: newsNamesFor(cik), possessive: dojPossessive(name, possessiveNameFor(cik)), cik };
  };
  const noWalk: CpscWalk = { due: false, recalls: 0 };
  const page = await cpscFor(fakeDb(db), 1, plan("WMT"), noWalk);
  const later = await cpscFor(fakeDb({ ...db, listed: "2020-01-02" }), 1, plan("WMT"), noWalk);
  const none = await cpscFor(fakeDb({ ...db, listed: null }), 1, plan("WMT"), noWalk);
  check("a company's ingest finds its kept recalls by its names, from its first price; with no prices it asks again",
    page.events.length === wmt.length && later.events.every((e) => e.date >= "2020-01") && later.events.length < page.events.length && none.outcome === "error",
    `${page.events.length} / ${wmt.length}; ${later.events.length} from 2020`);
  // the owner's call of 2026-11-06 (batch 101): Graco Children's Products is Newell's from 1999-03-24
  const gracos = recalls.filter((r) => [...r.makers, ...r.importers, ...r.distributors].some((f) => /^Graco(?:\s+Children['’]s\s+Products\b.*)?$/i.test(firmName(f))));
  const nwlPage = await cpscFor(fakeDb({ ...db, listed: "1990-01-02" }), 1, plan("NWL"), noWalk); // a stand-in first price before the merger
  const onNwl = gracos.filter((r) => has(nwlPage.events, r.number));
  check("Graco Children's Products' recalls are Newell's from its merger with Rubbermaid, Graco's owner, on 1999-03-24: 22, from 1999-08-27 to 2020-12-16, asked under Graco's name; none before, none on Graco Inc.",
    onNwl.length === 22 && onNwl.every((r) => r.day >= "1999-03-24") && gracos.some((r) => r.day === "1998-11-24" && !has(nwlPage.events, r.number)) &&
      UNITS[rowOf("NWL")[0]]?.[0].from === "1999-03-24" && on("GGG").length === 0 && on("NWL").some((e) => e.date === "2020-12-16" && /the company imported it/.test(e.description ?? "")),
    `${onNwl.length} on NWL: ${onNwl.map((r) => r.day).slice(0, 4).join(",")}…`);

  console.log("\nRegistered, licensed, wired");
  const src = SOURCES.find((s) => s.key === "cpsc_recalls");
  check("the source is registered as public domain, cleared for commercial use, with the day it was read",
    src?.id === 32 && src.license === "public domain" && src.commercialOk && src.reviewedOn === "2026-11-05" && src.attribution === "U.S. Consumer Product Safety Commission", JSON.stringify(src));
  check("  …its basis written where it is used: a work of the U.S. Government, and what was not re-read",
    /17\s+\*?\s*U\.S\.C\. § 105/.test(read("lib/cpscRecalls.ts")) && /answered 403/.test(read("lib/cpscRecalls.ts")) && RECALLS_URL === "https://www.saferproducts.gov/RestWebServices/Recall?format=json");
  check("  …asked once a day per company, quota noted, a company source, scored without the model",
    SOURCE_TTL_MINUTES.cpsc_recalls === 1440 && QUOTAS.cpsc_recalls.perDay === null && (COMPANY_SOURCES as readonly string[]).includes("cpsc_recalls") &&
      deterministicScore({ eventId: 0, kind: "regulation", title: "Recall", sourceKey: "cpsc_recalls" }, { kind: "company", displayName: "Mattel, Inc.", ticker: "MAT" }, ["mattel"])?.score === 0.95);
  const ingest = read("scripts/ingest.ts");
  check("  …company ingest reads the service, then keeps the company's recalls", /await run\("cpsc_recalls", [^\n]+\n\s*const walked = await walkCpsc\(client\);[\s\S]{0,300}return cpscFor\(client, subjectId, \{[^}]*cik: company\.cik, fundSeries \}, walked\);/.test(ingest));
  check("  …into tables of its own (db/038), and credited",
    /CREATE TABLE IF NOT EXISTS cpsc_recalls \(\s*recall_number\s+text PRIMARY KEY/.test(read("db/038_cpsc_recalls.sql")) &&
      /product recalls from the U\.S\. Consumer Product Safety Commission/.test(read("app/layout.tsx").replace(/\s+/g, " ")) &&
      /product recalls from the U\.S\. Consumer Product Safety Commission/.test(read("app/legal/terms/page.tsx").replace(/\s+/g, " ")) &&
      /\| U\.S\. Consumer Product Safety Commission \|/.test(read("README.md")));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  process.exit(fail ? 1 : 0);
}

interface FakeDb {
  recalls: Map<string, CpscRecall & { keys: string }>;
  read: { ageDays: number } | null;
  listed: string | null;
}
function fakeDb(db: FakeDb): PoolClient {
  return {
    query: async (sql: string, params: unknown[] = []) => {
      const s = sql.trim();
      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(s)) return { rows: [] };
      if (/^SELECT read_at < now\(\) - make_interval\(days => 7\) AS stale FROM cpsc_reads WHERE id = 1$/.test(s)) return { rows: db.read ? [{ stale: db.read.ageDays > 7 }] : [] };
      if (/^DELETE FROM cpsc_recalls$/.test(s)) {
        db.recalls.clear();
        return { rows: [] };
      }
      if (/^INSERT INTO cpsc_recalls \(recall_number, recalled_on, title, url, hazard, units, makers, importers, distributors, sold_at, name_keys\)/.test(s)) {
        const [n, d, t, u, h, un, m, im, di, so, k] = params as string[][];
        const list = (x: string) => (x ? x.split("|") : []);
        n.forEach((number, i) =>
          db.recalls.set(number, { number, day: d[i], title: t[i], url: u[i], hazard: h[i], units: un[i], makers: list(m[i]), importers: list(im[i]), distributors: list(di[i]), soldAt: so[i], keys: k[i] }),
        );
        return { rows: [] };
      }
      if (/^INSERT INTO cpsc_reads/.test(s)) {
        db.read = { ageDays: 0 };
        return { rows: [] };
      }
      if (/^SELECT recall_number, recalled_on::text AS day, title, url, hazard, units, makers, importers, distributors, sold_at\s+FROM cpsc_recalls WHERE recalled_on >= \$1::date AND name_keys LIKE ANY \(\$2::text\[\]\) ORDER BY recalled_on, recall_number$/.test(s)) {
        const [from, patterns] = params as [string, string[]];
        const keys = patterns.map((p) => p.replace(/^%|%$/g, ""));
        const rows = [...db.recalls.values()]
          .filter((r) => r.day >= from && keys.some((k) => r.keys.includes(k)))
          .sort((a, b) => a.day.localeCompare(b.day) || a.number.localeCompare(b.number))
          .map((r) => ({ recall_number: r.number, day: r.day, title: r.title, url: r.url, hazard: r.hazard, units: r.units, makers: r.makers, importers: r.importers, distributors: r.distributors, sold_at: r.soldAt }));
        return { rows };
      }
      if (/FROM prices/.test(s)) return { rows: [{ listed: db.listed }] };
      if (/FROM events e/.test(s)) return { rows: [] };
      throw new Error(`unexpected query: ${s.slice(0, 80)}`);
    },
  } as unknown as PoolClient;
}

main();
