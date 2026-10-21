-- Economy-wide events: Federal Reserve policy statements and CPI inflation releases (NC-080).
--
-- Their own kind, and not 'regulation' or 'news'. They are not about any company and are never
-- linked to one: a curated subject holds them, and company pages show them behind a switch that
-- starts off, as the backdrop a move is read against rather than as the company's own history.
--
-- Idempotent: 001 is regenerated from the spec and already contains this value on fresh
-- installs. ADD VALUE is transaction-safe on PG12+ as long as the new value is not used in the
-- same transaction; nothing here inserts a 'macro' row.
ALTER TYPE event_kind ADD VALUE IF NOT EXISTS 'macro';
