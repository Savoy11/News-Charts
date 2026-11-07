import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { PoolClient } from "pg";
import tickerIndex from "../data/edgar-tickers.json";
import { dojPossessive } from "../lib/doj";
import { withoutTag } from "../lib/edgarName";
import { companyNames } from "../lib/frCompany";
import { namesForYear } from "../lib/ingest/frBackfill";
import { GAP_MS, PAGES_PER_RUN, YEAR_PAGES, secCasesFor, storedSecCases, walkSecCases, type CasesWalk } from "../lib/ingest/secCasesWalk";
import { listingTotal, monthsToReread } from "../lib/listingGaps";
import { SOURCE_TTL_MINUTES } from "../lib/ingest/refresh";
import { QUOTAS } from "../lib/ingest/quota";
import { SOURCES } from "../lib/ingest/store";
import { deterministicScore } from "../lib/enrich/relevance";
import { BANK_UNITS, RELEASE_NAMES, isNotesRecord, releaseNamesAsked, releaseNamesBefore, releaseNamesOn } from "../lib/releaseNames";
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
import type { TimelineEvent } from "../lib/types";
import { COMPANY_SOURCES } from "./ingest";

/**
 * The SEC's litigation releases and administrative proceedings naming a listed company as a
 * defendant or respondent, from 1995 (batch 83, the 2026-11-01 proposal 2, a source the owner
 * approved on 2026-11-01).
 *
 *   npm run check:sec-cases
 *
 * The rows are real: every row both listings held for 1995–2026, read 2026-11-01, with the 93 their
 * year pages never showed, read from their months on 2026-11-02 (scripts/fixtures/
 * sec-cases-all.json.gz, 30,747 rows; batch 85, the 2026-11-01 audit's finding 4). Every row is
 * replayed against every company and every fund series in the committed index, so a looser rule
 * or a new name shows its whole effect. Offline by construction: the SEC and the database are
 * stand-ins. On the code before batch 83 none of it runs: the adapter, its walk and its tables did
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
const pages: { litigation: string; proceeding: string; empty: string } = JSON.parse(read("scripts/fixtures/sec-cases-listing.json"));
const fixture: { cases: [l: "l" | "p", number: string, day: string, caption: string, fileNo: string, path: string][] } = JSON.parse(
  gunzipSync(readFileSync(join(process.cwd(), "scripts/fixtures/sec-cases-all.json.gz"))).toString("utf8"),
);
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
/** Whether the company's page takes the row, its first price aside (ingest's, checked below with the owner's calls), as ingest keeps it. */
const pageTakes = (r: SecCase, ticker: string) => {
  const cik = rowOf(ticker)[0];
  return !isNotesRecord(cik) && secCaseEvents([r], namesOf(ticker), { cik, namesOn: (day) => releaseNamesOn(cik, day) }).length === 1;
};
function expectPages(name: string, cases: [number: string, ticker: string, wanted: boolean, day?: string][]): void {
  const wrong = cases.filter(([n, t, want, day]) => pageTakes(row(n, day), t) !== want);
  check(name, wrong.length === 0, wrong.map(([n, t, want]) => `${n} ${want ? "not on" : "on"} ${t}`).join("; "));
}

interface Db {
  years: Map<string, { complete: boolean; stale: boolean; pages: number; cases: number; count?: number | null }>;
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
        return { rows: [...db.years].map(([k, y]) => ({ listing: k.split(":")[0], year: Number(k.split(":")[1]), complete: y.complete, stale: y.stale, listed: y.count ?? null, cases: y.cases })) };
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
        const [listing, year, complete, pagesRead, cases, count] = params as [CaseListing, number, boolean, number, number, number | null];
        db.years.set(`${listing}:${year}`, { complete, stale: false, pages: pagesRead, cases, count });
        return { rows: [] };
      }
      if (/^UPDATE sec_cases_years SET listed = \$3 WHERE listing = \$1 AND year = \$2$/.test(s)) {
        const [listing, year, count] = params as [CaseListing, number, number];
        db.years.get(`${listing}:${year}`)!.count = count;
        return { rows: [], rowCount: 1 };
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

/**
 * A stand-in SEC: `count(listing, year)` rows a year, newest first, 100 a page. With `totals`, each
 * page states the year's count, as the SEC's footer does; with `tie`, that listing-year's rows all
 * fall on one day, and its second page begins with the first page's last row again and never
 * shows the row after it, as the SEC's pages do where rows tie on a day (batch 85). A month asked
 * alone (`month`) is served whole, without the repeat, unless `tieInMonths`.
 */
function standIn(
  count: (listing: CaseListing, year: number) => number,
  refuse?: { listing: CaseListing; year: number; page: number; status: number },
  { totals = false, tie, tieInMonths = false }: { totals?: boolean; tie?: { listing: CaseListing; year: number }; tieInMonths?: boolean } = {},
) {
  const asked: string[] = [];
  const fetchPage = async (listing: CaseListing, year: number, page: number, month?: number): Promise<CasePage> => {
    asked.push(`${listing}:${year}${month ? `-${month}` : ""}:${page}`);
    if (refuse && refuse.listing === listing && refuse.year === year && refuse.page === page) return { cases: [], outcome: "throttled", httpStatus: refuse.status };
    const n = count(listing, year);
    const tied = tie?.listing === listing && tie.year === year;
    const all = Array.from({ length: n }, (_, i): SecCase => {
      const num = n - i;
      const day = tied ? `${year}-06-15` : `${year}-${String(1 + ((num - 1) % 12)).padStart(2, "0")}-01`;
      return { listing, number: `${listing === "litigation" ? "LR" : "34"}-${year}${num}`, day, caption: `Party ${num} of ${year}, Inc.`, url: `https://www.sec.gov/x/${listing}/${year}/${num}` };
    });
    const served = month ? all.filter((c) => Number(c.day.slice(5, 7)) === month) : all;
    const pages = tied && (!month || tieInMonths) ? [served.slice(0, 100), [served[99], ...served.slice(101, 200)], ...[...Array(Math.ceil(n / 100))].map((_, k) => served.slice(200 + k * 100, 300 + k * 100))] : null;
    const cases = pages ? (pages[page] ?? []) : served.slice(page * 100, page * 100 + 100);
    return { cases, ...(totals ? { total: served.length } : {}), outcome: "ok", httpStatus: 200 };
  };
  return { asked, fetchPage };
}
/**
 * Every row against every company in the index and every fund series, under the names ingest
 * reads them by (current names; former names and first prices are ingest's), through an index of
 * the captions' four-letter pieces, so the whole replay takes seconds.
 */
function replay(): { companies: [string, TimelineEvent[]][]; funds: [string, TimelineEvent[]][] } {
  const alnum = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  const heads = rows.map((r) => alnum(r.caption));
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
  const run = (cik: number, title: string, units: boolean): TimelineEvent[] => {
    const own = dojPossessive(title, possessiveNameFor(cik));
    const aka = newsNamesFor(cik);
    const names = (y: number) => [...companyNames(title, namesForYear(y, aka, [])), ...(own ? [own] : []), withoutTag(title)];
    const keys = [...new Set([...names(2026), ...(units ? releaseNamesAsked(cik) : [])].map(alnum).filter((a) => a.length >= 2))];
    const held = [...new Set(keys.flatMap(holding))].sort((a, b) => a - b).map((i) => rows[i]);
    return held.length ? secCaseEvents(held, names, { cik, namesOn: (d) => (units ? releaseNamesOn(cik, d) : []) }) : [];
  };
  const companiesOut: [string, TimelineEvent[]][] = [];
  const seen = new Set<number>();
  for (const [cik, ticker, title] of companies) {
    if (seen.has(cik) || isNotesRecord(cik)) continue;
    seen.add(cik);
    const got = run(cik, title, true);
    if (got.length) companiesOut.push([ticker, got]);
  }
  const fundsOut: [string, TimelineEvent[]][] = [];
  const series = tickerIndex.seriesNames as string[];
  const named = new Set<string>();
  series.forEach((name, i) => {
    const cik = (tickerIndex.seriesCiks as number[])[i];
    if (named.has(`${cik}:${name}`)) return;
    named.add(`${cik}:${name}`);
    const got = run(cik, name, false);
    if (got.length) fundsOut.push([(tickerIndex.seriesSymbols as string[])[i], got]);
  });
  return { companies: companiesOut, funds: fundsOut };
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
  // the build's contact address is set in NEWS_CHARTS_CONTACT (lib/contact.ts, batch 92); a
  // stand-in on example.org for the run
  const contactWas = process.env.NEWS_CHARTS_CONTACT;
  process.env.NEWS_CHARTS_CONTACT = "builds@example.org";

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
        asked[0].ua === "News Charts Research builds@example.org", asked[0].url.search);
    answers.push(new Response("", { status: 403 }), new Response("<p>Request Rate Threshold Exceeded</p>", { status: 200 }), new Response(pages.empty, { status: 200 }));
    const refused = await fetchCasePage("litigation", 2010, 0);
    const notAListing = await fetchCasePage("litigation", 2010, 0);
    const none = await fetchCasePage("litigation", 1994, 0);
    check("a refusal is throttled, a page without its table an error, and a year with none an empty answer",
      refused.outcome === "throttled" && refused.httpStatus === 403 && notAListing.outcome === "error" && none.outcome === "ok" && none.cases.length === 0);
  } finally {
    if (contactWas === undefined) delete process.env.NEWS_CHARTS_CONTACT;
    else process.env.NEWS_CHARTS_CONTACT = contactWas;
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
  // the 2026-11-01 audit's finding 2 (batch 85): the banks' own spellings and the units named after them
  expectPages("JPMorgan's own name as the captions space it: \"JP Morgan Chase & Co.\" (the 2016 FCPA order, the London Whale order of 2017) and \"J. P. Morgan Securities LLC\" (2023)",
    [["34-79335, AAER-3824", "JPM", true], ["34-81383", "JPM", true], ["34-97787", "JPM", true], ["33-9078, 34-60928", "JPM", true]]);
  expectPages("  …Morgan Stanley DW, Dean Witter renamed; Citibank, N.A., Citigroup's from 1998-10-08; Salomon Smith Barney; BofA Securities; Goldman Sachs Execution & Clearing (its former name after it) and Asset Management",
    [["34-46578", "MS", true], ["33-8036", "C", true], ["33-10571", "C", true], ["33-7829", "C", true], ["34-95921", "BAC", true], ["34-55465", "GS", true], ["IA-6189", "GS", true]]);
  expectPages("  …and not what the units' days or names leave out: Smith Barney Fund Management of 2007, Legg Mason's by then; Quantum Corp. a/k/a Quantum Trading, a fraud's shell, not Quantum",
    [["IA-2666, IC-28005", "C", false], ["LR-15555", "QMCO", false], ["34-95880", "GRUSF", true]]);
  check("Citibank, N.A. counts for Citigroup only from the merger day: a caption of 1998-10-07 is Citicorp's",
    !pageTakes({ ...row("33-10571"), day: "1998-10-07" }, "C") && pageTakes({ ...row("33-10571"), day: "1998-10-08" }, "C"));
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

  console.log("\nEvery row against every listed company and every fund series");
  const t0 = Date.now();
  const replayed = replay();
  const companyDays = replayed.companies.flatMap(([, events]) => events);
  // batch 89's consumer units add two: U.S. Bank's own order of 2005-09-02 (IC-27057) and the SEC's
  // case against TD Bank of 2013-09-23 (33-9453), the Rothstein Ponzi scheme
  check("the 30,747 rows of 1995–2026 give 1,148 company days on 370 companies, 559 before 2017, as replayed in full (1,047 on 353 before batch 88's units, 1,146 on 369 before batch 89's)",
    rows.length === 30747 && companyDays.length === 1148 && replayed.companies.length === 370 && companyDays.filter((e) => e.date < "2017").length === 559,
    `${rows.length} rows → ${companyDays.length} on ${replayed.companies.length}, ${companyDays.filter((e) => e.date < "2017").length} before 2017, in ${Date.now() - t0} ms`);
  // batch 88, the 2026-11-02 proposal 4: the listed banks', brokers' and managers' own units
  const replayedOn = (t: string, d: string) => !!replayed.companies.find(([x]) => x === t)?.[1].some((e) => e.date === d);
  check("batch 88's units, on the saved rows: Regions Bank's case of 2009-09-21 on RF, Fifth Third Securities' of 2002-06-18 on FITB, Hilltop Securities' of 2016-02-02 on HTH, Nasdaq's exchange and routing broker of 2013-05-29 on NDAQ",
    replayedOn("RF", "2009-09-21") && replayedOn("FITB", "2002-06-18") && replayedOn("HTH", "2016-02-02") && replayedOn("NDAQ", "2013-05-29"));
  // USB's day of 2005-09-02 is U.S. Bank's own order since batch 89; the Piper caption of that day is not in it
  const usbOn = (d: string) => replayed.companies.find(([x]) => x === "USB")?.[1].find((e) => e.date === d);
  check("  …U.S. Bancorp Piper Jaffray's of 2002-11-05 on USB, and its captions of 2005 and 2010, after Piper's spin-off, not (USB's 2005-09-02 is U.S. Bank's own order, batch 89)",
    replayedOn("USB", "2002-11-05") && usbOn("2005-09-02")?.externalId === "proceeding:IC-27057@2005-09-02" && !/Piper/.test(usbOn("2005-09-02")?.description ?? "Piper") &&
      !replayedOn("USB", "2010-03-19") && RELEASE_NAMES[36104].names.find((n) => /Piper/.test(n.name))?.to === "2003-12-30",
    `${usbOn("2005-09-02")?.externalId ?? "no 2005-09-02 event"}`);
  const rfDay = replayed.companies.find(([x]) => x === "RF")?.[1].find((e) => e.date === "2009-09-21");
  check("a day's row carries every case's key, so another page holding any of the day's cases finds it (\"Also on\", batch 106): RF's 2009-09-21, a litigation release and a proceeding; a day of one case keeps its key",
    rfDay?.externalId === "litigation:LR-21215@2009-09-21,proceeding:33-9065, 34-60699@2009-09-21" && hb[0].externalId === "proceeding:34-63290@2010-11-09",
    rfDay?.externalId ?? "no 2009-09-21 event");
  check("  …Ameriprise Financial Services' of 2009-07-10 on AMP; American Express Financial Advisors' of 2004-02-12 on both AXP and AMP (the owner's call b), its \"(now known as Ameriprise…)\" of 2005-12-01, after the spin-off, on AMP only",
    replayedOn("AMP", "2009-07-10") && replayedOn("AMP", "2004-02-12") && replayedOn("AXP", "2004-02-12") && replayedOn("AMP", "2005-12-01") && !replayedOn("AXP", "2005-12-01"));
  // batch 93, the owner's rule of 2026-11-05 that a case goes on every company it involves: old
  // Johnson Controls' FCPA order of 2016-07-11, two months before it merged into Tyco's record,
  // which took its name, stays on JCI's page (the 2026-11-01 audit's set-aside)
  check("Johnson Controls, Inc.'s order of 2016-07-11 on JCI, the record its business merged into, by the owner's rule",
    pageTakes(row("34-78287", "2016-07-11"), "JCI") && rowOf("JCI")[0] === 833444);
  // The replay above sets the first price aside; ingest reads a company's rows from it on
  // (`secCasesFor`). The owner's calls (b) and (c) reach before it, through the units marked
  // `beforeListing` and those alone (batch 90, the 2026-11-05 audit's finding 2). First prices are
  // Yahoo's firstTradeDate, read 2026-11-05: AMP 2005-09-15, PRU 2001-12-13.
  const floored = (ticker: string, from: string, rowsIn: SecCase[], before = true) => {
    const cik = rowOf(ticker)[0];
    return secCaseEvents(rowsIn, namesOf(ticker), {
      cik,
      from,
      namesOn: (day) => releaseNamesOn(cik, day),
      ...(before ? { namesBefore: (day: string) => releaseNamesBefore(cik, day) } : {}),
    });
  };
  const aefa = row("33-8365", "2004-02-12");
  check("the owner's call (b) on AMP's page with its first price applied: American Express Financial Advisors' case of 2004-02-12, 19 months before AMP listed, through the unit marked to count before listing — and not without the mark",
    floored("AMP", "2005-09-15", [aefa]).length === 1 && floored("AMP", "2005-09-15", [aefa], false).length === 0 &&
      floored("AXP", "1972-06-01", [aefa]).length === 1);
  const pruRows = rows.filter((r) => /Prudential (?:Securities|Equity Group)/.test(r.caption));
  const pruDays = floored("PRU", "2001-12-13", pruRows).map((e) => e.date);
  check("  …and (c) on PRU's: all 19 of Prudential Securities' days, the three before its first price of 2001-12-13 among them (16 without the mark)",
    pruDays.length === 19 && ["2000-04-06", "2001-01-29", "2001-01-30"].every((d) => pruDays.includes(d)) && floored("PRU", "2001-12-13", pruRows, false).length === 16,
    `${pruDays.length}: ${pruDays.slice(-3).join(",")}`);
  const amfs = rows.find((r) => /Ameriprise Financial Services/.test(r.caption) && r.day >= "2009")!;
  check("  …before its first price only a marked unit counts: Ameriprise Financial Services' case, set before AMP listed, is refused; the marked units are these two and batch 93's Synchrony Bank and PayPal",
    floored("AMP", "2005-09-15", [amfs]).length === 1 && floored("AMP", "2005-09-15", [{ ...amfs, day: "2004-01-02" }]).length === 0 &&
      Object.values(RELEASE_NAMES).flatMap((b) => b.names.filter((n) => n.beforeListing).map((n) => `${b.ticker}:${n.name}`)).sort().join() ===
        "AMP:American Express Financial Advisors,PRU:Prudential Securities,PYPL:PayPal,SYF:Synchrony Bank");
  check("  …Prudential Securities' cases on PRU (the owner's call c), none on Prudential plc",
    replayedOn("PRU", "2003-07-10") && replayedOn("PRU", "2006-08-28") && !replayed.companies.some(([t, e]) => t === "PUK" && e.some((x) => /Prudential (?:Securities|Equity)/.test(x.title))));
  check("  …and the namesakes and the units not theirs on no page: Reliance Financial Advisors not RS, Southern Financial Services not SO, Lazard Capital Markets (LFCM's) not LAZ, Fiserv Securities after its sale not FISV",
    !replayedOn("RS", "2014-12-10") && !replayedOn("SO", "2005-01-31") && !replayedOn("LAZ", "2008-10-30") && !replayedOn("FISV", "2005-04-21") &&
      rows.some((r) => r.day === "2008-10-30" && /Lazard Capital Markets/.test(r.caption)) && rows.some((r) => r.day === "2005-04-21" && /Fiserv Securities/.test(r.caption)));
  check("  …each company in one map or the other, each unit with its reason, each day well formed, each ticker the index's (34 companies in batch 88, 56 with batch 89's, 60 with batch 90's, 63 with batch 93's)",
    Object.keys(BANK_UNITS).length === 63 && Object.keys(BANK_UNITS).every((c) => RELEASE_NAMES[Number(c)] === BANK_UNITS[Number(c)]) &&
      Object.values(BANK_UNITS).every((b) => b.names.every((n) => n.why.length > 20 && [n.from, n.to].every((d) => d === undefined || /^\d{4}-\d{2}-\d{2}$/.test(d)))) &&
      Object.entries(BANK_UNITS).every(([cik, b]) => companies.some(([c, t]) => c === Number(cik) && t === b.ticker)));
  const most = Object.fromEntries(replayed.companies.filter(([t]) => ["BAC", "MS", "WFC", "UBS", "JPM", "C", "GS"].includes(t)).map(([t, e]) => [t, e.length]));
  // batch 83 gave BAC 72, MS 66, WFC 47, UBS 46, JPM 46, C 44 on the 30,654 rows; batch 85 adds the
  // banks' own spellings and units (finding 2) and the 93 rows the pages never showed (finding 3)
  const pinned: Record<string, number> = { BAC: 73, MS: 73, WFC: 47, UBS: 47, JPM: 52, C: 49, GS: 20 };
  check("  …Bank of America 73, Morgan Stanley 73, JPMorgan 52, Citigroup 49, Wells Fargo 47, UBS Group 47, Goldman Sachs 20",
    Object.entries(pinned).every(([t, n]) => most[t] === n), JSON.stringify(most));
  // what a fund's series name would take as a party: other firms' cases, every one (finding 1)
  const fundDays = replayed.funds.flatMap(([, events]) => events);
  check("a fund's series name, read as a company's, would take 10 cases on 9 fund pages, every one another firm's (batch 85)",
    fundDays.length === 10 && replayed.funds.length === 9 && fundDays.every((e) => /^SEC (?:litigation release|administrative proceeding): (?:(?:The )?Growth|Income|Select|Tax Exempt|Total Return) Fund\b/.test(e.title)),
    replayed.funds.map(([t, e]) => `${t} ${e.map((x) => x.date).join("/")}`).join(", "));

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

  console.log("\nRows the pages never showed, filled from their months (batch 85, the 2026-11-01 audit's finding 3)");
  // measured: the litigation releases of 2010 count 439 ("1 to 100 of 439 items"); page 2 began
  // with LR-21696, page 1's last row, again, and LR-21695 of the same day was on neither page
  const tiedDb = freshDb();
  const tied = standIn((l, y) => (l === "litigation" && y === 2010 ? 150 : 1), undefined, { totals: true, tie: { listing: "litigation", year: 2010 } });
  const filled = await walkSecCases(fakeDb(tiedDb), { today: TODAY, budget: { left: 10_000 }, gapMs: 0, fetchPage: tied.fetchPage });
  const y2010 = tiedDb.years.get("litigation:2010");
  check("a year whose pages show a row twice and another never reads that row's month alone, and keeps all 150",
    tied.asked.filter((a) => a.startsWith("litigation:2010")).join(",") === "litigation:2010:0,litigation:2010:1,litigation:2010-6:0,litigation:2010-6:1" &&
      [...tiedDb.cases.values()].filter((c) => c.listing === "litigation" && c.day.startsWith("2010")).length === 150 &&
      y2010?.complete === true && y2010.count === 150 && y2010.cases === 150 && !filled.short,
    `${tied.asked.filter((a) => a.startsWith("litigation:2010")).join(",")} → ${y2010?.cases} of ${y2010?.count}`);
  const stillDb = freshDb();
  const tiedMonths = standIn((l, y) => (l === "litigation" && y === 2010 ? 150 : 1), undefined, { totals: true, tie: { listing: "litigation", year: 2010 }, tieInMonths: true });
  const shortWalk = await walkSecCases(fakeDb(stillDb), { today: TODAY, budget: { left: 10_000 }, gapMs: 0, fetchPage: tiedMonths.fetchPage });
  check("  …and where the month's own pages tie too, the year is kept with the 149 shown and the one never shown is reported",
    shortWalk.short === 1 && stillDb.years.get("litigation:2010")?.cases === 149 && stillDb.years.get("litigation:2010")?.complete === true, JSON.stringify(shortWalk.short));
  // a year read before batch 85 kept no count: its first page is asked once to compare
  const oldDb = freshDb();
  for (let y = SEC_CASES_FROM; y <= 2025; y++) for (const l of ["litigation", "proceeding"] as const) oldDb.years.set(`${l}:${y}`, { complete: true, stale: false, pages: 1, cases: 1, count: null });
  oldDb.years.get("litigation:2010")!.cases = 149;
  oldDb.years.set("litigation:2026", { complete: false, stale: false, pages: 1, cases: 1, count: 1 });
  oldDb.years.set("proceeding:2026", { complete: false, stale: false, pages: 1, cases: 1, count: 1 });
  const recount = standIn((l, y) => (l === "litigation" && y === 2010 ? 150 : 1), undefined, { totals: true, tie: { listing: "litigation", year: 2010 } });
  const counted = await walkSecCases(fakeDb(oldDb), { today: TODAY, budget: { left: 10_000 }, gapMs: 0, fetchPage: recount.fetchPage });
  check("a year read before batch 85 is asked its first page once: where the rows kept reach the count, only the count is kept",
    counted.due === years - 2 && recount.asked.filter((a) => a.startsWith("proceeding:")).length === years / 2 - 1 && oldDb.years.get("proceeding:2005")?.count === 1 &&
      oldDb.years.get("proceeding:2005")?.pages === 1, `${counted.due} due, ${recount.asked.length} pages`);
  check("  …and where they fall short (2010's 149 of 150), the year is read again with its month",
    recount.asked.filter((a) => a.startsWith("litigation:2010")).length === 4 && oldDb.years.get("litigation:2010")?.cases === 150 && oldDb.years.get("litigation:2010")?.count === 150);
  const again2 = standIn((l, y) => (l === "litigation" && y === 2010 ? 150 : 1), undefined, { totals: true });
  await walkSecCases(fakeDb(oldDb), { today: TODAY, budget: { left: 10_000 }, gapMs: 0, fetchPage: again2.fetchPage });
  check("  …and none is asked again", again2.asked.length === 0);
  const bare = freshDb();
  await walkSecCases(fakeDb(bare), { today: TODAY, budget: { left: 10_000 }, gapMs: 0, fetchPage: standIn(() => 3).fetchPage });
  const bareAgain = standIn(() => 3);
  await walkSecCases(fakeDb(bare), { today: TODAY, budget: { left: 10_000 }, gapMs: 0, fetchPage: bareAgain.fetchPage });
  check("a page with no count of its own leaves the rows read as the year's count, so the year is not read again", bare.years.get("litigation:2001")?.count === 3 && bareAgain.asked.length === 0);
  check("the count is the page's own footer, \"1 to 100 of 1,012 items\", and none where a page has none",
    listingTotal('<div class="view-footer">\n      1 to 100 of 1,012 items\n    </div>') === 1012 && listingTotal("<table></table>") === undefined);
  check("  …and the months to read again are those of the rows shown twice",
    JSON.stringify(monthsToReread([{ key: "a", day: "2010-10-15" }, { key: "b", day: "2010-03-01" }, { key: "a", day: "2010-10-15" }])) === "[10]");

  console.log("\nA company's cases, from what is kept");
  const kept = freshDb("1990-01-02");
  for (const r of rows) kept.cases.set(caseKey(r), r);
  const ok: CasesWalk = { due: 0, read: 0, pages: 0, cases: 0 };
  const hban = await secCasesFor(fakeDb(kept), 1, { edgarName: "HUNTINGTON BANCSHARES INC /MD/", alsoKnownAs: newsNamesFor(49196), cik: 49196 }, ok);
  check("Huntington's page gets its proceedings of 2005 to 2018, one a day, and its broker-dealer's of 2019 and 2024 (batch 88)",
    hban.outcome === "ok" && hban.events.length === 14 && hban.events.at(-1)!.date === "2005-06-02" && ["2019-03-11", "2024-02-09"].every((d) => hban.events.some((e) => e.date === d)),
    `${hban.events.length}: ${hban.events.map((e) => e.date).join(",")}`);
  const rnr = await secCasesFor(fakeDb(kept), 1, { edgarName: "RENAISSANCERE HOLDINGS LTD", alsoKnownAs: newsNamesFor(rowOf("RNR")[0]), cik: rowOf("RNR")[0] }, ok);
  check("  …a company found by its legal name, whose everyday name dropped \"Holdings\"", rnr.events.map((e) => e.date).join(",") === "2007-02-06");
  kept.renames = [{ until: "2016-07-31", body: "EDGAR's company record lists DANA HOLDING CORP as a former name of this filer, in use until this day." }];
  const dana = await secCasesFor(fakeDb(kept), 1, { edgarName: "DANA INC", alsoKnownAs: [], cik: 26780 }, ok);
  check("  …and by a stored former name, in use that year: Dana Holding Corporation's case of 2009", dana.events.some((e) => e.date === "2009-09-11"), dana.events.map((e) => e.date).join(","));
  kept.renames = [];
  const amp = await secCasesFor(fakeDb({ ...kept, listed: "2005-09-15" }), 1, { edgarName: "Ameriprise Financial, Inc.", alsoKnownAs: newsNamesFor(820027), cik: 820027 }, ok);
  check("  …and from its first price, the owner's call (b) still on it: Ameriprise's page, listed 2005-09-15, carries the case of 2004-02-12 (batch 90)",
    amp.events.some((e) => e.date === "2004-02-12") && amp.events.every((e) => e.date >= "2005-09-15" || e.date === "2004-02-12"), amp.events.map((e) => e.date).join(","));
  const notes = await secCasesFor(fakeDb(kept), 1, { edgarName: "BARCLAYS BANK PLC", alsoKnownAs: [], cik: 312070 }, ok);
  const unpriced = await secCasesFor(fakeDb({ ...kept, listed: null }), 1, { edgarName: "HUNTINGTON BANCSHARES INC /MD/", alsoKnownAs: [], cik: 49196 }, ok);
  const refusedWalk: CasesWalk = { ...ok, stopped: "throttled", failure: { outcome: "throttled", httpStatus: 403, detail: "litigation 2026 page 1" } };
  const still = await secCasesFor(fakeDb(kept), 1, { edgarName: "HUNTINGTON BANCSHARES INC /MD/", alsoKnownAs: [], cik: 49196 }, refusedWalk);
  check("a notes record takes none, a company with no prices none, and a refused walk still gives what is kept and reports the refusal",
    notes.outcome === "empty" && /notes record/.test(notes.detail ?? "") && /^no prices to start from/.test(unpriced.detail ?? "") &&
      still.outcome === "throttled" && still.events.length === 14);
  // "empty" counts as asked for a day; a company first ingested while Yahoo is in back-off would
  // have had none of its cases until the next day (the 2026-11-01 audit's finding 5)
  check("  …and no prices yet is a failure, not \"empty\", so the next run asks again", unpriced.outcome === "error" && unpriced.events.length === 0);
  const fundPlan = (edgarName: string, cik: number) => ({ edgarName, alsoKnownAs: newsNamesFor(cik), cik, fundSeries: true });
  const funds = await Promise.all([fundPlan("GROWTH FUND", 100334), fundPlan("SELECT FUND", 100334), fundPlan("Income Fund", 932381), fundPlan("TAX-EXEMPT FUND", 916620), fundPlan("Total Return Fund", 1659326)]
    .map((plan) => secCasesFor(fakeDb(kept), 1, plan, ok)));
  check("a fund's series takes no case: TWCGX's \"Growth Fund\", TWCIX's \"Select Fund\", FOIPX's, NOTEX's and JHTRX's lose LR-18525, LR-21198, 34-38754, LR-20469 and LR-21121 (batch 85)",
    funds.every((f) => f.outcome === "empty" && f.events.length === 0 && /fund's series/.test(f.detail ?? "")) &&
      ["LR-18525", "LR-21198", "34-38754", "LR-20469", "LR-21121"].every((n) => rows.some((r) => r.number === n)));
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
      /await run\("sec_cases", [^\n]+, async \(\) => \{\s+const walked = await walkSecCases\(client\);[\s\S]{0,400}return secCasesFor\(client, subjectId, \{ edgarName: company\.name, alsoKnownAs, possessive: dojPossessive\(company\.name, possessive\), cik: company\.cik, fundSeries \}, walked\);/.test(ingest) &&
      /const fundSeries = fundSeriesId\(company\.ticker\) !== null;/.test(ingest) &&
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
