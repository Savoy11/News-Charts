import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { PoolClient } from "pg";
import tickerIndex from "../data/edgar-tickers.json";
import { CFTC_LIST, cftcEvents, cftcNamesParty, fetchCftcPage, parseCftcList, type CftcAction, type CftcAnswer } from "../lib/cftc";
import { dojPossessive } from "../lib/doj";
import { withoutTag } from "../lib/edgarName";
import { deterministicScore } from "../lib/enrich/relevance";
import { companyNames } from "../lib/frCompany";
import { LIST_PAGES, cftcFor, walkCftc, type CftcWalk } from "../lib/ingest/cftcWalk";
import { namesForYear } from "../lib/ingest/frBackfill";
import { QUOTAS } from "../lib/ingest/quota";
import { SOURCE_TTL_MINUTES } from "../lib/ingest/refresh";
import { SOURCES } from "../lib/ingest/store";
import { isNotesRecord, releaseNamesAsked, releaseNamesBefore, releaseNamesOn } from "../lib/releaseNames";
import { newsNamesFor, possessiveNameFor } from "../lib/sec";
import type { TimelineEvent } from "../lib/types";
import { COMPANY_SOURCES } from "./ingest";

/**
 * The CFTC's enforcement actions on the pages of the companies they charge (batch 97, the
 * 2026-11-05 proposal 2).
 *
 *   npm run check:cftc
 *
 * Replays every page of the Commission's enforcement list as served on 2026-11-05
 * (scripts/fixtures/cftc-list.json.gz). Offline: the list and the database are stood in for. On
 * main none of it runs: lib/cftc.ts does not exist.
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
const LIST: { provenance: string; pages: string[] } = JSON.parse(gunzipSync(readFileSync(join(root, "scripts/fixtures/cftc-list.json.gz"))).toString("utf8"));
const actions = LIST.pages.flatMap(parseCftcList);
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
/** A company's events as ingest keeps them, from `from` on. */
function on(ticker: string, from = ""): TimelineEvent[] {
  const [cik, , title] = rowOf(ticker);
  const namesIn = namesOf(ticker);
  return cftcEvents(actions, companyNames(title, newsNamesFor(cik)), { cik, from, namesOn: (day) => [...namesIn(Number(day.slice(0, 4))), ...releaseNamesOn(cik, day)], namesBefore: (day) => releaseNamesBefore(cik, day) });
}
const lands = (ticker: string, day: string, title: RegExp) => on(ticker).some((e) => e.date === day && (title.test(e.title) || title.test(e.description ?? "")));

async function main(): Promise<void> {
  console.log("\nThe list");
  const days = actions.map((a) => a.day).sort();
  check("every page of the list: 2,610 rows, ten a page, 2,607 actions (three listed twice), from 1995-07-27 to 2026-11-03, each with its release's link",
    LIST.pages.length === 261 && actions.length === 2610 && new Set(actions.map((a) => a.path)).size === 2607 && days[0] === "1995-07-27" && days[days.length - 1] === "2026-11-03" &&
      LIST.pages.every((p) => parseCftcList(p).length === 10),
    `${LIST.pages.length} pages, ${actions.length} actions, ${days[0]} to ${days[days.length - 1]}`);
  check("  …the day the list shows, not the time stamp's UTC day", actions.some((a) => a.day === "2026-11-03" && a.path === "/PressRoom/PressReleases/9320-26"));

  console.log("\nThe company is the party");
  check("AEP's suit of 2003-10-01 lands on AEP", lands("AEP", "2003-10-01", /AMERICAN ELECTRIC POWER/i));
  check("Royal Bank of Canada's order of 2014-12-19 lands on RY", lands("RY", "2014-12-19", /Royal Bank of Canada/));
  check("Deutsche Bank Securities' of 2014-12-23 lands on DB, through its unit's name", lands("DB", "2014-12-23", /Deutsche Bank Securities/));
  check("Goldman's of 2012-12-08, \"Goldman, Sachs & Co., a Commission Registrant\", and of 2016-12-22 land on GS",
    lands("GS", "2012-12-08", /Goldman, Sachs & Co\./) && lands("GS", "2016-12-22", /Goldman Sachs/));
  check("UBS's LIBOR order of 2012-12-20, \"CFTC Orders UBS to Pay\", lands on UBS", lands("UBS", "2012-12-20", /UBS/));
  check("Hartford Financial Group's of 1999-12-09 lands on no page of The Hartford's, nor the Avista officer's on AVA",
    !on("HIG").some((e) => e.date === "1999-12-09") && !on("AVA").some((e) => /Former Avista/i.test(e.title)) &&
      actions.some((a) => a.day === "1999-12-09" && /Hartford Financial Group/i.test(a.title)) && actions.some((a) => /Former Avista Energy/i.test(a.title)));
  check("a count before the name is a common noun: \"CFTC Orders Six Financial Institutions to Pay\" is not Financial Institutions, Inc.'s",
    on("FISI").length === 0 && actions.filter((x) => /\b(?:Six|11|Four|Three) Financial Institutions\b/.test(x.title)).length === 4);
  check("  …a name only ever after \"Former\" is about people: Citigroup's traders of 2017-06-30 are not Citigroup's",
    !on("C").some((e) => e.date === "2017-06-30") && on("C").some((e) => e.date === "2017-01-19"));
  check("  …another company's unit owns its whole name: Prudential Securities' of 2002-10-09 is Prudential Financial's, not Prudential plc's",
    on("PRU").some((e) => e.date === "2002-10-09") && !on("PUK").some((e) => e.date === "2002-10-09"));
  check("  …an everyday word as the Commission's object takes no possessive: \"People’s Alternative\" is not People Inc.'s, while \"CME Group’s New York Mercantile Exchange\" is CME's",
    on("PPLI").length === 0 && lands("CME", "2013-02-22", /CME Group’s New York Mercantile Exchange/) && lands("CHSCP", "2024-09-26", /CHS Hedging/));
  check("  …and CTS Financial Publishing, read by hand, is not CTS Corporation", on("CTS").length === 0 && actions.some((x) => /CTS FINANCIAL PUBLISHING/.test(x.title)));
  check("the comma rule is a registrant's name, not any comma: \"Morgan Stanley, Goldman\" still parts two parties",
    cftcNamesParty("CFTC Orders Goldman, Sachs & Co., a Commission Registrant, to Pay $1.5 Million", ["Goldman Sachs"]) && !cftcNamesParty("CFTC Charges Former Goldman Sachs Trader", ["Goldman Sachs"]));

  check("the company in its own legal form, or after the place it is based (batch 100, the audit's finding 6): \"Deutsche Bank AG\" twice, \"London-Based\" and \"United Kingdom-Based Barclays Bank PLC\", \"MINNEAPOLIS-BASED NRG ENERGY, INC.\"",
    lands("DB", "2015-10-01", /Deutsche Bank AG/) && lands("DB", "2016-08-19", /Deutsche Bank AG/) && lands("BCS", "2016-07-07", /London-Based Barclays/) &&
      lands("BCS", "2016-09-23", /United Kingdom-Based Barclays/) && lands("NRG", "2004-07-01", /MINNEAPOLIS-BASED NRG/));
  check("  …but a name joined on by a hyphen is another firm's: \"Florida-Based Inter-Global Currency & Precious Metals LLC\" is not Inter's",
    !cftcNamesParty("CFTC Charges Florida-Based Inter-Global Currency & Precious Metals LLC and Stavros Papastavrou", ["Inter"]) &&
      cftcNamesParty("CFTC Sues Minneapolis-Based NRG Energy, Inc., Charging NRG", ["NRG Energy"]) && !on("INTR").some((e) => e.date === "2014-09-30"));

  console.log("\nEvery listed company against every action");
  const letters = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const every = letters(actions.map((a) => a.title).join("#"));
  const titleLetters = new Map(actions.map((a) => [a, letters(a.title)]));
  const out = new Map<string, TimelineEvent[]>();
  const seen = new Set<number>();
  for (const [cik, ticker, title] of companies) {
    if (seen.has(cik) || isNotesRecord(cik)) continue;
    seen.add(cik);
    const namesIn = namesOf(ticker);
    const keys = [...new Set([...namesIn(1995), ...namesIn(2020), ...releaseNamesAsked(cik)].map(letters).filter((k) => k.length >= 2))];
    if (!keys.some((k) => every.includes(k))) continue;
    const held = actions.filter((a) => keys.some((k) => titleLetters.get(a)?.includes(k)));
    const ev = cftcEvents(held, companyNames(title, newsNamesFor(cik)), { cik, namesOn: (day) => [...namesIn(Number(day.slice(0, 4))), ...releaseNamesOn(cik, day)] });
    if (ev.length) out.set(ticker, ev);
  }
  const flat = [...out.values()].flat();
  const top = [...out].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).slice(0, 5).map(([t, v]) => `${t} ${v.length}`).join(", ");
  check(`before any first price: ${EXPECTED.total} company days on ${EXPECTED.companies} companies, ${EXPECTED.before2017} before 2017; ${EXPECTED.top}`,
    flat.length === EXPECTED.total && out.size === EXPECTED.companies && flat.filter((e) => e.date < "2017").length === EXPECTED.before2017 && top === EXPECTED.top,
    `${flat.length} on ${out.size}; ${flat.filter((e) => e.date < "2017").length} before 2017; ${top}`);

  console.log("\nRead whole once a year, its newest page once a day");
  const db: FakeDb = { actions: new Map(), reads: new Map(), listed: "1962-01-02" };
  const served: number[] = [];
  const serve = async (page: number): Promise<CftcAnswer> => {
    served.push(page);
    return { actions: parseCftcList(LIST.pages[page] ?? ""), lastPage: LIST.pages.length - 1, outcome: "ok", httpStatus: 200 };
  };
  const whole = await walkCftc(fakeDb(db), { budget: { left: 320 }, gapMs: 0, fetchPage: serve });
  check("the first run reads every page and keeps every action once", whole.due === "list" && whole.pages === 261 && db.actions.size === 2607 && whole.actions === 2607 && served[260] === 260, JSON.stringify(whole));
  const again = await walkCftc(fakeDb(db), { budget: { left: 320 }, gapMs: 0, fetchPage: serve });
  check("  …a run the same day asks nothing", again.due === null && served.length === 261);
  for (const r of db.reads.values()) r.ageDays = 2;
  const newest = await walkCftc(fakeDb(db), { budget: { left: 320 }, gapMs: 0, fetchPage: serve });
  check("  …a day on, the newest page alone, which holds an action already kept", newest.due === "newest" && newest.pages === 1 && served[261] === 0, JSON.stringify(newest));
  const short = await walkCftc(fakeDb({ actions: new Map(), reads: new Map(), listed: null }), { budget: { left: LIST_PAGES - 1 }, gapMs: 0, fetchPage: serve });
  check("  …the whole list is begun only with its pages left in the run", short.stopped === "this run's pages are spent" && short.pages === 0);
  const refused = await walkCftc(fakeDb({ actions: new Map(), reads: new Map(), listed: null }), {
    budget: { left: 320 },
    gapMs: 0,
    fetchPage: async (p) => (p === 5 ? { actions: [], outcome: "throttled", httpStatus: 429 } : serve(p)),
  });
  check("  …a refused page stops the read and keeps nothing of it", refused.failure?.httpStatus === 429 && /page 5/.test(refused.failure.detail ?? ""), JSON.stringify(refused));
  const real = globalThis.fetch;
  globalThis.fetch = (async () => new Response("<html><body>Request Rejected</body></html>", { status: 200 })) as typeof fetch;
  let blank: CftcAnswer;
  try {
    blank = await fetchCftcPage(0);
  } finally {
    globalThis.fetch = real;
  }
  check("  …and a page without the list is an error, not an empty page", blank.outcome === "error" && blank.detail === "no list on the page");

  const plan = (t: string) => {
    const [cik, , name] = rowOf(t);
    return { edgarName: name, alsoKnownAs: newsNamesFor(cik), possessive: dojPossessive(name, possessiveNameFor(cik)), cik };
  };
  const noWalk: CftcWalk = { due: null, pages: 0, actions: 0 };
  const gs = await cftcFor(fakeDb({ ...db, listed: "1999-05-04" }), 1, plan("GS"), noWalk);
  const ubsLate = await cftcFor(fakeDb({ ...db, listed: "2014-11-28" }), 1, plan("UBS"), noWalk);
  check("a company's ingest keeps its kept actions from its first price: Goldman's from 1999, UBS Group's not before it listed",
    gs.events.some((e) => e.date === "2016-12-22") && gs.events.every((e) => e.date >= "1999-05-04") && !ubsLate.events.some((e) => e.date === "2012-12-20"),
    `${gs.events.length} on GS; ${ubsLate.events.length} on UBS from 2014-11-28`);

  console.log("\nRegistered, licensed, wired");
  const src = SOURCES.find((s) => s.key === "cftc");
  check("the source is registered as public domain, acknowledged to the CFTC, with the day it was read",
    src?.id === 33 && src.license === "public domain" && src.commercialOk && src.reviewedOn === "2026-11-05" && src.attribution === "Commodity Futures Trading Commission", JSON.stringify(src));
  check("  …the Commission's words quoted where they are used",
    /Government information at the CFTC website is in the public domain/.test(read("lib/cftc.ts")) && CFTC_LIST === "https://www.cftc.gov/LawRegulation/EnforcementActions/index.htm");
  check("  …asked once a day per company, quota noted, a company source, scored without the model",
    SOURCE_TTL_MINUTES.cftc === 1440 && QUOTAS.cftc.perDay === null && (COMPANY_SOURCES as readonly string[]).includes("cftc") &&
      deterministicScore({ eventId: 0, kind: "regulation", title: "CFTC Orders", sourceKey: "cftc" }, { kind: "company", displayName: "Goldman Sachs", ticker: "GS" }, ["goldman sachs"])?.score === 0.95);
  check("  …company ingest walks the list, then keeps the company's actions",
    /await run\("cftc", [^\n]+\n\s*const walked = await walkCftc\(client\);[\s\S]{0,300}return cftcFor\(client, subjectId, \{[^}]*cik: company\.cik, fundSeries \}, walked\);/.test(read("scripts/ingest.ts")));
  check("  …into tables of its own (db/039), and credited",
    /CREATE TABLE IF NOT EXISTS cftc_actions \(\s*path\s+text PRIMARY KEY/.test(read("db/039_cftc_actions.sql")) &&
      /enforcement actions from the Commodity Futures Trading Commission/.test(read("app/layout.tsx").replace(/\s+/g, " ")) &&
      /enforcement actions from the Commodity Futures Trading Commission/.test(read("app/legal/terms/page.tsx").replace(/\s+/g, " ")) &&
      /\| Commodity Futures Trading Commission \|/.test(read("README.md")));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  process.exit(fail ? 1 : 0);
}

/**
 * The replay's counts, measured 2026-11-05 on the saved list; batch 121's operating units add two, BP
 * Products North America's propane charge of 2006 on BP and San Diego Gas & Electric's wash sales of
 * 2010 on Sempra (88 on 33 and 47 before 2017 before).
 */
const EXPECTED = { total: 90, companies: 34, before2017: 49, top: "JPM 12, DB 7, MS 7, BCS 6, GS 6" };

interface FakeDb {
  actions: Map<string, CftcAction>;
  reads: Map<"list" | "newest", { ageDays: number }>;
  listed: string | null;
}
function fakeDb(db: FakeDb): PoolClient {
  return {
    query: async (sql: string, params: unknown[] = []) => {
      const s = sql.trim();
      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(s)) return { rows: [] };
      if (/^SELECT kind, read_at < now\(\) - make_interval\(days => 365\) AS old, read_at < now\(\) - interval '1 day' AS stale FROM cftc_reads$/.test(s)) {
        return { rows: [...db.reads].map(([kind, r]) => ({ kind, old: r.ageDays > 365, stale: r.ageDays > 1 })) };
      }
      if (/^SELECT path FROM cftc_actions$/.test(s)) return { rows: [...db.actions.keys()].map((path) => ({ path })) };
      if (/^INSERT INTO cftc_actions \(path, filed_on, title\)/.test(s)) {
        const [paths, ds, titles] = params as string[][];
        paths.forEach((path, i) => db.actions.set(path, { path, day: ds[i], title: titles[i] }));
        return { rows: [], rowCount: paths.length };
      }
      if (/^INSERT INTO cftc_reads/.test(s)) {
        db.reads.set(params[0] as "list" | "newest", { ageDays: 0 });
        return { rows: [] };
      }
      if (/^SELECT path, filed_on::text AS day, title FROM cftc_actions ORDER BY filed_on, path$/.test(s)) {
        return { rows: [...db.actions.values()].sort((a, b) => a.day.localeCompare(b.day) || a.path.localeCompare(b.path)) };
      }
      if (/FROM prices/.test(s)) return { rows: [{ listed: db.listed }] };
      if (/FROM events e/.test(s)) return { rows: [] };
      throw new Error(`unexpected query: ${s.slice(0, 80)}`);
    },
  } as unknown as PoolClient;
}

main();
