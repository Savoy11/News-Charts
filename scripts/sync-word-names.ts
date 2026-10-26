import { writeFileSync } from "node:fs";
import tickers from "../data/edgar-tickers.json";
import { companyScoringAliases, gdeltNewsPlan } from "../lib/news";
import { oneWordName } from "../lib/wordNames";
import { nameWords, shortName } from "../lib/enrich/relevance";
import { commonName, withoutTag } from "../lib/edgarName";
import { nameKey } from "../lib/companyAliases";
import { newsNamesFor, possessiveNameFor } from "../lib/sec";

/**
 * Which companies' names are ordinary English words (batches 58, 59), and which words many names
 * share (batch 60).
 *
 *   npm run sync:word-names      # after `npm run sync:tickers`
 *
 * The news backfill asks GDELT for a company's older months by relevance and keeps a headline that
 * names it. For "Target", "Southern" or "Crown" that test is true of the word: one month of Target
 * kept "IMF urges retaining 5 % inflation target" (the 2026-10-26 audit). So the backfill holds such
 * a company back until a month of its own has been measured (`MEASURED_WORD_NAMES`).
 *
 * Headline scoring names a company by each word of its name and by its other names, and a word
 * that is also an English word names it only with its capital (`withCapital`): "Visa beats
 * estimates", never "Student visa rules tightened".
 *
 * This writes `data/english-word-names.json` from the committed ticker index, by the ENABLE list
 * (public domain, the source of `data/english-short-words.json`):
 * - `words` and `others`: each company's one-word GDELT name, as a word or not. A name the file
 *   does not hold counts as a word, so a company listed after the last run is held back until this
 *   runs again.
 * - `pieces`: the other one-word names its headlines are scored by (the words of its name, and the
 *   names ingest adds) that are words, three letters or more. One the file does not hold matches in
 *   any case, as every name did before.
 *
 * …and `data/shared-name-words.json`: for each word of a company's name (`nameWords`), how many
 * listed companies' names hold it, where two or more do. A word five or more share names none of
 * them alone (`SHARED_ALONE`). With it, `shortNames`: the short names (`shortName`) no other listed
 * company's name holds, which alone a company may be named by (batch 61).
 */

const ENABLE = "https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt";
const OUT = "data/english-word-names.json";
const SHARED_OUT = "data/shared-name-words.json";

async function main(): Promise<void> {
  const res = await fetch(ENABLE);
  if (!res.ok) throw new Error(`ENABLE answered ${res.status}`);
  const list = (await res.text()).split("\n").map((w) => w.trim()).filter(Boolean);
  const english = new Set(list);
  const index = tickers as unknown as { syncedOn: string; companies: [number, string, string][] };
  const words = new Set<string>();
  const others = new Set<string>();
  const pieces = new Set<string>();
  const shared = new Map<string, Set<number>>();
  for (const [cik, ticker, title] of index.companies) {
    const aka = newsNamesFor(cik);
    const possessive = possessiveNameFor(cik);
    const name = oneWordName(gdeltNewsPlan(title, possessive, aka).query);
    if (name) (english.has(name.toLowerCase()) ? words : others).add(name);
    const ownWords = nameWords({ kind: "company", displayName: title });
    for (const word of ownWords) (shared.get(nameKey(word)) ?? shared.set(nameKey(word), new Set()).get(nameKey(word))!).add(cik);
    // as ingest scores the company's headlines, with every word of its name; its ticker apart, which
    // is matched in capitals anyway, and not the name word it may equal: GAP's "gap" (batch 61)
    const scored = [...ownWords, ...companyScoringAliases({ name: title, ticker, cik })];
    for (const alias of scored) {
      const key = oneWordName(alias);
      if (key && key.length >= 3 && alias !== ticker && english.has(key.toLowerCase())) pieces.add(key);
    }
  }
  for (const w of words) pieces.delete(w);
  const file = {
    source: `ENABLE (Enhanced North American Benchmark Lexicon), public domain, read ${new Date().toISOString().slice(0, 10)} from github.com/dolph/dictionary/blob/master/enable1.txt (${list.length.toLocaleString("en-US")} words).`,
    index: `data/edgar-tickers.json synced ${index.syncedOn}`,
    use: "A company whose one-word GDELT name is one of `words` is not backfilled until a month of its own is measured (lib/ingest/newsBackfill.ts, batch 58); a name in neither `words` nor `others` counts as a word. A one-word name in `words` or `pieces` names a headline only with its capital (lib/wordNames.ts, batch 59).",
    words: [...words].sort(),
    others: [...others].sort(),
    pieces: [...pieces].sort(),
  };
  writeFileSync(OUT, JSON.stringify(file, null, 1) + "\n");
  console.log(`${OUT}: ${words.size} one-word names are English words, ${others.size} are not; ${pieces.size} other scored names are words (index synced ${index.syncedOn})`);
  const counts = [...shared].map(([key, ciks]) => [key, ciks.size] as const).filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  // each company's short name, from these counts, and how many companies' common names hold it
  const sharedBy = (key: string) => shared.get(key)?.size ?? 1;
  const commons = new Map<number, string>();
  for (const [cik, , title] of index.companies) if (!commons.has(cik)) commons.set(cik, ` ${nameKey(commonName(withoutTag(title)))} `);
  const shorts = new Set<string>();
  for (const [cik, , title] of index.companies) {
    const short = shortName(commonName(withoutTag(title)), sharedBy);
    if (short) shorts.add(` ${nameKey(short)} `);
  }
  const holders = new Map([...shorts].map((s) => [s, 0]));
  for (const common of commons.values()) for (const s of shorts) if (common.includes(s)) holders.set(s, holders.get(s)! + 1);
  const ownShort = [...holders].filter(([, n]) => n === 1).map(([s]) => s.trim()).sort();
  writeFileSync(SHARED_OUT, JSON.stringify({
    index: `data/edgar-tickers.json synced ${index.syncedOn}`,
    use: "How many listed companies' names hold each word of a name, where two or more do. A word five or more share names none of them alone in headline scoring, unless it is a company's whole name; a word two share is generic in a company's short name (lib/enrich/relevance.ts, batch 60). `shortNames`: the short names one listed company's common name alone holds, the only ones a company is named by (batch 61).",
    shared: Object.fromEntries(counts),
    shortNames: ownShort,
  }, null, 1) + "\n");
  console.log(`${SHARED_OUT}: ${counts.length} words are shared by two or more companies' names, ${counts.filter(([, n]) => n >= 5).length} by five or more; ${ownShort.length} of ${shorts.size} short names are one company's`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
