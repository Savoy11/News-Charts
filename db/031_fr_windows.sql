-- A company's older Federal Register documents, asked a year at a time (batch 63,
-- lib/ingest/frBackfill.ts).
--
-- The daily ask reads the current year, newest first, at most forty a run. Each year from 1994,
-- where the Federal Register's API begins, to last year is asked once more, every page of it, and
-- every document whose title names the company is stored. A year that is over never changes, so
-- the asking is kept here, keyed by subject and the year's first day, and not repeated. `query` is
-- what was asked, the year's former names included: when it changes, the year is asked again.
--
-- Only an answer is stored. A refused or failed request is logged in `source_fetches`, as every
-- other Federal Register failure is, so the run-wide back-off sees it, and the year is asked again
-- later.
CREATE TABLE IF NOT EXISTS fr_windows (
  subject_id bigint NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  starts_on  date NOT NULL,
  query      text NOT NULL,
  documents  integer NOT NULL,         -- the full-text hits the Federal Register counted for the year
  kept       integer NOT NULL,         -- of those, the documents stored: the title names the company
  read_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subject_id, starts_on)
);
