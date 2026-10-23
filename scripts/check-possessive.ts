import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildCompanyAliases, possessiveWords, type WikidataCompany } from "../lib/companyAliases";
import { commonName, companyTickers, newsNamesFor, possessiveNameFor, titleMatch, TICKER_INDEX_COMPANIES } from "../lib/sec";
import { fetchNews, gdeltEverydayName, gdeltForm, gdeltHeadlineNames, gdeltNames } from "../lib/news";
import { aliasesFor, mentions } from "../lib/enrich/relevance";

/**
 * Possessive company names on GDELT (batch 36).
 *
 *   npm run check:possessive
 *
 * GDELT drops a possessive "'s" whole. None of the 211 GDELT headlines stored for JPMorgan keeps an
 * apostrophe ("Here What JPMorgan , Citi , BofA , Others Are Doing"), and it reads a quoted
 * "domino's pizza" as "dominos pizza". Measured on 2026-10-23, three days of GDELT each:
 *  - "dominos pizza", the form Domino's was asked for: 2 articles. "domino pizza": 18, 7 of them
 *    naming Domino's in the headline.
 *  - "mcdonalds" and "mcdonald's": 9 articles each, none naming McDonald's in the headline.
 *    "mcdonald" alone: the hundred newest pages, none naming it in the headline either — passing
 *    mentions and people called McDonald. "mcdonald corp": 4. So a possessive that comes to one
 *    word is asked as before; only its headlines are read in GDELT's form.
 *  - "dick sporting goods": 17 articles ("DICK Sporting Goods Store is Set to Open New Store").
 * The SEC's title often drops the apostrophe as well ("MCDONALDS CORP"), and Wikidata's spelling
 * of the company's own name, which says where it was, was dropped as redundant for search.
 *
 * The Wikidata items are real, as `npm run sync:aliases` read them; the GDELT reply is mocked.
 */

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const titleOf = (ticker: string) => TICKER_INDEX_COMPANIES.find(([cik]) => companyTickers(cik).includes(ticker))!;

// as `npm run sync:aliases` read them on 2026-10-22
const ITEMS: WikidataCompany[] = [
  { qid: "Q38076", targetCik: 63908, kind: "own", labels: ["McDonald's"], officialNames: ["McDonald's Corporation"], aliases: ["McD", "McDonald's Corporation", "McDonald’s", "McDonalds", "Mc Donalds", "Mcdonalds", "Макдоналдс", "McDo", "McDonald", "Macca's", "Maccas", "McDonald's Restaurant", "Mickey D's"], sitelinks: 137 },
  { qid: "Q1373493", targetCik: 60667, kind: "own", labels: ["Lowe's"], officialNames: [], aliases: ["Lowes", "Lowe's Companies, Inc.", "Lowe's Home Improvement"], sitelinks: 25 },
  { qid: "Q839466", targetCik: 1286681, kind: "own", labels: ["Domino's Pizza"], officialNames: [], aliases: ["Domino's", "Domino's Pizza, Inc."], sitelinks: 57 },
  { qid: "Q44294", targetCik: 37996, kind: "own", labels: ["Ford Motor Company"], officialNames: [], aliases: ["Ford", "FoMoCo", "Ford Motor Corporation", "Ford Motors", "Ford Motor", "Ford Motor Co."], sitelinks: 114 },
];

async function main(): Promise<void> {
  console.log("\nWhat GDELT holds");
  check("a possessive loses its \"'s\", straight or curly: \"Domino Pizza\", \"McDonald\"",
    gdeltForm("Domino's Pizza") === "Domino Pizza" && gdeltForm("McDonald’s") === "McDonald" && gdeltForm("Ford Motor") === "Ford Motor");
  check("the words carrying one are found and keyed: \"Dr. Reddy's Laboratories\" → REDDYS",
    JSON.stringify(possessiveWords("Dr. Reddy's Laboratories")) === '["REDDYS"]' && possessiveWords("Ford Motor Company").length === 0);

  console.log("\nThe name index keeps the company's own spelling");
  const built = buildCompanyAliases(ITEMS, { companies: TICKER_INDEX_COMPANIES, titleMatch, commonName, tickersOf: companyTickers });
  check("the builder records it where the SEC's title dropped the apostrophe: McDonald's, Lowe's, Domino's Pizza — not Ford",
    built.possessive["63908"] === "McDonald's" && built.possessive["60667"] === "Lowe's" && built.possessive["1286681"] === "Domino's Pizza" &&
      built.possessive["37996"] === undefined,
    JSON.stringify(built.possessive));
  check("  …though the name itself is still redundant for search, which the title already finds",
    built.aliases["MCDONALDS"] === undefined && built.dropped.some((d) => d.name === "MCDONALDS" && d.reason === "redundant"));
  check("the committed index carries them, read by CIK",
    possessiveNameFor(63908) === "McDonald's" && possessiveNameFor("0000060667") === "Lowe's" && possessiveNameFor(1059556) === "Moody's Corporation" &&
      possessiveNameFor(37996) === "");

  console.log("\nWhat GDELT is asked for");
  const asked: [string, string, string][] = [
    ["DOMINOS PIZZA INC", "Domino's Pizza", "DOMINO PIZZA"],
    ["CASEYS GENERAL STORES INC", "Casey's General Stores", "CASEY GENERAL STORES"],
    ["LOWES COMPANIES INC", "Lowe's", "LOWE COMPANIES"],
    ["DICK'S SPORTING GOODS, INC.", "", "DICK SPORTING GOODS"],
    ["Victoria's Secret & Co.", "", "VICTORIA SECRET"],
    ["MCDONALDS CORP", "McDonald's", "MCDONALDS"],
    ["MOODYS CORP /DE/", "Moody's Corporation", "MOODYS"],
    ["Macy's, Inc.", "", "Macy's"],
    ["FORD MOTOR CO", "", "FORD MOTOR"],
    ["VISA INC.", "", "VISA Inc"],
    ["ETSY INC", "", "ETSY"],
  ];
  const wrong = asked.filter(([title, p, want]) => gdeltEverydayName(title, p) !== want);
  check("a possessive of more than one word in the form GDELT holds; one that comes to one word, and any other name, as before",
    wrong.length === 0, wrong.map(([t, p]) => `${t} → ${gdeltEverydayName(t, p)}`).join("; "));
  check("  …where before, Domino's was asked for \"DOMINOS PIZZA\" and McDonald's for \"MCDONALDS\"",
    gdeltEverydayName("DOMINOS PIZZA INC") === "DOMINOS PIZZA" && gdeltEverydayName("MCDONALDS CORP") === "MCDONALDS");
  check("an other name that is a possessive goes in GDELT's form, and only when it is more than one word",
    JSON.stringify(gdeltNames("PAPA JOHN INTERNATIONAL", ["Papa John's"])) === '["PAPA JOHN INTERNATIONAL","papa john"]' &&
      JSON.stringify(gdeltNames("LOWE COMPANIES", ["Lowe's"])) === '["LOWE COMPANIES"]',
    `${gdeltNames("PAPA JOHN INTERNATIONAL", ["Papa John's"])} | ${gdeltNames("LOWE COMPANIES", ["Lowe's"])}`);

  console.log("\nHeadlines GDELT returned, scored");
  const mcd = { kind: "company" as const, displayName: "MCDONALDS CORP", ticker: "MCD" };
  const before = aliasesFor(mcd, [commonName(mcd.displayName)]);
  const mcdAliases = aliasesFor(mcd, [commonName(mcd.displayName), ...gdeltHeadlineNames(mcd.displayName, possessiveNameFor(63908))]);
  check("a McDonald's headline GDELT writes \"McDonald\" names the company now, and did not before",
    mentions("McDonald to raise menu prices again", mcdAliases) === "named" && mentions("McDonald to raise menu prices again", before) !== "named",
    `${mentions("McDonald to raise menu prices again", before)} → ${mentions("McDonald to raise menu prices again", mcdAliases)}`);
  check("  …as does the feed that keeps the apostrophe, while a person called McDonald does not",
    mentions("McDonald's tests a new chicken sandwich", mcdAliases) === "named" &&
      mentions("Travis McDonald signs with the Packers", mcdAliases) !== "named",
    JSON.stringify(gdeltHeadlineNames(mcd.displayName, possessiveNameFor(63908))));
  check("a company with no possessive gets no extra headline names", gdeltHeadlineNames("FORD MOTOR CO").length === 0);

  console.log("\nThe request");
  const realFetch = globalThis.fetch;
  const queries: string[] = [];
  try {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      queries.push(decodeURIComponent(String(input)).match(/query=([^&]*)/)![1]);
      const articles = [{ url: "https://example.com/a", title: "Domino Pizza Enterprises Shares Rise 4 . 2 %", seendate: "20261020T120000Z", domain: "example.com", language: "English" }];
      return new Response(JSON.stringify({ articles }), { status: 200 });
    }) as typeof fetch;
    const dpz = await fetchNews(gdeltEverydayName(titleOf("DPZ")[1], possessiveNameFor(titleOf("DPZ")[0])), newsNamesFor(titleOf("DPZ")[0]));
    check("Domino's is asked for \"DOMINO PIZZA\", in one request, and its articles kept",
      queries.length === 1 && queries[0] === '"DOMINO PIZZA" sourcelang:english' && dpz.events.length === 1, queries.join(" | "));
  } finally {
    globalThis.fetch = realFetch;
  }

  console.log("\nWired");
  const ingest = read("scripts/ingest.ts");
  check("company ingest reads the possessive and asks and scores with it",
    /const possessive = possessiveNameFor\(company\.cik\);/.test(ingest) &&
      /const newsQuery = gdeltEverydayName\(company\.name, possessive\);/.test(ingest) &&
      /\.\.\.gdeltHeadlineNames\(company\.name, possessive\)/.test(ingest));
  check("  …and so does re-scoring", /gdeltHeadlineNames\(subject\.displayName, possessiveNameFor\(cik\)\)/.test(read("scripts/score.ts")));
  check("the sync writes the possessives into the index", /aliases,\s*possessive,\s*\};/.test(read("scripts/sync-aliases.ts")));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  process.exit(fail ? 1 : 0);
}

main();
