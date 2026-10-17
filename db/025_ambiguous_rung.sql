-- A search that matched two held subjects about equally well is offered as a choice (NC-039),
-- and logged under its own rung so `npm run search-report` can show how often names collide.
-- Every earlier value stays accepted, as before.
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
    'ambiguous'
  ));
