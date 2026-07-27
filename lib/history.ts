import { TimelineEvent } from "./types";

/**
 * A company's history doesn't reach back centuries. When Wikipedia prose misreads a stock
 * ticker ("SEHK: 1060") or a domain ("1688.com") as a year, the event lands in the Middle
 * Ages and drags the timeline's whole range with it. The parser (lib/wiki.ts) now masks
 * those, but rows persisted before the fix are still in the database, and re-ingest never
 * deletes — so this guards the read path too.
 *
 * It trims the leading run of history/citation events that a >MAX_GAP-year jump separates
 * from the main body of the timeline: a genuine company history is roughly continuous, so a
 * lone event 600 years before everything else is an artifact, not a founding date. Only
 * history/citation events are considered — filings, earnings and news are always modern and
 * carry their own exact dates. Topic pages don't use this (ancient origins there are real).
 */
const MAX_GAP = 120;

export function dropCompanyPrehistory(events: TimelineEvent[]): TimelineEvent[] {
  const years = events
    .filter((e) => e.type === "history" || e.type === "citation")
    .map((e) => Number(e.date.slice(0, 4)))
    .filter((y) => Number.isFinite(y) && y > 0)
    .sort((a, b) => a - b);
  if (years.length < 2) return events;

  // walk up from the oldest; each >MAX_GAP jump pushes the floor forward, until the events
  // start running close together (the real timeline). Everything before that floor is dropped.
  let floor = years[0];
  for (let i = 1; i < years.length; i++) {
    if (years[i] - years[i - 1] > MAX_GAP) floor = years[i];
    else break;
  }
  if (floor === years[0]) return events; // no leading gap — nothing to trim

  return events.filter((e) => {
    if (e.type !== "history" && e.type !== "citation") return true;
    return Number(e.date.slice(0, 4)) >= floor;
  });
}
