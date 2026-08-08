import { cache } from "react";
import { getPool } from "../db";
import { RELEVANCE_THRESHOLD } from "../enrich/relevance";
import { DatePrecision, EventType, PricePoint, SourceKey, TimelineEvent } from "../types";

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

export interface SourceContribution {
  key: SourceKey;
  name: string;
  license: string;
  attribution: string;
  /** events on this subject's timeline that this source attests */
  events: number;
  lastFetchedAt: Date | null;
  lastOutcome: string | null;
}

/**
 * What each source actually contributed to this subject, and how its last attempt went.
 *
 * A page rendering with three of eleven feeds down looks completely healthy, which sends
 * anyone debugging it in the wrong direction. This is the data that tells them apart, and it
 * doubles as the per-source attribution the licences ask for.
 */
export async function loadSourceContributions(subjectId: number): Promise<SourceContribution[]> {
  const { rows } = await getPool().query<{
    key: SourceKey;
    name: string;
    license: string;
    attribution: string;
    events: string;
    fetched_at: Date | null;
    outcome: string | null;
  }>(
    `WITH contributed AS (
       SELECT a.source_id, count(DISTINCT e.id) AS events
         FROM event_subjects es
         JOIN events e ON e.id = es.event_id
         JOIN event_attestations a ON a.event_id = e.id
        WHERE es.subject_id = $1
        GROUP BY a.source_id
     ),
     latest AS (
       SELECT DISTINCT ON (source_id) source_id, fetched_at, outcome
         FROM source_fetches
        WHERE subject_id = $1
        ORDER BY source_id, fetched_at DESC
     )
     SELECT s.key, s.name, s.license, s.attribution,
            COALESCE(c.events, 0) AS events,
            l.fetched_at, l.outcome
       FROM sources s
       LEFT JOIN contributed c ON c.source_id = s.id
       LEFT JOIN latest l ON l.source_id = s.id
      WHERE c.events IS NOT NULL OR l.source_id IS NOT NULL
      ORDER BY COALESCE(c.events, 0) DESC, s.name`,
    [subjectId]
  );
  return rows.map((r) => ({
    key: r.key,
    name: r.name,
    license: r.license,
    attribution: r.attribution,
    events: Number(r.events),
    lastFetchedAt: r.fetched_at,
    lastOutcome: r.outcome,
  }));
}

/**
 * The database mirror of `resolveCompany`, for companies already ingested.
 *
 * `loadSubject` matches a slug or a recorded alias, which only helps a visitor who types the
 * ticker — nothing ever records "Ford" as an alias of `f`. This matches the way people actually
 * search, on the same three rungs the EDGAR lookup uses: exact ticker, exact name, then a name
 * prefix ("Ford" → "Ford Motor Company"). Prefix hits prefer the shortest name, so "Ford" lands
 * on Ford Motor Company rather than a longer namesake.
 *
 * Ordered before the live EDGAR call so search keeps working when that file is throttled.
 */
export async function findKnownCompany(
  query: string
): Promise<{ ticker: string; displayName: string } | null> {
  const q = query.trim();
  if (!q) return null;
  const { rows } = await getPool().query<{ ticker: string; display_name: string }>(
    `SELECT ticker, display_name
       FROM subjects
      WHERE kind = 'company' AND ticker IS NOT NULL
        AND (upper(ticker) = upper($1)
             OR lower(display_name) = lower($1)
             OR display_name ILIKE $1 || ' %')
      ORDER BY (upper(ticker) = upper($1)) DESC,
               (lower(display_name) = lower($1)) DESC,
               length(display_name)
      LIMIT 1`,
    [q]
  );
  return rows[0] ? { ticker: rows[0].ticker, displayName: rows[0].display_name } : null;
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
    `SELECT e.id, e.kind, e.occurred_on, e.date_precision, e.title, e.body, e.image_url,
            es.relevance,
            a.url, a.source_label, a.external_id,
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
      imageUrl: r.image_url ?? undefined,
      // The attestation's external id is what the source calls this thing — a block height, an
      // accession number. The read path used to drop it, which left on-chain rows unable to say
      // which block they came from even though the row was sitting in the database.
      externalId: r.external_id ?? undefined,
      precision: r.date_precision as DatePrecision,
      // The stored subject-aboutness score, surfaced so ranking can use it. It was only ever
      // an invisible SQL gate before — a score that can hide a row but never order one.
      relevance: r.relevance == null ? undefined : Number(r.relevance),
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
    `SELECT e.id, e.kind, e.occurred_on, e.date_precision, e.title, e.image_url,
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
    imageUrl: r.image_url ?? undefined,
    precision: r.date_precision as DatePrecision,
  }));
}

export interface StoredExplanation {
  /** matches a signal by kind + window */
  key: string;
  body: string;
  model: string;
  citations: { id: number; title: string; url: string | null }[];
}

/**
 * Explanations already generated for a subject. Each carries the events it cites — the
 * UI shows them as links, so a reader can always check a claim against the source.
 */
export async function loadExplanations(subjectId: number): Promise<StoredExplanation[]> {
  const { rows } = await getPool().query(
    `SELECT sy.id, sy.kind, sy.model, sy.body,
            to_char(sy.window_start,'YYYY-MM-DD') AS ws,
            json_agg(json_build_object('id', e.id, 'title', e.title, 'url', a.url)
                     ORDER BY sc.ordinal) AS citations
       FROM syntheses sy
       JOIN synthesis_citations sc ON sc.synthesis_id = sy.id
       JOIN events e ON e.id = sc.event_id
       LEFT JOIN event_attestations a ON a.event_id = e.id AND a.is_primary
      WHERE sy.subject_id = $1
      GROUP BY sy.id, sy.kind, sy.model, sy.body, sy.window_start
      ORDER BY sy.window_start DESC`,
    [subjectId]
  );
  return rows.map((r) => ({
    key: `${r.kind}|${r.ws}`,
    body: r.body,
    model: r.model,
    citations: r.citations ?? [],
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

// Request-memoised so the industry page and its generateMetadata share one query pair.
export const loadIndustry = cache(async (slug: string): Promise<IndustryPage | null> => {
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
});

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
      precision: r.date_precision as DatePrecision,
    } satisfies TimelineEvent;
  });
}

export async function loadPrices(subjectId: number): Promise<PricePoint[]> {
  const { rows } = await getPool().query(
    `SELECT on_date, close, volume FROM prices WHERE subject_id = $1 ORDER BY on_date`,
    [subjectId]
  );
  return rows.map((r) => ({
    time:
      r.on_date instanceof Date
        ? r.on_date.toISOString().slice(0, 10)
        : String(r.on_date).slice(0, 10),
    value: Number(r.close),
    // bigint arrives as a string from pg; rows persisted before volume was plumbed have none
    ...(r.volume == null ? {} : { volume: Number(r.volume) }),
  }));
}

export function isStale(refreshedAt: Date | null, maxAgeMinutes: number): boolean {
  if (!refreshedAt) return true;
  return Date.now() - refreshedAt.getTime() > maxAgeMinutes * 60_000;
}
