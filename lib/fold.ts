/**
 * "Estée Lauder" → "Estee Lauder", "Itaú" → "Itau", "Mondelēz" → "Mondelez": accents dropped,
 * letters kept. Every comparison of names folds first. Without it a name with an accent splits
 * at the accented letter ("est e lauder"), and neither a search nor a headline can match it.
 */
export const foldAccents = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "");
