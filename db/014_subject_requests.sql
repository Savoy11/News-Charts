-- Subjects a visitor asked for that we do not have yet.
--
-- Pages read only the database now: a subject that is not indexed renders a notice rather than
-- fetching eleven feeds on the visitor's page load. That removes the stampede and stops a
-- database outage from turning every page view into a live fetch — but it also means nothing new
-- would ever enter the corpus, because a page view was the only thing that ever added one.
--
-- So a request for something we do not have is recorded here, and the scheduled refresh picks it
-- up. Deliberately a table in the Postgres we already run rather than a queue in another store:
-- the volume is a handful of rows an hour, and a second piece of infrastructure to hold them
-- would cost more to operate than the problem is worth.
CREATE TABLE IF NOT EXISTS subject_requests (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- what the visitor searched for, normalised the same way a slug is
  slug          text NOT NULL UNIQUE,
  -- 'company' when the query resolved to a ticker, else 'topic'; a hint, not a promise
  kind          subject_kind NOT NULL,
  -- the ticker when we know one, so the runner does not have to resolve it again
  ticker        text,
  -- how many people have asked. The runner works the most-wanted first, which is the only
  -- fair way to spend a quota that cannot cover every request in one pass.
  requests      integer NOT NULL DEFAULT 1,
  first_asked   timestamptz NOT NULL DEFAULT now(),
  last_asked    timestamptz NOT NULL DEFAULT now(),
  -- set when the runner has ingested it; kept rather than deleted so demand stays visible
  fulfilled_at  timestamptz,
  -- why it could not be fulfilled, when it could not be
  last_error    text
);

-- The runner's query: unfulfilled, most-wanted first.
CREATE INDEX IF NOT EXISTS subject_requests_pending
  ON subject_requests (requests DESC, last_asked DESC) WHERE fulfilled_at IS NULL;
