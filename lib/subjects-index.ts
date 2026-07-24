import { getPool } from "./db";
import type { SubjectKind } from "./seo";

/**
 * Subjects worth exposing to crawlers and the Explore directory — the ones that actually carry
 * events. Server-only (touches the pool). Like every other read here it degrades gracefully:
 * an unreachable database returns an empty list, and callers fall back to the curated seed pool
 * so the sitemap and directory are never blank.
 */

export interface IndexedSubject {
  kind: SubjectKind;
  slug: string;
  ticker: string | null;
  name: string;
  count: number;
  refreshedAt: string | null;
}

export async function listIndexedSubjects(minEvents = 1, limit = 5000): Promise<IndexedSubject[]> {
  try {
    const { rows } = await getPool().query(
      `SELECT s.slug, s.kind, s.display_name, s.ticker, s.refreshed_at,
              count(es.event_id)::int AS event_count
         FROM subjects s
         JOIN event_subjects es ON es.subject_id = s.id
        WHERE s.kind IN ('company', 'topic', 'industry')
        GROUP BY s.id
       HAVING count(es.event_id) >= $1
        ORDER BY count(es.event_id) DESC
        LIMIT $2`,
      [minEvents, limit]
    );
    return rows.map((r) => ({
      kind: r.kind as SubjectKind,
      slug: String(r.slug),
      ticker: r.ticker ? String(r.ticker) : null,
      name: String(r.display_name || r.ticker || r.slug),
      count: Number(r.event_count),
      refreshedAt: r.refreshed_at ? new Date(r.refreshed_at).toISOString() : null,
    }));
  } catch {
    // no database — callers substitute the curated seed pool
    return [];
  }
}
