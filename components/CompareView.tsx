"use client";

import { useMemo } from "react";
import type { CompareSubject } from "@/lib/compare";
import type { TimelineEvent } from "@/lib/types";
import PriceOverlay, { A_COLOR, B_COLOR } from "./PriceOverlay";

const LIST_CAP = 60;

const ms = (date: string) => Date.parse(`${date}T00:00:00Z`);
const yearOf = (date: string) => date.slice(0, 4);

/** Short handle for a subject's chip — its ticker if a company, a trimmed title if a topic. */
function handle(s: CompareSubject): string {
  if (s.kind === "company") return s.key;
  return s.label.length > 22 ? `${s.label.slice(0, 21)}…` : s.label;
}

function OverlayStrip({ a, b }: { a: CompareSubject; b: CompareSubject }) {
  const domain = useMemo(() => {
    const all = [...a.events, ...b.events].map((e) => ms(e.date));
    if (all.length === 0) return null;
    const min = Math.min(...all);
    const max = Math.max(...all);
    return { min, max, span: Math.max(1, max - min) };
  }, [a.events, b.events]);

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
      </div>
      <Row subject={b} color={B_COLOR} align="bottom" />
    </div>
  );
}

interface Tagged {
  ev: TimelineEvent;
  side: "a" | "b";
}

function InterleavedList({ a, b }: { a: CompareSubject; b: CompareSubject }) {
  const merged = useMemo<Tagged[]>(() => {
    const rows: Tagged[] = [
      ...a.events.map((ev) => ({ ev, side: "a" as const })),
      ...b.events.map((ev) => ({ ev, side: "b" as const })),
    ];
    rows.sort((x, y) => y.ev.date.localeCompare(x.ev.date));
    return rows;
  }, [a.events, b.events]);

  const shown = merged.slice(0, LIST_CAP);
  const chip = { a: { color: A_COLOR, label: handle(a) }, b: { color: B_COLOR, label: handle(b) } };

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
          const row = (
            <div className="flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2.5 transition-colors hover:border-slate-700">
              <span
                className="mt-0.5 flex shrink-0 items-center gap-1 rounded border border-slate-700 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300"
                title={side === "a" ? a.label : b.label}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
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

  return (
    <div className="space-y-6">
      {bothCompanies ? (
        <PriceOverlay
          a={{ label: a.label, prices: a.prices, color: A_COLOR }}
          b={{ label: b.label, prices: b.prices, color: B_COLOR }}
        />
      ) : (
        <p className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-xs text-slate-500">
          Price overlay is shown when both sides are public companies. Here it’s the event
          timelines below that line up.
        </p>
      )}

      <OverlayStrip a={a} b={b} />
      <InterleavedList a={a} b={b} />
    </div>
  );
}
