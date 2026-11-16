-- "Also on" for the EEOC's releases (batch 155, the 2026-11-16 audit's finding 3, lib/alsoOn.ts).
--
-- An EEOC release that names two listed companies is one event a company, each attested by the
-- release's own path, as the Justice Department's releases are by their numbers: Johnson Controls'
-- and ManpowerGroup's settlement of 2020-11-06 is on both pages. db/041's partial index covers only
-- the sources it lists, and the query writes the same list as literals so the planner can use it, so
-- the index is built again with the EEOC's id (41) in the list; db/042's setting is kept (no pending
-- list).
DROP INDEX IF EXISTS event_attestations_case_numbers;
CREATE INDEX IF NOT EXISTS event_attestations_case_numbers
  ON event_attestations USING gin (string_to_array(external_id, ','))
  WITH (fastupdate = off)
  WHERE source_id IN (23, 27, 28, 29, 30, 31, 32, 33, 41);
