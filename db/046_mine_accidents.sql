-- The accidents that killed someone at a mine, every one MSHA's open data holds from 2000 (batch 134,
-- lib/mineAccidents.ts, lib/ingest/mineWalk.ts).
--
-- MSHA publishes its Accidents file whole, one 52 MB zip of every injury, illness and accident a mine
-- operator or contractor reported on Form 7000-1 since 2000 (275,800 records, 2026-11-09). It is read
-- once a week for every company, and not again while MSHA has not changed it; a new copy replaces the
-- kept accidents whole. Only the deaths are kept, grouped by mine and day (1,130 accidents, 1,221
-- dead), whoever controlled the mine, so a change to the controller map needs no new read. Each
-- company's ingest keeps the accidents under the controllers lib/mineAccidents.ts maps to it.
--
-- Only an answer is stored. A refused or failed read is logged in `source_fetches` with the company
-- whose ingest asked, and the files are asked again later.
CREATE TABLE IF NOT EXISTS mine_accidents (
  accident_key     text PRIMARY KEY,        -- "<mine ID>:<day>", "4601437:2003-01-22"
  mine_id          text NOT NULL,           -- MSHA's seven digits
  day              date NOT NULL,
  time_of_day      text NOT NULL,           -- the first record's, "0100"
  dead             integer NOT NULL CHECK (dead > 0),
  contractor_dead  integer NOT NULL CHECK (contractor_dead >= 0 AND contractor_dead <= dead),
  controller_id    text NOT NULL,           -- the controller's ID on the day, "C00692"; "" where MSHA gives none
  controller_name  text NOT NULL,           -- MSHA's present name for that ID
  operator_name    text NOT NULL,           -- …and for the operator
  classification   text NOT NULL,
  accident_type    text NOT NULL,
  subunit          text NOT NULL,           -- where at the mine: "UNDERGROUND"…
  coal             boolean NOT NULL,
  narrative        text NOT NULL,
  documents        text[] NOT NULL,         -- MSHA's document numbers, one a person
  mine_name        text NOT NULL,           -- from the Mines file: the mine's present name
  county           text NOT NULL,
  state            text NOT NULL,
  town             text NOT NULL
);

CREATE INDEX IF NOT EXISTS mine_accidents_controller ON mine_accidents (controller_id);

CREATE TABLE IF NOT EXISTS mine_reads (
  id         integer PRIMARY KEY CHECK (id = 1),
  modified   text,                          -- the Accidents file's Last-Modified as MSHA sent it
  accidents  integer NOT NULL,
  read_at    timestamptz NOT NULL DEFAULT now()
);
