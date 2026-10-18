import { RELEVANCE_THRESHOLD } from "./enrich/relevance";

/**
 * How many events topics share with held securities — the count that decides whether topic pages
 * get a "Securities in these stories" strip (2026-10-17 proposal 7).
 *
 * Cross-subject links are stored and counted ("280 events carry 351 subject links", README) but no
 * page reads an event's other subjects. Whether a strip would have anything to show depends on how
 * many events pass the relevance gate on BOTH a topic link and a company link, which only the
 * production database can say — so the strip waits on this count, and the count uses the same
 * gate the strip would.
 */

/** One topic and one security that share events, both links past the display gate. */
export interface OverlapPair {
  topic: string;
  ticker: string;
  shared: number;
}

/** A pair needs at least this many shared events before a strip would list it. */
export const STRIP_MIN_SHARED = 2;

/** Pairs of topic and held security, with how many gated events they share. */
export const OVERLAP_SQL = `
  WITH gated AS (
    SELECT es.event_id, s.kind, s.slug, s.ticker
      FROM event_subjects es
      JOIN subjects s ON s.id = es.subject_id
     WHERE s.kind IN ('topic', 'company')
       -- the timeline's own display gate, from the same constant
       AND (es.relevance IS NULL OR es.relevance >= ${RELEVANCE_THRESHOLD})
  )
  SELECT t.slug AS topic, c.ticker, count(DISTINCT t.event_id)::int AS shared
    FROM gated t
    JOIN gated c ON c.event_id = t.event_id AND c.kind = 'company' AND c.ticker IS NOT NULL
   WHERE t.kind = 'topic'
   GROUP BY t.slug, c.ticker
   ORDER BY shared DESC, t.slug, c.ticker`;

export interface OverlapSummary {
  topicsHeld: number;
  /** topics whose strip would list at least one security */
  topicsWithStrip: number;
  /** securities whose "topics that share events" line would list at least one topic */
  securitiesWithStrip: number;
  /** pairs at or above the strip's bar, most shared first */
  listed: OverlapPair[];
}

/** What the strip would show across the corpus, from the pairs `OVERLAP_SQL` returns. */
export function summariseOverlap(pairs: OverlapPair[], topicsHeld: number): OverlapSummary {
  const listed = pairs.filter((p) => p.shared >= STRIP_MIN_SHARED);
  return {
    topicsHeld,
    topicsWithStrip: new Set(listed.map((p) => p.topic)).size,
    securitiesWithStrip: new Set(listed.map((p) => p.ticker)).size,
    listed,
  };
}
