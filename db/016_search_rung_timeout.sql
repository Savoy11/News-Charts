-- A sixth resolution rung: the network did not answer in time.
--
-- `assumed_topic` means the ladder ran out of ways to identify a query and guessed that the typed
-- string names a topic. A timed-out EDGAR probe reaches the same guess, but for a completely
-- different reason — and treating them as one hides the failure that matters. A real ticker
-- recorded as an assumed topic reads as "our parser is weak"; recorded as `network_timeout` it
-- reads as "the ticker index is throttling us", which is the true and actionable statement.
--
-- The column is text with a CHECK rather than an enum precisely so this is a one-line change
-- while the ladder is still being worked on. See `db/015_search_resolutions.sql`.
ALTER TABLE search_resolutions DROP CONSTRAINT IF EXISTS search_resolutions_resolved_by_check;

ALTER TABLE search_resolutions
  ADD CONSTRAINT search_resolutions_resolved_by_check
  CHECK (resolved_by IN (
    'known_company',
    'known_subject',
    'edgar',
    'assumed_topic',
    'network_timeout',
    'empty'
  ));
