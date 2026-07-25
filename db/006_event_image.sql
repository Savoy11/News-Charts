-- Optional thumbnail for an event: a news article's social image, a Wikipedia
-- lead image, or a newspaper page scan. Nullable — most events won't have one,
-- and the UI only renders a thumbnail when it's present.
ALTER TABLE events ADD COLUMN IF NOT EXISTS image_url text;
