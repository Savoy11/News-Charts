-- The NLRB's Board decisions, every decision its listing gives (batch 161, lib/nlrbDecisions.ts,
-- lib/ingest/nlrbWalk.ts).
--
-- As with the EEOC's releases (db/052), the listing is the Board's, not a company's, so it is read for
-- every company at once: the whole listing once a year, and only in the NLRB's night window for bulk
-- reads (11 pm to 6 am Eastern, its policy), and its newest page once a day, with further pages only
-- while each holds no decision already kept. Each company's ingest keeps the decisions in its own cases.
--
-- Only an answer is stored. A refused or failed page is logged in `source_fetches` with the company
-- whose ingest asked, and the read is tried again later.
CREATE TABLE IF NOT EXISTS nlrb_decisions (
  document     text PRIMARY KEY,           -- the decision's document id on apps.nlrb.gov, "09031d45843ede05"
  day          date NOT NULL,              -- the listing's issue day
  citation     text NOT NULL,              -- "375 NLRB No. 68", "1 NLRB 519"
  case_name    text NOT NULL,
  case_number  text NOT NULL,              -- "13-CA-393585"
  read_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nlrb_decisions_day ON nlrb_decisions (day);

CREATE TABLE IF NOT EXISTS nlrb_reads (
  kind       text PRIMARY KEY CHECK (kind IN ('list', 'newest')),
  pages      integer NOT NULL,
  decisions  integer NOT NULL,
  read_at    timestamptz NOT NULL DEFAULT now()
);

-- "Also on" for the Board's decisions (lib/alsoOn.ts): a joint employers' decision is one event a
-- company, each attested by the decision's document, so the partial index db/041 built, and db/053 built
-- again with the EEOC's id, is built again with the NLRB's (44). db/042's setting is kept (no pending list).
DROP INDEX IF EXISTS event_attestations_case_numbers;
CREATE INDEX IF NOT EXISTS event_attestations_case_numbers
  ON event_attestations USING gin (string_to_array(external_id, ','))
  WITH (fastupdate = off)
  WHERE source_id IN (23, 27, 28, 29, 30, 31, 32, 33, 41, 44);
