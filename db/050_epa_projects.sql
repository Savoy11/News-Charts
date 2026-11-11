-- EPA's supplemental environmental projects on its cases (batch 141, the 2026-11-11 proposal 3, approved
-- by the owner 2026-11-11; lib/epaCases.ts).
--
-- The monthly read keeps what each settlement commits the parties to fund beside the penalty, from the
-- same file: the settlements table's SEP_AMT and the projects table's text of each project
-- (CASE_ENFORCEMENT_CONCLUSION_SEP.csv). A case keeps its one settlement's figure, or its settlements'
-- of its own day added (batch 142), since EPA's case table gives no total of these, and the texts of
-- the settlements that give it; each dated settlement keeps its own, in step with db/044's arrays, a
-- null figure and an empty text for none; but a case of one settlement with none stores both arrays
-- empty, read back as none, as db/044's figures are. Money stays numeric.
ALTER TABLE epa_cases
  ADD COLUMN IF NOT EXISTS projects_figure numeric(16, 2),                                 -- the case's, in dollars; null for none
  ADD COLUMN IF NOT EXISTS projects text[] NOT NULL DEFAULT '{}',                          -- EPA's text of them, a project each
  ADD COLUMN IF NOT EXISTS settlement_projects_figure numeric(16, 2)[] NOT NULL DEFAULT '{}', -- each settlement's; null for none
  ADD COLUMN IF NOT EXISTS settlement_projects text[] NOT NULL DEFAULT '{}';               -- each settlement's texts, a line each

-- The kept copy has none of them, and the walk reads the file again only when EPA has changed it:
-- forget the last read, so the next run reads the file whole and the kept cases gain them.
DELETE FROM epa_reads;
