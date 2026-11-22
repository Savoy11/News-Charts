-- "Also on" for the Federal Reserve's actions on applications in its weekly H.2 release (batch 173, lib/fedH2.ts,
-- lib/alsoOn.ts).
--
-- An action names its applicant and the companies it acquires, and is one event a company a day, each attested by
-- the day's actions, a week and a place in its release ("19991211#29"). Where two listed companies are parties (FBOP's
-- stake in Banner is one, BNP Paribas's shares of Shinhan another; Wells Fargo's acquisition of a listed bank), each
-- page's row names the other. So the partial index db/041 built, and db/053, db/054, db/056 and db/057 built again, is
-- built again with this source's id (49). db/042's setting is kept (no pending list). The actions are read from a
-- committed file, so no table is added.
DROP INDEX IF EXISTS event_attestations_case_numbers;
CREATE INDEX IF NOT EXISTS event_attestations_case_numbers
  ON event_attestations USING gin (string_to_array(external_id, ','))
  WITH (fastupdate = off)
  WHERE source_id IN (23, 27, 28, 29, 30, 31, 32, 33, 41, 44, 45, 46, 49);
