import { readFileSync } from "node:fs";
import { join } from "node:path";
import aliasFile from "../data/company-aliases.json";
import tickerIndex from "../data/edgar-tickers.json";
import { buildCompanyAliases, type WikidataCompany } from "../lib/companyAliases";
import { commonName, companyTickers, newsNamesFor, resolveTickerLocally, titleMatch, TICKER_INDEX_COMPANIES } from "../lib/sec";
import { GDELT_MIN_PHRASE, fetchNews, gdeltEverydayName, gdeltNames } from "../lib/news";
import { companyNames } from "../lib/frCompany";
import { dojQueryNames, releaseNamesParty } from "../lib/doj";

/**
 * Short company names (batch 33).
 *
 *   npm run check:short-names
 *
 * Two holes, both measured on 2026-10-22:
 *  - The alias builder dropped every three-letter one-word name as "too short" — right for "Sun",
 *    wrong for "IBM", Wikidata's own label for International Business Machines. IBM's news,
 *    federal documents and Justice Department releases were searched only under its long name.
 *  - GDELT refuses a quoted phrase under five characters ("The specified phrase is too short.",
 *    for "CSX" and for "Visa"), so 107 of the 1,500 largest companies — Visa, NIKE, AT&T, 3M, eBay,
 *    HSBC, SAP — were asked a query it refused, every run.
 *
 * The Wikidata items are real, as `npm run sync:aliases` read them; the GDELT replies are mocked
 * with the refusal GDELT really sends.
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
const view = { companies: TICKER_INDEX_COMPANIES, titleMatch, commonName, tickersOf: companyTickers };
const item = (o: Partial<WikidataCompany> & Pick<WikidataCompany, "qid" | "targetCik">): WikidataCompany => ({
  kind: "own",
  labels: [],
  officialNames: [],
  aliases: [],
  sitelinks: 0,
  ...o,
});
const titleOf = (ticker: string) => (tickerIndex.companies as [number, string, string][]).find(([, t]) => t === ticker)!;

async function main(): Promise<void> {
  console.log("\nA company's own initials are a name; a three-letter word still is not");
  const built = buildCompanyAliases(
    [
      item({ qid: "Q37156", targetCik: 51143, labels: ["IBM"], officialNames: ["International Business Machines Corporation"], aliases: ["IBM Corp.", "Big Blue"], sitelinks: 113 }),
      item({ qid: "Q128896", targetCik: 2488, labels: ["AMD"], officialNames: ["Advanced Micro Devices, Inc."], sitelinks: 78 }),
      item({ qid: "Q212235", targetCik: 5272, labels: ["American International Group"], officialNames: ["American International Group, Inc."], aliases: ["AIG"], sitelinks: 39 }),
      item({ qid: "Q155026", targetCik: 1090727, labels: ["United Parcel Service"], aliases: ["UPS", "American Messenger Company"], sitelinks: 46 }),
      item({ qid: "Q266423", targetCik: 14272, labels: ["Bristol-Myers Squibb"], aliases: ["BMS", "Bristol Myers Squibb"], sitelinks: 29 }),
      // the letters a company is called by, but not its initials
      item({ qid: "Q675585", targetCik: 1059556, labels: ["Moody's Corporation"], aliases: ["MCO", "Moody's"], sitelinks: 35 }),
      item({ qid: "Q1128160", targetCik: 16918, labels: ["Constellation Brands"], aliases: ["Constellation", "STZ"], sitelinks: 10 }),
      item({ qid: "Q14647", targetCik: 1341439, kind: "former", labels: ["Sun Microsystems"], aliases: ["Sun", "Stanford University Network"], sitelinks: 74 }),
      // initials, but of a company too little known for three letters to mean it
      item({ qid: "Q5154770", targetCik: 1108109, labels: ["Community Health Systems"], aliases: ["CHS"], sitelinks: 6 }),
    ],
    view
  );
  const why = (name: string) => built.dropped.find((d) => d.name === name)?.reason;
  check("IBM's own label is kept, and news may use it", JSON.stringify(built.aliases["IBM"]) === '[51143,"Q37156","name",1,"IBM"]', JSON.stringify(built.aliases["IBM"]));
  check("  …and AMD's", built.aliases["AMD"]?.[0] === 2488 && built.aliases["AMD"]?.[3] === 1, JSON.stringify(built.aliases["AMD"]));
  check("initials Wikidata files as an alias find the company in search, but claim no news: AIG, UPS, BMS",
    ["AIG", "UPS", "BMS"].every((k) => built.aliases[k]?.[2] === "alias" && built.aliases[k]?.[3] === 0) &&
      built.aliases["AIG"]?.[0] === 5272 && built.aliases["UPS"]?.[0] === 1090727 && built.aliases["BMS"]?.[0] === 14272);
  check("letters that are not the company's initials stay out: Moody's \"MCO\", Constellation's \"STZ\"",
    why("MCO") === "too short" && why("STZ") === "too short", `${why("MCO")} ${why("STZ")}`);
  check("  …and so does a word: \"Sun\"", why("Sun") === "too short" && !built.aliases["SUN"]);
  check("  …and a little-known company's initials: \"CHS\"", why("CHS") === "little known", why("CHS"));

  console.log("\nThe committed index, rebuilt from Wikidata with the rule");
  const aliases = aliasFile.aliases as unknown as Record<string, [number, string, string, number, string]>;
  check("IBM and AMD are news names now", newsNamesFor(51143).includes("IBM") && newsNamesFor(2488).includes("AMD"),
    `${newsNamesFor(51143)} | ${newsNamesFor(2488)}`);
  check("  …AIG and UPS are search names only", aliases["AIG"]?.[3] === 0 && aliases["UPS"]?.[3] === 0 && !newsNamesFor(5272).includes("AIG"));
  check("search finds Bristol Myers Squibb by \"BMS\" and Shell by \"RDS\"", resolveTickerLocally("BMS") === "BMY" && resolveTickerLocally("RDS") === "SHEL",
    `${resolveTickerLocally("BMS")} ${resolveTickerLocally("RDS")}`);
  check("  …while another company's ticker still wins: \"RBC\" is RBC Bearings, \"CNR\" Core Natural Resources",
    resolveTickerLocally("RBC") === "RBC" && resolveTickerLocally("CNR") === "CNR" && aliases["RBC"]?.[0] === 1000275,
    `${resolveTickerLocally("RBC")} ${resolveTickerLocally("CNR")}`);

  console.log("\nGDELT is never asked a phrase it refuses");
  check(`a name under ${GDELT_MIN_PHRASE} characters stays out of the query, scoring headlines only: IBM's query is its long name`,
    JSON.stringify(gdeltNames("INTERNATIONAL BUSINESS MACHINES", ["IBM"])) === '["INTERNATIONAL BUSINESS MACHINES"]' &&
      JSON.stringify(gdeltNames("RTX Corp", ["RTX", "Raytheon Technologies"])) === '["RTX Corp","raytheon technologies"]');
  const asked: [string, string][] = [
    ["VISA INC.", "VISA Inc"],
    ["CSX CORP", "CSX Corp"],
    ["NIKE, Inc.", "NIKE Inc"],
    ["3M CO", "3M Co"],
    ["AT&T INC.", "AT&T Inc"],
    ["NEWS CORP", "NEWS Corp"],
    ["HSBC HOLDINGS PLC", "HSBC Holdings"],
    ["SAP SE", "SAP SE"],
    ["Vale S.A.", "Vale SA"],
    ["KKR & Co. Inc.", "KKR & Co"],
    ["FORD MOTOR CO", "FORD MOTOR"],
  ];
  const wrong = asked.filter(([title, want]) => gdeltEverydayName(title) !== want);
  check("a short everyday name is asked with its title's legal form, the way an article first names it; a long one as it is",
    wrong.length === 0, wrong.map(([t]) => `${t} → ${gdeltEverydayName(t)}`).join("; "));
  const seen = new Set<number>();
  let short = 0;
  let askable = 0;
  (tickerIndex.companies as [number, string, string][]).forEach(([cik, , title], rank) => {
    if (seen.has(cik) || rank > 1500) return;
    seen.add(cik);
    if (commonName(title).length >= GDELT_MIN_PHRASE) return;
    short++;
    if (gdeltEverydayName(title).length >= GDELT_MIN_PHRASE) askable++;
  });
  check("of the 1,500 largest companies, the 107 with a short everyday name all but one get a query GDELT takes",
    short === 107 && askable === 106, `${askable} of ${short}`);

  const realFetch = globalThis.fetch;
  const queries: string[] = [];
  try {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const q = decodeURIComponent(String(input)).match(/query=([^&]*)/)![1];
      queries.push(q);
      // GDELT's own reply to a short phrase
      if ([...q.matchAll(/"([^"]*)"/g)].some(([, p]) => p.length < GDELT_MIN_PHRASE)) {
        return new Response("The specified phrase is too short.\n", { status: 200 });
      }
      const article = { url: "https://example.com/a", title: "Visa beats estimates", seendate: "20261021T120000Z", domain: "example.com", language: "English" };
      return new Response(JSON.stringify({ articles: [article] }), { status: 200 });
    }) as typeof fetch;
    const before = await fetchNews(commonName(titleOf("V")[2]));
    const now = await fetchNews(gdeltEverydayName(titleOf("V")[2]));
    check("Visa's old query is refused; its new one is answered",
      before.outcome === "error" && now.outcome === "ok" && now.events.length === 1 && queries.at(-1)?.startsWith('"VISA Inc"') === true,
      `${before.outcome} → ${now.outcome} · ${queries.join(" | ")}`);
    queries.length = 0;
    const ibm = await fetchNews("INTERNATIONAL BUSINESS MACHINES", newsNamesFor(51143));
    check("IBM's news name costs no refused request: one query, answered", ibm.outcome === "ok" && queries.length === 1, queries.join(" | "));
  } finally {
    globalThis.fetch = realFetch;
  }

  console.log("\nThe Justice Department feed asks for IBM by name");
  const ibmNames = companyNames(titleOf("IBM")[2], newsNamesFor(51143));
  check("IBM's releases are asked for under \"IBM\" as well as its long name", dojQueryNames(ibmNames).includes("IBM"), JSON.stringify(dojQueryNames(ibmNames)));
  // the four releases with IBM in the title, read from justice.gov on 2026-10-22
  const releases = [
    "IBM Pays $17 Million to Resolve Allegations of Discrimination Through Illegal DEI Practices",
    "IBM Agrees to Pay $14.8 Million to Settle False Claims Act Allegations Related to Maryland Health Benefit Exchange",
    "IBM Agrees To Pay $14.8 Million To Settle Federal False Claims Act Allegations Relating To Maryland Health Benefit Exchange",
    "Justice Department Settles Citizenship Status Discrimination Claim Against IBM",
  ];
  check("  …and each of the four names IBM as a party (a claim against it counts, as claims did)",
    releases.every((t) => releaseNamesParty(t, ibmNames)), releases.filter((t) => !releaseNamesParty(t, ibmNames)).join(" | "));

  console.log("\nWired");
  check("company ingest asks GDELT for the everyday name it can take",
    /const newsQuery = gdeltEverydayName\(company\.name\);\s*await run\("gdelt", gdeltNames\(newsQuery, alsoKnownAs\)\.join\(" \| "\), \(\) => fetchNews\(newsQuery, alsoKnownAs\)/.test(read("scripts/ingest.ts")));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  process.exit(fail ? 1 : 0);
}

main();
