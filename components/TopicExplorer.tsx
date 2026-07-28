"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import HorizontalTimeline from "./HorizontalTimeline";
import EventList from "./EventList";
import AiPanel, { type AiRanking } from "./AiPanel";
import { EventType, TimelineEvent } from "@/lib/types";
import { DEFAULT_PREFS, loadPrefs, PREFS_EVENT } from "@/lib/prefs";

/** Keep only what the visitor's model judged relevant, best matches first. */
export function applyRanking(events: TimelineEvent[], ranking: AiRanking | null): TimelineEvent[] {
  if (!ranking) return events;
  return events
    .filter((e) => (ranking.scores.get(e.id) ?? 0) >= 0.35)
    .sort((a, b) => (ranking.scores.get(b.id) ?? 0) - (ranking.scores.get(a.id) ?? 0));
}

const FILTERS: { key: EventType; label: string }[] = [
  { key: "history", label: "History" },
  { key: "citation", label: "Cited articles" },
  { key: "press", label: "Historical press" },
  { key: "news", label: "Recent news" },
];

const ALL_TYPES = FILTERS.map((f) => f.key);

/**
 * Cap Wikipedia "history" entries to `max`, sampling evenly across time so the timeline keeps its
 * full range (oldest and newest survive) instead of collapsing to one era. Non-history events and
 * everything else are untouched. `max <= 0` means no cap.
 */
function capHistory(events: TimelineEvent[], max: number): TimelineEvent[] {
  if (max <= 0) return events;
  const history = events.filter((e) => e.type === "history");
  if (history.length <= max) return events;
  const others = events.filter((e) => e.type !== "history");
  const sorted = [...history].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const denom = Math.max(1, max - 1);
  const seen = new Set<string>();
  const kept: TimelineEvent[] = [];
  for (let i = 0; i < max; i++) {
    const ev = sorted[Math.round((i * (sorted.length - 1)) / denom)];
    if (!seen.has(ev.id)) {
      seen.add(ev.id);
      kept.push(ev);
    }
  }
  return [...others, ...kept];
}

/**
 * Serialise the shareable part of the view (mode + which types are on) into a query string.
 * Defaults are omitted so a fresh page keeps a clean, canonical URL; only a deviation shows up.
 */
function encodeView(
  view: "timeline" | "list",
  active: Set<EventType>,
  focus: string | null
): string {
  const p = new URLSearchParams();
  if (view !== "timeline") p.set("view", view);
  const on = ALL_TYPES.filter((t) => active.has(t));
  if (on.length !== ALL_TYPES.length) p.set("types", on.join(","));
  if (focus) p.set("focus", focus); // survives filter toggles — it came from the search prompt
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

export default function TopicExplorer({ events }: { events: TimelineEvent[] }) {
  const [active, setActive] = useState<Set<EventType>>(
    new Set<EventType>(["history", "citation", "press", "news"])
  );
  const [view, setView] = useState<"timeline" | "list">("timeline");
  const pathname = usePathname();
  const storeKey = `news-charts:view:${pathname}`;
  const [copied, setCopied] = useState(false);
  // the angle a natural-language search prompt carried in ("in the united states")
  const [focusHint, setFocusHint] = useState<string | null>(null);
  // saving must wait for the restore pass, or the default state overwrites what was stored
  const hydrated = useRef(false);

  // Restore the view. A URL that carries ?view/?types wins (it's a shared link, meant to
  // reproduce exactly that); otherwise fall back to what this browser last used on this path.
  useEffect(() => {
    let fromUrl = false;
    try {
      const sp = new URLSearchParams(window.location.search);
      const f = sp.get("focus");
      if (f) setFocusHint(f);
      const v = sp.get("view");
      const t = sp.get("types");
      if (v === "list" || v === "timeline") {
        setView(v);
        fromUrl = true;
      }
      if (t !== null) {
        const set = new Set(
          t.split(",").filter((x): x is EventType => (ALL_TYPES as string[]).includes(x))
        );
        if (set.size) {
          setActive(set);
          fromUrl = true;
        }
      }
    } catch {
      /* malformed URL — ignore */
    }
    if (!fromUrl) {
      try {
        // localStorage (not sessionStorage) so the choice is remembered across visits, not just the tab
        const saved = JSON.parse(localStorage.getItem(storeKey) || "{}");
        if (saved.view === "timeline" || saved.view === "list") setView(saved.view);
        if (Array.isArray(saved.active) && saved.active.length) {
          setActive(new Set<EventType>(saved.active));
        }
      } catch {
        /* storage unavailable — start fresh */
      }
    }
    hydrated.current = true;
  }, [storeKey]);

  // History cap (Wikipedia). Start from the default so SSR and first client render agree, then
  // read the reader's preference after mount and on any change.
  const [maxHistory, setMaxHistory] = useState(DEFAULT_PREFS.timeline.maxHistory);
  useEffect(() => {
    const refresh = () => setMaxHistory(loadPrefs().timeline.maxHistory);
    refresh();
    window.addEventListener(PREFS_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(PREFS_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  const capped = useMemo(() => capHistory(events, maxHistory), [events, maxHistory]);

  const [ranking, setRanking] = useState<AiRanking | null>(null);
  const filtered = useMemo(() => capped.filter((e) => active.has(e.type)), [capped, active]);
  // ranking narrows and reorders; the timeline still renders chronologically
  const ranked = useMemo(() => applyRanking(filtered, ranking), [filtered, ranking]);

  /**
   * Persist from user actions only — an effect would fire with default state and clobber.
   * Writes both the per-path sessionStorage (return-visit restore) and the URL (a copyable link),
   * the latter via replaceState so it doesn't spam history or trigger a navigation.
   */
  function persist(nextView: "timeline" | "list", nextActive: Set<EventType>) {
    if (!hydrated.current) return;
    try {
      localStorage.setItem(storeKey, JSON.stringify({ view: nextView, active: [...nextActive] }));
    } catch {
      /* storage unavailable — selection just won't persist */
    }
    try {
      window.history.replaceState(null, "", pathname + encodeView(nextView, nextActive, focusHint));
    } catch {
      /* history unavailable — link just won't reflect the view */
    }
  }

  function toggle(type: EventType) {
    const next = new Set(active);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    setActive(next);
    persist(view, next);
  }

  function chooseView(next: "timeline" | "list") {
    setView(next);
    persist(next, active);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  return (
    <div>
      <AiPanel
        events={filtered}
        ranking={ranking}
        onRanking={setRanking}
        initialInstruction={focusHint ?? undefined}
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const count = capped.filter((e) => e.type === f.key).length;
          if (count === 0) return null;
          return (
            <button
              key={f.key}
              onClick={() => toggle(f.key)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                active.has(f.key)
                  ? "border-sky-600 bg-sky-600/20 text-sky-300"
                  : "border-slate-700 bg-slate-900 text-slate-500"
              }`}
            >
              {f.label} <span className="opacity-60">{count}</span>
            </button>
          );
        })}

        <button
          onClick={copyLink}
          title="Copy a link to this exact view"
          className="ml-auto rounded-md border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-400 transition-colors hover:border-sky-600 hover:text-sky-300"
        >
          {copied ? "Copied ✓" : "Copy link"}
        </button>

        <div className="flex rounded-md border border-slate-700">
          {(["timeline", "list"] as const).map((v) => (
            <button
              key={v}
              onClick={() => chooseView(v)}
              className={`px-3 py-1 text-xs font-semibold capitalize first:rounded-l-md last:rounded-r-md ${
                view === v ? "bg-sky-600/25 text-sky-300" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {view === "timeline" ? (
        <HorizontalTimeline events={ranked} />
      ) : (
        <EventList events={ranked} order="asc" persistKey={`news-charts:collapse:${pathname}`} />
      )}
    </div>
  );
}
