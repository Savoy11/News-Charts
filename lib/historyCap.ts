import type { TimelineEvent } from "./types";

/** The topic timeline's cap on Wikipedia entries until a reader sets their own (`DEFAULT_PREFS`, lib/prefs.ts). */
export const DEFAULT_MAX_HISTORY = 60;

/**
 * Cap Wikipedia "history" entries to `max`, sampling evenly across time so the timeline keeps its
 * full range (oldest and newest survive) instead of collapsing to one era. Non-history events and
 * everything else are untouched. `max <= 0` means no cap.
 *
 * In lib rather than the topic explorer so the topic page's server code caps alike, to count what a
 * focused link's preview says the page shows (NC-003).
 */
export function capHistory(events: TimelineEvent[], max: number): TimelineEvent[] {
  if (max <= 0) return events;
  const history = events.filter((e) => e.type === "history");
  if (history.length <= max) return events;
  const others = events.filter((e) => e.type !== "history");
  const sorted = [...history].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const denom = Math.max(1, max - 1);
  const seen = new Set<string>();
  const kept: TimelineEvent[] = [];
  for (let i = 0; i < max; i++) {
    const ev = sorted[Math.round((i * (sorted.length - 1)) / denom)];
    if (!seen.has(ev.id)) {
      seen.add(ev.id);
      kept.push(ev);
    }
  }
  return [...others, ...kept];
}
