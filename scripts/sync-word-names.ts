import { writeFileSync } from "node:fs";
import tickers from "../data/edgar-tickers.json";
import { gdeltNewsPlan } from "../lib/news";
import { oneWordName } from "../lib/ingest/newsBackfill";
import { newsNamesFor, possessiveNameFor } from "../lib/sec";

/**
 * Which companies' GDELT name is one ordinary English word (batch 58).
 *
 *   npm run sync:word-names      # after `npm run sync:tickers`
 *
 * The news backfill asks GDELT for a company's older months by relevance and keeps a headline that
 * names it. For "Target", "Southern" or "Crown" that test is true of the word: one month of Target
 * kept "IMF urges retaining 5 % inflation target" (the 2026-10-26 audit). So the backfill holds such
 * a company back until a month of its own has been measured (`BACKFILL_WORD_NAMES`).
 *
 * This writes `data/english-word-names.json`: each company's one-word GDELT name in the committed
 * ticker index, as a word of the ENABLE list (public domain, the source of
 * `data/english-short-words.json`) or not. A name the file does not hold counts as a word, so a
 * company listed after the last run is held back until this runs again.
 */

const ENABLE = "https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt";
const OUT = "data/english-word-names.json";

async function main(): Promise<void> {
  const res = await fetch(ENABLE);
  if (!res.ok) throw new Error(`ENABLE answered ${res.status}`);
  const list = (await res.text()).split("\n").map((w) => w.trim()).filter(Boolean);
  const english = new Set(list);
  const index = tickers as unknown as { syncedOn: string; companies: [number, string, string][] };
  const words = new Set<string>();
  const others = new Set<string>();
  for (const [cik, , title] of index.companies) {
    const aka = newsNamesFor(cik);
    const name = oneWordName(gdeltNewsPlan(title, possessiveNameFor(cik), aka).query);
    if (name) (english.has(name.toLowerCase()) ? words : others).add(name);
  }
  const file = {
    source: `ENABLE (Enhanced North American Benchmark Lexicon), public domain, read ${new Date().toISOString().slice(0, 10)} from github.com/dolph/dictionary/blob/master/enable1.txt (${list.length.toLocaleString("en-US")} words).`,
    index: `data/edgar-tickers.json synced ${index.syncedOn}`,
    use: "A company whose one-word GDELT name is one of `words` is not backfilled until a month of its own is measured (lib/ingest/newsBackfill.ts, batch 58). A name in neither list counts as a word.",
    words: [...words].sort(),
    others: [...others].sort(),
  };
  writeFileSync(OUT, JSON.stringify(file, null, 1) + "\n");
  console.log(`${OUT}: ${words.size} one-word names are English words, ${others.size} are not (index synced ${index.syncedOn})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
