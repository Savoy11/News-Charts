import { readFileSync } from "node:fs";
import aliasFile from "../data/company-aliases.json";
import tickerIndex from "../data/edgar-tickers.json";
import {
  ONE_WORD_MIN_SITELINKS,
  buildCompanyAliases,
  nameKey,
  type AliasIndexFile,
  type WikidataCompany,
} from "../lib/companyAliases";
import { commonName, resolveTickerLocally, titleMatch, TICKER_INDEX_COMPANIES } from "../lib/sec";

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

const view = { companies: TICKER_INDEX_COMPANIES, titleMatch, commonName };
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
      item("Q95", 1652044, "former", { labels: ["Google"], aliases: ["Big G"], sitelinks: 212 }),
      item("Q212405", 80424, "own", {
        labels: ["Procter & Gamble"],
        aliases: ["P&G", "Rejoice", "Proctor and Gamble", "The Procter & Gamble Company (Cincinnati, OH)"],
        sitelinks: 100,
      }),
      item("Q37156", 51143, "own", { labels: ["IBM"], aliases: ["18M", "ibm.com", "IBM Corp."], sitelinks: 150 }),
      item("Q14647", 1341439, "former", { labels: ["Sun Microsystems"], aliases: ["Sun", "Stanford University Network"], sitelinks: 74 }),
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
  check("every name finds a company the ticker index lists", entries.every(([, [cik]]) => listed.has(cik)));
  const stolen = entries.filter(([k, [cik]]) => (everyday.get(k) ?? cik) !== cik).map(([k]) => k);
  check("no name is another listed company's title or everyday name", stolen.length === 0, stolen.slice(0, 5).join(", "));
  check("every name points at its Wikidata item", entries.every(([, [, qid]]) => /^Q\d+$/.test(qid)));

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
  ] as const) {
    const got = resolveTickerLocally(query);
    check(`"${query}" finds ${want}`, got === want, got ?? "null");
  }
  for (const [query, want] of [["Apple", "AAPL"], ["Ford", "F"], ["Pure Cycle", "PCYO"], ["Coca-Cola", "KO"]] as const) {
    check(`"${query}" is still ${want}`, resolveTickerLocally(query) === want, resolveTickerLocally(query) ?? "null");
  }
  check("\"Rejoice\" does not find Procter & Gamble", resolveTickerLocally("Rejoice") !== "PG");
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

  console.log("\nThe sync reads what it says it reads");
  const sync = readFileSync("scripts/sync-aliases.ts", "utf8");
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
  check("`npm run sync:aliases` runs it", pkg.scripts["sync:aliases"] === "tsx scripts/sync-aliases.ts");
  check("every official name, former ones included, not only the preferred current one",
    (sync.match(/p:P1448\/ps:P1448/g) ?? []).length === 2 && !/wdt:P1448/.test(sync));
  check("a parent organization only while it still is one", /FILTER NOT EXISTS \{ \?st pq:P582 \?end \}/.test(sync));
  check("no \"owned by\" or \"manufacturer\" links, which map zinc to Pfizer", !/P127|P176/.test(sync));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  if (fail) process.exit(1);
  process.exit(0);
}

main();
