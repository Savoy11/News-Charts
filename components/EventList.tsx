"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EventType, TimelineEvent } from "@/lib/types";
import { waybackUrl, waybackCouldHave } from "@/lib/wikidata";
import { loadJSON, saveJSON } from "@/lib/viewState";
import { toneOf } from "@/lib/sentiment";
import { safeHref } from "@/lib/safeUrl";
import ChainRef from "./ChainRef";
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
  annotation: { label: "Your note", cls: "bg-cyan-500/15 text-cyan-400 border-cyan-700/50" },
  // indigo: adjacent to on-chain lime without being it, because the distinction between a vote
  // and a transaction is exactly what a reader needs to see at a glance
  governance: { label: "Governance", cls: "bg-indigo-500/15 text-indigo-400 border-indigo-700/50" },
  exploit: { label: "Exploit", cls: "bg-red-500/15 text-red-400 border-red-700/50" },
  macro: { label: "Economy", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-700/50" },
  recall: { label: "Recall", cls: "bg-yellow-500/15 text-yellow-300 border-yellow-700/50" },
};

export function dateAnchorId(date: string) {
  return `d-${date}`;
}

const ROW_CLASS = "flex items-start gap-2 p-3";

/**
 * A small tone dot beside a headline — perceived tone, which is worth seeing *against* the
 * actual price move because the interesting case is when the two disagree. Neutral shows
 * nothing at all rather than a grey dot: absence is the honest rendering of "no opinion", and a
 * third colour would imply we had looked and decided.
 */
function ToneDot({ ev }: { ev: TimelineEvent }) {
  const tone = toneOf(ev);
  if (tone === "neutral") return null;
  return (
    <span
      role="img"
      aria-label={`Headline reads as ${tone} — a keyword estimate`}
      title={`Headline reads as ${tone} — a keyword estimate, not a judgement of the news`}
      className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
        tone === "positive" ? "bg-emerald-400" : "bg-red-400"
      }`}
    />
  );
}

/** The whole row is the click target, so there's no need to hit the title text exactly. */
function EventRow({ ev }: { ev: TimelineEvent }) {
  const href = safeHref(ev.url);
  const body = (
    <>
      <ToneDot ev={ev} />
      <span
        className={`mt-0.5 shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${BADGE[ev.type].cls}`}
      >
        {BADGE[ev.type].label}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-slate-200">{ev.title}</span>
        <span className="mt-0.5 block text-xs text-slate-500">
          <ChainRef ev={ev} />
          {ev.source}
          {href ? " ↗" : ""}
          {ev.description ? ` · ${ev.description}` : ""}
        </span>
      </span>
      <EventThumb
        src={ev.imageUrl}
        className="ml-1 h-14 w-14 shrink-0 rounded-md border border-slate-800 object-cover"
      />
    </>
  );

  // data-event-row is a handle for the browser checks and the list profiler: counting rows by
  // their utility classes broke the moment the classes changed, and silently passed.
  if (!href) return <div className={ROW_CLASS} data-event-row>{body}</div>;
  return (
    <a
      data-event-row
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={`Open ${ev.source} (new tab)`}
      className={`${ROW_CLASS} cursor-pointer rounded-lg hover:bg-slate-800/50 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-sky-500`}
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
  // Nothing was archived before 1996, so for an earlier event there is no capture to be near and
  // no honest link to offer. This rendered on every pre-web row — the whole "Before the chart"
  // section of a company like Ford — each one promising a page that does not exist.
  if (!waybackCouldHave(date)) return null;
  return (
    <a
      href={waybackUrl(domain, date)}
      target="_blank"
      rel="noopener noreferrer"
      // "that day" was the false part: Wayback redirects to its NEAREST capture with no bound on
      // how far that is, so the label promised a precision the mechanism never had. What the link
      // actually delivers is the closest capture the archive holds, and it now says so.
      title={`See the closest archived capture of ${domain} to ${date} (Wayback Machine, new tab)`}
      className="mr-2 mt-2 shrink-0 self-start rounded-sm border border-slate-800 px-2 py-1 text-[10px] font-semibold text-slate-500 transition-colors hover:border-teal-600 hover:text-teal-300"
    >
      nearest capture ↗
    </a>
  );
}

/** Which years and months are folded. */
interface Folds {
  years: ReadonlySet<string>;
  months: ReadonlySet<string>;
}
const NO_FOLDS: ReadonlySet<string> = new Set();

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
  /**
   * Open every year however long the list. Set while a focused search narrows it: the years the
   * reader asked about ("how did covid affect…") are the ones the opening folds would hide.
   */
  openAll?: boolean;
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

  // year -> { months: monthKey -> (date -> events), monthOnly: monthKey -> events, approx: events | null }
  const years = new Map<
    string,
    {
      months: Map<string, Map<string, TimelineEvent[]>>;
      monthOnly: Map<string, TimelineEvent[]>;
      approx: TimelineEvent[] | null;
    }
  >();
  const yearOf = (y: string) => {
    let yb = years.get(y);
    if (!yb) {
      yb = { months: new Map(), monthOnly: new Map(), approx: null };
      years.set(y, yb);
    }
    return yb;
  };

  for (const ev of events) {
    const year = ev.date.slice(0, 4);
    const yb = yearOf(year);
    if (ev.precision === "year") {
      (yb.approx ??= []).push(ev);
      continue;
    }
    const monthKey = ev.date.slice(0, 7); // YYYY-MM
    // The month is known but the day is not. It belongs under its month header, just not on a
    // specific day — the date was normalised to the 1st purely so it can be sorted and plotted.
    if (ev.precision === "month") {
      const bucket = yb.monthOnly.get(monthKey) ?? [];
      bucket.push(ev);
      yb.monthOnly.set(monthKey, bucket);
      yb.months.set(monthKey, yb.months.get(monthKey) ?? new Map());
      continue;
    }
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
      const monthOnly = yb.monthOnly.get(section.monthKey);
      const firstDate = [...month.keys()][0] ?? `${section.monthKey}-01`;
      rows.push({ kind: "month", key: `m-${section.monthKey}`, label: monthYearLabel(firstDate), year, monthKey: section.monthKey });
      if (monthOnly) {
        rows.push({
          kind: "day",
          key: `mo-${section.monthKey}`,
          date: `${section.monthKey}-01`,
          items: monthOnly,
          approx: true,
          year,
          monthKey: section.monthKey,
        });
      }
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

/**
 * How many rows a long list opens with (batch 38). JPMorgan's page laid out all 2,212 of its event
 * rows, about 33,000 elements and 385 ms of layout on a fast machine, several times that on a
 * phone, for a reader who starts at the top of 1799. A list longer than this opens its most recent
 * years and folds the older ones. A folded year keeps its header and its count. It opens on a
 * click, and by itself when the chart jumps into it.
 */
export const OPEN_ROW_BUDGET = 300;

/**
 * The years a list opens folded, newest first. The newest years stay open while their rows fit
 * the budget, the newest one always; the first year that does not fit and every year before it
 * are folded. A row is a card the reader sees: an event, or one card for a stack of filings.
 * Nothing is folded when the whole list fits.
 */
function yearsToFold(rows: RenderRow[], budget: number): string[] {
  const perYear = new Map<string, number>();
  for (const r of rows) {
    if (r.kind === "day") perYear.set(r.year, (perYear.get(r.year) ?? 0) + r.items.length);
    else if (r.kind === "filings") perYear.set(r.year, (perYear.get(r.year) ?? 0) + 1);
  }
  const newestFirst = [...perYear.keys()].sort().reverse();
  let open = 0;
  for (let i = 0; i < newestFirst.length; i++) {
    open += perYear.get(newestFirst[i])!;
    if (i > 0 && open > budget) return newestFirst.slice(i);
  }
  return [];
}

/** The years a list of these events opens folded. */
export function foldedYears(events: TimelineEvent[], budget = OPEN_ROW_BUDGET): string[] {
  return yearsToFold(condenseFilings(buildRows(events, "asc")), budget);
}

const FORM_RE =
  /\b(10-K405|10-K\/?A?|10-Q\/?A?|8-K\/?A?|6-K\/?A?|20-F|40-F|S-\d\w*|F-\d\w*|13[DG]\/?A?|DEFM14A|DEF 14A|424B\d|SC 13[DG]|SC TO-T|SC 14D9|25-NSE|15-12[BG]|25(?=\)))\b/i;

/** "6-K ×4 · 8-K ×2" — which forms are in the stack, most frequent first. */
function formSummary(items: TimelineEvent[]): string {
  const counts = new Map<string, number>();
  for (const ev of items) {
    // the form sits in the closing brackets; a press release's headline before them can name
    // another form ("…Files Its 10-K Late (8-K 8.01)"), so those are read first
    const tail = /\(([^()]*)\)$/.exec(ev.title)?.[1] ?? "";
    const form = (tail.match(FORM_RE) ?? ev.title.match(FORM_RE))?.[1].toUpperCase() ?? "filing";
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
          className={`shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${BADGE.filing.cls}`}
        >
          {all.length} filings
        </span>
        <span className="text-xs text-slate-400">{formSummary(all)}</span>
        <span className="text-xs text-slate-500">
          {dayLabel(days[0].date)} – {dayLabel(days[days.length - 1].date)}
        </span>
        <button
          onClick={() => setExpanded((e) => !e)}
          className="ml-auto rounded-sm border border-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-500 transition-colors hover:border-sky-700 hover:text-sky-300"
        >
          {expanded ? "Collapse" : "Show all"}
        </button>
      </div>

      {expanded ? (
        <ul className="space-y-1 p-2">
          {all.map((ev) => (
            <li key={ev.id}>
              <a
                href={safeHref(ev.url) ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-baseline gap-2 rounded-sm px-2 py-1 hover:bg-slate-800/50"
              >
                <time dateTime={ev.date} className="w-14 shrink-0 text-[11px] text-slate-500">
                  {dayLabel(ev.date)}
                </time>
                <span className="min-w-0 flex-1 truncate text-sm text-slate-300">{ev.title}</span>
                <span className="shrink-0 text-[10px] text-slate-500">{ev.source} ↗</span>
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
            href={safeHref(cur.url) ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 flex-1 rounded-sm px-2 py-1 hover:bg-slate-800/50"
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
  annotation: "bg-cyan-400",
  governance: "bg-indigo-400",
  exploit: "bg-red-500",
  macro: "bg-emerald-400",
  recall: "bg-yellow-400",
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

export default function EventList({ events, order = "asc", siteDomain, persistKey, reveal, openAll = false }: Props) {
  const rows = useMemo(() => condenseFilings(buildRows(events, order)), [events, order]);
  // The tone dot explained itself only in a hover title, which touch and keyboard users never
  // see; a one-line key says what the colour means wherever a dot appears (NC-167).
  const hasTone = useMemo(() => events.some((e) => toneOf(e) !== "neutral"), [events]);

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

  // What a long list opens with folded, until the reader opens or folds something themselves.
  // Derived, not stored, so it follows the list: a filter that shortens it opens everything.
  const folded = useMemo(() => new Set(openAll ? [] : yearsToFold(rows, OPEN_ROW_BUDGET)), [rows, openAll]);
  const [chosen, setChosen] = useState<Folds | null>(null);
  const collapsedYears = chosen?.years ?? folded;
  const collapsedMonths = chosen?.months ?? NO_FOLDS;

  // Remember-my-view: load what the reader chose for this subject after mount (so SSR and the
  // first client render agree), then save each choice. Nothing is saved until they choose: a
  // stored copy of the opening folds would keep them after the list had outgrown them. A view
  // saved before batch 38 carries no `chosen` mark: every visit saved one, choice or not.
  const hydrated = useRef(false);
  useEffect(() => {
    hydrated.current = false;
    if (!persistKey) return;
    const saved = loadJSON<{ years?: string[]; months?: string[]; chosen?: boolean }>(persistKey, {});
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restored from storage after mount, so server and first render agree
    setChosen(saved.chosen ? { years: new Set(saved.years ?? []), months: new Set(saved.months ?? []) } : null);
    hydrated.current = true;
  }, [persistKey]);
  useEffect(() => {
    if (!persistKey || !hydrated.current || !chosen) return;
    saveJSON(persistKey, { years: [...chosen.years], months: [...chosen.months], chosen: true });
  }, [persistKey, chosen]);

  // The reveal effect below runs for a jump, not for a list that changed, so it reads the
  // opening folds from here rather than depending on them.
  const foldedNow = useRef(folded);
  useEffect(() => {
    foldedNow.current = folded;
  }, [folded]);

  const toggle = (set: ReadonlySet<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };
  const toggleYear = (y: string) =>
    setChosen((c) => ({ years: toggle(c?.years ?? folded, y), months: c?.months ?? NO_FOLDS }));
  const toggleMonth = (k: string) =>
    setChosen((c) => ({ years: c?.years ?? folded, months: toggle(c?.months ?? NO_FOLDS, k) }));

  // Open whatever contains the jumped-to date. The same state comes back when nothing changes,
  // so this cannot loop, and it runs after the restore pass for the same reason saving does.
  useEffect(() => {
    if (!reveal?.date) return;
    const year = reveal.date.slice(0, 4);
    const monthKey = reveal.date.slice(0, 7);
    setChosen((c) => {
      const years = c?.years ?? foldedNow.current;
      const months = c?.months ?? NO_FOLDS;
      if (!years.has(year) && !months.has(monthKey)) return c;
      const openYears = new Set(years);
      openYears.delete(year);
      const openMonths = new Set(months);
      openMonths.delete(monthKey);
      return { years: openYears, months: openMonths };
    });
  }, [reveal?.date, reveal?.n]);

  // "Expand all" while any year is folded, the opening folds included; "Collapse all" once none is.
  const anyFolded = years.some((y) => collapsedYears.has(y));
  const toggleAll = () =>
    setChosen((c) => ({ years: anyFolded ? new Set() : new Set(years), months: c?.months ?? NO_FOLDS }));

  // Jump-to-year: expand the year (so its content is there to see) and scroll to its header.
  const jumpToYear = (y: string) => {
    setChosen((c) => {
      const next = new Set(c?.years ?? folded);
      next.delete(y);
      return { years: next, months: c?.months ?? NO_FOLDS };
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

  // the oldest year the list opens with, when it opens with older ones folded
  const firstOpen = folded.size ? years.filter((y) => !folded.has(y)).sort()[0] : null;

  // a month/day is hidden when its year is collapsed, a day also when its own month is collapsed
  const hidden = (year: string, monthKey: string | null) =>
    collapsedYears.has(year) || (monthKey !== null && collapsedMonths.has(monthKey));

  return (
    <div>
      {years.length > 1 && (
        <div className="sticky top-0 z-10 mb-2 flex items-center gap-1 overflow-x-auto rounded-md border border-slate-800 bg-slate-950/85 px-2 py-1.5 backdrop-blur-sm">
          <span className="mr-1 shrink-0 text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Jump
          </span>
          {years.map((y) => (
            <button
              key={y}
              onClick={() => jumpToYear(y)}
              className="shrink-0 rounded-sm px-1.5 py-0.5 text-[11px] tabular-nums text-slate-400 transition-colors hover:bg-slate-800 hover:text-sky-300"
            >
              {y}
            </button>
          ))}
          <button
            onClick={toggleAll}
            className="ml-auto shrink-0 rounded-sm border border-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-500 transition-colors hover:border-sky-700 hover:text-sky-300"
          >
            {anyFolded ? "Expand all" : "Collapse all"}
          </button>
        </div>
      )}
      {!chosen && firstOpen && (
        <p className="mb-2 text-[11px] text-slate-400" data-opening-folds>
          Years before {firstOpen} are folded so this page stays quick to load. Click a year to open
          it, or use Expand all above.
        </p>
      )}
      {hasTone && (
        <p className="mb-2 flex items-center gap-1.5 text-[11px] text-slate-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
          <span className="h-1.5 w-1.5 rounded-full bg-red-400" aria-hidden />
          Dots show whether a headline reads positive or negative — a keyword estimate, not a
          judgement of the news.
        </p>
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
                  <span className="w-2 shrink-0 text-[9px] text-slate-500 group-hover:text-slate-400">
                    {yc ? "▶" : "▼"}
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500 group-hover:text-slate-300">
                    {row.year}
                  </span>
                  <span className="h-px flex-1 bg-slate-800/70" />
                  <span className="shrink-0 text-[10px] tabular-nums text-slate-500">
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
                  <span className="w-2 shrink-0 text-[9px] text-slate-500 group-hover:text-slate-400">
                    {mc ? "▶" : "▼"}
                  </span>
                  <span className="text-sm font-bold text-slate-200 group-hover:text-sky-300">
                    {row.label}
                  </span>
                  <span className="text-[10px] font-normal text-slate-500">
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
                <span className="absolute left-[-5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-slate-600" />
                <FilingStack days={row.days} />
              </li>
            );
          }

          // day row
          if (row.approx) {
            if (hidden(row.year, row.monthKey)) return null; // approximate rows are never jump targets
            // `monthKey` distinguishes the two: a year-only bucket sits directly under the year,
            // a month-only bucket under its month.
            const monthPrecision = row.monthKey !== null;
            return (
              <li
                key={row.key}
                id={monthPrecision ? `d-${row.monthKey}-month` : `d-${row.date.slice(0, 4)}-year`}
                className="mb-6 scroll-mt-24"
              >
                <span className="absolute left-[-5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-slate-600" />
                <span
                  className="text-xs font-semibold italic text-slate-500"
                  title={
                    monthPrecision
                      ? "The source gave a month but no day"
                      : "The source gave only the year"
                  }
                >
                  {monthPrecision ? "Day not given" : "Year only"}
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
              <span className="absolute left-[-5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-slate-600" />
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
