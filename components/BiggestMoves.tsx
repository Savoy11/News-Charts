"use client";

import { useMemo } from "react";
import { EventType, PricePoint, TimelineEvent } from "@/lib/types";

// Surfaces the largest single-day price changes and pairs each with the nearest *earlier* event,
// so a reader can see at a glance what was happening around a move. This is deliberately framed as
// context, not causation: the pairing is proximity in time, and the copy says so. Cause is the job
// of the AI explanation step (which cites its evidence), never a heuristic like this one.

const BADGE: Record<EventType, { label: string; cls: string }> = {
  earnings: { label: "Earnings", cls: "border-amber-700/50 bg-amber-500/15 text-amber-300" },
  filing: { label: "Filing", cls: "border-sky-700/50 bg-sky-500/15 text-sky-300" },
  regulation: { label: "Regulation", cls: "border-rose-700/50 bg-rose-500/15 text-rose-300" },
  history: { label: "History", cls: "border-violet-700/50 bg-violet-500/15 text-violet-300" },
  press: { label: "Press", cls: "border-orange-700/50 bg-orange-500/15 text-orange-300" },
  news: { label: "News", cls: "border-slate-600/50 bg-slate-500/15 text-slate-300" },
  citation: { label: "Cited", cls: "border-teal-700/50 bg-teal-500/15 text-teal-300" },
  corporate_action: {
    label: "Corporate action",
    cls: "border-fuchsia-700/50 bg-fuchsia-500/15 text-fuchsia-300",
  },
  onchain: { label: "On-chain", cls: "border-lime-700/50 bg-lime-500/15 text-lime-300" },
  annotation: { label: "Your note", cls: "border-cyan-700/50 bg-cyan-500/15 text-cyan-300" },
};

// A move on day D can be sparked by an item dated D itself (intraday news) or a few days before
// (an after-close 8-K/earnings moves the *next* session). Look back this far, no further.
const CATALYST_LOOKBACK_DAYS = 5;
// Which kind wins when two events sit on the same nearest day — the market-moving ones first.
const CATALYST_PRIORITY: Record<EventType, number> = {
  earnings: 5,
  // A dividend ex-date drop is mechanical, so pairing it with the move is the *most* useful
  // thing this panel can say about that day: the move wasn't a reaction to anything.
  corporate_action: 4,
  filing: 4,
  // a protocol event (a halving, an upgrade) is a real, dated cause — above ordinary news
  onchain: 3,
  // a reader's own note is never the explanation for a market move
  annotation: 0,
  regulation: 3,
  history: 2,
  press: 1,
  news: 1,
  citation: 1,
};
const MIN_PCT = 2; // ignore ordinary days — a "biggest move" under 2% isn't worth a callout
const MAX_MOVES = 6;
const SPACING = 5; // trading days between picks, so one volatile week doesn't fill the whole panel

interface Move {
  day: string;
  pct: number;
  event: TimelineEvent | null;
  /** where a click should land the timeline — the catalyst's date if we found one, else the move */
  jumpDate: string;
}

const dayMs = (date: string) => Date.parse(`${date}T00:00:00Z`);

function nearestCatalyst(sorted: TimelineEvent[], day: string): TimelineEvent | null {
  const end = dayMs(day);
  const start = end - CATALYST_LOOKBACK_DAYS * 86_400_000;
  let best: TimelineEvent | null = null;
  let bestScore = -Infinity;
  for (const ev of sorted) {
    const t = dayMs(ev.date);
    if (t > end || t < start) continue;
    // Proximity leads, but the ×2 weight lets a high-priority item (earnings/filing) reported the
    // day before still beat same-day reaction news — the after-close report that moved the next
    // session is the more useful pairing. Same-day, the higher-priority kind wins.
    const daysBefore = (end - t) / 86_400_000;
    const score = -daysBefore * 2 + CATALYST_PRIORITY[ev.type];
    if (score > bestScore) {
      bestScore = score;
      best = ev;
    }
  }
  return best;
}

function computeMoves(prices: PricePoint[], events: TimelineEvent[]): Move[] {
  if (prices.length < 2) return [];

  const daily: { day: string; pct: number }[] = [];
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1].value;
    // A "single-day" move needs two adjacent trading days. Weekends/holidays leave gaps of a few
    // days; anything past a week is missing data, and a jump across it isn't a real daily move.
    const gapDays = (dayMs(prices[i].time) - dayMs(prices[i - 1].time)) / 86_400_000;
    if (prev > 0 && gapDays <= 7) {
      daily.push({ day: prices[i].time, pct: ((prices[i].value - prev) / prev) * 100 });
    }
  }

  const indexOfDay = new Map(prices.map((p, i) => [p.time, i]));
  const picked: { day: string; pct: number }[] = [];
  for (const m of [...daily].sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))) {
    if (Math.abs(m.pct) < MIN_PCT) break; // sorted by magnitude, so nothing below the floor remains
    const idx = indexOfDay.get(m.day)!;
    if (picked.some((p) => Math.abs(indexOfDay.get(p.day)! - idx) < SPACING)) continue;
    picked.push(m);
    if (picked.length >= MAX_MOVES) break;
  }

  const sortedEvents = [...events].sort((a, b) => a.date.localeCompare(b.date));
  return picked
    .sort((a, b) => b.day.localeCompare(a.day)) // newest first for display
    .map((m) => {
      const event = nearestCatalyst(sortedEvents, m.day);
      return { day: m.day, pct: m.pct, event, jumpDate: event?.date ?? m.day };
    });
}

function fmtDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function BiggestMoves({
  prices,
  events,
  onSelectDate,
}: {
  prices: PricePoint[];
  events: TimelineEvent[];
  onSelectDate: (date: string) => void;
}) {
  const moves = useMemo(() => computeMoves(prices, events), [prices, events]);
  if (moves.length === 0) return null;

  return (
    <section className="mt-6">
      <div className="mb-2">
        <h3 className="text-sm font-bold text-slate-200">Biggest moves</h3>
        <p className="text-xs text-slate-500">
          Largest single-day price changes in this window, each with a nearby earlier event for
          context. Proximity isn’t proof of cause.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {moves.map((m) => {
          const badge = m.event ? BADGE[m.event.type] : null;
          return (
            <button
              key={m.day}
              onClick={() => onSelectDate(m.jumpDate)}
              title="Jump to this date on the timeline"
              className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5 text-left transition-colors hover:border-sky-700/60 hover:bg-slate-800/50"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold text-slate-400">{fmtDay(m.day)}</span>
                <span
                  className={`font-mono text-sm font-bold ${
                    m.pct >= 0 ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {m.pct >= 0 ? "+" : ""}
                  {m.pct.toFixed(1)}%
                </span>
              </div>
              {m.event && badge ? (
                <div className="mt-1.5 flex items-start gap-1.5">
                  <span
                    className={`mt-0.5 shrink-0 rounded border px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${badge.cls}`}
                  >
                    {badge.label}
                  </span>
                  <span className="line-clamp-2 text-xs leading-snug text-slate-300">
                    {m.event.title}
                  </span>
                </div>
              ) : (
                <p className="mt-1.5 text-xs text-slate-600">No event within {CATALYST_LOOKBACK_DAYS} days.</p>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
