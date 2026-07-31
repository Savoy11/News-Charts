import { getPool } from "./db";

/**
 * What the search box decided, recorded so accuracy can be measured instead of argued.
 *
 * The write half never throws and never blocks a decision that has already been made — a lost
 * row costs a data point, a thrown one costs the visitor their search. The read half is pure
 * arithmetic over rows, kept here rather than in the report script so it can be checked offline
 * (`npm run check:search-log`) instead of eyeballed against a live database.
 *
 * **Privacy.** Nothing here identifies anybody: no IP, no user agent, no session id, no join key
 * to another table, and no page or API reads what it writes. See `db/015_search_resolutions.sql`
 * for the full statement, and `purgeOldResolutions` for the retention that enforces it.
 */

/** Which rung of the resolution ladder answered. Ordered best-known to least-known. */
export const RUNGS = [
  "known_company",
  "known_subject",
  "edgar",
  "assumed_topic",
  "empty",
] as const;

export type ResolutionRung = (typeof RUNGS)[number];

/**
 * Rungs that answered out of the corpus. The other rungs are the ladder admitting it does not
 * know: `edgar` resolved a real company we have never ingested, and `assumed_topic` is a guess
 * that the typed string names something.
 */
const FROM_CORPUS: ReadonlySet<ResolutionRung> = new Set<ResolutionRung>([
  "known_company",
  "known_subject",
]);

export interface Resolution {
  query: string;
  subject: string;
  focus: string | null;
  influence: string | null;
  resolvedBy: ResolutionRung;
  kind: "company" | "topic" | null;
  target: string | null;
  /** whether the subject routed to had any events — null when nothing was resolved to check */
  hasEvents: boolean | null;
  durationMs: number;
}

/** Queries are capped rather than stored whole: a pasted essay is not a search. */
export const MAX_QUERY = 200;

/** Trim, collapse whitespace and cap. Applied to every text column before it is stored. */
export function trimForLog(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY);
}

/**
 * The form two searches share when they are the same search.
 *
 * Case and trailing punctuation are noise for counting purposes — "Ford", "ford" and "ford?"
 * are one query asked three times, and a top-misses list that splits them into three rows of
 * one buries the thing it exists to surface.
 */
export function normaliseQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Record one resolution. Never throws — a search must not fail because measurement did. */
export async function logResolution(r: Resolution): Promise<void> {
  try {
    await getPool().query(
      `INSERT INTO search_resolutions
         (query, subject, focus, influence, resolved_by, kind, target, has_events, duration_ms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        trimForLog(r.query),
        trimForLog(r.subject),
        r.focus ? trimForLog(r.focus) : null,
        r.influence ? trimForLog(r.influence) : null,
        r.resolvedBy,
        r.kind,
        r.target ? trimForLog(r.target) : null,
        r.hasEvents,
        Math.max(0, Math.round(r.durationMs)),
      ]
    );
  } catch {
    /* measurement is worth having, never worth a failed search */
  }
}

/**
 * Will the page this search routes to have anything on it?
 *
 * The distinction the whole table turns on: a query can resolve perfectly to a subject queued
 * last week that has no events yet, and the visitor still meets a notice rather than a timeline.
 * Routing somewhere is not the same as arriving somewhere.
 *
 * Matched on the target string rather than an id, because that is what the page itself will do —
 * slug, alias or ticker, the same three ways `loadSubject` and `findKnownCompany` resolve. One
 * `EXISTS` probe against indexed columns, which is what keeps it affordable on the search path.
 */
export async function targetHasEvents(target: string): Promise<boolean | null> {
  const key = target.trim().toLowerCase();
  if (!key) return null;
  try {
    const { rows } = await getPool().query<{ ok: boolean }>(
      `SELECT EXISTS (
         SELECT 1
           FROM subjects s
           JOIN event_subjects es ON es.subject_id = s.id
           LEFT JOIN subject_aliases a ON a.subject_id = s.id
          WHERE s.slug = $1 OR lower(s.ticker) = $1 OR lower(a.alias) = $1
       ) AS ok`,
      [key]
    );
    return rows[0]?.ok ?? false;
  } catch {
    // unknown, which is not the same as false and must not be counted as a miss
    return null;
  }
}

/**
 * Retention, applied by the scheduled refresh rather than left to whoever remembers.
 *
 * Returns how many rows went. A retention policy that depends on someone running a command is
 * not a retention policy.
 */
export async function purgeOldResolutions(days = 90): Promise<number> {
  try {
    const { rowCount } = await getPool().query(
      `DELETE FROM search_resolutions WHERE asked_at < now() - ($1 || ' days')::interval`,
      [String(Math.max(1, Math.floor(days)))]
    );
    return rowCount ?? 0;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------- reading

/** One logged resolution, as the report reads it back. */
export interface LoggedRow {
  query: string;
  subject: string;
  resolvedBy: ResolutionRung;
  hasEvents: boolean | null;
  durationMs: number;
}

export interface RungSummary {
  rung: ResolutionRung;
  searches: number;
  /** share of all searches, 0–1 */
  share: number;
  /** share of this rung's searches that landed on a subject carrying events, 0–1 */
  landed: number;
}

export interface Summary {
  searches: number;
  /**
   * The headline number: the share of searches that reached a subject with something on it.
   *
   * Counted over searches whose outcome is *known* — a row whose `has_events` could not be
   * determined is excluded rather than assumed either way, because an accuracy metric that
   * quietly counts its own failures as successes is worse than no metric.
   */
  landed: number;
  /** searches whose outcome could not be determined, excluded from `landed` */
  unknown: number;
  byRung: RungSummary[];
  /** how far the parser moved the query, as a share of searches where it changed it at all */
  parserRewrote: number;
}

/** Percentile over already-collected durations. Nearest-rank, so it needs no interpolation. */
export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

export function summarise(rows: readonly LoggedRow[]): Summary {
  const known = rows.filter((r) => r.hasEvents !== null);
  const byRung = RUNGS.map((rung) => {
    const mine = rows.filter((r) => r.resolvedBy === rung);
    const mineKnown = mine.filter((r) => r.hasEvents !== null);
    return {
      rung,
      searches: mine.length,
      share: rows.length ? mine.length / rows.length : 0,
      landed: mineKnown.length
        ? mineKnown.filter((r) => r.hasEvents === true).length / mineKnown.length
        : 0,
    };
  }).filter((s) => s.searches > 0);

  return {
    searches: rows.length,
    landed: known.length ? known.filter((r) => r.hasEvents === true).length / known.length : 0,
    unknown: rows.length - known.length,
    byRung,
    parserRewrote: rows.length
      ? rows.filter((r) => normaliseQuery(r.query) !== normaliseQuery(r.subject)).length /
        rows.length
      : 0,
  };
}

export interface QueryCount {
  query: string;
  asked: number;
  /** the rungs that answered this query, so a query answered inconsistently is visible */
  rungs: ResolutionRung[];
}

/**
 * The same search, counted once, most-asked first.
 *
 * A query answered by two different rungs on different days is worth seeing as one row with
 * both: that is either the corpus filling in behind it (good) or the ladder being unstable
 * (not), and either way it is invisible when the rows are read one at a time.
 */
export function topQueries(rows: readonly LoggedRow[], limit = 20): QueryCount[] {
  const byQuery = new Map<string, { asked: number; rungs: Set<ResolutionRung> }>();
  for (const r of rows) {
    const key = normaliseQuery(r.query);
    if (!key) continue;
    const at = byQuery.get(key) ?? { asked: 0, rungs: new Set<ResolutionRung>() };
    at.asked++;
    at.rungs.add(r.resolvedBy);
    byQuery.set(key, at);
  }
  return [...byQuery.entries()]
    .map(([query, v]) => ({ query, asked: v.asked, rungs: [...v.rungs] }))
    .sort((a, b) => b.asked - a.asked || a.query.localeCompare(b.query))
    .slice(0, limit);
}

/** Was this answered out of what we already hold? Used by the report and by the summary above. */
export function fromCorpus(rung: ResolutionRung): boolean {
  return FROM_CORPUS.has(rung);
}
