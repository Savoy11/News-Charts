import { hiddenAsTaken } from "./takenNames";
import type { SourceKey, TimelineEvent } from "./types";

/**
 * "Also on": a case's other listed companies, linked from its row (batch 106, the 2026-11-06
 * proposal 3, approved by the owner on 2026-11-06).
 *
 * The owner's rule of 2026-11-05 puts a case on the page of every listed company it names, held in
 * one of two ways. An EPA case, a CPSC recall, a CFTC order, an SEC litigation release or a CFPB
 * action is one event a company, each attested by the source's own number for the case; a Justice
 * Department, SEC or Board press release is one event for the release, linked to every page it
 * names. A page's row can therefore say which other held pages carry the same case: the pages of
 * every event attested by the same source under an overlapping number, the row's own event among
 * them. A day's or a month's grouped row carries its cases' numbers joined by commas, so the
 * numbers are compared as sets. An SEC case's own number can hold commas ("proceeding:33-9065,
 * 34-60699@2009-09-21"); each piece is still one release's number, so a piece two rows share is the
 * same release. Only companies whose pages are held can be named, so the count is
 * a floor of the companies a case involves, never the whole list.
 */

/** The sources whose one case names several companies, each attesting it by the case's own number. */
export const ALSO_ON_SOURCES: readonly SourceKey[] = ["doj_press", "sec_press", "sec_cases", "fed_press", "cfpb", "epa_cases", "cpsc_recalls", "cftc"];

/**
 * Their ids in `sources` (lib/ingest/store.ts `SOURCES`), written out so the read path needs no
 * ingest code; db/041's partial index lists the same, and check:also-on holds the three together.
 */
export const ALSO_ON_SOURCE_IDS: readonly number[] = [23, 27, 28, 29, 30, 31, 32, 33];

/** How many other companies a row names before "and N more". */
export const ALSO_ON_SHOWN = 3;

/** The first few other companies, by name, and every other held company page with the case. */
export type AlsoOn = NonNullable<TimelineEvent["alsoOn"]>;

/**
 * The other held company pages attesting each of a page's events by the same source and an
 * overlapping case number, the event itself included: a release held once is on every page it
 * names. `$1` is the page's subject, `$2` the multi-party sources' ids, `$3` the
 * relevance floor. The partial index of db/041 serves the overlap: its predicate is the same list of
 * source ids, written here as literals so the planner can prove it.
 */
export function alsoOnSql(sourceIds: readonly number[]): string {
  const ids = sourceIds.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) throw new Error("no source ids for Also on");
  return `SELECT DISTINCT a.event_id, o.ticker, o.display_name, o.cik, e2.occurred_on::text AS occurred_on, e2.title, e2.body
       FROM event_subjects es
       JOIN event_attestations a ON a.event_id = es.event_id AND a.source_id = ANY ($2::smallint[])
       JOIN event_attestations b ON b.source_id IN (${ids.join(", ")}) AND b.source_id = a.source_id
            AND string_to_array(b.external_id, ',') && string_to_array(a.external_id, ',')
       JOIN event_subjects es2 ON es2.event_id = b.event_id AND es2.subject_id <> $1 AND (es2.relevance IS NULL OR es2.relevance >= $3)
       JOIN subjects o ON o.id = es2.subject_id AND o.kind = 'company'
       JOIN events e2 ON e2.id = b.event_id
      WHERE es.subject_id = $1
        AND o.cik IS DISTINCT FROM (SELECT cik FROM subjects WHERE id = $1)`;
}

/**
 * The query's rows as each event's other companies: one company once an event, however many of
 * its cases or attestations overlap; ordered by name, the first `ALSO_ON_SHOWN` shown. A company
 * whose own page leaves its row off, as another company's from before its record took that
 * company's name, is not named (lib/takenNames.ts, batch 117): "Also on AT&T" under a 1999 case of
 * AT&T Corp.'s would send a reader to a page without it.
 */
export function groupAlsoOn(
  rows: readonly {
    event_id: number | string;
    ticker: string | null;
    display_name: string;
    cik?: number | string | null;
    occurred_on?: string | null;
    title?: string | null;
    body?: string | null;
  }[],
): Map<number, AlsoOn> {
  const byEvent = new Map<number, Map<string, string>>();
  for (const r of rows) {
    if (!r.ticker) continue;
    if (r.occurred_on && hiddenAsTaken(r.cik, String(r.occurred_on).slice(0, 10), `${r.title ?? ""} ${r.body ?? ""}`, null)) continue;
    const id = Number(r.event_id);
    const companies = byEvent.get(id) ?? byEvent.set(id, new Map()).get(id)!;
    if (!companies.has(r.ticker)) companies.set(r.ticker, r.display_name);
  }
  const out = new Map<number, AlsoOn>();
  for (const [id, companies] of byEvent) {
    const all = [...companies].map(([ticker, name]) => ({ ticker, name })).sort((x, y) => x.name.localeCompare(y.name) || x.ticker.localeCompare(y.ticker));
    out.set(id, { shown: all.slice(0, ALSO_ON_SHOWN), total: all.length });
  }
  return out;
}

/** "and 25 more", or nothing when every company is shown. */
export const alsoOnMore = (a: AlsoOn) => (a.total > a.shown.length ? `and ${a.total - a.shown.length} more` : "");
