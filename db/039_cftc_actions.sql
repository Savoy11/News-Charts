-- The Commodity Futures Trading Commission's enforcement actions, every action its list holds
-- (batch 97, lib/cftc.ts, lib/ingest/cftcWalk.ts).
--
-- As with the CFPB's actions (db/035), the list is the Commission's, not a company's, so it is read
-- for every company at once: the whole list once a year, which also picks up a title the
-- Commission corrects, and its newest page once a day, with further pages only while each holds no
-- action already kept. Each company's ingest keeps the actions whose title makes it the party.
--
-- Only an answer is stored. A refused or failed page is logged in `source_fetches` with the
-- company whose ingest asked, and the read is tried again later.
CREATE TABLE IF NOT EXISTS cftc_actions (
  path       text PRIMARY KEY,           -- the release's page, "/PressRoom/PressReleases/9320-26"
  filed_on   date NOT NULL,              -- the day, as the list shows it
  title      text NOT NULL,
  read_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cftc_reads (
  kind      text PRIMARY KEY CHECK (kind IN ('list', 'newest')),
  pages     integer NOT NULL,
  actions   integer NOT NULL,
  read_at   timestamptz NOT NULL DEFAULT now()
);
