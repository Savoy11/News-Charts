"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { EventType, TimelineEvent } from "@/lib/types";
import { DEFAULT_PREFS, loadPrefs, PREFS_EVENT, type TimelinePrefs } from "@/lib/prefs";
import ChainRef from "./ChainRef";
import EventThumb from "./EventThumb";

const CARD_W = 244;
/** Expanded-stack popover: wider than a card for readable rows, capped so it stays inside the 420px track. */
const PANEL_W = 300;
const PANEL_MAX_H = 380;

// `bucket` sets what counts as "the same time period" for stacking at each zoom: crowded years
// collapse into one stack until Wide pulls the axis apart enough to break them into months.
const ZOOMS = [
  { label: "Compact", pxPerYear: 1.5, minGap: 132, maxGap: 240, bucket: "year" },
  { label: "Default", pxPerYear: 6, minGap: 148, maxGap: 520, bucket: "year" },
  { label: "Wide", pxPerYear: 20, minGap: 176, maxGap: 1100, bucket: "month" },
] as const;
const DEFAULT_ZOOM = 1;

type Bucket = "year" | "month";

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
  regulation: {
    dot: "bg-rose-400 ring-rose-400/30",
    badge: "border-rose-700/50 bg-rose-500/15 text-rose-300",
    label: "Regulation",
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
  citation: {
    dot: "bg-teal-400 ring-teal-400/30",
    badge: "border-teal-700/50 bg-teal-500/15 text-teal-300",
    label: "Cited",
  },
  corporate_action: {
    dot: "bg-fuchsia-400 ring-fuchsia-400/30",
    badge: "border-fuchsia-700/50 bg-fuchsia-500/15 text-fuchsia-300",
    label: "Corporate action",
  },
  onchain: {
    dot: "bg-lime-400 ring-lime-400/30",
    badge: "border-lime-700/50 bg-lime-500/15 text-lime-300",
    label: "On-chain",
  },
  annotation: {
    dot: "bg-cyan-400 ring-cyan-400/30",
    badge: "border-cyan-700/50 bg-cyan-500/15 text-cyan-300",
    label: "Your note",
  },
  governance: {
    dot: "bg-indigo-400 ring-indigo-400/30",
    badge: "border-indigo-700/50 bg-indigo-500/15 text-indigo-300",
    label: "Governance",
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

/** Which period an event stacks into at the current zoom. Same-bucket events sit as one stack. */
function bucketKey(date: string, bucket: Bucket): string {
  return bucket === "month" ? date.slice(0, 7) : date.slice(0, 4);
}

/** Human label for a stack's period — "2026" by year, "Jul 2026" by month (UTC, so it never drifts a day). */
function periodLabel(date: string, bucket: Bucket): string {
  const [y, m] = date.split("-").map(Number);
  if (bucket === "month") {
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
      timeZone: "UTC",
      month: "short",
      year: "numeric",
    });
  }
  return String(y);
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
      <EventThumb
        src={ev.imageUrl}
        className="mb-2 h-20 w-full rounded-md border border-slate-800 object-cover"
      />
      <span
        className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${s.badge}`}
      >
        {s.label}
      </span>
      <span className="mt-1.5 line-clamp-4 block text-sm font-medium leading-snug text-slate-200">
        {ev.title}
      </span>
      <span className="mt-1.5 block truncate text-[11px] text-slate-500">
        <ChainRef ev={ev} />
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

interface Cluster {
  /** stable across renders (first event's id) so React and the hover state keep their footing */
  id: string;
  /** one event → a plain card; more than one → a stack that expands on hover */
  events: TimelineEvent[];
  x: number;
  above: boolean;
  /** years skipped since the previous period, when the jump is large enough to call out */
  gapYears: number;
  gapMidX: number;
  /** axis label — the event's date for a single, the period ("Jul 2026") for a stack */
  label: string;
}

export default function HorizontalTimeline({ events }: { events: TimelineEvent[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  /**
   * A per-view override of the stacking preference, so condensing a sprawling timeline is one
   * click rather than a trip through settings — the list view has had "Collapse all" since it
   * shipped and this is its counterpart. `null` means "follow the preference".
   */
  const [stackOverride, setStackOverride] = useState<boolean | null>(null);
  const z = ZOOMS[zoom];
  const storeKey = `news-charts:timeline:${usePathname()}`;
  const pendingScroll = useRef<number | null>(null);
  // saving must wait for the restore pass, or the default state overwrites what was stored
  const hydrated = useRef(false);
  // scroll fires before a zoom change re-attaches its listener, so read zoom from a ref
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  // the restore's own scroll fires an event; ignore it or it saves pre-restore state
  const suppressSave = useRef(false);
  // read inside persist(), which must not re-create itself when the override flips
  const stackOverrideRef = useRef<boolean | null>(null);

  // Mini-map viewport, as fractions of the whole track (left edge + visible width). Measured from
  // the scroller so the overview reflects the real pixel layout, not a re-derived time scale.
  const [viewport, setViewport] = useState<{ left: number; width: number }>({ left: 0, width: 1 });
  const updateViewport = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const total = el.scrollWidth || 1;
    setViewport({ left: el.scrollLeft / total, width: Math.min(1, el.clientWidth / total) });
  }, []);
  const seekTo = useCallback((fraction: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    // centre the clicked point in the viewport, clamped to the track
    el.scrollTo({ left: Math.max(0, fraction * el.scrollWidth - el.clientWidth / 2) });
  }, []);

  // Display preferences (stack on/off, expand trigger, default zoom). Start from defaults so SSR
  // and first client render agree, then read the real values after mount and on any change.
  const [tl, setTl] = useState<TimelinePrefs>(DEFAULT_PREFS.timeline);
  useEffect(() => {
    const refresh = () => setTl(loadPrefs().timeline);
    refresh();
    window.addEventListener(PREFS_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(PREFS_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  // Opening a source navigates away in browsers that block new tabs, so remember
  // where the reader was and restore it when they come back. A path with no saved zoom falls
  // back to the reader's default-zoom preference (read straight from storage — state may not have
  // caught up on this first pass).
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storeKey) || "{}");
      const fallback = loadPrefs().timeline.defaultZoom;
      const initial = typeof saved.zoom === "number" && ZOOMS[saved.zoom] ? saved.zoom : fallback;
      if (ZOOMS[initial]) setZoom(initial);
      if (typeof saved.stacked === "boolean") setStackOverride(saved.stacked);
      pendingScroll.current = typeof saved.scrollLeft === "number" ? saved.scrollLeft : null;
    } catch {
      /* storage unavailable — start fresh */
    }
    hydrated.current = true;
  }, [storeKey]);

  const stacked = stackOverride ?? tl.stack;
  stackOverrideRef.current = stackOverride;

  const { clusters, width } = useMemo(() => {
    const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));

    // Fold consecutive same-period events into one group. Sorted input means a period's events
    // are always adjacent, so a single linear pass groups them.
    const groups: TimelineEvent[][] = [];
    for (const ev of sorted) {
      const last = groups[groups.length - 1];
      // stacking off → every event is its own group, i.e. a plain card (the pre-stack layout)
      if (stacked && last && bucketKey(last[0].date, z.bucket) === bucketKey(ev.date, z.bucket))
        last.push(ev);
      else groups.push([ev]);
    }

    // Spacing is now proportional to the gap between *periods*, anchored on each period's
    // earliest event — so a busy year occupies one stack's width instead of N min-gaps.
    const placed: Cluster[] = [];
    let x = CARD_W / 2 + 32;
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      let gapYears = 0;
      let gapMidX = 0;
      if (i > 0) {
        const delta = toYearValue(group[0].date) - toYearValue(groups[i - 1][0].date);
        const gap = Math.min(Math.max(delta * z.pxPerYear, z.minGap), z.maxGap);
        gapMidX = x + gap / 2;
        x += gap;
        // call out a quiet stretch once proportional spacing has actually opened a gap
        if (delta >= 15 && gap > z.minGap + 20) gapYears = Math.round(delta);
      }
      const label = group.length > 1 ? periodLabel(group[0].date, z.bucket) : formatDate(group[0]);
      placed.push({ id: group[0].id, events: group, x, above: i % 2 === 0, gapYears, gapMidX, label });
    }
    return { clusters: placed, width: x + CARD_W / 2 + 32 };
  }, [events, z, stacked]);

  // Which stack is expanded. A short close delay bridges the gap as the pointer travels from the
  // collapsed deck to the centered panel, so it doesn't flicker shut mid-move.
  const [openId, setOpenId] = useState<string | null>(null);
  const closeTimer = useRef<number | null>(null);
  const openStack = useCallback((id: string) => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setOpenId(id);
  }, []);
  const scheduleClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpenId(null), 140);
  }, []);
  const closeNow = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setOpenId(null);
  }, []);
  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  // Escape closes an open stack; in click mode a press or tap outside the deck/panel closes it too
  // (hover mode closes itself on pointer-leave, so it needs neither).
  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeNow();
    window.addEventListener("keydown", onKey);
    let detachDown = () => {};
    if (tl.expand === "click") {
      const onDown = (e: PointerEvent) => {
        if (!(e.target as HTMLElement).closest("[data-cluster-panel], [data-cluster-deck]")) closeNow();
      };
      document.addEventListener("pointerdown", onDown, true);
      detachDown = () => document.removeEventListener("pointerdown", onDown, true);
    }
    return () => {
      window.removeEventListener("keydown", onKey);
      detachDown();
    };
  }, [openId, tl.expand, closeNow]);

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
          JSON.stringify({
            zoom: nextZoom,
            scrollLeft: Math.round(scrollLeft),
            ...(stackOverrideRef.current === null ? {} : { stacked: stackOverrideRef.current }),
          })
        );
      } catch {
        /* storage unavailable — position just won't persist */
      }
    },
    [storeKey]
  );

  /** Writes immediately, for a deliberate action rather than incidental scrolling. */
  const persistWith = useCallback(
    (nextStacked: boolean, nextZoom: number, scrollLeft: number) => {
      try {
        sessionStorage.setItem(
          storeKey,
          JSON.stringify({ zoom: nextZoom, scrollLeft: Math.round(scrollLeft), stacked: nextStacked })
        );
      } catch {
        /* storage unavailable — the choice just won't persist */
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
      raf = requestAnimationFrame(() => {
        persist(zoomRef.current, el.scrollLeft);
        updateViewport();
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [persist, updateViewport]);

  // keep the mini-map viewport in step with layout changes (zoom, width, window resize)
  useEffect(() => {
    updateViewport();
    const onResize = () => updateViewport();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [width, zoom, updateViewport]);

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
      // let an expanded stack scroll its own list instead of panning the track
      if ((e.target as HTMLElement).closest("[data-cluster-panel]")) return;
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
      // buttons and the expanded stack's list are interactive, not drag surfaces
      if ((e.target as HTMLElement).closest("button, [data-cluster-panel]")) return;
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

  if (clusters.length === 0) {
    return <p className="text-sm text-slate-500">No events to plot.</p>;
  }

  const firstYear = yearOf(clusters[0].events[0].date);
  const lastYear = yearOf(clusters[clusters.length - 1].events[0].date);
  const eventCount = events.length;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-3 py-2">
        <span className="text-xs font-semibold text-slate-400">
          {firstYear} – {lastYear}
        </span>
        <span className="text-xs text-slate-600">·</span>
        <span className="text-xs text-slate-500">{eventCount} events</span>

        {/* wraps: the toolbar now carries condense + three zooms + four track buttons, which is
            wider than a phone viewport in one row */}
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {/* The list view's "Collapse all" counterpart. Stacking was reachable only through
              settings, which is a long way to go to quieten a sprawling timeline. */}
          <button
            onClick={() => {
              closeNow();
              const next = !stacked;
              setStackOverride(next);
              const el = scrollerRef.current;
              if (el) persistWith(next, zoom, el.scrollLeft);
            }}
            aria-pressed={stacked}
            title={
              stacked
                ? "Show every event as its own card"
                : "Fold each period's events into one stack"
            }
            className="mr-2 rounded-md border border-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-400 transition-colors hover:border-sky-600 hover:text-sky-300"
          >
            {stacked ? "Expand all" : "Condense"}
          </button>
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

          {clusters.map((c) => {
            const isStack = c.events.length > 1;
            const first = c.events[0];
            const s = STYLE[first.type];
            return (
              <div key={c.id}>
                {c.gapYears > 0 && (
                  <span
                    className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-slate-800 bg-slate-950 px-2 py-0.5 text-[10px] font-medium text-slate-600"
                    style={{ left: c.gapMidX }}
                  >
                    {c.gapYears} years
                  </span>
                )}

                {/* dot on the axis — neutral for a stack, the event's type colour for a single */}
                <span
                  className={`absolute top-1/2 z-10 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-4 ${
                    isStack ? "bg-slate-300 ring-slate-400/30" : s.dot
                  }`}
                  style={{ left: c.x }}
                />

                {/* period / date label, opposite the card */}
                <span
                  className="absolute -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold text-slate-500"
                  style={{
                    left: c.x,
                    top: c.above ? "calc(50% + 12px)" : undefined,
                    bottom: c.above ? undefined : "calc(50% + 12px)",
                  }}
                >
                  {c.label}
                  {isStack && <span className="text-slate-600"> · {c.events.length}</span>}
                </span>

                {/* connector */}
                <span
                  className="absolute w-px bg-slate-700"
                  style={{ left: c.x, height: 26, top: c.above ? "calc(50% - 26px)" : "50%" }}
                />

                {isStack ? (
                  <Stack
                    cluster={c}
                    open={openId === c.id}
                    expand={tl.expand}
                    onOpen={() => openStack(c.id)}
                    onClose={scheduleClose}
                    onCloseNow={closeNow}
                  />
                ) : (
                  <EventCard
                    ev={first}
                    style={{
                      left: c.x - CARD_W / 2,
                      width: CARD_W,
                      bottom: c.above ? "calc(50% + 26px)" : undefined,
                      top: c.above ? undefined : "calc(50% + 26px)",
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Overview mini-map — only when the track actually overflows the viewport. Shows the whole
          span at a glance, with a draggable window for where you are. */}
      {viewport.width < 0.999 && (
        <MiniMap clusters={clusters} width={width} viewport={viewport} onSeek={seekTo} />
      )}

      <p className="border-t border-slate-800 px-3 py-2 text-[11px] text-slate-600">
        Drag the track or scroll to move through time — or drag the mini-map below to jump. Busy
        periods stack into one card — hover a stack to browse everything from that period. Click any
        card to open its source; your place is remembered if you come back.
      </p>
    </div>
  );
}

/**
 * A compact overview of the whole track: one tick per period (brighter for a stack), with a
 * draggable window showing the visible slice. Lives outside the scroller, so its pointer events
 * never fight the track's drag-to-pan.
 */
function MiniMap({
  clusters,
  width,
  viewport,
  onSeek,
}: {
  clusters: Cluster[];
  width: number;
  viewport: { left: number; width: number };
  onSeek: (fraction: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const seekAt = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    onSeek(Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)));
  };

  return (
    <div
      ref={ref}
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        seekAt(e.clientX);
      }}
      onPointerMove={(e) => dragging.current && seekAt(e.clientX)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
      title="Drag to jump anywhere on the timeline"
      className="relative mx-3 mb-1 mt-1 h-8 cursor-pointer touch-none overflow-hidden rounded-md border border-slate-800 bg-slate-950/60"
    >
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-slate-800" />
      {clusters.map((c) => (
        <span
          key={c.id}
          className={`absolute top-1/2 h-2.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${
            c.events.length > 1 ? "bg-slate-300" : "bg-sky-500/70"
          }`}
          style={{ left: `${(c.x / width) * 100}%` }}
        />
      ))}
      <div
        className="pointer-events-none absolute inset-y-0 rounded-sm border border-sky-500/70 bg-sky-500/15"
        style={{ left: `${viewport.left * 100}%`, width: `${Math.max(2, viewport.width * 100)}%` }}
      />
    </div>
  );
}

/**
 * A collapsed deck of same-period events. Hovering (or focusing) it opens a centered, scrollable
 * panel listing every event in the period. The panel is centered on the axis and height-capped so
 * it always fits inside the fixed-height track; its `data-cluster-panel` marker tells the track's
 * wheel/drag handlers to leave it alone so the list scrolls and its links click normally.
 */
function Stack({
  cluster,
  open,
  expand,
  onOpen,
  onClose,
  onCloseNow,
}: {
  cluster: Cluster;
  open: boolean;
  expand: "hover" | "click";
  onOpen: () => void;
  onClose: () => void;
  onCloseNow: () => void;
}) {
  const { events, x, above, label } = cluster;
  const first = events[0];
  const s = STYLE[first.type];
  const toggle = () => (open ? onCloseNow() : onOpen());

  // Hover mode peeks on pointer-over and keyboard focus; click mode opens only on a deliberate
  // click or Enter/Space and is dismissed by Escape / outside click (handled by the parent).
  const deckHandlers =
    expand === "hover"
      ? { onPointerEnter: onOpen, onPointerLeave: onClose, onFocus: onOpen, onBlur: onClose }
      : {
          onClick: toggle,
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              toggle();
            }
          },
        };

  return (
    <>
      {/* collapsed deck — fades whole (layers included) while the centered panel is open, but stays
          mounted and pointer-catching so the hover that opened it doesn't immediately lapse */}
      <div
        data-cluster-deck
        className={`absolute cursor-pointer transition-opacity ${open ? "opacity-0" : "opacity-100"}`}
        style={{
          left: x - CARD_W / 2,
          width: CARD_W,
          bottom: above ? "calc(50% + 26px)" : undefined,
          top: above ? undefined : "calc(50% + 26px)",
        }}
        tabIndex={0}
        role="button"
        aria-expanded={open}
        aria-label={`${events.length} events in ${label} — expand to browse`}
        {...deckHandlers}
      >
        {/* offset layers behind the top card, to read as a deck */}
        <span
          aria-hidden
          className="absolute inset-0 translate-x-[6px] translate-y-[6px] rounded-lg border border-slate-800 bg-slate-900/70"
        />
        <span
          aria-hidden
          className="absolute inset-0 translate-x-[3px] translate-y-[3px] rounded-lg border border-slate-800 bg-slate-900/85"
        />
        <div className="relative rounded-lg border border-slate-800 bg-slate-900 p-3 shadow-lg">
          <div className="flex items-center justify-between gap-2">
            <span
              className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${s.badge}`}
            >
              {s.label}
            </span>
            <span className="rounded-full bg-sky-600/20 px-2 py-0.5 text-[10px] font-bold text-sky-300">
              {events.length}
            </span>
          </div>
          <span className="mt-1.5 line-clamp-3 block text-sm font-medium leading-snug text-slate-200">
            {first.title}
          </span>
          <span className="mt-1.5 block text-[11px] text-slate-500">
            +{events.length - 1} more in {label}
          </span>
        </div>
      </div>

      {/* expanded, scrollable list of the period's events. In hover mode the panel keeps itself
          open while the pointer is over it; in click mode it's dismissed via Escape / outside
          click (parent) or its own close button. */}
      {open && (
        <div
          data-cluster-panel
          className="absolute z-30 flex flex-col overflow-hidden rounded-lg border border-sky-700/50 bg-slate-950 shadow-2xl"
          style={{
            left: x - PANEL_W / 2,
            width: PANEL_W,
            top: "50%",
            transform: "translateY(-50%)",
            maxHeight: PANEL_MAX_H,
          }}
          {...(expand === "hover" ? { onPointerEnter: onOpen, onPointerLeave: onClose } : {})}
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
            <span className="text-xs font-semibold text-slate-300">{label}</span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500">{events.length} events</span>
              {expand === "click" && (
                <button
                  onClick={onCloseNow}
                  aria-label="Close"
                  className="rounded px-1 text-base leading-none text-slate-500 hover:text-slate-200"
                >
                  ×
                </button>
              )}
            </div>
          </div>
          <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
            {events.map((ev) => (
              <li key={ev.id}>
                <StackRow ev={ev} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function StackRow({ ev }: { ev: TimelineEvent }) {
  const s = STYLE[ev.type];
  const body = (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block rounded border px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${s.badge}`}
          >
            {s.label}
          </span>
          <span className="text-[10px] text-slate-500">{formatDate(ev)}</span>
        </div>
        <span className="mt-1 line-clamp-2 block text-xs font-medium leading-snug text-slate-200">
          {ev.title}
        </span>
        {/* No chain reference here: this card is the condensed stack entry, one truncated line
            wide, and a block height would push the explorer's name off it. The full card and the
            list both carry it. */}
        <span className="mt-0.5 block truncate text-[10px] text-slate-500">
          {ev.source}
          {ev.url ? " ↗" : ""}
        </span>
      </div>
      <EventThumb
        src={ev.imageUrl}
        className="h-11 w-11 shrink-0 rounded border border-slate-800 object-cover"
      />
    </div>
  );

  if (!ev.url) {
    return <div className="rounded-md border border-slate-800 bg-slate-900/60 p-2">{body}</div>;
  }
  return (
    <a
      href={ev.url}
      target="_blank"
      rel="noopener noreferrer"
      draggable={false}
      title={`Open ${ev.source} (new tab)`}
      className="block rounded-md border border-slate-800 bg-slate-900/60 p-2 transition-colors hover:border-sky-600/70 hover:bg-slate-800/70"
    >
      {body}
    </a>
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
