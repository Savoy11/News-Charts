-- "Also on": a case's other listed companies, linked from its row (batch 106, lib/alsoOn.ts).
--
-- A case naming several companies is held as one event a company, each attested by the source's
-- own number for the case; a grouped row carries its cases' numbers joined by commas. A page finds
-- the other companies' events by the same source and an overlapping number, which this index serves.
-- It covers only the sources whose one case names several parties (ALSO_ON_SOURCES): the Justice
-- Department's releases (23), the SEC's press releases (27) and cases (28), the Federal Reserve
-- Board's releases (29), the CFPB's actions (30), EPA's cases (31), the CPSC's recalls (32) and the
-- CFTC's actions (33). The query writes the same list, so the planner can use the index.
CREATE INDEX IF NOT EXISTS event_attestations_case_numbers
  ON event_attestations USING gin (string_to_array(external_id, ','))
  WHERE source_id IN (23, 27, 28, 29, 30, 31, 32, 33);
