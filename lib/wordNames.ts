import { nameKey } from "./companyAliases";
import wordNames from "../data/english-word-names.json";
import sharedNames from "../data/shared-name-words.json";

/**
 * Company names that are also everyday English words, per `data/english-word-names.json`
 * (`npm run sync:word-names`, from the public-domain ENABLE list). Two uses:
 *
 * - The news backfill holds back a company whose GDELT name is one such word until a month of its
 *   own is measured (batch 58): "the headline names it" is true of the word. One month of Target
 *   kept "IMF urges retaining 5 % inflation target" (the 2026-10-26 audit).
 * - Headline scoring counts a name that is such a word only where the headline writes it with its
 *   capital (batch 59): "Visa beats estimates" names Visa, "Student visa rules tightened" does not.
 *
 * It also holds how many listed companies' names share each word (`sharedBy`, batch 60): a word
 * five or more share names none of them alone.
 */
const WORDS: ReadonlySet<string> = new Set(wordNames.words);
const NOT_WORDS: ReadonlySet<string> = new Set(wordNames.others);
const PIECES: ReadonlySet<string> = new Set(wordNames.pieces);
const SHARED: Readonly<Record<string, number>> = sharedNames.shared;

/** A company's GDELT name when it is one word of letters, as a name key: "TARGET" — null for "Ford Motor" or "Life360". */
export function oneWordName(query: string): string | null {
  const key = nameKey(query);
  return /^[A-Z]+$/.test(key) ? key : null;
}

/**
 * The company's GDELT name when it is one everyday English word: "TARGET", "SOUTHERN", "APPLE". A
 * one-word name the file does not hold counts as a word, so a company listed since the file was
 * written is held back, not let through.
 */
export function everydayWordName(query: string): string | null {
  const key = oneWordName(query);
  return key && (WORDS.has(key) || !NOT_WORDS.has(key)) ? key : null;
}

/** Whether a one-word name, as a name key, is a word in the file: "TARGET" is, "NVIDIA" is not, nor one it does not hold. */
export function isListedWord(key: string): boolean {
  return WORDS.has(key);
}

/**
 * Everyday-word names measured to backfill cleanly, each with its measurement (batch 58's
 * `BACKFILL_WORD_NAMES`): the backfill asks GDELT for a company named by one of the words only
 * when it is here, and keeps a headline only when it has the capital. Target is not here: with
 * that rule, its September 2026 kept 25 stories and 2 were stock tips ("… | Target , stop - loss").
 */
export const MEASURED_WORD_NAMES: Record<string, string> = {
  APPLE: "May 2023: 60 headlines kept, each with its capital; one, a cranberry brie recipe, not about Apple",
  TESLA: "April 2022: 31 headlines with its capital, every one about Tesla or its cars; the one without was a tag page",
};

/** Whether the headline writes the name with its capital: "Apple" or "APPLE", never "apple". */
export function namedWithCapital(title: string, key: string): boolean {
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${key}(?![\\p{L}\\p{N}])`, "giu");
  for (const m of title.matchAll(re)) if (m[0][0] === key[0]) return true;
  return false;
}

/**
 * A one-word name as headline scoring keeps it: with its capital when it is an everyday word, so
 * it names only a headline that writes it so ("visa" → "Visa", "lowe's" → "Lowe's"); any other
 * name as it came (batch 59).
 */
export function withCapital(name: string): string {
  const key = oneWordName(name);
  return key && (WORDS.has(key) || PIECES.has(key)) ? name[0].toUpperCase() + name.slice(1) : name;
}

/**
 * How many listed companies' names hold a word, as a name key: "GOLD" 130, "FORD" 1. From
 * `data/shared-name-words.json` (`npm run sync:word-names`), which lists the words two or more
 * share; any other counts as one (batch 60).
 */
export function sharedBy(key: string): number {
  return SHARED[key] ?? 1;
}
