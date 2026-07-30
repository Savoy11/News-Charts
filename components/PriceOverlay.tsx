"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  createSeriesMarkers,
  LineSeries,
  ColorType,
  type ISeriesApi,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";
import { PricePoint, TimelineEvent } from "@/lib/types";
import {
  MARKER_STYLE,
  buildDayIndex,
  markerEventsByDay,
  nearestEventDay,
} from "@/lib/markers";

export const A_COLOR = "#38bdf8"; // sky — subject A
export const B_COLOR = "#f59e0b"; // amber — subject B

interface Series {
  label: string;
  prices: PricePoint[];
  events: TimelineEvent[];
  color: string;
}

/**
 * Rebase both series to 100 at their first *shared* trading day, so the lines answer "$100 in
 * each on the same day — where are they now?" Comparing raw prices would just show that one stock
 * is pricier, not which performed better. Returns null if the two never overlap in time.
 */
function normalize(a: PricePoint[], b: PricePoint[]) {
  if (a.length === 0 || b.length === 0) return null;
  const start = a[0].time > b[0].time ? a[0].time : b[0].time;
  const end = a[a.length - 1].time < b[b.length - 1].time ? a[a.length - 1].time : b[b.length - 1].time;
  if (start > end) return null;

  const clip = (s: PricePoint[]) => {
    const win = s.filter((p) => p.time >= start && p.time <= end);
    if (win.length === 0 || win[0].value === 0) return null;
    const base = win[0].value;
    return win.map((p) => ({ time: p.time as Time, value: (p.value / base) * 100 }));
  };
  const an = clip(a);
  const bn = clip(b);
  if (!an || !bn) return null;
  return { an, bn, start, end };
}

/**
 * Which side a marker belongs to is the whole question on this chart, so side decides where the
 * glyph sits: A's events ride above the line, B's below. Kind still decides the shape, so a
 * filing looks like a filing here and on the subject's own page.
 *
 * This overrides the above/below convention `MARKER_STYLE` uses elsewhere, and deliberately. On a
 * single-subject chart that convention separates scheduled facts from reactions; here two lines
 * cross each other, and a marker floating between them that could belong to either subject tells
 * the reader nothing at all.
 */
const SIDE_POSITION = { a: "aboveBar", b: "belowBar" } as const;

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (day: string) =>
  `${MONTHS_SHORT[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}, ${day.slice(0, 4)}`;

interface Hovered {
  x: number;
  side: "a" | "b";
  day: string;
  events: TimelineEvent[];
}

export default function PriceOverlay({ a, b }: { a: Series; b: Series }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const norm = useMemo(() => normalize(a.prices, b.prices), [a.prices, b.prices]);
  const [hovered, setHovered] = useState<Hovered | null>(null);

  // Snap against the *clipped* series, not the raw one: an event before the shared window has no
  // bar to sit on here even though it does on the subject's own page.
  const daysA = useMemo(() => (norm ? norm.an.map((p) => p.time as string) : []), [norm]);
  const daysB = useMemo(() => (norm ? norm.bn.map((p) => p.time as string) : []), [norm]);
  const indexA = useMemo(() => buildDayIndex(a.events, daysA), [a.events, daysA]);
  const indexB = useMemo(() => buildDayIndex(b.events, daysB), [b.events, daysB]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !norm) return;

    const chart = createChart(el, {
      height: 360,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#94a3b8",
      },
      grid: { vertLines: { color: "#1e293b" }, horzLines: { color: "#1e293b" } },
      timeScale: { borderColor: "#334155" },
      rightPriceScale: { borderColor: "#334155" },
      crosshair: { mode: 0 },
    });

    const sa = chart.addSeries(LineSeries, { color: a.color, lineWidth: 2 });
    sa.setData(norm.an);
    const sb = chart.addSeries(LineSeries, { color: b.color, lineWidth: 2 });
    sb.setData(norm.bn);

    // Markers hang off each subject's own line, in that subject's colour, so a Ford filing and a
    // GM recall are never confusable — which is the thing the shared strip below cannot do once
    // two dense timelines land on the same axis.
    const attach = (
      series: ISeriesApi<"Line">,
      side: "a" | "b",
      events: TimelineEvent[],
      color: string,
      days: string[]
    ) => {
      const markers: SeriesMarker<Time>[] = markerEventsByDay(events, days).map((ev) => ({
        time: ev.date as Time,
        position: SIDE_POSITION[side],
        color,
        shape: MARKER_STYLE[ev.type].shape,
        text: "",
        size: 1,
      }));
      createSeriesMarkers(series, markers);
    };
    attach(sa, "a", a.events, a.color, daysA);
    attach(sb, "b", b.events, b.color, daysB);

    // Sweeping the chart names what the nearest marker is. Without this the markers are
    // decoration: a dot you cannot identify tells a reader something happened and refuses to say
    // what, which is worse than not drawing it.
    chart.subscribeCrosshairMove((param) => {
      const day = param.time as string | undefined;
      if (!day || param.point === undefined) {
        setHovered(null);
        return;
      }
      const hitA = nearestEventDay(indexA, day);
      const hitB = nearestEventDay(indexB, day);
      if (!hitA && !hitB) {
        setHovered(null);
        return;
      }
      // whichever side's event is closer to the cursor wins the readout; ties go to A so the
      // box does not flicker between sides as the cursor moves along a shared date
      const useA = !hitB || (hitA !== null && hitA.dist <= hitB.dist);
      const hit = (useA ? hitA : hitB)!;
      const idx = useA ? indexA : indexB;
      setHovered({
        x: param.point.x,
        side: useA ? "a" : "b",
        day: hit.day,
        events: idx.byDay.get(hit.day) ?? [],
      });
    });

    chart.timeScale().fitContent();
    const resize = () => chart.applyOptions({ width: el.clientWidth });
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [norm, a.color, b.color, indexA, indexB, daysA, daysB]);

  if (!norm) {
    return (
      <p className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-500">
        Their price histories don’t overlap, so there’s no shared window to chart.
      </p>
    );
  }

  const aRet = norm.an[norm.an.length - 1].value - 100;
  const bRet = norm.bn[norm.bn.length - 1].value - 100;
  const fmt = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
  const tone = (n: number) => (n >= 0 ? "text-emerald-400" : "text-red-400");

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="h-2 w-3 rounded-sm" style={{ background: a.color }} />
            {a.label} <span className={`font-mono font-bold ${tone(aRet)}`}>{fmt(aRet)}</span>
          </span>
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="h-2 w-3 rounded-sm" style={{ background: b.color }} />
            {b.label} <span className={`font-mono font-bold ${tone(bRet)}`}>{fmt(bRet)}</span>
          </span>
        </div>
        <span className="text-[11px] text-slate-500">
          growth of 100 · {norm.start} → {norm.end} ·{" "}
          <span className="text-slate-400">
            spread {fmt(aRet - bRet)}
          </span>
        </span>
      </div>
      <div ref={containerRef} className="relative w-full">
        {hovered && hovered.events.length > 0 && (
          <div
            className="pointer-events-none absolute top-2 z-10 w-64 max-w-[80%] rounded-lg border bg-slate-950/95 p-2 shadow-xl"
            style={{
              borderColor: hovered.side === "a" ? a.color : b.color,
              // clamped so the box never runs off either edge on a narrow screen
              left: `min(max(0px, ${hovered.x - 128}px), calc(100% - 16rem))`,
            }}
          >
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: hovered.side === "a" ? a.color : b.color }}
              />
              {hovered.side === "a" ? a.label : b.label} · {shortDate(hovered.day)}
            </div>
            <ul className="space-y-1">
              {hovered.events.slice(0, 3).map((ev) => (
                <li key={ev.id} className="text-xs leading-snug text-slate-200">
                  {ev.title}
                  <span className="ml-1 text-slate-500">{ev.source}</span>
                </li>
              ))}
            </ul>
            {hovered.events.length > 3 && (
              <p className="mt-1 text-[10px] text-slate-500">
                +{hovered.events.length - 3} more — see the combined timeline below
              </p>
            )}
          </div>
        )}
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        Markers are each subject’s own events — {a.label} above its line, {b.label} below — shaped
        by kind. Hover to read them. Lining two subjects up in time shows coincidence, not cause.
      </p>
    </div>
  );
}
