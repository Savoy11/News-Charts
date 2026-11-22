-- "Also on" for the antitrust agencies' early terminations of the merger waiting period (batch 166,
-- lib/hsrEarly.ts, lib/alsoOn.ts).
--
-- A grant names its acquiring person, its acquired person and the entities bought, and is one event a
-- company a day, each attested by the day's transaction numbers. Where two listed companies are parties
-- (HCA's purchase from Tenet in 2017, AEP's from Sempra in 2019), each page's row names the other. So the
-- partial index db/041 built, and db/053 and db/054 built again with the EEOC's and the NLRB's ids, is
-- built again with this source's (45). db/042's setting is kept (no pending list). The grants are read
-- from a committed file, so no table is added.
DROP INDEX IF EXISTS event_attestations_case_numbers;
CREATE INDEX IF NOT EXISTS event_attestations_case_numbers
  ON event_attestations USING gin (string_to_array(external_id, ','))
  WITH (fastupdate = off)
  WHERE source_id IN (23, 27, 28, 29, 30, 31, 32, 33, 41, 44, 45);
