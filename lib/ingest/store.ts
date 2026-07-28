import type { PoolClient } from "pg";
import { contentHash, dedupKey } from "./keys";
import { FetchOutcome, SourceKey, TimelineEvent } from "../types";

export const SOURCES: {
  id: number;
  key: SourceKey;
  name: string;
  license: string;
  attribution: string;
  commercialOk: boolean;
  notes?: string;
}[] = [
  {
    id: 1,
    key: "wikipedia",
    name: "Wikipedia",
    license: "CC BY-SA 4.0",
    attribution: "Wikipedia contributors",
    commercialOk: true,
  },
  {
    id: 2,
    key: "loc_chronam",
    name: "Chronicling America (Library of Congress)",
    license: "public domain",
    attribution: "Library of Congress, Chronicling America",
    commercialOk: true,
    notes: "503s under load; never sort by date — OCR misreads surface first",
  },
  {
    id: 3,
    key: "gdelt",
    name: "GDELT 2.0",
    license: "open data",
    attribution: "The GDELT Project",
    commercialOk: true,
    notes: "~1 req/5s per IP; throttle replies arrive as HTTP 200 with a text body",
  },
  {
    id: 4,
    key: "sec_edgar",
    name: "SEC EDGAR",
    license: "public domain",
    attribution: "U.S. Securities and Exchange Commission",
    commercialOk: true,
    notes: "requires a User-Agent with contact details",
  },
  {
    id: 5,
    key: "federal_register",
    name: "Federal Register",
    license: "public domain",
    attribution: "U.S. Government Publishing Office, Federal Register",
    commercialOk: true,
    notes: "industry-level rules, proposed rules and notices; no key, generous limits",
  },
  {
    id: 6,
    key: "yahoo_finance",
    name: "Yahoo Finance RSS",
    license: "RSS headlines + links",
    attribution: "Yahoo Finance",
    commercialOk: true,
    notes: "per-ticker feed; headline/link/date only, article stays on yahoo.com",
  },
  {
    id: 7,
    key: "nyt",
    name: "NYT Article Search",
    license: "NYT API terms — non-commercial",
    attribution: "The New York Times",
    commercialOk: false,
    notes: "archive to 1851; free key (NYT_API_KEY). Re-license before the ad-supported path uses it",
  },
  {
    id: 8,
    key: "guardian",
    name: "The Guardian Open Platform",
    license: "Guardian Open Platform terms — free tier is non-commercial",
    attribution: "Guardian News & Media",
    commercialOk: false,
    notes: "archive to 1999; free key (GUARDIAN_API_KEY). Re-license before the ad-supported path uses it",
  },
  {
    id: 9,
    key: "newsdata",
    name: "Newsdata.io",
    license: "Newsdata.io terms — free tier for personal/testing use",
    attribution: "Newsdata.io",
    commercialOk: false,
    notes: "multi-outlet aggregator, recent news; free key (NEWSDATA_API_KEY), 200 credits/day. Re-license before the ad-supported path uses it",
  },
  {
    id: 10,
    key: "gnews",
    name: "GNews",
    license: "GNews terms — free tier is non-commercial",
    attribution: "GNews",
    commercialOk: false,
    notes: "Google News results as JSON, recent news; free key (GNEWS_API_KEY), 100 req/day, 10 articles/req. Re-license before the ad-supported path uses it",
  },
  {
    id: 11,
    key: "currents",
    name: "Currents API",
    license: "Currents terms — free developer tier is non-commercial",
    attribution: "CurrentsAPI",
    commercialOk: false,
    notes: "multi-outlet aggregator, recent news; free key (CURRENTS_API_KEY). Re-license before the ad-supported path uses it",
  },
  {
    id: 12,
    key: "marketaux",
    name: "Marketaux",
    license: "Marketaux terms — free tier is non-commercial",
    attribution: "Marketaux",
    commercialOk: false,
    notes: "finance-native news tagged by ticker; free key (MARKETAUX_API_KEY), 100 req/day, 3 articles/req. Re-license before the ad-supported path uses it",
  },
  {
    id: 13,
    key: "eodhd",
    name: "EODHD Financial News",
    license: "EODHD terms — free tier for personal/evaluation use",
    attribution: "EOD Historical Data",
    commercialOk: false,
    notes: "ticker-keyed financial news; free key (EODHD_API_KEY), ~20 req/day and news access varies by plan — adapter degrades to empty. Re-license before the ad-supported path uses it",
  },
  {
    id: 14,
    key: "finnhub",
    name: "Finnhub Company News",
    license: "Finnhub terms — free tier is personal/non-commercial",
    attribution: "Finnhub",
    commercialOk: false,
    notes: "ticker-keyed company news, trailing year on the free tier; free key (FINNHUB_API_KEY), 60 req/min. Re-license before the ad-supported path uses it",
  },
  {
    id: 15,
    key: "onchain",
    name: "On-chain records",
    license: "public domain (on-chain facts)",
    attribution: "Bitcoin and Ethereum block data via mempool.space, Blockstream Esplora and Etherscan",
    // Raw chain facts are nobody's copyright, and the explorers used here serve them under
    // terms that permit commercial use. This stays true only while the sources stay raw:
    // Dune and Nansen sell *aggregations*, and their terms bar the ad-supported path.
    commercialOk: true,
    notes: "keyless for BTC/ETH milestones; ETHERSCAN_API_KEY only for token supply moves. No aggregator data — raw chain + public explorers only",
  },
];

const SOURCE_ID = new Map(SOURCES.map((s) => [s.key, s.id]));

export async function ensureSources(client: PoolClient): Promise<void> {
  for (const s of SOURCES) {
    await client.query(
      `INSERT INTO sources (id, key, name, license, attribution, commercial_ok, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE
          SET name = EXCLUDED.name, license = EXCLUDED.license,
              attribution = EXCLUDED.attribution,
              commercial_ok = EXCLUDED.commercial_ok, notes = EXCLUDED.notes`,
      [s.id, s.key, s.name, s.license, s.attribution, s.commercialOk, s.notes ?? null]
    );
  }
}

/** Keys whose terms bar commercial use, derived from SOURCES so there is one registry, not two. */
const NON_COMMERCIAL: ReadonlySet<SourceKey> = new Set(
  SOURCES.filter((s) => !s.commercialOk).map((s) => s.key)
);

/**
 * Set `COMMERCIAL_MODE=true` once anything on the site earns money — ads, affiliate links, a
 * paid tier. See the pre-release feed gate in docs/MASTER-CHECKLIST.md.
 */
export function commercialMode(): boolean {
  return process.env.COMMERCIAL_MODE === "true";
}

/**
 * The API key for a source, or null when the adapter must not run.
 *
 * `assertCommercialOk` below guards the ingest worker, but the site does not ingest to render:
 * `lib/page-data.ts` calls these adapters directly on the page path, so a non-commercial source
 * would keep serving visitors with nothing checking its licence. This closes that path.
 *
 * Returning null rather than throwing is deliberate — it is the same signal as "no key
 * configured", which every adapter already degrades from cleanly, so switching the flag on can
 * empty a feed but can never break a page.
 */
export function licensedKey(envVar: string, source: SourceKey): string | null {
  if (commercialMode() && NON_COMMERCIAL.has(source)) return null;
  return process.env[envVar] || null;
}

/** Why an adapter is sitting out, for the CLI feed report — null when it should run. */
export function skipReason(envVar: string, source: SourceKey): string | null {
  if (commercialMode() && NON_COMMERCIAL.has(source)) {
    return "blocked by COMMERCIAL_MODE (source is not licensed for commercial use)";
  }
  return process.env[envVar] ? null : `no ${envVar} set`;
}

/** Refuse to ingest from a source whose terms bar commercial use. */
export async function assertCommercialOk(client: PoolClient, key: SourceKey): Promise<void> {
  const { rows } = await client.query<{ commercial_ok: boolean }>(
    "SELECT commercial_ok FROM sources WHERE key = $1",
    [key]
  );
  if (rows[0] && !rows[0].commercial_ok) {
    throw new Error(`source ${key} is not licensed for commercial use — ingest refused`);
  }
}

/**
 * True when the last attempt at this source failed recently, so we shouldn't ask again.
 * Covers `error` as well as `throttled`: a rate-limited host often stops answering
 * altogether (GDELT returns 429 and then drops the connection), and retrying a source
 * that is actively refusing us just deepens the ban.
 */
export async function shouldBackOff(
  client: PoolClient,
  sourceKey: SourceKey,
  subjectId: number,
  minutes: number
): Promise<FetchOutcome | null> {
  const { rows } = await client.query<{ outcome: FetchOutcome }>(
    `SELECT outcome FROM source_fetches
      WHERE source_id = $1 AND subject_id = $2
        AND fetched_at > now() - ($3 || ' minutes')::interval
      ORDER BY fetched_at DESC LIMIT 1`,
    [SOURCE_ID.get(sourceKey), subjectId, String(minutes)]
  );
  const last = rows[0]?.outcome;
  return last === "throttled" || last === "error" ? last : null;
}

export async function logFetch(
  client: PoolClient,
  sourceKey: SourceKey,
  subjectId: number,
  query: string,
  outcome: FetchOutcome,
  eventCount: number,
  httpStatus?: number,
  detail?: string
): Promise<void> {
  await client.query(
    `INSERT INTO source_fetches
       (source_id, subject_id, query, outcome, event_count, http_status, detail)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      SOURCE_ID.get(sourceKey),
      subjectId,
      query,
      outcome,
      eventCount,
      httpStatus ?? null,
      detail ?? null,
    ]
  );
}

export async function upsertSubject(
  client: PoolClient,
  s: {
    kind: "topic" | "company" | "industry";
    slug: string;
    displayName: string;
    ticker?: string;
    cik?: string;
    sic?: string | null;
    wikipediaTitle?: string;
    summary?: string | null;
    siteDomain?: string | null;
    firstEventOn?: string | null;
  }
): Promise<number> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO subjects
       (kind, slug, display_name, ticker, cik, sic, wikipedia_title, summary,
        site_domain, first_event_on, refreshed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
     ON CONFLICT (slug) DO UPDATE
        SET display_name    = EXCLUDED.display_name,
            sic             = COALESCE(EXCLUDED.sic, subjects.sic),
            wikipedia_title = COALESCE(EXCLUDED.wikipedia_title, subjects.wikipedia_title),
            summary         = COALESCE(EXCLUDED.summary, subjects.summary),
            site_domain     = COALESCE(EXCLUDED.site_domain, subjects.site_domain),
            first_event_on  = LEAST(
              COALESCE(EXCLUDED.first_event_on, subjects.first_event_on),
              COALESCE(subjects.first_event_on, EXCLUDED.first_event_on)),
            refreshed_at    = now()
     RETURNING id`,
    [
      s.kind,
      s.slug.toLowerCase(),
      s.displayName,
      s.ticker ?? null,
      s.cik ?? null,
      s.sic ?? null,
      s.wikipediaTitle ?? null,
      s.summary ?? null,
      s.siteDomain ?? null,
      s.firstEventOn ?? null,
    ]
  );
  return Number(rows[0].id);
}

/**
 * Find-or-create a topic subject **by the article it resolves to**, not by what the
 * visitor typed. "electric car" and "electric cars" both land on Electric car, so they
 * must share one subject; the typed strings become aliases so every URL still resolves.
 *
 * Keying on the search string instead is what produced duplicate subjects holding
 * identical events.
 */
export async function upsertTopicSubject(
  client: PoolClient,
  s: {
    searchTerm: string;
    wikipediaTitle: string;
    displayName: string;
    summary?: string | null;
    firstEventOn?: string | null;
  }
): Promise<number> {
  const slug = s.searchTerm.toLowerCase();

  const existing = await client.query<{ id: string }>(
    `SELECT id FROM subjects WHERE kind = 'topic' AND wikipedia_title = $1 LIMIT 1`,
    [s.wikipediaTitle]
  );

  let id: number;
  if (existing.rows[0]) {
    id = Number(existing.rows[0].id);
    await client.query(
      `UPDATE subjects
          SET display_name   = $2,
              summary        = COALESCE($3, summary),
              first_event_on = LEAST(COALESCE($4::date, first_event_on),
                                     COALESCE(first_event_on, $4::date)),
              refreshed_at   = now()
        WHERE id = $1`,
      [id, s.displayName, s.summary ?? null, s.firstEventOn ?? null]
    );
  } else {
    id = await upsertSubject(client, {
      kind: "topic",
      slug,
      displayName: s.displayName,
      wikipediaTitle: s.wikipediaTitle,
      summary: s.summary,
      firstEventOn: s.firstEventOn,
    });
  }

  // record the phrasing that was searched, so /topic/<that> keeps resolving
  await client.query(
    `INSERT INTO subject_aliases (subject_id, alias) VALUES ($1,$2)
     ON CONFLICT DO NOTHING`,
    [id, slug]
  );
  return id;
}

/**
 * Create (or find) the industry a company belongs to and record the membership.
 * Industries are ordinary subjects, so they get timelines, syntheses and relevance
 * scoring for free — an industry-level event simply links to the industry subject.
 */
export async function linkToIndustry(
  client: PoolClient,
  companySubjectId: number,
  industry: { sic: string; description: string }
): Promise<{ industryId: number; slug: string }> {
  const slug = `sic-${industry.sic}`;
  const industryId = await upsertSubject(client, {
    kind: "industry",
    slug,
    displayName: industry.description,
    sic: industry.sic,
  });
  await client.query(
    `INSERT INTO subject_members (industry_id, member_id, source)
     VALUES ($1,$2,'sic')
     ON CONFLICT (industry_id, member_id) DO NOTHING`,
    [industryId, companySubjectId]
  );
  return { industryId, slug };
}

export interface UpsertStats {
  events: number;
  newEvents: number;
  attestations: number;
  newAttestations: number;
  links: number;
}

export function emptyStats(): UpsertStats {
  return { events: 0, newEvents: 0, attestations: 0, newAttestations: 0, links: 0 };
}

/**
 * Store one fetched item as: the event (deduplicated by content), the attestation
 * (this particular document), and the link to the subject it concerns.
 */
export async function upsertEvent(
  client: PoolClient,
  ev: TimelineEvent,
  subjectId: number,
  stats: UpsertStats
): Promise<void> {
  const sourceKey = ev.sourceKey;
  if (!sourceKey) throw new Error(`event ${ev.id} has no sourceKey`);
  const sourceId = SOURCE_ID.get(sourceKey);

  const key = dedupKey(ev.dedupBasis ?? ev.title);
  // image is part of the content fingerprint, so a newly-found thumbnail counts as a change and
  // the row updates instead of being skipped by the unchanged-hash guard below.
  const hash = contentHash([ev.title, ev.description, ev.url, ev.imageUrl]);

  // Identity is the dedup_key; content changes only bump the hash and updated_at.
  const upserted = await client.query<{ id: string; inserted: boolean }>(
    `INSERT INTO events (kind, occurred_on, date_precision, title, body, image_url, dedup_key, content_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (dedup_key) DO UPDATE
        SET body = EXCLUDED.body,
            image_url = COALESCE(EXCLUDED.image_url, events.image_url),
            content_hash = EXCLUDED.content_hash,
            updated_at = now()
      WHERE events.content_hash IS DISTINCT FROM EXCLUDED.content_hash
     RETURNING id, (xmax = 0) AS inserted`,
    [
      ev.type,
      ev.date,
      ev.yearOnly ? "year" : "day",
      ev.title,
      ev.description ?? null,
      ev.imageUrl ?? null,
      key,
      hash,
    ]
  );

  let eventId: string;
  if (upserted.rows[0]) {
    eventId = upserted.rows[0].id;
    stats.events++;
    if (upserted.rows[0].inserted) stats.newEvents++;
  } else {
    // conflict predicate failed => content unchanged, so nothing was returned
    const existing = await client.query<{ id: string }>(
      "SELECT id FROM events WHERE dedup_key = $1",
      [key]
    );
    eventId = existing.rows[0].id;
    stats.events++;
  }

  const externalId = ev.externalId ?? ev.url ?? ev.id;
  const attested = await client.query<{ id: string }>(
    `INSERT INTO event_attestations
       (event_id, source_id, external_id, url, source_label, is_primary)
     VALUES ($1,$2,$3,$4,$5,
             NOT EXISTS (SELECT 1 FROM event_attestations x
                          WHERE x.event_id = $1 AND x.is_primary))
     ON CONFLICT (event_id, source_id, external_id) DO UPDATE
        SET url = EXCLUDED.url, retrieved_at = now()
     RETURNING id, (xmax = 0) AS inserted`,
    [eventId, sourceId, externalId, ev.url ?? null, ev.source]
  );
  stats.attestations++;
  if ((attested.rows[0] as unknown as { inserted: boolean })?.inserted) stats.newAttestations++;

  const linked = await client.query(
    `INSERT INTO event_subjects (event_id, subject_id) VALUES ($1,$2)
     ON CONFLICT DO NOTHING`,
    [eventId, subjectId]
  );
  stats.links += linked.rowCount ?? 0;
}
