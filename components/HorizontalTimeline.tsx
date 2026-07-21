"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { EventType, TimelineEvent } from "@/lib/types";

const CARD_W = 244;

const ZOOMS = [
  { label: "Compact", pxPerYear: 1.5, minGap: 132, maxGap: 240 },
  { label: "Default", pxPerYear: 6, minGap: 148, maxGap: 520 },
  { label: "Wide", pxPerYear: 20, minGap: 176, maxGap: 1100 },
];
const DEFAULT_ZOOM = 1;

const STYLE: Record<EventType, { dot: string; badge: string; label: string }> = {
  history: {
    dot: "bg-violet-400 ring-violet-400/30",
    badge: "border-violet-700/50 bg-violet-500/15 text-violet-300",
    label: "History",
  },
  news: {
    dot: "bg-slate-400 ring-slate-400/30",
    badge: "border-slate-600/50 bg-slate-500/15 text-slate-300",
    label: "News",
  },
  press: {
    dot: "bg-orange-400 ring-orange-400/30",
    badge: "border-orange-700/50 bg-orange-500/15 text-orange-300",
    label: "Press",
  },
  earnings: {
    dot: "bg-amber-400 ring-amber-400/30",
    badge: "border-amber-700/50 bg-amber-500/15 text-amber-300",
    label: "Earnings",
  },
  filing: {
    dot: "bg-sky-400 ring-sky-400/30",
    badge: "border-sky-700/50 bg-sky-500/15 text-sky-300",
    label: "Filing",
  },
};

const CARD_CLASS =
  "absolute block rounded-lg border border-slate-800 bg-slate-900 p-3 shadow-lg transition-colors";

/** Fractional year, so events within the same year still order correctly. */
function toYearValue(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return y + ((m - 1) + (d - 1) / 31) / 12;
}

function yearOf(date: string): number {
  return Number(date.slice(0, 4));
}

function formatDate(ev: TimelineEvent): string {
  if (ev.type === "history") return String(yearOf(ev.date));
  return new Date(`${ev.date}T00:00:00`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** The whole card is the click target, so there's no need to hit the text exactly. */
function EventCard({ ev, style }: { ev: TimelineEvent; style: React.CSSProperties }) {
  const s = STYLE[ev.type];
  const body = (
    <>
      <span
        className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${s.badge}`}
      >
        {s.label}
      </span>
      <span className="mt-1.5 line-clamp-4 block text-sm font-medium leading-snug text-slate-200">
        {ev.title}
      </span>
      <span className="mt-1.5 block truncate text-[11px] text-slate-500">
        {ev.source}
        {ev.url ? " ↗" : ""}
      </span>
    </>
  );

  if (!ev.url) {
    return (
      <div className={CARD_CLASS} style={style}>
        {body}
      </div>
    );
  }
  return (
    <a
      href={ev.url}
      target="_blank"
      rel="noopener noreferrer"
      draggable={false}
      title={`Open ${ev.source} at this passage (new tab)`}
      className={`${CARD_CLASS} cursor-pointer hover:border-sky-600/70 hover:bg-slate-800/70 focus-visible:border-sky-500 focus-visible:outline-none`}
      style={style}
    >
      {body}
    </a>
  );
}

interface Placed {
  ev: TimelineEvent;
  x: number;
  above: boolean;
  /** years skipped since the previous event, when the jump is large enough to call out */
  gapYears: number;
  gapMidX: number;
}

export default function HorizontalTimeline({ events }: { events: TimelineEvent[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const z = ZOOMS[zoom];
  const storeKey = `chronolens:timeline:${usePathname()}`;
  const pendingScroll = useRef<number | null>(null);
  // saving must wait for the restore pass, or the default state overwrites what was stored
  const hydrated = useRef(false);
  // scroll fires before a zoom change re-attaches its listener, so read zoom from a ref
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  // the restore's own scroll fires an event; ignore it or it saves pre-restore state
  const suppressSave = useRef(false);

  // Opening a source navigates away in browsers that block new tabs, so remember
  // where the reader was and restore it when they come back.
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storeKey) || "{}");
      if (typeof saved.zoom === "number" && ZOOMS[saved.zoom]) setZoom(saved.zoom);
      pendingScroll.current = typeof saved.scrollLeft === "number" ? saved.scrollLeft : null;
    } catch {
      /* storage unavailable — start fresh */
    }
    hydrated.current = true;
  }, [storeKey]);

  const { items, width } = useMemo(() => {
    const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
    const placed: Placed[] = [];
    let x = CARD_W / 2 + 32;
    for (let i = 0; i < sorted.length; i++) {
      let gapYears = 0;
      let gapMidX = 0;
      if (i > 0) {
        const delta = toYearValue(sorted[i].date) - toYearValue(sorted[i - 1].date);
        const gap = Math.min(Math.max(delta * z.pxPerYear, z.minGap), z.maxGap);
        gapMidX = x + gap / 2;
        x += gap;
        // call out a quiet stretch once proportional spacing has actually opened a gap
        if (delta >= 15 && gap > z.minGap + 20) gapYears = Math.round(delta);
      }
      placed.push({ ev: sorted[i], x, above: i % 2 === 0, gapYears, gapMidX });
    }
    return { items: placed, width: x + CARD_W / 2 + 32 };
  }, [events, z]);

  // apply a restored scroll position once the track has been laid out at the right zoom
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || pendingScroll.current === null) return;
    const target = pendingScroll.current;
    pendingScroll.current = null;
    suppressSave.current = true;
    el.scrollLeft = target;
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        suppressSave.current = false;
      })
    );
    return () => cancelAnimationFrame(id);
  }, [width, zoom]);

  /** Persist from real movement only — writing on mount would clobber the stored position. */
  const persist = useCallback(
    (nextZoom: number, scrollLeft: number) => {
      if (!hydrated.current || suppressSave.current || pendingScroll.current !== null) return;
      try {
        sessionStorage.setItem(
          storeKey,
          JSON.stringify({ zoom: nextZoom, scrollLeft: Math.round(scrollLeft) })
        );
      } catch {
        /* storage unavailable — position just won't persist */
      }
    },
    [storeKey]
  );

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => persist(zoomRef.current, el.scrollLeft));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [persist]);

  const chooseZoom = useCallback(
    (i: number) => {
      setZoom(i);
      persist(i, scrollerRef.current?.scrollLeft ?? 0);
    },
    [persist]
  );

  // wheel over the timeline pans horizontally; falls through to the page at the ends
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return;
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      const atStart = el.scrollLeft <= 0 && delta < 0;
      const atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 1 && delta > 0;
      if (atStart || atEnd) return;
      e.preventDefault();
      el.scrollLeft += delta;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // drag anywhere to pan — including across cards, which are themselves links.
  // A click is only suppressed if the pointer actually travelled, so a plain
  // click on a card still opens its source.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let down = false;
    let dragged = false;
    let startX = 0;
    let startScroll = 0;

    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest("button")) return;
      down = true;
      dragged = false;
      startX = e.clientX;
      startScroll = el.scrollLeft;
    };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 4) {
        dragged = true;
        el.classList.add("cursor-grabbing");
      }
      el.scrollLeft = startScroll - dx;
    };
    const onUp = () => {
      down = false;
      el.classList.remove("cursor-grabbing");
    };
    const onClick = (e: MouseEvent) => {
      if (dragged) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    el.addEventListener("click", onClick, true);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      el.removeEventListener("click", onClick, true);
    };
  }, []);

  const page = useCallback((dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  }, []);

  const jumpToEnd = useCallback((end: "start" | "end") => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ left: end === "start" ? 0 : el.scrollWidth, behavior: "smooth" });
  }, []);

  if (items.length === 0) {
    return <p className="text-sm text-slate-500">No events to plot.</p>;
  }

  const firstYear = yearOf(items[0].ev.date);
  const lastYear = yearOf(items[items.length - 1].ev.date);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-3 py-2">
        <span className="text-xs font-semibold text-slate-400">
          {firstYear} – {lastYear}
        </span>
        <span className="text-xs text-slate-600">·</span>
        <span className="text-xs text-slate-500">{items.length} events</span>

        <div className="ml-auto flex items-center gap-1">
          <div className="mr-2 flex rounded-md border border-slate-700">
            {ZOOMS.map((zz, i) => (
              <button
                key={zz.label}
                onClick={() => chooseZoom(i)}
                className={`px-2.5 py-1 text-xs font-semibold first:rounded-l-md last:rounded-r-md ${
                  i === zoom ? "bg-sky-600/25 text-sky-300" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {zz.label}
              </button>
            ))}
          </div>
          <TrackButton onClick={() => jumpToEnd("start")} title="Jump to earliest">
            «
          </TrackButton>
          <TrackButton onClick={() => page(-1)} title="Scroll back">
            ‹
          </TrackButton>
          <TrackButton onClick={() => page(1)} title="Scroll forward">
            ›
          </TrackButton>
          <TrackButton onClick={() => jumpToEnd("end")} title="Jump to latest">
            »
          </TrackButton>
        </div>
      </div>

      <div
        ref={scrollerRef}
        tabIndex={0}
        className="chrono-scroller relative cursor-grab overflow-x-auto overflow-y-hidden focus:outline-none"
      >
        <div className="relative h-[420px] select-none" style={{ width }}>
          {/* the axis */}
          <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-slate-800 via-slate-600 to-slate-800" />

          {items.map(({ ev, x, above, gapYears, gapMidX }) => {
            const s = STYLE[ev.type];
            return (
              <div key={ev.id}>
                {gapYears > 0 && (
                  <span
                    className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-slate-800 bg-slate-950 px-2 py-0.5 text-[10px] font-medium text-slate-600"
                    style={{ left: gapMidX }}
                  >
                    {gapYears} years
                  </span>
                )}

                {/* dot on the axis */}
                <span
                  className={`absolute top-1/2 z-10 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-4 ${s.dot}`}
                  style={{ left: x }}
                />

                {/* date label, opposite the card */}
                <span
                  className="absolute -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold text-slate-500"
                  style={{
                    left: x,
                    top: above ? "calc(50% + 12px)" : undefined,
                    bottom: above ? undefined : "calc(50% + 12px)",
                  }}
                >
                  {formatDate(ev)}
                </span>

                {/* connector */}
                <span
                  className="absolute w-px bg-slate-700"
                  style={{ left: x, height: 26, top: above ? "calc(50% - 26px)" : "50%" }}
                />

                <EventCard
                  ev={ev}
                  style={{
                    left: x - CARD_W / 2,
                    width: CARD_W,
                    bottom: above ? "calc(50% + 26px)" : undefined,
                    top: above ? undefined : "calc(50% + 26px)",
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      <p className="border-t border-slate-800 px-3 py-2 text-[11px] text-slate-600">
        Drag the track or scroll to move through time. Click any card to open its source; your
        place is remembered if you come back. Spacing is proportional to the time between events —
        wide gaps mean quiet stretches.
      </p>
    </div>
  );
}

function TrackButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="h-7 w-7 rounded-md border border-slate-700 text-sm text-slate-400 hover:border-sky-600 hover:text-sky-300"
    >
      {children}
    </button>
  );
}
