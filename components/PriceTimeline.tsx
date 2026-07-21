"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  createSeriesMarkers,
  AreaSeries,
  ColorType,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";
import { PricePoint, TimelineEvent } from "@/lib/types";

const MARKER_STYLE = {
  earnings: { color: "#f59e0b", position: "belowBar", shape: "arrowUp", text: "E" },
  filing: { color: "#38bdf8", position: "aboveBar", shape: "circle", text: "" },
  news: { color: "#64748b", position: "aboveBar", shape: "circle", text: "" },
  history: { color: "#a78bfa", position: "aboveBar", shape: "square", text: "" },
  press: { color: "#fb923c", position: "aboveBar", shape: "square", text: "" },
  regulation: { color: "#fb7185", position: "aboveBar", shape: "square", text: "" },
} as const;

interface Props {
  prices: PricePoint[];
  events: TimelineEvent[];
  onSelectDate?: (date: string) => void;
}

/** Snap an event date to the nearest trading day at or before it (weekends/holidays have no bar). */
function snapToTradingDay(date: string, tradingDays: string[]): string | null {
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

export default function PriceTimeline({ prices, events, onSelectDate }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelectDate);
  onSelectRef.current = onSelectDate;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || prices.length === 0) return;

    const chart = createChart(el, {
      height: 420,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#94a3b8",
      },
      grid: {
        vertLines: { color: "#1e293b" },
        horzLines: { color: "#1e293b" },
      },
      timeScale: { borderColor: "#334155" },
      rightPriceScale: { borderColor: "#334155" },
      crosshair: { mode: 0 },
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: "#38bdf8",
      topColor: "rgba(56, 189, 248, 0.25)",
      bottomColor: "rgba(56, 189, 248, 0.02)",
      lineWidth: 2,
    });
    series.setData(prices.map((p) => ({ time: p.time as Time, value: p.value })));

    const tradingDays = prices.map((p) => p.time);
    // one marker per (day, type); earnings win over filings win over news
    const priority: Record<string, number> = {
      earnings: 3,
      filing: 2,
      history: 2,
      regulation: 2,
      press: 1,
      news: 1,
    };
    const byDay = new Map<string, TimelineEvent>();
    for (const ev of events) {
      const day = snapToTradingDay(ev.date, tradingDays);
      if (!day) continue;
      const existing = byDay.get(day);
      if (!existing || priority[ev.type] > priority[existing.type]) {
        byDay.set(day, { ...ev, date: day });
      }
    }
    const markers: SeriesMarker<Time>[] = [...byDay.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((ev) => {
        const s = MARKER_STYLE[ev.type];
        return {
          time: ev.date as Time,
          position: s.position,
          color: s.color,
          shape: s.shape,
          text: s.text,
          size: ev.type === "earnings" ? 1.5 : 1,
        };
      });
    createSeriesMarkers(series, markers);

    chart.subscribeClick((param) => {
      if (param.time && onSelectRef.current) {
        onSelectRef.current(String(param.time));
      }
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
  }, [prices, events]);

  return (
    <div>
      <div ref={containerRef} className="w-full" />
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-400">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500" />Earnings</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-400" />SEC filing</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-slate-500" />News</span>
        <span className="text-slate-500">Click a point on the chart to jump to that date&apos;s events.</span>
      </div>
    </div>
  );
}
