-- The Consumer Financial Protection Bureau's enforcement actions, every action its list holds
-- (batch 89, lib/cfpb.ts, lib/ingest/cfpbWalk.ts).
--
-- As with the SEC's cases (db/033), the list is the Bureau's, not a company's, so it is read once
-- for every company: each action is kept here, and each company's ingest keeps the ones whose
-- title names it as a respondent. The whole list, 16 pages, is read once a month, which also
-- picks up a title, summary or day the Bureau corrects; its first page is read once a day, and
-- further pages only while each holds no action already kept.
--
-- Only an answer is stored. A refused or failed page is logged in `source_fetches` with the
-- company whose ingest asked, so the run-wide back-off sees it, and the read is tried again later.
CREATE TABLE IF NOT EXISTS cfpb_actions (
  path         text PRIMARY KEY,          -- the action's page, "/enforcement/actions/wells-fargo-bank-na-2016/"
  filed_on     date NOT NULL,             -- the day filed, as the list dates it
  title        text NOT NULL,             -- the respondents, as the Bureau names them
  description  text NOT NULL,             -- the Bureau's one-sentence summary
  read_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cfpb_reads (
  kind      text PRIMARY KEY CHECK (kind IN ('list', 'newest')),  -- every page, or the newest only
  pages     integer NOT NULL,           -- the pages read
  actions   integer NOT NULL,           -- the distinct actions they showed
  listed    integer,                    -- the list's own count, on its first page
  read_at   timestamptz NOT NULL DEFAULT now()
);
