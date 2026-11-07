-- EPA's own figures on its cases (batch 113, the 2026-11-07 proposal 1, approved by the owner
-- 2026-11-07; lib/epaCases.ts).
--
-- The monthly read keeps three more things of each case from the same file: where EPA gives the
-- case no penalty total, its one settlement's federal and state penalty, marked as the settlement's;
-- EPA's estimate of the cost of the work the case orders; and EPA's own summary of the case, when it
-- says something.
ALTER TABLE epa_cases
  ADD COLUMN IF NOT EXISTS penalty_settled boolean NOT NULL DEFAULT false,  -- the penalty is the case's one settlement's
  ADD COLUMN IF NOT EXISTS work_ordered numeric(16, 2),                     -- EPA's estimate of the work ordered, in dollars; null for none
  ADD COLUMN IF NOT EXISTS summary text;                                    -- EPA's summary, as `summaryOf` keeps it

-- The kept copy has none of them, and the walk reads the file again only when EPA has changed it:
-- forget the last read, so the next run reads the file whole and the kept cases gain them.
DELETE FROM epa_reads;
