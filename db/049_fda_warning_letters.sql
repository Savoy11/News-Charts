-- The FDA's warning letters, 2021 on (batch 140, lib/fdaWarningLetters.ts, lib/ingest/fdaWarningWalk.ts).
--
-- The FDA's warning-letter list is read whole once a week for every company, through the data its own
-- table loads, 1,000 letters a request (3,807 letters on 2026-11-11, four requests). A read is kept only
-- when every page answered and the rows add up to the list's own total. Every letter is kept, whoever it
-- went to, so a change to the naming rules needs no new read; a letter the list drops later stays, as a
-- letter once posted is the agency's record. Each company's ingest keeps the letters whose addressee is
-- the company on the letter's issue day.
--
-- Only an answer is stored. A refused or failed read is logged in `source_fetches` with the company
-- whose ingest asked, and the list is asked again later.
CREATE TABLE IF NOT EXISTS fda_warning_letters (
  path       text PRIMARY KEY,           -- the letter's page on www.fda.gov
  company    text NOT NULL,              -- the addressee as the FDA writes it
  issued     date NOT NULL,
  posted     date,
  office     text NOT NULL,
  subject    text NOT NULL,
  response   date,                       -- the company's posted response, where the list gives one
  closeout   date,                       -- the FDA's close-out letter, where the list gives one
  read_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fda_warning_letters_issued ON fda_warning_letters (issued);

CREATE TABLE IF NOT EXISTS fda_warning_reads (
  id         integer PRIMARY KEY CHECK (id = 1),
  pages      integer NOT NULL,
  letters    integer NOT NULL,            -- the list's own total on that read
  read_at    timestamptz NOT NULL DEFAULT now()
);
