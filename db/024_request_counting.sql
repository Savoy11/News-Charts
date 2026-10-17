-- When a repeat ask last counted (NC-145).
--
-- `requestSubject` added one to `requests` on every not-indexed page view. The scheduler works
-- only the most-asked requests, so one script reloading a junk URL could hold those slots for
-- good. A repeat ask now counts at most once an hour per slug; `last_asked` still moves on every
-- ask, so this needs its own column. Existing rows start their clock now.
ALTER TABLE subject_requests ADD COLUMN IF NOT EXISTS counted_at timestamptz NOT NULL DEFAULT now();
