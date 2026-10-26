import { readFileSync } from "node:fs";
import aliasFile from "../data/company-aliases.json";
import tickerIndex from "../data/edgar-tickers.json";
import {
  BRAND_NAMES,
  KNOWN_NOT_NEWS,
  KNOWN_WRONG,
  ONE_WORD_MIN_SITELINKS,
  buildCompanyAliases,
  nameKey,
  type AliasIndexFile,
  type WikidataCompany,
} from "../lib/companyAliases";
import { commonName, companyTickers, newsNamesFor, resolveTickerLocally, titleMatch, TICKER_INDEX_COMPANIES } from "../lib/sec";
import { fetchNews, gdeltNames, gdeltQuery } from "../lib/news";
import { aliasesFor, mentions } from "../lib/enrich/relevance";

/**
 * Other names for listed companies, from Wikidata (NC-004).
 *
 *   npm run check:aliases
 *
 * Three parts. The rules in `buildCompanyAliases`, against items shaped like Wikidata's and the
 * real EDGAR index — every case is a name the 2026-10-21 sync actually met. The committed
 * `data/company-aliases.json`, which must agree with the index it sits beside. And the resolver,
 * which must find a company by another name without ever letting one beat an exact title.
 * Offline: no request is made.
 */

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

const view = { companies: TICKER_INDEX_COMPANIES, titleMatch, commonName, tickersOf: companyTickers };
const tickerRows = (tickerIndex as unknown as { companies: [number, string, string][] }).companies;
const item = (qid: string, targetCik: number, kind: WikidataCompany["kind"], o: Partial<WikidataCompany>): WikidataCompany => ({
  qid,
  targetCik,
  kind,
  labels: [],
  officialNames: [],
  aliases: [],
  sitelinks: 50,
  ...o,
});

async function main(): Promise<void> {
  console.log("\nThe rules, against names Wikidata really holds");
  const built = buildCompanyAliases(
    [
      // Meta's item has no English alias; "Facebook, Inc." is a former official name
      item("Q380", 1326801, "own", { labels: ["Meta Platforms"], officialNames: ["Meta Platforms, Inc.", "Facebook, Inc."], aliases: ["meta.com"], sitelinks: 87 }),
      // Google Inc., an SEC registrant of its own (CIK 1288776), now under Alphabet
      item("Q95", 1652044, "former", { labels: ["Google"], aliases: ["Big G"], sitelinks: 212, tickers: ["GOOG", "GOOGL"] }),
      item("Q212405", 80424, "own", {
        labels: ["Procter & Gamble"],
        aliases: ["P&G", "Rejoice", "Proctor and Gamble", "The Procter & Gamble Company (Cincinnati, OH)"],
        sitelinks: 100,
      }),
      item("Q37156", 51143, "own", { labels: ["IBM"], aliases: ["18M", "ibm.com", "IBM Corp."], sitelinks: 150 }),
      item("Q14647", 1341439, "former", { labels: ["Sun Microsystems"], aliases: ["Sun", "Stanford University Network"], sitelinks: 74, tickers: ["JAVA"] }),
      // Block's former official name; a one-word name that is a word first
      item("Q110778747", 1512673, "own", { labels: ["Block"], officialNames: ["Block, Inc.", "Square, Inc."], sitelinks: 30 }),
      // a coined one-word former name of Strategy Inc.
      item("Q1192211", 1050446, "own", { labels: ["Strategy"], officialNames: ["MicroStrategy Incorporated"], sitelinks: 25 }),
      // the pre-2011 Motorola, Inc., which carries Motorola Solutions' CIK; the phones went to Lenovo
      item("Q259011", 68505, "own", { labels: ["Motorola"], officialNames: ["Galvin Manufacturing Corporation", "Motorola, Inc."], sitelinks: 78 }),
      // an item carrying Snowflake's CIK, labelled with another company's name
      item("Q0000001", 1640147, "own", { labels: ["Castor Maritime"], sitelinks: 5 }),
      // SeaWorld is listed itself; Wikidata still has it under Blackstone
      item("Q828545", 1393818, "former", { labels: ["United Parks & Resorts"], aliases: ["SeaWorld Parks & Entertainment"], sitelinks: 6 }),
      // Trane's former official name is today's Ingersoll Rand Inc.
      item("Q1068553", 1466258, "own", { labels: ["Trane Technologies"], officialNames: ["Ingersoll-Rand"] }),
      // a bank TriCo bought, which Wikidata calls "English"
      item("Q138635611", 356171, "former", { labels: ["English"], sitelinks: 1 }),
      item("Q191715", 732717, "former", { labels: ["WarnerMedia"], sitelinks: 59 }),
      item("Q333718", 200406, "own", { labels: ["Johnson & Johnson"], aliases: ["J&J"], sitelinks: 80 }),
      // "United" already finds UPS, the larger company, by title prefix
      item("Q174769", 100517, "own", { labels: ["United Airlines Holdings"], aliases: ["United"] }),
      // two companies claiming one name
      item("Q0000002", 1050797, "own", { labels: ["Columbia Sportswear"], aliases: ["Columbia Sportswear Group"] }),
      item("Q0000003", 887343, "own", { labels: ["Columbia Banking System"], aliases: ["Columbia Sportswear Group"] }),
      // an accented name (batch 26): it used to be kept as "EST E LAUDER"
      item("Q1260606", 1001250, "own", { labels: ["Estée Lauder Companies", "Estée Lauder"], aliases: ["Estee Lauder"], sitelinks: 28 }),
      // Advent bought Sapiens in 2025; Wikidata still has Formula Systems as its parent
      item("Q7420971", 1045986, "former", { labels: ["Sapiens International Corporation N.V."], sitelinks: 3 }),
      // everyday names that share no whole word with the title: the head of one, a word written apart
      item("Q219508", 831001, "own", { labels: ["Citigroup"], aliases: ["Citi"], sitelinks: 70 }),
      item("Q192314", 19617, "own", { labels: ["JPMorgan Chase"], aliases: ["JP Morgan"], sitelinks: 80 }),
    ],
    view
  );
  const why = (name: string) => built.dropped.find((d) => d.name === name || d.name === nameKey(name))?.reason;
  check("a former official name finds its company, in its everyday form: \"Facebook\" → Meta",
    built.aliases["FACEBOOK"]?.[0] === 1326801 && built.aliases["FACEBOOK INC"]?.[0] === 1326801);
  check("a former registrant's name finds its listed parent: \"Google\" → Alphabet", built.aliases["GOOGLE"]?.[0] === 1652044);
  check("  …while its nickname does not", why("Big G") === "unrelated" && !built.aliases["BIG G"]);
  check("an initialism with an ampersand is kept: \"P&G\"", built.aliases["P&G"]?.[0] === 80424);
  check("  …a shampoo filed as P&G's alias is not", why("Rejoice") === "unrelated", why("Rejoice"));
  check("  …nor a name with a place in brackets", why("The Procter & Gamble Company (Cincinnati, OH)") === "qualified");
  check("web addresses and stray digits are not names", why("ibm.com") === "web address" && why("meta.com") === "web address" && why("18M") === "digits");
  check("a three-letter word is not a company's name: \"Sun\"", why("Sun") === "too short" && built.aliases["SUN MICROSYSTEMS"]?.[0] === 1341439);
  check("an item whose label is not the company's is not trusted (Snowflake's CIK, \"Castor Maritime\")",
    why("Castor Maritime") === "not this company" && !built.aliases["CASTOR MARITIME"]);
  check("a former registrant named like a listed company is that company: SeaWorld's names stay its own",
    why("United Parks & Resorts") === "listed itself" && why("SeaWorld Parks & Entertainment") === "listed itself");
  check("another company's everyday name stays its own: Trane's \"Ingersoll-Rand\"",
    why("Ingersoll-Rand") === "another company's name" && !built.aliases["INGERSOLL RAND"], why("Ingersoll-Rand"));
  check(`a one-word name needs a well-known company (${ONE_WORD_MIN_SITELINKS}+ Wikipedias): not "English"`, why("English") === "little known");
  check("a statement known to be wrong is not read: WarnerMedia left AT&T in 2022", why("WarnerMedia") === "known wrong");
  check("a whole name beats a title prefix only for the larger company: \"J&J\" is Johnson & Johnson",
    built.aliases["J&J"]?.[0] === 200406 && built.overrides.some((o) => o.key === "J&J"));
  check("  …while \"United\" keeps UPS, which the prefix finds and which is larger", why("United") === "ambiguous" && !built.aliases["UNITED"]);
  check("a name two companies claim is nobody's", why("Columbia Sportswear Group") === "ambiguous");
  check("a name that already finds its company is not stored twice", why("Meta Platforms") === "redundant");
  check("an accent is folded, not a word break: \"Estée Lauder\" is kept as ESTEE LAUDER",
    nameKey("Estée Lauder") === "ESTEE LAUDER" && built.aliases["ESTEE LAUDER"]?.[0] === 1001250 && !built.aliases["EST E LAUDER"],
    nameKey("Estée Lauder"));
  check("a parent Wikidata still lists after a sale is not read: Sapiens left Formula Systems in 2025",
    why("Sapiens International Corporation N.V.") === "known wrong");
  const prefixHit = (key: string) => built.overrides.find((o) => o.key === key)?.prefixHit;
  check("the head of a word in the title is the company's name: \"Citi\" is Citigroup's, ahead of Citi Trends (batch 56)",
    built.aliases["CITI"]?.[0] === 831001 && prefixHit("CITI") === 1318484, JSON.stringify(built.aliases["CITI"]));
  check("  …and a word written apart is the same word: \"JP Morgan\" is JPMorgan's, which its title already finds",
    why("JP Morgan") === "redundant", why("JP Morgan"));
  check("a brand the company's item does not list is searched for it: \"Chase\" is JPMorgan's, ahead of Chase Packaging",
    built.aliases["CHASE"]?.[0] === 19617 && prefixHit("CHASE") === 1025771, JSON.stringify(built.aliases["CHASE"]));
  check("  …and \"Citibank\" Citigroup's, ahead of an ADR named \"Citibank,N.A.\"",
    built.aliases["CITIBANK"]?.[0] === 831001 && prefixHit("CITIBANK") === 1472033, JSON.stringify(built.aliases["CITIBANK"]));
  check("  …for search only: a brand never searches news, and each says whose it is",
    Object.keys(BRAND_NAMES).every((b) => built.aliases[nameKey(b)]?.[3] === 0) && Object.values(BRAND_NAMES).every((b) => b.why.length > 0));

  console.log("\nNews may use a company's own names, never an acquisition's (batch 25)");
  const news = (key: string) => built.aliases[key]?.[3];
  check("a former name of the same company finds its news: \"Facebook\" for Meta", news("FACEBOOK") === 1 && built.aliases["FACEBOOK"]?.[2] === "name");
  check("  …and so does a predecessor whose ticker carried on: Google's GOOG and GOOGL are Alphabet's", news("GOOGLE") === 1 && built.aliases["GOOGLE"]?.[2] === "former");
  check("  …while an acquired company's does not: Sun's 1990s news is not Oracle's", news("SUN MICROSYSTEMS") === 0);
  check("  …nor a looser alias, however good for search: \"P&G\"", built.aliases["P&G"]?.[2] === "alias" && news("P&G") === 0);
  check("a one-word name that is a word first does not search news: \"Square\"", news("SQUARE") === 0 && news("SQUARE INC") === 1,
    `${news("SQUARE")} / ${news("SQUARE INC")}`);
  check("  …while a coined one does: \"MicroStrategy\"", news("MICROSTRATEGY") === 1);
  check("a brand that went to another company does not: \"Motorola\" has meant a Lenovo phone since 2011",
    news("MOTOROLA INC") === 0 && why("Motorola") === "redundant" && !built.aliases["MOTOROLA"], `${news("MOTOROLA INC")} / ${why("Motorola")}`);

  console.log("\nThe committed index agrees with the EDGAR index beside it");
  const file = aliasFile as unknown as AliasIndexFile;
  const entries = Object.entries(file.aliases);
  const listed = new Set(TICKER_INDEX_COMPANIES.map(([cik]) => cik));
  const everyday = new Map<string, number>();
  for (const [cik, title] of TICKER_INDEX_COMPANIES)
    for (const k of [nameKey(title), nameKey(commonName(title))]) if (!everyday.has(k)) everyday.set(k, cik);
  check("records when it was built, and from what", /^\d{4}-\d{2}-\d{2}$/.test(file.syncedOn) && /Wikidata \(CC0\)/.test(file.source), file.syncedOn);
  check("holds the whole sync, not a sample", entries.length > 1000, `${entries.length} names`);
  check("every name is stored in its matching form", entries.every(([k]) => k === nameKey(k)));
  // batch 28 audit: only the key was kept, so "u s bancorp" went to the Federal Register, which
  // found nothing; "U.S. Bancorp" finds 108 documents
  check("  …beside the name as written, whose matching form it is",
    entries.every(([k, e]) => typeof e[4] === "string" && nameKey(e[4]) === k) && file.aliases["U S BANCORP"]?.[4] === "U.S. Bancorp",
    JSON.stringify(file.aliases["U S BANCORP"]));
  check("a name that is the article and one word does not search news: \"The Hartford\" matches the Hartford area",
    file.aliases["THE HARTFORD"]?.[3] === 0, JSON.stringify(file.aliases["THE HARTFORD"]));
  check("every name finds a company the ticker index lists", entries.every(([, [cik]]) => listed.has(cik)));
  const stolen = entries.filter(([k, [cik]]) => (everyday.get(k) ?? cik) !== cik).map(([k]) => k);
  check("no name is another listed company's title or everyday name", stolen.length === 0, stolen.slice(0, 5).join(", "));
  check("every name points at its Wikidata item", entries.every(([, [, qid]]) => /^Q\d+$/.test(qid)));
  check("no name comes from a statement known to be wrong (WarnerMedia, Sapiens)",
    entries.every(([, [, qid]]) => KNOWN_WRONG[qid] === undefined), entries.filter(([, [, q]]) => KNOWN_WRONG[q] !== undefined).map(([k]) => k).join(", "));
  check("no accented name is split at its accent: ESTEE LAUDER, never EST E LAUDER",
    file.aliases["ESTEE LAUDER"]?.[0] === 1001250 && !file.aliases["EST E LAUDER"] && !file.aliases["ITA UNIBANCO"]);
  // since batch 34 a company's own initials are the one kind of alias that may (the owner's call)
  check("news may use only a company's own names or a predecessor's, never a loose alias but its initials",
    entries.every(([key, [, , kind, news]]) => news === 0 || kind !== "alias" || /^[A-Z]{3}$/.test(key)),
    entries.filter(([key, [, , kind, news]]) => news === 1 && kind === "alias" && !/^[A-Z]{3}$/.test(key)).map(([k]) => k).slice(0, 5).join(", "));
  check("  …so \"Google\" and \"Facebook\" search news, and \"Whole Foods\" and \"Sun Microsystems\" do not",
    file.aliases["GOOGLE"]?.[3] === 1 && file.aliases["FACEBOOK"]?.[3] === 1 &&
      file.aliases["WHOLE FOODS"]?.[3] === 0 && file.aliases["SUN MICROSYSTEMS"]?.[3] === 0);
  check("Citigroup and JPMorgan Chase are found by \"Citi\", \"Citibank\" and \"Chase\", for search only (batch 56)",
    file.aliases["CITI"]?.[0] === 831001 && file.aliases["CITIBANK"]?.[0] === 831001 && file.aliases["CHASE"]?.[0] === 19617 &&
      ["CITI", "CITIBANK", "CHASE"].every((k) => file.aliases[k]?.[3] === 0));
  const notNews = entries.filter(([, [, qid]]) => KNOWN_NOT_NEWS[qid] !== undefined);
  check("  …nor an item whose brand went elsewhere (Motorola, Inc.)", notNews.length > 0 && notNews.every(([, [, , , news]]) => news === 0),
    notNews.map(([k, v]) => `${k}:${v[3]}`).join(", "));

  console.log("\nThe resolver finds a company by another name, never ahead of a title");
  // every request refused: aliases are answered from the committed file
  const asked: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    asked.push(String(input));
    throw new TypeError("fetch failed");
  }) as typeof fetch;
  for (const [query, want] of [
    ["Google", "GOOGL"], // was a Google-themed ETF, DEPW, through the fund-name rung
    ["Facebook", "META"],
    ["Whole Foods", "AMZN"],
    ["Sun Microsystems", "ORCL"],
    ["Red Hat", "IBM"],
    ["P&G", "PG"],
    ["Aetna", "CVS"],
    // typed with their accents (batch 26)
    ["Mondelēz International", "MDLZ"],
    ["Estée Lauder", "EL"],
    ["Itaú Unibanco", "ITUB"],
  ] as const) {
    const got = resolveTickerLocally(query);
    check(`"${query}" finds ${want}`, got === want, got ?? "null");
  }
  for (const [query, want] of [["Apple", "AAPL"], ["Ford", "F"], ["Pure Cycle", "PCYO"], ["Coca-Cola", "KO"], ["Motorola", "MSI"]] as const) {
    check(`"${query}" is still ${want}`, resolveTickerLocally(query) === want, resolveTickerLocally(query) ?? "null");
  }
  check("\"Rejoice\" does not find Procter & Gamble", resolveTickerLocally("Rejoice") !== "PG");
  check("\"Sapiens International\" no longer opens Formula Systems, its parent until 2025",
    resolveTickerLocally("Sapiens International Corporation N.V.") !== "FORTY", resolveTickerLocally("Sapiens International Corporation N.V.") ?? "null");
  {
    // An exact EDGAR title always answers for itself, whatever the alias index holds.
    const cikOfTicker = new Map(tickerRows.map(([cik, ticker]) => [ticker, cik]));
    const firstWithTitle = new Map<string, number>();
    for (const [cik, title] of TICKER_INDEX_COMPANIES) if (!firstWithTitle.has(nameKey(title))) firstWithTitle.set(nameKey(title), cik);
    // a title that is also a ticker ("SUN") goes to that ticker first, as it always has
    const lost = [...firstWithTitle]
      .filter(([key, cik]) => !cikOfTicker.has(key) && cikOfTicker.get(resolveTickerLocally(key) ?? "") !== cik)
      .map(([k]) => k);
    check("every exact EDGAR title still finds its own company", lost.length === 0, `${lost.length} — ${lost.slice(0, 3).join(", ")}`);
  }
  check("  …and none of it asked the network", asked.length === 0, asked.join(", "));

  console.log("\nSearch, end to end, with the database down");
  process.env.DATABASE_URL = "postgresql://nobody:nothing@127.0.0.1:59999/absent";
  const { resolveSearch } = await import("../lib/resolveSearch");
  const same = (r: unknown, want: object) => JSON.stringify(r) === JSON.stringify(want);
  const google = await resolveSearch("Google");
  check("\"Google\" opens Alphabet, not a Google-themed fund", same(google, { kind: "company", ticker: "GOOGL" }), JSON.stringify(google));
  const covid = await resolveSearch("how did covid affect Google");
  check("  …and a question about Google carries its concern there", same(covid, { kind: "company", ticker: "GOOGL", focus: "covid" }), JSON.stringify(covid));
  const fb = await resolveSearch("Facebook stock");
  check("\"Facebook stock\" opens Meta", same(fb, { kind: "company", ticker: "META" }), JSON.stringify(fb));
  // batch 28 audit: "Nestlé" offered a NestYield ETF, "L'Oréal" found nothing and "Zürich"
  // offered Rich Sparkle Holdings
  const accented: string[] = [];
  for (const [withAccent, without] of [["Nestlé", "Nestle"], ["L'Oréal", "L'Oreal"], ["Zürich", "Zurich"]]) {
    const [a, b] = [await resolveSearch(withAccent), await resolveSearch(without)];
    if (!same(a, b)) accented.push(`${withAccent} ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
  }
  check("a name typed with its accent gets the answer it gets without one", accented.length === 0, accented.join(" | "));
  // batch 56: "Chase" opened Chase Packaging and "Citi" Citi Trends, by title prefix
  const openedBy: [string, string][] = [["Citi", "C"], ["Citibank", "C"], ["Chase", "JPM"], ["Chase Bank", "JPM"], ["Pepsi", "PEP"], ["Citi Trends", "CTRN"], ["Chase Packaging", "WHLT"]];
  const misopened: string[] = [];
  for (const [q, ticker] of openedBy) {
    const r = await resolveSearch(q);
    if (!same(r, { kind: "company", ticker })) misopened.push(`${q} → ${JSON.stringify(r)}`);
  }
  check("\"Citi\", \"Citibank\", \"Chase\", \"Chase Bank\" and \"Pepsi\" open Citigroup, JPMorgan and PepsiCo; Citi Trends and Chase Packaging keep theirs",
    misopened.length === 0, misopened.join(" | "));
  const formAlone = await resolveSearch("Form 10-K");
  check("a form by its full name opens no company: \"Form 10-K\" opened FormFactor, whose ticker is FORM",
    same(formAlone, { kind: "none" }), JSON.stringify(formAlone));
  const anyForm: [string, object][] = [["Form 4 Tesla", { kind: "company", ticker: "TSLA" }], ["Form 13F Berkshire", { kind: "company", ticker: "BRK-B" }], ["Form D", { kind: "none" }]];
  const formWrong: string[] = [];
  for (const [q, want] of anyForm) {
    const r = await resolveSearch(q);
    if (!same(r, want)) formWrong.push(`${q} → ${JSON.stringify(r)}`);
  }
  check("  …nor any other form called a form: \"Form 4 Tesla\" opens Tesla, \"Form D\" nothing (batch 58)", formWrong.length === 0, formWrong.join(" | "));
  const formFor = await resolveSearch("Form 10-K for Apple");
  check("  …while \"Form 10-K for Apple\" opens Apple's annual reports, and \"FormFactor\" still opens FormFactor",
    same(formFor, { kind: "company", ticker: "AAPL", focus: "10-K" }) && same(await resolveSearch("FormFactor"), { kind: "company", ticker: "FORM" }),
    JSON.stringify(formFor));

  console.log("\nNews is asked for, and scored by, those names");
  const cikOf = (t: string) => tickerRows.find(([, ticker]) => ticker === t)![0];
  const titleOf = (t: string) => TICKER_INDEX_COMPANIES.find(([cik]) => cik === cikOf(t))![1];
  check("Goldman Sachs's news is also searched as \"goldman sachs\" (its feeds were asked for \"GOLDMAN SACHS GROUP\")",
    gdeltQuery(commonName(titleOf("GS")), newsNamesFor(cikOf("GS"))) === '("GOLDMAN SACHS GROUP" OR "goldman sachs") sourcelang:english',
    gdeltQuery(commonName(titleOf("GS")), newsNamesFor(cikOf("GS"))));
  check("Alphabet's headlines are also scored by \"Google\"", newsNamesFor(cikOf("GOOGL")).includes("Google"), JSON.stringify(newsNamesFor(cikOf("GOOGL"))));
  check("  …Meta's by \"Facebook\", Amazon's by \"Amazon\" (its feeds were asked for \"AMAZON COM\")",
    newsNamesFor(cikOf("META")).includes("Facebook") && newsNamesFor(cikOf("AMZN")).includes("Amazon"));
  check("  …and Motorola Solutions' never by \"motorola\"", newsNamesFor(cikOf("MSI")).length === 0, JSON.stringify(newsNamesFor(cikOf("MSI"))));
  check("  …but never a longer form of the name already asked for: no \"oracle corporation\" beside \"Oracle\"",
    newsNamesFor(cikOf("ORCL")).length === 0, JSON.stringify(newsNamesFor(cikOf("ORCL"))));
  check("  …and at most three, so the query stays one request",
    tickerRows.every(([cik]) => newsNamesFor(cik).length <= 3));
  check("the names are one GDELT request, OR'd", gdeltQuery("RTX", ["raytheon technologies"]) === '("RTX" OR "raytheon technologies") sourcelang:english', gdeltQuery("RTX", ["raytheon technologies"]));
  check("  …never with a word printed around every article: \"google\" scores Alphabet's headlines but stays out of its query",
    gdeltQuery("Alphabet", ["google"]) === '"Alphabet" sourcelang:english' &&
      JSON.stringify(gdeltNames("Meta Platforms", ["facebook", "thefacebook"])) === '["Meta Platforms","thefacebook"]',
    gdeltQuery("Alphabet", ["google"]));
  check("  …and a company without any is asked exactly as before", gdeltQuery("Ford") === '"Ford" sourcelang:english' && gdeltQuery("Ford", ["ford"]) === '"Ford" sourcelang:english');
  {
    let asked = "";
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      asked = String(input);
      return new Response(JSON.stringify({ articles: [] }), { status: 200 });
    }) as typeof fetch;
    await fetchNews("RTX", ["raytheon technologies"]);
    const orred = decodeURIComponent(asked);
    await fetchNews("Alphabet", ["google"]);
    check("  …which is what the GDELT request carries",
      orred.includes('("RTX" OR "raytheon technologies") sourcelang:english') && decodeURIComponent(asked).includes('query="Alphabet" sourcelang:english&'),
      `${orred.slice(45, 120)} | ${decodeURIComponent(asked).slice(45, 110)}`);
    // GDELT refuses a query it cannot parse with a line of text; the company keeps the news the
    // everyday name alone found before
    const queries: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const q = decodeURIComponent(String(input)).match(/query=([^&]*)/)![1];
      queries.push(q);
      if (q.includes(" OR ")) return new Response("The specified phrase is too short.", { status: 200 });
      const article = { url: "https://example.com/a", title: "D.R. Horton beats estimates", seendate: "20261021T120000Z", domain: "example.com", language: "English" };
      return new Response(JSON.stringify({ articles: [article] }), { status: 200 });
    }) as typeof fetch;
    const fallback = await fetchNews("HORTON D R", ["d r horton"]);
    check("  …and a refused other name falls back to the everyday name alone, saying so",
      fallback.outcome === "ok" && fallback.events.length === 1 && /other names refused/.test(fallback.detail ?? "") &&
        queries.length === 2 && queries[1] === '"HORTON D R" sourcelang:english',
      `${fallback.outcome} ${fallback.events.length} ${fallback.detail} | ${queries.join(" | ")}`);
    queries.length = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      queries.push(String(input));
      return new Response("The specified phrase is too short.", { status: 200 });
    }) as typeof fetch;
    const plain = await fetchNews("Ford");
    check("  …while a refused single name is still an error, asked once", plain.outcome === "error" && queries.length === 1, `${plain.outcome} ${queries.length}`);
  }
  const alphabet = { kind: "company" as const, displayName: "Alphabet Inc.", ticker: "GOOGL" };
  const headline = "Google unveils its next Pixel phone";
  check("a headline naming Google is about Alphabet once Alphabet carries the name",
    mentions(headline, aliasesFor(alphabet, ["Alphabet", ...newsNamesFor(cikOf("GOOGL"))])) === "named" &&
      mentions(headline, aliasesFor(alphabet, ["Alphabet"])) !== "named");
  check("an accent does not keep a headline from naming its company: \"estee lauder\" names \"Estée Lauder\"",
    newsNamesFor(cikOf("EL")).includes("Estee Lauder") && mentions("Estée Lauder cuts 7,000 jobs", ["estee lauder"]) === "named" &&
      mentions("Nestle recalls baby formula", ["nestlé"]) === "named", JSON.stringify(newsNamesFor(cikOf("EL"))));
  // batch 28 audit: in 18 of 18 headlines a punctuated name was not recognised, so they went to
  // the paid model or scored below the display floor
  check("news gets a name as it is written: \"U.S. Bancorp\", \"D. R. Horton\", \"Angie's List\"",
    newsNamesFor(cikOf("USB")).includes("U.S. Bancorp") && newsNamesFor(cikOf("DHI")).includes("D. R. Horton") &&
      newsNamesFor(cikOf("ANGI")).includes("Angie's List"),
    `${newsNamesFor(cikOf("USB"))} | ${newsNamesFor(cikOf("DHI"))} | ${newsNamesFor(cikOf("ANGI"))}`);
  check("  …and a headline names it however its dots, hyphens and apostrophes are written",
    mentions("D.R. Horton beats estimates", ["D. R. Horton"]) === "named" &&
      mentions("D . R . Horton beats estimates", ["D. R. Horton"]) === "named" &&
      mentions("Angie's List rebrands as Angi", ["angies list"]) === "named" &&
      mentions("Owens Illinois to close plant", ["Owens-Illinois"]) === "named");
  check("  …while a one-word name still needs its own spelling: \"Hunt\" is not \"J.B. Hunt\"",
    mentions("Hunt for the missing hikers resumes", ["J. B. Hunt"]) !== "named");
  check("  …nor does a name that merely ends in a longer one: Acuity Brands is kept beside \"ACUITY\"",
    commonName(titleOf("AYI")) === "ACUITY" && newsNamesFor(cikOf("AYI")).includes("Acuity Brands"), JSON.stringify(newsNamesFor(cikOf("AYI"))));
  check("  …and \"The Hartford\" never searches the insurer's news",
    !newsNamesFor(cikOf("HIG")).some((n) => /^the hartford$/i.test(n)), JSON.stringify(newsNamesFor(cikOf("HIG"))));
  const block = { kind: "company" as const, displayName: "Block, Inc.", ticker: "XYZ" };
  check("  …while Times Square is not Block's", mentions("Crowds pack Times Square for the countdown", aliasesFor(block, ["Block", ...newsNamesFor(cikOf("XYZ"))])) !== "named");
  const ingestSrc = readFileSync("scripts/ingest.ts", "utf8");
  const newsSrc = readFileSync("lib/scoringNames.ts", "utf8");
  check("company ingest searches and scores with them",
    /const alsoKnownAs = newsNamesFor\(company\.cik\);/.test(ingestSrc) &&
      // by the names every path scores a company with (batch 61): since batch 36 with the names a
      // GDELT headline gives a possessive ("mcdonald")
      /aliases: companyScoringAliases\(company\)/.test(ingestSrc) &&
      /\[commonName\(company\.name\), \.\.\.newsNamesFor\(company\.cik\), \.\.\.gdeltHeadlineNames\(company\.name, possessiveNameFor\(company\.cik\)\)\]/.test(newsSrc) &&
      /fetchNews\(newsQuery, alsoKnownAs, \{ byRelevance \}\)/.test(ingestSrc));
  check("  …and so does re-scoring", /companyScoringAliases\(\{ name: subject\.displayName, ticker: subject\.ticker, cik \}\)/.test(readFileSync("scripts/score.ts", "utf8")));

  console.log("\nThe sync reads what it says it reads");
  const sync = readFileSync("scripts/sync-aliases.ts", "utf8");
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
  check("`npm run sync:aliases` runs it", pkg.scripts["sync:aliases"] === "tsx scripts/sync-aliases.ts");
  check("every official name, former ones included, not only the preferred current one",
    (sync.match(/p:P1448\/ps:P1448/g) ?? []).length === 2 && !/wdt:P1448/.test(sync));
  check("a parent organization only while it still is one", /FILTER NOT EXISTS \{ \?st pq:P582 \?end \}/.test(sync));
  check("a former registrant's tickers, to tell a predecessor from an acquisition", /p:P414\/pq:P249 \?n \. BIND\("ticker" AS \?kind\)/.test(sync) && /tickersOf: companyTickers/.test(sync));
  check("no \"owned by\" or \"manufacturer\" links, which map zinc to Pfizer", !/P127|P176/.test(sync));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  if (fail) process.exit(1);
  process.exit(0);
}

main();
