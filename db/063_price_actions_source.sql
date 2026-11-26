-- Dividends and splits under the price source's key (batch 189).
--
-- A dividend or a split is read from the same chart answer as the closes, and was stored under the headline
-- feed's source (`yahoo_finance`) from the days when prices had no key of their own. Batch 189 took Yahoo's
-- headline feed off the ingest path and marked that source non-commercial, by the owner's call of 2026-11-26,
-- and the read path withholds a row only a non-commercial source attests (lib/licenceGate.ts). So the stored
-- dividend and split markers move to the price source (`yahoo_prices`), which lib/prices.ts now writes them
-- under: a chart keeps its markers on a public build without waiting for each company's next price read.
--
-- An action's id is "div-<ticker>-<day>" or "split-<ticker>-<day>" (lib/prices.ts); a headline's is its link.
-- Sources are found by key. Where the price source already attests the same action, the old row is dropped,
-- and the price source's row is the one the page links to if the old one was.
WITH gone AS (
  DELETE FROM event_attestations a
   USING sources old, sources new, event_attestations b
   WHERE old.key = 'yahoo_finance' AND new.key = 'yahoo_prices'
     AND a.source_id = old.id AND a.external_id ~ '^(div|split)-.+-\d{4}-\d{2}-\d{2}$'
     AND b.event_id = a.event_id AND b.source_id = new.id AND b.external_id = a.external_id
  RETURNING b.id AS kept, a.is_primary
)
UPDATE event_attestations k
   SET is_primary = true
  FROM gone
 WHERE k.id = gone.kept AND gone.is_primary;

UPDATE event_attestations a
   SET source_id = new.id
  FROM sources old, sources new
 WHERE old.key = 'yahoo_finance' AND new.key = 'yahoo_prices'
   AND a.source_id = old.id AND a.external_id ~ '^(div|split)-.+-\d{4}-\d{2}-\d{2}$';
