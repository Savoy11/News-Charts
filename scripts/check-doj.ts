import { readFileSync } from "node:fs";
import { join } from "node:path";
import tickerIndex from "../data/edgar-tickers.json";
import { DOJ_CAP, dojEvents, dojPossessive, dojQueryNames, fetchJusticeReleases, plainText, releaseDate, releaseNamesParty, type DojRelease } from "../lib/doj";
import { companyNames } from "../lib/frCompany";
import { newsNamesFor } from "../lib/sec";
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
    check("  …with the contact User-Agent", agents.every((a) => /^News Charts Research \S+@\S+$/.test(a)), agents[0]);
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
  check("company ingest asks for the company's releases under its names and its possessive",
    (COMPANY_SOURCES as readonly string[]).includes("doj_press") &&
      /await run\("doj_press", dojQueryNames\(companyNames\(company\.name, alsoKnownAs\), dojPossessive\(company\.name, possessive\)\)\.join\(" \| "\), \(\) =>\s*fetchJusticeReleases\(company\.name, alsoKnownAs, possessive\)/.test(ingest));
  check("the Justice Department is credited where the other sources are",
    /press releases from the\s+U\.S\. Department of Justice/.test(read("app/layout.tsx")) &&
      /press releases from\s+the U\.S\. Department of Justice/.test(read("app/legal/terms/page.tsx")) &&
      /\| U\.S\. Department of Justice \|/.test(read("README.md")));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  process.exit(fail ? 1 : 0);
}

main();
