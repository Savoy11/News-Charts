import type { TimelineEvent } from "./types";
import { REGISTRANT_FORM } from "./secForms";

/**
 * A fund's own filings, by the series EDGAR tags them with (batch 67, the 2026-10-26 proposal 5).
 *
 * A fund's CIK is its trust's, and the trust files for every series it sells. From 2022-12-05 to
 * 2026-08-28 the Vanguard Index Funds trust (CIK 36405) filed 432 of the fund forms kept here, and
 * every one reached VOO's page, titled with the trust and hedged "may concern a sibling fund"
 * (NC-139). 76 of them, 18%, are VOO's: NPORT-P 181 → 15, 497K 191 → 16, 497 39 → 29.
 *
 * NC-139 took it that telling them apart cost a request per filing. It costs one per hundred: EDGAR
 * tags every fund filing with the series it covers, and the series' own filing list —
 * `browse-edgar?CIK=S000002839`, the id the ticker sync reads with the fund's name — lists them a
 * hundred at a time, newest first: VOO's 533 since 2006-02-16 in six requests.
 *
 * Read at ingest. A filing of a day the list covers is the fund's own or a sibling's: its own is
 * linked as certain (`OWN_SERIES_SCORER`) and shown under the fund's name (`asOwnSeriesFiling`); a
 * sibling's is not linked to it. The list covers the days from its oldest entry, and read in part —
 * a refusal, or the page cap — only those it reached (`covers`); a filing of any other day, and every
 * filing when the list cannot be read, keeps today's title and hedge.
 */

const BASE = "https://www.sec.gov/cgi-bin/browse-edgar";
// The contact EDGAR asks every client for, as the other SEC requests carry it (lib/sec.ts).
const UA = { "User-Agent": "News Charts Research marcusowens94@gmail.com" };
const edgarFetch = (url: string) => fetch(url, { headers: UA });
/** what one request lists, EDGAR's largest page */
export const SERIES_PAGE = 100;
/** 4,000 filings, far past VOO's 533; a longer list is read to there and covers the days it reached */
export const SERIES_MAX_PAGES = 40;
/** EDGAR requests this far apart, as the headline reader spaces its own (lib/ingest/headlines.ts) */
export const SERIES_GAP_MS = 130;
/**
 * A 503 is asked again, twice, this far apart and longer each time. `browse-edgar` is slow (a page
 * took 0.9s to 11s in the ticker sync) and sometimes gives up with a 503: VTI's first page did,
 * after 10.5s, minutes after the same request answered in 6.6s (2026-10-27). A 429 is EDGAR asking
 * the client to slow down, and is not asked again.
 */
export const SERIES_RETRY_MS = 2_000;

/**
 * The scorer a fund's own filing is linked by: free, so the cost report counts it as the free tier,
 * and not "deterministic", so neither ingest's re-score (lib/ingest/store.ts) nor `npm run score
 * --rescore` puts the registrant rule's 0.7 back over it.
 */
export const OWN_SERIES_SCORER = "deterministic-series";

export function seriesFilingsUrl(seriesId: string, start = 0): string {
  const page = new URLSearchParams({ action: "getcompany", CIK: seriesId, owner: "include", count: String(SERIES_PAGE) });
  if (start) page.set("start", String(start));
  page.set("output", "atom");
  return `${BASE}?${page}`;
}

export interface SeriesEntry {
  /** without its dashes, as the filings step writes it: "000003640526000473" */
  accession: string;
  date: string;
}

/**
 * One page of the list, or null for an answer that is not one. A registration amendment is listed
 * twice, once under each Act it is filed under, so a page's entries are not all different filings.
 */
export function parseSeriesFeed(xml: string): SeriesEntry[] | null {
  if (!/<feed[\s>]/.test(xml)) return null;
  const entries: SeriesEntry[] = [];
  for (const [, entry] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const accession = /<accession-number>([\d-]+)<\/accession-number>/.exec(entry)?.[1]?.replace(/-/g, "");
    const date = /<filing-date>(\d{4}-\d{2}-\d{2})<\/filing-date>/.exec(entry)?.[1];
    if (accession && date) entries.push({ accession, date });
  }
  return entries;
}

export interface SeriesFilings {
  seriesId: string;
  accessions: Set<string>;
  /** the oldest day read: VOO's list, read whole, begins 2006-02-16 */
  oldest: string;
  /** whether the list was read to its end, and so lists every filing of its oldest day too */
  complete: boolean;
  pages: number;
}

/**
 * The series' filing list, newest first, or null when not even its first page could be read. An
 * empty first page is not read as "no filings": every series was created by a filing, and taking
 * an empty answer at its word would take every filing off the fund's page.
 */
export async function fetchSeriesFilings(
  seriesId: string,
  {
    get = edgarFetch,
    maxPages = SERIES_MAX_PAGES,
    gapMs = SERIES_GAP_MS,
    retryMs = SERIES_RETRY_MS,
  }: { get?: (url: string) => Promise<Response>; maxPages?: number; gapMs?: number; retryMs?: number } = {}
): Promise<SeriesFilings | null> {
  const accessions = new Set<string>();
  let oldest = "";
  const wait = (ms: number) => (ms ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
  for (let page = 0; page < maxPages; page++) {
    if (page) await wait(gapMs);
    let entries: SeriesEntry[] | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) await wait(retryMs * attempt);
      try {
        const res = await get(seriesFilingsUrl(seriesId, page * SERIES_PAGE));
        if (res.status === 503) continue;
        entries = res.ok ? parseSeriesFeed(await res.text()) : null;
      } catch {
        entries = null;
      }
      break;
    }
    // A page that fails ends the walk where it is: the days already read stay covered.
    if (!entries || (page === 0 && !entries.length)) {
      return page === 0 ? null : { seriesId, accessions, oldest, complete: false, pages: page };
    }
    for (const e of entries) {
      accessions.add(e.accession);
      if (!oldest || e.date < oldest) oldest = e.date;
    }
    if (entries.length < SERIES_PAGE) return { seriesId, accessions, oldest, complete: true, pages: page + 1 };
  }
  return { seriesId, accessions, oldest, complete: false, pages: maxPages };
}

/**
 * Whether the list read says whose a filing of this day is: from its oldest day on, read whole, and
 * after it, read in part, since that day may go on into the page not read. Never before it. The
 * lists begin in February 2006 — VOO's on 2006-02-16, Fidelity Contrafund's on the 27th, Vanguard
 * Wellington's on the 24th, though their trusts filed from 1994 and 1995 (read 2026-10-27) — so a
 * trust's older filings are on no fund's list; and a fund launched in 2015 cannot say whose its
 * trust's 2010 filings are.
 */
export const covers = (series: SeriesFilings, date: string): boolean =>
  series.complete ? date >= series.oldest : date > series.oldest;

export interface OwnSeriesSplit {
  /** the filings to store: the fund's own, and those the list does not reach */
  events: TimelineEvent[];
  /** accessions of the fund's own fund filings, linked as certain */
  own: string[];
  /** accessions of its siblings' fund filings, not linked to it */
  siblings: string[];
}

/**
 * The trust's fund filings (those titled with the registrant, `REGISTRANT_FORM`) sorted by the
 * list: the fund's own kept, a sibling's left out. Any other form, and a fund filing of a day the
 * list does not reach, is left as it was.
 */
export function ownSeriesFilings(events: readonly TimelineEvent[], series: SeriesFilings): OwnSeriesSplit {
  const split: OwnSeriesSplit = { events: [], own: [], siblings: [] };
  for (const ev of events) {
    if (!ev.externalId || !REGISTRANT_FORM.test(ev.title) || !covers(series, ev.date)) {
      split.events.push(ev);
    } else if (series.accessions.has(ev.externalId)) {
      split.own.push(ev.externalId);
      split.events.push(ev);
    } else {
      split.siblings.push(ev.externalId);
    }
  }
  return split;
}

/** The days an earlier read settled for a fund, and the filings linked to it now. */
export interface JudgedBefore {
  /** its oldest and newest own filing, by the list (`OWN_SERIES_SCORER`) */
  from: string;
  to: string;
  /** accessions of every SEC filing linked to it */
  linked: Set<string>;
}

/**
 * The trust's fund filings, less those an earlier read put off the fund's page, for a run whose list
 * did not reach their day. Between the fund's oldest and newest own filing an earlier read covered
 * every day, so a fund filing of one of them that is not linked to it now was a sibling's: stored
 * again, it would be linked again, and the fund's page would carry its siblings' filings until the
 * list next answered. Any other is left as it is, the fund's own linked and certain as before.
 */
export function withoutJudgedSiblings(
  events: readonly TimelineEvent[],
  series: SeriesFilings | null,
  before: JudgedBefore
): { events: TimelineEvent[]; left: number } {
  const kept = events.filter(
    (ev) =>
      !ev.externalId ||
      !REGISTRANT_FORM.test(ev.title) ||
      (series !== null && covers(series, ev.date)) ||
      ev.date < before.from ||
      ev.date > before.to ||
      before.linked.has(ev.externalId)
  );
  return { events: kept, left: events.length - kept.length };
}

/**
 * A fund's own filing as its page shows it: under the fund's name, without the hedge.
 *
 * The stored row is titled with the trust (lib/sec.ts) because one row serves every page it is
 * linked to, and a 497 or a shareholder report covers several series at once: titled with VOO's
 * name, the same row would read as VOO's on VTI's page. So the fund's name goes on at read time,
 * on the page whose fund the list tagged it to (`loadEvents`).
 */
export function asOwnSeriesFiling(ev: TimelineEvent, fundName: string): TimelineEvent {
  const parts = /^(.+?): (.+)$/.exec(ev.title);
  if (!parts || !REGISTRANT_FORM.test(ev.title)) return ev;
  return {
    ...ev,
    title: `${fundName}: ${parts[2]}`,
    description: `Filed by ${parts[1]}; EDGAR lists it among this fund's own filings.`,
  };
}
