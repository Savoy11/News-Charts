import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { PoolClient } from "pg";
import tickerIndex from "../data/edgar-tickers.json";
import { DOJ_CAP, dojEvents, dojPossessive, dojQueryNames, fetchJusticeReleases, justiceQueryNames, plainText, releaseDate, releaseNamesParty, type DojRelease } from "../lib/doj";
import {
  ARCHIVE_FIRST_YEAR,
  ARCHIVE_LAST_YEAR,
  archiveMonthUrl,
  archiveMonths,
  asDojRelease,
  decodePage,
  fetchArchiveMonth,
  monthKey,
  parseArchiveMonth,
  type ArchiveRelease,
  type MonthAnswer,
} from "../lib/dojArchive";
import { withoutTag } from "../lib/edgarName";
import { MONTHS_PER_RUN, dojArchiveFor, walkDojArchive, withArchive, type ArchiveWalk } from "../lib/ingest/dojArchiveWalk";
import { namesForYear } from "../lib/ingest/frBackfill";
import { RELEASE_NAMES, isNotesRecord, releaseNamesAsked, releaseNamesBefore, releaseNamesOn } from "../lib/releaseNames";
import { companyNames } from "../lib/frCompany";
import { newsNamesFor, possessiveNameFor } from "../lib/sec";
import type { TimelineEvent } from "../lib/types";
import { SOURCES } from "../lib/ingest/store";
import { deterministicScore } from "../lib/enrich/relevance";
import { COMPANY_SOURCES } from "./ingest";

/**
 * Justice Department press releases on company pages (batch 32).
 *
 *   npm run check:doj
 *
 * The releases are real, read from justice.gov's API on 2026-10-22
 * (scripts/fixtures/doj-releases.json): settlements, pleas, suits and merger cases naming a listed
 * company as a party, and releases that only mention one — a former employee, a robbery, a crime
 * committed on Facebook, an immigrant's visa, a dollar amount ending in "3M". Offline: the fetch is
 * mocked.
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
const fixture: Record<string, { edgar: string; releases: DojRelease[] }> = JSON.parse(read("scripts/fixtures/doj-releases.json"));
const companies = tickerIndex.companies as [number, string, string][];

/** The names the ingest asks for and matches under, from the committed indexes. */
function namesOf(ticker: string): string[] {
  const row = companies.find(([, t]) => t === ticker);
  if (!row) throw new Error(`no ${ticker} in the ticker index`);
  return companyNames(row[2], newsNamesFor(row[0]));
}

/** Whether the release in the fixture whose title contains `part` names the company as a party. */
function verdict(ticker: string, part: string): boolean | string {
  const r = fixture[ticker]?.releases.find((x) => plainText(x.title ?? "").includes(part));
  if (!r) return `no fixture release containing "${part}"`;
  return releaseNamesParty(plainText(r.title ?? ""), namesOf(ticker));
}

function expectAll(name: string, cases: [ticker: string, part: string][], want: boolean): void {
  const wrong = cases.map(([t, p]) => [t, p, verdict(t, p)] as const).filter(([, , v]) => v !== want);
  check(name, wrong.length === 0, wrong.map(([t, p, v]) => `${t} "${p}": ${v}`).join("; "));
}

async function main(): Promise<void> {
  console.log("\nA party to the release: the company acts or is acted against");
  expectAll("the company is the subject of the verb — it pays, it is charged",
    [["BA", "Boeing Pays $18 Million"], ["BA", "Boeing Company to Pay U.S. $25 Million"]], true);
  expectAll("  …after its trade, or beside another party", [["PFE", "Drug Maker Pfizer Agrees"], ["PFE", "Wyeth and Pfizer Agree to Pay"]], true);
  expectAll("  …with its legal form or a unit's name after it",
    [["JPM", "JPMorgan Chase & Co. Agrees To Pay $920"], ["JNJ", "Subsidiary Scios Pleads Guilty"], ["WFC", "Settlement with Wells Fargo Dealer Services"]], true);
  expectAll("an action names it as the object — sued, settled with, charged", [
    ["WMT", "Files Nationwide Lawsuit Against Walmart Inc."],
    ["WMT", "Settlements with CarMax, Axis Analytics, Capital One Bank and Walmart"],
    ["WMT", "Kohl’s and Walmart Agree"],
    ["WFC", "Settlement Of Its Claims Against Wells Fargo Bank, N.A."],
  ], true);
  expectAll("  …a word before it, or a court caption, does not hide it", [["GOOGL", "Sues Monopolist Google"], ["UNH", "U.S. v. UnitedHealth Group"]], true);
  expectAll("a unit of the company is the party", [["MSFT", "Hungary Subsidiary Of Microsoft Corporation"], ["CVS", "a CVS Health Company"]], true);
  expectAll("its own merger or sale is the case", [
    ["T", "Lawsuit to Block AT&T’s Acquisition of T-Mobile"],
    ["T", "Challenges AT&T/DirecTV’s Acquisition"],
    ["GE", "from Buying General Electric"],
    ["CSCO", "Cisco’s Acquisition of Tandberg"],
  ], true);
  expectAll("its other name counts as its name", [["META", "Settlement With Meta Platforms, Inc., Formerly"], ["META", "Facebook Agrees to Pay $5 Billion"]], true);
  expectAll("a one-word name opening the title or a clause",
    [["V", "Visa and Plaid Abandon Merger"], ["XOM", "Exxonmobil to Reduce Harmful"], ["MMM", "3M Company Abandons"]], true);

  console.log("\nOnly a mention: someone else is the party");
  expectAll("a namesake, a product, a victim", [
    ["AAPL", "Settles with Apple Tree"],
    ["AAPL", "Apple Pay Fraud"],
    ["AAPL", "Scheme to Defraud Apple Inc. Out of 5,000"],
    ["AAPL", "Bellevue Man who Defrauded Bank"],
    ["AMZN", "Hartford Man Who Defrauded Amazon"],
    ["WMT", "Scheme to Defraud Walmart"],
    ["HD", "from The Home Depot Sentenced"],
  ], false);
  expectAll("a former employee, or one at the company", [
    ["BA", "Former Boeing Engineer Convicted"],
    ["KO", "Former Employee of the Coca-Cola Company"],
    ["BAC", "Manager at Bank of America Pleads Guilty"],
    ["META", "Former global diversity executive at Facebook"],
    ["WFC", "Information Stolen by Wells Fargo Employees"],
    ["WFC", "Wells Fargo Personal Banker Indicted for Money Laundering"],
    ["WFC", "Ex-Wells Fargo Manager Pleads Guilty"],
  ], false);
  expectAll("a crime committed on its service", [["META", "Threatened Police on Facebook Pleads"], ["GOOGL", "Convicted sex offender heads to prison for uploading"]], false);
  expectAll("people and things carrying its name", [["TSLA", "Violent Tesla Arsonists"], ["TSLA", "Buying House and Tesla"]], false);
  expectAll("a one-word name that is also a word, or the end of an amount",
    [["V", "on Work VISA Sentenced"], ["V", "Overstayed Her Visa Pleads"], ["MMM", "Defense Contractor to Pay $3.3M"]], false);
  expectAll("a trader in its deal, not the deal", [["DIS", "Insider Trading In The Walt Disney Company"]], false);
  const inWord = [...fixture.INTC.releases, ...fixture.CSCO.releases.filter((r) => /Francisco/.test(r.title ?? ""))];
  check("the API's match inside a word — Intel in Intelligence, Cisco in San Francisco — never counts",
    inWord.length === 4 && inWord.every((r) => !releaseNamesParty(plainText(r.title ?? ""), [...namesOf("INTC"), ...namesOf("CSCO")])),
    inWord.map((r) => plainText(r.title ?? "").slice(0, 60)).join(" | "));

  console.log("\nOne event a day, from the release itself");
  const mck = dojEvents(fixture.MCK.releases, namesOf("MCK"));
  check("McKesson's settlement, posted by eight offices the same day, is one event",
    fixture.MCK.releases.length === 8 && mck.length === 1 && mck[0].date === "2017-01-17", `${mck.length} events`);
  check("  …the national office's copy, linked and credited",
    mck[0]?.url?.includes("/archives/opa/pr/") === true && mck[0]?.source === "Justice Department · Criminal Division", `${mck[0]?.url} · ${mck[0]?.source}`);
  const pfe = dojEvents(fixture.PFE.releases, namesOf("PFE"));
  const jan = pfe.find((e) => e.date === "2025-01-24");
  check("of a release in capitals and the same one in a sentence, the national office's wins",
    pfe.length === 3 && jan?.title === "Pfizer Agrees to Pay Nearly 60M to Resolve False Claims Allegations Relating to Improper Physician Payments by Subsidiary",
    jan?.title);
  check("an event is the release: a regulation, its date, its teaser as plain text, one identity wherever it is filed",
    jan?.type === "regulation" && jan?.sourceKey === "doj_press" && jan?.dedupBasis === `doj:${fixture.PFE.releases[2].uuid}` &&
      jan?.externalId === fixture.PFE.releases[2].uuid && !/[<>]|&\w+;/.test(jan?.description ?? "<") && (jan?.description ?? "").length <= 400,
    JSON.stringify(jan).slice(0, 200));
  check("newest first", pfe.map((e) => e.date).join(" ") === "2025-01-24 2018-05-24 2016-04-27", pfe.map((e) => e.date).join(" "));
  const boeing = dojEvents(fixture.BA.releases, namesOf("BA"));
  check("a title's line break and entities read as text",
    boeing.some((e) => e.title === "Boeing Company to Pay U.S. $25 Million to Resolve Allegations Related to Defective Work on KC-10 Aerial Refueling Aircraft"),
    boeing.map((e) => e.title).join(" | "));
  check("plain text from the API's HTML",
    plainText("Kohl&#8217;s &amp; Walmart<br />\r\nAgree&nbsp;to <b>Pay</b>") === "Kohl’s & Walmart Agree to Pay" && plainText("<p>A&#x2014;B</p>") === "A—B");
  check("the day from the API's Unix seconds, nothing from junk",
    releaseDate("1484654400") === "2017-01-17" && releaseDate(1737720000) === "2025-01-24" && releaseDate("") === null && releaseDate("soon") === null);
  check("a link anywhere but justice.gov is dropped",
    dojEvents([{ ...fixture.BA.releases[0], url: "https://example.com/opa/pr/boeing-pays" }], namesOf("BA")).length === 0);
  check(`at most ${DOJ_CAP} a company`,
    dojEvents(Array.from({ length: 70 }, (_, i) => ({ ...fixture.BA.releases[0], uuid: `u${i}`, date: 1444824000 - i * 86400 })), namesOf("BA")).length === DOJ_CAP);

  console.log("\nAsking the API");
  check("each name once, unless another already finds it: the filter matches inside titles",
    dojQueryNames(namesOf("META")).join("|") === "Meta Platforms|Facebook" && dojQueryNames(namesOf("AMZN")).join("|") === "Amazon",
    `${dojQueryNames(namesOf("META")).join("|")} · ${dojQueryNames(namesOf("AMZN")).join("|")}`);
  const realFetch = globalThis.fetch;
  const asked: URL[] = [];
  const agents: string[] = [];
  // the build's contact address is set in NEWS_CHARTS_CONTACT (lib/contact.ts, batch 92); a
  // stand-in on example.org for the run
  const contactWas = process.env.NEWS_CHARTS_CONTACT;
  process.env.NEWS_CHARTS_CONTACT = "builds@example.org";
  try {
    const page = (n: number) => fixture.BA.releases.concat(Array.from({ length: n }, (_, i) => ({ ...fixture.BA.releases[2], uuid: `pad${i}` })));
    globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      asked.push(url);
      agents.push(String((init?.headers as Record<string, string>)?.["User-Agent"] ?? ""));
      const rows = url.searchParams.get("page") === "0" ? page(47) : fixture.BA.releases.slice(0, 1);
      return new Response(JSON.stringify({ results: rows }), { status: 200 });
    }) as typeof fetch;
    const res = await fetchJusticeReleases("BOEING CO", []);
    check("reads page after page until one comes back short", asked.length === 2 && asked.map((u) => u.searchParams.get("page")).join(",") === "0,1",
      asked.map((u) => u.search).join(" "));
    check("  …asking for the company's name in titles, newest first, 50 a page",
      asked.every((u) => u.origin + u.pathname === "https://www.justice.gov/api/v1/press_releases.json" && u.searchParams.get("parameters[title]") === "BOEING" &&
        u.searchParams.get("sort") === "date" && u.searchParams.get("direction") === "DESC" && u.searchParams.get("pagesize") === "50"));
    check("  …with the contact User-Agent, the build's own", agents.length > 0 && agents.every((a) => a === "News Charts Research builds@example.org"), agents[0]);
    check("  …and keeps only what names Boeing as a party", res.outcome === "ok" && res.events.length === 2 && res.events.every((e) => /Boeing/.test(e.title)),
      res.events.map((e) => e.title).join(" | "));
    globalThis.fetch = (async () => new Response("slow down", { status: 429 })) as typeof fetch;
    const throttled = await fetchJusticeReleases("BOEING CO", []);
    globalThis.fetch = (async () => new Response("", { status: 500 })) as typeof fetch;
    const broken = await fetchJusticeReleases("BOEING CO", []);
    globalThis.fetch = (async () => { throw new Error("socket hang up"); }) as typeof fetch;
    const down = await fetchJusticeReleases("BOEING CO", []);
    check("a refusal is throttled, a failure an error — never an empty timeline",
      throttled.outcome === "throttled" && broken.outcome === "error" && broken.httpStatus === 500 && down.outcome === "error" && /socket/.test(down.detail ?? ""));
    globalThis.fetch = (async () => new Response(JSON.stringify({ results: fixture.KO.releases }), { status: 200 })) as typeof fetch;
    const none = await fetchJusticeReleases("COCA COLA CO", []);
    check("releases that only mention the company leave it honestly empty", none.outcome === "empty" && none.events.length === 0);
  } finally {
    if (contactWas === undefined) delete process.env.NEWS_CHARTS_CONTACT;
    else process.env.NEWS_CHARTS_CONTACT = contactWas;
    globalThis.fetch = realFetch;
  }

  console.log("\nA name with an apostrophe (batch 54, the 2026-10-25 audit's finding 1)");
  // real titles, read from justice.gov on 2026-10-25; the SEC writes MOODYS, KOHLS, MCDONALDS
  const MOODYS = "Justice Department and State Partners Secure Nearly $864 Million Settlement With Moody’s Arising From Conduct in the Lead up to the Financial Crisis";
  const KOHLS = "Kohl’s and Walmart Agree to Pay $5.5 Million in Combined Penalties for Alleged Deceptive Violations of the Textile Act and Rules and FTC Act Around the Use of Bamboo";
  const MCDONALDS = "Justice Department Settles Immigration-Related Discrimination Claim Against McDonald’s";
  const MACYS = "Justice Department Settles Immigration-Related Discrimination Claim Against Macy’s";
  const LOWES = "Maine’s U.S. Attorney’s Office Reaches Agreement with Lowe’s to Improve Customer Accessibility Nationwide";
  const LOWES_PAYS = "Lowe’s Home Centers to Pay $12.5M Penalty for Lead Paint Violations During Home Renovations";
  const lowes = [...namesOf("LOW"), dojPossessive("LOWES COMPANIES INC", "Lowe's")];
  check("a release names a company whose SEC title dropped the apostrophe: Moody's $864M settlement, Kohl's penalty, McDonald's",
    releaseNamesParty(MOODYS, namesOf("MCO")) && releaseNamesParty(KOHLS, namesOf("KSS")) && releaseNamesParty(MCDONALDS, namesOf("MCD")),
    JSON.stringify([namesOf("MCO"), namesOf("KSS"), namesOf("MCD")]));
  check("  …and one whose title keeps a straight apostrophe where justice.gov writes a curly one: Macy's",
    releaseNamesParty(MACYS, namesOf("M")), JSON.stringify(namesOf("M")));
  check("  …and Lowe's, under the possessive its name LOWES COMPANIES does not carry, by its Home Centers too",
    releaseNamesParty(LOWES, lowes) && releaseNamesParty(LOWES_PAYS, lowes) && !releaseNamesParty(LOWES, namesOf("LOW")), JSON.stringify(lowes));
  check("Walmart keeps the Kohl's release: it is the other party", releaseNamesParty(KOHLS, namesOf("WMT")));
  check("a release about someone else stays out, apostrophe or not: a Kohl's Cash scam, franchise owners, a robbery, a fraud on the store",
    !releaseNamesParty("St. Louis Man Sentenced to 87 Months in Prison for $300,000 Kohl’s Cash Scam", namesOf("KSS")) &&
      !releaseNamesParty("Justice Department Settles Allegations of Immigration-Related Employment Discrimination Against Wendy’s Franchise Owners in Maine", namesOf("WEN")) &&
      !releaseNamesParty("Man Pleads Guilty To Robbery At Wendy's In Topeka", namesOf("WEN")) &&
      !releaseNamesParty("Domino’s Pizza Franchisee Sentenced to a Year and a Day in Prison, Ordered to Pay $2.5 Million to IRS for Tax Crimes", namesOf("DPZ")) &&
      !releaseNamesParty("Three South Carolina Men Are Sentenced To Prison for Defrauding Lowe's Of More Than $450,000", lowes));
  check("the possessive to ask for: Wikidata's own name cut after its 's, or a one-word name's closing s; none where the title has it or no s",
    dojPossessive("MOODYS CORP /DE/", "Moody's Corporation") === "Moody's" && dojPossessive("KOHLS Corp") === "KOHL'S" &&
      dojPossessive("PAPA JOHNS INTERNATIONAL INC", "Papa John's") === "Papa John's" && dojPossessive("Macy's, Inc.") === "" && dojPossessive("Walmart Inc.") === "",
    [dojPossessive("MOODYS CORP /DE/", "Moody's Corporation"), dojPossessive("KOHLS Corp"), dojPossessive("Macy's, Inc.")].join(" · "));
  check("a possessive is asked for in both spellings: the filter matches an apostrophe as written",
    dojQueryNames(namesOf("MCO"), "Moody's").join("|") === "MOODYS|Moody's|Moody’s" && dojQueryNames(namesOf("M")).join("|") === "Macy's|Macy’s" &&
      dojQueryNames(namesOf("BA")).join("|") === "BOEING",
    `${dojQueryNames(namesOf("MCO"), "Moody's").join("|")} · ${dojQueryNames(namesOf("M")).join("|")}`);
  const askedFor: string[] = [];
  try {
    const moodys = [
      { title: MOODYS, date: "1484308800", url: "https://www.justice.gov/archives/opa/pr/justice-department-and-state-partners-secure-nearly-864-million-settlement-moody-s-arising", uuid: "ee17ce1c-2760-46c8-86f4-040c275d341b" },
      { title: "Justice Department and State Partners Secure $864 Million Settlement With Moody’s Arising From Conduct In The Lead Up To The Financial Crisis", date: "1484308800", url: "https://www.justice.gov/usao-nj/pr/justice-department-and-state-partners-secure-864-million-settlement-moody-s-arising", uuid: "038c4eba-9803-4b50-8a55-913cfb8df962" },
    ];
    // justice.gov as measured: only the curly spelling finds these titles
    globalThis.fetch = (async (input: string | URL) => {
      const q = new URL(String(input)).searchParams.get("parameters[title]") ?? "";
      askedFor.push(q);
      return new Response(JSON.stringify({ results: q.toLowerCase() === "moody’s" ? moodys : [] }), { status: 200 });
    }) as typeof fetch;
    const res = await fetchJusticeReleases("MOODYS CORP /DE/", [], "Moody's Corporation");
    check("Moody's page gets its settlement, once, from the national office", res.outcome === "ok" && res.events.length === 1 && !!res.events[0]?.url?.includes("/opa/") &&
      askedFor.join("|") === "MOODYS|Moody's|Moody’s", `${askedFor.join("|")} → ${res.events.map((e) => e.title).join(" | ")}`);
  } finally {
    globalThis.fetch = realFetch;
  }

  /**
   * Batch 82, the 2026-11-01 proposal 4: the units a bank owned count while it owned them, the
   * owner's "JPMorgan" is JPMorgan Chase's, and a bank's notes record takes no release
   * (lib/releaseNames.ts). Real releases, read 2026-11-01; on the code before this batch the
   * Wachovia and JPMorgan ones landed on no page.
   */
  console.log("\nA bank's units while it owned them, and its notes records (batch 82)");
  const units = fixture.BANK_UNITS.releases;
  const wfc = dojEvents(units, namesOf("WFC"), (day) => releaseNamesOn(72971, day));
  const jpm = dojEvents(units, namesOf("JPM"), (day) => releaseNamesOn(19617, day));
  check("Wachovia Bank's 2011 admission lands on Wells Fargo, which bought Wachovia on 2008-12-31, and the $13 billion settlement \"with JPMorgan\" on JPMorgan",
    wfc.map((e) => e.date).join(",") === "2011-12-08" && jpm.map((e) => e.date).join(",") === "2013-11-19",
    `${wfc.map((e) => e.date).join(",")} · ${jpm.map((e) => e.date).join(",")}`);
  check("  …neither under the bank's own names alone", dojEvents(units, namesOf("WFC")).length === 0 && dojEvents(units, namesOf("JPM")).length === 0);
  check("  …nor before the purchase: the same Wachovia release dated 2008-12-30",
    dojEvents([{ ...units[0], date: String(Date.UTC(2008, 11, 30, 12) / 1000) }], namesOf("WFC"), (day) => releaseNamesOn(72971, day)).length === 0);
  /**
   * Batch 90, the 2026-11-05 audit's finding 1: the Justice step read no first price, so batch 89's
   * "Citizens Bank" unit gave CFG another bank's settlement of 2011. Every release the title filter
   * "Citizens Bank" returned on 2026-11-05.
   */
  const cfgRows = fixture.CFG.releases;
  const cfgOn = (day: string) => releaseNamesOn(759944, day);
  const settlement = dojEvents(cfgRows, namesOf("CFG"), cfgOn);
  check("CFG's unit \"Citizens Bank\" reads Citizens Republic Bancorp's lending settlement of 2011-05-05 as a party, of the 25 releases the filter returns — the robberies and tellers aside",
    cfgRows.length === 25 && settlement.map((e) => e.date).join(",") === "2011-05-05" && /Citizens Republic Bancorp/.test(settlement[0]?.title ?? ""),
    settlement.map((e) => `${e.date} ${e.title.slice(0, 60)}`).join(" · "));
  check("  …and from CFG's first price, 2014-09-24, as the other release rules read, it is not CFG's",
    dojEvents(cfgRows, namesOf("CFG"), cfgOn, "2014-09-24").length === 0 && dojEvents(units, namesOf("WFC"), (day) => releaseNamesOn(72971, day), "1972-06-01").length === 1);
  let floorAsked = 0;
  try {
    globalThis.fetch = (async () => {
      floorAsked++;
      return new Response(JSON.stringify({ results: cfgRows, metadata: { resultset: { count: cfgRows.length } } }), { status: 200 });
    }) as typeof fetch;
    const floored = await fetchJusticeReleases("CITIZENS FINANCIAL GROUP INC/RI", newsNamesFor(759944), "", 759944, { from: "2014-09-24" });
    const unfloored = await fetchJusticeReleases("CITIZENS FINANCIAL GROUP INC/RI", newsNamesFor(759944), "", 759944);
    check("  …through the fetch too: from its first price the step keeps none of them",
      floored.outcome === "empty" && floored.events.length === 0 && unfloored.events.length === 1 && floorAsked > 0);
  } finally {
    globalThis.fetch = realFetch;
  }
  const ubsOn = (day: string) => releaseNamesOn(1610520, day);
  check("Credit Suisse's $5.28 billion settlement of 2017 is UBS Group's no more than it was before UBS bought Credit Suisse on 2023-06-12",
    dojEvents(units, namesOf("UBS"), ubsOn).length === 0);
  check("  …while the same headline after the purchase is (a constructed day, 2023-11-14)",
    dojEvents([{ ...units[2], date: "1700000000" }], namesOf("UBS"), ubsOn).map((e) => e.date).join(",") === "2023-11-14");
  check("the units are asked for with the company's names, whatever their days, since the filter knows none",
    justiceQueryNames("BANK OF AMERICA CORP /DE/", [], "", 70858).join("|") ===
      "BANK OF AMERICA|Banc of America Securities|Banc of America Investment Services|Banc of America Capital Management|BofA Securities|Merrill Lynch" &&
      justiceQueryNames("BANK OF AMERICA CORP /DE/", []).join("|") === "BANK OF AMERICA",
    justiceQueryNames("BANK OF AMERICA CORP /DE/", [], "", 70858).join("|"));
  check("a name under five characters stands in for no longer one, since its ask stops at a page when crowded: UBS Group keeps \"UBS Group\", Dell \"Dell Technologies\"",
    justiceQueryNames("UBS Group AG", [], "", 1610520).join("|") === "UBS Group|UBS|Credit Suisse|UBS Securities|UBS Financial Services" &&
      dojQueryNames(["Dell Technologies", "Dell"]).join("|") === "Dell Technologies|Dell" && dojQueryNames(["JPMORGAN CHASE", "JPMorgan"]).join("|") === "JPMorgan",
    `${justiceQueryNames("UBS Group AG", [], "", 1610520).join("|")} · ${dojQueryNames(["Dell Technologies", "Dell"]).join("|")}`);
  let notesAsked = 0;
  try {
    globalThis.fetch = (async () => {
      notesAsked++;
      return new Response(JSON.stringify({ results: units }), { status: 200 });
    }) as typeof fetch;
    const gldi = await fetchJusticeReleases("CREDIT SUISSE AG", [], "", 1053092);
    const amub = await fetchJusticeReleases("UBS AG", [], "", 1114446);
    check("a bank's notes record, Credit Suisse AG's or UBS AG's, is asked nothing and takes no release",
      notesAsked === 0 && gldi.outcome === "empty" && gldi.events.length === 0 && /notes record/.test(gldi.detail ?? "") && amub.events.length === 0,
      `${notesAsked} asked, ${gldi.detail}`);
    const before = await fetchJusticeReleases("CREDIT SUISSE AG", []);
    check("  …where before this batch Credit Suisse AG's page took the settlement", before.events.length === 1 && notesAsked === 1);
  } finally {
    globalThis.fetch = realFetch;
  }

  await archiveChecks();

  console.log("\nRegistered, licensed, wired");
  const src = SOURCES.find((s) => s.key === "doj_press");
  check("the source is registered as public domain, cleared for commercial use, with the day it was read",
    src?.license === "public domain" && src.commercialOk && src.reviewedOn === "2026-10-22" && src.id === 23, JSON.stringify(src));
  const google = { kind: "company" as const, displayName: "Alphabet Inc.", ticker: "GOOGL" };
  const sued = { eventId: 0, kind: "regulation" as const, title: "Justice Department Sues Monopolist Google For Violating Antitrust Laws" };
  check("a release is scored without the model, though its headline names Google obliquely",
    deterministicScore({ ...sued, sourceKey: "doj_press" }, google, ["alphabet", "google"])?.score === 0.95 &&
      deterministicScore({ ...sued, sourceKey: "federal_register" }, google, ["alphabet", "google"]) === null);
  const ingest = read("scripts/ingest.ts");
  check("company ingest asks for the company's releases under its names, its possessive and its units (batch 82), and a fund's series asks nothing (batch 85)",
    (COMPANY_SOURCES as readonly string[]).includes("doj_press") &&
      /const fundSeries = fundSeriesId\(company\.ticker\) !== null;\s*await run\("doj_press", `\$\{justiceQueryNames\(company\.name, alsoKnownAs, possessive, company\.cik\)\.join\(" \| "\)\} \+ the 2001–2008 archive`, async \(\) => \{\s*if \(fundSeries\) return FUND_SERIES\(\);/.test(ingest));
  check("  …from its first price, read after its prices, and asked again next run while it has none (batch 90)",
    /const listed = isNotesRecord\(company\.cik\) \? "" : await firstPriceDay\(client, subjectId\);\s*if \(listed === null\) return NO_PRICES\(\);\s*const api = await fetchJusticeReleases\(company\.name, alsoKnownAs, possessive, company\.cik, \{ from: listed \}\);/.test(ingest) &&
      ingest.indexOf('await run("doj_press"') > ingest.indexOf("await companyPrices("));
  check("the Justice Department is credited where the other sources are",
    /press releases from the\s+U\.S\. Department of Justice/.test(read("app/layout.tsx")) &&
      /press releases from\s+the U\.S\. Department of Justice/.test(read("app/legal/terms/page.tsx")) &&
      /\| U\.S\. Department of Justice \|/.test(read("README.md")));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  process.exit(fail ? 1 : 0);
}

// ─── The archive of 2001–2008 (batch 94) ──────────────────────────────────────────────────────

/**
 * Every month page of the archive, 2001-01 to 2008-12, byte-exact as served on 2026-11-05
 * (scripts/fixtures/doj-archive-months.json.gz), and each matched company's first trading day as
 * Yahoo gave it that day (`firstTradeDate`), which the stored prices begin with.
 */
const ARCHIVE: { provenance: string; months: Record<string, string> } = JSON.parse(gunzipSync(readFileSync(join(root, "scripts/fixtures/doj-archive-months.json.gz"))).toString("utf8"));
const pageOf = (key: string) => decodePage(new Uint8Array(Buffer.from(ARCHIVE.months[key], "latin1")));
const ARCHIVE_FIRST_PRICES: Record<string, string> = { AA: "1962-01-02", AAL: "2005-09-27", ABT: "1980-03-17", ADM: "1980-03-17", AEP: "1962-01-02", AIG: "1973-01-02", AKZOY: "1989-05-09", AMC: "2013-12-18", ASH: "1980-03-17", AXP: "1972-06-01", BA: "1962-01-02", BCC: "2013-02-06", BMY: "1972-06-01", BP: "1962-01-02", BPOP: "1980-03-17", BUSE: "1998-10-06", CM: "1997-11-13", CMCSA: "1980-03-17", COMP: "2021-04-01", COP: "1981-12-31", CVS: "1973-02-21", CVX: "1962-01-02", DAL: "2007-05-03", DD: "1972-06-01", DDD: "1988-03-10", DGX: "1996-12-17", ECHO: "2008-01-02", ELV: "2001-10-30", EXC: "1973-05-02", FITB: "1980-03-17", FLS: "1980-03-17", GE: "1962-01-02", GPK: "1992-12-10", GWW: "1973-02-21", HD: "1981-09-22", HON: "1962-01-02", HXL: "1980-03-17", IFNNY: "2000-03-13", IR: "2017-05-12", ITT: "1995-12-15", KMI: "2011-02-11", LLY: "1972-06-01", LMT: "1962-01-02", LUCN: "2024-09-13", MCK: "1994-11-10", MDT: "1973-05-02", MMM: "1962-01-02", MRK: "1962-01-02", MSFT: "1986-03-13", MTW: "1990-03-26", NBHC: "2012-09-20", NCLH: "2013-01-18", NOC: "1981-12-31", NWSA: "2013-06-19", ORCL: "1986-03-12", PEG: "1980-01-02", PFE: "1972-06-01", PRU: "2001-12-13", PSO: "1996-11-18", QCOM: "1991-12-13", RF: "1980-03-17", RSG: "1998-07-01", RY: "1995-10-16", SAIC: "2013-09-16", SFD: "2025-01-28", SUN: "2012-09-20", T: "1983-11-21", TBBK: "2004-02-03", TFC: "1980-03-18", TGT: "1973-02-21", THC: "1980-03-17", TM: "1980-03-17", TSN: "1980-03-17", TXT: "1973-02-21", UAL: "2006-02-06", UIS: "1972-06-01", UNH: "1984-10-17", USB: "1973-05-03", VLO: "1982-01-04", VZ: "1983-11-21", WAB: "1995-06-16", WELPP: "1994-04-08", WFC: "1972-06-01", WHR: "1973-02-21", WMT: "1972-08-25", WY: "1973-05-03", XOM: "1962-01-02", CX: "1999-09-15" };
/** EDGAR's former names for the companies the cases read under one, as data.sec.gov gave them on 2026-11-05. */
const ARCHIVE_FORMER: Record<string, { name: string; until: string }[]> = {
  WMT: [{ name: "WAL MART STORES INC", until: "2018-01-30" }],
  TFC: [{ name: "BB&T CORP", until: "2019-12-06" }, { name: "SOUTHERN NATIONAL CORP /NC/", until: "1997-05-14" }],
};

function parsedArchive(): { releases: ArchiveRelease[]; unread: string[]; perMonth: Map<string, number> } {
  const releases: ArchiveRelease[] = [];
  const unread: string[] = [];
  const perMonth = new Map<string, number>();
  for (const { year, month, key } of archiveMonths()) {
    const got = parseArchiveMonth(pageOf(key), year, month);
    releases.push(...got.releases);
    unread.push(...got.unread.map((u) => `${key} ${u}`));
    perMonth.set(key, got.releases.length);
  }
  return { releases, unread, perMonth };
}

/** The names a company's ingest matches the archive under (`partyNamesFor`), from the committed indexes and `ARCHIVE_FORMER`. */
function archiveNamesOf(cik: number, title: string, ticker: string): (year: number) => string[] {
  const former = ARCHIVE_FORMER[ticker] ?? [];
  const own = dojPossessive(title, possessiveNameFor(cik));
  const legal = (year: number) => [title, ...former.filter((f) => f.until >= `${year}-01-01`).map((f) => f.name)].map(withoutTag);
  return (year) => [...companyNames(title, namesForYear(year, newsNamesFor(cik), former)), ...(own ? [own] : []), ...legal(year)];
}

/** Every company in the index against every kept release: what each gets with no floor, and from its first price on. */
function replayArchive(releases: ArchiveRelease[]): { all: Map<string, TimelineEvent[]>; shown: Map<string, TimelineEvent[]> } {
  const alnum = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  const letters = releases.map((r) => alnum(r.title));
  const all = new Map<string, TimelineEvent[]>();
  const shown = new Map<string, TimelineEvent[]>();
  const seen = new Set<number>();
  for (const [cik, ticker, title] of companies) {
    if (seen.has(cik) || isNotesRecord(cik)) continue;
    seen.add(cik);
    const namesIn = archiveNamesOf(cik, title, ticker);
    const keys = [...new Set([...namesIn(2001), ...namesIn(2008), ...releaseNamesAsked(cik)].map(alnum).filter((k) => k.length >= 2))];
    const held = releases.filter((_, i) => keys.some((k) => letters[i].includes(k))).map(asDojRelease);
    if (!held.length) continue;
    const on = (day: string) => [...namesIn(Number(day.slice(0, 4))), ...releaseNamesOn(cik, day)];
    const got = dojEvents(held, [], on);
    if (!got.length) continue;
    all.set(ticker, got);
    const listed = ARCHIVE_FIRST_PRICES[ticker];
    const kept = listed ? dojEvents(held, [], on, listed, (day) => releaseNamesBefore(cik, day)) : [];
    if (kept.length) shown.set(ticker, kept);
  }
  return { all, shown };
}

interface ArchiveDb {
  months: Map<string, { releases: number; unread: number }>;
  releases: Map<string, ArchiveRelease>;
  listed: string | null;
  renames: { until: string; body: string }[];
}
function fakeArchiveDb(db: ArchiveDb): PoolClient {
  return {
    query: async (sql: string, params: unknown[] = []) => {
      const s = sql.trim();
      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(s)) return { rows: [] };
      if (/^SELECT to_char\(month, 'YYYY-MM'\) AS month FROM doj_archive_months$/.test(s)) return { rows: [...db.months.keys()].map((month) => ({ month })) };
      if (/^INSERT INTO doj_archive_releases \(path, filed_on, number, title, teaser\)[\s\S]*ON CONFLICT \(path\) DO NOTHING$/.test(s)) {
        const [paths, days, numbers, titles, teasers] = params as [string[], string[], (string | null)[], string[], (string | null)[]];
        let added = 0;
        paths.forEach((path, i) => {
          if (db.releases.has(path)) return;
          added++;
          db.releases.set(path, { path, day: days[i], number: numbers[i], title: titles[i], teaser: teasers[i] });
        });
        return { rows: [], rowCount: added };
      }
      if (/^INSERT INTO doj_archive_months \(month, releases, unread\)/.test(s)) {
        const [month, releases, unread] = params as [string, number, number];
        if (!db.months.has(month.slice(0, 7))) db.months.set(month.slice(0, 7), { releases, unread });
        return { rows: [] };
      }
      if (/^SELECT path, filed_on::text AS day, number, title, teaser FROM doj_archive_releases ORDER BY filed_on, path$/.test(s)) {
        return { rows: [...db.releases.values()].sort((a, b) => a.day.localeCompare(b.day) || a.path.localeCompare(b.path)) };
      }
      if (/FROM prices/.test(s)) return { rows: [{ listed: db.listed }] };
      if (/FROM events e/.test(s)) return { rows: db.renames };
      throw new Error(`unexpected query: ${s.slice(0, 80)}`);
    },
  } as unknown as PoolClient;
}

async function archiveChecks(): Promise<void> {
  console.log("\nThe archive of 2001–2008 (batch 94): every month page read");
  const { releases, unread, perMonth } = parsedArchive();
  const years = new Map<string, number>();
  for (const r of releases) years.set(r.day.slice(0, 4), (years.get(r.day.slice(0, 4)) ?? 0) + 1);
  check("the 96 saved months give 5,712 releases, each month 29 or more, and every row read but 5",
    archiveMonths().length === 96 && releases.length === 5712 && Math.min(...perMonth.values()) >= 29 && unread.length === 5 &&
      [...years.values()].join() === "621,648,670,771,529,650,802,1021",
    `${releases.length}; ${[...years].map(([y, n]) => `${y} ${n}`).join(", ")}; least ${Math.min(...perMonth.values())}; unread ${unread.length}`);
  check("  …the 5 a slip in the page leaves unread, not guessed: a day that is no day, a day in another month, a row with none",
    unread.some((u) => /^2002-02 .*\(02-30-02\)/.test(u)) && unread.some((u) => /^2001-08 .*\(02-14-01\)/.test(u)) &&
      unread.some((u) => /^2001-10 a row not read: #526: THREE ADMIT GUILT/.test(u)) && unread.some((u) => /^2001-01 a row not read: Pardon$/.test(u)),
    unread.join(" | "));
  const byPath = new Map(releases.map((r) => [r.path, r]));
  const one = (path: string) => byPath.get(path);
  const aep = releases.find((r) => r.number === "05-032");
  check("the 2005–2008 layout: a day heading, a title wrapped over lines, its number, its link",
    aep?.day === "2005-01-26" && aep.title === "American Electric Power, Inc. To Pay $30 Million Penalty To Resolve Criminal Allegations" &&
      /^\/archive\/opa\/pr\/2005\/January\/05_\w+_032\.htm$/.test(aep.path), JSON.stringify(aep));
  const microsoft = releases.find((r) => r.day === "2001-06-28" && /MICROSOFT/.test(r.title));
  check("the 2001–2004 layout: \"#301: 06-29-01 TITLE\", its link beside the month page",
    microsoft?.title === "STATEMENTS REGARDING THE MICROSOFT DECISION" && /^\/archive\/opa\/pr\/2001\/June\/[^/]+\.htm$/.test(microsoft.path) &&
      one("/archive/opa/pr/2001/June/301at.htm")?.number === "#301", JSON.stringify(microsoft));
  const kinder = releases.find((r) => /^Kinder Morgan, SFPP Agree to Pay/.test(r.title));
  check("  …a title the page gives no number is read, Kinder Morgan's of 2007 among them, and a link written with spaces",
    kinder?.day === "2007-05-21" && kinder.number === null && one("/archive/opa/pr/2005/December/05_enrd_680.html")?.day === "2005-12-19" &&
      one("/archive/opa/pr/2005/December/05_crm_670.html")?.number === "05-67", `${JSON.stringify(kinder)}`);
  check("  …the first lines under a title are its teaser, from mid-2005: 2,667 of them",
    releases.filter((r) => r.teaser).length === 2667 && /^The Justice Department has filed papers/.test(releases.find((r) => r.number === "08-579")?.teaser ?? ""),
    `${releases.filter((r) => r.teaser).length}`);
  const odd = releases.filter((r) => /[\u0080-\u009f�]/.test(r.title));
  check("the old pages' Windows-1252 quotes read as quotes, the bytes and the \"&#146;\"s: none left as \"�\" or a control character",
    odd.length === 0 && releases.some((r) => r.title === "JUSTICE DEPARTMENT RECOMMENDS APPROVAL OF VERIZON’S APPLICATION TO PROVIDE LONG DISTANCE SERVICES IN RHODE ISLAND"),
    odd.slice(0, 2).map((r) => r.title).join(" | "));
  const page2004 = Buffer.from(ARCHIVE.months["2004-09"], "latin1");
  check("  …a page that is not UTF-8 is read as Windows-1252, one that is as UTF-8",
    page2004.includes(0x92) && !/�/.test(decodePage(new Uint8Array(page2004))) && decodePage(new TextEncoder().encode("Kohl’s")) === "Kohl’s");

  console.log("\nThe archive's releases, on the companies they name");
  const ticker = (t: string) => {
    const row = companies.find(([, x]) => x === t);
    if (!row) throw new Error(`no ${t} in the ticker index`);
    return row;
  };
  const lands = (t: string, title: RegExp, day: string): boolean => {
    const [cik, , name] = ticker(t);
    const r = releases.find((x) => x.day === day && title.test(x.title));
    if (!r) return false;
    const namesIn = archiveNamesOf(cik, name, t);
    return dojEvents([asDojRelease(r)], [], (d) => [...namesIn(Number(d.slice(0, 4))), ...releaseNamesOn(cik, d)], ARCHIVE_FIRST_PRICES[t] ?? "", (d) => releaseNamesBefore(cik, d)).length === 1;
  };
  check("AEP's $30 million criminal penalty of 2005-01-26 lands on AEP, and Weyerhaeuser's Kalamazoo River settlement on WY",
    lands("AEP", /^American Electric Power, Inc\. To Pay \$30 Million/, "2005-01-26") && lands("WY", /^U\.S\. Reaches Settlement With Weyerhaeuser Company/, "2005-01-03"));
  check("  …and Akzo Nobel's antitrust plea of 2001-06-27, in capitals, on AKZOY",
    lands("AKZOY", /^DUTCH CHEMICAL GIANT, AKZO NOBEL, AGREES TO PLEAD GUILTY/, "2001-06-27"));
  check("Wal-Mart's of 2001-06-07 lands on WMT under its own short name of the time, and its suit of 2008-03-31 under its former legal name",
    lands("WMT", /^U\.S\. REACHES WATER POLLUTION SETTLEMENT WITH WAL-MART$/, "2001-06-07") && lands("WMT", /^Justice Department Files Lawsuit against Wal-mart Stores, Inc\./, "2008-03-31") &&
      RELEASE_NAMES[104169]?.names.some((n) => n.name === "Wal-Mart"));
  check("BB&T's divestitures of 2001-06-19 land on TFC under BB&T, Truist's name until 2019",
    lands("TFC", /^JUSTICE DEPARTMENT REQUIRES BB&T CORPORATION AND F&M NATIONAL CORPORATION/, "2001-06-19"));
  check("American Express Bank International's deferred prosecution of 2007-08-06 lands on AXP, its owner until 2008",
    lands("AXP", /^American Express Bank International Enters Into Deferred Prosecution/, "2007-08-06") &&
      releaseNamesOn(4962, "2008-03-01").every((n) => n !== "American Express Bank International"));
  check("the Microsoft statements of 2001-06-28 land on no page", !lands("MSFT", /^STATEMENTS REGARDING THE MICROSOFT DECISION$/, "2001-06-28"));

  console.log("\nAn everyday word as a name (batch 94)");
  const city = [726854, "CITY HOLDING CO", "CHCO"] as const;
  const cityNames = archiveNamesOf(city[0], city[1], city[2])(2007);
  check("City Holding's name is the word \"CITY\": a title in capitals needs its legal word, \"CITY AGREES TO PAY\" is not its",
    cityNames.includes("CITY") && !releaseNamesParty("JUSTICE DEPARTMENT SETTLES HOUSING DISCRIMINATION LAWSUIT WITH FAIRVIEW HEIGHTS ILLINOIS; CITY AGREES TO PAY $275,000", cityNames),
    cityNames.join(" | "));
  check("  …nor, in any title, the object with \"the\" or another word before it or \"of\" after: \"Lawsuit Against the City of Marion\"",
    !releaseNamesParty("Justice Department Files Lawsuit Against the City of Marion, Alabama to Defend Employment Rights of Alabama National Guard", cityNames) &&
      !releaseNamesParty("UNITED STATES FILES SUIT AGAINST NEWPORT NEWS SHIPBUILDING FOR ALLEGED FRAUD AGAINST THE NAVY", ["NEWS"]) &&
      !releaseNamesParty("DEPARTMENT OF JUSTICE ANNOUNCES SETTLEMENT AGREEMENT WITH THE WASHINGTON OPERA TO PROVIDE IMPROVED WHEELCHAIR-ACCESSIBLE SEATING", ["OPERA"]));
  check("  …while \"TARGET CORPORATION\" in capitals is Target's, and an all-caps \"TARGET\" with no legal word is not",
    releaseNamesParty("U.S ANNOUNCES AGREEMENTS WITH PROPERTY OWNERS AND TARGET CORPORATION TO ASSIST ENVIRONMENTAL CLEANUP AND REDEVELOPMENT OF RIALTO, CALIFORNIA PROPERTY", namesOf("TGT")) &&
      !releaseNamesParty("JUSTICE DEPARTMENT STATEMENT REGARDING DISTRICT COURTS DECISION IN U.S. V. ORACLE", namesOf("ORCL")) &&
      !releaseNamesParty("JUSTICE DEPARTMENT SEEKS INJUNCTION AGAINST TENNESSEE ATTORNEY TENNESSEE-BASED TAX SCAM THE TARGET OF LAW SUIT", namesOf("TGT")));
  // the API's own titles, read 2026-11-05 (uuids 4cfc7232-…, eb023605-…, 28953aff-…): mixed case keeps the word's company
  check("  …and the API's suits stay the company's: \"Sues Visa for Monopolizing\", \"Sues Apple for\", \"Sues American Express, Mastercard and Visa\"",
    releaseNamesParty("Justice Department Sues Visa for Monopolizing Debit Markets", namesOf("V")) &&
      releaseNamesParty("Justice Department Sues Apple for Monopolizing Smartphone Markets", namesOf("AAPL")) &&
      releaseNamesParty("Justice Department Sues American Express, Mastercard and Visa to Eliminate Rules Restricting Price Competition;Reaches Settlement with Visa and Mastercard", namesOf("V")));

  console.log("\nEvery listed company against every release");
  const { all, shown } = replayArchive(releases);
  const count = (m: Map<string, TimelineEvent[]>) => [...m.values()].reduce((n, v) => n + v.length, 0);
  check("131 releases name 87 companies; from each one's first price, 111 reach 73 pages (127, 86, 106 and 71 before batch 100)",
    count(all) === 131 && all.size === 87 && count(shown) === 111 && shown.size === 73 && [...all.keys()].every((t) => t in ARCHIVE_FIRST_PRICES),
    `${count(all)} on ${all.size}; ${count(shown)} on ${shown.size}; no first price: ${[...all.keys()].filter((t) => !(t in ARCHIVE_FIRST_PRICES)).join(",")}`);
  const off = [...all].flatMap(([t, v]) => v.filter((e) => !(shown.get(t) ?? []).some((x) => x.id === e.id)).map((e) => `${t} ${e.date}`));
  check("  …the 20 kept off are from before the company listed: News Corp's of 2001 and 2003, Kinder Morgan's of 2007, Norwegian Cruise Line's",
    off.length === 20 && ["NWSA 2001-04-11", "NWSA 2003-12-19", "KMI 2007-05-21", "NCLH 2002-07-31", "NBHC 2001-12-03"].every((x) => off.includes(x)), off.join(", "));
  check("  …and The Bancorp's \"Bancorp\" names no other bank (batch 100, the audit's finding 4): not FleetBoston's and Summit Bancorp's of 2001-01-25, which batch 94 counted as kept off by the first price",
    !all.has("TBBK") && !off.some((x) => x.startsWith("TBBK")) &&
      !releaseNamesParty("Justice Department Reaches Agreement with Berkshire Hills Bancorp and Legacy Bancorp on Divestitures", ["Bancorp"]) &&
      // a title written for the check, the rule's own case: the company's name is "The Bancorp, Inc."
      releaseNamesParty("Justice Department Settles With The Bancorp Over Prepaid Card Fees", ["Bancorp"]) && releaseNamesParty("THE BANCORP, INC. AGREES TO PAY", ["Bancorp"]));
  const merger = (t: string, d: string) => shown.get(t)?.some((e) => e.date === d) ?? false;
  check("  …and the 2005–2008 pages' \"VERIZON&#8216;S\" is a possessive (finding 5): Verizon's MCI case of 2005-10-27, Whirlpool's Maytag of 2006-03-29, AT&T's BellSouth and Dobson, CEMEX's Rinker",
    merger("VZ", "2005-10-27") && merger("WHR", "2006-03-29") && merger("T", "2006-10-11") && merger("T", "2007-10-30") && merger("CX", "2007-04-04") &&
      releases.every((r) => !/[\p{L}\d]‘s\b/iu.test(r.title)) && releaseNamesParty("REQUIRES DIVESTITURES IN VERIZON‘S ACQUISITION OF MCI", ["Verizon"]),
    ["VZ 2005-10-27", "WHR 2006-03-29", "T 2006-10-11", "T 2007-10-30", "CX 2007-04-04"].filter((x) => !merger(...(x.split(" ") as [string, string]))).join(", "));
  check("  …and City Holding gets none of the 46 releases about cities that the word alone would give it", !all.has("CHCO"));
  const shownYears = new Map<string, number>();
  for (const v of shown.values()) for (const e of v) shownYears.set(e.date.slice(0, 4), (shownYears.get(e.date.slice(0, 4)) ?? 0) + 1);
  const yearLine = [...shownYears].sort().map(([y, k]) => `${y} ${k}`).join(", ");
  check("  …in every year of the eight: 2001 14, 2002 8, 2003 13, 2004 10, 2005 8, 2006 19, 2007 15, 2008 24; Walmart 6, Tenet 5, Exxon Mobil 4",
    yearLine === "2001 14, 2002 8, 2003 13, 2004 10, 2005 8, 2006 19, 2007 15, 2008 24" &&
      shown.get("WMT")?.length === 6 && shown.get("THC")?.length === 5 && shown.get("XOM")?.length === 4,
    yearLine);
  const aepEvent = shown.get("AEP")?.find((e) => e.date === "2005-01-26");
  check("  …as the API's are: source doj_press, the Department credited, the release's link, keyed by its path",
    aepEvent?.sourceKey === "doj_press" && aepEvent.source === "Justice Department" && aepEvent.url === `https://www.justice.gov${aep?.path}` &&
      aepEvent.externalId === aep?.path && aepEvent.dedupBasis === `doj:${aep?.path}` && aepEvent.type === "regulation", JSON.stringify(aepEvent));

  console.log("\nRead once, and kept");
  const db: ArchiveDb = { months: new Map(), releases: new Map(), listed: "1962-01-02", renames: [] };
  const asked: string[] = [];
  const serve = async (year: number, month: number): Promise<MonthAnswer> => {
    asked.push(monthKey(year, month));
    const { releases: rows, unread: notRead } = parseArchiveMonth(pageOf(monthKey(year, month)), year, month);
    return { releases: rows, unread: notRead, outcome: "ok", httpStatus: 200 };
  };
  const walks: ArchiveWalk[] = [];
  for (let run = 0; run < 5; run++) walks.push(await walkDojArchive(fakeArchiveDb(db), { budget: { left: MONTHS_PER_RUN }, gapMs: 0, fetchMonth: serve }));
  check("a process reads at most 24 months, oldest first, so four read all 96",
    walks.slice(0, 4).every((w) => w.asked === 24 && w.kept === 24) && walks[3].left === 0 && asked[0] === "2001-01" && asked[95] === "2008-12" && db.releases.size === 5712,
    walks.map((w) => `${w.asked}/${w.left}`).join(" "));
  check("  …and a closed month is not asked twice: the fifth process asks nothing", walks[4].asked === 0 && asked.length === 96 && new Set(asked).size === 96);
  check("  …each month kept with the rows it could not read", db.months.get("2001-10")?.unread === 1 && db.months.get("2005-01")?.unread === 0 && db.months.get("2005-01")?.releases === perMonth.get("2005-01"));
  const failDb: ArchiveDb = { months: new Map(), releases: new Map(), listed: "1962-01-02", renames: [] };
  let n = 0;
  const flaky = async (year: number, month: number): Promise<MonthAnswer> => (++n === 3 ? { releases: [], outcome: "throttled", httpStatus: 429 } : serve(year, month));
  const stopped = await walkDojArchive(fakeArchiveDb(failDb), { budget: { left: 24 }, gapMs: 0, fetchMonth: flaky });
  check("a refusal stops the walk, keeps nothing for that month, and the next run asks it again",
    stopped.stopped === "throttled" && stopped.failure?.httpStatus === 429 && /^2001-03/.test(stopped.failure?.detail ?? "") && failDb.months.size === 2 && !failDb.months.has("2001-03") &&
      (await walkDojArchive(fakeArchiveDb(failDb), { budget: { left: 1 }, gapMs: 0, fetchMonth: serve })).kept === 1 && failDb.months.has("2001-03"), JSON.stringify(stopped));
  const blank = await (async () => {
    const real = globalThis.fetch;
    globalThis.fetch = (async () => new Response("<html><body>Access Denied</body></html>", { status: 200 })) as typeof fetch;
    try {
      return await fetchArchiveMonth(2001, 1);
    } finally {
      globalThis.fetch = real;
    }
  })();
  check("  …and a page listing no release it can read is an error, not a quiet month (a bot check answers 200)", blank.outcome === "error" && /no release read/.test(blank.detail ?? ""), JSON.stringify(blank));

  console.log("\nOn the company's page, with the API's");
  const plan = (t: string) => {
    const [cik, , name] = ticker(t);
    return { edgarName: name, alsoKnownAs: newsNamesFor(cik), possessive: dojPossessive(name, possessiveNameFor(cik)), cik };
  };
  const wmtDb: ArchiveDb = { ...db, listed: "1972-08-25", renames: [{ until: "2018-01-30", body: "EDGAR's company record lists WAL MART STORES INC as a former name of this filer, in use until this day." }] };
  const wmt = await dojArchiveFor(fakeArchiveDb(wmtDb), 1, plan("WMT"));
  check("ingest gives Walmart its six, under the names it had each year, from the kept rows",
    wmt?.length === 6 && wmt.every((e) => e.sourceKey === "doj_press") && wmt.some((e) => e.date === "2008-03-31"), (wmt ?? []).map((e) => e.date).join(", "));
  const unlisted = await dojArchiveFor(fakeArchiveDb({ ...db, listed: null }), 1, plan("WMT"));
  const nclh = await dojArchiveFor(fakeArchiveDb({ ...db, listed: "2013-01-18" }), 1, plan("NCLH"));
  const ubsNotes = await dojArchiveFor(fakeArchiveDb(db), 1, { edgarName: "UBS AG", alsoKnownAs: [], cik: 1114446 });
  check("  …nothing before the first price, nothing while there are no prices, nothing for a bank's notes record or a fund's series",
    unlisted === null && nclh?.length === 0 && ubsNotes?.length === 0 && (await dojArchiveFor(fakeArchiveDb(db), 1, { ...plan("WMT"), fundSeries: true }))?.length === 0);
  const apiOk = { events: [{ id: "doj-x" } as TimelineEvent], outcome: "ok" as const, httpStatus: 200 };
  const apiDown = { events: [], outcome: "throttled" as const, httpStatus: 429 };
  const walkDown: ArchiveWalk = { asked: 1, kept: 0, left: 96, releases: 0, stopped: "error", failure: { outcome: "error", httpStatus: 503, detail: "2001-01" } };
  const done: ArchiveWalk = { asked: 0, kept: 0, left: 0, releases: 0 };
  const a = withArchive(apiOk, wmt ?? [], done);
  const b = withArchive(apiDown, wmt ?? [], done);
  const c = withArchive(apiOk, wmt ?? [], walkDown);
  const e = withArchive({ events: [], outcome: "empty", httpStatus: 200 }, [], done);
  check("the API's answer and the archive's go under one source: the API's failure is the run's, else the walk's, and each part's releases are kept",
    a.outcome === "ok" && a.events.length === 7 && b.outcome === "throttled" && b.httpStatus === 429 && b.events.length === 6 &&
      c.outcome === "error" && c.events.length === 7 && /^the 2001–2008 archive, 2001-01/.test(c.detail ?? "") && e.outcome === "empty",
    `${a.outcome} ${b.outcome} ${c.outcome}:${c.detail} ${e.outcome}`);
  const ingest = read("scripts/ingest.ts");
  check("company ingest walks the archive after the API's ask and keeps the company's kept rows beside it, none for a notes record",
    /const api = await fetchJusticeReleases\([^)]*\);\s*if \(isNotesRecord\(company\.cik\)\) return api;[\s\S]{0,300}const walked = await walkDojArchive\(client\);\s*const archive = await dojArchiveFor\(client, subjectId, \{[^}]*cik: company\.cik \}\);\s*const answer = withArchive\(api, archive \?\? \[\], walked\);/.test(ingest));
  const migration = read("db/036_doj_archive.sql");
  check("  …into tables of its own (db/036)", /CREATE TABLE IF NOT EXISTS doj_archive_releases \(\s*path\s+text PRIMARY KEY/.test(migration) && /CREATE TABLE IF NOT EXISTS doj_archive_months \(\s*month\s+date PRIMARY KEY/.test(migration));
  check("  …asking only www.justice.gov's archive, with the build's User-Agent",
    archiveMonthUrl(2005, 1) === "https://www.justice.gov/archive/opa/pr/2005/January/" && /headers: \{ \.\.\.UA, Accept: "text\/html" \}/.test(read("lib/dojArchive.ts")) && ARCHIVE_FIRST_YEAR === 2001 && ARCHIVE_LAST_YEAR === 2008);
}

main();
