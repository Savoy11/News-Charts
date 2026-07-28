"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  createSeriesMarkers,
  AreaSeries,
  ColorType,
  HistogramSeries,
  LineSeries,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";
import { EventType, PricePoint, TimelineEvent } from "@/lib/types";
import EventThumb from "./EventThumb";

const MARKER_STYLE = {
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
} as const;

/** Legend wording, which is not always the badge wording ("SEC filing", not "Filing"). */
const LEGEND_LABEL: Record<EventType, string> = {
  earnings: "Earnings",
  filing: "SEC filing",
  news: "News",
  history: "History",
  press: "Historical press",
  regulation: "Sector rule",
  citation: "Cited",
  corporate_action: "Split / dividend",
  onchain: "On-chain",
  annotation: "Your notes",
};

// which kind wins when several share a day — the market-moving ones first
const PRIORITY: Record<EventType, number> = {
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

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function shortDate(day: string): string {
  return `${MONTHS_SHORT[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}, ${day.slice(0, 4)}`;
}

// how far (in trading days) the hover reaches for the nearest event day, so sweeping
// the line pops articles up without needing pixel-perfect aim at a marker
const HOVER_REACH = 5;
const POPUP_W = 304;
const POPUP_MAX = 5; // articles listed before "+N more"

interface Hover {
  x: number;
  y: number;
  day: string;
  events: TimelineEvent[];
}

/**
 * Simple moving average over the close series. Returns one point per input day from the
 * `period`-th onward — a partial average over the first N-1 days would draw a line that
 * looks like data but isn't, so those days simply have no point.
 */
function sma(prices: PricePoint[], period: number): { time: Time; value: number }[] {
  if (prices.length < period) return [];
  const out: { time: Time; value: number }[] = [];
  let sum = 0;
  for (let i = 0; i < prices.length; i++) {
    sum += prices[i].value;
    if (i >= period) sum -= prices[i - period].value;
    if (i >= period - 1) {
      out.push({ time: prices[i].time as Time, value: Math.round((sum / period) * 100) / 100 });
    }
  }
  return out;
}

const OVERLAYS = [
  { key: "volume", label: "Volume", swatch: "bg-slate-500" },
  { key: "sma50", label: "50d avg", swatch: "bg-amber-400" },
  { key: "sma200", label: "200d avg", swatch: "bg-violet-400" },
] as const;

type OverlayKey = (typeof OVERLAYS)[number]["key"];

export default function PriceTimeline({ prices, events, onSelectDate }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelectDate);
  onSelectRef.current = onSelectDate;

  // crosshair-follow popup: the nearest event day's articles, at the pointer
  const [hover, setHover] = useState<Hover | null>(null);
  // pointer is on the popup itself — freeze updates so its links can be clicked
  const pinned = useRef(false);
  const widthRef = useRef(0);

  // Overlays are off by default: the price line and its event markers are what the page is
  // for, and three more series on top of them is a busier chart than most readers want.
  const [on, setOn] = useState<Record<OverlayKey, boolean>>({
    volume: false,
    sma50: false,
    sma200: false,
  });
  const hasVolume = prices.some((p) => p.volume != null);
  const legend = useMemo(() => {
    const present = new Set(events.map((e) => e.type));
    return (Object.keys(LEGEND_LABEL) as EventType[]).filter((k) => present.has(k));
  }, [events]);

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

    // Volume sits on its own invisible overlay scale pinned to the bottom fifth, so it never
    // competes with the price axis or squashes the line.
    if (on.volume && hasVolume) {
      const volume = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "volume",
        priceLineVisible: false,
        lastValueVisible: false,
      });
      volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      volume.setData(
        prices
          .filter((p) => p.volume != null)
          .map((p, i, arr) => ({
            time: p.time as Time,
            value: p.volume as number,
            // green on an up day, red on a down day — the direction the volume belongs to
            color:
              i > 0 && arr[i - 1].value > p.value
                ? "rgba(248, 113, 113, 0.45)"
                : "rgba(52, 211, 153, 0.45)",
          }))
      );
    }

    for (const [key, period, color] of [
      ["sma50", 50, "#fbbf24"],
      ["sma200", 200, "#a78bfa"],
    ] as const) {
      if (!on[key]) continue;
      const data = sma(prices, period);
      if (!data.length) continue; // shorter history than the window — draw nothing, not a stub
      const line = chart.addSeries(LineSeries, {
        color,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      line.setData(data);
    }

    const tradingDays = prices.map((p) => p.time);
    const dayIndex = new Map(tradingDays.map((d, i) => [d, i]));
    // one marker per day (highest-priority kind decides the glyph); the popup keeps every event
    const markerByDay = new Map<string, TimelineEvent>();
    const eventsByDay = new Map<string, TimelineEvent[]>();
    for (const ev of events) {
      const day = snapToTradingDay(ev.date, tradingDays);
      if (!day) continue;
      const existing = markerByDay.get(day);
      if (!existing || PRIORITY[ev.type] > PRIORITY[existing.type]) {
        markerByDay.set(day, { ...ev, date: day });
      }
      const list = eventsByDay.get(day);
      if (list) list.push(ev);
      else eventsByDay.set(day, [ev]);
    }
    // event days by trading-day index, for a binary "nearest within reach" lookup
    const eventDayIndices = [...eventsByDay.keys()]
      .map((d) => dayIndex.get(d)!)
      .sort((a, b) => a - b);

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

    // Sweep the line → the nearest event day (within reach) pops its articles up at the cursor.
    chart.subscribeCrosshairMove((param) => {
      if (pinned.current) return; // reader is on the popup — don't move it out from under them
      widthRef.current = el.clientWidth;
      if (!param.time || !param.point) {
        setHover(null);
        return;
      }
      const idx = dayIndex.get(String(param.time));
      if (idx === undefined || eventDayIndices.length === 0) {
        setHover(null);
        return;
      }
      // nearest event day by trading-day distance
      let lo = 0;
      let hi = eventDayIndices.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (eventDayIndices[mid] < idx) lo = mid + 1;
        else hi = mid;
      }
      let best = eventDayIndices[lo];
      if (lo > 0 && idx - eventDayIndices[lo - 1] < Math.abs(best - idx)) {
        best = eventDayIndices[lo - 1];
      }
      if (Math.abs(best - idx) > HOVER_REACH) {
        setHover(null);
        return;
      }
      const day = tradingDays[best];
      setHover({ x: param.point.x, y: param.point.y, day, events: eventsByDay.get(day) ?? [] });
    });

    chart.subscribeClick((param) => {
      if (param.time && onSelectRef.current) {
        onSelectRef.current(String(param.time));
      }
    });

    chart.timeScale().fitContent();

    const resize = () => {
      chart.applyOptions({ width: el.clientWidth });
      widthRef.current = el.clientWidth;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el);

    return () => {
      observer.disconnect();
      chart.remove();
      setHover(null);
    };
    // toggling an overlay rebuilds the chart — simpler than adding and removing series by
    // hand, and cheap at this data size
  }, [prices, events, on, hasVolume]);

  const popupLeft = (x: number) =>
    Math.min(Math.max(x + 14, 8), Math.max((widthRef.current || POPUP_W) - POPUP_W - 8, 8));

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
          Overlay
        </span>
        {OVERLAYS.map((o) => {
          // Volume is only offered when the series actually carries it: rows persisted before
          // volume was plumbed have none, and a toggle that does nothing is worse than no toggle.
          const unavailable = o.key === "volume" && !hasVolume;
          if (unavailable) return null;
          const active = on[o.key];
          return (
            <button
              key={o.key}
              onClick={() => setOn((s) => ({ ...s, [o.key]: !s[o.key] }))}
              aria-pressed={active}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                active
                  ? "border-slate-600 bg-slate-800 text-slate-200"
                  : "border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${o.swatch} ${active ? "" : "opacity-40"}`} />
              {o.label}
            </button>
          );
        })}
      </div>
      <div className="relative">
        <div ref={containerRef} className="w-full" />
        {hover && hover.events.length > 0 && (
          <div
            onMouseEnter={() => {
              pinned.current = true;
            }}
            onMouseLeave={() => {
              pinned.current = false;
              setHover(null);
            }}
            style={{ left: popupLeft(hover.x), top: Math.min(hover.y + 16, 250), width: POPUP_W }}
            className="absolute z-20 rounded-lg border border-slate-700 bg-slate-900/95 p-2 shadow-xl backdrop-blur"
          >
            <p className="mb-1.5 flex items-baseline justify-between px-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <span>{shortDate(hover.day)}</span>
              <span className="font-normal normal-case text-slate-600">
                {hover.events.length} event{hover.events.length > 1 ? "s" : ""}
              </span>
            </p>
            <div className="space-y-1">
              {hover.events.slice(0, POPUP_MAX).map((ev) => {
                const s = MARKER_STYLE[ev.type];
                const row = (
                  <span className="flex items-start gap-1.5">
                    <span
                      className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: s.color }}
                    />
                    <span className="min-w-0 flex-1 text-[11px] leading-snug text-slate-300">
                      {ev.title}
                      <span className="ml-1 text-[10px] text-slate-500">{ev.source}</span>
                    </span>
                    <EventThumb
                      src={ev.imageUrl}
                      className="ml-1 h-9 w-9 shrink-0 rounded border border-slate-800 object-cover"
                    />
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
            {hover.events.length > POPUP_MAX && (
              <button
                onClick={() => onSelectDate?.(hover.day)}
                className="mt-1 w-full rounded px-1 py-0.5 text-left text-[10px] text-slate-500 hover:bg-slate-800/70 hover:text-sky-300"
              >
                +{hover.events.length - POPUP_MAX} more — jump to this date below
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-400">
        {/* Derived from what is actually plotted. The legend used to be a hardcoded list of
            company event kinds, so a Bitcoin page advertised "Earnings" and "SEC filing" and
            omitted the on-chain marker it was actually showing. */}
        {legend.map((k) => (
          <span key={k}>
            <span
              className="mr-1 inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: MARKER_STYLE[k].color }}
            />
            {LEGEND_LABEL[k]}
          </span>
        ))}
        <span className="text-slate-500">
          Sweep the line — nearby articles pop up at the cursor. Click a point to jump to that
          date&apos;s events below.
        </span>
      </div>
    </div>
  );
}
