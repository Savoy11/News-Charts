-- Vehicle safety recalls a listed company filed with NHTSA, from 1966 (batch 30, lib/recalls.ts).
--
-- Their own kind, and not 'regulation': a Federal Register document is a regulator's text that
-- names the company, while a recall is the company's own report of a defect in what it sold, and
-- a reader looks for it as that. Linked to the company whose maker filed it, by a checked map.
--
-- Idempotent: 001 is regenerated from the spec and already contains this value on fresh
-- installs. ADD VALUE is transaction-safe on PG12+ as long as the new value is not used in the
-- same transaction; nothing here inserts a 'recall' row.
ALTER TYPE event_kind ADD VALUE IF NOT EXISTS 'recall';
