/**
 * "Estée Lauder" → "Estee Lauder", "Itaú" → "Itau", "Mondelēz" → "Mondelez": accents dropped,
 * letters kept. Without it a name with an accent splits at the accented letter ("est e lauder"),
 * and neither a search nor a headline can match it. Folded: the alias index's keys (`nameKey`), a
 * search of the committed EDGAR index (`resolveTickerLocally`, `resolveCompany`,
 * `suggestSecurities`), headline matching (`mentions`) and the Federal Register title matcher. Not
 * folded: searches of held subjects in the database, whose stored names may carry accents.
 */
export const foldAccents = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "");
