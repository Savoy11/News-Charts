-- The source-wide back-off lookup (NC-143): "what was this source's latest attempt, for any
-- subject?" The existing index leads with (source_id, subject_id), so that question walked every
-- subject's slice of the log — fine on a small corpus, and the sort of thing that stops being fine
-- quietly, since nothing prunes source_fetches.
CREATE INDEX IF NOT EXISTS source_fetches_by_source
  ON source_fetches (source_id, fetched_at DESC);
