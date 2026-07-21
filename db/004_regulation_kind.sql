-- Federal Register documents: rules, proposed rules and notices that affect an
-- industry rather than a single company.
--
-- Idempotent: 001 is regenerated from the spec and already contains this value on
-- fresh installs. ADD VALUE is transaction-safe on PG12+ as long as the new value
-- is not used in the same transaction; nothing here inserts a 'regulation' row.
ALTER TYPE event_kind ADD VALUE IF NOT EXISTS 'regulation';
