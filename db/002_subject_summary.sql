-- Adds the lede paragraph shown above a topic timeline, so a page served from the
-- database doesn't need a live Wikipedia call just to render its header.
--
-- Idempotent: 001 is regenerated from the spec and already contains this column on
-- fresh installs, so this is a no-op there and a real change on existing databases.
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS summary text;
