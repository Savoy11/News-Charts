import { getPool } from "../db";
import { RELEVANCE_THRESHOLD } from "../enrich/relevance";
import { EventType, PricePoint, TimelineEvent } from "../types";

export interface SubjectRow {
  id: number;
  kind: "topic" | "company";
  slug: string;
  displayName: string;
  ticker: string | null;
  cik: string | null;
  wikipediaTitle: string | null;
  summary: string | null;
  siteDomain: string | null;
  refreshedAt: Date | null;
}

export async function loadSubject(slug: string): Promise<SubjectRow | null> {
  const { rows } = await getPool().query(
    `SELECT id, kind, slug, display_name, ticker, cik, wikipedia_title,
            summary, site_domain, refreshed_at
       FROM subjects WHERE slug = $1`,
    [slug.toLowerCase()]
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    id: Number(r.id),
    kind: r.kind,
    slug: r.slug,
    displayName: r.display_name,
    ticker: r.ticker,
    cik: r.cik,
    wikipediaTitle: r.wikipedia_title,
    summary: r.summary,
    siteDomain: r.site_domain,
    refreshedAt: r.refreshed_at,
  };
}

/**
 * The site's hot read. Joins the primary attestation for the link, and counts
 * attestations so corroborated events can be distinguished later.
 */
export async function loadEvents(subjectId: number): Promise<TimelineEvent[]> {
  const { rows } = await getPool().query(
    `SELECT e.id, e.kind, e.occurred_on, e.date_precision, e.title, e.body,
            a.url, a.source_label,
            (SELECT count(*) FROM event_attestations x WHERE x.event_id = e.id) AS attestations
       FROM events e
       JOIN event_subjects es ON es.event_id = e.id
       LEFT JOIN event_attestations a ON a.event_id = e.id AND a.is_primary
      -- unscored (NULL) still shows: nothing is hidden without evidence
      WHERE es.subject_id = $1
        AND (es.relevance IS NULL OR es.relevance >= $2)
      ORDER BY e.occurred_on`,
    [subjectId, RELEVANCE_THRESHOLD]
  );

  return rows.map((r) => {
    const date: string =
      r.occurred_on instanceof Date
        ? r.occurred_on.toISOString().slice(0, 10)
        : String(r.occurred_on).slice(0, 10);
    const attestations = Number(r.attestations);
    return {
      id: `db-${r.id}`,
      date,
      type: r.kind as EventType,
      title: r.title,
      source: r.source_label ?? "Chronolens",
      url: r.url ?? undefined,
      // surface corroboration where it exists — "in 12 papers" is a real signal
      description:
        attestations > 1
          ? `${r.body ? `${r.body} · ` : ""}${attestations} sources`
          : r.body ?? undefined,
      yearOnly: r.date_precision === "year",
    } satisfies TimelineEvent;
  });
}

export async function loadPrices(subjectId: number): Promise<PricePoint[]> {
  const { rows } = await getPool().query(
    `SELECT on_date, close FROM prices WHERE subject_id = $1 ORDER BY on_date`,
    [subjectId]
  );
  return rows.map((r) => ({
    time:
      r.on_date instanceof Date
        ? r.on_date.toISOString().slice(0, 10)
        : String(r.on_date).slice(0, 10),
    value: Number(r.close),
  }));
}

export function isStale(refreshedAt: Date | null, maxAgeMinutes: number): boolean {
  if (!refreshedAt) return true;
  return Date.now() - refreshedAt.getTime() > maxAgeMinutes * 60_000;
}
