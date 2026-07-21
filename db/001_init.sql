-- Generated from docs/EVENTS-SCHEMA.md. Edit the spec, then regenerate:
--   npm run db:gen

CREATE TYPE event_kind     AS ENUM ('history','press','news','filing','earnings','regulation');
CREATE TYPE date_precision AS ENUM ('day','month','year');
CREATE TYPE subject_kind   AS ENUM ('topic','company','industry');
CREATE TYPE fetch_outcome  AS ENUM ('ok','empty','throttled','error');

-- ---------------------------------------------------------------- sources
-- Licensing lives in the database because it is a hard product constraint:
-- Google News RSS is barred from this ad-supported site by its own terms.
CREATE TABLE sources (
  id            smallint PRIMARY KEY,
  key           text NOT NULL UNIQUE,          -- 'wikipedia' | 'loc_chronam' | 'gdelt' | 'sec_edgar'
  name          text NOT NULL,
  license       text NOT NULL,                 -- 'CC BY-SA 4.0' | 'public domain' | ...
  attribution   text NOT NULL,                 -- rendered in the footer and on cards
  commercial_ok boolean NOT NULL,              -- false => ingest must refuse to run
  notes         text
);

-- --------------------------------------------------------------- subjects
CREATE TABLE subjects (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind            subject_kind NOT NULL,
  slug            text NOT NULL UNIQUE,        -- URL segment: 'bicycle', 'aapl'
  display_name    text NOT NULL,
  ticker          text,
  cik             char(10),
  -- SIC comes free with every EDGAR submissions record, so the industry graph is
  -- authoritative rather than inferred. On an industry subject it is that industry.
  sic             char(4),
  wikidata_qid    text,
  wikipedia_title text,
  summary         text,                        -- lede paragraph shown above the timeline
  site_domain     text,                        -- resolved once via Wikidata P856, for Wayback links
  -- Earliest documented year. Doubles as the plausibility floor for noisy newspaper OCR:
  -- a "bicycle" hit dated 1837 is an OCR misread, not an event.
  first_event_on  date,
  created_at      timestamptz NOT NULL DEFAULT now(),
  refreshed_at    timestamptz,
  CONSTRAINT subjects_company_identified_ck
    CHECK (kind <> 'company' OR (cik IS NOT NULL AND ticker IS NOT NULL))
);
CREATE UNIQUE INDEX subjects_ticker_uq ON subjects (ticker) WHERE ticker IS NOT NULL;
CREATE UNIQUE INDEX subjects_cik_uq    ON subjects (cik)    WHERE cik IS NOT NULL;

-- Search terms that resolve to a subject ("electric cars" -> Electric car).
CREATE TABLE subject_aliases (
  subject_id bigint NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  alias      text   NOT NULL,
  PRIMARY KEY (subject_id, alias)
);
CREATE INDEX subject_aliases_lookup ON subject_aliases (lower(alias));

-- Industry membership. A join table rather than deriving from matching `sic` values,
-- so curated groupings ("AI chip makers") can span SIC codes later without a migration,
-- and so a company can sit in more than one industry.
CREATE TABLE subject_members (
  industry_id bigint NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  member_id   bigint NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  source      text   NOT NULL DEFAULT 'sic',   -- 'sic' | 'manual'
  added_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (industry_id, member_id),
  CONSTRAINT subject_members_not_self CHECK (industry_id <> member_id)
);
CREATE INDEX subject_members_member ON subject_members (member_id);

-- ----------------------------------------------------------------- events
-- What happened. Carries no source columns: those live in event_attestations,
-- because the same event can be attested by several documents.
CREATE TABLE events (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind           event_kind NOT NULL,
  occurred_on    date NOT NULL,                -- always set; year-precision normalises to Jan 1
  occurred_at    timestamptz,                  -- only when the source gives a real instant
  date_precision date_precision NOT NULL DEFAULT 'day',
  title          text NOT NULL,
  body           text,
  -- Identity. See "Identity: dedup_key" above.
  dedup_key      bytea NOT NULL UNIQUE,
  -- Current content, for change detection: drives re-enrichment when a body is
  -- edited without changing identity. Unchanged hash => never re-pay for AI.
  content_hash   bytea NOT NULL,
  ingested_at    timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT events_year_precision_ck CHECK (
    date_precision <> 'year'
    OR (EXTRACT(MONTH FROM occurred_on) = 1 AND EXTRACT(DAY FROM occurred_on) = 1)
  )
);
CREATE INDEX events_occurred_on   ON events (occurred_on);
CREATE INDEX events_kind_occurred ON events (kind, occurred_on);

-- ----------------------------------------------------------- attestations
-- Where we found it. One row per (source, document) that evidences the event.
CREATE TABLE event_attestations (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id     bigint   NOT NULL REFERENCES events(id)  ON DELETE CASCADE,
  source_id    smallint NOT NULL REFERENCES sources(id),
  -- EDGAR accession no, LoC item id, article URL, or Wikipedia article title.
  external_id  text NOT NULL,
  url          text,                            -- deep link, e.g. #:~:text= fragment
  source_label text,                            -- 'Wikipedia: History of the bicycle'
  is_primary   boolean NOT NULL DEFAULT false,  -- the one the UI links to
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  -- One document attests MANY events: a Wikipedia article evidences one row per
  -- sentence. Identity is therefore the (event, document) pair, never the document
  -- alone — keying on (source_id, external_id) silently collapses 71 sentences into
  -- a single attestation and repoints its URL on every write.
  CONSTRAINT event_attestations_uq UNIQUE (event_id, source_id, external_id)
);
CREATE INDEX event_attestations_event ON event_attestations (event_id);
-- At most one primary per event, enforced rather than assumed.
CREATE UNIQUE INDEX event_attestations_primary_uq
  ON event_attestations (event_id) WHERE is_primary;

-- ------------------------------------------------------- events <-> subjects
-- Who it concerns. Relevance is a property of the PAIR, not of the event: a TSMC
-- pricing story is fully relevant to TSMC and marginally relevant to Apple.
-- Measured 2026-07-21: 56% of "Apple" news from GDELT was not about Apple.
CREATE TABLE event_subjects (
  event_id   bigint NOT NULL REFERENCES events(id)   ON DELETE CASCADE,
  subject_id bigint NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  relevance  real,                              -- NULL = not yet scored
  scored_by  text,                              -- model id that produced it
  scored_at  timestamptz,
  PRIMARY KEY (event_id, subject_id),
  CONSTRAINT event_subjects_relevance_ck
    CHECK (relevance IS NULL OR relevance BETWEEN 0 AND 1)
);
CREATE INDEX event_subjects_backlog ON event_subjects (subject_id) WHERE relevance IS NULL;

-- ------------------------------------------------------------- enrichment
-- Versioned and additive: a better model does not overwrite prior output, so
-- results stay comparable and a bad prompt revision is revertible.
CREATE TABLE event_enrichments (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id       bigint NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  task           text NOT NULL,                 -- 'classify' | 'extract_date' | 'significance'
  model          text NOT NULL,                 -- e.g. 'claude-haiku-4-5-20251001'
  prompt_version smallint NOT NULL,
  input_hash     bytea NOT NULL,                -- events.content_hash it was derived from
  output         jsonb NOT NULL,
  input_tokens   integer,
  output_tokens  integer,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_enrichments_uq
    UNIQUE (event_id, task, model, prompt_version, input_hash)
);

-- -------------------------------------------------------------- syntheses
-- Generated narrative, e.g. "why did NVDA fall 12% across this window".
CREATE TABLE syntheses (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subject_id     bigint NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  kind           text NOT NULL,                 -- 'window_explainer'
  window_start   date NOT NULL,
  window_end     date NOT NULL,
  model          text NOT NULL,
  prompt_version smallint NOT NULL,
  input_hash     bytea NOT NULL,                -- hash of cited event ids + their content hashes
  body           text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT syntheses_window_ck CHECK (window_end >= window_start),
  CONSTRAINT syntheses_uq
    UNIQUE (subject_id, kind, window_start, window_end, model, prompt_version, input_hash)
);

-- ON DELETE RESTRICT is deliberate: a cited event cannot vanish while a synthesis
-- still points at it. The "every claim links to a source" rule, enforced by the DB.
CREATE TABLE synthesis_citations (
  synthesis_id bigint   NOT NULL REFERENCES syntheses(id) ON DELETE CASCADE,
  event_id     bigint   NOT NULL REFERENCES events(id)    ON DELETE RESTRICT,
  ordinal      smallint NOT NULL,
  PRIMARY KEY (synthesis_id, event_id)
);

-- ---------------------------------------------------------- ingest history
-- Distinguishes "the source returned nothing" from "we were rate limited", which
-- the live site currently cannot tell apart — a throttled GDELT reply arrives as
-- an HTTP 200 and silently blanks the news.
CREATE TABLE source_fetches (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id   smallint NOT NULL REFERENCES sources(id),
  subject_id  bigint REFERENCES subjects(id) ON DELETE CASCADE,
  query       text,
  outcome     fetch_outcome NOT NULL,
  event_count integer NOT NULL DEFAULT 0,
  http_status smallint,
  detail      text,
  fetched_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX source_fetches_recent
  ON source_fetches (source_id, subject_id, fetched_at DESC);

-- ----------------------------------------------------------------- prices
-- numeric, never float — same rule as CAEP.
CREATE TABLE prices (
  subject_id bigint NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  on_date    date   NOT NULL,
  close      numeric(18,6) NOT NULL,
  volume     bigint,
  PRIMARY KEY (subject_id, on_date)
);
