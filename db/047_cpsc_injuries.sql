-- The CPSC's injury statement on each kept recall (batch 136, the 2026-11-09b proposal 4, part a;
-- lib/cpscRecalls.ts): "None reported", "The firm is aware of a 2014 death…", as the Commission
-- wrote it. The weekly read fills it; the read kept is forgotten so the next run reads the
-- service again at once, rather than in up to a week.
ALTER TABLE cpsc_recalls ADD COLUMN IF NOT EXISTS injuries text;
DELETE FROM cpsc_reads;
