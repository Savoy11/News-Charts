import type { PoolClient } from "pg";
import { getPool } from "../db";

/**
 * What visitors asked for that we do not have.
 *
 * Pages read only the database, so a search for something unindexed cannot ingest it there and
 * then — that was the whole point, because a page view triggering eleven feeds is what made
 * quota depend on traffic and turned a database outage into a stampede. The request is recorded
 * instead, and the scheduled refresh works through the list.
 *
 * Demand is the ordering, and it has to be: a free tier cannot cover every request in one pass,
 * so the fair way to spend it is on what the most people asked for.
 */

export interface PendingRequest {
  id: number;
  slug: string;
  kind: "company" | "topic";
  ticker: string | null;
  requests: number;
}

/**
 * Longer than any ticker or Wikipedia-sized topic name. Past it, a "request" is a pasted sentence
 * or a crawler's junk path, and storing it only grows a table nothing purges by itself (NC-145).
 */
export const MAX_REQUEST_SLUG = 80;

/** A repeat ask counts again at most this often, however many times the page is loaded. */
export const COUNT_INTERVAL_MINUTES = 60;

/** Unfulfilled requests nobody has asked for again in this long are deleted by the refresh. */
export const REQUEST_RETENTION_DAYS = 90;

/** The normalised key, or null when it is not worth storing at all. */
export function requestKey(slug: string): string | null {
  const key = slug.trim().toLowerCase();
  if (!key || key.length > MAX_REQUEST_SLUG) return null;
  return key;
}

/** The first-pass ledger row for the same target — companies are kept under `co:` there. */
export function ledgerSlugFor(kind: "company" | "topic", key: string): string {
  return kind === "company" ? `co:${key}` : key;
}

/**
 * Record a request, or count it again if someone already asked.
 *
 * Every not-indexed page view called this, and every call added one and re-opened the request.
 * The scheduler works only the most-asked, so one script reloading a junk URL held those slots
 * for good and spent free-tier quota on the attacker's choice (NC-145). Now a repeat ask counts
 * at most once per `COUNT_INTERVAL_MINUTES`, and nothing is recorded or re-opened while the first
 * pass has the target in failure back-off — the sources already said it names nothing, and the
 * scheduled run would ask them the same question.
 *
 * Never throws: this runs inside a page or an API route that has already decided what to render,
 * and failing to note demand must not fail the response. A lost request costs one scheduling
 * round; a thrown one costs the visitor their page.
 */
export async function requestSubject(
  slug: string,
  kind: "company" | "topic",
  ticker?: string | null
): Promise<void> {
  const key = requestKey(slug);
  if (!key) return;
  try {
    await getPool().query(
      `INSERT INTO subject_requests (slug, kind, ticker)
       SELECT $1, $2, $3
        WHERE NOT EXISTS (SELECT 1 FROM first_pass_attempts
                           WHERE slug = $4 AND dead_until > now())
       ON CONFLICT (slug) DO UPDATE
          SET requests = subject_requests.requests
                + CASE WHEN subject_requests.counted_at < now() - ($5 || ' minutes')::interval
                       THEN 1 ELSE 0 END,
              counted_at = CASE WHEN subject_requests.counted_at < now() - ($5 || ' minutes')::interval
                                THEN now() ELSE subject_requests.counted_at END,
              last_asked = now(),
              -- a repeat ask re-opens something that failed before; the source may have recovered
              fulfilled_at = NULL,
              ticker = COALESCE(EXCLUDED.ticker, subject_requests.ticker)`,
      [key, kind, ticker ?? null, ledgerSlugFor(kind, key), String(COUNT_INTERVAL_MINUTES)]
    );
  } catch {
    /* demand is worth recording, never worth failing a page for */
  }
}

/** The most-wanted unfulfilled requests, for the scheduled runner. */
export async function pendingRequests(limit = 25): Promise<PendingRequest[]> {
  try {
    const { rows } = await getPool().query(
      // Untried requests before ones that already failed: a request that could not be filled
      // stays pending (it may answer next hour), and without this a popular unresolvable one
      // would take a slot every run ahead of everything that has never been tried (NC-144).
      // One the first pass has in failure back-off waits that out here too (NC-145).
      `SELECT r.id, r.slug, r.kind, r.ticker, r.requests
         FROM subject_requests r
        WHERE r.fulfilled_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM first_pass_attempts f
                           WHERE f.slug = CASE WHEN r.kind = 'company' THEN 'co:' || r.slug ELSE r.slug END
                             AND f.dead_until > now())
        ORDER BY (r.last_error IS NOT NULL), r.requests DESC, r.last_asked DESC
        LIMIT $1`,
      [limit]
    );
    return rows.map((r) => ({
      id: Number(r.id),
      slug: String(r.slug),
      kind: r.kind as "company" | "topic",
      ticker: r.ticker ? String(r.ticker) : null,
      requests: Number(r.requests),
    }));
  } catch {
    return [];
  }
}

/**
 * Retention for requests that never became anything.
 *
 * A fulfilled request is kept — it stands for a subject on the site and shows what brought it
 * there. An unfulfilled one nobody has repeated in `REQUEST_RETENTION_DAYS` is noise by then, and
 * one longer than `MAX_REQUEST_SLUG` predates the limit. Run by the scheduled refresh, for the
 * same reason as the search-log purge: a policy that waits for an operator is not one.
 */
export async function purgeStaleRequests(days = REQUEST_RETENTION_DAYS): Promise<number> {
  const { rowCount } = await getPool().query(
    `DELETE FROM subject_requests
      WHERE fulfilled_at IS NULL
        AND (last_asked < now() - ($1 || ' days')::interval OR char_length(slug) > $2)`,
    [String(days), MAX_REQUEST_SLUG]
  );
  return rowCount ?? 0;
}

export async function markFulfilled(client: PoolClient | null, id: number): Promise<void> {
  const q = `UPDATE subject_requests SET fulfilled_at = now(), last_error = NULL WHERE id = $1`;
  if (client) await client.query(q, [id]);
  else await getPool().query(q, [id]);
}

/**
 * Records why a request could not be filled, and leaves it pending.
 *
 * Left pending on purpose: a source that was unreachable this hour may answer the next one, and
 * a request quietly marked done because a fetch failed is a subject nobody ever gets.
 */
export async function markFailed(id: number, reason: string): Promise<void> {
  try {
    await getPool().query(`UPDATE subject_requests SET last_error = $2 WHERE id = $1`, [
      id,
      reason.slice(0, 300),
    ]);
  } catch {
    /* nothing to do about a failure to record a failure */
  }
}
