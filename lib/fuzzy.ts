import { WEAK_TOKENS } from "./newsQuality";

/**
 * Name resemblance, in-process — the same measure the corpus search gets from Postgres's
 * `word_similarity` (db/020), for the one list that has to answer with the database down: the
 * committed EDGAR index.
 *
 * Kept to pg_trgm's own definitions so a score means the same thing on both paths and
 * `SIMILARITY_FLOOR` can be shared: a word's trigrams are taken with two spaces before it and one
 * after, anything not a letter or digit separates words, and word similarity is the best match
 * between the query's trigrams and any unbroken run of the target's. Its one addition is "&" read
 * as "and", both sides — "Johnson and Johnson" is how people say JOHNSON & JOHNSON.
 */

/**
 * The least resemblance worth offering. Deliberately not pg_trgm's default 0.3: at 0.3 a
 * three-letter query matches a surprising amount of a real corpus.
 */
export const SIMILARITY_FLOOR = 0.5;

/** Lower case, "&" as a word, everything else that is not a letter or digit a separator. */
export function matchWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** A string's trigrams in the order pg_trgm reads them, repeats kept. */
export function trigrams(s: string): string[] {
  const out: string[] = [];
  for (const w of matchWords(s)) {
    const padded = `  ${w} `;
    for (let i = 0; i + 3 <= padded.length; i++) out.push(padded.slice(i, i + 3));
  }
  return out;
}

/**
 * pg_trgm's `word_similarity(query, target)`: the shared trigrams over the union, for whichever
 * unbroken run of the target's trigrams scores best. A query wholly inside a long legal name
 * scores 1 ("lilly" against "ELI LILLY & Co"), where plain similarity would be diluted by every
 * word the visitor did not type.
 */
export function wordSimilarity(query: Set<string>, target: string[]): number {
  if (!query.size || !target.length) return 0;
  let best = 0;
  for (let i = 0; i < target.length; i++) {
    // An extent that opens on a trigram the query lacks only adds to the union.
    if (!query.has(target[i])) continue;
    const seen = new Set<string>();
    let shared = 0;
    for (let j = i; j < target.length; j++) {
      const t = target[j];
      if (seen.has(t)) continue;
      seen.add(t);
      if (query.has(t)) {
        shared++;
        const score = shared / (query.size + seen.size - shared);
        if (score > best) best = score;
        // every query trigram is in this run: going further can only add to the union
        if (shared === query.size) break;
      }
    }
  }
  return best;
}

/**
 * Is this query distinctive enough to match on resemblance rather than on identity?
 *
 * Two ways it is not, both measured against a real corpus rather than imagined:
 *
 *  - **Too short.** `word_similarity` compares the query against the best-matching run inside the
 *    target, so `"co"` scores 0.67 against "Ford Motor Company" — a partial hit on *Company*.
 *  - **Nothing but filler.** `"company"`, `"motor"`, `"inc"`, `"group"` and `"holding"` each score
 *    a perfect 1.00, because they genuinely are words in the name. This repo already settled that
 *    question for headlines: the bar is a *distinctive* token, and matching on "motor" or
 *    "company" would let almost anything through. `WEAK_TOKENS` is that list, reused here rather
 *    than restated, so the two places cannot drift.
 *
 * Exact identifiers are unaffected — a ticker or an exact name is still an answer however short
 * or common it looks, which is why this gates only the fuzzy arms of a lookup.
 */
export function worthFuzzyMatching(q: string): boolean {
  return q.length >= 3 && distinctiveWords(q).length > 0;
}

/** The words that could identify something on their own: three letters or more, not filler. */
export function distinctiveWords(s: string): string[] {
  // once each: a word typed twice is not two words a name must hold, and scoring it twice costs
  return [...new Set(matchWords(s).filter((t) => t.length >= 3 && !WEAK_TOKENS.has(t)))];
}

/**
 * Whether every one of these words is in the target, allowing for a typo in each — each word
 * scored alone against the target, at the floor.
 *
 * Whole-query resemblance lets one long word carry a short one: "electric cars" scores 0.71
 * against "GENERAL ELECTRIC CO" on "electric" alone. Offering a name that lacks a word the visitor
 * typed is offering a different thing, so a match has to account for every distinctive word.
 */
export function everyWordIn(words: string[], target: string[]): boolean {
  return words.every((w) => wordSimilarity(new Set(trigrams(w)), target) >= SIMILARITY_FLOOR);
}
