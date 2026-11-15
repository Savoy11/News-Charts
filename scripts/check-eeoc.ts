import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { PoolClient } from "pg";
import tickerIndex from "../data/edgar-tickers.json";
import { dojPossessive } from "../lib/doj";
import {
  EEOC_LIST,
  EEOC_UNITS,
  NOT_THE_COMPANY,
  dayInText,
  dayOnPage,
  eeocEvents,
  eeocNamesParty,
  eeocUnitNamesAsked,
  fetchEeocPage,
  franchiseeInLead,
  leadOf,
  longDay,
  parseEeocList,
  type EeocAnswer,
  type EeocRelease,
} from "../lib/eeoc";
import { withoutTag } from "../lib/edgarName";
import { deterministicScore } from "../lib/enrich/relevance";
import { companyNames } from "../lib/frCompany";
import { GROUPED_ROW_SOURCES } from "../lib/corroboration";
import { LIST_PAGES, eeocFor, readUndatedDays, walkEeoc, type EeocWalk } from "../lib/ingest/eeocWalk";
import { namesForYear } from "../lib/ingest/frBackfill";
import { QUOTAS } from "../lib/ingest/quota";
import { SOURCE_TTL_MINUTES } from "../lib/ingest/refresh";
import { SOURCES } from "../lib/ingest/store";
import { isNotesRecord, releaseNamesAsked, releaseNamesBefore, releaseNamesOn } from "../lib/releaseNames";
import { newsNamesFor, possessiveNameFor } from "../lib/sec";
import type { TimelineEvent } from "../lib/types";
import { COMPANY_SOURCES } from "./ingest";

/**
 * The EEOC's suits and settlements on the pages of the companies they name (batch 152, the
 * 2026-11-15 proposal 1, approved by the owner that day).
 *
 *   npm run check:eeoc
 *
 * Replays the Commission's whole newsroom listing as served on 2026-11-15
 * (scripts/fixtures/eeoc-listing.json.gz): every release parsed, six pages as served, the own pages
 * of the three undated releases the rule keeps, and the first prices of the pages concerned. Offline:
 * the site and the database are stood in for. On main none of it runs: lib/eeoc.ts does not exist.
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
const FX: { provenance: string; releases: EeocRelease[]; raw: Record<string, string>; pages: Record<string, string>; first: Record<string, string> } = JSON.parse(
  gunzipSync(readFileSync(join(root, "scripts/fixtures/eeoc-listing.json.gz"))).toString("utf8"),
);
const releases = FX.releases;
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
const letters = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const titleLetters = new Map(releases.map((r) => [r, letters(r.title)]));
/** A company's rows as ingest keeps them, from `from` on (its first price where the fixture has one, given "first"). */
function on(ticker: string, from = ""): TimelineEvent[] {
  const [cik, , title] = rowOf(ticker);
  const namesIn = namesOf(ticker);
  const memo = new Map<number, string[]>();
  const yearNames = (y: number) => memo.get(y) ?? (memo.set(y, namesIn(y)), memo.get(y)!);
  const keys = [...new Set([...namesIn(1996), ...namesIn(2005), ...namesIn(2015), ...namesIn(2026), ...releaseNamesAsked(cik), ...eeocUnitNamesAsked(cik)].map(letters).filter((k) => k.length >= 2))];
  const held = releases.filter((r) => keys.some((k) => titleLetters.get(r)!.includes(k)));
  return eeocEvents(held, companyNames(title, newsNamesFor(cik)), {
    cik,
    from: from === "first" ? (FX.first[ticker] ?? "") : from,
    namesOn: (day) => [...yearNames(Number(day.slice(0, 4))), ...releaseNamesOn(cik, day)],
    namesBefore: (day) => releaseNamesBefore(cik, day),
  });
}
const rowsOn = new Map<string, TimelineEvent[]>();
const at = (ticker: string) => rowsOn.get(ticker) ?? (rowsOn.set(ticker, on(ticker)), rowsOn.get(ticker)!);
const lands = (ticker: string, day: string, title: RegExp) => at(ticker).some((e) => e.date === day && (title.test(e.title) || title.test(e.description ?? "")));
const has = (ticker: string, path: string) => at(ticker).some((e) => (e.externalId ?? "").split(",").includes(path));

async function main(): Promise<void> {
  console.log("\nThe listing");
  const p0 = parseEeocList(FX.raw["0"]);
  const p272 = parseEeocList(FX.raw["272"]);
  const p177 = parseEeocList(FX.raw["177"]);
  const p317 = parseEeocList(FX.raw["317"]);
  check("a page gives its 24 releases and the listing's own count, 7,625; the last page 17",
    p0.releases.length === 24 && p0.total === 7625 && parseEeocList(FX.raw["100"]).releases.length === 24 && p317.releases.length === 17 && p317.total === 7625,
    `${p0.releases.length}, ${p0.total}; ${p317.releases.length}`);
  check("  …the oldest releases' addresses, \"/index%2ephp/newsroom/…\", read as \"/newsroom/…\", and a policy notice's \"/node/3463\" kept: every release of the 318 pages, none twice",
    p272.releases.length === 24 && p272.releases.every((r) => /^\/(?:newsroom\/|node\/\d+$)/.test(r.path)) && parseEeocList(FX.raw["303"]).releases.length === 24 &&
      p177.releases.some((r) => r.path === "/node/3463") && releases.length === 7625 && new Set(releases.map((r) => r.path)).size === 7625,
    `${p272.releases.length}; ${releases.length} releases, ${new Set(releases.map((r) => r.path)).size} paths`);
  const undated = releases.filter((r) => !r.day);
  const noListingDay = Object.values(FX.raw).flatMap((h) => h.match(/<article\b[^>]*class="press_release"[\s\S]*?<\/article>/gi) ?? []).filter((a) => !/field--name-field-published-date/.test(a)).length;
  check("  …of the six pages kept as served, the old ones give no published day for most items, and their excerpts' date lines give it: page 272's 24, page 303's 20, whose other 4 show an image where the line was",
    noListingDay === 65 && parseEeocList(FX.raw["272"]).releases.filter((r) => r.day).length === 24 && parseEeocList(FX.raw["303"]).releases.filter((r) => r.day).length === 20, String(noListingDay));
  const days = releases.map((r) => r.day).filter((d): d is string => !!d).sort();
  check(`  …each with the listing's day, else its excerpt's date line: ${EXPECTED.undated} with neither, from ${EXPECTED.firstDay} to 2026-11-13`,
    undated.length === EXPECTED.undated && days[0] === EXPECTED.firstDay && days[days.length - 1] === "2026-11-13" && days.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
    `${undated.length} undated; ${days[0]} to ${days[days.length - 1]}`);
  check("the date lines the old releases carry: \"PRESS RELEASE 2-21-02\", \"7/22/05\", \"FOR IMMEDIATE RELEASE July 22, 2003\", and the listing's \"April 26, 2018\"; a two-digit year before 90 is this century's",
    dayInText("The U.S. Equal Employment Opportunity Commission PRESS RELEASE 2-21-02 ROANOKE, Va.") === "2002-02-21" &&
      dayInText("PRESS RELEASE 7/22/05 LAS VEGAS") === "2005-07-22" && dayInText("PRESS RELEASE 5-24-96 DETROIT") === "1996-05-24" &&
      dayInText("FOR IMMEDIATE RELEASE July 22, 2003 PRESS RELEASE 7-22-03") === "2003-07-22" && longDay("April 26, 2018") === "2018-04-26" &&
      dayInText("PRESS RELEASE 2-30-02") === null && longDay("Sometime 4, 2018") === null);
  check("  …and a row's lines start after an old release's header: contacts and the date line are not its text",
    leadOf("FOR IMMEDIATE RELEASE CONTACT: James R. Neely, Jr. May 24, 1996 District Director (313) 226-7639 PRESS RELEASE 5-24-96 DETROIT -- The U.S. Equal Employment Opportunity Commission").startsWith("DETROIT --"));

  console.log("\nThe company is the party");
  check("Morgan Stanley's sex-discrimination suit of 2001-09-10 lands on MS, and its $40 million of 2005-08-15",
    lands("MS", "2001-09-10", /EEOC FILES SEX DISCRIMINATION LAWSUIT AGAINST MORGAN STANLEY/) && lands("MS", "2005-08-15", /\$40 MILLION/));
  check("  …Salomon Smith Barney's settlement of 2001-07-16 on Citigroup, by the release map's unit", lands("C", "2001-07-16", /SALOMON SMITH BARNEY/));
  check("  …Optical Cable's, undated in the listing, on 2002-02-21, the day its excerpt's date line gives",
    lands("OCC", "2002-02-21", /OPTICAL CABLE/) && releases.some((r) => /OPTICAL CABLE/.test(r.title) && r.day === "2002-02-21"));
  check("  …\"Verdict For EEOC Against Autozone Affirmed\" of 2011-03-18, and \"Judgment Against AutoZone Affirmed\" of 2013, by the Commission's own shapes",
    lands("AZO", "2011-03-18", /Verdict For EEOC Against Autozone Affirmed/) && lands("AZO", "2013-02-19", /Judgment Against AutoZone Affirmed/) &&
      eeocNamesParty("Final Decree Entered With Walgreens for $24 Million", ["Walgreens"]) && eeocNamesParty("EEOC SETTLES RACE AND SEX BIAS SUIT FOR $1 MILLION AGAINST OPTICAL CABLE CORP.", ["Optical Cable"]));
  check("  …and \"Walmart Refused to Provide Qualified Interpreters for Deaf Employees, EEOC Charges in Suit\" of 2023-09-08, the company first and the charge last",
    lands("WMT", "2023-09-08", /EEOC Charges in Suit/) && lands("TXRH", "2011-10-03", /EEOC Alleges in Lawsuit/));
  check("one title is many suits: \"EEOC Sues Walmart for Disability Discrimination\" is twelve releases of 2017–2026, twelve rows on WMT",
    at("WMT").filter((e) => e.title === "EEOC Sues Walmart for Disability Discrimination").length === 12 &&
      releases.filter((r) => r.title === "EEOC Sues Walmart for Disability Discrimination").length === 12);
  check("  …but one release posted twice is one row: Wal-Mart's TV-ad release of 2001, the AT&T suit of 2009-09-25, the Caterpillar suits of 2003-08-13, one listed with no excerpt",
    at("WMT").filter((e) => /AIR TV AD/.test(e.title)).length === 1 && releases.filter((r) => /AIR TV AD/.test(r.title)).length === 2 &&
      at("T").filter((e) => e.date === "2009-09-25").length === 1 && !/more that day/.test(at("T").find((e) => e.date === "2009-09-25")?.title ?? "") &&
      at("CAT").filter((e) => e.date === "2003-08-13").length === 1 && !/more that day/.test(at("CAT").find((e) => e.date === "2003-08-13")?.title ?? ""));
  check("  …and two releases of one day are one row naming both: UPS's $2 million and UPS Freight's suit of 2017-08-08",
    /\(and 1 more that day\)$/.test(at("UPS").find((e) => e.date === "2017-08-08")?.title ?? "") && (at("UPS").find((e) => e.date === "2017-08-08")?.externalId ?? "").split(",").length === 2);

  console.log("\nNot the company");
  check("a franchise's release is not the brand's: \"McDonald's Franchise\", \"Wendy's Franchisee\", \"IHOP Franchisee\" make no row; Coca-Cola's bottlers none on KO",
    !at("MCD").some((e) => /Franchis/i.test(e.title)) && releases.filter((r) => /McDonald['’]?s Franchis/i.test(r.title)).length > 5 &&
      !at("WEN").some((e) => /Franchis/i.test(e.title)) && at("KO").every((e) => !/Bottl|Beverages Northeast/i.test(e.title)) &&
      !eeocNamesParty("McDONALDS FRANCHISE TO PAY $505,000 FOR SEXUAL HARASSMENT OF YOUNG WOMEN", ["McDonald's", "McDonalds"]));
  check("  …nor one whose first lines name a franchisee: \"Jack In The Box Sued For Sexual Harassment\" of 2009-12-23 is \"Jack in the Box franchisee Kobra Associates\"; Jack in the Box's own of 2009-05-18 stays",
    !at("JACK").some((e) => e.date === "2009-12-23") && lands("JACK", "2009-05-18", /JACK IN THE BOX SETTLES/) &&
      franchiseeInLead("SAN FRANCISCO — Jack in the Box franchisee Kobra Associates, Inc., which operates about 70 restaurants", ["Jack in the Box"]) &&
      !franchiseeInLead("DolgenCorp, LLC, which operates Dollar General stores, violated federal law", ["Dollar General"]));
  check("  …nor a mediation pact or an agreement to work together: Tyson's of 2004, Cracker Barrel's of 2008, CenterPoint's",
    !at("TSN").some((e) => e.date === "2004-09-15") && !at("CBRL").some((e) => e.date === "2008-12-18") && at("CNP").length === 0 &&
      releases.some((r) => /CenterPoint/i.test(r.title) && /Mediation/i.test(r.title)));
  check("  …nor a namesake read by hand: Blackstone Consulting, the Blood Bank of Hawaii, Banner Health, Dave's Supermarket, Connections CSP, StoneRidge Health, Tiny's Organic, Compass Group USA",
    at("BX").length === 0 && at("BOH").length === 0 && at("BANR").length === 0 && at("DAVE").length === 0 && at("CSPI").length === 0 && at("SRI").length === 0 &&
      at("TNYZF").length === 0 && at("COMP").length === 0 && Object.keys(NOT_THE_COMPANY).length === 9,
    `${Object.keys(NOT_THE_COMPANY).length} records`);
  check("  …nor Murphy Oil USA, Murphy USA's since 2013, on Murphy Oil Corporation's page; nor three cities on City Holding's",
    at("MUR").length === 0 && lands("MUSA", "2018-08-13", /Murphy Oil USA/) && at("CHCO").length === 0 && releases.some((r) => /Against City of Boone/i.test(r.title)));
  check("  …and a suit of 2016-08-08 against Cushman & Wakefield stays off its page, before its first price of 2018",
    at("CWK").some((e) => e.date === "2016-08-08") && !on("CWK", "first").some((e) => e.date === "2016-08-08") && FX.first.CWK > "2016-08-08", FX.first.CWK);

  console.log("\nThe companies' units, read by hand (EEOC_UNITS)");
  check("Red Lobster's suit of 2013-09-30 is Darden's, its settlement of 2015-04-29 not: Darden sold it on 2014-07-28; Bahama Breeze's $1.26 million of 2009 is Darden's",
    lands("DRI", "2013-09-30", /Red Lobster/) && !at("DRI").some((e) => e.date === "2015-04-29") && lands("DRI", "2009-12-14", /Bahama Breeze/) &&
      EEOC_UNITS[rowOf("DRI")[0]]?.some((u) => u.names.includes("Red Lobster") && u.to === "2014-07-27"));
  check("  …Fred Meyer's five on Kroger, Sam's Club's and Walmart Stores East's on Walmart, Mesaba's consent decree of 2009 on Delta, UPS Freight's on UPS",
    at("KR").filter((e) => /Fred Meyer/i.test(e.title)).length === 5 && lands("WMT", "2025-01-17", /Sam’s Club/) && lands("WMT", "2014-03-21", /Wal-Mart Stores East/) &&
      lands("DAL", "2009-12-23", /Mesaba/) && at("UPS").filter((e) => /UPS Freight/i.test(e.title)).length >= 4);
  check(`  …${EXPECTED.unitCompanies} companies' units, none of Oncor (Sempra's by the equity method) or Philips Lighting (no day read)`,
    Object.keys(EEOC_UNITS).length === EXPECTED.unitCompanies && !Object.values(EEOC_UNITS).flat().some((u) => u.names.some((n) => /Oncor|Philips/i.test(n))));

  console.log("\nAn undated release's own page, read once for its day");
  const fakePages = async (path: string) => ({ day: FX.pages[path] === undefined ? null : dayOnPage(FX.pages[path]), outcome: "ok" as const, httpStatus: 200 });
  const pool = releases.map((r) => ({ ...r, pageRead: false }));
  const written: unknown[][] = [];
  const updClient = { query: async (_sql: string, params: unknown[]) => (written.push(params), { rows: [] }) } as unknown as PoolClient;
  const lmt = await readUndatedDays(updClient, pool, namesOf("LMT")(2008), rowOf("LMT")[0], { budget: { left: 60 }, gapMs: 0, fetchRelease: fakePages });
  const wmt = await readUndatedDays(updClient, pool, [...namesOf("WMT")(2020), ...eeocUnitNamesAsked(rowOf("WMT")[0])], rowOf("WMT")[0], { budget: { left: 60 }, gapMs: 0, fetchRelease: fakePages });
  const again = await readUndatedDays(updClient, pool, namesOf("LMT")(2008), rowOf("LMT")[0], { budget: { left: 60 }, gapMs: 0, fetchRelease: fakePages });
  check("Lockheed Martin's $2.5 million of 2008, undated in the listing, is read once and takes the day its page gives, 2008-01-02; Walmart's $40,000 page gives none, so it makes no row",
    lmt.read === 1 && lmt.dated === 1 && pool.find((r) => r.path === "/newsroom/lockheed-martin-pay-25-million-settle-racial-harassment-lawsuit")?.day === "2008-01-02" &&
      wmt.read === 1 && wmt.dated === 0 && again.read === 0 && written.length === 2,
    JSON.stringify({ lmt, wmt, again }));
  check("  …and once read, the dated copy and its twin are one row on LMT", eeocEvents(pool, namesOf("LMT")(2008), { cik: rowOf("LMT")[0] }).filter((e) => e.date === "2008-01-02").length === 1);
  const spent = await readUndatedDays(updClient, releases.map((r) => ({ ...r, pageRead: false })), namesOf("LMT")(2008), rowOf("LMT")[0], { budget: { left: 0 }, gapMs: 0, fetchRelease: fakePages });
  check("  …at most the process's budget of pages", spent.read === 0);

  console.log("\nEvery listed company against the listing");
  const out = new Map<string, TimelineEvent[]>();
  const firstOut = new Map<string, TimelineEvent[]>();
  const seen = new Set<number>();
  const every = letters(releases.map((r) => r.title).join("#"));
  for (const [cik, ticker] of companies) {
    if (seen.has(cik) || isNotesRecord(cik)) continue;
    seen.add(cik);
    const namesIn = namesOf(ticker);
    const keys = [...new Set([...namesIn(1996), ...namesIn(2010), ...namesIn(2026), ...releaseNamesAsked(cik), ...eeocUnitNamesAsked(cik)].map(letters).filter((k) => k.length >= 2))];
    if (!keys.some((k) => every.includes(k))) continue;
    const ev = on(ticker);
    if (!ev.length) continue;
    out.set(ticker, ev);
    if (FX.first[ticker]) {
      const f = ev.filter((e) => e.date >= FX.first[ticker]);
      if (f.length) firstOut.set(ticker, f);
    }
  }
  const flat = [...out.values()].flat();
  const fromFirst = [...firstOut.values()].flat();
  const top = [...firstOut].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).slice(0, 6).map(([t, v]) => `${t} ${v.length}`).join(", ");
  check(`before any first price: ${EXPECTED.total} rows on ${EXPECTED.companies} companies, ${EXPECTED.before2017} before 2017`,
    flat.length === EXPECTED.total && out.size === EXPECTED.companies && flat.filter((e) => e.date < "2017").length === EXPECTED.before2017,
    `${flat.length} on ${out.size}; ${flat.filter((e) => e.date < "2017").length} before 2017`);
  check(`  …from first prices where read: ${EXPECTED.fromFirst} rows on ${EXPECTED.fromFirstPages} pages, ${EXPECTED.fromFirst2017} before 2017 (${EXPECTED.top})`,
    fromFirst.length === EXPECTED.fromFirst && firstOut.size === EXPECTED.fromFirstPages && fromFirst.filter((e) => e.date < "2017").length === EXPECTED.fromFirst2017 && top === EXPECTED.top,
    `${fromFirst.length} on ${firstOut.size}; ${fromFirst.filter((e) => e.date < "2017").length} before 2017; ${top}`);
  check("  …each row the Commission's title, its first lines, the allegation's caveat and the release's link",
    flat.every((e) => e.sourceKey === "eeoc_press" && e.source === "EEOC" && /^https:\/\/www\.eeoc\.gov\/(?:newsroom\/|node\/)/.test(e.url ?? "") && /allegations until a court or a settlement resolves them\.$/.test(e.description ?? "") && (e.description ?? "").length < 600),
    flat.find((e) => !/allegations until/.test(e.description ?? ""))?.title);

  console.log("\nRead whole once a year, its newest page once a day");
  const db: FakeDb = { releases: new Map(), reads: new Map(), listed: "1962-01-02" };
  const served: number[] = [];
  const serve = async (page: number): Promise<EeocAnswer> => {
    served.push(page);
    return { releases: releases.slice(page * 24, page * 24 + 24), total: 7625, outcome: "ok", httpStatus: 200 };
  };
  const whole = await walkEeoc(fakeDb(db), { budget: { left: 420 }, gapMs: 0, fetchPage: serve });
  check("the first run reads every page and keeps every release once", whole.due === "list" && whole.pages === 318 && db.releases.size === 7625 && whole.releases === 7625 && served[317] === 317, JSON.stringify(whole));
  const same = await walkEeoc(fakeDb(db), { budget: { left: 420 }, gapMs: 0, fetchPage: serve });
  check("  …a run the same day asks nothing", same.due === null && served.length === 318);
  for (const r of db.reads.values()) r.ageDays = 2;
  const newest = await walkEeoc(fakeDb(db), { budget: { left: 420 }, gapMs: 0, fetchPage: serve });
  check("  …a day on, the newest page alone, which holds a release already kept", newest.due === "newest" && newest.pages === 1 && served[318] === 0, JSON.stringify(newest));
  const short = await walkEeoc(fakeDb({ releases: new Map(), reads: new Map(), listed: null }), { budget: { left: LIST_PAGES - 1 }, gapMs: 0, fetchPage: serve });
  check("  …the whole listing is begun only with its pages left in the run", short.stopped === "this run's pages are spent" && short.pages === 0);
  const refused = await walkEeoc(fakeDb({ releases: new Map(), reads: new Map(), listed: null }), {
    budget: { left: 420 },
    gapMs: 0,
    fetchPage: async (p) => (p === 5 ? { releases: [], total: null, outcome: "throttled", httpStatus: 429 } : serve(p)),
  });
  check("  …a refused page stops the read and keeps nothing of it", refused.failure?.httpStatus === 429 && /page 5/.test(refused.failure.detail ?? ""), JSON.stringify(refused));
  const real = globalThis.fetch;
  globalThis.fetch = (async () => new Response("<html><body>Access Denied</body></html>", { status: 200 })) as typeof fetch;
  let blank: EeocAnswer;
  try {
    blank = await fetchEeocPage(0);
  } finally {
    globalThis.fetch = real;
  }
  check("  …and a page without the listing is an error, not an empty page", blank.outcome === "error" && blank.detail === "no listing on the page");

  const plan = (t: string) => {
    const [cik, , name] = rowOf(t);
    return { edgarName: name, alsoKnownAs: newsNamesFor(cik), possessive: dojPossessive(name, possessiveNameFor(cik)), cik };
  };
  const noWalk: EeocWalk = { due: null, pages: 0, releases: 0 };
  const ms = await eeocFor(fakeDb({ ...db, listed: "1993-02-23" }), 1, plan("MS"), noWalk);
  const cwk = await eeocFor(fakeDb({ ...db, listed: "2018-08-02" }), 1, plan("CWK"), noWalk);
  check("a company's ingest keeps its kept releases from its first price, as a complete answer: Morgan Stanley's from 1993, Cushman & Wakefield's not before 2018",
    ms.events.some((e) => e.date === "2001-09-10") && ms.events.every((e) => e.date >= "1993-02-23") && !!ms.complete && !cwk.events.some((e) => e.date === "2016-08-08") && cwk.events.some((e) => e.date === "2017-03-03") === false,
    `${ms.events.length} on MS; ${cwk.events.map((e) => e.date).join(", ")} on CWK`);

  console.log("\nRegistered, licensed, wired");
  const src = SOURCES.find((s) => s.key === "eeoc_press");
  check("the source is registered as the Commission's own work, credited to it, with the day its site was read and the owner's approval",
    src?.id === 41 && /17 U\.S\.C\. § 105/.test(src.license) && src.commercialOk && src.reviewedOn === "2026-11-15" && src.attribution === "U.S. Equal Employment Opportunity Commission" &&
      /does not constitute or imply its endorsement/.test(read("lib/ingest/store.ts")), JSON.stringify(src));
  check("  …the Commission's disclaimer quoted where it is used, and its listing's address",
    /shall not be used for advertising or product endorsement/.test(read("lib/eeoc.ts")) && EEOC_LIST === "https://www.eeoc.gov/newsroom/search");
  check("  …asked once a day per company, quota noted, a company source, a grouped row, scored without the model",
    SOURCE_TTL_MINUTES.eeoc_press === 1440 && QUOTAS.eeoc_press.perDay === null && (COMPANY_SOURCES as readonly string[]).includes("eeoc_press") && GROUPED_ROW_SOURCES.includes("eeoc_press") &&
      deterministicScore({ eventId: 0, kind: "regulation", title: "EEOC Sues Walmart", sourceKey: "eeoc_press" }, { kind: "company", displayName: "Walmart", ticker: "WMT" }, ["walmart"])?.score === 0.95);
  check("  …company ingest walks the listing, then keeps the company's releases",
    /await run\("eeoc_press", [^\n]+\n\s*const walked = await walkEeoc\(client\);[\s\S]{0,300}return eeocFor\(client, subjectId, \{[^}]*cik: company\.cik, fundSeries \}, walked\);/.test(read("scripts/ingest.ts")));
  check("  …into tables of its own (db/052), and credited",
    /CREATE TABLE IF NOT EXISTS eeoc_releases \(\s*path\s+text PRIMARY KEY/.test(read("db/052_eeoc_releases.sql")) && /page_read_at\s+timestamptz/.test(read("db/052_eeoc_releases.sql")) &&
      /press releases from the U\.S\. Equal Employment Opportunity Commission/.test(read("app/layout.tsx").replace(/\s+/g, " ")) &&
      /press releases from the U\.S\. Equal Employment Opportunity Commission/.test(read("app/legal/terms/page.tsx").replace(/\s+/g, " ")) &&
      /\| U\.S\. Equal Employment Opportunity Commission \|/.test(read("README.md")));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  process.exit(fail ? 1 : 0);
}

/** The replay's counts, measured 2026-11-15 on the saved listing (batch 152). */
const EXPECTED = {
  undated: 70,
  firstDay: "1994-06-22",
  unitCompanies: 18,
  total: 550,
  companies: 179,
  before2017: 276,
  fromFirst: 324,
  fromFirstPages: 81,
  fromFirst2017: 165,
  top: "WMT 73, DG 21, KR 14, T 13, DDS 10, UAL 9",
};

interface FakeDb {
  releases: Map<string, EeocRelease & { pageRead: boolean }>;
  reads: Map<"list" | "newest", { ageDays: number }>;
  listed: string | null;
}
function fakeDb(db: FakeDb): PoolClient {
  return {
    query: async (sql: string, params: unknown[] = []) => {
      const s = sql.trim();
      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(s)) return { rows: [] };
      if (/^SELECT kind, read_at < now\(\) - make_interval\(days => 365\) AS old, read_at < now\(\) - interval '1 day' AS stale FROM eeoc_reads$/.test(s)) {
        return { rows: [...db.reads].map(([kind, r]) => ({ kind, old: r.ageDays > 365, stale: r.ageDays > 1 })) };
      }
      if (/^SELECT path FROM eeoc_releases$/.test(s)) return { rows: [...db.releases.keys()].map((path) => ({ path })) };
      if (/^INSERT INTO eeoc_releases \(path, title, day, summary\)/.test(s)) {
        const [paths, titles, ds, summaries] = params as (string | null)[][];
        paths.forEach((path, i) => db.releases.set(path!, { path: path!, title: titles[i]!, day: ds[i] ?? db.releases.get(path!)?.day ?? null, summary: summaries[i]!, pageRead: db.releases.get(path!)?.pageRead ?? false }));
        return { rows: [], rowCount: paths.length };
      }
      if (/^INSERT INTO eeoc_reads/.test(s)) {
        db.reads.set(params[0] as "list" | "newest", { ageDays: 0 });
        return { rows: [] };
      }
      if (/^SELECT path, title, day::text AS day, summary, page_read_at IS NOT NULL AS "pageRead" FROM eeoc_releases ORDER BY day NULLS FIRST, path$/.test(s)) {
        return { rows: [...db.releases.values()].map((r) => ({ ...r })) };
      }
      if (/^UPDATE eeoc_releases SET day = coalesce\(\$2::date, day\), page_read_at = now\(\) WHERE path = \$1$/.test(s)) {
        const r = db.releases.get(params[0] as string);
        if (r) {
          r.day = (params[1] as string | null) ?? r.day;
          r.pageRead = true;
        }
        return { rows: [] };
      }
      if (/FROM prices/.test(s)) return { rows: [{ listed: db.listed }] };
      if (/FROM events e/.test(s)) return { rows: [] };
      throw new Error(`unexpected query: ${s.slice(0, 80)}`);
    },
  } as unknown as PoolClient;
}

main();
