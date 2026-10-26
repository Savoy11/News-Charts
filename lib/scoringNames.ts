import { nameKey, possessiveWords } from "./companyAliases";
import { commonName, newsNamesFor, possessiveNameFor } from "./sec";
import { aliasesFor } from "./enrich/relevance";

/**
 * The names a company's headlines are scored by, and the GDELT forms they rest on. Pure name logic,
 * kept out of `lib/news.ts` so a visitor's first pass, which must never reach a slow source
 * (`check:ondemand`), scores with the same names as everything else (batch 61). `lib/news.ts`
 * re-exports all three.
 */

/**
 * A name the way GDELT holds it. GDELT drops a possessive "'s" whole: "Grey's Anatomy" comes back
 * "Grey Anatomy", and none of the 211 GDELT headlines stored for JPMorgan keeps an apostrophe. It
 * reads a quoted "domino's pizza" as "dominos pizza", which found 2 articles in three days where
 * "domino pizza" found 18 (2026-10-23, batch 36).
 */
export function gdeltForm(name: string): string {
  return name.replace(/['’]s\b/gi, "");
}

/**
 * The names a GDELT headline gives a company whose name is a possessive, for headline scoring:
 * "mcdonald" for McDonald's, "domino pizza" for Domino's Pizza — [] for any other company. GDELT's
 * headline reads "Domino sales growth slows", which names neither "DOMINOS PIZZA" nor "Domino's".
 * Lower case, so a short one ("macy") is never read as initials that count only in capitals.
 */
export function gdeltHeadlineNames(edgarTitle: string, possessive = ""): string[] {
  const dropS = new Set([...possessiveWords(edgarTitle), ...possessiveWords(possessive)]);
  if (!dropS.size) return [];
  const everyday = nameKey(commonName(edgarTitle)).split(" ").map((w) => (dropS.has(w) ? w.slice(0, -1) : w)).join(" ");
  const own = possessive ? nameKey(gdeltForm(commonName(possessive))) : "";
  return [...new Set([everyday, own].filter(Boolean).map((n) => n.toLowerCase()))];
}

/**
 * The names a company's headlines are scored by, wherever they are scored: ingest, a first visit,
 * `npm run score`, the backfill and `check:feeds` (batch 61). Its common name, its other names news
 * may use (`newsNamesFor`) and the names a GDELT headline gives a possessive. Never its stored
 * search aliases: `npm run score` read those, and a former name news does not keep ("Unwired
 * Planet", which Great Elm sold, batch 58) scored 0.9 there and nothing at ingest.
 */
export function companyScoringAliases(company: { name: string; ticker?: string | null; cik: number | string }): string[] {
  return aliasesFor({ kind: "company", displayName: company.name, ticker: company.ticker },
    [commonName(company.name), ...newsNamesFor(company.cik), ...gdeltHeadlineNames(company.name, possessiveNameFor(company.cik))]);
}
