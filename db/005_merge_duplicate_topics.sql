-- Collapse topic subjects that resolve to the same Wikipedia article.
--
-- The slug was taken from whatever the visitor typed, so "electric car" and
-- "electric cars" — or "bicycle" and "history of the bicycle" — became separate
-- subjects holding identical events, double-counting every link and shared-event
-- statistic derived from them.
--
-- The typed strings are kept as aliases so existing URLs continue to resolve; only
-- the duplicate *subject* goes away. Idempotent: a second run finds no duplicates.

-- 1. keep the oldest subject per article, remember the rest
CREATE TEMP TABLE topic_dupes AS
SELECT wikipedia_title,
       min(id)                                   AS keep_id,
       array_remove(array_agg(id), min(id))      AS drop_ids
  FROM subjects
 WHERE kind = 'topic' AND wikipedia_title IS NOT NULL
 GROUP BY wikipedia_title
HAVING count(*) > 1;

-- 2. the losing slugs become aliases of the survivor, so old links keep working
INSERT INTO subject_aliases (subject_id, alias)
SELECT d.keep_id, s.slug
  FROM topic_dupes d
  JOIN subjects s ON s.id = ANY(d.drop_ids)
ON CONFLICT DO NOTHING;

-- 3. move event links to the survivor (an event already on both simply stays)
INSERT INTO event_subjects (event_id, subject_id, relevance, scored_by, scored_at)
SELECT es.event_id, d.keep_id, es.relevance, es.scored_by, es.scored_at
  FROM topic_dupes d
  JOIN event_subjects es ON es.subject_id = ANY(d.drop_ids)
ON CONFLICT (event_id, subject_id) DO NOTHING;

-- 4. carry over a summary if the survivor lacks one
UPDATE subjects k
   SET summary = COALESCE(k.summary, src.summary)
  FROM topic_dupes d
  JOIN subjects src ON src.id = ANY(d.drop_ids) AND src.summary IS NOT NULL
 WHERE k.id = d.keep_id AND k.summary IS NULL;

-- 5. drop the duplicates (event_subjects rows cascade away)
DELETE FROM subjects s
 USING topic_dupes d
 WHERE s.id = ANY(d.drop_ids);

DROP TABLE topic_dupes;
