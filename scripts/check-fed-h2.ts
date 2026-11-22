/**
 * The Federal Reserve's actions on the company's deals from the Board's weekly H.2 release, 1996–2026 (batch 173, the
 * 2026-11-22b proposal 2, approved by the owner that day with call (a): the Fed's actions on the company's deals, on the
 * action's day; the applications' Federal Register notices not read).
 *
 *   npm run check:fed-h2
 *
 * Offline: the committed file (`data/fed-h2.json.gz`, written by `npm run sync:fed-h2` from the 1,567 weekly PDFs
 * www.federalreserve.gov served on 2026-11-22), pdftotext's text of four of those weeks (scripts/fixtures/fed-h2-weeks.json.gz),
 * and the first trading days the other checks' fixtures carry.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { PoolClient } from "pg";
import tickerIndex from "../data/edgar-tickers.json";
import { ALSO_ON_SOURCES } from "../lib/alsoOn";
import { GROUPED_ROW_SOURCES } from "../lib/corroboration";
import { dojPossessive } from "../lib/doj";
import { andSpellings, withoutTag } from "../lib/edgarName";
import { deterministicScore } from "../lib/enrich/relevance";
import {
  H2_LINE_MARK,
  HOMES,
  NOT_THE_COMPANY,
  type H2Action,
  actionParties,
  actionTitle,
  boardDealsOn,
  fedH2Actions,
  fedH2Events,
  fedH2Unread,
  h2PartyIsCompany,
  indexWeeks,
  isDeal,
  listParties,
  readH2,
  releaseH2Line,
  releaseNamesAction,
  splitAction,
  takenParties,
} from "../lib/fedH2";
import { fedPressEvents } from "../lib/fedPress";
import { companyNames } from "../lib/frCompany";
import { namesForYear } from "../lib/ingest/frBackfill";
import { fedH2For, listedBy } from "../lib/ingest/fedH2For";
import { QUOTAS } from "../lib/ingest/quota";
import { SOURCE_TTL_MINUTES } from "../lib/ingest/refresh";
import { SOURCES } from "../lib/ingest/store";
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

/** The whole file as read on 2026-11-22, and every listed company in the index replayed against it. */
const EXPECTED = {
  weeks: 1_567,
  unread: 48,
  actions: 20_903,
  // 161 more since batch 175, the new holding companies the deal pattern's word boundary had refused
  deals: 18_019,
  // every listed company in the index, under the rule, its names as the replay below builds them
  total: 2_145,
  companies: 383,
  // from first prices, for the companies the fixtures read
  fromFirst: 815,
  fromFirstPages: 94,
  fromFirst2017: 635,
  top: "WFC 63, FITB 36, RF 34, BAC 29, MTB 26, ZION 24, BMO 23, BPOP 20, ONB 19, BUSE 16",
};

const companies = (tickerIndex as unknown as { companies: [number, string, string][] }).companies;
const titleOf = (cik: number) => companies.find((c) => c[0] === cik)![2];
/** A company's names of a year as ingest builds them, less the former names only the database holds. */
const namesOf = (cik: number, extra: (year: number) => string[] = () => []) => (year: number) => {
  const title = titleOf(cik);
  const own = dojPossessive(title, possessiveNameFor(cik));
  return [...companyNames(title, namesForYear(year, newsNamesFor(cik), [])), ...(own ? [own] : []), withoutTag(title), ...extra(year)];
};
const actions = fedH2Actions();
const on = (cik: number, from = "", extra?: (year: number) => string[], joined?: (a: H2Action) => boolean) =>
  fedH2Events(actions, namesOf(cik, extra), { cik, from, namesOn: (d) => releaseNamesOn(cik, d), joined });
const dayOf = (cik: number, day: string, extra?: (year: number) => string[]) => on(cik, "", extra).find((e) => e.date === day);
const isCompany = (name: string, place: string, d: string, cik: number) => h2PartyIsCompany({ name, place }, d, cik, () => [...namesOf(cik)(Number(d.slice(0, 4))), ...releaseNamesOn(cik, d)]);

const WFC = 72971;
const BAC = 70858;

async function main(): Promise<void> {
  const weeks = JSON.parse(gunzipSync(readFileSync(join(__dirname, "fixtures", "fed-h2-weeks.json.gz"))).toString()) as { texts: Record<string, string> };

  console.log("The index");
  check("the archive's index lists a week by its day, in either of its link forms; each once",
    JSON.stringify(indexWeeks('<a href="19961102/h2.pdf">1</a><a href="/releases/h2/20261114/default.htm">2</a><a href="20261114/h2.pdf">3</a><a href="/releases/h2/20100515">4</a>')) === JSON.stringify(["19961102", "20100515", "20261114"]));

  console.log("\nThe three layouts");
  const scan = readH2(weeks.texts["19970419"], "19970419");
  check("the week of 1997-04-19 is a scan with no text layer: no action, listed as unread", scan.scanned && scan.actions.length === 0);
  const w97 = readH2(weeks.texts["19971122"], "19971122");
  const norwest = w97.actions.find((a) => /^Norwest Corporation, Minneapolis/.test(a.head) && /residential mortgage lending/.test(a.what));
  check("1997-11-22, the categories in capitals and \"- Permitted, November 17, 1997\": every action read, none left unsplit; Norwest's residential mortgage lending, permitted by Minneapolis",
    w97.actions.length === 49 && w97.unsplit.length === 0 && norwest?.day === "1997-11-17" && norwest.outcome === "Permitted" && norwest.by === "Minneapolis" && norwest.category === "Bank Holding Companies" && !norwest.board,
    { n: w97.actions.length, unsplit: w97.unsplit, norwest });
  check("  …the Board's own actions apart from those under delegated authority; a district beside an action or above it",
    w97.actions.filter((a) => a.board).length === 5 && w97.actions.some((a) => a.board && a.category === "Enforcement" && /^Putnam-Greene/.test(a.head)) &&
      w97.actions.some((a) => a.by === "Cleveland" && /^F\.N\.B\. Corporation, Hermitage, Pennsylvania$/.test(a.head) && /^to acquire West Coast Bank/.test(a.what)),
    w97.actions.filter((a) => a.board).map((a) => a.head));
  const w11 = readH2(weeks.texts["20110326"], "20110326");
  const amnb = w11.actions.find((a) => /^American National Bankshares/.test(a.head));
  check("2011-03-26, the categories in title case: every action read; American National Bankshares' MidCarolina, approved by Richmond on 2011-03-21",
    w11.actions.length === 20 && w11.unsplit.length === 0 && amnb?.day === "2011-03-21" && amnb.by === "Richmond" && /^to acquire MidCarolina Financial Corporation, Burlington, North Carolina/.test(amnb.what),
    { n: w11.actions.length, unsplit: w11.unsplit, amnb });
  const w23 = readH2(weeks.texts["20230909"], "20230909");
  const vbt = w23.actions.find((a) => /^VB&T Holding Company/.test(a.head));
  const banner = w23.actions.filter((a) => a.category === "Change in Bank Control" && /^Banner County Ban Corporation, Harrisburg, Nebraska$/.test(a.head));
  check("2023-09-09, the em dash and \"Approved: September 7, 2023\": every action read; a change in control's head is the bank whose control changes, its notifiers after the dash",
    w23.actions.length === 12 && w23.unsplit.length === 0 && vbt?.day === "2023-09-07" && vbt.by === "San Francisco" && banner.length === 2 && banner.every((a) => /^(?:Daniel Plate|Dallen Juelfs)/.test(a.what)),
    { n: w23.actions.length, unsplit: w23.unsplit, vbt });
  check("an outcome is capitalized as the release prints it, a sentence beginning \"modified September 12, 2023\" none; a name's own dash is never the action's",
    readH2(`Board Actions\nChange in Bank Control\nFlagship Financial Group, Inc., Eden Prairie, Minnesota—Timothy J. Hoese, as\nmodified September 12, 2023, all of Glencoe, Minnesota; to retain voting shares.\nPermitted: April 9, 2024\n${"x".repeat(2000)}`, "20240413").actions.length === 1 &&
      JSON.stringify(splitAction("Lone Star National Bancshares--Texas, Inc., McAllen, Texas -- to retain control of Lone Star")) === JSON.stringify({ head: "Lone Star National Bancshares--Texas, Inc., McAllen, Texas", what: "to retain control of Lone Star" }) &&
      splitAction("Banner County Ban Corporation, Harrisburg, Nebraska—Dallen Juelfs, Lisco, Nebraska")?.head === "Banner County Ban Corporation, Harrisburg, Nebraska");

  console.log("\nThe parties and their places");
  check("a list's parties each with its place: \"Prime Bancshares, Inc., Houston, Texas, and Prime Bank\", \"both of Greenville, South Carolina\", \"New York, New York\", \"Toronto, Ontario, Canada\"",
    JSON.stringify(listParties("Prime Bancshares, Inc., Houston, Texas, and Prime Bank")) === JSON.stringify([{ name: "Prime Bancshares, Inc.", place: "Houston, Texas" }, { name: "Prime Bank", place: "Houston, Texas" }]) &&
      JSON.stringify(listParties("United Community Banks, Inc., and United Community Bank, both of Greenville, South Carolina").map((p) => p.place)) === JSON.stringify(["Greenville, South Carolina", "Greenville, South Carolina"]) &&
      JSON.stringify(listParties("Citigroup, Inc., New York, New York")) === JSON.stringify([{ name: "Citigroup, Inc.", place: "New York, New York" }]) &&
      JSON.stringify(listParties("Toronto-Dominion Bank, Toronto, Ontario, Canada")) === JSON.stringify([{ name: "Toronto-Dominion Bank", place: "Toronto, Ontario, Canada" }]));
  check("  …a party acquired after its share (\"up to 24.9 percent of the voting shares of Shinhan Financial Group Co., Ltd., Seoul, Korea\"), a subsidiary in its parent's town",
    JSON.stringify(takenParties("to acquire up to 24.9 percent of the voting shares of Shinhan Financial Group Co., Ltd., Seoul, Korea.")) === JSON.stringify([{ name: "Shinhan Financial Group Co., Ltd.", place: "Seoul, Korea" }]) &&
      JSON.stringify(takenParties("to acquire Sudan Bancshares, Inc., Sudan, and its subsidiary, The First National Bank of Sudan.", "Lubbock, Texas").map((p) => p.place)) === JSON.stringify(["Sudan, Texas", "Sudan, Texas"]));
  check("  …a change in control's party is the bank whose control changes, under its heading in either layout",
    JSON.stringify(actionParties({ category: "Change in Bank Control", head: "Northern Trust Corporation, Chicago, Illinois", what: "change in control notice by The Vanguard Group et al." }).acquired.map((p) => p.name)) === JSON.stringify(["Northern Trust Corporation"]));

  console.log("\nWhich actions are deals");
  const deal = (what: string, category = "Bank Holding Companies", outcome = "Approved", board = false) => isDeal({ category, outcome, what, board });
  check("an acquisition, a merger, a new holding company, an activity, a waiver of application to acquire, an election, a change in control",
    deal("to acquire Prime Bancshares, Inc., Houston, Texas, and Prime Bank.") && deal("to merge with Four Oaks Fincorp, Inc.", "Bank Holding Companies", "Approved") &&
      deal("to become a bank holding company and to acquire Signature Bank, a de novo bank.") && deal("to engage on a limited basis in physical commodity trading activities.") &&
      deal("waiver of application to acquire Advantage Community Bancshares, Inc., Wausau", "Bank Holding Companies", "Granted") &&
      deal("election to become a financial holding company.", "Financial Holding Companies", "Effective") && deal("change in bank control.", "Change in Bank Control", "Permitted") &&
      deal("(1) to become a bank holding company by merging with Synovus Financial Corp.", "Bank Holding Companies", "Announced", true));
  check("  …a new holding company alone, with no other deal word (batch 175: the branch's word boundary made it none): Goldman Sachs's of 2008-09-21, the Board's",
    deal("to become a bank holding company.") && deal("to become bank holding companies.", "Bank Holding Companies", "Approved", true) && deal("to become financial holding companies.", "Financial Holding Companies") &&
      deal("to become a savings and loan holding company.", "Savings and Loan Holding Companies") &&
      /^The Federal Reserve Board approved The Goldman Sachs Group, Inc\. and Goldman Sachs Bank USA Holdings LLC's application to become bank holding companies$/.test(dayOf(886982, "2008-09-21")?.title ?? ""),
    dayOf(886982, "2008-09-21")?.title);
  check("  …routine actions under the same headings make none: a public welfare investment (M&T's of 2015-12-29), an interlock exemption, a notice period's waiver, a comment period, Regulation K, section 23A, relief from commitments",
    !deal("to make a public welfare investment.", "Banks, State Member") && !deal("request for an exemption under the Depository Institution Management Interlocks Act and Regulation L.", "Bank Holding Companies", "Granted") &&
      !deal("waiver of the remainder of the prior-notice period to make an investment in Huntington Commercial Finance Canada, Inc.", "Banks, State Member", "Granted") &&
      !deal("commenter's request to extend the comment period on the application to acquire Marshall & Ilsley Corporation", "Bank Holding Companies", "Granted") &&
      !deal("to make an investment pursuant to Regulation K.", "Banks, State Member") && !deal("request for a temporary exemption from section 23A of the Federal Reserve Act.", "Banks, Foreign", "Granted") &&
      !deal("relief from certain commitments.", "Bank Holding Companies", "Granted") && !deal("to acquire Prime Bancshares", "Bank Branches, Domestic") && !deal("to acquire X", "Bank Holding Companies", "Announced", false) &&
      !on(36270).some((e) => e.date === "2015-12-29"));

  console.log("\nThe committed file");
  const file = JSON.parse(gunzipSync(readFileSync(join(__dirname, "..", "data", "fed-h2.json.gz"))).toString()) as { read: string; weeks: string[] };
  const unread = fedH2Unread();
  check(`the weeks of 2026-11-22: ${EXPECTED.weeks.toLocaleString("en-US")} from 1996-11-02 to 2026-11-14, ${EXPECTED.unread} unread (the scans of 1996–1997 and the Board's damaged file of 2018-05-26), ${EXPECTED.actions.toLocaleString("en-US")} actions under the kept headings, ${EXPECTED.deals.toLocaleString("en-US")} of them deals`,
    file.read === "2026-11-22" && file.weeks.length === EXPECTED.weeks && file.weeks[0] === "19961102" && file.weeks.at(-1) === "20261114" && unread.length === EXPECTED.unread &&
      unread.includes("19970419") && unread.includes("20180526") && !unread.includes("19961228") && actions.length === EXPECTED.actions && actions.filter(isDeal).length === EXPECTED.deals,
    { read: file.read, weeks: file.weeks.length, unread: unread.length, actions: actions.length, deals: actions.filter(isDeal).length });
  check("  …every action with its week, place, day, heading, outcome and text; none held twice",
    actions.every((a) => /^\d{4}-\d{2}-\d{2}$/.test(a.week) && a.n > 0 && /^\d{4}-\d{2}-\d{2}$/.test(a.day) && a.category && a.outcome && a.head && a.what) && new Set(actions.map((a) => `${a.week}#${a.n}`)).size === actions.length);

  console.log("\nThe rule and the rows");
  const prime = dayOf(WFC, "1999-12-10");
  check("Wells Fargo's Prime Bancshares of 1999-12-10 lands on WFC, approved by the Reserve Bank of San Francisco under delegated authority",
    prime?.title === "The Federal Reserve Bank of San Francisco approved, under delegated authority, Wells Fargo & Company's application to acquire Prime Bancshares, Inc., Houston, Texas, and Prime Bank" &&
      prime.sourceKey === "fed_h2" && prime.url === "https://www.federalreserve.gov/releases/h2/19991211/h2.pdf" && prime.externalId === "1999-12-11#29" && /The company is the applicant\./.test(prime.description ?? ""),
    prime?.title);
  check("  …Norwest's of 1997-11-17 lands on WFC under the EDGAR former name ingest reads (\"NORWEST CORP\" to 1998-10-21), never under its present names",
    !!dayOf(WFC, "1997-11-17", (y) => (y <= 1998 ? ["NORWEST CORP"] : [])) && !dayOf(WFC, "1997-11-17"));
  const banr = dayOf(946673, "2007-09-11");
  const shg = dayOf(1263043, "2008-12-05");
  check("FBOP's stake in Banner of 2007-09-11 lands on BANR as the company acquired, BNP Paribas's shares of Shinhan of 2008-12-05 on SHG, and the Vanguard Group's change-in-control notice of 2021-02-18 on NTRS",
    /FBOP Corporation's application to acquire shares of Banner Corporation/.test(banr?.title ?? "") && /The company is the one whose shares, assets or business are acquired\./.test(banr?.description ?? "") &&
      /BNP Paribas' application to acquire shares of Shinhan Financial Group Co\., Ltd\./.test(shg?.title ?? "") &&
      /The company is the bank whose control changes\./.test(on(73124).find((e) => e.date === "2021-02-18")?.description ?? ""),
    [banr?.title, shg?.title]);
  check("the namesakes stay off by their places: Commerce Bancshares of White Castle, Louisiana (2021-02-16) off CBSH, Peoples Bancorp of Prairie du Chien (2008-12-05) off PEBO, Timberland Bancorp of Baxter, Minnesota (2004-10-01) off TSBK",
    !dayOf(22356, "2021-02-16") && !dayOf(318300, "2008-12-05") && !dayOf(1046050, "2004-10-01") && !!on(22356).length && !!on(318300).length &&
      !isCompany("Commerce Bancshares, Inc.", "White Castle, Louisiana", "2021-02-16", 22356) && isCompany("Commerce Bancshares, Inc.", "Kansas City, Missouri", "2021-02-16", 22356) &&
      !isCompany("Commerce Bancshares, Inc.", "", "2021-02-16", 22356));
  check("  …United Community Banks' deals of Blairsville, Georgia (2017-08-28, 2020-06-25) land on UCB, and its later head office, Greenville, South Carolina, is its own",
    /United Community Banks, Inc\.'s application to merge with Four Oaks Fincorp/.test(dayOf(857855, "2017-08-28")?.title ?? "") && !!dayOf(857855, "2020-06-25") &&
      isCompany("United Community Banks, Inc.", "Greenville, South Carolina", "2024-08-23", 857855) && !!dayOf(857855, "2022-12-19"));
  check("  …every home place and namesake read by hand says why", Object.values(HOMES).every((h) => h.why.length > 30) && Object.values(NOT_THE_COMPANY).flat().every((n) => n.why.length > 30) && Object.keys(HOMES).length === 89);
  const abn = dayOf(BAC, "2007-09-12");
  // a stored row read back as fed_h2 reads it: its title and the words before its H.2 line
  const stored = (rows: { date: string; title: string; description?: string }[]) => {
    const m = new Map<string, string[]>();
    for (const r of rows) (m.get(r.date) ?? m.set(r.date, []).get(r.date)!).push(`${r.title} ${(r.description ?? "").split(` ${H2_LINE_MARK} `)[0]}`);
    return listedBy(m);
  };
  const press = fedPressEvents(
    [{ day: "2007-09-12", title: "Board approves proposal by Bank of America Corporation to acquire ABN AMRO North America Holding Company", type: "Orders on Banking Applications", url: "https://www.federalreserve.gov/newsevents/press/orders/20070912a.htm" }],
    namesOf(BAC),
    { cik: BAC, h2: (r) => releaseH2Line(r, actions) },
  )[0];
  const joinedAway = on(BAC, "", undefined, stored([press])).find((e) => e.date === "2007-09-12");
  check("Bank of America's Board action of 2007-09-12 (ABN AMRO North America) is a row of its own where the page holds no Board release that day, and joins the Board's release where it does",
    /^The Federal Reserve Board approved Bank of America Corporation's application to acquire ABN AMRO North America Holding Company/.test(abn?.title ?? "") && !joinedAway &&
      /The Board's weekly H\.2 release of the week ending September 15, 2007 lists it: Bank Holding Companies, the Board: Bank of America Corporation, Charlotte, North Carolina — to acquire ABN AMRO North America Holding Company/.test(press?.description ?? ""),
    [abn?.title, press?.description]);
  // the release Goldman Sachs and Morgan Stanley share (batch 175: each page wrote its own line, and the row flipped at each ingest)
  const both = { day: "2008-09-21", title: "Board approves, pending a statutory five-day antitrust waiting period, the applications of Goldman Sachs and Morgan Stanley to become bank holding companies", type: "Banking and Consumer Regulatory Policy" as const, url: "https://www.federalreserve.gov/newsevents/pressreleases/bcreg20080921a.htm" };
  const [gs, ms] = [886982, 895421].map((cik) => fedPressEvents([both], namesOf(cik), { cik, h2: (r) => releaseH2Line(r, actions) })[0]);
  check("  …a release two pages share gives each the same line, the Board's deals of its day it names (Goldman Sachs's and Morgan Stanley's of 2008-09-21), and neither page keeps a row of its own for them",
    !!gs && gs.description === ms?.description && gs.dedupBasis === ms.dedupBasis && boardDealsOn(actions, "2008-09-21").length === 2 &&
      /lists it: Bank Holding Companies, the Board: The Goldman Sachs Group, Inc\.[^]* Approved, September 21, 2008\. Bank Holding Companies, the Board: Morgan Stanley, New York, New York[^]* Approved, September 21, 2008\.$/.test(gs.description ?? "") &&
      !!dayOf(895421, "2008-09-21") && !on(886982, "", undefined, stored([gs])).some((e) => e.date === "2008-09-21") && !on(895421, "", undefined, stored([ms])).some((e) => e.date === "2008-09-21"),
    gs?.description);
  const other = fedPressEvents(
    [{ day: "2007-09-12", title: "Board approves proposal by Bank of America Corporation to acquire a bank", type: "Orders on Banking Applications", url: "https://www.federalreserve.gov/newsevents/press/orders/20070912b.htm" }],
    namesOf(BAC),
    { cik: BAC, h2: (r) => releaseH2Line({ ...r, title: "Board approves proposal by Wachovia Corporation to acquire a bank" }, actions) },
  )[0];
  check("  …a Board action of the day a release does not name is no line on it, and keeps its own row; the release's own words are read by the leading name and its legal words both (\"UBS AG\", \"Banco Santander Central Hispano\")",
    !!other && !/weekly H\.2/.test(other.description ?? "") && !!on(BAC, "", undefined, stored([{ ...other, title: "Board approves proposal by Wachovia Corporation to acquire a bank" }])).find((e) => e.date === "2007-09-12") &&
      releaseNamesAction("Approval of proposal by UBS AG", { category: "Bank Holding Companies", head: "UBS AG, Zurich, Switzerland", what: "to engage in limited physical commodity trading activities." } as H2Action) &&
      releaseNamesAction("Approval of proposal by Banco Santander Central Hispano", { category: "Bank Holding Companies", head: "Banco Santander Central Hispano, S.A., Madrid, Spain", what: "to acquire up to 24.99 percent of the shares of Sovereign Bancorp, Inc." } as H2Action) &&
      !releaseNamesAction("Approval of proposal by UBS AG", { category: "Bank Holding Companies", head: "Wachovia Corporation, Charlotte, North Carolina", what: "to acquire a bank." } as H2Action),
    other?.description);
  check("  …a withdrawal and an election say so: First Business Financial's Aslin Group (2014-07-02), Renasant's election (2025)",
    /^First Business Financial Services, Inc\.'s application to acquire Aslin Group, Inc\.[^]* was withdrawn \(the Federal Reserve Bank of Chicago under delegated authority\)$/.test(dayOf(1521951, "2014-07-02")?.title ?? "") &&
      on(715072).some((e) => /^Renasant Corporation's election to become a financial holding company took effect \(the Board's Secretary under delegated authority\)$/.test(e.title)),
    dayOf(1521951, "2014-07-02")?.title);
  check("  …a row says what the Fed did on the day, never the deal's announcement or closing", /not when the deal was announced or closed/.test(prime?.description ?? "") && !/\bclosed on\b|\bcompleted\b/.test(prime?.title ?? ""));

  console.log("\nEvery listed company");
  const alnum = (x: string) => x.toLowerCase().replace(/^the\s+/i, "").replace(/[^a-z0-9]/g, "");
  const first: Record<string, string> = {};
  for (const [f, k] of [["digest-1985-entries.json.gz", "firstPrices"], ["eeoc-listing.json.gz", "first"], ["fda-device-recalls.json.gz", "first"], ["occ-actions.json.gz", "first"]] as const) {
    Object.assign(first, JSON.parse(gunzipSync(readFileSync(join(__dirname, "fixtures", f))).toString())[k]);
  }
  // each deal's parties' letters, and an index by their first three, so a company's candidates are read without a scan of every deal
  const deals = actions.filter(isDeal);
  const letters = deals.map((a) => { const p = actionParties(a); return [...p.applicants, ...p.acquired].map((x) => alnum(x.name)); });
  const byKey = new Map<string, Set<number>>();
  letters.forEach((ls, j) => ls.forEach((l) => l.length >= 3 && (byKey.get(l.slice(0, 3)) ?? byKey.set(l.slice(0, 3), new Set()).get(l.slice(0, 3))!).add(j)));
  const unitYears = Array.from({ length: 31 }, (_, k) => `${1996 + k}-07-01`);
  const rows: { ticker: string; date: string; first: string | null }[] = [];
  const seen = new Set<number>();
  for (const [cik, ticker] of companies) {
    if (seen.has(cik)) continue;
    seen.add(cik);
    const pre = [...new Set([...namesOf(cik)(2026), ...unitYears.flatMap((d) => releaseNamesOn(cik, d))].flatMap(andSpellings).map(alnum).filter((n) => n.length >= 3))];
    const cand = new Set<number>();
    for (const n of pre) for (const j of byKey.get(n.slice(0, 3)) ?? []) if (letters[j].some((l) => l.includes(n))) cand.add(j);
    if (!cand.size) continue;
    const mine = [...cand].sort((x, y) => x - y).map((j) => deals[j]);
    for (const e of fedH2Events(mine, namesOf(cik), { cik, namesOn: (d) => releaseNamesOn(cik, d) })) rows.push({ ticker, date: e.date, first: first[ticker] ?? null });
  }
  const after = rows.filter((r) => r.first && r.date >= r.first);
  const top = Object.entries(after.reduce<Record<string, number>>((m, r) => ((m[r.ticker] = (m[r.ticker] ?? 0) + 1), m), {}))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([t, n]) => `${t} ${n}`)
    .join(", ");
  check(`before any first price: ${EXPECTED.total.toLocaleString("en-US")} company days on ${EXPECTED.companies} companies`,
    rows.length === EXPECTED.total && new Set(rows.map((r) => r.ticker)).size === EXPECTED.companies, `${rows.length} on ${new Set(rows.map((r) => r.ticker)).size}`);
  check(`  …from first prices: ${EXPECTED.fromFirst.toLocaleString("en-US")} on ${EXPECTED.fromFirstPages} pages, ${EXPECTED.fromFirst2017.toLocaleString("en-US")} before 2017 (${EXPECTED.top})`,
    after.length === EXPECTED.fromFirst && new Set(after.map((r) => r.ticker)).size === EXPECTED.fromFirstPages && after.filter((r) => r.date < "2017-01-01").length === EXPECTED.fromFirst2017 && top === EXPECTED.top,
    `${after.length} on ${new Set(after.map((r) => r.ticker)).size}, ${after.filter((r) => r.date < "2017-01-01").length} before 2017; ${top}`);

  console.log("\nAt ingest");
  const step = await fedH2For(fakeDb("1973-02-21", [{ day: "2007-09-12", title: press.title, body: press.description ?? "" }]), 1, { edgarName: "BANK OF AMERICA CORP /DE/", alsoKnownAs: newsNamesFor(BAC), cik: BAC });
  check("the company's actions from its first price, with no request, as a complete answer; a Board action of a day the page holds the Board's release joins it",
    step.outcome === "ok" && !!step.complete && step.events.length > 0 && !step.events.some((e) => e.date === "2007-09-12") && step.events.every((e) => e.date >= "1973-02-21" && e.sourceKey === "fed_h2"),
    `${step.outcome} ${step.events.length}`);
  const none = await fedH2For(fakeDb(null, []), 1, { edgarName: "BANK OF AMERICA CORP /DE/", alsoKnownAs: [], cik: BAC });
  const fund = await fedH2For(fakeDb("1973-02-21", []), 1, { edgarName: "BANK OF AMERICA CORP /DE/", alsoKnownAs: [], cik: BAC, fundSeries: true });
  check("  …asked again while it has no prices, and none for a fund's series", none.outcome === "error" && /no prices/.test(none.detail ?? "") && fund.events.length === 0 && fund.outcome === "empty");

  console.log("\nRegistered, licensed, wired");
  const src = SOURCES.find((s) => s.key === "fed_h2");
  check("the source is id 49, public domain, cleared for commercial use, reviewed 2026-11-22, credited to the Board of Governors of the Federal Reserve System",
    src?.id === 49 && src.license === "public domain" && src.commercialOk && src.reviewedOn === "2026-11-22" && src.attribution === "Board of Governors of the Federal Reserve System", src);
  check("  …a company source read after the Board's releases, quota and refresh noted, scored without the model, a multi-party source whose rows join their actions",
    (COMPANY_SOURCES as readonly string[]).includes("fed_h2") && COMPANY_SOURCES.indexOf("fed_h2") > COMPANY_SOURCES.indexOf("fed_press") && QUOTAS.fed_h2.perDay === null && SOURCE_TTL_MINUTES.fed_h2 === 1440 &&
      deterministicScore({ eventId: 0, kind: "regulation", title: "The Federal Reserve Bank of Dallas approved", sourceKey: "fed_h2" }, { kind: "company", displayName: "Wells Fargo", ticker: "WFC" }, ["wells fargo"])?.score === 0.95 &&
      ALSO_ON_SOURCES.includes("fed_h2") && GROUPED_ROW_SOURCES.includes("fed_h2") && /WHERE source_id IN \([^)]*\b49\)/.test(read("db/058_also_on_fed_h2.sql")));
  check("  …the ingest asks it for every company, after the Board's releases", /await run\("fed_h2", [^\n]+\n\s*fedH2For\(client, subjectId, \{[^}]*cik: company\.cik, fundSeries \}\),/.test(read("scripts/ingest.ts")) &&
    read("scripts/ingest.ts").indexOf('await run("fed_press"') < read("scripts/ingest.ts").indexOf('await run("fed_h2"'));
  check("  …synced weekly by `npm run sync:fed-h2`, and credited",
    /"sync:fed-h2": "tsx scripts\/sync-fed-h2\.ts"/.test(read("package.json")) &&
      /with its weekly actions on bank applications \(H\.2\)/.test(read("app/layout.tsx").replace(/\s+/g, " ")) &&
      /with its weekly actions on bank applications \(H\.2\)/.test(read("app/legal/terms/page.tsx").replace(/\s+/g, " ")));
  check("  …a title names who acted, under what authority, on what", actionTitle({ week: "1999-12-11", n: 1, day: "1999-12-10", board: false, by: "Director, BS&R", category: "Bank Holding Companies", outcome: "Permitted", head: "Norwest Corporation, Minneapolis, Minnesota", what: "to acquire CheckFree Corporation." }) ===
    "The Board's Director of Banking Supervision and Regulation permitted, under delegated authority, Norwest Corporation's notice to acquire CheckFree Corporation");

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  if (fail) process.exit(1);
}

function fakeDb(listed: string | null, board: { day: string; title: string; body: string }[]): PoolClient {
  return {
    query: async (sql: string) => {
      if (/FROM prices/.test(sql)) return { rows: [{ listed }] };
      if (/sec:%:rename:%/.test(sql)) return { rows: [] };
      if (/s\.key = 'fed_press'/.test(sql)) return { rows: board };
      throw new Error(`unexpected query: ${sql.slice(0, 80)}`);
    },
  } as unknown as PoolClient;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
