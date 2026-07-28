"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EventType, TimelineEvent } from "@/lib/types";
import { waybackUrl } from "@/lib/wikidata";
import { loadJSON, saveJSON } from "@/lib/viewState";
import EventThumb from "./EventThumb";

const BADGE: Record<EventType, { label: string; cls: string }> = {
  earnings: { label: "Earnings", cls: "bg-amber-500/15 text-amber-400 border-amber-700/50" },
  filing: { label: "Filing", cls: "bg-sky-500/15 text-sky-400 border-sky-700/50" },
  news: { label: "News", cls: "bg-slate-500/15 text-slate-400 border-slate-600/50" },
  press: { label: "Press", cls: "bg-orange-500/15 text-orange-400 border-orange-700/50" },
  regulation: { label: "Regulation", cls: "bg-rose-500/15 text-rose-400 border-rose-700/50" },
  history: { label: "History", cls: "bg-violet-500/15 text-violet-400 border-violet-700/50" },
  citation: { label: "Cited", cls: "bg-teal-500/15 text-teal-400 border-teal-700/50" },
  corporate_action: {
    label: "Corporate action",
    cls: "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-700/50",
  },
  onchain: { label: "On-chain", cls: "bg-lime-500/15 text-lime-400 border-lime-700/50" },
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
  /** when set, which sections are collapsed is remembered here across visits */
  persistKey?: string;
  /**
   * A date the reader has just jumped to from the chart. Its year and month are opened, because
   * landing on a collapsed section shows them the header of the thing they asked to see and
   * nothing else. The counter makes a repeat jump to the same date re-open it.
   */
  reveal?: { date: string; n: number } | null;
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
  | { kind: "month"; key: string; label: string; year: string; monthKey: string }
  | {
      kind: "day";
      key: string;
      date: string;
      items: TimelineEvent[];
      approx: boolean;
      year: string;
      monthKey: string | null;
    };

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
        rows.push({ kind: "day", key: `a-${year}`, date: `${year}-01-01`, items: yb.approx!, approx: true, year, monthKey: null });
        continue;
      }
      const month = yb.months.get(section.monthKey)!;
      const firstDate = [...month.keys()][0];
      rows.push({ kind: "month", key: `m-${section.monthKey}`, label: monthYearLabel(firstDate), year, monthKey: section.monthKey });
      for (const date of [...month.keys()].sort(byKey)) {
        rows.push({ kind: "day", key: `d-${date}`, date, items: month.get(date)!, approx: false, year, monthKey: section.monthKey });
      }
    }
  }
  return rows;
}

type DayRow = Extract<Row, { kind: "day" }>;
type RenderRow =
  | Row
  | { kind: "filings"; key: string; days: DayRow[]; year: string; monthKey: string | null };

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
      out.push({
        kind: "filings",
        key: `f-${run[0].date}`,
        days: run,
        year: run[0].year,
        monthKey: run[0].monthKey,
      });
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

const plural = (n: number) => `${n} event${n === 1 ? "" : "s"}`;
const yearAnchorId = (year: string) => `y-${year}`;
const PEEK_MAX = 8; // titles shown in a hover preview before "+N more"

/**
 * Zero-height anchor stand-ins for a collapsed section's days. They keep the price
 * chart's click-to-jump contract alive: `dateAnchorId(date)` still resolves and
 * `scrollIntoView` lands at the collapsed section instead of finding nothing.
 */
function CollapsedAnchors({ dates }: { dates: string[] }) {
  return (
    <li className="h-0" aria-hidden>
      {dates.map((d) => (
        <span key={d} id={dateAnchorId(d)} className="block scroll-mt-24" />
      ))}
    </li>
  );
}

const DOT: Record<EventType, string> = {
  earnings: "bg-amber-400",
  filing: "bg-sky-400",
  news: "bg-slate-400",
  press: "bg-orange-400",
  regulation: "bg-rose-400",
  history: "bg-violet-400",
  citation: "bg-teal-400",
  corporate_action: "bg-fuchsia-400",
  onchain: "bg-lime-400",
};

/** Preview of a collapsed section's contents, shown on hover so it can be read without a click. */
function PeekPopover({
  items,
  total,
  onEnter,
  onLeave,
}: {
  items: TimelineEvent[];
  total: number;
  onEnter: () => void;
  onLeave: () => void;
}) {
  return (
    <div
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className="absolute left-6 top-full z-20 mt-1 w-72 rounded-lg border border-slate-700 bg-slate-900 p-2 shadow-xl"
    >
      <ul className="space-y-1">
        {items.map((ev) => (
          <li key={ev.id} className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[ev.type]}`} />
            <span className="truncate text-[11px] text-slate-300">{ev.title}</span>
          </li>
        ))}
      </ul>
      {total > items.length && (
        <p className="mt-1 px-1 text-[10px] text-slate-500">
          +{total - items.length} more — click to expand
        </p>
      )}
    </div>
  );
}

export default function EventList({ events, order = "asc", siteDomain, persistKey, reveal }: Props) {
  const rows = useMemo(() => condenseFilings(buildRows(events, order)), [events, order]);

  // Per-year/-month tallies (so a collapsed header still says how much it hides) plus a small
  // preview of each section's titles, used for the hover peek without expanding.
  const { yearCount, monthCount, years, yearPeek, monthPeek } = useMemo(() => {
    const yearCount = new Map<string, number>();
    const monthCount = new Map<string, number>();
    const yearPeek = new Map<string, TimelineEvent[]>();
    const monthPeek = new Map<string, TimelineEvent[]>();
    const years: string[] = [];
    const peek = (map: Map<string, TimelineEvent[]>, key: string, items: TimelineEvent[]) => {
      const a = map.get(key) ?? [];
      if (a.length < PEEK_MAX) a.push(...items.slice(0, PEEK_MAX - a.length));
      map.set(key, a);
    };
    const add = (year: string, monthKey: string | null, items: TimelineEvent[]) => {
      yearCount.set(year, (yearCount.get(year) ?? 0) + items.length);
      peek(yearPeek, year, items);
      if (monthKey) {
        monthCount.set(monthKey, (monthCount.get(monthKey) ?? 0) + items.length);
        peek(monthPeek, monthKey, items);
      }
    };
    for (const r of rows) {
      if (r.kind === "year") years.push(r.year);
      else if (r.kind === "day") add(r.year, r.monthKey, r.items);
      else if (r.kind === "filings") add(r.year, r.monthKey, r.days.flatMap((d) => d.items));
    }
    return { yearCount, monthCount, years, yearPeek, monthPeek };
  }, [rows]);

  const [collapsedYears, setCollapsedYears] = useState<Set<string>>(new Set());
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set());

  // Remember-my-view: load the saved collapse set for this subject after mount (so SSR and the
  // first client render agree), then save on every change. The hydrated gate stops the initial
  // default state from overwriting what was stored.
  const hydrated = useRef(false);
  useEffect(() => {
    hydrated.current = false;
    if (!persistKey) return;
    const saved = loadJSON<{ years?: string[]; months?: string[] }>(persistKey, {});
    setCollapsedYears(new Set(saved.years ?? []));
    setCollapsedMonths(new Set(saved.months ?? []));
    hydrated.current = true;
  }, [persistKey]);
  useEffect(() => {
    if (!persistKey || !hydrated.current) return;
    saveJSON(persistKey, { years: [...collapsedYears], months: [...collapsedMonths] });
  }, [persistKey, collapsedYears, collapsedMonths]);

  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };
  const toggleYear = (y: string) => setCollapsedYears((s) => toggle(s, y));
  const toggleMonth = (k: string) => setCollapsedMonths((s) => toggle(s, k));

  // Open whatever contains the jumped-to date. Set-identity is preserved when nothing changes
  // so this cannot loop, and it runs after the restore pass for the same reason saving does.
  useEffect(() => {
    if (!reveal?.date) return;
    const year = reveal.date.slice(0, 4);
    const monthKey = reveal.date.slice(0, 7);
    setCollapsedYears((prev) => {
      if (!prev.has(year)) return prev;
      const next = new Set(prev);
      next.delete(year);
      return next;
    });
    setCollapsedMonths((prev) => {
      if (!prev.has(monthKey)) return prev;
      const next = new Set(prev);
      next.delete(monthKey);
      return next;
    });
  }, [reveal?.date, reveal?.n]);

  const allCollapsed = years.length > 0 && years.every((y) => collapsedYears.has(y));
  const toggleAll = () => setCollapsedYears(allCollapsed ? new Set() : new Set(years));

  // Jump-to-year: expand the year (so its content is there to see) and scroll to its header.
  const jumpToYear = (y: string) => {
    setCollapsedYears((s) => {
      const next = new Set(s);
      next.delete(y);
      return next;
    });
    document.getElementById(yearAnchorId(y))?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Hover-to-peek: which collapsed header is being previewed, with a small close delay so the
  // pointer can travel from the header onto the popover without it vanishing.
  const [peek, setPeek] = useState<string | null>(null);
  const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openPeek = (key: string) => {
    if (peekTimer.current) clearTimeout(peekTimer.current);
    setPeek(key);
  };
  const closePeek = () => {
    if (peekTimer.current) clearTimeout(peekTimer.current);
    peekTimer.current = setTimeout(() => setPeek(null), 200);
  };

  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">No events found.</p>;
  }

  // a month/day is hidden when its year is collapsed, a day also when its own month is collapsed
  const hidden = (year: string, monthKey: string | null) =>
    collapsedYears.has(year) || (monthKey !== null && collapsedMonths.has(monthKey));

  return (
    <div>
      {years.length > 1 && (
        <div className="sticky top-0 z-10 mb-2 flex items-center gap-1 overflow-x-auto rounded-md border border-slate-800 bg-slate-950/85 px-2 py-1.5 backdrop-blur">
          <span className="mr-1 shrink-0 text-[10px] font-bold uppercase tracking-widest text-slate-600">
            Jump
          </span>
          {years.map((y) => (
            <button
              key={y}
              onClick={() => jumpToYear(y)}
              className="shrink-0 rounded px-1.5 py-0.5 text-[11px] tabular-nums text-slate-400 transition-colors hover:bg-slate-800 hover:text-sky-300"
            >
              {y}
            </button>
          ))}
          <button
            onClick={toggleAll}
            className="ml-auto shrink-0 rounded border border-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-500 transition-colors hover:border-sky-700 hover:text-sky-300"
          >
            {allCollapsed ? "Expand all" : "Collapse all"}
          </button>
        </div>
      )}
      <ol className="relative border-l border-slate-800 pl-6">
        {rows.map((row) => {
          if (row.kind === "year") {
            const yc = collapsedYears.has(row.year);
            const pk = yearAnchorId(row.year);
            return (
              <li
                key={row.key}
                id={pk}
                className="relative mb-4 mt-8 scroll-mt-24 first:mt-0"
                onMouseEnter={yc ? () => openPeek(pk) : undefined}
                onMouseLeave={yc ? closePeek : undefined}
              >
                <button
                  onClick={() => toggleYear(row.year)}
                  aria-expanded={!yc}
                  className="group flex w-full items-center gap-2.5 text-left"
                >
                  <span className="w-2 shrink-0 text-[9px] text-slate-600 group-hover:text-slate-400">
                    {yc ? "▶" : "▼"}
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500 group-hover:text-slate-300">
                    {row.year}
                  </span>
                  <span className="h-px flex-1 bg-slate-800/70" />
                  <span className="shrink-0 text-[10px] tabular-nums text-slate-600">
                    {plural(yearCount.get(row.year) ?? 0)}
                  </span>
                </button>
                {yc && peek === pk && (
                  <PeekPopover
                    items={yearPeek.get(row.year) ?? []}
                    total={yearCount.get(row.year) ?? 0}
                    onEnter={() => openPeek(pk)}
                    onLeave={closePeek}
                  />
                )}
              </li>
            );
          }
          if (row.kind === "month") {
            if (collapsedYears.has(row.year)) return null;
            const mc = collapsedMonths.has(row.monthKey);
            const pk = `m-${row.monthKey}`;
            return (
              <li
                key={row.key}
                className="relative mb-3 mt-6"
                onMouseEnter={mc ? () => openPeek(pk) : undefined}
                onMouseLeave={mc ? closePeek : undefined}
              >
                <button
                  onClick={() => toggleMonth(row.monthKey)}
                  aria-expanded={!mc}
                  className="group flex w-full items-center gap-2 text-left"
                >
                  <span className="w-2 shrink-0 text-[9px] text-slate-600 group-hover:text-slate-400">
                    {mc ? "▶" : "▼"}
                  </span>
                  <span className="text-sm font-bold text-slate-200 group-hover:text-sky-300">
                    {row.label}
                  </span>
                  <span className="text-[10px] font-normal text-slate-600">
                    · {plural(monthCount.get(row.monthKey) ?? 0)}
                  </span>
                </button>
                {mc && peek === pk && (
                  <PeekPopover
                    items={monthPeek.get(row.monthKey) ?? []}
                    total={monthCount.get(row.monthKey) ?? 0}
                    onEnter={() => openPeek(pk)}
                    onLeave={closePeek}
                  />
                )}
              </li>
            );
          }
          if (row.kind === "filings") {
            if (hidden(row.year, row.monthKey)) {
              return <CollapsedAnchors key={row.key} dates={row.days.map((d) => d.date)} />;
            }
            return (
              <li key={row.key} className="mb-6 scroll-mt-24">
                <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-slate-600" />
                <FilingStack days={row.days} />
              </li>
            );
          }

          // day row
          if (row.approx) {
            if (collapsedYears.has(row.year)) return null; // year-only rows are never jump targets
            return (
              <li key={row.key} id={`d-${row.date.slice(0, 4)}-year`} className="mb-6 scroll-mt-24">
                <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-slate-600" />
                <span className="text-xs font-semibold italic text-slate-500" title="The source gave only the year">
                  Year only
                </span>
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
          }
          if (hidden(row.year, row.monthKey)) {
            return <CollapsedAnchors key={row.key} dates={[row.date]} />;
          }
          return (
            <li key={row.key} id={dateAnchorId(row.date)} className="mb-6 scroll-mt-24">
              <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-slate-600" />
              <time dateTime={row.date} className="text-xs font-semibold text-slate-400">
                {dayLabel(row.date)}
              </time>
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
    </div>
  );
}
