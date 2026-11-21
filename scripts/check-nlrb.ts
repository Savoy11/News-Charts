/**
 * The NLRB's Board decisions (batch 161, the 2026-11-18 proposal 2, approved by the owner that day with call
 * (a): a row from the listing alone).
 *
 *   npm run check:nlrb
 *
 * Offline: the listing's pages the opportunity scout read on 2026-11-18 (scripts/fixtures/nlrb-listing.json.gz:
 * page 0's and the last page's table and pager as served, and the table of 24 pages of the 667), and the first
 * trading days the other checks' fixtures carry.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { PoolClient } from "pg";
import tickerIndex from "../data/edgar-tickers.json";
import { GROUPED_ROW_SOURCES } from "../lib/corroboration";
import { ALSO_ON_SOURCES } from "../lib/alsoOn";
import { UNITS as CPSC_UNITS } from "../lib/cpscRecalls";
import { dojPossessive } from "../lib/doj";
import { EEOC_UNITS } from "../lib/eeoc";
import { andSpellings, withoutTag } from "../lib/edgarName";
import { deterministicScore } from "../lib/enrich/relevance";
import { UNITS as EPA_UNITS, epaParty } from "../lib/epaCases";
import { companyNames } from "../lib/frCompany";
import { namesForYear } from "../lib/ingest/frBackfill";
import { LIST_PAGES, nlrbFor, walkNlrb, type NlrbWalk } from "../lib/ingest/nlrbWalk";
import { QUOTAS } from "../lib/ingest/quota";
import { SOURCE_TTL_MINUTES } from "../lib/ingest/refresh";
import { SOURCES } from "../lib/ingest/store";
import { respondents } from "../lib/cfpb";
import {
  ACT_DAY,
  NLRB_PAGE_SIZE,
  NLRB_UNITS,
  NOT_THE_COMPANY,
  fetchNlrbPage,
  inNightWindow,
  nlrbDocumentUrl,
  nlrbEvents,
  nlrbKind,
  nlrbPageUrl,
  parseNlrbListing,
  type NlrbAnswer,
  type NlrbDecision,
} from "../lib/nlrbDecisions";
import { releaseNamesOn } from "../lib/releaseNames";
import { newsNamesFor, possessiveNameFor } from "../lib/sec";
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

/** The sample's own counts, as batch 161 read them from the 24 pages of 2026-11-18. */
const EXPECTED = {
  decisions: 2_345,
  kinds: { ulp: 1_332, representation: 811, none: 202 },
  // every listed company in the index, under the rule, its names as the replay below builds them
  total: 87,
  companies: 54,
  // from first prices, for the companies the fixtures read
  fromFirst: 39,
  fromFirstPages: 23,
  top: "KR 7, GE 4, ETR 3, BUD 2, CAT 2, GT 2, LMT 2, XOM 2",
};

const companies = (tickerIndex as unknown as { companies: [number, string, string][] }).companies;
const titleOf = (cik: number) => companies.find((c) => c[0] === cik)![2];
/** A company's names of a year as ingest builds them, less the former names only the database holds. */
const namesOf = (cik: number) => (year: number) => {
  const title = titleOf(cik);
  const own = dojPossessive(title, possessiveNameFor(cik));
  return [...companyNames(title, namesForYear(year, newsNamesFor(cik), [])), ...(own ? [own] : []), withoutTag(title)];
};

const fixture = JSON.parse(gunzipSync(readFileSync(join(__dirname, "fixtures", "nlrb-listing.json.gz"))).toString()) as {
  provenance: string;
  pages: Record<string, string>;
  samplePages: string[];
  html: Record<string, string>;
};
const sample = [...new Map(Object.values(fixture.html).flatMap((h) => parseNlrbListing(h).decisions).map((d) => [d.document, d])).values()];
const on = (cik: number, from = "") => nlrbEvents(sample, namesOf(cik), { cik, from, namesOn: (d) => releaseNamesOn(cik, d) });
const find = (document: string) => sample.find((d) => d.document === document)!;

async function main(): Promise<void> {
  console.log("The Board's listing");
  const p0 = parseNlrbListing(fixture.pages["0"]);
  const last = parseNlrbListing(fixture.pages["666"]);
  check("page 0 holds 100 decisions, newest first, the pager naming page 666 as the last",
    p0.table && p0.decisions.length === NLRB_PAGE_SIZE && p0.lastPage === 666 &&
      JSON.stringify(p0.decisions[0]) === JSON.stringify({ document: "09031d45843ede05", day: "2026-11-12", citation: "375 NLRB No. 68", name: "Blick Art Materials, LLC", caseNumber: "13-CA-393585" }),
    p0.decisions[0]);
  const glove = last.decisions.find((d) => d.document === "09031d458009d191");
  check("  …the last page 45, with no last page of its own, a bound volume's citation without its leading zeros (\"001 NLRB 519\")",
    last.table && last.decisions.length === 45 && last.lastPage === null &&
      JSON.stringify(glove) === JSON.stringify({ document: "09031d458009d191", day: "1936-04-10", citation: "1 NLRB 519", name: "Canvas Glove Manufacturing Works, Inc.", caseNumber: "00-C-000024" }),
    glove);
  const blank = parseNlrbListing("<html><body>Access Denied</body></html>");
  check("  …and a page without the listing is no listing at all, not an empty page", !blank.table && blank.decisions.length === 0 && blank.lastPage === null);
  const pages = Object.entries(fixture.html).map(([p, h]) => [p, parseNlrbListing(h).decisions.length] as const);
  check(`the scout's 24 pages: every page but the last full, ${EXPECTED.decisions.toLocaleString("en-US")} decisions, each once`,
    fixture.samplePages.length === 24 && pages.every(([p, n]) => n === (p === "666" ? 45 : 100)) && sample.length === EXPECTED.decisions,
    `${sample.length}; ${pages.filter(([p, n]) => n !== (p === "666" ? 45 : 100)).join(" ")}`);
  check("  …each with its document, its day, its citation, its caption with the page's codes read (\"Goodyear Tire & Rubber Co.\", and \"Santa Fe Hotel &amp;amp; Casino\" written twice over) and its case number",
    sample.every((d) => /^[0-9a-f]{16}$/.test(d.document) && /^\d{4}-\d{2}-\d{2}$/.test(d.day) && /^\d+ NLRB (?:No\. )?\d+$/.test(d.citation) && d.name && !/&amp;|&#|<|>/.test(d.name) && /^(?:\d{1,2}[A-Z]?-[A-Z]{1,2}-\d{5,6}|AO-\d+)$/.test(d.caseNumber)) &&
      sample.some((d) => d.name === "Goodyear Tire & Rubber Co.") && sample.some((d) => d.name === "Santa Fe Hotel & Casino"),
    sample.find((d) => /&amp;|&#|<|>/.test(d.name) || !/^\d+ NLRB (?:No\. )?\d+$/.test(d.citation) || !/^(?:\d{1,2}[A-Z]?-[A-Z]{1,2}-\d{5,6}|AO-\d+)$/.test(d.caseNumber)));
  check("  …and a page's address every volume's, 100 a page", nlrbPageUrl(3) === "https://www.nlrb.gov/cases-decisions/decisions/board-decisions?volume=-1&items_per_page=100&page=3" &&
    nlrbDocumentUrl("09031d45843ede05") === "https://apps.nlrb.gov/link/document.aspx/09031d45843ede05");

  console.log("\nThe case's kind");
  const kinds = sample.reduce<Record<string, number>>((m, d) => ((m[nlrbKind(d.caseNumber) ?? "none"] = (m[nlrbKind(d.caseNumber) ?? "none"] ?? 0) + 1), m), {});
  check(`the sample's ${EXPECTED.kinds.ulp.toLocaleString("en-US")} cases against employers, ${EXPECTED.kinds.representation} representation cases and ${EXPECTED.kinds.none} that are no employer's case`,
    JSON.stringify(kinds) === JSON.stringify({ ulp: EXPECTED.kinds.ulp, representation: EXPECTED.kinds.representation, none: EXPECTED.kinds.none }) ||
      (kinds.ulp === EXPECTED.kinds.ulp && kinds.representation === EXPECTED.kinds.representation && kinds.none === EXPECTED.kinds.none),
    kinds);
  check("  …CA, and C before 1948, a case against the employer; RC, RD, RM, R and RE before 1948, UA, UC, UD and AC one at it (\"15M-R-00077\" too)",
    nlrbKind("13-CA-393585") === "ulp" && nlrbKind("00-C-000024") === "ulp" &&
      ["19-RC-295849", "36-RD-001724", "28-RM-000394", "13-R-004309", "15M-R-00077", "5W-R-00055", "19-RE-000020", "09-UA-001496", "12-UC-203052", "04-UD-000002", "03-AC-000042"].every((n) => nlrbKind(n) === "representation"));
  check("  …and a case against a union (CB, CC, CD, CE, CG, CP), an advisory opinion or a fee application none",
    ["25-CB-008896", "19-CC-092816", "18-CD-352973", "20-CE-000068", "29-CG-000027", "20-CP-000565", "00-AO-000268", "AO-312", "19-ED-002087", "00-AA-000000", ""].every((n) => nlrbKind(n) === null));

  console.log("\nThe night window for bulk reads, 11 pm to 6 am Eastern");
  check("23:30 Eastern in November and in July is in it; 7 am Eastern is not",
    inNightWindow(new Date("2026-11-21T04:30:00Z")) && inNightWindow(new Date("2026-07-01T03:30:00Z")) && !inNightWindow(new Date("2026-11-21T12:00:00Z")));
  check("  …from 23:00 exactly, 22:59 not; a whole read begun with 45 minutes left (05:00 yes, 05:30 no)",
    inNightWindow(new Date("2026-11-21T04:00:00Z")) && !inNightWindow(new Date("2026-11-21T03:59:00Z")) && inNightWindow(new Date("2026-11-21T10:00:00Z")) && !inNightWindow(new Date("2026-11-21T10:30:00Z")));

  console.log("\nThe rule");
  const tesla = on(1318605, "2010-06-29");
  check("Tesla's decision of 2026-10-28 is one row on TSLA, its citation, caption, case number and kind, linked to the decision",
    tesla.length === 1 && tesla[0].date === "2026-10-28" &&
      tesla[0].title === "NLRB decision: Tesla, Inc., 375 NLRB No. 63 (case 03-CA-312352), an unfair labor practice case against the employer" &&
      tesla[0].url === "https://apps.nlrb.gov/link/document.aspx/09031d45843cb301" && tesla[0].source === "NLRB" && tesla[0].sourceKey === "nlrb_decisions" && tesla[0].type === "regulation" &&
      tesla[0].externalId === "09031d45843cb301" && tesla[0].dedupBasis === "nlrb:1318605@2026-10-28",
    tesla[0]);
  check("  …saying the listing does not give the ruling (the owner's call (a))",
    tesla[0]?.description === "375 NLRB No. 63, Tesla, Inc., case 03-CA-312352: an unfair labor practice case against the employer. How the Board ruled is in the decision; the Board's listing does not say.",
    tesla[0]?.description);
  const kr = on(56873);
  check("Kroger's own companies are Kroger's: Fred Meyer, \"a subsidiary of The Kroger Company\" (2026-09-30), Ralphs (2026-08-10), its partnerships",
    ["2026-09-30", "2026-08-10", "2026-07-23", "2026-05-20", "2019-06-18", "2010-08-18", "2010-05-07", "1959-03-13"].every((d) => kr.some((e) => e.date === d)) && kr.length === 8,
    kr.map((e) => e.date));
  check("  …and a case against Kroger's union (\"UFCW, LOCAL 700 (KROGER)\", 25-CB-008896, 2014-09-10) is no row, though its caption names Kroger",
    !kr.some((e) => e.date === "2014-09-10") && nlrbEvents([find("09031d458188496a")], namesOf(56873), { cik: 56873 }).length === 0 &&
      nlrbEvents([{ ...find("09031d458188496a"), caseNumber: "25-CA-008896", name: "Kroger Co." }], namesOf(56873), { cik: 56873 }).length === 1);
  const wpl = find("09031d4580086d30");
  check("Wisconsin Power and Light Co. (1938) is Alliant's (LNT, its operating company), never Light S.A.'s: \"Power and Light Co.\" is one name",
    on(352541).some((e) => e.date === "1938-03-31") && nlrbEvents([wpl], namesOf(1447221), { cik: 1447221 }).length === 0 && epaParty(respondents(wpl.name), ["Light"]) === null);
  const shell = find("09031d45800b9ced");
  check("\"Shell Co.\" of 1994-03-01, the Puerto Rico company, is not Shell plc's (`NOT_THE_COMPANY`), though the rule reads Shell in it",
    !on(1306965).some((e) => e.date === "1994-03-01") && nlrbEvents([shell], namesOf(1306965), { cik: 999999999 }).length === 1 && NOT_THE_COMPANY[1306965][0].name.test(shell.name));
  const steel = find("09031d45800a98df");
  check("  …nor National Steel Corp. (1973) Companhia Siderúrgica Nacional's",
    nlrbEvents([steel], namesOf(1049659), { cik: 1049659 }).length === 0 && nlrbEvents([steel], namesOf(1049659), { cik: 999999999 }).length === 1);
  const cyh = on(1108109);
  check("the units the listing names the company by are its (`NLRB_UNITS`): CHS Community Health Systems on CYH (2014-08-25), which the rule alone refuses",
    cyh.some((e) => e.date === "2014-08-25") && epaParty(respondents(find(cyh.find((e) => e.date === "2014-08-25")!.externalId!).name), namesOf(1108109)(2014)) === null);
  check("  …Amazon.com Services on AMZN (2026-07-02), Walt Disney Parks and Resorts on DIS (2019-01-25), Lockheed Martin's companies on LMT",
    on(1018724).some((e) => e.date === "2026-07-02") && on(1744489).some((e) => e.date === "2019-01-25") && ["2000-08-25", "2000-07-24"].every((d) => on(936468).some((e) => e.date === d)));
  check("  …and the units EPA's rule reads, on their days: Appalachian Power on AEP (1973), Exxon Pipeline on XOM (1978), Occidental Chemical on OXY (1989)",
    on(4904).some((e) => e.date === "1973-06-14") && on(2115436).some((e) => e.date === "1978-09-29") && on(797468).some((e) => e.date === "1989-05-31"));
  const misdated = find("09031d4580072d1f");
  check(`a decision the listing dates before the Act (${ACT_DAY}), "Earl McMillian Co." of "02/14/1919" (81 NLRB 639), makes no row`,
    nlrbEvents([misdated], () => ["Earl McMillian"], { cik: 999999999 }).length === 0 && nlrbEvents([{ ...misdated, day: "1949-02-14" }], () => ["Earl McMillian"], { cik: 999999999 }).length === 1);
  const jci: NlrbDecision = { document: "0000000000000001", day: "2010-03-01", citation: "355 NLRB 1", name: "Johnson Controls, Inc.", caseNumber: "07-CA-000001" };
  check("a name Tyco's record took from Johnson Controls (2016-09-02) is that company's before the day (lib/takenNames.ts)",
    nlrbEvents([jci], namesOf(833444), { cik: 833444 }).length === 0 && nlrbEvents([{ ...jci, day: "2017-03-01" }], namesOf(833444), { cik: 833444 }).length === 1);
  const sbux = on(829224);
  const two = sbux.find((e) => e.date === "2026-09-30");
  check("a company's decisions of a day are one row: Starbucks' two of 2026-09-30, each in the description, its id their documents",
    /^2 NLRB decisions: Starbucks Corporation$/.test(two?.title ?? "") && (two?.description?.match(/Starbucks Corporation, case /g) ?? []).length === 2 && two?.externalId?.split(",").length === 2,
    two);
  const joint: NlrbDecision = { document: "0000000000000002", day: "2014-09-15", citation: "361 NLRB 439", name: "Ford Motor Co. and General Motors Corp., Joint Employers", caseNumber: "05-CA-031828" };
  const f = nlrbEvents([joint], namesOf(37996), { cik: 37996 });
  const gm = nlrbEvents([joint], namesOf(1467858), { cik: 1467858 });
  check("  …and joint employers' one decision is on each page, with the same id, so each says it is \"Also on\" the other",
    f.length === 1 && gm.length === 1 && f[0].externalId === gm[0].externalId && f[0].externalId === "0000000000000002" &&
      ALSO_ON_SOURCES.includes("nlrb_decisions") && GROUPED_ROW_SOURCES.includes("nlrb_decisions"));
  check("  …from the company's first price on", on(1467858, "2010-11-18").every((e) => e.date >= "2010-11-18") && on(1467858).some((e) => e.date === "1994-03-02"));

  console.log("\nEvery listed company");
  const alnum = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  const first: Record<string, string> = {};
  for (const [file, k] of [["digest-1985-entries.json.gz", "firstPrices"], ["eeoc-listing.json.gz", "first"], ["fda-device-recalls.json.gz", "first"], ["occ-actions.json.gz", "first"]] as const) {
    Object.assign(first, JSON.parse(gunzipSync(readFileSync(join(__dirname, "fixtures", file))).toString())[k]);
  }
  const letters = sample.map((d) => alnum(d.name));
  const years = Array.from({ length: 92 }, (_, k) => `${1935 + k}-07-01`);
  const rows: { ticker: string; date: string; first: string | null }[] = [];
  const seen = new Set<number>();
  for (const [cik, ticker] of companies) {
    if (seen.has(cik)) continue;
    seen.add(cik);
    // a cheap first pass over the company's names in any year and its units on any day; the rule itself decides
    const pre = [...new Set([...namesOf(cik)(2026), ...years.flatMap((d) => releaseNamesOn(cik, d)), ...(EEOC_UNITS[cik] ?? []).flatMap((u) => u.names)].flatMap(andSpellings).map(alnum).filter((n) => n.length >= 3))];
    const units = [...(NLRB_UNITS[cik] ?? []).map((u) => u.name), ...(EPA_UNITS[cik] ?? []).map((u) => u.defendant), ...(CPSC_UNITS[cik] ?? []).map((u) => u.firm)];
    const mine = sample.filter((d, j) => pre.some((p) => letters[j].includes(p)) || units.some((u) => u.test(d.name.trim())));
    if (!mine.length) continue;
    for (const e of nlrbEvents(mine, namesOf(cik), { cik, namesOn: (d) => releaseNamesOn(cik, d) })) rows.push({ ticker, date: e.date, first: first[ticker] ?? null });
  }
  const after = rows.filter((r) => r.first && r.date >= r.first);
  const top = Object.entries(after.reduce<Record<string, number>>((m, r) => ((m[r.ticker] = (m[r.ticker] ?? 0) + 1), m), {}))
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([t, n]) => `${t} ${n}`)
    .join(", ");
  check(`before any first price: ${EXPECTED.total} company days on ${EXPECTED.companies} companies in the 24 pages`,
    rows.length === EXPECTED.total && new Set(rows.map((r) => r.ticker)).size === EXPECTED.companies, `${rows.length} on ${new Set(rows.map((r) => r.ticker)).size}`);
  check(`  …from first prices: ${EXPECTED.fromFirst} on ${EXPECTED.fromFirstPages} pages (${EXPECTED.top})`,
    after.length === EXPECTED.fromFirst && new Set(after.map((r) => r.ticker)).size === EXPECTED.fromFirstPages && top === EXPECTED.top,
    `${after.length} on ${new Set(after.map((r) => r.ticker)).size}; ${top}`);

  console.log("\nRead whole once a year at night, its newest page once a day");
  const listing = sample.slice().sort((a, b) => b.day.localeCompare(a.day) || b.document.localeCompare(a.document));
  const lastPage = Math.ceil(listing.length / NLRB_PAGE_SIZE) - 1;
  const served: number[] = [];
  const serve = async (page: number): Promise<NlrbAnswer> => {
    served.push(page);
    return { decisions: listing.slice(page * NLRB_PAGE_SIZE, page * NLRB_PAGE_SIZE + NLRB_PAGE_SIZE), lastPage: page === lastPage ? null : lastPage, outcome: "ok", httpStatus: 200 };
  };
  const night = new Date("2026-11-22T05:00:00Z");
  const day = new Date("2026-11-22T17:00:00Z");
  const db: FakeDb = { decisions: new Map(), reads: new Map(), listed: "1962-01-02" };
  const early = await walkNlrb(fakeDb(db), { budget: { left: 720 }, gapMs: 0, fetchPage: serve, now: day });
  check("a first run by day asks nothing: the whole listing waits for the night window",
    early.due === null && early.pages === 0 && !early.whole && served.length === 0 && /night window, 11 pm to 6 am Eastern/.test(early.stopped ?? ""), JSON.stringify(early));
  const whole = await walkNlrb(fakeDb(db), { budget: { left: 720 }, gapMs: 0, fetchPage: serve, now: night });
  check("  …at night it reads every page and keeps every decision once",
    whole.due === "list" && whole.whole && whole.pages === lastPage + 1 && db.decisions.size === EXPECTED.decisions && served.join(",") === Array.from({ length: lastPage + 1 }, (_, k) => k).join(","), JSON.stringify(whole));
  const same = await walkNlrb(fakeDb(db), { budget: { left: 720 }, gapMs: 0, fetchPage: serve, now: night });
  check("  …a run the same day asks nothing", same.due === null && same.whole && served.length === lastPage + 1);
  for (const r of db.reads.values()) r.ageDays = 2;
  const newest = await walkNlrb(fakeDb(db), { budget: { left: 720 }, gapMs: 0, fetchPage: serve, now: day });
  check("  …a day on, by day, the newest page alone, which holds a decision already kept", newest.due === "newest" && newest.pages === 1 && newest.whole && served.at(-1) === 0, JSON.stringify(newest));
  for (const r of db.reads.values()) r.ageDays = 366;
  const yearDay = await walkNlrb(fakeDb(db), { budget: { left: 720 }, gapMs: 0, fetchPage: serve, now: day });
  const yearNight = await walkNlrb(fakeDb(db), { budget: { left: 720 }, gapMs: 0, fetchPage: serve, now: night });
  check("  …a year on, the newest page by day and the whole listing again at night", yearDay.due === "newest" && yearDay.pages === 1 && yearNight.due === "list" && yearNight.pages === lastPage + 1);
  const short = await walkNlrb(fakeDb({ decisions: new Map(), reads: new Map(), listed: null }), { budget: { left: LIST_PAGES - 1 }, gapMs: 0, fetchPage: serve, now: night });
  check("  …the whole listing is begun only with its pages left in the run", short.stopped === "this run's pages are spent" && short.pages === 0);
  const fresh = (): FakeDb => ({ decisions: new Map(), reads: new Map(), listed: null });
  const refusedDb = fresh();
  const refused = await walkNlrb(fakeDb(refusedDb), {
    budget: { left: 720 },
    gapMs: 0,
    now: night,
    fetchPage: async (p) => (p === 5 ? { decisions: [], lastPage: null, outcome: "throttled", httpStatus: 429 } : serve(p)),
  });
  check("  …a refused page stops the read and keeps nothing of it", refused.failure?.httpStatus === 429 && /page 5/.test(refused.failure.detail ?? "") && refusedDb.decisions.size === 0 && !refused.whole, JSON.stringify(refused));
  const cutDb = fresh();
  const cut = await walkNlrb(fakeDb(cutDb), {
    budget: { left: 720 },
    gapMs: 0,
    now: night,
    fetchPage: async (p) => (p === 7 ? { ...(await serve(p)), decisions: listing.slice(700, 760) } : serve(p)),
  });
  check("  …and a short page before the last is a cut listing, not its end", cut.failure?.outcome === "error" && /page 7: 60 decisions, not 100/.test(cut.failure.detail ?? "") && cutDb.decisions.size === 0, JSON.stringify(cut));
  const real = globalThis.fetch;
  const asked: { url: string; ua: string }[] = [];
  let denied: NlrbAnswer;
  let busy: NlrbAnswer;
  try {
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      asked.push({ url: String(url), ua: String((init?.headers as Record<string, string>)?.["User-Agent"] ?? "") });
      return new Response("<html><body>Access Denied</body></html>", { status: 200 });
    }) as typeof fetch;
    denied = await fetchNlrbPage(4);
    globalThis.fetch = (async () => new Response("", { status: 429 })) as typeof fetch;
    busy = await fetchNlrbPage(4);
  } finally {
    globalThis.fetch = real;
  }
  check("  …a page without the listing is an error, a 429 a throttle; the page asked by its address, with the project's User-Agent",
    denied.outcome === "error" && denied.detail === "no listing on the page" && busy.outcome === "throttled" && busy.httpStatus === 429 &&
      asked[0]?.url === nlrbPageUrl(4) && /^News Charts Research\b/.test(asked[0]?.ua ?? ""),
    // the User-Agent carries the contact address when one is set: never printed
    { denied, busy, asked: asked.map((a) => a.url) });

  console.log("\nAt ingest");
  const plan = (cik: number) => ({ edgarName: titleOf(cik), alsoKnownAs: newsNamesFor(cik), possessive: dojPossessive(titleOf(cik), possessiveNameFor(cik)), cik });
  const read1: NlrbWalk = { due: null, pages: 0, decisions: 0, whole: true };
  const krIngest = await nlrbFor(fakeDb({ ...db, listed: "1962-01-02" }), 1, plan(56873), read1);
  check("a company's kept decisions from its first price, as a complete answer once the whole listing is held",
    krIngest.outcome === "ok" && krIngest.events.length === 7 && krIngest.events.every((e) => e.date >= "1962-01-02") && !!krIngest.complete, `${krIngest.outcome} ${krIngest.events.length}`);
  const partial = await nlrbFor(fakeDb({ ...db, listed: "1962-01-02" }), 1, plan(56873), { due: "newest", pages: 1, decisions: 3, whole: false });
  const waiting = await nlrbFor(fakeDb({ decisions: new Map(), reads: new Map(), listed: "1962-01-02" }), 1, plan(56873), early);
  check("  …and before the whole listing is held, the newest pages' alone, never complete, saying why",
    !partial.complete && partial.outcome === "ok" && partial.detail === "the whole listing is not yet read" && !waiting.complete && waiting.outcome === "empty" && /night window/.test(waiting.detail ?? ""),
    { partial: partial.detail, waiting: waiting.detail });
  const none = await nlrbFor(fakeDb({ ...db, listed: null }), 1, plan(56873), read1);
  const fund = await nlrbFor(fakeDb(db), 1, { ...plan(56873), fundSeries: true }, read1);
  check("  …asked again while it has no prices, and none for a fund's series", none.outcome === "error" && /no prices/.test(none.detail ?? "") && fund.events.length === 0 && fund.outcome === "empty");

  console.log("\nRegistered, licensed, wired");
  const src = SOURCES.find((s) => s.key === "nlrb_decisions");
  check("the source is id 44, the Board's own work, cleared for commercial use, reviewed 2026-11-18, credited to the National Labor Relations Board",
    src?.id === 44 && /17 U\.S\.C\. § 105/.test(src.license) && src.commercialOk && src.reviewedOn === "2026-11-18" && src.attribution === "National Labor Relations Board", src);
  check("  …the Board's disclaimer and bulk-data policy quoted where they are kept",
    /may not reflect official positions of the NLRB/.test(read("lib/nlrbDecisions.ts").replace(/\s*\*\s*/g, " ")) && /between 11pm EST – 6am EST/.test(read("lib/nlrbDecisions.ts").replace(/\s*\*\s*/g, " ")) &&
      /between 11pm EST – 6am EST/.test(read("lib/ingest/store.ts")));
  check("  …a company source, quota and refresh noted, scored without the model",
    (COMPANY_SOURCES as readonly string[]).includes("nlrb_decisions") && QUOTAS.nlrb_decisions.perDay === null && SOURCE_TTL_MINUTES.nlrb_decisions === 1440 &&
      deterministicScore({ eventId: 0, kind: "regulation", title: "NLRB decision: Tesla, Inc.", sourceKey: "nlrb_decisions" }, { kind: "company", displayName: "Tesla", ticker: "TSLA" }, ["tesla"])?.score === 0.95);
  check("  …company ingest walks the listing, then keeps the company's decisions",
    /await run\("nlrb_decisions", [^\n]+\n\s*const walked = await walkNlrb\(client\);[\s\S]{0,400}return nlrbFor\(client, subjectId, \{[^}]*cik: company\.cik, fundSeries \}, walked\);/.test(read("scripts/ingest.ts")));
  check("  …into tables of its own (db/054), and credited",
    /CREATE TABLE IF NOT EXISTS nlrb_decisions \(\s*document\s+text PRIMARY KEY/.test(read("db/054_nlrb_decisions.sql")) && /CREATE TABLE IF NOT EXISTS nlrb_reads/.test(read("db/054_nlrb_decisions.sql")) &&
      /decisions from the National Labor Relations Board/.test(read("app/layout.tsx").replace(/\s+/g, " ")) &&
      /the National Labor Relations Board/.test(read("app/legal/terms/page.tsx").replace(/\s+/g, " ")) &&
      /\| National Labor Relations Board \|/.test(read("README.md")));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  process.exit(fail ? 1 : 0);
}

interface FakeDb {
  decisions: Map<string, NlrbDecision>;
  reads: Map<"list" | "newest", { ageDays: number }>;
  listed: string | null;
}
function fakeDb(db: FakeDb): PoolClient {
  return {
    query: async (sql: string, params: unknown[] = []) => {
      const s = sql.trim().replace(/\s+/g, " ");
      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(s)) return { rows: [] };
      if (s === "SELECT kind, read_at < now() - make_interval(days => 365) AS old, read_at < now() - interval '1 day' AS stale FROM nlrb_reads") {
        return { rows: [...db.reads].map(([kind, r]) => ({ kind, old: r.ageDays > 365, stale: r.ageDays > 1 })) };
      }
      if (s === "SELECT document FROM nlrb_decisions") return { rows: [...db.decisions.keys()].map((document) => ({ document })) };
      if (/^INSERT INTO nlrb_decisions \(document, day, citation, case_name, case_number\) SELECT \* FROM unnest/.test(s)) {
        const [documents, days, citations, names, numbers] = params as string[][];
        documents.forEach((document, i) => db.decisions.set(document, { document, day: days[i], citation: citations[i], name: names[i], caseNumber: numbers[i] }));
        return { rows: [], rowCount: documents.length };
      }
      if (/^INSERT INTO nlrb_reads/.test(s)) {
        db.reads.set(params[0] as "list" | "newest", { ageDays: 0 });
        return { rows: [] };
      }
      if (s === 'SELECT document, day::text AS day, citation, case_name AS name, case_number AS "caseNumber" FROM nlrb_decisions ORDER BY day, document') {
        return { rows: [...db.decisions.values()].sort((a, b) => a.day.localeCompare(b.day) || a.document.localeCompare(b.document)) };
      }
      if (/FROM prices/.test(s)) return { rows: [{ listed: db.listed }] };
      if (/FROM events e/.test(s)) return { rows: [] };
      throw new Error(`unexpected query: ${s.slice(0, 80)}`);
    },
  } as unknown as PoolClient;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
