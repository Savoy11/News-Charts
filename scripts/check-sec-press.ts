import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PoolClient } from "pg";
import tickerIndex from "../data/edgar-tickers.json";
import { dojPossessive, releaseNamesParty } from "../lib/doj";
import { companyNames } from "../lib/frCompany";
import { namesForYear } from "../lib/ingest/frBackfill";
import { GAP_MS, PAGES_PER_RUN, YEAR_PAGES, secPressFor, storedSecReleases, walkSecPress, type PressWalk } from "../lib/ingest/secPressWalk";
import { NOTES_RECORDS, RELEASE_NAMES, isNotesRecord, releaseNamesAsked, releaseNamesBefore, releaseNamesOn } from "../lib/releaseNames";
import { SOURCE_TTL_MINUTES } from "../lib/ingest/refresh";
import { QUOTAS } from "../lib/ingest/quota";
import { SOURCES } from "../lib/ingest/store";
import { deterministicScore } from "../lib/enrich/relevance";
import { newsNamesFor, outrankingNameFor, possessiveNameFor } from "../lib/sec";
import {
  SEC_PRESS_FROM,
  easternDay,
  fetchListingPage,
  parseListing,
  releaseKey,
  secPressEvents,
  secReleaseNamesParty,
  type ListingPage,
  type SecRelease,
} from "../lib/secPress";
import { COMPANY_SOURCES } from "./ingest";

/**
 * The SEC's own press releases naming a company as the party, from 1997 (batch 73, the 2026-10-28
 * proposal 1, approved by the owner on 2026-10-29).
 *
 *   npm run check:sec-press
 *
 * The rows are real, read from the SEC newsroom's year listing on 2026-10-29
 * (scripts/fixtures/sec-press.json): charges and settlements naming a listed company, and releases
 * that only mention one — a former executive, two individuals in a company's scheme, a city, the
 * SEC's own Division of Risk, Strategy, and Financial Innovation, a board member, a name three
 * banks share. Offline by construction: the SEC and the database are stand-ins. On the code before
 * this batch none of it runs — the adapter, its year walk and its tables did not exist.
 */

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const fixture: { listing: string; late: string; empty: string; releases: SecRelease[] } = JSON.parse(read("scripts/fixtures/sec-press.json"));
const companies = tickerIndex.companies as [number, string, string][];

/** The names a company's ingest matches a release of `year` under, from the committed indexes. */
function namesOf(ticker: string, former: { name: string; until: string }[] = []): (year: number) => string[] {
  const row = companies.find(([, t]) => t === ticker);
  if (!row) throw new Error(`no ${ticker} in the ticker index`);
  const own = dojPossessive(row[2], possessiveNameFor(row[0]));
  return (year) => [...companyNames(row[2], namesForYear(year, newsNamesFor(row[0]), former)), ...(own ? [own] : [])];
}
/** The fixture release with this number (and day, where the number is not enough). */
function release(number: string, day?: string): SecRelease {
  const r = fixture.releases.find((x) => x.number === number && (!day || x.day === day));
  if (!r) throw new Error(`no release ${number} in the fixture`);
  return r;
}
/**
 * Every release the SEC listing held on 2026-10-30, 6,894 of them, and the three its year pages never
 * showed, read from their months in batch 85: 6,897 (scripts/fixtures/sec-press-listing.json):
 * number, day and headline, linked as the listing links them.
 */
const listing: { releases: [number: string, day: string, title: string][] } = JSON.parse(read("scripts/fixtures/sec-press-listing.json"));
const stored: SecRelease[] = listing.releases.map(([number, day, title]) => ({ number, day, title, url: `https://www.sec.gov/newsroom/press-releases/${number}` }));
function storedRelease(number: string): SecRelease {
  const r = stored.find((x) => x.number === number);
  if (!r) throw new Error(`no release ${number} in the stored listing`);
  return r;
}
const cikOf = (ticker: string) => companies.find(([, t]) => t === ticker)![0];
/**
 * Whether ingest puts the release on the company's page, its first price aside: its names that
 * year, the units it then owned (`releaseNamesOn`), and none on a bank's notes record.
 */
const pageTakes = (r: SecRelease, ticker: string) =>
  !isNotesRecord(cikOf(ticker)) && secPressEvents([r], namesOf(ticker), "", (day) => releaseNamesOn(cikOf(ticker), day)).length === 1;
function expectPages(name: string, cases: [number: string, ticker: string, wanted: boolean][]): void {
  const wrong = cases.filter(([n, t, want]) => pageTakes(storedRelease(n), t) !== want);
  check(name, wrong.length === 0, wrong.map(([n, t, want]) => `${n} ${want ? "not on" : "on"} ${t}`).join("; "));
}

/**
 * The whole stored listing against every company in the committed index, as ingest names them —
 * former names and first prices aside — with the units the release rules give them (batch 82, as
 * the 2026-10-30 audit replayed it by hand). A name matches only a headline whose letters and
 * digits hold its own, so each company reads only those.
 */
function replayListing(): Map<string, string[]> {
  const alnum = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  const heads = stored.map((r) => alnum(r.title));
  const pieces = new Map<string, number[]>();
  heads.forEach((h, i) => {
    const got = new Set<string>();
    for (let p = 0; p + 2 <= h.length; p++) for (const k of [2, 3]) if (p + k <= h.length) got.add(h.slice(p, p + k));
    for (const g of got) (pieces.get(g) ?? pieces.set(g, []).get(g)!).push(i);
  });
  const holding = (a: string) => (pieces.get(a.slice(0, 3)) ?? []).filter((i) => heads[i].includes(a));
  const out = new Map<string, string[]>();
  const seen = new Set<number>();
  for (const [cik, ticker, title] of companies) {
    if (seen.has(cik)) continue;
    seen.add(cik);
    if (isNotesRecord(cik)) continue;
    const own = dojPossessive(title, possessiveNameFor(cik));
    const aka = newsNamesFor(cik);
    const names = (year: number) => [...companyNames(title, namesForYear(year, aka, [])), ...(own ? [own] : [])];
    const all = [...names(2026), ...releaseNamesAsked(cik)].map(alnum).filter((a) => a.length >= 2);
    const held = [...new Set(all.flatMap(holding))].sort((a, b) => a - b).map((i) => stored[i]);
    const events = held.length ? secPressEvents(held, names, "", (day) => releaseNamesOn(cik, day)) : [];
    if (events.length) out.set(ticker, events.map((e) => e.externalId!));
  }
  return out;
}

/** Which of `tickers` a release lands on. */
const landsOn = (r: SecRelease, tickers: string[], former: Record<string, { name: string; until: string }[]> = {}) =>
  tickers.filter((t) => secReleaseNamesParty(r.title, namesOf(t, former[t])(Number(r.day.slice(0, 4)))));

function expectOn(name: string, cases: [number: string, tickers: string[]][], former: Record<string, { name: string; until: string }[]> = {}): void {
  const wrong = cases
    .map(([n, want]) => {
      const r = release(n);
      return { n, want, got: landsOn(r, want, former) };
    })
    .filter((c) => c.got.length !== c.want.length);
  check(name, wrong.length === 0, wrong.map((c) => `${c.n} on ${c.got.join("+") || "none"}, wanted ${c.want.join("+")}`).join("; "));
}
function expectOff(name: string, cases: [number: string, tickers: string[], day?: string][]): void {
  const wrong = cases
    .map(([n, tickers, day]) => ({ n, got: landsOn(release(n, day), tickers) }))
    .filter((c) => c.got.length);
  check(name, wrong.length === 0, wrong.map((c) => `${c.n} on ${c.got.join("+")}`).join("; "));
}

// J P MORGAN CHASE & CO was JPMorgan's name in EDGAR until 2011-10-06 (its rename events)
const JPM_FORMER = { JPM: [{ name: "J P MORGAN CHASE & CO", until: "2011-10-06" }] };

interface Db {
  years: Map<number, { complete: boolean; stale: boolean; pages: number; releases: number; count?: number | null }>;
  releases: Map<string, SecRelease>;
  listed: string | null;
  renames: { until: string; body: string }[];
  /** a statement that writes one row twice fails, as Postgres's ON CONFLICT does */
  doubled: number;
}

/** Just enough of a pg client for the walk's and the matching step's own statements. */
function fakeDb(db: Db): PoolClient {
  return {
    query: async (sql: string, params: unknown[] = []) => {
      const s = sql.trim();
      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(s)) return { rows: [] };
      if (/^SELECT year, complete/.test(s)) return { rows: [...db.years].map(([year, y]) => ({ year, complete: y.complete, stale: y.stale, listed: y.count ?? null, releases: y.releases })) };
      if (/^UPDATE sec_press_years SET listed = \$2 WHERE year = \$1$/.test(s)) {
        const [year, count] = params as [number, number];
        db.years.get(year)!.count = count;
        return { rows: [], rowCount: 1 };
      }
      if (/^SELECT release_no, released_on::text AS day FROM sec_press_releases WHERE/.test(s)) {
        const [from, to] = params as [string, string];
        return { rows: [...db.releases.values()].filter((r) => r.day >= from && r.day < to).map((r) => ({ release_no: r.number, day: r.day })) };
      }
      if (/^INSERT INTO sec_press_releases/.test(s)) {
        const [numbers, days, titles, urls] = params as string[][];
        const keys = numbers.map((n, i) => releaseKey({ number: n, day: days[i] }));
        if (new Set(keys).size !== keys.length) {
          db.doubled++;
          throw new Error("ON CONFLICT DO UPDATE command cannot affect row a second time");
        }
        let changed = 0;
        keys.forEach((k, i) => {
          const was = db.releases.get(k);
          if (!was || was.title !== titles[i] || was.url !== urls[i]) changed++;
          db.releases.set(k, { number: numbers[i], day: days[i], title: titles[i], url: urls[i] });
        });
        return { rows: [], rowCount: changed };
      }
      if (/^INSERT INTO sec_press_years/.test(s)) {
        const [year, complete, pages, releases, count] = params as [number, boolean, number, number, number | null];
        db.years.set(year, { complete, stale: false, pages, releases, count });
        return { rows: [] };
      }
      if (/^SELECT release_no, released_on::text AS day, title, url FROM sec_press_releases ORDER BY/.test(s)) {
        return { rows: [...db.releases.values()].sort((a, b) => a.day.localeCompare(b.day)).map((r) => ({ release_no: r.number, day: r.day, title: r.title, url: r.url })) };
      }
      if (/FROM prices/.test(s)) return { rows: [{ listed: db.listed }] };
      if (/FROM events e/.test(s)) return { rows: db.renames };
      throw new Error(`unexpected query: ${s.slice(0, 80)}`);
    },
  } as unknown as PoolClient;
}
const freshDb = (listed: string | null = "1972-06-01"): Db => ({ years: new Map(), releases: new Map(), listed, renames: [], doubled: 0 });

/**
 * A stand-in SEC: `count(year)` releases a year, newest first, 25 a page, each numbered as the SEC
 * numbers them. Every page asked is kept; `refuse` answers one page as the SEC answers a throttle.
 */
function standIn(count: (year: number) => number, refuse?: { year: number; page: number; status: number }) {
  const asked: string[] = [];
  const fetchPage = async (year: number, page: number): Promise<ListingPage> => {
    asked.push(`${year}:${page}`);
    if (refuse && refuse.year === year && refuse.page === page) return { releases: [], outcome: "throttled", httpStatus: refuse.status };
    const n = count(year);
    const all = Array.from({ length: n }, (_, i) => {
      const num = n - i;
      // a release's day depends on its number alone, so a later read sees the same release
      const day = `${year}-${String(1 + ((num - 1) % 12)).padStart(2, "0")}-01`;
      return { number: `${year}-${num}`, day, title: `Release ${num} of ${year}`, url: `https://www.sec.gov/newsroom/press-releases/${year}-${num}` };
    });
    return { releases: all.slice(page * 25, page * 25 + 25), outcome: "ok", httpStatus: 200 };
  };
  return { asked, fetchPage };
}
const TODAY = "2026-10-29";

(async () => {
  console.log("\nThe listing, as the SEC serves it");
  const page = parseListing(fixture.listing);
  check("a page of the year listing holds 25 releases, each with its number, day, headline and link",
    page.length === 25 && page[0].number === "2010-258" && page[0].day === "2010-12-27" &&
      page[0].title === "SEC Charges Alcatel-Lucent with FCPA Violations" &&
      page[0].url === "https://www.sec.gov/newsroom/press-releases/2010-258-sec-charges-alcatel-lucent-fcpa-violations",
    JSON.stringify(page[0]));
  const late = parseListing(fixture.late);
  check("a release's day is the day in Washington: 2011-12-23T00:01:00Z is Dec. 22, 2011, as the page shows",
    late.length === 1 && late[0].day === "2011-12-22" && easternDay("2011-12-23T00:01:00Z") === "2011-12-22" &&
      easternDay("2010-12-27T07:00:00Z") === "2010-12-27" && easternDay("not a time") === null, JSON.stringify(late[0]));
  check("a page past a year's last holds none", parseListing(fixture.empty).length === 0);
  const realFetch = globalThis.fetch;
  const answers: Response[] = [];
  const asked: { url: URL; ua: string }[] = [];
  globalThis.fetch = (async (u: RequestInfo | URL, init?: RequestInit) => {
    asked.push({ url: new URL(String(u)), ua: new Headers(init?.headers).get("user-agent") ?? "" });
    return answers.shift()!;
  }) as typeof fetch;
  const contactWas = process.env.NEWS_CHARTS_CONTACT;
  process.env.NEWS_CHARTS_CONTACT = "builds@example.org";
  try {
    answers.push(new Response(fixture.listing, { status: 200 }));
    const ok = await fetchListingPage(2010, 0);
    check("a page is asked by year, every month and page number, with the project's contact User-Agent",
      ok.outcome === "ok" && ok.releases.length === 25 && asked[0].url.origin + asked[0].url.pathname === "https://www.sec.gov/newsroom/press-releases" &&
        asked[0].url.searchParams.get("year") === "2010" && asked[0].url.searchParams.get("month") === "All" &&
        asked[0].url.searchParams.get("page") === "0" && asked[0].ua === "News Charts Research builds@example.org", asked[0].url.search);
    answers.push(new Response(fixture.empty, { status: 200 }));
    const none = await fetchListingPage(2010, 11);
    check("  …a page past the last answers with none, which is not a failure", none.outcome === "ok" && none.releases.length === 0);
    answers.push(new Response("Request Rate Threshold Exceeded", { status: 200 }));
    answers.push(new Response("", { status: 403 }), new Response("", { status: 503 }), new Response("", { status: 500 }));
    const notAListing = await fetchListingPage(2010, 0);
    const [r403, r503, r500] = [await fetchListingPage(2010, 0), await fetchListingPage(2010, 0), await fetchListingPage(2010, 0)];
    check("  …a page without the listing is an error, not an empty year; 403 and 503 are the SEC refusing us",
      notAListing.outcome === "error" && r403.outcome === "throttled" && r503.outcome === "throttled" && r500.outcome === "error",
      [notAListing.outcome, r403.outcome, r503.outcome, r500.outcome].join(" "));
  } finally {
    globalThis.fetch = realFetch;
    if (contactWas === undefined) delete process.env.NEWS_CHARTS_CONTACT;
    else process.env.NEWS_CHARTS_CONTACT = contactWas;
  }

  console.log("\nThe party: the SEC charges, sues or sanctions the company, or it pays or settles");
  expectOn("Goldman's 2010 charge and its settlement land on GS", [["2010-59", ["GS"]], ["2010-123", ["GS"]]]);
  expectOn("  …and a release suing two companies on both", [["2005-10", ["MS", "GS"]]]);
  expectOn("the 2003 Enron release lands on Citigroup, and on JPMorgan by the name it then filed under",
    [["2003-87", ["C", "JPM"]]], JPM_FORMER);
  check("  …which counts until the day it stopped: in 2013 J P MORGAN CHASE is not JPMorgan's name",
    namesOf("JPM", JPM_FORMER.JPM)(2003).some((n) => /^J P MORGAN CHASE$/i.test(n)) &&
      !namesOf("JPM", JPM_FORMER.JPM)(2013).some((n) => /^J P MORGAN CHASE$/i.test(n)) &&
      landsOn(release("2003-87"), ["JPM"]).length === 0,
    namesOf("JPM", JPM_FORMER.JPM)(2003).join(" | "));
  expectOn("the SEC's own verbs: it, or its Division of Enforcement, charges, sues, brings charges or proceedings against, or agrees with the company",
    [["2003-180", ["CM"]], ["2010-133", ["GE"]], ["2010-21", ["STT"]], ["2010-40", ["IOSP"]], ["2000-186", ["MSTR"]],
      ["2009-177", ["BAC"]], ["2010-131", ["DELL"]], ["2013-65", ["RL"]], ["2005-52", ["AIG"]], ["2004-140", ["RJF"]]]);
  expectOn("  …with others named before it, or as a clause of its own, or in capitals",
    [["2016-37", ["WFC"]], ["2003-111", ["AIG"]], ["2003-159", ["MS"]], ["2018-226", ["TSLA"]], ["2005-58", ["KO"]], ["2013-187", ["JPM"]]]);

  console.log("\nA release that only mentions the company is not its");
  expectOff("a former executive, two individuals in its scheme, a trader in its stock, a word in its name",
    [["2010-252", ["CRI"]], ["2010-141", ["IOSP"]], ["2013-244", ["CRI"]], ["2010-103", ["TGT"]], ["99-57", ["IBM"]], ["2022-123", ["PFE"], "2023-06-29"]]);
  expectOff("a city is not City Holding, a crypto platform not The Crypto Company",
    [["99-119", ["CHCO"]], ["2006-191", ["CHCO"]], ["2023-64", ["CRCW"]], ["2024-111", ["CRCW"]]]);
  expectOff("the SEC's own Division of Risk, Strategy, and Financial Innovation is not Strategy Inc.",
    [["2009-199", ["MSTR"]], ["2009-205", ["MSTR"]]]);
  expectOff("a company's board member, or its former CEO, is not the company; nor is another company's last word",
    [["2011-53", ["PG", "GS"]], ["2007-20", ["TTWO"]], ["2003-184", ["UVV"]]]);
  expectOff("a name three listed banks share names none of them, nor one a dual listing shares",
    [["2007-161", ["FBP", "FBNC", "FNLC"]], ["2023-46", ["RIO", "RTNTF"]]]);
  check("  …where the Justice Department rule, run on SEC headlines, would have kept the division and the board member (the city it refuses too since batch 94)",
    !releaseNamesParty(release("99-119").title, namesOf("CHCO")(1999)) && releaseNamesParty(release("2009-199").title, namesOf("MSTR")(2009)) &&
      releaseNamesParty(release("2011-53").title, namesOf("PG")(2011)));

  /**
   * The 2026-10-30 audit's findings 1 and 2 (batch 78). Prudential plc's everyday name is
   * "PRUDENTIAL", and the SEC's "Prudential to Pay $600 Million" is Prudential Financial's
   * settlement — the release names "a … subsidiary of Prudential Financial, Inc." — so a short name
   * a bigger listed company's name begins with names neither on its own. And a headline joining
   * two parties with a comma names the first as well as the second.
   */
  console.log("\nA short name a bigger company's name begins with, and two parties a comma joins (batch 78)");
  expectOff("Prudential Financial's 2006 settlement is not Prudential plc's, nor UBS's 2009 one the record of UBS AG's notes",
    [["2006-145", ["PUK", "PRU"]], ["2009-29", ["AMUB"]]]);
  check("  …because \"Prudential\" begins Prudential Financial's name and \"UBS\" UBS Group's, both ranked above",
    outrankingNameFor("PRUDENTIAL") === "prudential financial" && outrankingNameFor("UBS") === "ubs group",
    `${outrankingNameFor("PRUDENTIAL")} | ${outrankingNameFor("UBS")}`);
  check("  …while \"Apple\" stays Apple's, above Apple Hospitality REIT, and \"Goldman Sachs\" Goldman's",
    outrankingNameFor("APPLE") === null && outrankingNameFor("Goldman Sachs") === null && outrankingNameFor("GOLDMAN SACHS GROUP") === null);
  check("  …and the short name still counts with a legal word of its own (constructed headlines)",
    secReleaseNamesParty("Crown Holdings to Pay $10 Million to Settle SEC Charges", ["CROWN"]) &&
      !secReleaseNamesParty("Crown to Pay $10 Million to Settle SEC Charges", ["CROWN"]) &&
      releaseNamesParty("Southern Company Agrees to Pay $10 Million", ["SOUTHERN"]) && !releaseNamesParty("Southern Agrees to Pay $10 Million", ["SOUTHERN"]));
  check("  …and the Justice Department rule refuses Prudential plc the same headline",
    !releaseNamesParty(release("2006-145").title, namesOf("PUK")(2006)));
  expectOn("  …while Goldman's, Morgan Stanley's and BlackRock's still land", [["2010-59", ["GS"]], ["2003-159", ["MS"]], ["2015-71", ["BLK"]]]);
  expectOn("two parties a comma joins are both charged: Morgan Stanley with Citigroup, Barclays, BOK Financial, Freddie Mac",
    [["2017-30", ["MS", "C"]], ["2016-16", ["BCS"]], ["2016-182", ["BOKF"]], ["2007-205", ["FMCC"]]]);
  check("  …in the Justice Department rule too, which shares the subject test",
    releaseNamesParty(release("2017-30").title, namesOf("MS")(2017)) && releaseNamesParty(release("2016-16").title, namesOf("BCS")(2016)));

  // batch 81, the 2026-11-01 proposal 3: Deutsche Bank's everyday name kept "AKTIENGESELLSCHAFT",
  // so no release named it; under "DEUTSCHE BANK" 7 of the stored 6,894 do
  expectOn("Deutsche Bank's 2015 charge lands on DB, and the 2009 auction-rate settlement beside Bank of America's and RBC's",
    [["2015-99", ["DB"]], ["2009-127", ["DB", "BAC", "RY"]]]);

  /**
   * Batch 82, the 2026-11-01 proposal 4, approved by the owner on 2026-11-01: the SEC charges a
   * bank's securities units by their own names, which counted for no company; now each counts
   * while the company owned it, each day from the company's filings (lib/releaseNames.ts). With
   * the owner's three calls: "J.P. Morgan" and "JPMorgan" are JPMorgan Chase's, a bare "UBS" UBS
   * Group's and Credit Suisse its own from 2023-06-12, and the banks' notes records take none.
   * On the code before this batch none of it runs: the map did not exist.
   */
  console.log("\nThe banks as the SEC names them: their units while they owned them (batch 82)");
  expectPages("Bank of America's own units: Banc of America Securities, Investment Services, and the three charged together in 2005",
    [["2010-239", "BAC", true], ["2004-29", "BAC", true], ["2008-72", "BAC", true], ["2005-16", "BAC", true]]);
  expectPages("  …Merrill Lynch from its purchase on 2009-01-01: its 2009, 2016 and 2023 charges, never its Enron charge of 2003 or its auction-rate settlement of 2008",
    [["2009-13", "BAC", true], ["2016-128", "BAC", true], ["2023-128", "BAC", true], ["2003-32", "BAC", false], ["2008-181", "BAC", false]]);
  expectPages("Wells Fargo's Wachovia from 2008-12-31, never its settlements of 2004 and 2008",
    [["2011-257", "WFC", true], ["2004-152", "WFC", false], ["2008-176", "WFC", false]]);
  expectPages("JPMorgan's \"J.P. Morgan\" and \"JPMorgan\", the owner's call, with J.P. Morgan Securities: 2003 to 2024",
    [["2003-129", "JPM", true], ["2011-131", "JPM", true], ["2018-306", "JPM", true], ["2020-233", "JPM", true], ["2024-7", "JPM", true]]);
  expectPages("  …never Bear Stearns before 2008-05-31, nor two of its traders",
    [["2006-38", "JPM", false], ["99-94", "JPM", false], ["2013-154", "JPM", false]]);
  const jpmBefore = { number: "x-1", day: "2000-12-30", title: "J.P. Morgan to Pay $1 Million to Settle SEC Charges", url: "https://www.sec.gov/x-1" };
  check("  …nor \"J.P. Morgan\" before J.P. Morgan & Co. merged into the company's record on 2000-12-31 (a constructed headline)",
    !pageTakes(jpmBefore, "JPM") && pageTakes({ ...jpmBefore, day: "2000-12-31" }, "JPM"));
  expectPages("Citigroup's Smith Barney until it went into Morgan Stanley's venture on 2009-05-31, and its Global Markets unit; the venture's charges Morgan Stanley's",
    [["97-78", "C", true], ["2015-171", "C", true], ["2023-165", "C", true], ["2020-109", "MS", true], ["2022-168", "MS", true], ["2020-109", "C", false]]);
  expectPages("Regions' Morgan Keegan, bought 2001-03-30 and sold 2012-04-02: its three cases of 2009 to 2011",
    [["2009-166", "RF", true], ["2010-53", "RF", true], ["2011-132", "RF", true]]);
  expectPages("UBS Group's bare \"UBS\", the owner's call: its 2009 settlement, its charges of 2011 to 2022, and the one with JPMorgan",
    [["2009-29", "UBS", true], ["2011-105", "UBS", true], ["2016-197", "UBS", true], ["2022-131", "UBS", true], ["2022-131", "JPM", true], ["2011-60", "UBS", false]]);
  check("  …which UBS AG's everyday name is, ranked below UBS Group and a UBS fund: neither outranks the company asking",
    outrankingNameFor("UBS", ["UBS Group", "UBS"]) === null && outrankingNameFor("UBS", ["UBS"]) === "ubs group" &&
      outrankingNameFor("UBS") === "ubs group" && outrankingNameFor("PRUDENTIAL", ["PRUDENTIAL"]) === "prudential financial",
    `${outrankingNameFor("UBS", ["UBS Group", "UBS"])} | ${outrankingNameFor("UBS", ["UBS"])}`);
  const csAfter = { number: "x-2", day: "2023-06-12", title: "Credit Suisse Agrees to Pay $10 Million to Settle SEC Charges", url: "https://www.sec.gov/x-2" };
  check("Credit Suisse's releases are UBS Group's from its purchase on 2023-06-12 (a constructed headline), never before",
    pageTakes(csAfter, "UBS") && !pageTakes({ ...csAfter, day: "2023-06-11" }, "UBS") && !pageTakes(storedRelease("2021-213"), "UBS"));
  expectPages("the banks' notes records, Credit Suisse AG's and UBS AG's, take none: the owner's call, as batch 74 kept the Board's actions off them",
    [["2014-39", "GLDI", false], ["2021-213", "GLDI", false], ["2012-233", "GLDI", false], ["2012-233", "JPM", true], ["2009-29", "AMUB", false]]);
  check("  …where before this batch GLDI's page took Credit Suisse's own",
    secPressEvents([storedRelease("2014-39"), storedRelease("2021-213")], namesOf("GLDI")).length === 2);
  check("the map: twelve banks (seven in batch 82, Deutsche Bank, State Street, BNY and Barclays in batch 83, Goldman Sachs in batch 85), batch 88's 34 companies' units, batch 89's 22 more, batch 90's 4, batch 93's 3, batch 94's Walmart, batch 121's 74 companies' operating units and batch 128's 13 drug and device makers' (11 more companies; CVS's and Pfizer's join their operating units), each unit with its reason, each day well formed, and the three notes records mapped to none",
    Object.keys(RELEASE_NAMES).length === 161 && Object.keys(NOTES_RECORDS).length === 3 &&
      Object.values(RELEASE_NAMES).every((b) => b.names.every((n) => n.why.length > 20 && [n.from, n.to].every((d) => d === undefined || /^\d{4}-\d{2}-\d{2}$/.test(d)))) &&
      Object.keys(NOTES_RECORDS).every((cik) => !(cik in RELEASE_NAMES)) &&
      Object.entries(RELEASE_NAMES).every(([cik, b]) => companies.some(([c, t]) => c === Number(cik) && t === b.ticker)) &&
      Object.entries(NOTES_RECORDS).every(([cik, b]) => companies.some(([c, t]) => c === Number(cik) && t === b.ticker)));
  const bacDb = freshDb("1990-01-02");
  for (const n of ["2010-239", "2003-32", "2016-128"]) bacDb.releases.set(releaseKey(storedRelease(n)), storedRelease(n));
  const bacPlan = { edgarName: "BANK OF AMERICA CORP /DE/", alsoKnownAs: newsNamesFor(70858) };
  const bacWith = await secPressFor(fakeDb(bacDb), 1, { ...bacPlan, cik: 70858 }, { due: 0, read: 0, pages: 0, releases: 0 });
  const bacWithout = await secPressFor(fakeDb(bacDb), 1, bacPlan, { due: 0, read: 0, pages: 0, releases: 0 });
  const gldiKept = await secPressFor(fakeDb(bacDb), 1, { edgarName: "CREDIT SUISSE AG", alsoKnownAs: [], cik: 1053092 }, { due: 0, read: 0, pages: 0, releases: 0 });
  check("a company's ingest reads them by its CIK: Bank of America's page takes the 2016 and 2010 charges, not the 2003 one",
    bacWith.events.map((e) => e.date).join(",") === "2016-06-23,2010-12-07" && bacWithout.events.length === 0 &&
      gldiKept.outcome === "empty" && /notes record/.test(gldiKept.detail ?? ""),
    `${bacWith.events.map((e) => e.date).join(",")} · ${gldiKept.detail}`);

  console.log("\nEvery stored release against every listed company (batch 82)");
  const t0 = Date.now();
  const replay = replayListing();
  const entries = [...replay.values()].reduce((n, l) => n + l.length, 0);
  // batch 83 added the units the SEC's case captions name in full, and three more releases land:
  // UBS's units' auction-rate settlement of 2008, Morgan Stanley Investment Management's charge of
  // 2011 and Barclays Capital's of 2014
  // batch 89's TD Bank adds "SEC Charges TD Bank and Former Executive for Roles in Rothstein Ponzi
  // Scheme in South Florida" (2013-09-23)
  check("the 6,897 stored releases give 268 page entries on 131 companies, 60 more than before batch 82's names (4 of them batch 88's units, 1 batch 89's, 2 batch 100's \"AG\": Daimler's bribery charges of 2010, Novartis's of 2020, 1 batch 121's operating units: John Deere's bribery charge of 2024, 1 batch 128's drug makers' units: Biomet's FCPA charge of 2017 on Zimmer Biomet), as replayed in full",
    stored.length === 6897 && entries === 268 && replay.size === 131 && (replay.get("ZBH") ?? []).some((k) => k.endsWith("@2017-01-12")) && (replay.get("DE") ?? []).some((k) => k.endsWith("@2024-09-10")) && (replay.get("TD") ?? []).length === 1 && (replay.get("NVS") ?? []).includes("2020-144@2020-06-25") && (replay.get("MBGAF") ?? []).includes("2010-51@2010-04-01"), `${stored.length} releases → ${entries} entries on ${replay.size} companies in ${Date.now() - t0} ms`);
  // batch 85 added Citibank's settlement of 2001, J.P. Morgan Chase's of 2003 and J. P. Morgan
  // Securities' charge of 2011 (the initials as the SEC spaces them), and Goldman Sachs Asset Management's of 2022
  const pinned: Record<string, number> = { BAC: 28, MS: 18, C: 14, UBS: 12, JPM: 13, WFC: 10, GS: 9, DB: 7, BCS: 4, RF: 4, BEN: 2, IVZ: 1 };
  const got = Object.fromEntries(Object.keys(pinned).map((t) => [t, replay.get(t)?.length ?? 0]));
  check("  …Bank of America 28 (8 before), Morgan Stanley 18, Citigroup 14, UBS Group 12 (none), JPMorgan 13, Wells Fargo 10, Goldman Sachs 9, Barclays 4, Regions 4 (\"SEC Charges Regions Bank\", 2009, batch 88), Franklin 2 and Invesco 1 by their advisers, and the notes records none",
    Object.entries(pinned).every(([t, n]) => got[t] === n) && !replay.has("GLDI") && !replay.has("AMUB") && !replay.has("ATMP"), JSON.stringify(got));

  console.log("\nAs timeline events");
  const gs = secPressEvents(fixture.releases, namesOf("GS"));
  check("Goldman's releases, newest first, as regulation events credited to the SEC and linked to sec.gov",
    gs.map((e) => e.date).join(",") === "2010-07-15,2010-04-16,2005-01-25" && gs.every((e) => e.type === "regulation" && e.sourceKey === "sec_press" && e.url?.startsWith("https://www.sec.gov/newsroom/press-releases/")) &&
      gs[0].source === "SEC press release 2010-123" && gs[0].externalId === "2010-123@2010-07-15" && gs[0].dedupBasis === "sec-press:2010-123@2010-07-15" && gs[0].occurredAt === undefined,
    gs.map((e) => `${e.date} ${e.externalId}`).join(" · "));
  check("  …none before the company's first price", secPressEvents(fixture.releases, namesOf("GS"), "2006-01-01").map((e) => e.date).join(",") === "2010-07-15,2010-04-16");
  // the saved listing holds no release naming either marked unit before its company listed, so a
  // headline in the SEC's own wording stands in for one (batch 90)
  const early: SecRelease = { number: "2001-1", day: "2001-06-01", title: "SEC Charges Prudential Securities Incorporated With Fraud", url: "https://www.sec.gov/news/press/2001-1.txt" };
  const pru = cikOf("PRU");
  check("  …but a unit the owner's calls mark counts before it: Prudential Securities' release of 2001, before PRU's first price of 2001-12-13, through the mark alone",
    secPressEvents([early], namesOf("PRU"), "2001-12-13", (day) => releaseNamesOn(pru, day), (day) => releaseNamesBefore(pru, day)).length === 1 &&
      secPressEvents([early], namesOf("PRU"), "2001-12-13", (day) => releaseNamesOn(pru, day)).length === 0 &&
      secPressEvents([{ ...early, title: "SEC Charges Prudential Financial, Inc. With Fraud" }], namesOf("PRU"), "2001-12-13", (day) => releaseNamesOn(pru, day), (day) => releaseNamesBefore(pru, day)).length === 0);
  const twice = [release("2022-123", "2022-07-18"), release("2022-123", "2023-06-29")];
  check("a number the SEC gave twice is two releases, told apart by their days",
    new Set(twice.map(releaseKey)).size === 2 && releaseKey(twice[1]) === "2022-123@2023-06-29");
  check("  …and a link off sec.gov is never kept",
    secPressEvents([{ ...release("2010-59"), url: "https://example.com/2010-59" }], namesOf("GS")).length === 0);

  console.log("\nThe year walk: each year read once for every company");
  const big = (y: number) => (y === 2020 ? 344 : y === 2010 ? 258 : y === 2025 ? 150 : 100 + (y % 7));
  const db = freshDb();
  const sec = standIn(big);
  const first = await walkSecPress(fakeDb(db), { today: TODAY, budget: { left: 10_000 }, gapMs: 0, fetchPage: sec.fetchPage });
  const years = 2026 - SEC_PRESS_FROM + 1;
  check(`a first walk reads all ${years} years from ${SEC_PRESS_FROM}, the year still running first`,
    first.due === years && first.read === years && sec.asked[0] === "2026:0" && sec.asked.some((a) => a === "1997:0") && !sec.asked.some((a) => a.startsWith("1996")),
    `${first.read} of ${first.due}, ${first.pages} pages`);
  check("  …every page of each, until a page holds fewer than 25 (2025's 150 take a seventh, empty one)",
    sec.asked.filter((a) => a.startsWith("2020:")).length === 14 && sec.asked.filter((a) => a.startsWith("2025:")).length === 7 &&
      db.years.get(2020)?.pages === 14 && db.years.get(2020)?.releases === 344, `2020: ${sec.asked.filter((a) => a.startsWith("2020:")).length} pages`);
  check("  …a year that is over marked read in full, the current one not", db.years.get(2025)?.complete === true && db.years.get(1997)?.complete === true && db.years.get(2026)?.complete === false);
  check("  …and every release stored", db.releases.size === [...Array(years)].reduce((n, _, i) => n + big(SEC_PRESS_FROM + i), 0) && first.releases === db.releases.size, String(db.releases.size));
  const again = standIn(big);
  const second = await walkSecPress(fakeDb(db), { today: TODAY, budget: { left: 10_000 }, gapMs: 0, fetchPage: again.fetchPage });
  check("a closed year is not asked twice, nor the current year inside its day", second.due === 0 && again.asked.length === 0);
  db.years.get(2026)!.stale = true;
  const daily = standIn((y) => (y === 2026 ? big(2026) + 3 : big(y)));
  const next = await walkSecPress(fakeDb(db), { today: TODAY, budget: { left: 10_000 }, gapMs: 0, fetchPage: daily.fetchPage });
  check("a day later the current year is read down to the first page holding a release already kept: one page",
    next.due === 1 && daily.asked.join(",") === "2026:0" && next.releases === 3, `${daily.asked.join(",")} → ${next.releases} new`);
  const closed = freshDb();
  closed.years.set(2025, { complete: false, stale: false, pages: 1, releases: 25 });
  for (let y = SEC_PRESS_FROM; y < 2025; y++) closed.years.set(y, { complete: true, stale: false, pages: 1, releases: 1 });
  closed.years.set(2026, { complete: false, stale: false, pages: 1, releases: 1 });
  const closing = standIn(big);
  await walkSecPress(fakeDb(closed), { today: TODAY, budget: { left: 10_000 }, gapMs: 0, fetchPage: closing.fetchPage });
  check("a year last read while it was running is read again in full once it is over",
    closing.asked.filter((a) => a.startsWith("2025:")).length === 7 && closed.years.get(2025)?.complete === true, closing.asked.join(","));

  console.log("\nBounded, and stopped by a refusal");
  check(`at most ${PAGES_PER_RUN} pages a process, ${GAP_MS} ms apart, a year begun only with ${YEAR_PAGES} pages left`,
    PAGES_PER_RUN === 120 && GAP_MS === 1_000 && YEAR_PAGES === 20);
  const capped = freshDb();
  const budget = { left: 45 };
  const short = standIn(big);
  const part = await walkSecPress(fakeDb(capped), { today: TODAY, budget, gapMs: 0, fetchPage: short.fetchPage });
  check("  …so a run with 45 pages reads years whole while 20 are left, and stops rather than begin one it might cut in half",
    part.read === 5 && part.stopped === "this run's pages are spent" && capped.years.size === 5 && budget.left === 18 && short.asked.length === 27,
    `${part.read} years, ${short.asked.length} pages, ${budget.left} left`);
  const refused = freshDb();
  const throttled = standIn(big, { year: 2024, page: 2, status: 403 });
  const stopped = await walkSecPress(fakeDb(refused), { today: TODAY, budget: { left: 10_000 }, gapMs: 0, fetchPage: throttled.fetchPage });
  check("a refused page stops the walk, says where, and keeps nothing of that year",
    stopped.stopped === "throttled" && stopped.failure?.outcome === "throttled" && stopped.failure.httpStatus === 403 &&
      stopped.failure.detail === "2024 page 3" && !refused.years.has(2024) && refused.years.has(2025) &&
      ![...refused.releases.values()].some((r) => r.day.startsWith("2024")) && throttled.asked.at(-1) === "2024:2",
    JSON.stringify(stopped.failure));
  const doubled = freshDb();
  const repeat = async (year: number, p: number): Promise<ListingPage> => {
    const r = { number: `${year}-198`, day: `${year}-12-04`, title: "Jefferies Settles SEC Charges Involving Illegal Gifts and Entertainment", url: `https://www.sec.gov/newsroom/press-releases/${year}-198` };
    return { releases: p === 0 ? [r, r] : [], outcome: "ok", httpStatus: 200 };
  };
  const once = await walkSecPress(fakeDb(doubled), { today: TODAY, budget: { left: 10_000 }, gapMs: 0, fetchPage: repeat });
  check("a release the listing shows twice (2006-198) is stored once, without failing the year",
    doubled.doubled === 0 && once.read === years && doubled.releases.size === years && once.releases === years);
  // the 2026-11-01 audit's finding 3 (batch 85): the listing sorts by day alone, so 2006-198 showed
  // twice where a page ended and 2006-200, of the same day, never; December 2006 alone is one page
  const tie = (year: number, p: number, month?: number): Promise<ListingPage> => {
    const all = Array.from({ length: 30 }, (_, i) => ({ number: `${year}-${200 - i}`, day: `${year}-12-04`, title: `Release ${200 - i}`, url: `https://www.sec.gov/newsroom/press-releases/${year}-${200 - i}` }));
    if (year !== 2006) return Promise.resolve({ releases: [], total: 0, outcome: "ok" as const, httpStatus: 200 });
    const pages = month ? [all.slice(0, 25), all.slice(25)] : [all.slice(0, 25), [all[24], ...all.slice(26)]];
    return Promise.resolve({ releases: pages[p] ?? [], total: 30, outcome: "ok" as const, httpStatus: 200 });
  };
  const tiedDb = freshDb();
  const tiedAsked: string[] = [];
  const tied = await walkSecPress(fakeDb(tiedDb), { today: TODAY, budget: { left: 10_000 }, gapMs: 0, fetchPage: (y, p, m) => (tiedAsked.push(`${y}${m ? `-${m}` : ""}:${p}`), tie(y, p, m)) });
  check("a year whose pages show a release twice and another never reads that release's month alone, and keeps all 30 (batch 85)",
    tiedAsked.filter((a) => a.startsWith("2006")).join(",") === "2006:0,2006:1,2006-12:0,2006-12:1" && tiedDb.years.get(2006)?.releases === 30 &&
      tiedDb.years.get(2006)?.count === 30 && [...tiedDb.releases.keys()].some((k) => k.startsWith("2006-175")) && !tied.short,
    tiedAsked.filter((a) => a.startsWith("2006")).join(","));
  const oldDb = freshDb();
  for (let y = 1997; y <= 2025; y++) oldDb.years.set(y, { complete: true, stale: false, pages: 1, releases: y === 2006 ? 29 : 0, count: null });
  const recountAsked: string[] = [];
  await walkSecPress(fakeDb(oldDb), { today: "2026-10-29", budget: { left: 10_000 }, gapMs: 0, fetchPage: (y, p, m) => (recountAsked.push(`${y}${m ? `-${m}` : ""}:${p}`), tie(y, p, m)) });
  check("  …and a year read before batch 85 is asked its first page once: kept as it is where its count is reached, read again with its month where not",
    recountAsked.filter((a) => a.startsWith("2005")).join(",") === "2005:0" && oldDb.years.get(2005)?.count === 0 &&
      recountAsked.filter((a) => a.startsWith("2006")).length === 4 && oldDb.years.get(2006)?.releases === 30, recountAsked.slice(0, 6).join(","));
  const endless = async (): Promise<ListingPage> => ({ releases: Array.from({ length: 25 }, (_, i) => ({ number: `x-${Math.random()}-${i}`, day: "2026-01-02", title: "t", url: "https://www.sec.gov/x" })), outcome: "ok", httpStatus: 200 });
  const runaway = freshDb();
  const long = await walkSecPress(fakeDb(runaway), { today: TODAY, budget: { left: 10_000 }, gapMs: 0, fetchPage: endless });
  check("a year longer than any measured is an error, not a year marked read",
    long.failure?.outcome === "error" && /more than 20 pages/.test(long.failure.detail ?? "") && !runaway.years.size && long.pages === YEAR_PAGES);

  console.log("\nA company's releases, from what is kept");
  const kept = freshDb("1999-01-04");
  for (const r of fixture.releases) kept.releases.set(releaseKey(r), r);
  kept.renames = [{ until: "2011-10-06", body: "EDGAR's company record lists J P MORGAN CHASE & CO as a former name of this filer, in use until this day." }];
  const ok: PressWalk = { due: 0, read: 0, pages: 0, releases: 0 };
  const jpmPlan = { edgarName: "JPMORGAN CHASE & CO", alsoKnownAs: newsNamesFor(19617) };
  const jpm = await secPressFor(fakeDb(kept), 1, jpmPlan, ok);
  check("JPMorgan's page gets the 2003 release under its stored former name, and its own 2013 settlement",
    jpm.outcome === "ok" && jpm.events.map((e) => e.date).join(",") === "2013-09-19,2003-07-28", jpm.events.map((e) => `${e.date} ${e.title.slice(0, 40)}`).join(" · "));
  const gsKept = await secPressFor(fakeDb({ ...kept, listed: "2006-01-03" }), 1, { edgarName: "GOLDMAN SACHS GROUP INC", alsoKnownAs: newsNamesFor(886982) }, ok);
  check("  …from the company's first price on", gsKept.events.map((e) => e.date).join(",") === "2010-07-15,2010-04-16");
  const unpriced = await secPressFor(fakeDb({ ...kept, listed: null }), 1, jpmPlan, ok);
  // …not "empty", which counts as asked for a day: the next run asks again (batch 85, the 2026-11-01 audit's finding 5)
  check("  …and none for a company with no prices yet, recorded as a failure so the next run asks again", unpriced.outcome === "error" && unpriced.events.length === 0 && /^no prices to start from/.test(unpriced.detail ?? ""));
  const refusedWalk: PressWalk = { ...ok, stopped: "throttled", failure: { outcome: "throttled", httpStatus: 403, detail: "2024 page 3" } };
  const stillKept = await secPressFor(fakeDb(kept), 1, jpmPlan, refusedWalk);
  check("a walk the SEC refused still gives the company what is kept, and reports the refusal for the back-off",
    stillKept.outcome === "throttled" && stillKept.httpStatus === 403 && stillKept.events.length === 2);
  check("  …the kept releases come back oldest first", (await storedSecReleases(fakeDb(kept)))[0].day === "1999-05-26");

  console.log("\nRegistered, licensed, wired");
  const src = SOURCES.find((s) => s.key === "sec_press");
  check("the source is registered as public information the SEC lets anyone copy, cleared for commercial use, with the day it was read",
    src?.id === 27 && src.license === "public domain" && src.commercialOk && src.reviewedOn === "2026-10-29" && src.attribution === "U.S. Securities and Exchange Commission" &&
      /sec\.gov\/about\/privacy-information/.test(read("lib/ingest/store.ts")), JSON.stringify(src));
  check("  …asked once a day per company, its requests counted against sec.gov's 10 a second",
    SOURCE_TTL_MINUTES.sec_press === 1440 && QUOTAS.sec_press?.perSecond === 10);
  const tesla = { kind: "company" as const, displayName: "Tesla, Inc.", ticker: "TSLA" };
  const musk = { eventId: 0, kind: "regulation" as const, title: release("2018-226").title };
  check("a release is scored without the model, as a Justice Department release is",
    deterministicScore({ ...musk, sourceKey: "sec_press" }, tesla, ["tesla"])?.score === 0.95);
  const ingest = read("scripts/ingest.ts");
  check("company ingest walks the years, then keeps the company's releases under its names and its possessive",
    (COMPANY_SOURCES as readonly string[]).includes("sec_press") &&
      /await run\("sec_press", [^\n]+, async \(\) => \{\s+const walked = await walkSecPress\(client\);[\s\S]{0,400}return secPressFor\(client, subjectId, \{ edgarName: company\.name, alsoKnownAs, possessive: dojPossessive\(company\.name, possessive\), cik: company\.cik, fundSeries \}, walked\);/.test(ingest));
  // the 2026-10-30 audit's finding 4 (batch 78): prices were read last, so a company's first
  // ingest found no first price, stored no release and marked the source read for a day
  const company = ingest.slice(ingest.indexOf("export async function ingestCompany"), ingest.indexOf("\n}\n", ingest.indexOf("export async function ingestCompany")));
  const at = (s: string) => company.indexOf(s);
  check("  …after the company's prices are read, as are the Federal Register's years and GDELT's months, which also begin at the first price",
    at("await companyPrices(") > 0 && [`await run("sec_press"`, "backfillRegulations(", "backfillNews("].every((s) => at(s) > at("await companyPrices(")) &&
      /async function companyPrices\([\s\S]*?writePrices\(client, subjectId, daily\.points/.test(ingest),
    `prices at ${at("await companyPrices(")}, sec_press at ${at('await run("sec_press"')}`);
  check("check:feeds reports this year's newest page as ingest keeps it",
    /reportFetch\("SEC press releases"/.test(read("scripts/check-feeds.ts")) && /"SEC press releases": "sec_press"/.test(read("scripts/check-feeds.ts")));
  const migration = read("db/032_sec_press.sql");
  check("the releases and the years read are kept in their own tables, a release by its number and day",
    /CREATE TABLE IF NOT EXISTS sec_press_releases/.test(migration) && /PRIMARY KEY \(release_no, released_on\)/.test(migration) &&
      /CREATE TABLE IF NOT EXISTS sec_press_years/.test(migration));
  check("the SEC is credited where the other sources are",
    /press releases from the\s+U\.S\. Department of Justice and the U\.S\. Securities and\s+Exchange Commission/.test(read("app/layout.tsx")) &&
      /press releases from the U\.S\. Department of Justice and the SEC/.test(read("app/legal/terms/page.tsx")) &&
      /\| SEC newsroom \(press releases\) \|/.test(read("README.md")));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  process.exit(fail ? 1 : 0);
})();
