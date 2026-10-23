import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GDELT_BY_RELEVANCE, GDELT_RELEVANCE_SPAN, fetchNews, gdeltNewsPlan, gdeltQuery } from "../lib/news";
import { possessiveNameFor } from "../lib/sec";

/**
 * Names asked for on GDELT by relevance (batch 37).
 *
 *   npm run check:gdelt-relevance
 *
 * GDELT is asked for the newest hundred pages naming a company. For a name in every other article
 * those are passing mentions, and a headline naming the company never makes the hundred. Measured
 * on 2026-10-23, three days of GDELT each:
 *  - "mcdonald": newest first, none of the hundred headlines named McDonald's; by relevance
 *    ("sort=hybridrel"), 37 did. "mcdonalds", "mcdonald's" and "mcdonald corp" found 9, 9 and 4.
 *  - "uber": newest first, 1 of the hundred; by relevance, 26.
 * The headlines below are ones GDELT returned for "mcdonald" by relevance; its reply is mocked.
 */

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

// as GDELT returned them for "mcdonald" by relevance, 2026-10-20 to 22
const COMPANY = [
  "McDonald Is Crowned a Dividend King . Is Owning 65 Shares Worth It for $500 in Yearly Dividend Income ?",
  "McDonald hosts first free Chef Table in Brooklyn with Top Chef winner",
  "McDonald vs . Chick - fil - A : Dietitians Reveal Which Is Better for Diabetes",
  "Rose May Alaba brings three spicy sauces to McDonald",
  "Not lovin  it : Phillip Island rejects McDonald after 1 , 500 objections",
];
const PEOPLE = [
  "Chiefs take important step toward getting Cooper McDonald back on the field",
  "Rep . McDonald Rivet rallies supporters in Flint",
];

async function main(): Promise<void> {
  console.log("\nWho is asked by relevance");
  const mcd = gdeltNewsPlan("MCDONALDS CORP", possessiveNameFor(63908));
  check("McDonald's, as GDELT holds it, by relevance", mcd.query === "MCDONALD" && mcd.byRelevance, JSON.stringify(mcd));
  const uber = gdeltNewsPlan("Uber Technologies, Inc", "", ["Uber"]);
  check("Uber Technologies, whose other name \"Uber\" only works by relevance, takes the whole query that way",
    uber.query === "Uber Technologies" && uber.byRelevance &&
      gdeltQuery(uber.query, ["Uber"], true) === '("Uber Technologies" OR uber) sourcelang:english',
    gdeltQuery(uber.query, ["Uber"], true));
  check("  …and newest first, \"uber\" stays out as batch 36 measured", gdeltQuery("Uber Technologies", ["Uber"]) === '"Uber Technologies" sourcelang:english');
  const others = [
    gdeltNewsPlan("MOODYS CORP /DE/", possessiveNameFor(1059556)),
    gdeltNewsPlan("DOMINOS PIZZA INC", possessiveNameFor(1286681)),
    gdeltNewsPlan("FORD MOTOR CO"),
    gdeltNewsPlan("Wendy's Co"),
  ];
  check("an unmeasured stem (\"Moody\", \"Wendy\") and every other company are asked newest first, as before",
    others.every((p) => !p.byRelevance) && others.map((p) => p.query).join("|") === "MOODYS|DOMINO PIZZA|FORD MOTOR|Wendy's",
    others.map((p) => JSON.stringify(p)).join(" "));
  check("each name asked by relevance carries what it was measured to bring",
    Object.values(GDELT_BY_RELEVANCE).every((why) => /\d+ of the hundred headlines/.test(why)));

  console.log("\nThe request, and what it keeps");
  const realFetch = globalThis.fetch;
  const urls: string[] = [];
  const titles = [...COMPANY, ...PEOPLE, "Fast food prices climb again as chains test value menus"];
  try {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      const articles = titles.map((title, i) => ({ url: `https://example.com/${i}`, title, seendate: "20261021T120000Z", domain: "example.com", language: "English" }));
      return new Response(JSON.stringify({ articles }), { status: 200 });
    }) as typeof fetch;
    const r = await fetchNews(mcd.query, [], { byRelevance: true });
    check(`by relevance, GDELT is asked for the most relevant pages of the last ${GDELT_RELEVANCE_SPAN}, not the newest since 2017`,
      urls[0].includes(`sort=hybridrel&timespan=${GDELT_RELEVANCE_SPAN}`) && !urls[0].includes("startdatetime"), urls[0].slice(-60));
    const kept = r.events.map((e) => e.title);
    check("the headlines naming the company are kept",
      COMPANY.every((t) => kept.includes(t)), kept.filter((t) => !COMPANY.includes(t)).join(" | "));
    check("  …and a person called McDonald is not, nor a page that never names it",
      kept.length === COMPANY.length, kept.filter((t) => !COMPANY.includes(t)).join(" | "));
    urls.length = 0;
    await fetchNews("FORD MOTOR");
    check("newest first is unchanged for everyone else", urls[0].includes("sort=datedesc&startdatetime=20170101000000"));
  } finally {
    globalThis.fetch = realFetch;
  }

  console.log("\nWired");
  const ingest = read("scripts/ingest.ts");
  check("company ingest asks as the plan says",
    /const \{ query: newsQuery, byRelevance \} = gdeltNewsPlan\(company\.name, possessive, alsoKnownAs\);/.test(ingest) &&
      /fetchNews\(newsQuery, alsoKnownAs, \{ byRelevance \}\)/.test(ingest));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  process.exit(fail ? 1 : 0);
}

main();
