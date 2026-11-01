import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PoolClient } from "pg";
import tickerIndex from "../data/edgar-tickers.json";
import { dojPossessive } from "../lib/doj";
import { withoutTag } from "../lib/edgarName";
import { companyNames } from "../lib/frCompany";
import { namesForYear } from "../lib/ingest/frBackfill";
import { GAP_MS, PAGES_PER_RUN, YEAR_PAGES, secCasesFor, storedSecCases, walkSecCases, type CasesWalk } from "../lib/ingest/secCasesWalk";
import { SOURCE_TTL_MINUTES } from "../lib/ingest/refresh";
import { QUOTAS } from "../lib/ingest/quota";
import { SOURCES } from "../lib/ingest/store";
import { deterministicScore } from "../lib/enrich/relevance";
import { isNotesRecord, releaseNamesAsked, releaseNamesOn } from "../lib/releaseNames";
import { newsNamesFor, possessiveNameFor } from "../lib/sec";
import {
  NOT_THE_COMPANY,
  SEC_CASES_FROM,
  captionParty,
  caseKey,
  chargedParties,
  fetchCasePage,
  parseCaseListing,
  secCaseEvents,
  type CaseListing,
  type CasePage,
  type SecCase,
} from "../lib/secCases";
import { COMPANY_SOURCES } from "./ingest";

/**
 * The SEC's litigation releases and administrative proceedings naming a listed company as a
 * defendant or respondent, from 1995 (batch 83, the 2026-11-01 proposal 2, a source the owner
 * approved on 2026-11-01).
 *
 *   npm run check:sec-cases
 *
 * The rows are real, read from both listings on 2026-11-01 (scripts/fixtures/sec-cases.json):
 * every row the rule gives a company in the committed index, and the rows it must refuse — a
 * namesake, a list of revoked registrations, a relief defendant, an amicus brief, a bank's unit
 * outside the days it owned it. Offline by construction: the SEC and the database are stand-ins.
 * On the code before this batch none of it runs: the adapter, its walk and its tables did not exist.
 */

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const pages: { litigation: string; proceeding: string; empty: string } = JSON.parse(read("scripts/fixtures/sec-cases-listing.json"));
const fixture: { cases: [l: "l" | "p", number: string, day: string, caption: string, fileNo: string, path: string][] } = JSON.parse(read("scripts/fixtures/sec-cases.json"));
const rows: SecCase[] = fixture.cases.map(([l, number, day, caption, fileNo, path]) => ({
  listing: l === "l" ? "litigation" : "proceeding",
  number,
  day,
  caption,
  ...(fileNo ? { fileNo } : {}),
  url: path.startsWith("http") ? path : `https://www.sec.gov${path}`,
}));
const companies = tickerIndex.companies as [number, string, string][];
const rowOf = (ticker: string) => {
  const r = companies.find(([, t]) => t === ticker);
  if (!r) throw new Error(`no ${ticker} in the ticker index`);
  return r;
};

/** The names a company's ingest matches a caption of `year` under, its legal name among them, from the committed indexes. */
function namesOf(ticker: string): (year: number) => string[] {
  const [cik, , title] = rowOf(ticker);
  const own = dojPossessive(title, possessiveNameFor(cik));
  return (year) => [...companyNames(title, namesForYear(year, newsNamesFor(cik), [])), ...(own ? [own] : []), withoutTag(title)];
}
function row(number: string, day?: string): SecCase {
  const r = rows.find((x) => x.number === number && (!day || x.day === day));
  if (!r) throw new Error(`no row ${number} in the fixture`);
  return r;
}
/** Whether the company's page takes the row, its first price aside, as ingest keeps it. */
const pageTakes = (r: SecCase, ticker: string) => {
  const cik = rowOf(ticker)[0];
  return !isNotesRecord(cik) && secCaseEvents([r], namesOf(ticker), { cik, namesOn: (day) => releaseNamesOn(cik, day) }).length === 1;
};
function expectPages(name: string, cases: [number: string, ticker: string, wanted: boolean, day?: string][]): void {
  const wrong = cases.filter(([n, t, want, day]) => pageTakes(row(n, day), t) !== want);
  check(name, wrong.length === 0, wrong.map(([n, t, want]) => `${n} ${want ? "not on" : "on"} ${t}`).join("; "));
}

interface Db {
  years: Map<string, { complete: boolean; stale: boolean; pages: number; cases: number }>;
  cases: Map<string, SecCase>;
  listed: string | null;
  renames: { until: string; body: string }[];
  doubled: number;
}
function fakeDb(db: Db): PoolClient {
  return {
    query: async (sql: string, params: unknown[] = []) => {
      const s = sql.trim();
      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(s)) return { rows: [] };
      if (/^SELECT listing, year, complete/.test(s)) {
        return { rows: [...db.years].map(([k, y]) => ({ listing: k.split(":")[0], year: Number(k.split(":")[1]), complete: y.complete, stale: y.stale })) };
      }
      if (/^SELECT release_no, released_on::text AS day FROM sec_cases WHERE listing = \$1/.test(s)) {
        const [listing, from, to] = params as [CaseListing, string, string];
        return { rows: [...db.cases.values()].filter((c) => c.listing === listing && c.day >= from && c.day < to).map((c) => ({ release_no: c.number, day: c.day })) };
      }
      if (/^INSERT INTO sec_cases \(/.test(s)) {
        const [listing, numbers, days, captions, fileNos, urls] = params as [CaseListing, string[], string[], string[], (string | null)[], string[]];
        const keys = numbers.map((n, i) => caseKey({ listing, number: n, day: days[i] }));
        if (new Set(keys).size !== keys.length) {
          db.doubled++;
          throw new Error("ON CONFLICT DO UPDATE command cannot affect row a second time");
        }
        let changed = 0;
        keys.forEach((k, i) => {
          const was = db.cases.get(k);
          if (!was || was.caption !== captions[i] || was.url !== urls[i]) changed++;
          db.cases.set(k, { listing, number: numbers[i], day: days[i], caption: captions[i], ...(fileNos[i] ? { fileNo: fileNos[i]! } : {}), url: urls[i] });
        });
        return { rows: [], rowCount: changed };
      }
      if (/^INSERT INTO sec_cases_years/.test(s)) {
        const [listing, year, complete, pagesRead, cases] = params as [CaseListing, number, boolean, number, number];
        db.years.set(`${listing}:${year}`, { complete, stale: false, pages: pagesRead, cases });
        return { rows: [] };
      }
      if (/^SELECT listing, release_no, released_on::text AS day, caption, file_no, url FROM sec_cases ORDER BY/.test(s)) {
        return {
          rows: [...db.cases.values()].sort((a, b) => a.day.localeCompare(b.day)).map((c) => ({ listing: c.listing, release_no: c.number, day: c.day, caption: c.caption, file_no: c.fileNo ?? null, url: c.url })),
        };
      }
      if (/FROM prices/.test(s)) return { rows: [{ listed: db.listed }] };
      if (/FROM events e/.test(s)) return { rows: db.renames };
      throw new Error(`unexpected query: ${s.slice(0, 80)}`);
    },
  } as unknown as PoolClient;
}
const freshDb = (listed: string | null = "1972-06-01"): Db => ({ years: new Map(), cases: new Map(), listed, renames: [], doubled: 0 });

/** A stand-in SEC: `count(listing, year)` rows a year, newest first, 100 a page. */
function standIn(count: (listing: CaseListing, year: number) => number, refuse?: { listing: CaseListing; year: number; page: number; status: number }) {
  const asked: string[] = [];
  const fetchPage = async (listing: CaseListing, year: number, page: number): Promise<CasePage> => {
    asked.push(`${listing}:${year}:${page}`);
    if (refuse && refuse.listing === listing && refuse.year === year && refuse.page === page) return { cases: [], outcome: "throttled", httpStatus: refuse.status };
    const n = count(listing, year);
    const all = Array.from({ length: n }, (_, i): SecCase => {
      const num = n - i;
      const day = `${year}-${String(1 + ((num - 1) % 12)).padStart(2, "0")}-01`;
      return { listing, number: `${listing === "litigation" ? "LR" : "34"}-${year}${num}`, day, caption: `Party ${num} of ${year}, Inc.`, url: `https://www.sec.gov/x/${listing}/${year}/${num}` };
    });
    return { cases: all.slice(page * 100, page * 100 + 100), outcome: "ok", httpStatus: 200 };
  };
  return { asked, fetchPage };
}
const TODAY = "2026-11-01";

(async () => {
  console.log("\nThe listings, as the SEC serves them");
  const lit = parseCaseListing(pages.litigation, "litigation");
  check("a litigation release: its day, its caption, its number and its page on sec.gov",
    lit.length === 3 && lit[0].number === "LR-21795" && lit[0].day === "2010-12-27" && lit[0].caption === "Alcatel-Lucent, S.A." &&
      lit[0].url === "https://www.sec.gov/enforcement-litigation/litigation-releases/lr-21795" && lit[0].fileNo === undefined,
    JSON.stringify(lit[0]));
  const ap = parseCaseListing(pages.proceeding, "proceeding");
  check("an administrative proceeding: its file number, and its order's own link",
    ap.length === 3 && ap[0].number === "34-63622" && ap[0].fileNo === "3-14116" && ap[0].day === "2010-12-30" &&
      ap[0].url === "https://www.sec.gov/files/litigation/admin/2010/34-63622.pdf" && ap[2].day.startsWith("1995-"),
    JSON.stringify([ap[0], ap[2]]));
  check("a year with none holds none", parseCaseListing(pages.empty, "litigation").length === 0);
  const realFetch = globalThis.fetch;
  const answers: Response[] = [];
  const asked: { url: URL; ua: string }[] = [];
  globalThis.fetch = (async (u: RequestInfo | URL, init?: RequestInit) => {
    asked.push({ url: new URL(String(u)), ua: new Headers(init?.headers).get("user-agent") ?? "" });
    return answers.shift()!;
  }) as typeof fetch;
  try {
    answers.push(new Response(pages.proceeding, { status: 200 }));
    const ok = await fetchCasePage("proceeding", 2010, 3);
    check("a page is asked by listing, year and page, with the contact User-Agent",
      ok.outcome === "ok" && ok.cases.length === 3 && asked[0].url.pathname === "/enforcement-litigation/administrative-proceedings" &&
        asked[0].url.searchParams.get("year") === "2010" && asked[0].url.searchParams.get("month") === "All" && asked[0].url.searchParams.get("page") === "3" &&
        /^News Charts Research \S+@\S+$/.test(asked[0].ua), asked[0].url.search);
    answers.push(new Response("", { status: 403 }), new Response("<p>Request Rate Threshold Exceeded</p>", { status: 200 }), new Response(pages.empty, { status: 200 }));
    const refused = await fetchCasePage("litigation", 2010, 0);
    const notAListing = await fetchCasePage("litigation", 2010, 0);
    const none = await fetchCasePage("litigation", 1994, 0);
    check("a refusal is throttled, a page without its table an error, and a year with none an empty answer",
      refused.outcome === "throttled" && refused.httpStatus === 403 && notAListing.outcome === "error" && none.outcome === "ok" && none.cases.length === 0);
  } finally {
    globalThis.fetch = realFetch;
  }

  console.log("\nA party: the company by its name and legal form, an entry of the caption of its own");
  expectPages("the customs-bribery cases of 2010-11-04 land on Transocean, Noble (through the name its predecessor had) and Tidewater, and Huntington's proceeding on HBAN",
    [["LR-21725, AAER-3202", "RIG", true], ["LR-21728, AAER-3206", "NE", true], ["LR-21729, AAER-3207", "TDW", true], ["34-63290", "HBAN", true]]);
  expectPages("  …a company named by its legal name, which its everyday name shortened: RenaissanceRe Holdings Ltd.; one named alone with no legal word: Sanofi, TransUnion",
    [["LR-19989, AAER-2550", "RNR", true], ["34-84017, AAER-3964", "SNY", true], ["34-100975", "TRU", true]]);
  expectPages("  …and \"Becton, Dickinson and Company\", \"Morgan Stanley and Co. LLC\", \"ENI, S.p.A.\", \"BankAmerica Corp. (now known as Bank of America Corp.)\"",
    [["34-104024", "BDX", true], ["34-103860", "MS", true], ["LR-21588, AAER-3149", "E", true], ["34-44613, AAER-1429", "BAC", true]]);
  expectPages("another company's full name is not the company's: Southern Financial Group, Reliance Holdings, Lucent Technologies, Prudential Securities",
    [["LR-17535", "SO", false], ["LR-16941", "RS", false], ["LR-18715, AAER-2016", "LUCN", false], ["33-7817", "PUK", false]]);
  expectPages("  …nor a person written surname first, a firm whose name has a comma in it, or \"City (U.K.), Ltd.\"",
    [["34-86639", "DOW", false], ["34-38754", "FOXA", false], ["LR-15728", "CHCO", false]]);
  check("a stock is not a party: \"One or More Unknown Purchasers of Securities of Martek Biosciences Corporation\"",
    captionParty(row("LR-21792").caption, ["Martek Biosciences", "MARTEK BIOSCIENCES CORP"]) === null);
  const relief = row("LR-21783").caption;
  check("a relief defendant is not charged: Bosco Financial is cut off, Alternate Energy Holdings kept",
    captionParty(relief, ["Bosco Financial"]) === null && captionParty(relief, ["Alternate Energy Holdings"]) === "Alternate Energy Holdings, Inc." &&
      !/Bosco/.test(chargedParties(relief)), chargedParties(relief));
  check("an amicus brief in someone else's suit charges no one", captionParty(row("LR-15991").caption, ["Milestone Scientific"]) === null);
  check("a list of revoked registrations run together names no party: \"Appian, Inc. Bulk Storage Software, Inc. …\"",
    captionParty(row("34-84228").caption, ["Appian", "Appian Corp"]) === null);

  console.log("\nNamesakes, read by hand");
  check("the caption rule alone gives Acorn Energy, Inc. the other Acorn Energy's case of 2010",
    captionParty(row("LR-21736").caption, namesOf("ACFN")(2010)) === "Acorn Energy, Inc.");
  expectPages("  …which the hand-read list keeps off its page, as it does McDonalds Ltd., the 2001 National Steel, a 2001 Spectrum Brands and lists of revoked registrations",
    [["LR-21736", "ACFN", false], ["LR-16448", "MCD", false], ["34-44130, AAER-1378", "SID", false], ["LR-17265", "SPB", false],
      ["34-66331", "TLS", false], ["34-66331", "TSSI", false], ["34-60115", "FCCO", false], ["34-63759", "CGDCF", false], ["34-67051", "VAI", false]]);
  check("  …each entry with its reason and a ticker the index has for its CIK",
    Object.entries(NOT_THE_COMPANY).every(([cik, list]) => list.every((n) => n.why.length > 20 && companies.some(([c, t]) => c === Number(cik) && t === n.ticker))));

  console.log("\nA bank's units, while it owned them (the release rules' map)");
  expectPages("Banc of America Securities' order of 2010-12-17 lands on BAC; Merrill Lynch's cases from 2009, never its Enron case of 2003",
    [["34-63571", "BAC", true], ["LR-18038, AAER-1742", "BAC", false], ["LR-21457", "BAC", true]]);
  expectPages("Bear Stearns' 2009 order lands on JPMorgan, its 2006 one does not; Wachovia's of 2010 on Wells Fargo, its 2004 one does not",
    [["34-59356", "JPM", true, "2009-02-04"], ["33-8668, 34-53490, IC-27262", "JPM", false], ["34-63424", "WFC", true], ["LR-18958", "WFC", false]]);
  expectPages("the 2010 auction-rate dealers each land on their bank: Citigroup, Deutsche Bank, Goldman Sachs, JPMorgan, Morgan Stanley, UBS",
    [["LR-21457", "C", true], ["LR-21457", "DB", true], ["LR-21457", "GS", true], ["LR-21457", "JPM", true], ["LR-21457", "MS", true], ["LR-21457", "UBS", true]]);
  expectPages("Jefferies and Co.'s 2010 order is Jefferies Group's, not Jefferies Financial's; UBS's Puerto Rico brokerage lands on UBS Group; Morgan Keegan's of 2004 on Regions",
    [["34-63510", "JEF", false], ["33-9318, 34-66893", "UBS", true], ["33-8466, 34-50246", "RF", true]]);
  check("Barclays Bank PLC's cases land on Barclays, never on Barclays Bank PLC's notes record (ATMP)",
    pageTakes(row("LR-20132"), "BCS") && !pageTakes(row("LR-20132"), "ATMP") && isNotesRecord(312070));

  console.log("\nAs timeline events");
  const ms = rows.filter((r) => r.day === "2010-03-19");
  const msEvents = secCaseEvents(ms, namesOf("MS"), { cik: 895421 });
  const csEvents = secCaseEvents(ms, namesOf("C"), { cik: 831001, namesOn: (d) => releaseNamesOn(831001, d) });
  check("one event a company a day, titled by its own party, the others said",
    msEvents.length === 1 && msEvents[0].title === "SEC litigation release: Morgan Stanley & Co. Incorporated and others" &&
      csEvents.length === 1 && csEvents[0].title === "SEC litigation release: Citigroup Global Markets Inc. and others" &&
      msEvents[0].dedupBasis !== csEvents[0].dedupBasis && msEvents[0].type === "regulation" && msEvents[0].sourceKey === "sec_cases",
    `${msEvents.map((e) => e.title).join(" | ")} · ${csEvents.map((e) => e.title).join(" | ")}`);
  const hb = secCaseEvents([row("34-63290")], namesOf("HBAN"), { cik: 49196 });
  check("  …its description the whole caption with each number and file number, its link the SEC's",
    hb[0].description === "SEC administrative proceeding 34-63290 (file 3-11940): Huntington Bancshares, Inc.; Thomas E. Hoaglin, Michael J. McMennamin, and John Van Fleet, CPA" &&
      hb[0].url === row("34-63290").url && hb[0].externalId === "proceeding:34-63290@2010-11-09" && hb[0].dedupBasis === "sec-cases:49196@2010-11-09",
    JSON.stringify(hb[0]));
  const valu = secCaseEvents(rows.filter((r) => /^Value Line, Inc\./.test(r.caption)), namesOf("VALU"), { cik: 717720 });
  check("  …newest first, and none before the company's first price",
    valu.length > 2 && valu.every((e, i) => i === 0 || e.date <= valu[i - 1].date) &&
      secCaseEvents(rows.filter((r) => /^Value Line, Inc\./.test(r.caption)), namesOf("VALU"), { cik: 717720, from: "2023-01-01" }).every((e) => e.date >= "2023-01-01"));

  console.log("\nEvery kept row against every listed company");
  const t0 = Date.now();
  const alnum = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  const heads = rows.map((r) => alnum(r.caption));
  let events = 0;
  let before2017 = 0;
  const named = new Set<string>();
  const seen = new Set<number>();
  for (const [cik, ticker, title] of companies) {
    if (seen.has(cik)) continue;
    seen.add(cik);
    if (isNotesRecord(cik)) continue;
    const own = dojPossessive(title, possessiveNameFor(cik));
    const aka = newsNamesFor(cik);
    const names = (y: number) => [...companyNames(title, namesForYear(y, aka, [])), ...(own ? [own] : []), withoutTag(title)];
    const keys = [...names(2026), ...releaseNamesAsked(cik)].map(alnum).filter((a) => a.length >= 2);
    const held = rows.filter((_, i) => keys.some((k) => heads[i].includes(k)));
    if (!held.length) continue;
    const got = secCaseEvents(held, names, { cik, namesOn: (d) => releaseNamesOn(cik, d) });
    if (got.length) named.add(ticker);
    events += got.length;
    before2017 += got.filter((e) => e.date < "2017").length;
  }
  check("the 30,654 rows of 1995–2026 give 1,022 company days on 352 companies, 478 before 2017, as replayed in full",
    events === 1022 && named.size === 352 && before2017 === 478, `${events} on ${named.size}, ${before2017} before 2017, in ${Date.now() - t0} ms`);

  console.log("\nThe year walk: each listing's year read once for every company");
  const big = (l: CaseListing, y: number) => (l === "proceeding" && y === 2016 ? 1012 : l === "litigation" && y === 2010 ? 439 : 150 + (y % 5));
  const db = freshDb();
  const sec = standIn(big);
  const first = await walkSecCases(fakeDb(db), { today: TODAY, budget: { left: 10_000 }, gapMs: 0, fetchPage: sec.fetchPage });
  const years = 2 * (2026 - SEC_CASES_FROM + 1);
  check(`a first walk reads both listings' ${years / 2} years from ${SEC_CASES_FROM}, the current year first`,
    first.due === years && first.read === years && sec.asked[0] === "litigation:2026:0" && sec.asked[1] === "litigation:2026:1" &&
      sec.asked.includes("proceeding:1995:0") && !sec.asked.some((a) => a.includes(":1994:")), `${first.read} of ${first.due}, ${first.pages} pages`);
  check("  …every page of each, until a page holds fewer than 100 (2016's 1,012 proceedings take eleven)",
    sec.asked.filter((a) => a.startsWith("proceeding:2016:")).length === 11 && db.years.get("proceeding:2016")?.cases === 1012 && db.years.get("litigation:2010")?.pages === 5);
  check("  …a year that is over marked read in full, the current one not",
    db.years.get("litigation:2025")?.complete === true && db.years.get("proceeding:1995")?.complete === true && db.years.get("proceeding:2026")?.complete === false);
  const again = standIn(big);
  const second = await walkSecCases(fakeDb(db), { today: TODAY, budget: { left: 10_000 }, gapMs: 0, fetchPage: again.fetchPage });
  check("a closed year is not asked twice, nor the current year inside its day", second.due === 0 && again.asked.length === 0);
  db.years.get("litigation:2026")!.stale = true;
  const daily = standIn((l, y) => (l === "litigation" && y === 2026 ? big(l, y) + 3 : big(l, y)));
  const next = await walkSecCases(fakeDb(db), { today: TODAY, budget: { left: 10_000 }, gapMs: 0, fetchPage: daily.fetchPage });
  check("a day later the current year is read down to the first page holding a row already kept",
    next.due === 1 && daily.asked.join(",") === "litigation:2026:0" && next.cases === 3, `${daily.asked.join(",")} → ${next.cases} new`);

  console.log("\nBounded, and stopped by a refusal");
  check(`at most ${PAGES_PER_RUN} pages a process, ${GAP_MS} ms apart, a year begun only with ${YEAR_PAGES} pages left`,
    PAGES_PER_RUN === 120 && GAP_MS === 1_000 && YEAR_PAGES === 20);
  const budget = { left: 45 };
  const short = standIn(big);
  const part = await walkSecCases(fakeDb(freshDb()), { today: TODAY, budget, gapMs: 0, fetchPage: short.fetchPage });
  check("  …so a run with 45 pages stops rather than begin a year it might cut in half",
    part.stopped === "this run's pages are spent" && budget.left < YEAR_PAGES && part.read > 0, `${part.read} years, ${short.asked.length} pages, ${budget.left} left`);
  const refusedDb = freshDb();
  const throttled = standIn(big, { listing: "proceeding", year: 2024, page: 1, status: 403 });
  const stopped = await walkSecCases(fakeDb(refusedDb), { today: TODAY, budget: { left: 10_000 }, gapMs: 0, fetchPage: throttled.fetchPage });
  check("a refused page stops the walk, says where, and keeps nothing of that year",
    stopped.stopped === "throttled" && stopped.failure?.httpStatus === 403 && stopped.failure.detail === "proceeding 2024 page 2" &&
      !refusedDb.years.has("proceeding:2024") && refusedDb.years.has("litigation:2024"), JSON.stringify(stopped.failure));
  const doubled = freshDb();
  const repeat = async (listing: CaseListing, year: number, p: number): Promise<CasePage> => {
    const c: SecCase = { listing, number: `LR-${year}`, day: `${year}-06-01`, caption: "Jefferies & Co., Inc. and Scott Jones", url: `https://www.sec.gov/x/${year}` };
    return { cases: p === 0 ? [c, c] : [], outcome: "ok", httpStatus: 200 };
  };
  const once = await walkSecCases(fakeDb(doubled), { today: TODAY, budget: { left: 10_000 }, gapMs: 0, fetchPage: repeat });
  check("a row the listing shows twice is stored once, without failing the year", doubled.doubled === 0 && once.read === years && doubled.cases.size === years);

  console.log("\nA company's cases, from what is kept");
  const kept = freshDb("1990-01-02");
  for (const r of rows) kept.cases.set(caseKey(r), r);
  const ok: CasesWalk = { due: 0, read: 0, pages: 0, cases: 0 };
  const hban = await secCasesFor(fakeDb(kept), 1, { edgarName: "HUNTINGTON BANCSHARES INC /MD/", alsoKnownAs: newsNamesFor(49196), cik: 49196 }, ok);
  check("Huntington's page gets its proceedings of 2005 to 2018, one a day",
    hban.outcome === "ok" && hban.events.length === 12 && hban.events.at(-1)!.date === "2005-06-02", `${hban.events.length}: ${hban.events.map((e) => e.date).join(",")}`);
  const rnr = await secCasesFor(fakeDb(kept), 1, { edgarName: "RENAISSANCERE HOLDINGS LTD", alsoKnownAs: newsNamesFor(rowOf("RNR")[0]), cik: rowOf("RNR")[0] }, ok);
  check("  …a company found by its legal name, whose everyday name dropped \"Holdings\"", rnr.events.map((e) => e.date).join(",") === "2007-02-06");
  kept.renames = [{ until: "2016-07-31", body: "EDGAR's company record lists DANA HOLDING CORP as a former name of this filer, in use until this day." }];
  const dana = await secCasesFor(fakeDb(kept), 1, { edgarName: "DANA INC", alsoKnownAs: [], cik: 26780 }, ok);
  check("  …and by a stored former name, in use that year: Dana Holding Corporation's case of 2009", dana.events.some((e) => e.date === "2009-09-11"), dana.events.map((e) => e.date).join(","));
  kept.renames = [];
  const notes = await secCasesFor(fakeDb(kept), 1, { edgarName: "BARCLAYS BANK PLC", alsoKnownAs: [], cik: 312070 }, ok);
  const unpriced = await secCasesFor(fakeDb({ ...kept, listed: null }), 1, { edgarName: "HUNTINGTON BANCSHARES INC /MD/", alsoKnownAs: [], cik: 49196 }, ok);
  const refusedWalk: CasesWalk = { ...ok, stopped: "throttled", failure: { outcome: "throttled", httpStatus: 403, detail: "litigation 2026 page 1" } };
  const still = await secCasesFor(fakeDb(kept), 1, { edgarName: "HUNTINGTON BANCSHARES INC /MD/", alsoKnownAs: [], cik: 49196 }, refusedWalk);
  check("a notes record takes none, a company with no prices none, and a refused walk still gives what is kept and reports the refusal",
    notes.outcome === "empty" && /notes record/.test(notes.detail ?? "") && unpriced.detail === "no prices to start from" &&
      still.outcome === "throttled" && still.events.length === 12);
  check("  …the kept rows come back oldest first", (await storedSecCases(fakeDb(kept)))[0].day.startsWith("1995-"));

  console.log("\nRegistered, licensed, wired");
  const src = SOURCES.find((s) => s.key === "sec_cases");
  check("the source is registered as public information the SEC lets anyone copy, cleared for commercial use, with the day it was read",
    src?.id === 28 && src.license === "public domain" && src.commercialOk && src.reviewedOn === "2026-11-01" && src.attribution === "U.S. Securities and Exchange Commission",
    JSON.stringify(src));
  check("  …asked once a day per company, its requests counted against sec.gov's 10 a second",
    SOURCE_TTL_MINUTES.sec_cases === 1440 && QUOTAS.sec_cases?.perSecond === 10);
  check("a case is scored without the model",
    deterministicScore({ eventId: 0, kind: "regulation", title: "SEC litigation release: Transocean Inc.", sourceKey: "sec_cases" }, { kind: "company", displayName: "Transocean Ltd.", ticker: "RIG" }, ["transocean"])?.score === 0.95);
  const ingest = read("scripts/ingest.ts");
  const company = ingest.slice(ingest.indexOf("export async function ingestCompany"), ingest.indexOf("\n}\n", ingest.indexOf("export async function ingestCompany")));
  check("company ingest walks both listings, then keeps the company's rows under its names, by its CIK, after its prices",
    (COMPANY_SOURCES as readonly string[]).includes("sec_cases") &&
      /await run\("sec_cases", [^\n]+, async \(\) => \{\s+const walked = await walkSecCases\(client\);[\s\S]{0,400}return secCasesFor\(client, subjectId, \{ edgarName: company\.name, alsoKnownAs, possessive: dojPossessive\(company\.name, possessive\), cik: company\.cik \}, walked\);/.test(ingest) &&
      company.indexOf('await run("sec_cases"') > company.indexOf("await companyPrices("));
  check("check:feeds reports each listing's newest page as ingest keeps it, and check:live asks a closed year",
    /reportFetch\("SEC cases"/.test(read("scripts/check-feeds.ts")) && /"SEC cases": "sec_cases"/.test(read("scripts/check-feeds.ts")) &&
      /covers: \["sec_cases"\]/.test(read("scripts/check-live.ts")));
  const migration = read("db/033_sec_cases.sql");
  check("the rows and the years read are kept in their own tables, a row by its listing, number and day",
    /CREATE TABLE IF NOT EXISTS sec_cases \(/.test(migration) && /PRIMARY KEY \(listing, release_no, released_on\)/.test(migration) &&
      /CREATE TABLE IF NOT EXISTS sec_cases_years/.test(migration) && /PRIMARY KEY \(listing, year\)/.test(migration));
  check("the SEC's case listings are credited where the other sources are",
    /litigation releases and administrative\s+proceedings/.test(read("app/layout.tsx")) && /litigation\s+releases and administrative proceedings/.test(read("app/legal/terms/page.tsx")) &&
      /\| SEC litigation releases and administrative proceedings \|/.test(read("README.md")));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  process.exit(fail ? 1 : 0);
})();
