import { writeFileSync } from "node:fs";
import { buildCompanyAliases, type AliasIndexFile, type WikidataCompany } from "../lib/companyAliases";
import { commonName, titleMatch, TICKER_INDEX_COMPANIES } from "../lib/sec";

/**
 * Rebuild the committed index of other names for listed companies (NC-004).
 *
 *   npm run sync:aliases
 *
 * Three Wikidata queries, then `buildCompanyAliases` (lib/companyAliases.ts), which holds every
 * rule about what may become a name. This is the only script that writes
 * `data/company-aliases.json`; run it after `npm run sync:tickers`, since an alias is only kept
 * for a company the ticker index lists. The file records when it was built.
 *
 * Read the "overrides" it prints before committing: each is a name that will now find a
 * different company than the title rungs alone did. `npm run sync:aliases -- --report <file>`
 * also writes every dropped name with its reason.
 */

const UA = { "User-Agent": "News Charts Research marcusowens94@gmail.com", Accept: "application/sparql-results+json" };
const OUT = "data/company-aliases.json";
const ENDPOINT = "https://query.wikidata.org/sparql";
// Wikidata moved language-neutral labels to "mul" in 2024; Walmart's English label is one.
const LANGS = `FILTER(LANG(?n) = "en" || LANG(?n) = "mul")`;

/** A listed company's own label and aliases, by CIK. */
const OWN = `SELECT ?item ?cik ?n ?kind ?links WHERE {
  ?item wdt:P5531 ?cik . OPTIONAL { ?item wikibase:sitelinks ?links }
  { ?item rdfs:label ?n . BIND("label" AS ?kind) } UNION { ?item skos:altLabel ?n . BIND("alias" AS ?kind) }
  ${LANGS}
}`;

/**
 * Official names, current and former — "Facebook, Inc." is Meta's, ended 2021-10-28. Read every
 * statement (`p:`/`ps:`): the truthy `wdt:` path returns only the preferred-rank current name.
 */
const OFFICIAL = `SELECT ?item ?cik ?n WHERE {
  ?item wdt:P5531 ?cik . ?item p:P1448/ps:P1448 ?n . ${LANGS}
}`;

/** A former registrant whose current parent organization (no end date) is another registrant. */
const FORMER = `SELECT ?item ?cik ?pcik ?n ?kind ?links WHERE {
  ?item wdt:P5531 ?cik . ?item p:P749 ?st . ?st ps:P749 ?parent . OPTIONAL { ?item wikibase:sitelinks ?links }
  FILTER NOT EXISTS { ?st pq:P582 ?end }
  ?parent wdt:P5531 ?pcik .
  { ?item rdfs:label ?n . BIND("label" AS ?kind) } UNION { ?item skos:altLabel ?n . BIND("alias" AS ?kind) }
  UNION { ?item p:P1448/ps:P1448 ?n . BIND("official" AS ?kind) }
  ${LANGS}
}`;

type Binding = Record<string, { value: string }>;

async function sparql(query: string): Promise<Binding[]> {
  const res = await fetch(`${ENDPOINT}?${new URLSearchParams({ query, format: "json" })}`, { headers: UA });
  if (!res.ok) throw new Error(`Wikidata SPARQL → HTTP ${res.status}`);
  return ((await res.json()) as { results: { bindings: Binding[] } }).results.bindings;
}

const qidOf = (b: Binding) => b.item.value.split("/").pop()!;
const cikOf = (v: string) => Number(v.replace(/\D/g, ""));

async function main(): Promise<void> {
  console.log("asking Wikidata…");
  const [own, official, former] = [await sparql(OWN), await sparql(OFFICIAL), await sparql(FORMER)];
  const listed = new Set(TICKER_INDEX_COMPANIES.map(([cik]) => cik));

  const items = new Map<string, WikidataCompany>();
  const item = (qid: string, targetCik: number, kind: WikidataCompany["kind"]) => {
    const key = `${qid}→${targetCik}`;
    let it = items.get(key);
    if (!it) items.set(key, (it = { qid, targetCik, kind, labels: [], officialNames: [], aliases: [], sitelinks: 0 }));
    return it;
  };
  const links = (it: WikidataCompany, b: Binding) => {
    if (b.links) it.sitelinks = Math.max(it.sitelinks, Number(b.links.value));
  };
  for (const b of own) {
    const cik = cikOf(b.cik.value);
    if (!listed.has(cik)) continue;
    const it = item(qidOf(b), cik, "own");
    links(it, b);
    (b.kind.value === "label" ? it.labels : it.aliases).push(b.n.value);
  }
  for (const b of official) {
    const cik = cikOf(b.cik.value);
    if (listed.has(cik)) item(qidOf(b), cik, "own").officialNames.push(b.n.value);
  }
  for (const b of former) {
    const cik = cikOf(b.cik.value);
    const parent = cikOf(b.pcik.value);
    // a registrant still listed answers for itself; only one whose parent is listed borrows it
    if (listed.has(cik) || !listed.has(parent)) continue;
    const it = item(qidOf(b), parent, "former");
    links(it, b);
    const list = b.kind.value === "label" ? it.labels : b.kind.value === "official" ? it.officialNames : it.aliases;
    list.push(b.n.value);
  }
  for (const it of items.values()) {
    it.labels = [...new Set(it.labels)];
    it.officialNames = [...new Set(it.officialNames)];
    it.aliases = [...new Set(it.aliases)];
  }

  const { aliases, dropped, overrides } = buildCompanyAliases([...items.values()], {
    companies: TICKER_INDEX_COMPANIES,
    titleMatch,
    commonName,
  });
  const file: AliasIndexFile = {
    syncedOn: new Date().toISOString().slice(0, 10),
    source:
      "Wikidata (CC0): listed companies' labels, official names and related aliases by CIK (P5531), and former registrants' names under a listed parent (P749)",
    aliases,
  };
  writeFileSync(OUT, JSON.stringify(file, null, 0) + "\n");
  const reportAt = process.argv.indexOf("--report");
  if (reportAt >= 0 && process.argv[reportAt + 1]) {
    writeFileSync(process.argv[reportAt + 1], JSON.stringify({ dropped, overrides }, null, 1));
  }

  const byReason = dropped.reduce<Record<string, number>>((n, d) => ((n[d.reason] = (n[d.reason] ?? 0) + 1), n), {});
  console.log(`  ${items.size} Wikidata items for listed companies`);
  console.log(`  ${Object.keys(aliases).length} names written to ${OUT}`);
  console.log(`  dropped: ${JSON.stringify(byReason)}`);
  console.log(`  ${overrides.length} names now find a different company than a title prefix did:`);
  for (const o of overrides) console.log(`    ${o.key} → CIK ${o.to} (title prefix found CIK ${o.prefixHit})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
