-- A search that matched nothing but resembled names in the committed EDGAR index offers them
-- ("did you mean"), logged under its own rung so `npm run search-report` can show which
-- spellings people use. Every earlier value stays accepted, as before.
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
    'empty',
    'ambiguous',
    'suggested'
  ));
