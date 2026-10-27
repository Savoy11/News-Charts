import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * The rules that turn events into chart markers.
 *
 *   npm run check:markers
 *
 * These moved out of PriceTimeline when /compare needed them too, and the reason to test them is
 * that every one of their edge cases is invisible on screen: a marker snapped to the wrong bar, a
 * busy day showing the least interesting of its events, an event quietly dropped for falling
 * before the series starts. All three look exactly like a chart that is working.
 */
import {
  HOVER_REACH,
  buildDayIndex,
  groupBySnappedDay,
  markerEventsByDay,
  nearestEventDay,
  snapToTradingDay,
} from "../lib/markers";
import type { EventType, TimelineEvent } from "../lib/types";
import { nearestCatalyst } from "../components/BiggestMoves";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

let seq = 0;
const ev = (date: string, type: EventType, title = "x"): TimelineEvent => ({
  id: `e${seq++}`,
  date,
  type,
  title,
  source: "test",
});

// A week of bars with the weekend missing, which is what a real series looks like.
const DAYS = [
  "2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05",
  "2024-01-08", "2024-01-09", "2024-01-10", "2024-01-11", "2024-01-12",
  "2024-01-16", // the 15th is a holiday
];

console.log("\nSnapping to a trading day");
check("a trading day is its own bar", snapToTradingDay("2024-01-04", DAYS) === "2024-01-04");
// Saturday news is read on Monday; snapping forward would date it before it happened.
check("a Saturday snaps back to Friday", snapToTradingDay("2024-01-06", DAYS) === "2024-01-05", String(snapToTradingDay("2024-01-06", DAYS)));
check("a Sunday snaps back to Friday", snapToTradingDay("2024-01-07", DAYS) === "2024-01-05");
check("a holiday snaps back over it", snapToTradingDay("2024-01-15", DAYS) === "2024-01-12");
check("a date after the last bar snaps to the last bar", snapToTradingDay("2024-06-01", DAYS) === "2024-01-16");
// Nothing to hang it on, and drawing it at the left edge would date it wrongly.
check("a date before the first bar is dropped", snapToTradingDay("2023-12-29", DAYS) === null);
check("an empty series drops everything", snapToTradingDay("2024-01-04", []) === null);

console.log("\nGathering events onto their bar");
const week = [
  ev("2024-01-04", "news"),
  ev("2024-01-06", "news"), // Saturday → Friday the 5th
  ev("2024-01-07", "filing"), // Sunday → Friday the 5th
  ev("2023-11-01", "news"), // before the window
];
const grouped = groupBySnappedDay(week, DAYS);
check("weekend events land on the same Friday", grouped.get("2024-01-05")?.length === 2, `${grouped.get("2024-01-05")?.length}`);
check("a weekday event keeps its own day", grouped.get("2024-01-04")?.length === 1);
check("pre-window events are not silently moved", grouped.size === 2, `${grouped.size} days`);

console.log("\nWhich event gets the pixel");
const busy = [ev("2024-01-09", "news"), ev("2024-01-09", "earnings"), ev("2024-01-09", "citation")];
const busyMarkers = markerEventsByDay(busy, DAYS);
check("a busy day draws one marker", busyMarkers.length === 1, `${busyMarkers.length}`);
check("the market-moving kind wins it", busyMarkers[0]?.type === "earnings", busyMarkers[0]?.type);
// A reader's own note outranks anything we chose for them — it is the one marker they placed.
const mine = markerEventsByDay([ev("2024-01-09", "earnings"), ev("2024-01-09", "annotation")], DAYS);
check("a reader's own note outranks ours", mine[0]?.type === "annotation", mine[0]?.type);
const spread = markerEventsByDay([ev("2024-01-10", "news"), ev("2024-01-03", "news")], DAYS);
check("markers come back in date order", spread.map((m) => m.date).join(",") === "2024-01-03,2024-01-10", spread.map((m) => m.date).join(","));
check("a marker is dated to the bar it snapped to", markerEventsByDay([ev("2024-01-06", "news")], DAYS)[0]?.date === "2024-01-05");

console.log("\nFinding the nearest event to a hovered bar");
const idx = buildDayIndex([ev("2024-01-09", "news")], DAYS);
check("hovering the event's own bar finds it", nearestEventDay(idx, "2024-01-09")?.dist === 0);
check("hovering one bar away still finds it", nearestEventDay(idx, "2024-01-10")?.day === "2024-01-09");
check("distance is counted in bars, not dates", nearestEventDay(idx, "2024-01-16")?.dist === 4, String(nearestEventDay(idx, "2024-01-16")?.dist));
// Two bars over the holiday weekend is four calendar days but two bars — the reach has to agree
// with what the reader sees, which is bars.
check("reach is honoured", nearestEventDay(buildDayIndex([ev("2024-01-02", "news")], DAYS), "2024-01-16") === null);
check("nothing charted means nothing found", nearestEventDay(buildDayIndex([], DAYS), "2024-01-09") === null);
check("a bar off the calendar finds nothing", nearestEventDay(idx, "2025-05-05") === null);

// The tie the compare overlay depends on: with events either side, the nearer one must win, or
// the readout names the wrong subject.
const twoSided = buildDayIndex([ev("2024-01-03", "news"), ev("2024-01-11", "news")], DAYS);
check("the nearer of two events wins", nearestEventDay(twoSided, "2024-01-10")?.day === "2024-01-11", nearestEventDay(twoSided, "2024-01-10")?.day);
check("and from the other side too", nearestEventDay(twoSided, "2024-01-04")?.day === "2024-01-03", nearestEventDay(twoSided, "2024-01-04")?.day);
check("reach constant is the documented one", HOVER_REACH === 5, String(HOVER_REACH));

// Biggest moves never pairs a move with something published after that session closed (batch 68,
// the 2026-10-26 proposal 6). Apple's results 8-K of 2026-07-30 was accepted at 20:30:28 UTC, 4:30
// pm ET: by date alone it took the caption of that day's move, which happened before it came out.
console.log("\nA move is never paired with what came out after its close");
{
  const release: TimelineEvent = { ...ev("2026-07-30", "earnings"), id: "aapl-8k", title: "Apple Inc.: Earnings announcement (8-K)", occurredAt: "2026-07-30T20:30:28Z" };
  const sameDayNews: TimelineEvent = { ...ev("2026-07-30", "news"), id: "news", title: "Apple shares slip ahead of results" };
  const sorted = [sameDayNews, release];
  check("the release day's move is not captioned with that evening's release", nearestCatalyst(sorted, "2026-07-30")?.id === "news",
    nearestCatalyst(sorted, "2026-07-30")?.id);
  check("  …the next session's is", nearestCatalyst(sorted, "2026-07-31")?.id === "aapl-8k", nearestCatalyst(sorted, "2026-07-31")?.id);
  check("  …and with nothing else that day, the release day's move has no caption from it",
    nearestCatalyst([release], "2026-07-30") === null);
  // Ford's 10-Q dated 2026-07-29, accepted the evening before (7:29 pm ET): out before the 29th's open
  const lateTenQ: TimelineEvent = { ...ev("2026-07-29", "earnings"), id: "f-10q", title: "Ford Motor Co: Quarterly report (10-Q)", occurredAt: "2026-07-28T23:29:21Z" };
  check("a filing dated the day after it came out still captions that day's move", nearestCatalyst([lateTenQ], "2026-07-29")?.id === "f-10q");
  check("one released before the open, or during trading, captions its own day",
    nearestCatalyst([{ ...release, occurredAt: "2026-07-30T12:00:00Z" }], "2026-07-30")?.id === "aapl-8k" &&
      nearestCatalyst([{ ...release, occurredAt: "2026-07-30T19:59:00Z" }], "2026-07-30")?.id === "aapl-8k");
  check("an event with no time is judged by its date, as before", nearestCatalyst([{ ...release, occurredAt: undefined }], "2026-07-30")?.id === "aapl-8k");
}

console.log(`\n${pass}/${pass + fail} checks passed`);
if (fail > 0) process.exit(1);
