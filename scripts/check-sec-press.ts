import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PoolClient } from "pg";
import tickerIndex from "../data/edgar-tickers.json";
import { dojPossessive, releaseNamesParty } from "../lib/doj";
import { companyNames } from "../lib/frCompany";
import { namesForYear } from "../lib/ingest/frBackfill";
import { GAP_MS, PAGES_PER_RUN, YEAR_PAGES, secPressFor, storedSecReleases, walkSecPress, type PressWalk } from "../lib/ingest/secPressWalk";
import { SOURCE_TTL_MINUTES } from "../lib/ingest/refresh";
import { QUOTAS } from "../lib/ingest/quota";
import { SOURCES } from "../lib/ingest/store";
import { deterministicScore } from "../lib/enrich/relevance";
import { newsNamesFor, possessiveNameFor } from "../lib/sec";
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
  years: Map<number, { complete: boolean; stale: boolean; pages: number; releases: number }>;
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
      if (/^SELECT year, complete/.test(s)) return { rows: [...db.years].map(([year, y]) => ({ year, complete: y.complete, stale: y.stale })) };
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
        const [year, complete, pages, releases] = params as [number, boolean, number, number];
        db.years.set(year, { complete, stale: false, pages, releases });
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
  try {
    answers.push(new Response(fixture.listing, { status: 200 }));
    const ok = await fetchListingPage(2010, 0);
    check("a page is asked by year, every month and page number, with the project's contact User-Agent",
      ok.outcome === "ok" && ok.releases.length === 25 && asked[0].url.origin + asked[0].url.pathname === "https://www.sec.gov/newsroom/press-releases" &&
        asked[0].url.searchParams.get("year") === "2010" && asked[0].url.searchParams.get("month") === "All" &&
        asked[0].url.searchParams.get("page") === "0" && /marcusowens94@gmail\.com/.test(asked[0].ua), asked[0].url.search);
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
  check("  …where the Justice Department rule, run on SEC headlines, would have kept the city, the division and the board member",
    releaseNamesParty(release("99-119").title, namesOf("CHCO")(1999)) && releaseNamesParty(release("2009-199").title, namesOf("MSTR")(2009)) &&
      releaseNamesParty(release("2011-53").title, namesOf("PG")(2011)));

  console.log("\nAs timeline events");
  const gs = secPressEvents(fixture.releases, namesOf("GS"));
  check("Goldman's releases, newest first, as regulation events credited to the SEC and linked to sec.gov",
    gs.map((e) => e.date).join(",") === "2010-07-15,2010-04-16,2005-01-25" && gs.every((e) => e.type === "regulation" && e.sourceKey === "sec_press" && e.url?.startsWith("https://www.sec.gov/newsroom/press-releases/")) &&
      gs[0].source === "SEC press release 2010-123" && gs[0].externalId === "2010-123@2010-07-15" && gs[0].dedupBasis === "sec-press:2010-123@2010-07-15" && gs[0].occurredAt === undefined,
    gs.map((e) => `${e.date} ${e.externalId}`).join(" · "));
  check("  …none before the company's first price", secPressEvents(fixture.releases, namesOf("GS"), "2006-01-01").map((e) => e.date).join(",") === "2010-07-15,2010-04-16");
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
  check("  …and none for a company with no prices yet", unpriced.outcome === "empty" && unpriced.events.length === 0 && unpriced.detail === "no prices to start from");
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
      /await run\("sec_press", [^\n]+, async \(\) => \{\s+const walked = await walkSecPress\(client\);[\s\S]{0,400}return secPressFor\(client, subjectId, \{ edgarName: company\.name, alsoKnownAs, possessive: dojPossessive\(company\.name, possessive\) \}, walked\);/.test(ingest));
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
