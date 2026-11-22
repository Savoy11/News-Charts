-- "Also on" for the European Commission's merger notifications (batch 174, lib/euMergers.ts, lib/alsoOn.ts).
--
-- A notification names its parties in full, and is one event a company a day, each attested by the day's case numbers
-- ("M.5529"). Where two listed companies are parties (Oracle and Sun Microsystems in 2009, Microsoft and LinkedIn in
-- 2016), each page's row names the other. So the partial index db/041 built, and db/053, db/054, db/056, db/057 and db/058
-- built again, is built again with this source's id (50). db/042's setting is kept (no pending list). The notices are
-- read from a committed file, so no table is added.
DROP INDEX IF EXISTS event_attestations_case_numbers;
CREATE INDEX IF NOT EXISTS event_attestations_case_numbers
  ON event_attestations USING gin (string_to_array(external_id, ','))
  WITH (fastupdate = off)
  WHERE source_id IN (23, 27, 28, 29, 30, 31, 32, 33, 41, 44, 45, 46, 49, 50);
