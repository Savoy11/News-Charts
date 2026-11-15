-- The EEOC's press releases, every release its newsroom lists (batch 152, lib/eeoc.ts,
-- lib/ingest/eeocWalk.ts).
--
-- As with the CFTC's actions (db/039), the listing is the Commission's, not a company's, so it is read
-- for every company at once: the whole listing once a year, which also picks up a title or a day the
-- Commission corrects, and its newest page once a day, with further pages only while each holds no
-- release already kept. Each company's ingest keeps the releases whose title makes it the party.
--
-- A release's day is the listing's, else the day its excerpt's date line gives ("PRESS RELEASE
-- 2-21-02"). One with neither has `day` NULL until its own page is read, once (`page_read_at`), the
-- owner's call (a) of 2026-11-15; a page that gives no day either keeps it NULL, and the release makes
-- no row.
--
-- Only an answer is stored. A refused or failed page is logged in `source_fetches` with the company
-- whose ingest asked, and the read is tried again later.
CREATE TABLE IF NOT EXISTS eeoc_releases (
  path          text PRIMARY KEY,           -- the release's page, "/newsroom/eeoc-sues-autozone-disability-discrimination"
  title         text NOT NULL,
  day           date,                       -- the listing's day, else its text's; NULL until read
  summary       text NOT NULL DEFAULT '',   -- the listing's excerpt, plain text
  page_read_at  timestamptz,                -- when the release's own page was read for its day
  read_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eeoc_releases_day ON eeoc_releases (day);

CREATE TABLE IF NOT EXISTS eeoc_reads (
  kind      text PRIMARY KEY CHECK (kind IN ('list', 'newest')),
  pages     integer NOT NULL,
  releases  integer NOT NULL,
  read_at   timestamptz NOT NULL DEFAULT now()
);
