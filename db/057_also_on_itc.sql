-- "Also on" for the ITC's Section 337 investigations (batch 167, lib/itc337.ts, lib/alsoOn.ts).
--
-- An investigation names its complainants and its respondents, and is one event a company a day, each
-- attested by the day's investigation numbers ("337-TA-1093"; its final determination "337-TA-1093:final").
-- Where two listed companies are parties (Qualcomm's complaint against Apple of 2017, Cisco's against
-- Arista of 2015), each page's row names the other. So the partial index db/041 built, and db/053, db/054 and
-- db/056 built again, is built again with this source's id (46). db/042's setting is kept (no pending list).
-- The investigations are read from a committed file, so no table is added.
DROP INDEX IF EXISTS event_attestations_case_numbers;
CREATE INDEX IF NOT EXISTS event_attestations_case_numbers
  ON event_attestations USING gin (string_to_array(external_id, ','))
  WITH (fastupdate = off)
  WHERE source_id IN (23, 27, 28, 29, 30, 31, 32, 33, 41, 44, 45, 46);
