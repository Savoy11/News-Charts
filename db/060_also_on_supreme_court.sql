-- "Also on" for the Supreme Court's decisions (batch 176, lib/supremeCourt.ts, lib/alsoOn.ts).
--
-- A case names its parties, and is one event a company a day, each attested by the day's citations ("569 U.S. 27").
-- Where two listed companies are parties (Travelers and PG&E in 2007, Google and Oracle in 2021), each page's row names
-- the other. So the partial index db/041 built, and db/053, db/054, db/056, db/057, db/058 and db/059 built again, is
-- built again with this source's id (51). db/042's setting is kept (no pending list). The decisions are read from a
-- committed file, so no table is added.
DROP INDEX IF EXISTS event_attestations_case_numbers;
CREATE INDEX IF NOT EXISTS event_attestations_case_numbers
  ON event_attestations USING gin (string_to_array(external_id, ','))
  WITH (fastupdate = off)
  WHERE source_id IN (23, 27, 28, 29, 30, 31, 32, 33, 41, 44, 45, 46, 49, 50, 51);
