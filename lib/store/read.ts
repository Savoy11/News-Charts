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
  // match the canonical slug first, then any phrasing recorded as an alias — several
  // searches ("electric car", "electric cars") legitimately point at one subject
  const { rows } = await getPool().query(
    `SELECT s.id, s.kind, s.slug, s.display_name, s.ticker, s.cik, s.wikipedia_title,
            s.summary, s.site_domain, s.refreshed_at
       FROM subjects s
       LEFT JOIN subject_aliases a ON a.subject_id = s.id
      WHERE s.slug = $1 OR lower(a.alias) = $1
      ORDER BY (s.slug = $1) DESC
      LIMIT 1`,
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

/**
 * Sector-level events (Federal Register rules) attach to the industry, not to any member.
 * Without this a company page never shows the regulation that hit its whole sector — which
 * is backwards, since that is often the most consequential thing in the window.
 */
export async function loadSectorEvents(industryId: number): Promise<TimelineEvent[]> {
  const { rows } = await getPool().query(
    `SELECT e.id, e.kind, e.occurred_on, e.date_precision, e.title,
            a.url, a.source_label
       FROM events e
       JOIN event_subjects es ON es.event_id = e.id AND es.subject_id = $1
       LEFT JOIN event_attestations a ON a.event_id = e.id AND a.is_primary
      WHERE es.relevance IS NULL OR es.relevance >= $2
      ORDER BY e.occurred_on DESC
      LIMIT 120`,
    [industryId, RELEVANCE_THRESHOLD]
  );
  return rows.map((r) => ({
    id: `sector-${r.id}`,
    date:
      r.occurred_on instanceof Date
        ? r.occurred_on.toISOString().slice(0, 10)
        : String(r.occurred_on).slice(0, 10),
    type: r.kind as EventType,
    title: r.title,
    source: r.source_label ?? "Chronolens",
    url: r.url ?? undefined,
    description: "sector-wide",
    yearOnly: r.date_precision === "year",
  }));
}

export interface IndustryRef {
  id: number;
  slug: string;
  name: string;
  sic: string;
  memberCount: number;
}

/** The industry a company belongs to, for the peer link on its page. */
export async function loadIndustryFor(subjectId: number): Promise<IndustryRef | null> {
  const { rows } = await getPool().query(
    `SELECT i.id, i.slug, i.display_name, i.sic,
            (SELECT count(*) FROM subject_members x WHERE x.industry_id = i.id) AS members
       FROM subjects i
       JOIN subject_members sm ON sm.industry_id = i.id
      WHERE sm.member_id = $1 AND i.kind = 'industry'
      LIMIT 1`,
    [subjectId]
  );
  if (!rows[0]) return null;
  return {
    id: Number(rows[0].id),
    slug: rows[0].slug,
    name: rows[0].display_name,
    sic: rows[0].sic,
    memberCount: Number(rows[0].members),
  };
}

export interface IndustryPage {
  id: number;
  name: string;
  sic: string;
  members: { ticker: string; name: string; slug: string }[];
}

export async function loadIndustry(slug: string): Promise<IndustryPage | null> {
  const { rows } = await getPool().query(
    `SELECT id, display_name, sic FROM subjects WHERE slug = $1 AND kind = 'industry'`,
    [slug.toLowerCase()]
  );
  if (!rows[0]) return null;
  const { rows: members } = await getPool().query(
    `SELECT m.ticker, m.display_name, m.slug
       FROM subject_members sm JOIN subjects m ON m.id = sm.member_id
      WHERE sm.industry_id = $1 ORDER BY m.ticker`,
    [rows[0].id]
  );
  return {
    id: Number(rows[0].id),
    name: rows[0].display_name,
    sic: rows[0].sic,
    members: members.map((m) => ({ ticker: m.ticker, name: m.display_name, slug: m.slug })),
  };
}

/**
 * Every event concerning any member of an industry, deduplicated. An event touching
 * several peers appears once, tagged with all of them — that overlap is the signal a
 * trend pass will look for.
 */
export async function loadIndustryEvents(industryId: number): Promise<TimelineEvent[]> {
  // Scope is the industry itself *plus* its members: sector-wide events (Federal
  // Register rules) link to the industry, company events link to the members.
  const { rows } = await getPool().query(
    `WITH scope AS (
       SELECT $1::bigint AS id
       UNION
       SELECT member_id FROM subject_members WHERE industry_id = $1
     )
     SELECT e.id, e.kind, e.occurred_on, e.date_precision, e.title,
            a.url, a.source_label,
            string_agg(DISTINCT m.ticker, ', ') FILTER (WHERE m.ticker IS NOT NULL) AS tickers,
            count(DISTINCT m.id) FILTER (WHERE m.ticker IS NOT NULL) AS peers
       FROM events e
       JOIN event_subjects es ON es.event_id = e.id
       JOIN scope sc ON sc.id = es.subject_id
       LEFT JOIN subjects m ON m.id = es.subject_id AND m.kind = 'company'
       LEFT JOIN event_attestations a ON a.event_id = e.id AND a.is_primary
      WHERE es.relevance IS NULL OR es.relevance >= $2
      GROUP BY e.id, e.kind, e.occurred_on, e.date_precision, e.title, a.url, a.source_label
      ORDER BY e.occurred_on DESC
      LIMIT 400`,
    [industryId, RELEVANCE_THRESHOLD]
  );
  return rows.map((r) => {
    const date =
      r.occurred_on instanceof Date
        ? r.occurred_on.toISOString().slice(0, 10)
        : String(r.occurred_on).slice(0, 10);
    const peers = Number(r.peers);
    return {
      id: `ind-${r.id}`,
      date,
      type: r.kind as EventType,
      title: r.title,
      source: r.source_label ?? "Chronolens",
      url: r.url ?? undefined,
      description:
        peers > 1 ? `${r.tickers} · ${peers} peers` : (r.tickers ?? "sector-wide"),
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
