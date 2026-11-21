-- The NLRB's whole listing read across runs and nights (batch 162, lib/ingest/nlrbWalk.ts).
--
-- The first night read, 2026-11-21, was refused by the site's firewall at page 340 of 667, after 21
-- minutes at one page every 3.7 s: it answered "Request Rejected" with HTTP 200. A whole read that must
-- finish in one go would be refused at the same page every night and never finish, so the read now
-- keeps each page as it comes and resumes where it stopped: the 'partial' row holds the next page to
-- read and the day the read began, and `refused_at` the last refusal, after which no whole reading is
-- asked before the next night. The 'list' row is written only when the last page has been read, and
-- only then is a company's answer complete.
ALTER TABLE nlrb_reads DROP CONSTRAINT IF EXISTS nlrb_reads_kind_check;
ALTER TABLE nlrb_reads ADD CONSTRAINT nlrb_reads_kind_check CHECK (kind IN ('list', 'newest', 'partial'));
ALTER TABLE nlrb_reads ADD COLUMN IF NOT EXISTS next_page integer;
ALTER TABLE nlrb_reads ADD COLUMN IF NOT EXISTS refused_at timestamptz;
