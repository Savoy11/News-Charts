-- EPA's cost recovery on its cases (batch 129, the 2026-11-09 proposal 4, approved by the owner
-- 2026-11-09; lib/epaCases.ts).
--
-- The monthly read keeps one more figure of each case from the same file: what the parties pay back
-- for EPA's own cleanup costs, the case table's TOTAL_COST_RECOVERY_AMT, or, where EPA gives none, its
-- one settlement's; and each dated settlement's own, the settlements table's
-- COST_RECOVERY_AWARDED_AMT, in step with db/044's arrays, a null for none, but for a case of one
-- settlement with no such figure, whose array is empty, as the other figures' are. Money stays numeric.
ALTER TABLE epa_cases
  ADD COLUMN IF NOT EXISTS cost_recovery numeric(16, 2),                              -- the case's cost recovery, in dollars; null for none
  ADD COLUMN IF NOT EXISTS settlement_cost_recovery numeric(16, 2)[] NOT NULL DEFAULT '{}'; -- each settlement's; null for none

-- The kept copy has neither, and the walk reads the file again only when EPA has changed it:
-- forget the last read, so the next run reads the file whole and the kept cases gain them.
DELETE FROM epa_reads;
