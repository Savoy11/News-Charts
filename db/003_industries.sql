-- Industry graph, built from the SIC code EDGAR already returns for every filer.
--
-- Idempotent: 001 is regenerated from the spec and contains all of this on fresh
-- installs, so this is a no-op there and a real change on existing databases.
--
-- Note: ALTER TYPE ... ADD VALUE is allowed inside a transaction on PostgreSQL 12+,
-- provided the new value is not *used* in the same transaction. Nothing below inserts
-- an 'industry' row, so this is safe under the migration runner's BEGIN/COMMIT.
ALTER TYPE subject_kind ADD VALUE IF NOT EXISTS 'industry';

ALTER TABLE subjects ADD COLUMN IF NOT EXISTS sic char(4);

CREATE TABLE IF NOT EXISTS subject_members (
  industry_id bigint NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  member_id   bigint NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  source      text   NOT NULL DEFAULT 'sic',
  added_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (industry_id, member_id),
  CONSTRAINT subject_members_not_self CHECK (industry_id <> member_id)
);
CREATE INDEX IF NOT EXISTS subject_members_member ON subject_members (member_id);
