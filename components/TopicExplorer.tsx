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

export default function TopicExplorer({ events }: { events: TimelineEvent[] }) {
  const [active, setActive] = useState<Set<EventType>>(
    new Set<EventType>(["history", "press", "news"])
  );
  const [view, setView] = useState<"timeline" | "list">("timeline");
  const storeKey = `chronolens:view:${usePathname()}`;
  // saving must wait for the restore pass, or the default state overwrites what was stored
  const hydrated = useRef(false);

  // restore the reader's view and filters when they return from a source
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storeKey) || "{}");
      if (saved.view === "timeline" || saved.view === "list") setView(saved.view);
      if (Array.isArray(saved.active) && saved.active.length) {
        setActive(new Set<EventType>(saved.active));
      }
    } catch {
      /* storage unavailable — start fresh */
    }
    hydrated.current = true;
  }, [storeKey]);

  const [ranking, setRanking] = useState<AiRanking | null>(null);
  const filtered = useMemo(() => events.filter((e) => active.has(e.type)), [events, active]);
  // ranking narrows and reorders; the timeline still renders chronologically
  const ranked = useMemo(() => applyRanking(filtered, ranking), [filtered, ranking]);

  /** Persist from user actions only — an effect would fire with default state and clobber. */
  function persist(nextView: "timeline" | "list", nextActive: Set<EventType>) {
    if (!hydrated.current) return;
    try {
      sessionStorage.setItem(storeKey, JSON.stringify({ view: nextView, active: [...nextActive] }));
    } catch {
      /* storage unavailable — selection just won't persist */
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

        <div className="ml-auto flex rounded-md border border-slate-700">
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
