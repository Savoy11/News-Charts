"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { applyFocus } from "@/lib/focus";
import FocusBar from "./FocusBar";
import BestMatches from "./BestMatches";
import { useVisitorFeeds } from "@/lib/useVisitorFeeds";
import { usePathname } from "next/navigation";
import HorizontalTimeline from "./HorizontalTimeline";
import EventList, { dateAnchorId } from "./EventList";
import PriceTimeline from "./PriceTimeline";
import AiPanel, { type AiRanking } from "./AiPanel";
import Annotations from "./Annotations";
import { EventType, PricePoint, TimelineEvent } from "@/lib/types";
import { ANNOTATIONS_EVENT, annotationsAsEvents, loadAnnotations } from "@/lib/annotations";
import { DEFAULT_PREFS, loadPrefs, PREFS_EVENT } from "@/lib/prefs";

/** Keep only what the visitor's model judged relevant, best matches first. */
export function applyRanking(events: TimelineEvent[], ranking: AiRanking | null): TimelineEvent[] {
  if (!ranking) return events;
  return events
    .filter((e) => (ranking.scores.get(e.id) ?? 0) >= 0.35)
    .sort((a, b) => (ranking.scores.get(b.id) ?? 0) - (ranking.scores.get(a.id) ?? 0));
}

/**
 * Every event kind a topic can carry, each with the chip that turns it on.
 *
 * `ALL_TYPES` below seeds the default active set *and* builds the chip row, so a kind missing
 * here is not merely unfiltered — it is discarded on render with no control to bring it back.
 * `db/011` and `db/012` added `governance` and `exploit` without adding them here, which left
 * `/topic/uni` and `/topic/aave` (governance-only subjects) rendering an empty timeline while the
 * Sources panel reported Snapshot contributing events. A `Set<EventType>` cannot be
 * exhaustiveness-checked, so `tsc` was silent; `scripts/check-ui.ts` asserts the coverage instead.
 */
const FILTERS: { key: EventType; label: string }[] = [
  { key: "history", label: "History" },
  { key: "citation", label: "Cited articles" },
  { key: "press", label: "Historical press" },
  { key: "news", label: "Recent news" },
  { key: "onchain", label: "On-chain" },
  { key: "governance", label: "Governance" },
  { key: "exploit", label: "Incidents" },
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

export default function TopicExplorer({
  events,
  prices = [],
  subject,
}: {
  events: TimelineEvent[];
  /** Present only for subjects that have a price series — crypto assets today. */
  prices?: PricePoint[];
  /** what the visitor's own feed keys should be asked about — the topic's title */
  subject: string;
}) {
  // Derived from FILTERS rather than repeated — the same duplication in CompanyExplorer left a
  // newly added event kind filtered out by default. A topic's filter list is deliberately
  // shorter than a company's; this stays in step with whatever it holds.
  const [active, setActive] = useState<Set<EventType>>(() => new Set<EventType>(ALL_TYPES));
  const [view, setView] = useState<"timeline" | "list">("timeline");
  const pathname = usePathname();
  const storeKey = `news-charts:view:${pathname}`;
  const [copied, setCopied] = useState(false);
  // the date the chart last jumped to, so the list can open whatever contains it
  const [reveal, setReveal] = useState<{ date: string; n: number } | null>(null);
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

  // A reader's own notes, merged in so they plot like anything else and never filtered out by
  // the type chips — those select sources, and a note is not a source.
  const [notes, setNotes] = useState<TimelineEvent[]>([]);
  useEffect(() => {
    const refresh = () => setNotes(annotationsAsEvents(loadAnnotations(pathname)) as TimelineEvent[]);
    refresh();
    window.addEventListener(ANNOTATIONS_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(ANNOTATIONS_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [pathname]);

  const [ranking, setRanking] = useState<AiRanking | null>(null);
  // Articles the visitor's own keys add. Merged here rather than server-side because they were
  // fetched under the visitor's licence and must never reach shared storage.
  const mine = useVisitorFeeds(subject, capped);
  // The keyless half of a focused search: narrow this subject's own events to the ones that also
  // concern the influence the visitor asked about. That intersection is what "how did X affect Y"
  // is actually asking for — Y's story, limited to the part X is in.
  const [showAll, setShowAll] = useState(false);
  const focusResult = useMemo(
    () => applyFocus([...capped, ...mine], showAll ? null : focusHint),
    [capped, mine, focusHint, showAll]
  );
  const filtered = useMemo(
    () => [...focusResult.events.filter((e) => active.has(e.type)), ...notes],
    [focusResult, active, notes]
  );
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

  /**
   * Clicking the chart jumps the list to the nearest event group at or before that day —
   * the same contract CompanyExplorer uses, so the anchor ids stay the one shared thing.
   */
  function jumpToDate(date: string) {
    const dates = [...new Set(ranked.map((e) => e.date))].sort();
    if (!dates.length) return;
    let target: string | null = null;
    for (const d of dates) {
      if (d <= date) target = d;
      else break;
    }
    if (view !== "list") chooseView("list"); // the anchors only exist in the list view
    const landing = target ?? dates[0];
    // open whatever section contains it before scrolling, or the reader lands on a shut header
    setReveal((r) => ({ date: landing, n: (r?.n ?? 0) + 1 }));
    // let the list mount before scrolling to an anchor inside it
    setTimeout(() => {
      const el = document.getElementById(dateAnchorId(landing));
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
      el?.classList.add("ring-1", "ring-sky-500");
      setTimeout(() => el?.classList.remove("ring-1", "ring-sky-500"), 2000);
    }, 0);
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
      {focusHint && (
        <FocusBar
          focus={focusHint}
          result={focusResult}
          subject={subject}
          onClear={() => setShowAll(true)}
        />
      )}

      {/* Best-first over the focus matches, additive: the chronological views below still
          render every match. Type chips apply so the strip never offers a hidden kind. */}
      <BestMatches result={focusResult} activeTypes={active} onJump={jumpToDate} />

      <AiPanel
        events={filtered}
        ranking={ranking}
        onRanking={setRanking}
        initialInstruction={focusHint ?? undefined}
      />

      {/* A topic with a continuous price series gets the same chart a company page has, so
          events can be read against the price. Ordinary topics have no price rows and are
          untouched by this. */}
      {prices.length > 0 && (
        <div className="mb-4">
          <PriceTimeline prices={prices} events={ranked} onSelectDate={jumpToDate} />
        </div>
      )}

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

      <Annotations path={pathname} />

      {view === "timeline" ? (
        <HorizontalTimeline events={ranked} />
      ) : (
        <EventList
          events={ranked}
          order="asc"
          persistKey={`news-charts:collapse:${pathname}`}
          reveal={reveal}
        />
      )}
    </div>
  );
}
