-- EPA's own days on its cases (batch 122, the 2026-11-08 proposal 2, approved by the owner
-- 2026-11-08; lib/epaCases.ts).
--
-- The monthly read keeps two more things of each case from the same file: the day a court case's
-- suit was filed (the milestone "Complaint Filed With Court"), and each settlement EPA dates, on its
-- own day, with its own penalty and work ordered (CASE_ENFORCEMENT_CONCLUSIONS.csv's lodged day,
-- else its entered day). The days and the lodged flags run in step, one place a settlement, in day
-- order, and so do the figures, a null for none, but for a case of one settlement with no such figure,
-- whose figure array is empty (string_to_array of "" is no element); the reader takes a missing place
-- as none. Money stays numeric.
ALTER TABLE epa_cases
  ADD COLUMN IF NOT EXISTS suit_filed date,                                  -- a court case's filing day; null for none
  ADD COLUMN IF NOT EXISTS settlement_days date[] NOT NULL DEFAULT '{}',     -- each settlement's day, lodged else entered
  ADD COLUMN IF NOT EXISTS settlement_lodged boolean[] NOT NULL DEFAULT '{}', -- the day is its lodging's, not its entry's
  ADD COLUMN IF NOT EXISTS settlement_penalties numeric(16, 2)[] NOT NULL DEFAULT '{}', -- its federal and state penalty; null for none
  ADD COLUMN IF NOT EXISTS settlement_work numeric(16, 2)[] NOT NULL DEFAULT '{}';      -- EPA's estimate of the work it orders; null for none

-- The kept copy has none of them, and the walk reads the file again only when EPA has changed it:
-- forget the last read, so the next run reads the file whole and the kept cases gain them.
DELETE FROM epa_reads;
