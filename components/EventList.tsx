"use client";

import { useMemo } from "react";
import { EventType, TimelineEvent } from "@/lib/types";
import { waybackUrl } from "@/lib/wikidata";

const BADGE: Record<EventType, { label: string; cls: string }> = {
  earnings: { label: "Earnings", cls: "bg-amber-500/15 text-amber-400 border-amber-700/50" },
  filing: { label: "Filing", cls: "bg-sky-500/15 text-sky-400 border-sky-700/50" },
  news: { label: "News", cls: "bg-slate-500/15 text-slate-400 border-slate-600/50" },
  press: { label: "Press", cls: "bg-orange-500/15 text-orange-400 border-orange-700/50" },
  regulation: { label: "Regulation", cls: "bg-rose-500/15 text-rose-400 border-rose-700/50" },
  history: { label: "History", cls: "bg-violet-500/15 text-violet-400 border-violet-700/50" },
};

export function dateAnchorId(date: string) {
  return `d-${date}`;
}

const ROW_CLASS = "flex items-start gap-2 p-3";

/** The whole row is the click target, so there's no need to hit the title text exactly. */
function EventRow({ ev }: { ev: TimelineEvent }) {
  const body = (
    <>
      <span
        className={`mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${BADGE[ev.type].cls}`}
      >
        {BADGE[ev.type].label}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-200">{ev.title}</span>
        <span className="mt-0.5 block text-xs text-slate-500">
          {ev.source}
          {ev.url ? " ↗" : ""}
          {ev.description ? ` · ${ev.description}` : ""}
        </span>
      </span>
    </>
  );

  if (!ev.url) return <div className={ROW_CLASS}>{body}</div>;
  return (
    <a
      href={ev.url}
      target="_blank"
      rel="noopener noreferrer"
      title={`Open ${ev.source} (new tab)`}
      className={`${ROW_CLASS} cursor-pointer rounded-lg hover:bg-slate-800/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-500`}
    >
      {body}
    </a>
  );
}

/**
 * Sits beside the row rather than inside it — the row is already one big anchor, and
 * nesting links is invalid HTML.
 */
function SiteSnapshotLink({ domain, date }: { domain: string; date: string }) {
  return (
    <a
      href={waybackUrl(domain, date)}
      target="_blank"
      rel="noopener noreferrer"
      title={`See ${domain} as it looked around ${date} (Wayback Machine, new tab)`}
      className="mr-2 mt-2 shrink-0 self-start rounded border border-slate-800 px-2 py-1 text-[10px] font-semibold text-slate-500 transition-colors hover:border-teal-600 hover:text-teal-300"
    >
      site that day ↗
    </a>
  );
}

interface Props {
  events: TimelineEvent[];
  order?: "asc" | "desc";
  /** when set, each row offers a Wayback snapshot of the company site on that date */
  siteDomain?: string | null;
}

export default function EventList({ events, order = "desc", siteDomain }: Props) {
  const groups = useMemo(() => {
    const byDate = new Map<string, TimelineEvent[]>();
    for (const ev of events) {
      const list = byDate.get(ev.date) ?? [];
      list.push(ev);
      byDate.set(ev.date, list);
    }
    const dates = [...byDate.keys()].sort((a, b) =>
      order === "desc" ? b.localeCompare(a) : a.localeCompare(b)
    );
    return dates.map((d) => ({ date: d, items: byDate.get(d)! }));
  }, [events, order]);

  if (groups.length === 0) {
    return <p className="text-sm text-slate-500">No events found.</p>;
  }

  return (
    <ol className="relative border-l border-slate-800 pl-6">
      {groups.map((g) => (
        <li key={g.date} id={dateAnchorId(g.date)} className="mb-8 scroll-mt-24">
          <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-slate-600" />
          <time className="text-sm font-semibold text-slate-300">
            {new Date(`${g.date}T00:00:00`).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </time>
          <ul className="mt-2 space-y-2">
            {g.items.map((ev) => (
              <li
                key={ev.id}
                className="flex items-stretch rounded-lg border border-slate-800 bg-slate-900/60 transition-colors hover:border-slate-700"
              >
                <div className="min-w-0 flex-1">
                  <EventRow ev={ev} />
                </div>
                {siteDomain && <SiteSnapshotLink domain={siteDomain} date={ev.date} />}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
