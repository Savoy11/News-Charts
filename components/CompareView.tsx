"use client";

import { useMemo } from "react";
import type { CompareSubject } from "@/lib/compare";
import { identity, intersect } from "@/lib/compareEvents";
import type { TimelineEvent } from "@/lib/types";
import PriceOverlay, { A_COLOR, B_COLOR } from "./PriceOverlay";
import PriceTimeline from "./PriceTimeline";

const LIST_CAP = 60;

const ms = (date: string) => Date.parse(`${date}T00:00:00Z`);
const yearOf = (date: string) => date.slice(0, 4);

/** Neutral, belonging to neither side — the shared-event colour. */
const BOTH_COLOR = "#a3a3a3";

/** Short handle for a subject's chip — its ticker if a company, a trimmed title if a topic. */
function handle(s: CompareSubject): string {
  if (s.kind === "company") return s.key;
  return s.label.length > 22 ? `${s.label.slice(0, 21)}…` : s.label;
}

function OverlayStrip({
  a,
  b,
  shared,
}: {
  a: CompareSubject;
  b: CompareSubject;
  shared: Set<string>;
}) {
  const domain = useMemo(() => {
    const all = [...a.events, ...b.events].map((e) => ms(e.date));
    if (all.length === 0) return null;
    const min = Math.min(...all);
    const max = Math.max(...all);
    return { min, max, span: Math.max(1, max - min) };
  }, [a.events, b.events]);

  // One dot per shared happening, on the axis itself. Drawn from A's copy; B's is the same event.
  const both = useMemo(() => {
    const seen = new Set<string>();
    return a.events.filter((ev) => {
      const key = identity(ev);
      if (!shared.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [a.events, shared]);

  if (!domain) return null;

  const xPct = (date: string) => ((ms(date) - domain.min) / domain.span) * 100;

  const Row = ({ subject, color, align }: { subject: CompareSubject; color: string; align: "top" | "bottom" }) => (
    <div className="relative h-9">
      {subject.events.map((ev) => {
        const dot = (
          <span
            className="block h-2.5 w-2.5 rounded-full ring-2 ring-slate-950/70"
            style={{ background: color }}
          />
        );
        const vpos = align === "top" ? { bottom: 4 } : { top: 4 };
        return (
          <span
            key={ev.id}
            className="absolute -translate-x-1/2"
            style={{ left: `${xPct(ev.date)}%`, ...vpos }}
            title={`${ev.date} — ${ev.title}`}
          >
            {ev.url ? (
              <a href={ev.url} target="_blank" rel="noopener noreferrer" className="block">
                {dot}
              </a>
            ) : (
              dot
            )}
          </span>
        );
      })}
    </div>
  );

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
      <Row subject={a} color={A_COLOR} align="top" />
      <div className="relative h-px bg-gradient-to-r from-slate-800 via-slate-600 to-slate-800">
        <span className="absolute left-0 -top-2 text-[10px] font-semibold text-slate-600">
          {yearOf(new Date(domain.min).toISOString())}
        </span>
        <span className="absolute right-0 -top-2 text-[10px] font-semibold text-slate-600">
          {yearOf(new Date(domain.max).toISOString())}
        </span>
        {both.map((ev) => (
          <span
            key={`both-${ev.id}`}
            className="absolute -top-1.5 block h-3 w-3 -translate-x-1/2 rotate-45 border border-slate-950"
            style={{ left: `${xPct(ev.date)}%`, background: BOTH_COLOR }}
            title={`Both · ${ev.date} — ${ev.title}`}
          />
        ))}
      </div>
      <Row subject={b} color={B_COLOR} align="bottom" />
      {both.length > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
          <span className="h-2 w-2 rotate-45" style={{ background: BOTH_COLOR }} />
          {both.length === 1 ? "1 event hit both" : `${both.length} events hit both`} — on the axis
          itself, not on either side
        </p>
      )}
    </div>
  );
}

interface Tagged {
  ev: TimelineEvent;
  side: "a" | "b" | "both";
}

function InterleavedList({
  a,
  b,
  shared,
}: {
  a: CompareSubject;
  b: CompareSubject;
  shared: Set<string>;
}) {
  const merged = useMemo<Tagged[]>(() => {
    // A shared happening is one row, not two. Listing it twice would pad the count and read as
    // two things going the same way, which is the opposite of what it shows.
    const seenShared = new Set<string>();
    const rows: Tagged[] = [];
    for (const [side, events] of [
      ["a", a.events],
      ["b", b.events],
    ] as const) {
      for (const ev of events) {
        const key = identity(ev);
        if (shared.has(key)) {
          if (seenShared.has(key)) continue;
          seenShared.add(key);
          rows.push({ ev, side: "both" });
        } else {
          rows.push({ ev, side });
        }
      }
    }
    rows.sort((x, y) => y.ev.date.localeCompare(x.ev.date));
    return rows;
  }, [a.events, b.events, shared]);

  const shown = merged.slice(0, LIST_CAP);
  const chip = {
    a: { color: A_COLOR, label: handle(a) },
    b: { color: B_COLOR, label: handle(b) },
    both: { color: BOTH_COLOR, label: "Both" },
  };

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-bold text-slate-200">Combined timeline</h3>
        <span className="text-xs text-slate-500">
          {shown.length < merged.length ? `newest ${shown.length} of ${merged.length}` : `${merged.length} events`}
        </span>
      </div>
      <ol className="space-y-1.5">
        {shown.map(({ ev, side }) => {
          const c = chip[side];
          const isBoth = side === "both";
          const row = (
            <div
              className={`flex items-start gap-2 rounded-lg border bg-slate-900/60 p-2.5 transition-colors hover:border-slate-700 ${
                isBoth ? "border-slate-600" : "border-slate-800"
              }`}
            >
              <span
                className="mt-0.5 flex shrink-0 items-center gap-1 rounded border border-slate-700 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300"
                title={
                  isBoth
                    ? `${a.label} and ${b.label} — the same event on both`
                    : side === "a"
                      ? a.label
                      : b.label
                }
              >
                {isBoth ? (
                  <>
                    <span className="h-2 w-2 rounded-full" style={{ background: A_COLOR }} />
                    <span className="-ml-1.5 h-2 w-2 rounded-full" style={{ background: B_COLOR }} />
                  </>
                ) : (
                  <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                )}
                {c.label}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-200">{ev.title}</span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  {ev.date} · {ev.source}
                  {ev.url ? " ↗" : ""}
                </span>
              </span>
            </div>
          );
          return (
            <li key={`${side}-${ev.id}`}>
              {ev.url ? (
                <a href={ev.url} target="_blank" rel="noopener noreferrer" className="block">
                  {row}
                </a>
              ) : (
                row
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default function CompareView({ a, b }: { a: CompareSubject; b: CompareSubject }) {
  const bothCompanies = a.prices.length > 0 && b.prices.length > 0;
  const shared = useMemo(() => intersect(a.events, b.events), [a.events, b.events]);

  /**
   * One side has a price series, the other has the events — "Donald Trump presidency against
   * Ford stock". This is the compose the product was missing: the company supplies the axis,
   * the topic supplies what happened, and neither is a new page type.
   *
   * Only the *other* subject's events are plotted, deliberately. PriceTimeline colours markers by
   * event kind, not by which subject they came from, so merging both sides' events would produce a
   * chart where a Ford filing and a Trump speech are indistinguishable — the reader could not
   * tell which claim they were looking at. The priced subject's own timeline is one click away
   * on its own page.
   *
   * The two-company overlay above does plot both sides, because it can: there each subject has its
   * own line to hang markers off, and colour is free to mean *whose* rather than *what kind*.
   */
  const priced = !bothCompanies ? (a.prices.length > 0 ? a : b.prices.length > 0 ? b : null) : null;
  const eventful = priced ? (priced === a ? b : a) : null;
  const composable = priced !== null && eventful !== null && eventful.events.length > 0;

  return (
    <div className="space-y-6">
      {bothCompanies ? (
        <PriceOverlay
          a={{ label: a.label, prices: a.prices, events: a.events, color: A_COLOR }}
          b={{ label: b.label, prices: b.prices, events: b.events, color: B_COLOR }}
        />
      ) : composable ? (
        <section>
          <div className="mb-2">
            <h3 className="text-sm font-bold text-slate-200">
              {eventful!.label} events against {priced!.label}
            </h3>
            <p className="text-xs text-slate-500">
              {eventful!.label} supplies the events; {priced!.label} supplies the price. Lining
              two subjects up in time shows coincidence, not cause — the same rule as Biggest
              moves.
            </p>
          </div>
          <PriceTimeline prices={priced!.prices} events={eventful!.events} />
        </section>
      ) : (
        <p className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-xs text-slate-500">
          {priced
            ? `${eventful?.label ?? "The other subject"} has no events to plot yet, so it’s the timelines below that line up.`
            : "Neither side has a price series, so it’s the event timelines below that line up."}
        </p>
      )}

      <OverlayStrip a={a} b={b} shared={shared} />
      <InterleavedList a={a} b={b} shared={shared} />
    </div>
  );
}
