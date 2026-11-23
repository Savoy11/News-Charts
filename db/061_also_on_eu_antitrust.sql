-- "Also on" for the European Commission's competition decisions (batch 177, lib/euAntitrust.ts, lib/alsoOn.ts).
--
-- A cartel decision is addressed to several companies, and is one event a company a day, each attested by the day's case
-- numbers ("COMP/38899"). Where two listed companies are its addressees (ABB, Alstom and Hitachi in gas-insulated
-- switchgear, 2007), each page's row names the others. So the partial index db/041 built, and db/053, db/054, db/056,
-- db/057, db/058, db/059 and db/060 built again, is built again with this source's id (52). db/042's setting is kept (no
-- pending list). The decisions are read from a committed file, so no table is added.
DROP INDEX IF EXISTS event_attestations_case_numbers;
CREATE INDEX IF NOT EXISTS event_attestations_case_numbers
  ON event_attestations USING gin (string_to_array(external_id, ','))
  WITH (fastupdate = off)
  WHERE source_id IN (23, 27, 28, 29, 30, 31, 32, 33, 41, 44, 45, 46, 49, 50, 51, 52);
