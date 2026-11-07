-- A page's events by its subject, and "Also on" without a queue to read (batch 111, the 2026-11-07
-- audit's set-aside).
--
-- event_subjects' key is (event_id, subject_id), which serves "which pages carry this event" and
-- not "which events are on this page": only the scoring backlog's partial index (001) began with
-- subject_id, and it holds only the unscored links. So every page load, and the "Also on" query of
-- db/041, which starts from the page's own links, read every link in the table.
CREATE INDEX IF NOT EXISTS event_subjects_subject ON event_subjects (subject_id);

-- db/041's case-number index is a GIN index, which by default queues new entries in a pending list
-- until a vacuum or a 4 MB list merges them; every lookup reads the whole list meanwhile. After an
-- ingest that wrote 30,000 case rows, each of a page's lookups took 2–4 ms and "Also on" 430–750 ms,
-- against 32–49 ms with the list merged, and writing the 30,000 rows straight into the index took
-- 516 ms against 506 ms queued. Measured on a local Postgres 16 (batch 111's ledger section).
ALTER INDEX IF EXISTS event_attestations_case_numbers SET (fastupdate = off);
SELECT gin_clean_pending_list('event_attestations_case_numbers'::regclass);
