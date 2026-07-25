"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import PriceTimeline from "./PriceTimeline";
import BiggestMoves from "./BiggestMoves";
import EventList, { dateAnchorId } from "./EventList";
import AiPanel, { type AiRanking } from "./AiPanel";
import { applyRanking } from "./TopicExplorer";
import { EventType, PricePoint, TimelineEvent } from "@/lib/types";

const FILTERS: { key: EventType; label: string }[] = [
  { key: "earnings", label: "Earnings" },
  { key: "filing", label: "Filings" },
  { key: "news", label: "News" },
  { key: "regulation", label: "Sector rules" },
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
  const [active, setActive] = useState<Set<EventType>>(
    new Set<EventType>(["earnings", "filing", "news", "regulation"])
  );
  const pathname = usePathname();
  const [copied, setCopied] = useState(false);
  // the angle a natural-language search prompt carried in ("in the united states")
  const [focusHint, setFocusHint] = useState<string | null>(null);

  // A shared ?types= link reproduces that filter selection on load.
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
      }
    } catch {
      /* malformed URL — ignore */
    }
  }, []);

  const [ranking, setRanking] = useState<AiRanking | null>(null);
  const filtered = useMemo(() => events.filter((e) => active.has(e.type)), [events, active]);
  const ranked = useMemo(() => applyRanking(filtered, ranking), [filtered, ranking]);

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
      <div className="mb-4 flex items-center gap-2">
        <h2 className="mr-2 text-lg font-bold text-slate-100">Timeline</h2>
        {FILTERS.map((f) => (
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
        ))}
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
      <EventList events={ranked} siteDomain={siteDomain} />
    </div>
  );
}
