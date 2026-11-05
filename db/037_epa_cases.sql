-- The EPA's civil enforcement cases, every case its public case file holds (batch 95,
-- lib/epaCases.ts, lib/ingest/epaWalk.ts).
--
-- EPA publishes the file whole, one 82 MB zip of CSV tables (137,108 cases from the 1970s on,
-- 2026-10-31). It is read once a month for every company, and not again while EPA has not changed
-- it; a new copy replaces the kept one whole. Each company's ingest keeps the cases one of whose
-- defendants is the company by the caption rule.
--
-- Only an answer is stored. A refused or failed read is logged in `source_fetches` with the
-- company whose ingest asked, and the file is asked again later.
CREATE TABLE IF NOT EXISTS epa_cases (
  case_number  text PRIMARY KEY,          -- EPA's, "HQ-1996-0001"
  name         text NOT NULL,             -- the case's name as EPA writes it
  court        boolean NOT NULL,          -- a court case, else administrative
  filed_on     date NOT NULL,             -- its public day: lodged, entered or filed in court; the final order's or the complaint's
  step         text NOT NULL CHECK (step IN ('lodged', 'entered', 'filed', 'order', 'complaint')),
  penalty      numeric(16, 2),            -- the penalty assessed, in dollars; null for none
  laws         text[] NOT NULL,           -- EPA's codes, in its order: CAA, CWA, CERCLA…
  defendants   text[] NOT NULL,
  docket       text,                      -- the Justice Department's docket number of a court case
  name_keys    text NOT NULL              -- the defendants in lower-case letters and digits, "|" apart, for finding a company's
);

CREATE TABLE IF NOT EXISTS epa_reads (
  id        integer PRIMARY KEY CHECK (id = 1),
  modified  text,                         -- the file's Last-Modified as EPA sent it
  cases     integer NOT NULL,
  read_at   timestamptz NOT NULL DEFAULT now()
);
