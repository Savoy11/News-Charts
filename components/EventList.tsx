"use client";

import { useMemo, useState } from "react";
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

type DayRow = Extract<Row, { kind: "day" }>;
type RenderRow = Row | { kind: "filings"; key: string; days: DayRow[] };

// a run of filing-only days must reach this many filings before it collapses
const MIN_FILING_STACK = 3;

/**
 * Collapse consecutive filing-only day rows into one compact, cyclable card. Filings
 * arrive in near-identical runs ("6-K filing" × 12) that bury everything else; one row
 * with a pager reads the same information in a fraction of the scroll. Month and year
 * headers break runs naturally, so a stack never spans a month boundary. Days that mix
 * a filing with news stay as ordinary rows — the mix is the story there.
 */
function condenseFilings(rows: Row[]): RenderRow[] {
  const out: RenderRow[] = [];
  let run: DayRow[] = [];
  const flush = () => {
    const total = run.reduce((n, d) => n + d.items.length, 0);
    if (total >= MIN_FILING_STACK) {
      out.push({ kind: "filings", key: `f-${run[0].date}`, days: run });
    } else {
      out.push(...run);
    }
    run = [];
  };
  for (const row of rows) {
    if (row.kind === "day" && !row.approx && row.items.every((e) => e.type === "filing")) {
      run.push(row);
      continue;
    }
    if (run.length) flush();
    out.push(row);
  }
  if (run.length) flush();
  return out;
}

const FORM_RE = /\b(10-K\/?A?|10-Q\/?A?|8-K\/?A?|6-K\/?A?|20-F|40-F|S-\d\w*|F-\d\w*|13[DG]\/?A?|DEF 14A|424B\d|SC 13[DG])\b/i;

/** "6-K ×4 · 8-K ×2" — which forms are in the stack, most frequent first. */
function formSummary(items: TimelineEvent[]): string {
  const counts = new Map<string, number>();
  for (const ev of items) {
    const form = ev.title.match(FORM_RE)?.[1].toUpperCase() ?? "filing";
    counts.set(form, (counts.get(form) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([form, n]) => (n > 1 ? `${form} ×${n}` : form))
    .join(" · ");
}

/** One collapsed card for a run of filings: cycle with ‹ ›, or open the full list. */
function FilingStack({ days }: { days: DayRow[] }) {
  const all = useMemo(
    () => days.flatMap((d) => d.items.map((ev) => ({ ...ev, date: d.date }))),
    [days]
  );
  const [idx, setIdx] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const cur = all[Math.min(idx, all.length - 1)];
  const step = (d: number) => setIdx((i) => (i + d + all.length) % all.length);

  return (
    <div className="relative rounded-lg border border-slate-800 bg-slate-900/60 transition-colors hover:border-slate-700">
      {/* invisible anchors so the chart's click-to-jump still lands on swallowed days */}
      {days.map((d) => (
        <span
          key={d.date}
          id={dateAnchorId(d.date)}
          className="pointer-events-none absolute inset-0 rounded-lg scroll-mt-24"
        />
      ))}
      <div className="flex flex-wrap items-center gap-2 px-3 pt-3">
        <span
          className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${BADGE.filing.cls}`}
        >
          {all.length} filings
        </span>
        <span className="text-xs text-slate-400">{formSummary(all)}</span>
        <span className="text-xs text-slate-600">
          {dayLabel(days[0].date)} – {dayLabel(days[days.length - 1].date)}
        </span>
        <button
          onClick={() => setExpanded((e) => !e)}
          className="ml-auto rounded border border-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-500 transition-colors hover:border-sky-700 hover:text-sky-300"
        >
          {expanded ? "Collapse" : "Show all"}
        </button>
      </div>

      {expanded ? (
        <ul className="space-y-1 p-2">
          {all.map((ev) => (
            <li key={ev.id}>
              <a
                href={ev.url ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-baseline gap-2 rounded px-2 py-1 hover:bg-slate-800/50"
              >
                <time dateTime={ev.date} className="w-14 shrink-0 text-[11px] text-slate-500">
                  {dayLabel(ev.date)}
                </time>
                <span className="min-w-0 flex-1 truncate text-sm text-slate-300">{ev.title}</span>
                <span className="shrink-0 text-[10px] text-slate-600">{ev.source} ↗</span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex items-center gap-2 p-3 pt-2">
          <button
            onClick={() => step(-1)}
            aria-label="Previous filing"
            className="h-7 w-7 shrink-0 rounded-md border border-slate-700 text-sm text-slate-400 transition-colors hover:border-sky-600 hover:text-sky-300"
          >
            ‹
          </button>
          <span className="shrink-0 text-[10px] tabular-nums text-slate-500">
            {Math.min(idx, all.length - 1) + 1}/{all.length}
          </span>
          <button
            onClick={() => step(1)}
            aria-label="Next filing"
            className="h-7 w-7 shrink-0 rounded-md border border-slate-700 text-sm text-slate-400 transition-colors hover:border-sky-600 hover:text-sky-300"
          >
            ›
          </button>
          <a
            href={cur.url ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 flex-1 rounded px-2 py-1 hover:bg-slate-800/50"
          >
            <span className="block truncate text-sm font-medium text-slate-200">{cur.title}</span>
            <span className="mt-0.5 block text-xs text-slate-500">
              {dayLabel(cur.date)} · {cur.source} ↗
            </span>
          </a>
        </div>
      )}
    </div>
  );
}

export default function EventList({ events, order = "desc", siteDomain }: Props) {
  const rows = useMemo(() => condenseFilings(buildRows(events, order)), [events, order]);

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
        if (row.kind === "filings") {
          return (
            <li key={row.key} className="mb-6 scroll-mt-24">
              <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-slate-600" />
              <FilingStack days={row.days} />
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
