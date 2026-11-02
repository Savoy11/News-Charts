/**
 * The rows a year's pages never showed (batch 85, the 2026-11-01 audit's finding 3).
 *
 * The SEC's listings, the press releases' and both case listings', sort a year by day alone, so
 * where rows tie on a day across a page boundary the next page shows some of them again and never
 * shows others: the litigation releases of 2010 hold 439 rows by their own count ("1 to 100 of 439
 * items"), and its pages showed 438 distinct, LR-21696 twice and LR-21695 not at all. Measured on
 * the pages saved 2026-11-01, 40 of the 66 case listing-years were short by 96 rows, and 4 of the
 * 30 press years by one each.
 *
 * A row shown twice marks the day a row is missing from, so the month holding it is read again
 * on its own, where the rows are few enough to sit on one page: October 2010 is one page of 38,
 * LR-21695 among them.
 */

/** The page's own count of the rows its view holds, from its footer: "1 to 100 of 439 items". */
export function listingTotal(html: string): number | undefined {
  const m = /<div class="view-footer">\s*[\d,]+\s+to\s+[\d,]+\s+of\s+([\d,]+)\s+items/.exec(html);
  return m ? Number(m[1].replace(/,/g, "")) : undefined;
}

/** The months (1–12) of the rows the pages showed more than once, which hide others of their day. */
export function monthsToReread(rows: readonly { key: string; day: string }[]): number[] {
  const count = new Map<string, number>();
  for (const r of rows) count.set(r.key, (count.get(r.key) ?? 0) + 1);
  const months = new Set<number>();
  for (const r of rows) if ((count.get(r.key) ?? 0) > 1) months.add(Number(r.day.slice(5, 7)));
  return [...months].sort((a, b) => a - b);
}
