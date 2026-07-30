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
 * Record a request, or count it again if someone already asked.
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
  const key = slug.trim().toLowerCase();
  if (!key) return;
  try {
    await getPool().query(
      `INSERT INTO subject_requests (slug, kind, ticker)
       VALUES ($1,$2,$3)
       ON CONFLICT (slug) DO UPDATE
          SET requests = subject_requests.requests + 1,
              last_asked = now(),
              -- a repeat ask re-opens something that failed before; the source may have recovered
              fulfilled_at = NULL,
              ticker = COALESCE(EXCLUDED.ticker, subject_requests.ticker)`,
      [key, kind, ticker ?? null]
    );
  } catch {
    /* demand is worth recording, never worth failing a page for */
  }
}

/** The most-wanted unfulfilled requests, for the scheduled runner. */
export async function pendingRequests(limit = 25): Promise<PendingRequest[]> {
  try {
    const { rows } = await getPool().query(
      `SELECT id, slug, kind, ticker, requests
         FROM subject_requests
        WHERE fulfilled_at IS NULL
        ORDER BY requests DESC, last_asked DESC
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
