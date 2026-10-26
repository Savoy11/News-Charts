-- A company's older GDELT news, asked a month at a time (batch 57, lib/ingest/newsBackfill.ts).
--
-- The hourly ask returns GDELT's newest hundred articles, which for a busy company is its last few
-- days. Each month since 2017, the hourly ask's floor, is asked once more, by relevance, for
-- the pages most about the company. A month that is over never changes, so the asking is kept here,
-- keyed by subject and the month's first day, and not repeated. `query` is what was asked: when a
-- company's GDELT query changes, its months are asked again under the new one.
--
-- Only an answer is stored. A refused or failed request is logged in `source_fetches`, as every
-- other GDELT failure is, so the run-wide back-off sees it, and the month is asked again later.
CREATE TABLE IF NOT EXISTS gdelt_windows (
  subject_id bigint NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  starts_on  date NOT NULL,
  query      text NOT NULL,
  articles   integer NOT NULL,         -- the stories GDELT returned for the month
  kept       integer NOT NULL,         -- of those, the stories stored: the headline names the company
  read_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subject_id, starts_on)
);
