-- The Justice Department's press releases of 2001–2008, from its archive's month pages
-- (batch 94, lib/dojArchive.ts, lib/ingest/dojArchiveWalk.ts).
--
-- The API lib/doj.ts reads holds releases from 2009 on; the Department keeps the earlier ones on
-- month pages, www.justice.gov/archive/opa/pr/YYYY/Month/. The archive is closed, so each of its
-- 96 months is read once: its releases are kept here, and each company's ingest keeps the ones
-- whose title names it as a party (`releaseNamesParty`), under the source the API's rows use,
-- `doj_press`.
--
-- Only an answer is stored. A refused or failed page is logged in `source_fetches` with the
-- company whose ingest asked, and the month is asked again later.
CREATE TABLE IF NOT EXISTS doj_archive_releases (
  path       text PRIMARY KEY,          -- the release's page on the site, "/archive/opa/pr/2005/January/05_crm_039.htm"
  filed_on   date NOT NULL,             -- the day, as the month page dates it
  number     text,                      -- the Department's number as the page writes it, "05-039" or "#807"
  title      text NOT NULL,
  teaser     text,                      -- the first lines the page gives under the title (from mid-2005)
  read_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS doj_archive_releases_filed_on ON doj_archive_releases (filed_on);

CREATE TABLE IF NOT EXISTS doj_archive_months (
  month      date PRIMARY KEY,          -- the month's first day
  releases   integer NOT NULL,          -- the releases read on its page
  unread     integer NOT NULL,          -- the rows it lists that could not be read (a slip in a day, a row with none)
  read_at    timestamptz NOT NULL DEFAULT now()
);
