"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import PriceTimeline from "./PriceTimeline";
import HorizontalTimeline from "./HorizontalTimeline";
import BiggestMoves from "./BiggestMoves";
import EventList, { dateAnchorId } from "./EventList";
import AiPanel, { type AiRanking } from "./AiPanel";
import { applyRanking } from "./TopicExplorer";
import { EventType, PricePoint, TimelineEvent } from "@/lib/types";

const FILTERS: { key: EventType; label: string }[] = [
  { key: "history", label: "History" },
  { key: "citation", label: "Cited articles" },
  { key: "press", label: "Historical press" },
  { key: "earnings", label: "Earnings" },
  { key: "filing", label: "Filings" },
  { key: "news", label: "News" },
  { key: "regulation", label: "Sector rules" },
  { key: "corporate_action", label: "Splits & dividends" },
];

const ALL_TYPES = FILTERS.map((f) => f.key);

/** Encode the active type filters as ?types= — omitted entirely when all are on (the default). */
function encodeTypes(active: Set<EventType>, focus: string | null): string {
  const p = new URLSearchParams();
  const on = ALL_TYPES.filter((t) => active.has(t));
  if (on.length !== ALL_TYPES.length) p.set("types", on.join(","));
  if (focus) p.set("focus", focus); // survives filter toggles — it came from the search prompt
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

interface Props {
  prices: PricePoint[];
  events: TimelineEvent[];
  siteDomain?: string | null;
}

export default function CompanyExplorer({ prices, events, siteDomain }: Props) {
  // Derived from FILTERS, never a second hand-written list: this defaulted to a literal of the
  // seven kinds that existed when it was written, so adding an eighth left it filtered out by
  // default — its chip rendered, inactive, and its rows never appeared. `Set<EventType>` cannot
  // be checked for exhaustiveness, so the type system could not catch that.
  const [active, setActive] = useState<Set<EventType>>(() => new Set<EventType>(ALL_TYPES));
  const pathname = usePathname();
  const [copied, setCopied] = useState(false);
  // the angle a natural-language search prompt carried in ("in the united states")
  const [focusHint, setFocusHint] = useState<string | null>(null);

  const filterKey = `news-charts:filters:${pathname}`;

  // Restore the filter selection: a shared ?types= link wins (reproduces exactly that view);
  // otherwise fall back to what this browser last chose here, remembered across visits.
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const f = sp.get("focus");
      if (f) setFocusHint(f);
      const t = sp.get("types");
      if (t !== null) {
        const set = new Set(
          t.split(",").filter((x): x is EventType => (ALL_TYPES as string[]).includes(x))
        );
        if (set.size) setActive(set);
        return;
      }
      const saved = JSON.parse(localStorage.getItem(filterKey) || "null");
      if (Array.isArray(saved) && saved.length) {
        const set = new Set(saved.filter((x): x is EventType => (ALL_TYPES as string[]).includes(x)));
        if (set.size) setActive(set);
      }
    } catch {
      /* malformed URL / storage — ignore */
    }
  }, [filterKey]);

  const [ranking, setRanking] = useState<AiRanking | null>(null);
  const filtered = useMemo(() => events.filter((e) => active.has(e.type)), [events, active]);
  const ranked = useMemo(() => applyRanking(filtered, ranking), [filtered, ranking]);

  // The story before the ticker: events older than the first trading day can never sit
  // on the price chart, so they get their own timeline — the run-up to going public.
  const firstTrade = prices[0]?.time ?? null;
  const preIpo = useMemo(
    () =>
      firstTrade
        ? ranked
            .filter((e) => e.date < firstTrade)
            .sort((a, b) => a.date.localeCompare(b.date))
        : [],
    [ranked, firstTrade]
  );

  const handleSelectDate = useCallback(
    (date: string) => {
      // jump to the nearest event group at or before the clicked trading day
      const dates = [...new Set(filtered.map((e) => e.date))].sort();
      let target: string | null = null;
      for (const d of dates) {
        if (d <= date) target = d;
        else break;
      }
      const el = document.getElementById(dateAnchorId(target ?? dates[0]));
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
      el?.classList.add("ring-1", "ring-sky-500");
      setTimeout(() => el?.classList.remove("ring-1", "ring-sky-500"), 2000);
    },
    [filtered]
  );

  function toggle(type: EventType) {
    const next = new Set(active);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    setActive(next);
    // reflect the selection in the URL (replaceState: no history spam, no navigation)
    try {
      window.history.replaceState(null, "", pathname + encodeTypes(next, focusHint));
    } catch {
      /* history unavailable — link just won't reflect the filters */
    }
    // remember it for next visit too (URL only survives if the link is shared/kept)
    try {
      localStorage.setItem(filterKey, JSON.stringify([...next]));
    } catch {
      /* storage unavailable — selection just won't persist */
    }
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
      {preIpo.length > 0 && (
        <section className="mb-6">
          <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2">
            <h2 className="text-lg font-bold text-slate-100">Before the ticker</h2>
            <span className="text-xs text-slate-500">
              {preIpo.length} events before the first trading day ({firstTrade}) — the run-up to
              going public
            </span>
          </div>
          <HorizontalTimeline events={preIpo} />
        </section>
      )}

      {/* markers stay chronological; ranking narrows the list below */}
      <PriceTimeline prices={prices} events={ranked} onSelectDate={handleSelectDate} />
      {/* pairs each big move with the nearest displayed event, so it tracks the filters/search */}
      <BiggestMoves prices={prices} events={ranked} onSelectDate={handleSelectDate} />
      <div className="mt-6">
        <AiPanel
          events={filtered}
          ranking={ranking}
          onRanking={setRanking}
          initialInstruction={focusHint ?? undefined}
        />
      </div>
      {/* flex-wrap so the type chips stack on a phone instead of running off the side —
          TopicExplorer's equivalent row already wraps. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-lg font-bold text-slate-100">Timeline</h2>
        {FILTERS.map((f) => {
          // hide chips with nothing behind them — a company with no Wikipedia story
          // shouldn't advertise History/Cited filters that can't do anything
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
              {f.label}
            </button>
          );
        })}
        <button
          onClick={copyLink}
          title="Copy a link to this filtered view"
          className="ml-auto rounded-md border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-400 transition-colors hover:border-sky-600 hover:text-sky-300"
        >
          {copied ? "Copied ✓" : "Copy link"}
        </button>
        <span className="text-xs text-slate-500">
          {ranked.length === filtered.length
            ? `${filtered.length} events`
            : `${ranked.length} of ${filtered.length} events`}
        </span>
      </div>
      <EventList events={ranked} siteDomain={siteDomain} persistKey={`news-charts:collapse:${pathname}`} />
    </div>
  );
}
