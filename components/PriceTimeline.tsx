"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  createSeriesMarkers,
  AreaSeries,
  ColorType,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";
import { EventType, PricePoint, TimelineEvent } from "@/lib/types";

const MARKER_STYLE = {
  earnings: { color: "#f59e0b", position: "belowBar", shape: "arrowUp", text: "E" },
  filing: { color: "#38bdf8", position: "aboveBar", shape: "circle", text: "" },
  news: { color: "#64748b", position: "aboveBar", shape: "circle", text: "" },
  history: { color: "#a78bfa", position: "aboveBar", shape: "square", text: "" },
  press: { color: "#fb923c", position: "aboveBar", shape: "square", text: "" },
  regulation: { color: "#fb7185", position: "aboveBar", shape: "square", text: "" },
  citation: { color: "#2dd4bf", position: "aboveBar", shape: "circle", text: "" },
} as const;

// which kind wins when several share a day — the market-moving ones first
const PRIORITY: Record<EventType, number> = {
  earnings: 3,
  filing: 2,
  history: 2,
  regulation: 2,
  press: 1,
  news: 1,
  citation: 1,
};

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

/** One chip on the lane: every event that snapped near this pixel of the chart. */
interface LaneCluster {
  x: number;
  day: string;
  events: TimelineEvent[];
}

// chips closer than this merge into one — matches the chip's rendered footprint
const CLUSTER_PX = 96;

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function shortDate(day: string): string {
  return `${MONTHS_SHORT[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}, ${day.slice(0, 4)}`;
}

function dominantType(evs: TimelineEvent[]): EventType {
  return evs.reduce((best, e) => (PRIORITY[e.type] > PRIORITY[best] ? e.type : best), evs[0].type);
}

export default function PriceTimeline({ prices, events, onSelectDate }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelectDate);
  onSelectRef.current = onSelectDate;

  // the horizontal event lane under the chart, re-laid-out on every pan/zoom
  const [lane, setLane] = useState<LaneCluster[]>([]);
  const [laneWidth, setLaneWidth] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    // one marker per day; the highest-priority kind decides the glyph
    const markerByDay = new Map<string, TimelineEvent>();
    // the lane keeps every event, grouped by snapped day
    const laneByDay = new Map<string, TimelineEvent[]>();
    for (const ev of events) {
      const day = snapToTradingDay(ev.date, tradingDays);
      if (!day) continue;
      const existing = markerByDay.get(day);
      if (!existing || PRIORITY[ev.type] > PRIORITY[existing.type]) {
        markerByDay.set(day, { ...ev, date: day });
      }
      const list = laneByDay.get(day);
      if (list) list.push(ev);
      else laneByDay.set(day, [ev]);
    }
    const markers: SeriesMarker<Time>[] = [...markerByDay.values()]
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

    /**
     * Project each event day onto the chart's current x-axis and cluster what lands
     * close together. Runs on every visible-range change, so dragging or zooming the
     * chart moves the lane with it — the two always show the same window of time.
     */
    const layoutLane = () => {
      const ts = chart.timeScale();
      const pts: { x: number; day: string; events: TimelineEvent[] }[] = [];
      for (const [day, evs] of laneByDay) {
        const x = ts.timeToCoordinate(day as Time);
        if (x === null) continue; // outside the visible window
        pts.push({ x, day, events: evs });
      }
      pts.sort((a, b) => a.x - b.x);
      const clusters: LaneCluster[] = [];
      for (const p of pts) {
        const last = clusters[clusters.length - 1];
        if (last && p.x - last.x < CLUSTER_PX) {
          last.events.push(...p.events);
        } else {
          clusters.push({ x: p.x, day: p.day, events: [...p.events] });
        }
      }
      setLane(clusters);
      setLaneWidth(el.clientWidth);
      setOpen(null); // the chip under the pointer just moved — a stale popover would lie
    };

    chart.subscribeClick((param) => {
      if (param.time && onSelectRef.current) {
        onSelectRef.current(String(param.time));
      }
    });

    chart.timeScale().fitContent();
    chart.timeScale().subscribeVisibleTimeRangeChange(layoutLane);

    const resize = () => {
      chart.applyOptions({ width: el.clientWidth });
      layoutLane();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el);

    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [prices, events]);

  function scheduleClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(null), 250);
  }
  function cancelClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }

  const clampX = (x: number) => Math.min(Math.max(x, 56), Math.max(laneWidth - 56, 56));

  return (
    <div>
      <div ref={containerRef} className="w-full" />

      {lane.length > 0 && (
        <div className="relative mt-1 h-[96px] rounded-md border border-slate-800/60 bg-slate-950/40">
          <span className="absolute left-2 top-1 text-[9px] font-bold uppercase tracking-widest text-slate-600">
            Events · follows the chart
          </span>
          {lane.map((c, i) => {
            const type = dominantType(c.events);
            const single = c.events.length === 1;
            const x = clampX(c.x);
            return (
              <div key={`${c.day}-${i}`}>
                <button
                  data-lane-chip
                  onMouseEnter={() => {
                    cancelClose();
                    setOpen(i);
                  }}
                  onMouseLeave={scheduleClose}
                  onClick={() => onSelectDate?.(c.day)}
                  style={{ left: x, top: i % 2 === 0 ? 18 : 56 }}
                  className="absolute w-[150px] -translate-x-1/2 rounded-md border border-slate-800 bg-slate-900/90 px-2 py-1 text-left transition-colors hover:border-sky-600/70"
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: MARKER_STYLE[type].color }}
                    />
                    <span className="truncate text-[10px] font-semibold text-slate-300">
                      {single ? c.events[0].title : `${c.events.length} events`}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate pl-3.5 text-[9px] text-slate-500">
                    {shortDate(c.day)}
                    {!single && ` — ${c.events[0].title}`}
                  </span>
                </button>

                {open === i && (
                  <div
                    onMouseEnter={cancelClose}
                    onMouseLeave={scheduleClose}
                    style={{ left: Math.min(Math.max(x - 140, 8), Math.max(laneWidth - 296, 8)) }}
                    className="absolute top-[96px] z-20 w-[288px] rounded-lg border border-slate-700 bg-slate-900 p-2 shadow-xl"
                  >
                    <p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      {shortDate(c.day)} · {c.events.length} event{c.events.length > 1 ? "s" : ""}
                    </p>
                    <div className="max-h-56 space-y-1 overflow-y-auto">
                      {c.events.map((ev) => {
                        const s = MARKER_STYLE[ev.type];
                        const row = (
                          <span className="flex items-start gap-1.5">
                            <span
                              className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ backgroundColor: s.color }}
                            />
                            <span className="text-[11px] leading-snug text-slate-300">
                              {ev.title}
                              <span className="ml-1 text-[10px] text-slate-500">{ev.source}</span>
                            </span>
                          </span>
                        );
                        return ev.url ? (
                          <a
                            key={ev.id}
                            href={ev.url}
                            target="_blank"
                            rel="noreferrer"
                            className="block rounded px-1 py-0.5 hover:bg-slate-800/70"
                          >
                            {row}
                          </a>
                        ) : (
                          <div key={ev.id} className="px-1 py-0.5">
                            {row}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-400">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500" />Earnings</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-400" />SEC filing</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-slate-500" />News</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-teal-400" />Cited</span>
        <span className="text-slate-500">
          Drag or zoom the chart — the event lane moves with it. Click a chip to jump to that
          date&apos;s events.
        </span>
      </div>
    </div>
  );
}
