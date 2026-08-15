-- Typo tolerance for subject resolution, and one comparable score across what used to be rungs.
--
-- The ladder in lib/resolveSearch.ts was exact-ish at every step — exact ticker, exact name, name
-- prefix, slug, alias — with two consequences it could not distinguish between. A typo matched
-- nothing and fell through to the live rungs; and two plausible matches always resolved to
-- whichever rung happened to come first, which is an ordering of our code rather than of the
-- answers.
--
-- pg_trgm gives both: `similarity()` is a number, so a near-miss is reachable and every candidate
-- is comparable on one scale regardless of which rung would have found it.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN over trigrams, not btree: a btree index cannot serve `similarity()` or `%` at all, so
-- without these every search would sequentially scan `subjects` and `subject_aliases`. The
-- corpus is small today and would not notice; it is exactly the sort of thing that stops being
-- true quietly.
CREATE INDEX IF NOT EXISTS subjects_display_name_trgm
  ON subjects USING gin (display_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS subjects_ticker_trgm
  ON subjects USING gin (ticker gin_trgm_ops);

CREATE INDEX IF NOT EXISTS subject_aliases_alias_trgm
  ON subject_aliases USING gin (alias gin_trgm_ops);
