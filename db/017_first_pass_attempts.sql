-- The attempt ledger behind first-visit ingest.
--
-- A slug Wikipedia cannot resolve never creates a subject row, so the subjects table cannot
-- bound repeat attempts against it — and typos and crawler noise are exactly the traffic that
-- arrives most often. This ledger is written BEFORE any fetch: claiming the attempt is what
-- grants permission to fetch, so a database outage produces zero fetches, not a stampede
-- (the deliberate inverse of ingest's dueSources, which fails open because a cron run must
-- never lose a feed to bad bookkeeping).
--
-- One row per normalized query target. `dead_until` is the exponential backoff for slugs that
-- repeatedly fail to resolve (30m → 2h → 8h → dead for a week); `attempted_at` enforces the
-- between-attempts cooldown for everything else.
CREATE TABLE first_pass_attempts (
  slug         text PRIMARY KEY,
  kind         text NOT NULL CHECK (kind IN ('topic', 'company')),
  attempted_at timestamptz NOT NULL DEFAULT now(),
  -- consecutive failures to resolve; reset to 0 on success
  failures     int NOT NULL DEFAULT 0,
  dead_until   timestamptz
);
