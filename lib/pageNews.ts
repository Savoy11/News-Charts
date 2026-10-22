import { PricePoint, TimelineEvent } from "./types";

/**
 * What a page's cached entry may weigh, the way Next weighs it. `unstable_cache` stores the page
 * as a JSON string inside a JSON entry and refuses any entry over 2 MB, measured as that outer
 * JSON's length (`next/dist/server/lib/incremental-cache`), so every quote and backslash in the
 * page counts twice. What a page carries is also what its visitor downloads: the explorer is a
 * client component and receives every row. The 2 MB less this leaves room for the entry's own
 * fields.
 */
export const PAGE_ENTRY_BUDGET = 1_800_000;

/** Next's 2 MB, as `incremental-cache` compares it. */
export const NEXT_CACHE_LIMIT = 2 * 1024 * 1024;

/** A value's weight inside a cached entry: its JSON, escaped again as the entry's string body. */
export function cachedWeight(value: unknown): number {
  return JSON.stringify(JSON.stringify(value)).length - 2;
}

export interface PageNews {
  events: TimelineEvent[];
  /** stored stories the page leaves out to stay within the budget; 0 when all of them fit */
  newsLeftOut: number;
}

/**
 * The news a page carries when all its stored stories would take its cached entry over budget
 * (batch 35).
 *
 * Every other row stays: a filing, an earnings release or a recall is the primary record, and
 * there are only so many. News is what grows. GDELT is asked every hour for its newest hundred,
 * and JPMorgan's timeline weighed 1.48 MB as Next measures it with 90 stories, so about 1,200 more
 * would stop its page being cached. News fills the room the rest leaves, in two halves:
 * - the newest stories take the first half, so a page read today carries today's news;
 * - the past takes the rest a round at a time: the strongest story of each day, then each day's
 *   second, and so on, the days the price moved most first in every round. When the room runs
 *   out, the stories kept are the ones beside the moves a reader came to explain.
 * On a day, a story whose headline scoring named the company comes before an unscored one.
 *
 * `carried` is the weight of everything else in the cached entry. Done when the page is read: the
 * database keeps every story.
 */
export function boundPageNews(
  events: TimelineEvent[],
  prices: PricePoint[] = [],
  carried = 0,
  budget = PAGE_ENTRY_BUDGET
): PageNews {
  const news: TimelineEvent[] = [];
  // the array's brackets, and a comma after each row but the last (one spare is harmless)
  let used = carried + 2;
  for (const e of events) {
    if (e.type === "news") news.push(e);
    else used += cachedWeight(e) + 1;
  }
  const weights = new Map(news.map((e) => [e, cachedWeight(e) + 1]));
  if (used + [...weights.values()].reduce((a, b) => a + b, 0) <= budget) return { events, newsLeftOut: 0 };

  const kept = new Set<TimelineEvent>();
  const half = used + (budget - used) / 2;
  for (const e of [...news].sort((a, b) => b.date.localeCompare(a.date) || strongerFirst(a, b))) {
    if (used + weights.get(e)! > half) break;
    used += weights.get(e)!;
    kept.add(e);
  }

  const moves = dailyMoves(prices);
  const byDay = new Map<string, TimelineEvent[]>();
  for (const e of news) {
    if (kept.has(e)) continue;
    const day = byDay.get(e.date);
    if (day) day.push(e);
    else byDay.set(e.date, [e]);
  }
  for (const day of byDay.values()) day.sort(strongerFirst);
  // a day with no bar (a weekend, before listing) after every day with one; newer first on a tie
  const days = [...byDay.keys()].sort((a, b) => (moves.get(b) ?? -1) - (moves.get(a) ?? -1) || b.localeCompare(a));

  rounds: for (let round = 0; ; round++) {
    let left = false;
    for (const d of days) {
      const e = byDay.get(d)![round];
      if (!e) continue;
      left = true;
      if (used + weights.get(e)! > budget) break rounds;
      used += weights.get(e)!;
      kept.add(e);
    }
    if (!left) break;
  }
  return { events: events.filter((e) => e.type !== "news" || kept.has(e)), newsLeftOut: news.length - kept.size };
}

/** How far each session's close moved from the one before, as a fraction: 0.05 for a 5% day. */
function dailyMoves(prices: PricePoint[]): Map<string, number> {
  const moves = new Map<string, number>();
  for (let i = 1; i < prices.length; i++) {
    const before = prices[i - 1].value;
    if (before > 0) moves.set(prices[i].time, Math.abs(prices[i].value / before - 1));
  }
  return moves;
}

/** A stored score (the headline names the company) before none, higher first; then the earlier stored. */
function strongerFirst(a: TimelineEvent, b: TimelineEvent): number {
  return (b.relevance ?? -1) - (a.relevance ?? -1) || a.id.localeCompare(b.id, undefined, { numeric: true });
}
