-- "Also on" for the EU courts' judgments (batch 183, lib/euCourts.ts, lib/alsoOn.ts).
--
-- A judgment can name several listed companies (Illumina and Grail's appeal of 2024, a cartel's appeals), and is one event
-- a company a day, each attested by the day's case numbers ("C-611/22 P"). Where two listed companies are its parties, each
-- page's row names the others. So the partial index db/041 built, and db/053 to db/061 built again, is built again with this
-- source's id (56). db/042's setting is kept (no pending list). The judgments are read from a committed file, so no table
-- is added.
DROP INDEX IF EXISTS event_attestations_case_numbers;
CREATE INDEX IF NOT EXISTS event_attestations_case_numbers
  ON event_attestations USING gin (string_to_array(external_id, ','))
  WITH (fastupdate = off)
  WHERE source_id IN (23, 27, 28, 29, 30, 31, 32, 33, 41, 44, 45, 46, 49, 50, 51, 52, 56);
