import type { PoolClient } from "pg";
import { contentHash, dedupKey } from "./keys";
import { FetchOutcome, PricePoint, SourceKey, TimelineEvent } from "../types";
import { deterministicScore, type SubjectContext } from "../enrich/relevance";
import { safeHref } from "../safeUrl";
import { fullHistoryQuery } from "../prices";

/**
 * Everything upsertEvent needs to score a row at link time: the subject it is being linked
 * to, plus the alias set already computed once per ingest run rather than once per event.
 */
export interface ScoringContext {
  subject: SubjectContext;
  aliases: string[];
}

export const SOURCES: {
  id: number;
  key: SourceKey;
  name: string;
  license: string;
  attribution: string;
  commercialOk: boolean;
  /**
   * When this entry's licence and `commercialOk` judgement were last written down (YYYY-MM-DD),
   * taken from the commit that set them (NC-026). It is the date someone last looked — not a
   * promise the provider's terms still say the same. An undated flag was indistinguishable from
   * one nobody had read in a year; re-reading the terms, on any trigger the release gate in
   * docs/MASTER-CHECKLIST.md lists, is what moves this date.
   */
  reviewedOn: string;
  notes?: string;
}[] = [
  {
    id: 1,
    key: "wikipedia",
    name: "Wikipedia",
    license: "CC BY-SA 4.0",
    attribution: "Wikipedia contributors",
    commercialOk: true,
    reviewedOn: "2026-07-28",
  },
  {
    id: 2,
    key: "loc_chronam",
    name: "Chronicling America (Library of Congress)",
    license: "public domain",
    attribution: "Library of Congress, Chronicling America",
    commercialOk: true,
    reviewedOn: "2026-07-28",
    notes: "503s under load; never sort by date — OCR misreads surface first",
  },
  {
    id: 3,
    key: "gdelt",
    name: "GDELT 2.0",
    license: "open data",
    attribution: "The GDELT Project",
    commercialOk: true,
    reviewedOn: "2026-07-28",
    notes: "~1 req/5s per IP; throttle replies arrive as HTTP 200 with a text body",
  },
  {
    id: 4,
    key: "sec_edgar",
    name: "SEC EDGAR",
    license: "public domain",
    attribution: "U.S. Securities and Exchange Commission",
    commercialOk: true,
    reviewedOn: "2026-07-28",
    notes: "requires a User-Agent with contact details",
  },
  {
    id: 5,
    key: "federal_register",
    name: "Federal Register",
    license: "public domain",
    attribution: "U.S. Government Publishing Office, Federal Register",
    commercialOk: true,
    reviewedOn: "2026-07-28",
    notes: "industry-level rules, proposed rules and notices; no key, generous limits",
  },
  {
    id: 6,
    key: "yahoo_finance",
    name: "Yahoo Finance RSS",
    license: "RSS headlines + links",
    attribution: "Yahoo Finance",
    commercialOk: true,
    reviewedOn: "2026-07-28",
    notes: "per-ticker feed; headline/link/date only, article stays on yahoo.com",
  },
  {
    id: 7,
    key: "nyt",
    name: "NYT Article Search",
    license: "NYT API terms — non-commercial",
    attribution: "The New York Times",
    commercialOk: false,
    reviewedOn: "2026-07-28",
    notes: "archive to 1851; free key (NYT_API_KEY). Re-license before the ad-supported path uses it",
  },
  {
    id: 8,
    key: "guardian",
    name: "The Guardian Open Platform",
    license: "Guardian Open Platform terms — free tier is non-commercial",
    attribution: "Guardian News & Media",
    commercialOk: false,
    reviewedOn: "2026-07-28",
    notes: "archive to 1999; free key (GUARDIAN_API_KEY). Re-license before the ad-supported path uses it",
  },
  {
    id: 9,
    key: "newsdata",
    name: "Newsdata.io",
    license: "Newsdata.io terms — free tier for personal/testing use",
    attribution: "Newsdata.io",
    commercialOk: false,
    reviewedOn: "2026-07-28",
    notes: "multi-outlet aggregator, recent news; free key (NEWSDATA_API_KEY), 200 credits/day. Re-license before the ad-supported path uses it",
  },
  {
    id: 10,
    key: "gnews",
    name: "GNews",
    license: "GNews terms — free tier is non-commercial",
    attribution: "GNews",
    commercialOk: false,
    reviewedOn: "2026-07-28",
    notes: "Google News results as JSON, recent news; free key (GNEWS_API_KEY), 100 req/day, 10 articles/req. Re-license before the ad-supported path uses it",
  },
  {
    id: 11,
    key: "currents",
    name: "Currents API",
    license: "Currents terms — free developer tier is non-commercial",
    attribution: "CurrentsAPI",
    commercialOk: false,
    reviewedOn: "2026-07-28",
    notes: "multi-outlet aggregator, recent news; free key (CURRENTS_API_KEY). Re-license before the ad-supported path uses it",
  },
  {
    id: 12,
    key: "marketaux",
    name: "Marketaux",
    license: "Marketaux terms — free tier is non-commercial",
    attribution: "Marketaux",
    commercialOk: false,
    reviewedOn: "2026-07-28",
    notes: "finance-native news tagged by ticker; free key (MARKETAUX_API_KEY), 100 req/day, 3 articles/req. Re-license before the ad-supported path uses it",
  },
  {
    id: 13,
    key: "eodhd",
    name: "EODHD Financial News",
    license: "EODHD terms — free tier for personal/evaluation use",
    attribution: "EOD Historical Data",
    commercialOk: false,
    reviewedOn: "2026-07-28",
    notes: "ticker-keyed financial news; free key (EODHD_API_KEY), ~20 req/day and news access varies by plan — adapter degrades to empty. Re-license before the ad-supported path uses it",
  },
  {
    id: 14,
    key: "finnhub",
    name: "Finnhub Company News",
    license: "Finnhub terms — free tier is personal/non-commercial",
    attribution: "Finnhub",
    commercialOk: false,
    reviewedOn: "2026-07-28",
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
    reviewedOn: "2026-07-28",
    notes: "keyless for BTC/ETH milestones; ETHERSCAN_API_KEY only for token supply moves. No aggregator data — raw chain + public explorers only",
  },
  {
    id: 16,
    key: "internet_archive",
    name: "Internet Archive",
    license: "varies by item; index and metadata openly available",
    attribution: "Internet Archive (archive.org, Wayback Machine)",
    // What is used here is the *index*: an item's title, date and identifier, plus a link to
    // archive.org. Individual items carry their own rights and are never copied or served from
    // here, so the ad-supported path is clear on the metadata alone. Republishing item *content*
    // would be a different question and this adapter does not do it.
    commercialOk: true,
    reviewedOn: "2026-07-28",
    notes: "keyless. advancedsearch for dated items, Wayback CDX for site captures. Metadata quality is uneven — bare years are common and stay year-precision",
  },
  {
    id: 17,
    key: "snapshot",
    name: "Snapshot",
    license: "public governance records; open API, no key",
    attribution: "Snapshot Labs (snapshot.org)",
    // What is read is the record of a public vote — who proposed what and how the tally landed.
    // Governance results are facts about a protocol, not anyone's copyrighted work.
    commercialOk: true,
    reviewedOn: "2026-07-29",
    notes: "keyless GraphQL. Off-chain signed votes, NOT transactions — filed as 'governance', never 'onchain'",
  },
  {
    id: 18,
    key: "defillama",
    name: "DefiLlama (hacks dataset)",
    license: "open data, keyless API",
    attribution: "DefiLlama",
    // A public record of incidents, republished with attribution and a link back. What is used
    // is the fact of the incident, not DefiLlama's analysis of it.
    commercialOk: true,
    reviewedOn: "2026-07-29",
    notes: "incidents are ATTRIBUTED, not confirmed on-chain by us — the 'exploit' kind exists to keep that distinction visible",
  },
  {
    id: 19,
    key: "yahoo_prices",
    name: "Yahoo Finance chart",
    license: "unofficial chart API — daily closes and corporate actions",
    attribution: "Yahoo Finance",
    // Prices always came from this endpoint; they were logged under the RSS feed's key, or not at
    // all. A key of its own changes what is recorded, not what is used — the terms question in
    // the release gate is the same one the RSS row carries.
    commercialOk: true,
    reviewedOn: "2026-10-17",
    notes: "daily closes for the price chart; its own window and outcome log, separate from the RSS headlines (NC-103)",
  },
  {
    id: 20,
    key: "fed_fomc",
    name: "Federal Reserve FOMC calendar",
    license: "public domain",
    attribution: "Board of Governors of the Federal Reserve System",
    // A U.S. government work. What is used is the date of each policy statement and a link to it.
    commercialOk: true,
    reviewedOn: "2026-10-20",
    notes: "FOMC policy statements since 1994 from the calendar and year pages; no key (NC-080)",
  },
  {
    id: 21,
    key: "bls_cpi",
    name: "BLS CPI release archive",
    license: "public domain",
    attribution: "U.S. Bureau of Labor Statistics",
    commercialOk: true,
    reviewedOn: "2026-10-20",
    notes: "Consumer Price Index release dates since 2008; refuses requests without a contact User-Agent (NC-080)",
  },
  {
    id: 22,
    key: "nhtsa_recalls",
    name: "NHTSA vehicle recalls",
    license: "public domain",
    attribution: "National Highway Traffic Safety Administration, U.S. Department of Transportation",
    // "Public Domain U.S. Government" in the dataset's own licence field (data.transportation.gov,
    // 6axg-epim); the federal data catalog lists the recalls file as us-pd. Used: the campaign's
    // date, subject line, vehicle count, defect summary and a link to NHTSA's page for it.
    commercialOk: true,
    reviewedOn: "2026-10-22",
    notes: "recall campaigns since 1966 for the vehicle makers lib/recalls.ts maps; no key (batch 30)",
  },
  {
    id: 23,
    key: "doj_press",
    name: "Justice Department press releases",
    license: "public domain",
    attribution: "U.S. Department of Justice",
    // justice.gov/legalpolicies: "Unless otherwise indicated, information on Department of Justice
    // websites is in the public domain and may be copied and distributed without permission."
    // Used: the release's title, date, teaser and link — never its photos.
    commercialOk: true,
    reviewedOn: "2026-10-22",
    notes: "releases since 2009 whose title makes a listed company a party (lib/doj.ts); no key (batch 32)",
  },
  {
    id: 24,
    key: "fda_enforcement",
    name: "FDA enforcement reports",
    license: "public domain (CC0 1.0)",
    attribution: "U.S. Food and Drug Administration (openFDA)",
    // open.fda.gov/license: "public domain and made available with a Creative Commons CC0 1.0
    // Universal dedication… You can copy, modify, distribute and perform the work, even for
    // commercial purposes, all without asking permission." Used: the recall's date, class, product
    // name, reason and a link to the enforcement report's page for it.
    commercialOk: true,
    reviewedOn: "2026-10-24",
    notes: "Class I and II drug, device and food recalls since 2012 for the firms lib/fdaRecalls.ts maps; no key (batch 40)",
  },
  {
    id: 25,
    key: "nhtsa_investigations",
    name: "NHTSA defect investigations",
    license: "public domain",
    attribution: "National Highway Traffic Safety Administration, U.S. Department of Transportation",
    // "Public Domain U.S. Government" in the dataset's own licence field (data.transportation.gov,
    // b3rp-be92, "Investigations Data", read 2026-10-27), linked to usa.gov/government-works.
    // Used: the investigation's number, type, subject line, component, dates, the recall NHTSA
    // links to it, and a link to NHTSA's page for it. Approved by the owner on 2026-10-26.
    commercialOk: true,
    reviewedOn: "2026-10-27",
    notes: "defect investigations since 1975 into the vehicle makers lib/recalls.ts maps, shown with recalls; no key (batch 66)",
  },
  {
    id: 26,
    key: "fed_enforcement",
    name: "Federal Reserve enforcement actions",
    license: "public domain",
    attribution: "Board of Governors of the Federal Reserve System",
    // "Unless otherwise indicated, information on Board's website is in the public domain and may be
    // copied and distributed without permission. Please cite to the Board as the source of the
    // information." (federalreserve.gov/disclaimer.htm, read 2026-10-26). Used: each action's day,
    // the Board's words for it, the organisation it names, the day it ended, and a link to its
    // press release. Approved by the owner on 2026-10-26.
    commercialOk: true,
    reviewedOn: "2026-10-27",
    notes: "the Board's enforcement actions since 1989 against the banks lib/fedActions.ts maps; two keyless files, no key (batch 69)",
  },
  {
    id: 27,
    key: "sec_press",
    name: "SEC press releases",
    license: "public domain",
    attribution: "U.S. Securities and Exchange Commission",
    // "Information presented on sec.gov is considered public information and may be copied or
    // further distributed by users of the web site without the SEC's permission. Please consider
    // appropriate citation to the SEC as the source." (sec.gov/about/privacy-information, "Website
    // Dissemination", read 2026-10-28). Used: the release's headline, day, number and a link to
    // it. Approved by the owner on 2026-10-29.
    commercialOk: true,
    reviewedOn: "2026-10-29",
    notes: "the newsroom's releases since 1997 whose headline makes a listed company the party (lib/secPress.ts); no key (batch 73)",
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
 * The sources the ingest path is allowed to reach, i.e. the ones we may write into the shared
 * corpus. This is `assertCommercialOk` as a set rather than a throw, so a check can assert the
 * rule statically instead of waiting for a runtime refusal — see `scripts/check-wiring.ts`.
 *
 * A non-commercial source is not merely gated by `COMMERCIAL_MODE` on the ingest path: ingesting
 * is republishing, so it is barred outright. Where such a feed still has a home it is the
 * visitor's own key in `lib/feeds/browser.ts`, which never touches this database.
 */
export const INGESTABLE_SOURCES: ReadonlySet<SourceKey> = new Set(
  SOURCES.filter((s) => s.commercialOk).map((s) => s.key)
);

/**
 * Set `COMMERCIAL_MODE=true` in any environment someone other than the owner can load — a
 * private preview included — before the first such visit (D22, applied 2026-10-19). The site is
 * ad-supported by design, so it is commercial from its first outside visitor, not its first ad.
 * See the pre-release feed gate in docs/MASTER-CHECKLIST.md.
 */
export function commercialMode(): boolean {
  return process.env.COMMERCIAL_MODE === "true";
}

/**
 * The API key for a source, or null when the adapter must not run.
 *
 * `assertCommercialOk` below guards the ingest worker; this guards the adapters themselves,
 * wherever they are called from. When it was written the page path called the eight keyed
 * adapters on every view. Since the scheduler cut-over pages read only the database, and today
 * nothing on the ingest or page path calls them either: they are reached by the feed
 * diagnostics (`scripts/check-feeds.ts`) alone, and `scripts/check-wiring.ts` records why each
 * stays off (NC-035). The gate stays, so that wiring one up later cannot skip the licence check.
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

/**
 * Refuse to ingest from a source whose terms bar commercial use.
 *
 * A source the `sources` table has never heard of is a refusal, not a pass. This used to read
 * `if (rows[0] && !rows[0].commercial_ok)`, so on a database where nothing had ever called
 * `ensureSources` the lookup returned no row, the condition was false, and every source ingested
 * with the licence check silently permitting it — including the eight flagged `commercialOk:
 * false` above. No migration seeds this table, and the scheduled refresh path did not seed it
 * either, so "no row" was the *normal* state of a fresh production database rather than an
 * exotic one. A gate that answers "fine" for a source it cannot find is not defence in depth.
 */
export async function assertCommercialOk(client: PoolClient, key: SourceKey): Promise<void> {
  const { rows } = await client.query<{ commercial_ok: boolean }>(
    "SELECT commercial_ok FROM sources WHERE key = $1",
    [key]
  );
  if (!rows[0]) {
    throw new Error(
      `source ${key} is not in the sources registry — ingest refused. ` +
        `Call ensureSources() before ingesting.`
    );
  }
  if (!rows[0].commercial_ok) {
    throw new Error(`source ${key} is not licensed for commercial use — ingest refused`);
  }
}

/**
 * When each source was last asked about this subject, for the per-source refresh windows.
 *
 * Only successful-ish attempts count as "asked": an `error` row means we never got an answer,
 * and treating that as a fresh fetch would silence a broken feed for hours.
 *
 * Lives here rather than in `lib/store/read.ts` because its caller is `scripts/ingest.ts`, and
 * that module memoises with React's `cache` — importing it from a plain node script throws on
 * load. Page reads and ingest reads are different worlds; this one belongs to ingest.
 */
export async function loadLastFetched(
  client: PoolClient,
  subjectId: number
): Promise<Map<SourceKey, Date>> {
  const { rows } = await client.query<{ key: SourceKey; fetched_at: Date }>(
    `SELECT DISTINCT ON (s.key) s.key, f.fetched_at
       FROM source_fetches f
       JOIN sources s ON s.id = f.source_id
      WHERE f.subject_id = $1 AND f.outcome IN ('ok','empty')
      ORDER BY s.key, f.fetched_at DESC`,
    [subjectId]
  );
  return new Map(rows.map((r) => [r.key, r.fetched_at]));
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
  /**
   * A throttle is the whole source's, not one subject's: GDELT and LoC rate-limit by IP. Looked
   * up per subject alone, one throttled run kept asking for every subject after it — about 600
   * requests into an active GDELT ban per hourly run (NC-143). So the source's latest attempt,
   * whichever subject it was for, decides first: throttled means everyone waits out the window,
   * and the first subject after it is the probe that finds out whether the ban has lifted. An
   * `error` stays per subject — one bad query is not the host refusing us.
   */
  const { rows } = await client.query<{ mine: FetchOutcome | null; latest: FetchOutcome | null }>(
    `SELECT (SELECT outcome FROM source_fetches
              WHERE source_id = $1 AND subject_id = $2
                AND fetched_at > now() - ($3 || ' minutes')::interval
              ORDER BY fetched_at DESC LIMIT 1) AS mine,
            (SELECT outcome FROM source_fetches
              WHERE source_id = $1
                AND fetched_at > now() - ($3 || ' minutes')::interval
              ORDER BY fetched_at DESC LIMIT 1) AS latest`,
    [SOURCE_ID.get(sourceKey), subjectId, String(minutes)]
  );
  if (rows[0]?.latest === "throttled") return "throttled";
  const mine = rows[0]?.mine;
  return mine === "throttled" || mine === "error" ? mine : null;
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
    /**
     * The slug to mint a new subject under, when it should not be the typed words — the paths
     * that mint from what a visitor typed pass the article's name (NC-157). Taken only if no
     * other subject holds it; otherwise the typed slug, as before.
     */
    canonicalSlug?: string;
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
    // A slug another subject holds would make the upsert below update *that* subject.
    let mintAs = slug;
    if (s.canonicalSlug && s.canonicalSlug !== slug) {
      const taken = await client.query(`SELECT 1 FROM subjects WHERE slug = $1`, [s.canonicalSlug]);
      if (!taken.rows.length) mintAs = s.canonicalSlug;
    }
    id = await upsertSubject(client, {
      kind: "topic",
      slug: mintAs,
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
/**
 * Group subjects that share a role rather than a SIC code.
 *
 * Crypto has no SIC code and never will, but the grouping question is the same one the industry
 * graph already answers: *what else is like this, and did the same thing happen to all of them?*
 * A stablecoin sector page puts every issuer's supply moves on one axis, which is where a
 * redemption wave is visible and on any single issuer's page it is not.
 *
 * Reuses `kind = 'industry'` deliberately. A fourth subject kind would need a migration, a fourth
 * page type, and would inherit none of the timeline, SEO or follow behaviour industries already
 * have — for a distinction that is ours, not the reader's. The membership row records `curated`
 * rather than `sic`, which is the honest provenance: nobody assigned these, we did.
 */
export async function linkToSector(
  client: PoolClient,
  memberSubjectId: number,
  sector: { slug: string; displayName: string; summary?: string }
): Promise<number> {
  const industryId = await upsertSubject(client, {
    kind: "industry",
    slug: sector.slug,
    displayName: sector.displayName,
    summary: sector.summary,
  });
  await client.query(
    `INSERT INTO subject_members (industry_id, member_id, source)
     VALUES ($1,$2,'curated')
     ON CONFLICT (industry_id, member_id) DO NOTHING`,
    [industryId, memberSubjectId]
  );
  return industryId;
}

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
 * Write a daily price series for a subject.
 *
 * `replace` swaps the whole stored history for this one, in the caller's transaction — what a
 * split needs, since every close before it is re-adjusted (NC-156). `dropBefore` deletes rows
 * older than a date instead, when a full history could not be had: a shorter chart is honest,
 * one that steps at the edge of the old window is not.
 */
export async function writePrices(
  client: PoolClient,
  subjectId: number,
  points: PricePoint[],
  opts: { replace?: boolean; dropBefore?: string } = {}
): Promise<void> {
  if (opts.replace) await client.query(`DELETE FROM prices WHERE subject_id = $1`, [subjectId]);
  else if (opts.dropBefore) {
    await client.query(`DELETE FROM prices WHERE subject_id = $1 AND on_date < $2`, [subjectId, opts.dropBefore]);
  }
  if (!points.length) return;
  await client.query(
    `INSERT INTO prices (subject_id, on_date, close, volume)
     SELECT $1, d, c, v FROM unnest($2::date[], $3::numeric[], $4::bigint[]) AS t(d, c, v)
     ON CONFLICT (subject_id, on_date) DO UPDATE
        SET close = EXCLUDED.close,
            volume = COALESCE(EXCLUDED.volume, prices.volume)`,
    [subjectId, points.map((p) => p.time), points.map((p) => p.value), points.map((p) => p.volume ?? null)]
  );
}

/**
 * Whether this subject's whole daily history has been read — a successful full-history fetch in
 * the log (NC-077). Until it has, ingest asks for every close Yahoo holds; after, ten years keep
 * it current. The log is never purged, so this is read once per subject, not once per run — and
 * a read logged under an older marker (`fullHistoryQuery`) does not count, so changing the marker
 * is how every subject is made to read its history again.
 */
export async function hasFullPriceHistory(client: PoolClient, subjectId: number, symbol: string): Promise<boolean> {
  const { rows } = await client.query(
    `SELECT 1
       FROM source_fetches f
       JOIN sources s ON s.id = f.source_id AND s.key = 'yahoo_prices'
      WHERE f.subject_id = $1 AND f.query = $2 AND f.outcome = 'ok'
      LIMIT 1`,
    [subjectId, fullHistoryQuery(symbol)]
  );
  return rows.length > 0;
}

/**
 * Whether a fresh 10-year series would leave older stored closes on a stale adjustment.
 *
 * Yahoo adjusts for splits, but only inside what it returns. A split this series reports and the
 * database has not seen re-adjusts every earlier close — and rows that have aged out of the
 * 10-year window since the subject was first ingested are never overwritten, so the chart would
 * step at that boundary (NC-156). A first ingest has no older rows, so it never triggers.
 */
export async function splitNeedsFullHistory(
  client: PoolClient,
  subjectId: number,
  points: PricePoint[],
  splits: TimelineEvent[]
): Promise<boolean> {
  if (!splits.length || !points.length) return false;
  const { rows } = await client.query<{ older: boolean; known: string }>(
    `SELECT EXISTS (SELECT 1 FROM prices WHERE subject_id = $1 AND on_date < $2) AS older,
            (SELECT count(*) FROM events WHERE dedup_key = ANY($3::bytea[])) AS known`,
    [subjectId, points[0].time, splits.map((e) => dedupKey(e.dedupBasis ?? e.title))]
  );
  return Boolean(rows[0]?.older) && Number(rows[0]?.known ?? 0) < splits.length;
}

/**
 * Move an event from one identity to another.
 *
 * When nothing holds `toKey` yet, the row simply takes it. When something does, the two rows are
 * the same happening stored twice, and they merge into the one already under `toKey`.
 */
export async function rekeyEvent(
  client: PoolClient,
  fromKey: Buffer,
  toKey: Buffer
): Promise<"none" | "rekeyed" | "merged"> {
  if (fromKey.equals(toKey)) return "none";
  const { rows } = await client.query<{ id: string; current: boolean }>(
    `SELECT id, dedup_key = $2 AS current FROM events WHERE dedup_key IN ($1, $2)`,
    [fromKey, toKey]
  );
  const old = rows.find((r) => !r.current);
  if (!old) return "none";
  const survivor = rows.find((r) => r.current);
  if (!survivor) {
    await client.query(`UPDATE events SET dedup_key = $2 WHERE id = $1`, [old.id, toKey]);
    return "rekeyed";
  }
  await mergeEvents(client, Number(survivor.id), Number(old.id));
  return "merged";
}

/**
 * Fold one event into another and delete it.
 *
 * Every attestation moves across as a secondary source (the survivor keeps the primary the page
 * links to); subject links move unless the survivor already has them; a synthesis citing the
 * duplicate now cites the survivor, which is required before the delete, since citations are
 * `ON DELETE RESTRICT` exactly so a cited event cannot vanish. Enrichments of the duplicate go
 * with it — they described the same text.
 */
export async function mergeEvents(client: PoolClient, survivorId: number, loserId: number): Promise<void> {
  await client.query(
    `UPDATE event_attestations a SET event_id = $1, is_primary = false
      WHERE a.event_id = $2
        AND NOT EXISTS (SELECT 1 FROM event_attestations x
                         WHERE x.event_id = $1 AND x.source_id = a.source_id AND x.external_id = a.external_id)`,
    [survivorId, loserId]
  );
  await client.query(
    `INSERT INTO event_subjects (event_id, subject_id, relevance, scored_by, scored_at)
     SELECT $1, subject_id, relevance, scored_by, scored_at FROM event_subjects WHERE event_id = $2
     ON CONFLICT (event_id, subject_id) DO NOTHING`,
    [survivorId, loserId]
  );
  await client.query(
    `UPDATE synthesis_citations c SET event_id = $1
      WHERE c.event_id = $2
        AND NOT EXISTS (SELECT 1 FROM synthesis_citations x WHERE x.synthesis_id = c.synthesis_id AND x.event_id = $1)`,
    [survivorId, loserId]
  );
  await client.query(`DELETE FROM synthesis_citations WHERE event_id = $1`, [loserId]);
  await client.query(`DELETE FROM events WHERE id = $1`, [loserId]);
}

/**
 * Store one fetched item as: the event (deduplicated by content), the attestation
 * (this particular document), and the link to the subject it concerns.
 */
export async function upsertEvent(
  client: PoolClient,
  ev: TimelineEvent,
  subjectId: number,
  stats: UpsertStats,
  scoring?: ScoringContext
): Promise<void> {
  const sourceKey = ev.sourceKey;
  if (!sourceKey) throw new Error(`event ${ev.id} has no sourceKey`);
  const sourceId = SOURCE_ID.get(sourceKey);

  const key = dedupKey(ev.dedupBasis ?? ev.title);
  // A row stored under this source's old identity is moved onto the new one before anything
  // else reads the key, so the change of basis never duplicates an event (NC-154).
  if (ev.legacyDedupBasis) await rekeyEvent(client, dedupKey(ev.legacyDedupBasis), key);
  // Only an http(s) link is ever stored: the read side renders it as an href (NC-163).
  const url = safeHref(ev.url) ?? null;
  // image is part of the content fingerprint, so a newly-found thumbnail counts as a change and
  // the row updates instead of being skipped by the unchanged-hash guard below.
  const hash = contentHash([ev.title, ev.description, url, ev.imageUrl]);

  /**
   * Identity is the dedup_key; content changes only bump the hash and updated_at.
   *
   * `title` is updated as well as `body`, which it was not. `contentHash` has always included
   * the title, so a corrected headline bumped the hash, satisfied the conflict predicate, wrote
   * the new body — and left the old title on the row for ever. That was not theoretical: the
   * DefiLlama unit fix (2026-07-31) corrects figures that live *in the title*
   * ("Aave V3 exploited — $862.00bn"), and without this those rows could never be healed by
   * re-ingesting. A source that corrects itself must be able to correct us.
   *
   * The same holds for WHEN and WHAT: date, precision and kind were fixed at first insert, so a
   * citation refined from a year to a day, a corrected archive date or a reclassified filing never
   * reached the row (NC-141). They update only from the source that owns the event's primary
   * attestation — two sources attesting one event with different dates must not take turns — and
   * a date-only correction is its own reason to update, since it leaves the content hash alone.
   * So is the instant it came out (`occurred_at`, batch 68), which the filings stored before EDGAR's
   * acceptance time was read gain on their next ingest.
   */
  const { rows: owner } = await client.query<{ primary: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM events e
                      JOIN event_attestations a ON a.event_id = e.id AND a.is_primary
                     WHERE e.dedup_key = $1 AND a.source_id = $2) AS primary`,
    [key, sourceId ?? null]
  );
  const ownsEvent = owner[0]?.primary ?? false;
  const upserted = await client.query<{ id: string; inserted: boolean }>(
    `INSERT INTO events (kind, occurred_on, date_precision, title, body, image_url, dedup_key, content_hash, occurred_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$10)
     ON CONFLICT (dedup_key) DO UPDATE
        SET title = EXCLUDED.title,
            body = EXCLUDED.body,
            image_url = COALESCE(EXCLUDED.image_url, events.image_url),
            content_hash = EXCLUDED.content_hash,
            occurred_on = CASE WHEN $9 THEN EXCLUDED.occurred_on ELSE events.occurred_on END,
            date_precision = CASE WHEN $9 THEN EXCLUDED.date_precision ELSE events.date_precision END,
            kind = CASE WHEN $9 THEN EXCLUDED.kind ELSE events.kind END,
            occurred_at = CASE WHEN $9 THEN EXCLUDED.occurred_at ELSE events.occurred_at END,
            updated_at = now()
      WHERE events.content_hash IS DISTINCT FROM EXCLUDED.content_hash
         OR ($9 AND (events.occurred_on, events.date_precision, events.kind, events.occurred_at)
                    IS DISTINCT FROM (EXCLUDED.occurred_on, EXCLUDED.date_precision, EXCLUDED.kind, EXCLUDED.occurred_at))
     RETURNING id, (xmax = 0) AS inserted`,
    [
      ev.type,
      ev.date,
      ev.precision ?? "day",
      ev.title,
      ev.description ?? null,
      ev.imageUrl ?? null,
      key,
      hash,
      ownsEvent,
      ev.occurredAt ?? null,
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
    [eventId, sourceId, externalId, url, ev.source]
  );
  stats.attestations++;
  if ((attested.rows[0] as unknown as { inserted: boolean })?.inserted) stats.newAttestations++;

  /**
   * Score at link time, free. `deterministicScore` is pure and synchronous, and without this
   * a freshly ingested subject sat entirely unranked (NULL) until someone remembered to run
   * `npm run score` — which on a first-visit ingest means the page's whole first paint.
   *
   * Non-strict mode on purpose: almost every non-null verdict there is 0.7–1.0, above the
   * display threshold. The one exception is an Internet Archive item that never names the
   * subject, which scores 0.2 and is hidden — a keyword-search hit with nothing tying it to the
   * subject is exactly what should not reach the page (NC-131). Null verdicts (oblique news,
   * regulation) stay NULL and keep displaying.
   *
   * A row already scored deterministically is re-scored when the rules now say otherwise, so a
   * corrected rule heals the rows it got wrong on their next ingest — the archive items once
   * scored 0.9 as citations. A row a model scored is never overwritten.
   */
  const verdict = scoring
    ? deterministicScore(
        { eventId: 0, kind: ev.type, title: ev.title, sourceKey, byline: ev.source },
        scoring.subject,
        scoring.aliases,
        false
      )
    : null;
  const linked = await client.query<{ inserted: boolean }>(
    `INSERT INTO event_subjects (event_id, subject_id, relevance, scored_by, scored_at)
     VALUES ($1,$2,$3,$4, CASE WHEN $3::real IS NULL THEN NULL ELSE now() END)
     ON CONFLICT (event_id, subject_id) DO UPDATE
        SET relevance = EXCLUDED.relevance, scored_by = EXCLUDED.scored_by, scored_at = EXCLUDED.scored_at
      WHERE $5 AND event_subjects.scored_by = 'deterministic'
        AND event_subjects.relevance IS DISTINCT FROM EXCLUDED.relevance
     RETURNING (xmax = 0) AS inserted`,
    [eventId, subjectId, verdict?.score ?? null, verdict ? "deterministic" : null, Boolean(scoring)]
  );
  stats.links += linked.rows.filter((r) => r.inserted).length;
}
