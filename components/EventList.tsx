"use client";

import { useMemo } from "react";
import { EventType, TimelineEvent } from "@/lib/types";
import { waybackUrl } from "@/lib/wikidata";
import EventThumb from "./EventThumb";

const BADGE: Record<EventType, { label: string; cls: string }> = {
  earnings: { label: "Earnings", cls: "bg-amber-500/15 text-amber-400 border-amber-700/50" },
  filing: { label: "Filing", cls: "bg-sky-500/15 text-sky-400 border-sky-700/50" },
  news: { label: "News", cls: "bg-slate-500/15 text-slate-400 border-slate-600/50" },
  press: { label: "Press", cls: "bg-orange-500/15 text-orange-400 border-orange-700/50" },
  regulation: { label: "Regulation", cls: "bg-rose-500/15 text-rose-400 border-rose-700/50" },
  history: { label: "History", cls: "bg-violet-500/15 text-violet-400 border-violet-700/50" },
  citation: { label: "Cited", cls: "bg-teal-500/15 text-teal-400 border-teal-700/50" },
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
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-slate-200">{ev.title}</span>
        <span className="mt-0.5 block text-xs text-slate-500">
          {ev.source}
          {ev.url ? " ↗" : ""}
          {ev.description ? ` · ${ev.description}` : ""}
        </span>
      </span>
      <EventThumb
        src={ev.imageUrl}
        className="ml-1 h-14 w-14 shrink-0 rounded-md border border-slate-800 object-cover"
      />
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

/** "2026-07-24" → "July 2026". Built from the string parts under UTC so the label never drifts a day across time zones. */
function monthYearLabel(date: string) {
  const [y, m] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
}

/** "2026-07-24" → "Jul 24". The year lives in the month header above, so the day node drops it. */
function dayLabel(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
}

/**
 * One flat row per rendered line, chronological. Years and months are header rows with no
 * timeline dot; day rows keep the dot, the `dateAnchorId` anchor, and the event cards — so the
 * horizontal timeline's click-to-scroll and the dot alignment are unchanged by the grouping.
 */
type Row =
  | { kind: "year"; key: string; year: string }
  | { kind: "month"; key: string; label: string }
  | { kind: "day"; key: string; date: string; items: TimelineEvent[]; approx: boolean };

/**
 * Groups events into Year → Month → Day. Events flagged `yearOnly` (the source knew only the
 * year, so the date was normalised to Jan 1) are bucketed straight under the year as a single
 * "Year only" node — showing them as a precise "Jan 1" would invent a month and day the source
 * never gave. Within a year that approximate bucket sorts as the year's boundary (before
 * January ascending, after December descending).
 */
function buildRows(events: TimelineEvent[], order: "asc" | "desc"): Row[] {
  const byKey = (a: string, b: string) => (order === "desc" ? b.localeCompare(a) : a.localeCompare(b));

  // year -> { months: monthKey -> (date -> events), approx: events | null }
  const years = new Map<
    string,
    { months: Map<string, Map<string, TimelineEvent[]>>; approx: TimelineEvent[] | null }
  >();
  const yearOf = (y: string) => {
    let yb = years.get(y);
    if (!yb) {
      yb = { months: new Map(), approx: null };
      years.set(y, yb);
    }
    return yb;
  };

  for (const ev of events) {
    const year = ev.date.slice(0, 4);
    const yb = yearOf(year);
    if (ev.yearOnly) {
      (yb.approx ??= []).push(ev);
      continue;
    }
    const monthKey = ev.date.slice(0, 7); // YYYY-MM
    const month = yb.months.get(monthKey) ?? new Map<string, TimelineEvent[]>();
    const day = month.get(ev.date) ?? [];
    day.push(ev);
    month.set(ev.date, day);
    yb.months.set(monthKey, month);
  }

  const rows: Row[] = [];
  for (const year of [...years.keys()].sort(byKey)) {
    const yb = years.get(year)!;
    rows.push({ kind: "year", key: `y-${year}`, year });

    // Months and the approximate bucket share one ordering pass; the bucket's key sits just
    // outside the month range so it lands at whichever end of the year `order` puts it.
    const sections = [
      ...[...yb.months.keys()].map((monthKey) => ({ sortKey: monthKey, monthKey })),
      ...(yb.approx ? [{ sortKey: `${year}-00`, monthKey: null as string | null }] : []),
    ].sort((a, b) => byKey(a.sortKey, b.sortKey));

    for (const section of sections) {
      if (section.monthKey === null) {
        rows.push({ kind: "day", key: `a-${year}`, date: `${year}-01-01`, items: yb.approx!, approx: true });
        continue;
      }
      const month = yb.months.get(section.monthKey)!;
      const firstDate = [...month.keys()][0];
      rows.push({ kind: "month", key: `m-${section.monthKey}`, label: monthYearLabel(firstDate) });
      for (const date of [...month.keys()].sort(byKey)) {
        rows.push({ kind: "day", key: `d-${date}`, date, items: month.get(date)!, approx: false });
      }
    }
  }
  return rows;
}

export default function EventList({ events, order = "desc", siteDomain }: Props) {
  const rows = useMemo(() => buildRows(events, order), [events, order]);

  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">No events found.</p>;
  }

  return (
    <ol className="relative border-l border-slate-800 pl-6">
      {rows.map((row) => {
        if (row.kind === "year") {
          return (
            <li key={row.key} className="mb-4 mt-8 flex items-center gap-3 first:mt-0">
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">{row.year}</span>
              <span className="h-px flex-1 bg-slate-800/70" />
            </li>
          );
        }
        if (row.kind === "month") {
          return (
            <li key={row.key} className="mb-3 mt-6 text-sm font-bold text-slate-200">
              {row.label}
            </li>
          );
        }
        return (
          // The year-only node shares its date (Jan 1) with a genuine Jan-1 day group when both
          // exist in a year; give it a distinct anchor so the DOM id stays unique. Nothing scrolls
          // to a year-only anchor (company pages, the only anchor consumer, carry no year-only
          // events), so the precise day rows keep the canonical dateAnchorId contract.
          <li
            key={row.key}
            id={row.approx ? `d-${row.date.slice(0, 4)}-year` : dateAnchorId(row.date)}
            className="mb-6 scroll-mt-24"
          >
            <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-slate-600" />
            {row.approx ? (
              <span className="text-xs font-semibold italic text-slate-500" title="The source gave only the year">
                Year only
              </span>
            ) : (
              <time dateTime={row.date} className="text-xs font-semibold text-slate-400">
                {dayLabel(row.date)}
              </time>
            )}
            <ul className="mt-2 space-y-2">
              {row.items.map((ev) => (
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
        );
      })}
    </ol>
  );
}
