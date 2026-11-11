-- MSHA's own finding on each death (batch 139, the 2026-11-11 proposal 1, lib/mineAccidents.ts,
-- lib/ingest/mineWalk.ts).
--
-- Two more files of MSHA's open-data page, read once a month and streamed, never decoded whole: the
-- Inspections file (74 MB zipped, 349 MB of text on 2026-11-10), cut to the investigations of accidents
-- (activity codes E06, AFA and 30) at the mines of the kept fatal accidents, and the Assessed Violations
-- file (110 MB zipped, 1.34 GB of text), cut to the violations assessed under the investigations linked
-- to one. An investigation is an accident's when MSHA began it at the mine on the accident's day or at
-- most 14 days after, the latest such accident at the mine. A new read replaces both tables whole.
--
-- Penalties are numeric, never a float: MSHA's proposed penalty, and the amount assessed now, which a
-- contest before the Federal Mine Safety and Health Review Commission can change.
CREATE TABLE IF NOT EXISTS mine_investigations (
  event_no       text PRIMARY KEY,        -- MSHA's event number, "1148152"
  accident_key   text NOT NULL,           -- the accident it investigated: mine_accidents.accident_key, "2602246:2010-08-12"
  mine_id        text NOT NULL,
  begin_day      date NOT NULL,           -- the day MSHA began it
  activity_code  text NOT NULL            -- E06, AFA or 30
);

CREATE INDEX IF NOT EXISTS mine_investigations_accident ON mine_investigations (accident_key);

CREATE TABLE IF NOT EXISTS mine_violations (
  event_no         text NOT NULL,         -- the investigation it was cited under
  violation_no     text NOT NULL,
  violator_type    text NOT NULL,         -- "Operator" or "Contractor"
  violator_name    text NOT NULL,         -- as it was at the assessment
  action           text NOT NULL,         -- the citation's or order's section: "104(a)", "104(d)(1)"…
  assessment       text NOT NULL,         -- "Regular", "Special" or "Single"
  proposed_amount  numeric(14, 2) NOT NULL,
  current_amount   numeric(14, 2) NOT NULL,
  PRIMARY KEY (event_no, violation_no)
);

ALTER TABLE mine_reads ADD COLUMN IF NOT EXISTS findings_modified text;   -- the Assessed Violations file's Last-Modified
ALTER TABLE mine_reads ADD COLUMN IF NOT EXISTS findings_read_at timestamptz;
