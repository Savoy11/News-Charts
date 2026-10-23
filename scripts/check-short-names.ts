import { readFileSync } from "node:fs";
import { join } from "node:path";
import aliasFile from "../data/company-aliases.json";
import tickerIndex from "../data/edgar-tickers.json";
import { buildCompanyAliases, type WikidataCompany } from "../lib/companyAliases";
import { commonName, companyTickers, newsNamesFor, resolveTickerLocally, titleMatch, TICKER_INDEX_COMPANIES } from "../lib/sec";
import { GDELT_MIN_PHRASE, fetchNews, gdeltEverydayName, gdeltNames, gdeltQuery, headlineNames, unquotable } from "../lib/news";
import { companyNames, frSearchTerm } from "../lib/frCompany";
import { dojQueryNames, fetchJusticeReleases, releaseNamesParty } from "../lib/doj";
import { aliasesFor, mentions } from "../lib/enrich/relevance";

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
 * Batch 34, the owner's two calls (2026-10-22): a company's own initials claim its news even where
 * Wikidata files them as an alias ("AIG", "UPS"), and a short name that is no English word and
 * stands for nothing else first goes to GDELT unquoted ("IBM", "ETSY"), its articles kept only when
 * the headline names the company.
 *
 * The Wikidata items are real, as `npm run sync:aliases` read them; the GDELT replies are mocked
 * with the refusal GDELT really sends and headlines it really returned.
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
      // initials that news uses for the purchasing managers' index
      item({ qid: "Q1852556", targetCik: 1413329, labels: ["Philip Morris International"], aliases: ["Philip Morris", "PMI"], sitelinks: 40 }),
    ],
    view
  );
  const why = (name: string) => built.dropped.find((d) => d.name === name)?.reason;
  check("IBM's own label is kept, and news may use it", JSON.stringify(built.aliases["IBM"]) === '[51143,"Q37156","name",1,"IBM"]', JSON.stringify(built.aliases["IBM"]));
  check("  …and AMD's", built.aliases["AMD"]?.[0] === 2488 && built.aliases["AMD"]?.[3] === 1, JSON.stringify(built.aliases["AMD"]));
  check("initials Wikidata files as an alias claim the company's news too (the owner's call, batch 34): AIG, UPS, BMS",
    ["AIG", "UPS", "BMS"].every((k) => built.aliases[k]?.[2] === "alias" && built.aliases[k]?.[3] === 1) &&
      built.aliases["AIG"]?.[0] === 5272 && built.aliases["UPS"]?.[0] === 1090727 && built.aliases["BMS"]?.[0] === 14272);
  check("  …but not initials news uses for something else: Philip Morris's \"PMI\" finds it in search only",
    built.aliases["PMI"]?.[0] === 1413329 && built.aliases["PMI"]?.[3] === 0, JSON.stringify(built.aliases["PMI"]));
  check("letters that are not the company's initials stay out: Moody's \"MCO\", Constellation's \"STZ\"",
    why("MCO") === "too short" && why("STZ") === "too short", `${why("MCO")} ${why("STZ")}`);
  check("  …and so does a word: \"Sun\"", why("Sun") === "too short" && !built.aliases["SUN"]);
  check("  …and a little-known company's initials: \"CHS\"", why("CHS") === "little known", why("CHS"));

  console.log("\nThe committed index, rebuilt from Wikidata with the rule");
  const aliases = aliasFile.aliases as unknown as Record<string, [number, string, string, number, string]>;
  check("IBM and AMD are news names now", newsNamesFor(51143).includes("IBM") && newsNamesFor(2488).includes("AMD"),
    `${newsNamesFor(51143)} | ${newsNamesFor(2488)}`);
  check("  …and since batch 34 AIG and UPS too, but not PMI",
    newsNamesFor(5272).includes("AIG") && newsNamesFor(1090727).includes("UPS") && aliases["PMI"]?.[3] === 0 && !newsNamesFor(1413329).includes("PMI"),
    `${newsNamesFor(5272)} | ${newsNamesFor(1090727)} | ${newsNamesFor(1413329)}`);
  check("search finds Bristol Myers Squibb by \"BMS\" and Shell by \"RDS\"", resolveTickerLocally("BMS") === "BMY" && resolveTickerLocally("RDS") === "SHEL",
    `${resolveTickerLocally("BMS")} ${resolveTickerLocally("RDS")}`);
  check("  …while another company's ticker still wins: \"RBC\" is RBC Bearings, \"CNR\" Core Natural Resources",
    resolveTickerLocally("RBC") === "RBC" && resolveTickerLocally("CNR") === "CNR" && aliases["RBC"]?.[0] === 1000275,
    `${resolveTickerLocally("RBC")} ${resolveTickerLocally("CNR")}`);

  console.log("\nGDELT is never asked a phrase it refuses, and a bare name only for what it means");
  const yes = ["IBM", "ETSY", "ROKU", "CSX", "Okta"];
  // AIG, AMD, ADM, BMS, RBC and Uber measured: GDELT's newest week brought Nigerian police officers,
  // Judi Dench's eyesight, an Australian defence magazine, an office in Pulwama, RBC Bearings and
  // one Uber headline in a hundred
  const no = ["VISA", "GAP", "UPS", "PAN", "Snap", "RTX", "CGI", "AIG", "AMD", "ADM", "BMS", "RBC", "Uber", "TIM", "DIDI", "NOV", "HP", "AT&T", "3M"];
  check("a short name goes bare only when it is no English word, stands for nothing else first, and has three or four letters",
    yes.every(unquotable) && no.every((n) => !unquotable(n)), `${yes.filter((n) => !unquotable(n))} | ${no.filter(unquotable)}`);
  check(`an other name under ${GDELT_MIN_PHRASE} characters joins the query bare when it may, and stays out when it may not`,
    gdeltQuery("INTERNATIONAL BUSINESS MACHINES", ["IBM"]) === '("INTERNATIONAL BUSINESS MACHINES" OR ibm) sourcelang:english' &&
      JSON.stringify(gdeltNames("RTX Corp", ["RTX", "Raytheon Technologies"])) === '["RTX Corp","raytheon technologies"]' &&
      JSON.stringify(gdeltNames("UNITED PARCEL SERVICE", ["UPS"])) === '["UNITED PARCEL SERVICE"]' &&
      JSON.stringify(gdeltNames("AMERICAN INTERNATIONAL GROUP", newsNamesFor(5272))) === '["AMERICAN INTERNATIONAL GROUP"]' &&
      JSON.stringify(gdeltNames("ADVANCED MICRO DEVICES", newsNamesFor(2488))) === '["ADVANCED MICRO DEVICES"]' &&
      JSON.stringify(gdeltNames(gdeltEverydayName(titleOf("ADM")[2]), newsNamesFor(7084))) === '["Archer-Daniels-Midland"]',
    `${gdeltQuery("INTERNATIONAL BUSINESS MACHINES", ["IBM"])} | ${gdeltNames("AMERICAN INTERNATIONAL GROUP", newsNamesFor(5272))} | ${gdeltNames("ADVANCED MICRO DEVICES", newsNamesFor(2488))}`);
  const asked: [string, string][] = [
    ["VISA INC.", "VISA Inc"],
    ["CSX CORP", "CSX"],
    ["NIKE, Inc.", "NIKE"],
    ["3M CO", "3M Co"],
    ["AT&T INC.", "AT&T Inc"],
    ["NEWS CORP", "NEWS Corp"],
    ["HSBC HOLDINGS PLC", "HSBC"],
    ["SAP SE", "SAP SE"],
    ["Vale S.A.", "Vale SA"],
    ["KKR & Co. Inc.", "KKR"],
    ["RTX Corp", "RTX Corp"],
    ["TIM S.A.", "TIM SA"],
    ["FORD MOTOR CO", "FORD MOTOR"],
  ];
  const wrong = asked.filter(([title, want]) => gdeltEverydayName(title) !== want);
  check("a short everyday name is asked bare when it may be, else with its title's legal form; a long one as it is",
    wrong.length === 0 && gdeltQuery(gdeltEverydayName("ETSY INC")) === "ETSY sourcelang:english" &&
      gdeltQuery(gdeltEverydayName("VISA INC.")) === '"VISA Inc" sourcelang:english',
    wrong.map(([t]) => `${t} → ${gdeltEverydayName(t)}`).join("; "));
  const seen = new Set<number>();
  let short = 0;
  let asBare = 0;
  let withForm = 0;
  (tickerIndex.companies as [number, string, string][]).forEach(([cik, , title], rank) => {
    if (seen.has(cik) || rank > 1500) return;
    seen.add(cik);
    if (commonName(title).length >= GDELT_MIN_PHRASE) return;
    short++;
    const q = gdeltEverydayName(title);
    if (q.length >= GDELT_MIN_PHRASE) withForm++;
    else if (unquotable(q)) asBare++;
  });
  check("of the 1,500 largest companies, the 107 with a short everyday name all get a query GDELT takes: 59 bare, 48 with a legal form",
    short === 107 && asBare === 59 && withForm === 48, `${asBare} bare, ${withForm} with a legal form, of ${short}`);
  // headlines GDELT returned for a bare "IBM", 2026-10-22: nine of thirty named it
  check("with a bare name, an article stays only when its headline names the company",
    headlineNames("IBM beats Q3 earnings on software rebound , guides full - year revenue growth", ["INTERNATIONAL BUSINESS MACHINES", "ibm"]) &&
      !headlineNames("Aionos Appoints Hemant Lamba as Chief Business Officer to Accelerate Global Growth", ["INTERNATIONAL BUSINESS MACHINES", "ibm"]));
  check("  …and the company's initials name a headline only in capitals, as in scoring: \"ADM\" is not \"Adm. Paparo\"",
    headlineNames("ADM cuts profit outlook as crush margins shrink", ["Archer-Daniels-Midland", "adm"], ["ADM"]) &&
      !headlineNames("Adm. Paparo warns of China's buildup in the Pacific", ["Archer-Daniels-Midland", "adm"], ["ADM"]) &&
      headlineNames("Archer-Daniels-Midland to sell its stake", ["Archer-Daniels-Midland", "adm"], ["ADM"]));

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
      const articles = [
        { url: "https://example.com/a", title: "Visa beats estimates", seendate: "20261021T120000Z", domain: "example.com", language: "English" },
        { url: "https://example.com/b", title: "IBM Stock Surges 7 % On Earnings News", seendate: "20261022T120000Z", domain: "example.com", language: "English" },
        { url: "https://example.com/c", title: "Aionos Appoints Hemant Lamba as Chief Business Officer to Accelerate Global Growth", seendate: "20261022T120000Z", domain: "example.com", language: "English" },
      ];
      return new Response(JSON.stringify({ articles }), { status: 200 });
    }) as typeof fetch;
    const before = await fetchNews(commonName(titleOf("V")[2]));
    const now = await fetchNews(gdeltEverydayName(titleOf("V")[2]));
    check("Visa's old query is refused; its new one is answered, every article kept (a quoted query is filtered as before)",
      before.outcome === "error" && now.outcome === "ok" && now.events.length === 3 && queries.at(-1)?.startsWith('"VISA Inc"') === true,
      `${before.outcome} → ${now.outcome} ${now.events.length} · ${queries.join(" | ")}`);
    queries.length = 0;
    const ibm = await fetchNews("INTERNATIONAL BUSINESS MACHINES", newsNamesFor(51143));
    check("IBM's bare name costs no refused request, and only the article naming IBM in its headline is kept",
      ibm.outcome === "ok" && queries.length === 1 && ibm.events.length === 1 && ibm.events[0].title.startsWith("IBM Stock Surges"),
      `${queries.join(" | ")} · ${ibm.events.map((e) => e.title).join(" | ")}`);
  } finally {
    globalThis.fetch = realFetch;
  }

  console.log("\nHeadline scoring and the federal feeds");
  const panw = aliasesFor({ kind: "company", displayName: "Palo Alto Networks Inc", ticker: "PANW" }, ["Palo Alto Networks", "PAN"]);
  check("a company's initials name a headline only in capitals: \"PAN shares jump\", never \"Pan-European stocks slip\"",
    mentions("PAN shares jump on firewall demand", panw) === "named" && mentions("Pan-European stocks slip", panw) === "none" &&
      mentions("Peter Pan returns to Broadway", panw) === "none");
  check("the Federal Register search leaves out an other name under five characters, never the everyday name",
    frSearchTerm("UNITED PARCEL SERVICE INC", ["UPS"]) === '"UNITED PARCEL SERVICE"' && frSearchTerm("CSX CORP") === '"CSX"',
    `${frSearchTerm("UNITED PARCEL SERVICE INC", ["UPS"])} | ${frSearchTerm("CSX CORP")}`);
  const pages: string[] = [];
  try {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const u = new URL(String(input));
      const name = u.searchParams.get("parameters[title]") ?? "";
      pages.push(`${name}:${u.searchParams.get("page")}`);
      // "AIG" is inside 1,600 titles ("Craig"), "UPS" inside 273
      const count = name === "AIG" ? 1600 : name === "UPS" ? 273 : 3;
      const full = name === "AIG" || (name === "UPS" && u.searchParams.get("page") !== "5");
      const rows = full ? Array.from({ length: 50 }, (_, i) => ({ title: `Craig Smith Sentenced ${i}`, date: "1700000000", url: `https://www.justice.gov/x/${name}${i}`, uuid: `${name}${u.searchParams.get("page")}${i}` })) : [];
      return new Response(JSON.stringify({ metadata: { resultset: { count: String(count) } }, results: rows }), { status: 200 });
    }) as typeof fetch;
    await fetchJusticeReleases("AMERICAN INTERNATIONAL GROUP, INC.", ["AIG"]);
    await fetchJusticeReleases("UNITED PARCEL SERVICE INC", ["UPS"]);
  } finally {
    globalThis.fetch = realFetch;
  }
  check("a short name buried in other words is read one page, not ten: \"AIG\" in 1,600 titles; \"UPS\" in 273 is read through",
    pages.filter((p) => p.startsWith("AIG:")).length === 1 && pages.filter((p) => p.startsWith("UPS:")).length === 6, pages.join(" "));
  // three of UPS's releases the "UPS" search found, read from justice.gov on 2026-10-22
  const upsNames = companyNames(titleOf("UPS")[2], newsNamesFor(1090727));
  const ups = [
    "UPS Agrees To Forfeit $40 Million In Payments From Illicit Online Pharmacies For Shipping Services",
    "Justice Department Secures Agreement with UPS to Resolve Immigration-Related Employment Discrimination Claims",
    "Justice Department Secures Settlement with UPS to Resolve Immigration-Related Discrimination Claims",
  ];
  check("  …and UPS's releases name it as a party under \"UPS\"", ups.every((t) => releaseNamesParty(t, upsNames)), ups.filter((t) => !releaseNamesParty(t, upsNames)).join(" | "));

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
    /const newsQuery = gdeltEverydayName\(company\.name, possessive\);\s*await run\("gdelt", gdeltNames\(newsQuery, alsoKnownAs\)\.join\(" \| "\), \(\) => fetchNews\(newsQuery, alsoKnownAs\)/.test(read("scripts/ingest.ts")));
  check("  …and its headline filter is handed the company's initials, so they count only in capitals",
    /const initials = alsoKnownAs\.filter\(\(n\) => INITIALISM\.test\(n\)\);[\s\S]*headlineNames\(a\.title \?\? "", names, initials\)/.test(read("lib/news.ts")));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  process.exit(fail ? 1 : 0);
}

main();
