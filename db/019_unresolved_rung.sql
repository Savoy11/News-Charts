-- Scope change (2026-08-08): search resolves exchange-traded securities, and an unmatched
-- query is answered `none` instead of being assumed to name a topic. `assumed_topic` therefore
-- retires from the ladder (historical rows keep the value — the constraint keeps accepting it)
-- and `unresolved` arrives: the ladder ran out and we SAID so, rather than guessing.
--
-- These rows are the watch-list for the scope decision itself: an `unresolved` query that
-- recurs is either a security our resolvers miss (a bug) or demand for something off-scope
-- (a product signal). `npm run search-report` surfaces both.
ALTER TABLE search_resolutions DROP CONSTRAINT IF EXISTS search_resolutions_resolved_by_check;

ALTER TABLE search_resolutions
  ADD CONSTRAINT search_resolutions_resolved_by_check
  CHECK (resolved_by IN (
    'known_company',
    'known_subject',
    'edgar',
    'salvaged_prefix',
    'assumed_topic',
    'unresolved',
    'network_timeout',
    'empty'
  ));
