-- The SEC's litigation releases and administrative proceedings, every row either listing holds,
-- read a year at a time (batch 83, lib/secCases.ts, lib/ingest/secCasesWalk.ts).
--
-- As with the press releases (db/032), the listings are the SEC's, not a company's, so they are
-- read once for every company: each row is kept here, and each company's ingest keeps the ones
-- whose caption names it as a party. A year that is over never changes, so it is read once, every
-- page of it, and marked `complete`; the current year is read again a day later, from its newest
-- page until a row already held.
--
-- Only an answer is stored. A refused or failed page is logged in `source_fetches` with the
-- company whose ingest asked, so the run-wide back-off sees it, and its year is read again later.
CREATE TABLE IF NOT EXISTS sec_cases (
  listing      text NOT NULL CHECK (listing IN ('litigation', 'proceeding')),
  release_no   text NOT NULL,             -- as the row gives it: "LR-21795", "34-63600, AAER-3222"
  released_on  date NOT NULL,             -- the day in Washington
  caption      text NOT NULL,             -- the defendants or respondents, as the SEC writes them
  file_no      text,                      -- a proceeding's file number, "3-14116"
  url          text NOT NULL,
  read_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (listing, release_no, released_on)
);

CREATE TABLE IF NOT EXISTS sec_cases_years (
  listing   text NOT NULL CHECK (listing IN ('litigation', 'proceeding')),
  year      integer NOT NULL,
  complete  boolean NOT NULL,           -- read after the year ended, every page of it
  pages     integer NOT NULL,           -- the pages read the last time it was read
  cases     integer NOT NULL,           -- the rows stored from them
  read_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (listing, year)
);
