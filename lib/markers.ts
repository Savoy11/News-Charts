import type { EventType, TimelineEvent } from "./types";

/**
 * The rules for turning events into chart markers, shared by every chart that draws them.
 *
 * These lived inside PriceTimeline until /compare needed the same behaviour. Copying them would
 * have meant two charts that drift: a new event kind added to one glyph table and not the other
 * renders as a marker on one page and nothing at all on the next, which reads as missing data
 * rather than as a bug.
 */

export const MARKER_STYLE = {
  earnings: { color: "#f59e0b", position: "belowBar", shape: "arrowUp", text: "E" },
  filing: { color: "#38bdf8", position: "aboveBar", shape: "circle", text: "" },
  news: { color: "#64748b", position: "aboveBar", shape: "circle", text: "" },
  history: { color: "#a78bfa", position: "aboveBar", shape: "square", text: "" },
  press: { color: "#fb923c", position: "aboveBar", shape: "square", text: "" },
  regulation: { color: "#fb7185", position: "aboveBar", shape: "square", text: "" },
  citation: { color: "#2dd4bf", position: "aboveBar", shape: "circle", text: "" },
  // below the bar like earnings (both are scheduled, dated facts) but a different glyph, so a
  // mechanical change is never mistaken for a reaction to news
  corporate_action: { color: "#e879f9", position: "belowBar", shape: "square", text: "" },
  // above the bar and unmistakable: a protocol event is the headline on a crypto timeline
  onchain: { color: "#a3e635", position: "aboveBar", shape: "arrowDown", text: "" },
  // the reader's own mark, visually apart from anything we sourced
  annotation: { color: "#22d3ee", position: "belowBar", shape: "circle", text: "" },
  // above the bar like the events it sits among, but a square: a vote is a decision taken, not a
  // transaction executed, and the glyph should not imply the second
  governance: { color: "#818cf8", position: "aboveBar", shape: "square", text: "" },
  // red, below the bar, and the only marker carrying a letter besides earnings: an exploit is
  // the thing a reader scanning a crypto timeline is looking for, and it should not need a
  // legend lookup to be found
  exploit: { color: "#ef4444", position: "belowBar", shape: "arrowDown", text: "!" },
} as const;

/** Which kind wins when several share a day — the market-moving ones first. */
export const PRIORITY: Record<EventType, number> = {
  earnings: 3,
  filing: 2,
  history: 2,
  regulation: 2,
  // a reader's own note should never be hidden behind a marker we chose
  annotation: 4,
  onchain: 3,
  corporate_action: 2,
  press: 1,
  news: 1,
  citation: 1,
  // a protocol changing its own rules outranks coverage of it, and sits with the other
  // official, dated acts rather than above them
  governance: 2,
  // the highest-signal event a protocol can have; nothing else on the day outranks it
  exploit: 5,
};

/** Snap an event date to the nearest trading day at or before it (weekends/holidays have no bar). */
export function snapToTradingDay(date: string, tradingDays: string[]): string | null {
  if (tradingDays.length === 0 || date < tradingDays[0]) return null;
  let lo = 0;
  let hi = tradingDays.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (tradingDays[mid] <= date) lo = mid;
    else hi = mid - 1;
  }
  return tradingDays[lo];
}

/**
 * Every event gathered onto the trading day it snaps to.
 *
 * Events falling before the series starts are dropped — there is no bar to hang them on, and
 * drawing them at the left edge would date them wrongly.
 */
export function groupBySnappedDay(
  events: TimelineEvent[],
  tradingDays: string[]
): Map<string, TimelineEvent[]> {
  const byDay = new Map<string, TimelineEvent[]>();
  for (const ev of events) {
    const day = snapToTradingDay(ev.date, tradingDays);
    if (!day) continue;
    const list = byDay.get(day);
    if (list) list.push(ev);
    else byDay.set(day, [ev]);
  }
  return byDay;
}

/** How far, in trading days, a hover reaches for an event day. */
export const HOVER_REACH = 5;

/**
 * A subject's events indexed against its own trading calendar: what happened on each day, and
 * where those days sit among the bars, so "nearest within reach" is measured in bars rather than
 * in calendar dates. Two compared subjects need not share a calendar — different listings keep
 * different holidays — so each gets its own index.
 */
export function buildDayIndex(events: TimelineEvent[], tradingDays: string[]) {
  const byDay = groupBySnappedDay(events, tradingDays);
  const dayIndex = new Map(tradingDays.map((d, i) => [d, i]));
  const eventDays = [...byDay.keys()].sort();
  return { byDay, dayIndex, eventDays, indices: eventDays.map((d) => dayIndex.get(d)!) };
}

export type DayIndex = ReturnType<typeof buildDayIndex>;

/**
 * The event day closest to a hovered bar, with its distance in bars, or null when nothing is
 * within reach. The distance comes back so a caller comparing two subjects can pick between them;
 * working it out afterwards would mean looking a day up on the wrong subject's calendar.
 */
export function nearestEventDay(
  idx: DayIndex,
  day: string
): { day: string; dist: number } | null {
  const at = idx.dayIndex.get(day);
  if (at === undefined || idx.indices.length === 0) return null;
  let lo = 0;
  let hi = idx.indices.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (idx.indices[mid] < at) lo = mid + 1;
    else hi = mid;
  }
  let best = lo;
  // the binary search lands on the first index at or after `at`; its neighbour may be nearer
  if (lo > 0 && Math.abs(idx.indices[lo - 1] - at) < Math.abs(idx.indices[lo] - at)) best = lo - 1;
  const dist = Math.abs(idx.indices[best] - at);
  return dist <= HOVER_REACH ? { day: idx.eventDays[best], dist } : null;
}

/**
 * One marker per trading day, the highest-priority kind deciding the glyph, dated to the day it
 * snapped to and sorted. A day keeps all its events for the hover readout; this is only about
 * which one gets the pixel.
 */
export function markerEventsByDay(
  events: TimelineEvent[],
  tradingDays: string[]
): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  for (const [day, list] of groupBySnappedDay(events, tradingDays)) {
    let best = list[0];
    for (const ev of list) if (PRIORITY[ev.type] > PRIORITY[best.type]) best = ev;
    out.push({ ...best, date: day });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
