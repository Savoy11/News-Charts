"use client";

import { useCallback, useMemo, useState } from "react";
import PriceTimeline from "./PriceTimeline";
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

interface Props {
  prices: PricePoint[];
  events: TimelineEvent[];
  siteDomain?: string | null;
}

export default function CompanyExplorer({ prices, events, siteDomain }: Props) {
  const [active, setActive] = useState<Set<EventType>>(
    new Set<EventType>(["earnings", "filing", "news", "regulation"])
  );

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
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  return (
    <div>
      {/* markers stay chronological; ranking narrows the list below */}
      <PriceTimeline prices={prices} events={ranked} onSelectDate={handleSelectDate} />
      <div className="mt-6">
        <AiPanel events={filtered} ranking={ranking} onRanking={setRanking} />
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
        <span className="ml-auto text-xs text-slate-500">
          {ranked.length === filtered.length
            ? `${filtered.length} events`
            : `${ranked.length} of ${filtered.length} events`}
        </span>
      </div>
      <EventList events={ranked} siteDomain={siteDomain} />
    </div>
  );
}
