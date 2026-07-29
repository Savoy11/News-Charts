-- Token usage on a synthesis, so AI spend can be reported rather than only printed.
--
-- `event_enrichments` has recorded input/output tokens since 001; syntheses never did, so the
-- cost of every explanation run was printed once to a terminal and then lost. That makes the
-- cumulative question — "what has enrichment actually cost" — unanswerable from the database,
-- which is the question the cost report needs to answer.
--
-- Nullable, because rows written before this migration genuinely have no figure. A default of 0
-- would be a lie that quietly understates every historical total.
ALTER TABLE syntheses ADD COLUMN IF NOT EXISTS input_tokens  integer;
ALTER TABLE syntheses ADD COLUMN IF NOT EXISTS output_tokens integer;
