-- Cited articles: real, dated external sources mined from a Wikipedia article's
-- reference list ({{cite news}}, {{cite web}}, ...). Unlike 'history' (prose
-- sentences that all deep-link the same encyclopedia article), each citation is
-- a distinct period document — the article someone read at the time.
--
-- Idempotent: 001 is regenerated from the spec and already contains this value on
-- fresh installs. ADD VALUE is transaction-safe on PG12+ as long as the new value
-- is not used in the same transaction; nothing here inserts a 'citation' row.
ALTER TYPE event_kind ADD VALUE IF NOT EXISTS 'citation';
