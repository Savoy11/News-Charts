-- A new rung for the resolution ladder: `salvaged_prefix`.
--
-- "Tesla battery fires" matches no qualifier pattern, fails every exact rung, and used to die
-- at assumed_topic — minting a junk subject request for the raw string. The ladder now tries
-- progressively shorter head-prefixes ("Tesla battery", "Tesla") against the same rungs and
-- carries the unmatched tail as the page's focus. Recorded distinctly so its accuracy is a
-- number: a salvage that routinely lands on subjects with events is working; one that does not
-- is a guess wearing a better name.
ALTER TABLE search_resolutions DROP CONSTRAINT IF EXISTS search_resolutions_resolved_by_check;

ALTER TABLE search_resolutions
  ADD CONSTRAINT search_resolutions_resolved_by_check
  CHECK (resolved_by IN (
    'known_company',
    'known_subject',
    'edgar',
    'salvaged_prefix',
    'assumed_topic',
    'network_timeout',
    'empty'
  ));
