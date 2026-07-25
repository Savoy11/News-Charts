"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  createChart,
  LineSeries,
  ColorType,
  type Time,
} from "lightweight-charts";
import { PricePoint } from "@/lib/types";

export const A_COLOR = "#38bdf8"; // sky — subject A
export const B_COLOR = "#f59e0b"; // amber — subject B

interface Series {
  label: string;
  prices: PricePoint[];
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

export default function PriceOverlay({ a, b }: { a: Series; b: Series }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const norm = useMemo(() => normalize(a.prices, b.prices), [a.prices, b.prices]);

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

    chart.timeScale().fitContent();
    const resize = () => chart.applyOptions({ width: el.clientWidth });
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [norm, a.color, b.color]);

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
      <div ref={containerRef} className="w-full" />
    </div>
  );
}
