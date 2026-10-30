-- The SEC's press releases, every one the newsroom lists, read a year at a time (batch 73,
-- lib/secPress.ts, lib/ingest/secPressWalk.ts).
--
-- The listing is the SEC's, not a company's, so it is read once for every company: each release
-- is kept here, and each company's ingest keeps the ones whose headline makes it the party. A year that is over never changes, so it is read once, every page of it,
-- and marked `complete`; the current year is read again a day later, from its newest page until
-- a release already held.
--
-- Only an answer is stored. A refused or failed page is logged in `source_fetches` with the
-- company whose ingest asked, so the run-wide back-off sees it, and its year is read again later.
--
-- A release is its number and its day: the SEC has given one number twice (2022-123, on
-- 2022-07-18 and 2023-06-29), and listed one release twice under two addresses (2024-3).
CREATE TABLE IF NOT EXISTS sec_press_releases (
  release_no  text NOT NULL,             -- "2010-59", or before 2000 "98-129"
  released_on date NOT NULL,             -- the day in Washington
  title       text NOT NULL,
  url         text NOT NULL,
  read_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (release_no, released_on)
);

CREATE TABLE IF NOT EXISTS sec_press_years (
  year      integer PRIMARY KEY,
  complete  boolean NOT NULL,           -- read after the year ended, every page of it
  pages     integer NOT NULL,           -- the pages read the last time it was read
  releases  integer NOT NULL,           -- the releases stored from them
  read_at   timestamptz NOT NULL DEFAULT now()
);
