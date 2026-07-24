"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import HorizontalTimeline from "./HorizontalTimeline";
import EventList from "./EventList";
import AiPanel, { type AiRanking } from "./AiPanel";
import { EventType, TimelineEvent } from "@/lib/types";

/** Keep only what the visitor's model judged relevant, best matches first. */
export function applyRanking(events: TimelineEvent[], ranking: AiRanking | null): TimelineEvent[] {
  if (!ranking) return events;
  return events
    .filter((e) => (ranking.scores.get(e.id) ?? 0) >= 0.35)
    .sort((a, b) => (ranking.scores.get(b.id) ?? 0) - (ranking.scores.get(a.id) ?? 0));
}

const FILTERS: { key: EventType; label: string }[] = [
  { key: "history", label: "History" },
  { key: "press", label: "Historical press" },
  { key: "news", label: "Recent news" },
];

const ALL_TYPES = FILTERS.map((f) => f.key);

/**
 * Serialise the shareable part of the view (mode + which types are on) into a query string.
 * Defaults are omitted so a fresh page keeps a clean, canonical URL; only a deviation shows up.
 */
function encodeView(view: "timeline" | "list", active: Set<EventType>): string {
  const p = new URLSearchParams();
  if (view !== "timeline") p.set("view", view);
  const on = ALL_TYPES.filter((t) => active.has(t));
  if (on.length !== ALL_TYPES.length) p.set("types", on.join(","));
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

export default function TopicExplorer({ events }: { events: TimelineEvent[] }) {
  const [active, setActive] = useState<Set<EventType>>(
    new Set<EventType>(["history", "press", "news"])
  );
  const [view, setView] = useState<"timeline" | "list">("timeline");
  const pathname = usePathname();
  const storeKey = `chronolens:view:${pathname}`;
  const [copied, setCopied] = useState(false);
  // saving must wait for the restore pass, or the default state overwrites what was stored
  const hydrated = useRef(false);

  // Restore the view. A URL that carries ?view/?types wins (it's a shared link, meant to
  // reproduce exactly that); otherwise fall back to what this browser last used on this path.
  useEffect(() => {
    let fromUrl = false;
    try {
      const sp = new URLSearchParams(window.location.search);
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
        const saved = JSON.parse(sessionStorage.getItem(storeKey) || "{}");
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

  const [ranking, setRanking] = useState<AiRanking | null>(null);
  const filtered = useMemo(() => events.filter((e) => active.has(e.type)), [events, active]);
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
      sessionStorage.setItem(storeKey, JSON.stringify({ view: nextView, active: [...nextActive] }));
    } catch {
      /* storage unavailable — selection just won't persist */
    }
    try {
      window.history.replaceState(null, "", pathname + encodeView(nextView, nextActive));
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
      <AiPanel events={filtered} ranking={ranking} onRanking={setRanking} />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const count = events.filter((e) => e.type === f.key).length;
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
        <EventList events={ranked} order="asc" />
      )}
    </div>
  );
}
