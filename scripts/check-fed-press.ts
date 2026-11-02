import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { PoolClient } from "pg";
import tickerIndex from "../data/edgar-tickers.json";
import { dojPossessive } from "../lib/doj";
import { withoutTag } from "../lib/edgarName";
import { deterministicScore } from "../lib/enrich/relevance";
import {
  FED_PRESS_FEED,
  NOT_THE_COMPANY,
  READ_TYPES,
  boardActsOn,
  cachedFedFeed,
  easternInstant,
  fedPressEvents,
  fetchFedPress,
  orderParties,
  parseFedFeed,
  type FeedRow,
} from "../lib/fedPress";
import { companyNames } from "../lib/frCompany";
import { fedBanksFor } from "../lib/fedActions";
import { fedPressFor } from "../lib/ingest/fedPressFor";
import { namesForYear } from "../lib/ingest/frBackfill";
import { QUOTAS } from "../lib/ingest/quota";
import { SOURCE_TTL_MINUTES } from "../lib/ingest/refresh";
import { SOURCES } from "../lib/ingest/store";
import { isNotesRecord, releaseNamesAsked, releaseNamesOn } from "../lib/releaseNames";
import { newsNamesFor, possessiveNameFor } from "../lib/sec";
import { COMPANY_SOURCES } from "./ingest";

/**
 * The Federal Reserve Board's own announcements naming a listed company as a party, from 2006
 * (batch 84, the 2026-11-01 proposal 5, a source the owner approved on 2026-11-01): an order on an
 * application the company made or that buys it, and a policy release that acts on it.
 *
 *   npm run check:fed-press
 *
 * The rows are real: the Board's whole feed as it was read on 2026-11-01, every one of its 4,650
 * rows (scripts/fixtures/fed-press-feed.json.gz; batch 85, the 2026-11-01 audit's finding 4), so
 * the replay below runs every release of the three types read against every company and every
 * fund series in the committed index. Offline by construction: the Board
 * and the database are stand-ins. On the code before this batch none of it runs: the adapter did
 * not exist.
 */

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const fixture: { rows: FeedRow[] } = JSON.parse(gunzipSync(readFileSync(join(process.cwd(), "scripts/fixtures/fed-press-feed.json.gz"))).toString("utf8"));
const releases = parseFedFeed(fixture.rows);
const companies = tickerIndex.companies as [number, string, string][];
const rowOf = (ticker: string) => {
  const r = companies.find(([, t]) => t === ticker);
  if (!r) throw new Error(`no ${ticker} in the ticker index`);
  return r;
};

/** The names a company's ingest reads a release of `year` under, its legal name among them, from the committed indexes. */
function namesOf(ticker: string): (year: number) => string[] {
  const [cik, , title] = rowOf(ticker);
  const own = dojPossessive(title, possessiveNameFor(cik));
  return (year) => [...companyNames(title, namesForYear(year, newsNamesFor(cik), [])), ...(own ? [own] : []), withoutTag(title)];
}
/** The days a company's page gets a release, oldest first. */
function daysOf(ticker: string, from = ""): string[] {
  const [cik] = rowOf(ticker);
  return fedPressEvents(releases, namesOf(ticker), { cik, from, namesOn: (d) => releaseNamesOn(cik, d) })
    .map((e) => e.date)
    .reverse();
}
const has = (ticker: string, day: string) => daysOf(ticker).includes(day);

/** A stand-in database: the company's first price and the former names EDGAR gave it. */
function fakeDb(listed: string | null, renames: { until: string; body: string }[] = []): PoolClient {
  return {
    query: async (sql: string) => {
      if (/FROM prices/.test(sql)) return { rows: [{ listed }] };
      if (/FROM events e/.test(sql)) return { rows: renames };
      throw new Error(`unexpected query: ${sql.trim().slice(0, 80)}`);
    },
  } as unknown as PoolClient;
}

(async () => {
  console.log("The feed, read as the Board writes it");
  const raw = fixture.rows;
  check("only the three types read are kept — orders, policy, other announcements — not monetary policy or enforcement actions",
    READ_TYPES.length === 3 && raw.some((r) => r.pt === "Monetary Policy") && raw.some((r) => r.pt === "Enforcement Actions") &&
      releases.every((r) => (READ_TYPES as readonly string[]).includes(r.type)) && !releases.some((r) => /Monetary|Enforcement/.test(r.type)));
  check("  …nor a row linking off the Board's site, nor the feed's closing update row",
    raw.some((r) => /Kashkari/.test(r.t ?? "")) && !releases.some((r) => /Kashkari/.test(r.title)) && raw.some((r) => "updateDate" in r) &&
      releases.every((r) => /^https:\/\/www\.federalreserve\.gov\/newsevents\/pressreleases\/[\w-]+\.htm$/.test(r.url)));
  const cfc = releases.find((r) => r.day === "2008-06-05" && /Bank of America$/.test(r.title));
  check("a day-only stamp of 2008 (\"6/5/2008\") is a day with no time", cfc?.at === undefined && cfc?.title === "Approval of proposal by Bank of America", JSON.stringify(cfc));
  const wach = releases.find((r) => r.day === "2008-10-12" && /Wachovia/.test(r.title));
  check("  …and Sunday's Wachovia approval, \"10/12/2008 4:45:00 PM\", carries its time", wach?.at === "2008-10-12T20:45:00.000Z", wach?.at);
  const bns = releases.find((r) => r.day === "2026-10-29" && /Nova Scotia/.test(r.title));
  check("\"10/29/2026 4:30:00 PM\" is 20:30 UTC, Washington on daylight time: after the close", bns?.at === "2026-10-29T20:30:00.000Z", bns?.at);
  const bac = releases.find((r) => r.day === "2009-01-16" && /Bank of America/.test(r.title));
  check("\"1/16/2009 12:15:00 AM\" is a quarter past midnight in winter, 05:15 UTC", bac?.at === "2009-01-16T05:15:00.000Z", bac?.at);
  check("  …and the instant reads back the wall clock either side of a change, none for an hour that never was",
    easternInstant("2026-03-08", "01:59:00") === "2026-03-08T06:59:00.000Z" && easternInstant("2026-03-08", "03:00:00") === "2026-03-08T07:00:00.000Z" &&
      easternInstant("2026-03-08", "02:30:00") === null);
  const socgen = releases.find((r) => r.day === "2006-03-15" && /Soci/.test(r.title));
  check("accented letters spelled as entities are read as letters: \"Société Générale\", \"Banco Popular Español\"",
    /Société Générale/.test(socgen?.title ?? "") && releases.some((r) => /Banco Popular Español$/.test(r.title)) && !releases.some((r) => /&[a-z]+;/i.test(r.title)),
    socgen?.title);

  console.log("\nAn order's parties: the applicant, and what it acquires");
  const parties = (day: string, re: RegExp) => orderParties(releases.find((r) => r.day === day && re.test(r.title))?.title ?? "");
  check("\"…by Mitsubishi UFJ Financial Group to acquire voting shares of Morgan Stanley\" names both",
    JSON.stringify(parties("2008-10-06", /Mitsubishi/)) === JSON.stringify(["Mitsubishi UFJ Financial Group", "Morgan Stanley"]));
  check("\"…by Wells Fargo & Company to acquire Wachovia Corporation\" names both",
    JSON.stringify(parties("2008-10-12", /Wachovia/)) === JSON.stringify(["Wells Fargo & Company", "Wachovia Corporation"]));
  check("\"…its approval for UBS Group AG to acquire the U.S. subsidiaries of Credit Suisse Group AG\" names UBS",
    parties("2023-04-14", /UBS/)[0] === "UBS Group AG", JSON.stringify(parties("2023-04-14", /UBS/)));
  check("\"…announces public meetings on the notice by Bank of America to acquire Countrywide Financial\" names both",
    JSON.stringify(parties("2008-03-27", /Countrywide/)) === JSON.stringify(["Bank of America", "Countrywide Financial"]));
  check("a release that names no applicant names no party", parties("2010-04-30", /Banco Popular/).length === 0 && parties("2008-09-22", /consummated/).length === 0);

  console.log("\nA company's page, from the real feed");
  check("Wells Fargo's: the Wachovia approval of 2008-10-12 and the Board's statement on it of 2008-10-21",
    has("WFC", "2008-10-12") && has("WFC", "2008-10-21"), daysOf("WFC").join(","));
  check("Bank of America's: Merrill Lynch (2008-11-26), the rescue (2009-01-16), the capital plan it had to resubmit (2014-04-28)",
    has("BAC", "2008-11-26") && has("BAC", "2009-01-16") && has("BAC", "2014-04-28"), daysOf("BAC").join(","));
  check("one order, two pages: MUFG's stake in Morgan Stanley of 2008-10-06 is the buyer's and the bought's",
    has("MUFG", "2008-10-06") && has("MS", "2008-10-06"));
  check("a policy release acts on the companies it names: Goldman Sachs and Morgan Stanley become bank holding companies (2008-09-21)",
    has("GS", "2008-09-21") && has("MS", "2008-09-21"));
  check("  …Fannie Mae's and Freddie Mac's joint release of 2008-09-07, the day of their conservatorship; TD's and First Horizon's public meeting of 2022-05-17",
    has("FNMA", "2008-09-07") && has("FMCC", "2008-09-07") && has("TD", "2022-05-17") && has("FHN", "2022-05-17"));
  check("an order under a bank batch 69's map gives the company: \"Goldman Sachs Bank USA\" (2016-03-21) is Goldman Sachs's",
    has("GS", "2016-03-21") && has("GS", "2015-10-05"));
  const near = [
    ["WFC", "2017-12-15"], ["GS", "2013-04-29"], ["MS", "2013-05-08"], ["FNMA", "2008-10-07"], ["FMCC", "2008-10-17"],
  ] as const;
  check("a release whose letters hold the name but that makes the company no party is refused: a recusal, borrowers' payments, a capital rule",
    near.every(([t, d]) => releases.some((r) => r.day === d) && !has(t, d)), near.filter(([t, d]) => has(t, d)).join(" "));
  check("a namesake refused by hand: \"Approval of proposal by Fortis\" (2007-12-04) is the Belgian bank, not Fortis Inc.",
    !has("FTS", "2007-12-04") && NOT_THE_COMPANY[rowOf("FTS")[0]]?.length === 1 && releases.some((r) => r.day === "2007-12-04"));
  check("  …and by the rules: Banco Popular Español is not Popular, Inc., Michigan's Citizens Banking Corporation not Citizens, Inc. or Citizens Financial",
    !has("BPOP", "2006-02-08") && !has("CIA", "2006-12-12") && !has("CFG", "2006-12-12"));
  check("Popular's own order of 2010-04-30, under its bank's name, is not given it: the map's row for Popular is the owner's to add",
    !has("BPOP", "2010-04-30") && releases.some((r) => r.day === "2010-04-30"));
  check("a release before the company's first price is not its: Live Oak's order of 2013-08-14, two years before its listing",
    has("LOB", "2013-08-14") && !daysOf("LOB", "2015-07-23").includes("2013-08-14"));
  const [ord] = fedPressEvents(releases.filter((r) => r.day === "2008-06-05" && /Bank of America$/.test(r.title)), namesOf("BAC"), { cik: 70858 });
  check("an event is the Board's title and link, a regulation event, kept by the release's path, with no time where the feed gives none",
    ord?.type === "regulation" && ord.title === "Approval of proposal by Bank of America" && ord.source === "Federal Reserve Board press release" && ord.sourceKey === "fed_press" &&
      ord.url === "https://www.federalreserve.gov/newsevents/pressreleases/orders20080605a.htm" && ord.externalId === "/newsevents/pressreleases/orders20080605a.htm" &&
      ord.dedupBasis === "fed-press:/newsevents/pressreleases/orders20080605a.htm" && ord.occurredAt === undefined, JSON.stringify(ord));
  const [late] = fedPressEvents(releases.filter((r) => r.day === "2026-10-29" && /Nova Scotia/.test(r.title)), namesOf("BNS"), { cik: rowOf("BNS")[0] });
  check("  …with the instant where the feed gives a time, so the after-the-close mark reads it", late?.occurredAt === "2026-10-29T20:30:00.000Z");
  check("boardActsOn needs the Board's own phrase before the name: a title that only mentions Wells Fargo is not an action on it",
    boardActsOn("Agencies permit Wells Fargo to begin using advanced approaches framework", ["Wells Fargo"]) &&
      !boardActsOn("Vice Chairman Quarles will voluntarily recuse himself from participating in matters specific to Wells Fargo", ["Wells Fargo"]));

  console.log("\nEvery release of the feed against every listed company and every fund series");
  const t0 = Date.now();
  const alnum = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  const heads = releases.map((r) => alnum(r.title));
  const grams = new Map<string, number[]>();
  heads.forEach((h, i) => {
    const got = new Set<string>();
    for (let k = 0; k + 4 <= h.length; k++) got.add(h.slice(k, k + 4));
    for (const g of got) (grams.get(g) ?? grams.set(g, []).get(g)!).push(i);
  });
  const holding = (key: string): number[] => {
    if (key.length < 4) return heads.flatMap((h, i) => (h.includes(key) ? [i] : []));
    let best: number[] | undefined;
    for (let k = 0; k + 4 <= key.length; k++) {
      const p = grams.get(key.slice(k, k + 4));
      if (!p) return [];
      if (!best || p.length < best.length) best = p;
    }
    return best!.filter((i) => heads[i].includes(key));
  };
  const replayOne = (cik: number, title: string, units: boolean) => {
    const own = dojPossessive(title, possessiveNameFor(cik));
    const aka = newsNamesFor(cik);
    const names = (y: number) => [...companyNames(title, namesForYear(y, aka, [])), ...(own ? [own] : []), withoutTag(title)];
    const keys = [...new Set([...names(2026), ...(units ? releaseNamesAsked(cik) : [])].map(alnum).filter((a) => a.length >= 2))];
    const orgs = units ? (fedBanksFor(cik) ?? []) : [];
    const ids = new Set(keys.flatMap(holding));
    releases.forEach((r, i) => orgs.some((o) => o.match.test(r.title)) && ids.add(i));
    const held = [...ids].sort((a, b) => a - b).map((i) => releases[i]);
    return held.length ? fedPressEvents(held, names, { cik, namesOn: (d) => (units ? releaseNamesOn(cik, d) : []) }) : [];
  };
  let matches = 0;
  let before2017 = 0;
  let orders = 0;
  const named = new Set<string>();
  const seen = new Set<number>();
  for (const [cik, ticker, title] of companies) {
    if (seen.has(cik) || isNotesRecord(cik)) continue;
    seen.add(cik);
    const got = replayOne(cik, title, true);
    if (got.length) named.add(ticker);
    matches += got.length;
    before2017 += got.filter((e) => e.date < "2017").length;
    orders += got.filter((e) => /order on a banking application/.test(e.description ?? "")).length;
  }
  check("the 2,219 releases read give 225 matches on 103 companies, 126 before 2017, 181 of them orders, as replayed in full",
    releases.length === 2219 && matches === 225 && named.size === 103 && before2017 === 126 && orders === 181,
    `${releases.length} releases → ${matches} on ${named.size}, ${before2017} before 2017, ${orders} orders, in ${Date.now() - t0} ms`);
  const seriesNames = tickerIndex.seriesNames as string[];
  const seriesSeen = new Set<string>();
  let fundMatches = 0;
  seriesNames.forEach((name, i) => {
    const cik = (tickerIndex.seriesCiks as number[])[i];
    if (seriesSeen.has(`${cik}:${name}`)) return;
    seriesSeen.add(`${cik}:${name}`);
    fundMatches += replayOne(cik, name, false).length;
  });
  check("  …and every fund series' name none, read as a company's (batch 85, the 2026-11-01 audit's finding 4)", seriesSeen.size > 19_000 && fundMatches === 0,
    `${seriesSeen.size} series names, ${fundMatches} matches, ${Date.now() - t0} ms in all`);

  console.log("\nRead once a process, for every company");
  const realFetch = globalThis.fetch;
  let asked = 0;
  let answer: () => Response = () => new Response("﻿" + JSON.stringify(fixture.rows), { status: 200 });
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    asked++;
    if (String(url) !== FED_PRESS_FEED) throw new Error(`unexpected request: ${String(url)}`);
    const ua = new Headers(init?.headers).get("user-agent") ?? "";
    if (!/^News Charts Research /.test(ua)) throw new Error(`no contact in the user agent: ${ua}`);
    return answer();
  }) as typeof fetch;
  try {
    answer = () => new Response("", { status: 403 });
    const refused = await fetchFedPress(namesOf("WFC"), { cik: 72971 });
    check("a refusal is reported as throttling, and not kept", refused.outcome === "throttled" && refused.httpStatus === 403 && asked === 1);
    answer = () => new Response("﻿" + JSON.stringify(fixture.rows), { status: 200 });
    const one = await fetchFedPress(namesOf("WFC"), { cik: 72971 });
    const two = await fetchFedPress(namesOf("BAC"), { cik: 70858 });
    check("  …the next company asks again; after an answer, the file, its byte-order mark read past, serves every company with no second request",
      asked === 2 && one.outcome === "ok" && two.outcome === "ok" && one.events.some((e) => e.date === "2008-10-12") && two.events.some((e) => e.date === "2014-04-28") &&
        (await cachedFedFeed()).length === releases.length, `${asked} requests`);
  } finally {
    globalThis.fetch = realFetch;
  }

  console.log("\nA company's releases, at ingest");
  const tfc = { edgarName: "TRUIST FINANCIAL CORP", alsoKnownAs: [], cik: 92230 };
  const unnamed = (await fedPressFor(fakeDb("1990-01-02"), 1, tfc)).events.filter((e) => /BB&T Corporation/.test(e.title)).map((e) => e.date);
  check("Truist's page gets BB&T's six orders of 2006 to 2019 through batch 69's map, which gives it BB&T until 2019-12-05",
    unnamed.length === 6 && unnamed.includes("2006-03-27") && unnamed.includes("2019-11-19") && !unnamed.includes("2013-08-23"), unnamed.join(","));
  const renamed = await fedPressFor(fakeDb("1990-01-02", [{ until: "2019-12-06", body: "EDGAR's company record lists BB&T CORP as a former name of this filer, in use until this day." }]), 1, tfc);
  const bbt = renamed.events.filter((e) => /BB&T Corporation/.test(e.title)).map((e) => e.date);
  check("  …and BB&T's capital plan of 2013, a policy release, by its stored former legal name",
    renamed.outcome === "ok" && bbt.length === 7 && bbt.includes("2013-08-23"), bbt.join(","));
  const notes = await fedPressFor(fakeDb("1990-01-02"), 1, { edgarName: "BARCLAYS BANK PLC", alsoKnownAs: [], cik: 312070 });
  const unpriced = await fedPressFor(fakeDb(null), 1, { edgarName: "WELLS FARGO & COMPANY/MN", alsoKnownAs: [], cik: 72971 });
  check("a bank's notes record takes none, nor a company with no prices", notes.outcome === "empty" && /notes record/.test(notes.detail ?? "") && /^no prices to start from/.test(unpriced.detail ?? ""));
  check("  …and no prices yet is a failure, not \"empty\", so the next run asks again (batch 85, the 2026-11-01 audit's finding 5)", unpriced.outcome === "error" && unpriced.events.length === 0);
  const fund = await fedPressFor(fakeDb("1980-01-02"), 1, { edgarName: "GROWTH FUND", alsoKnownAs: [], cik: 100334, fundSeries: true });
  check("  …nor a fund's series, whose page knows only its series name (batch 85)", fund.outcome === "empty" && fund.events.length === 0 && /fund's series/.test(fund.detail ?? ""));
  const lob = await fedPressFor(fakeDb("2015-07-23"), 1, { edgarName: "Live Oak Bancshares, Inc.", alsoKnownAs: [], cik: 1462120 });
  check("  …and a company's first price bounds its releases", !lob.events.some((e) => e.date < "2015-07-23"), lob.events.map((e) => e.date).join(","));

  console.log("\nRegistered, licensed, wired");
  const src = SOURCES.find((s) => s.key === "fed_press");
  check("the source is registered as public domain, as the Board's site says, cleared for commercial use, with the day it was read",
    src?.id === 29 && src.license === "public domain" && src.commercialOk && src.reviewedOn === "2026-11-01" && src.attribution === "Board of Governors of the Federal Reserve System",
    JSON.stringify(src));
  check("  …asked once a day per company, one file with no published cap", SOURCE_TTL_MINUTES.fed_press === 1440 && QUOTAS.fed_press?.perDay === null);
  check("a release is scored without the model",
    deterministicScore({ eventId: 0, kind: "regulation", title: "Approval of proposal by Wells Fargo & Company to acquire Wachovia Corporation", sourceKey: "fed_press" }, { kind: "company", displayName: "Wells Fargo", ticker: "WFC" }, ["wells fargo"])?.score === 0.95);
  const ingest = read("scripts/ingest.ts");
  const company = ingest.slice(ingest.indexOf("export async function ingestCompany"), ingest.indexOf("\n}\n", ingest.indexOf("export async function ingestCompany")));
  check("company ingest keeps the company's releases under its names, by its CIK, after its prices",
    (COMPANY_SOURCES as readonly string[]).includes("fed_press") &&
      /await run\("fed_press", [^\n]+, \(\) =>\s+fedPressFor\(client, subjectId, \{ edgarName: company\.name, alsoKnownAs, possessive: dojPossessive\(company\.name, possessive\), cik: company\.cik, fundSeries \}\)\);/.test(ingest) &&
      company.indexOf('await run("fed_press"') > company.indexOf("await companyPrices("));
  check("check:feeds reports the feed as ingest keeps it, and check:live asks the real file",
    /reportFetch\("Fed Board releases"/.test(read("scripts/check-feeds.ts")) && /"Fed Board releases": "fed_press"/.test(read("scripts/check-feeds.ts")) &&
      /covers: \["fed_press"\]/.test(read("scripts/check-live.ts")));
  check("the Board's press releases are credited where the other sources are",
    /press releases and\s+enforcement actions from the Federal Reserve Board/.test(read("app/layout.tsx")) &&
      /press releases and enforcement actions from the Federal Reserve Board/.test(read("app/legal/terms/page.tsx")) &&
      /\| Federal Reserve Board press releases \|/.test(read("README.md")));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  process.exit(fail ? 1 : 0);
})();
