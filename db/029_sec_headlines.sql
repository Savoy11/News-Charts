-- Press-release headlines read from 8-K exhibits (batch 42, lib/secHeadlines.ts).
--
-- An 8-K is titled by its item ("Other events (8-K 8.01)"); its press release, filed as an
-- exhibit, carries the headline that says what happened. Reading it costs two or three EDGAR
-- requests, and a filing never changes, so each is read once and the answer kept here — a
-- headline, or NULL for a filing that has none — keyed by accession number, which is the
-- filing's identity everywhere else too. The ingest applies what is stored on every run.
--
-- `version` is the reading that produced the row (HEADLINE_VERSION): when the reading improves,
-- rows from an older version are read again, a run's worth at a time.
CREATE TABLE IF NOT EXISTS sec_headlines (
  accession text PRIMARY KEY,               -- 18 digits, no dashes, as event_attestations keep it
  headline  text,                           -- NULL: read, and no press-release headline found
  exhibit   text,                           -- the document read, NULL when the filing had none
  version   smallint NOT NULL,
  read_at   timestamptz NOT NULL DEFAULT now()
);
