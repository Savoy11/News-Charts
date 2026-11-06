-- The SEC News Digest's issues of 1956–1993 and the entries each holds (batch 102,
-- lib/secDigest.ts, lib/ingest/secDigestWalk.ts).
--
-- The Digest is the SEC's daily summary of the business it handled before EDGAR. Its archive is
-- closed: each year's page is read once for its list of issues, and each issue's PDF once for its
-- entries — an 8-K row, a registrant, a heading cut to its parties, an item of a listing order. The
-- PDFs are not kept. Each company's ingest finds its own entries under the names its EDGAR record
-- had on each issue's day (data/digest-records.json), from its first price.
--
-- Only an answer is stored, or an issue www.sec.gov answers 404 for, as missing. A refused or failed
-- page or PDF is logged in `source_fetches` with the company whose ingest asked, and the read is
-- tried again later.
CREATE TABLE IF NOT EXISTS sec_digest_years (
  year      integer PRIMARY KEY,
  issues    jsonb NOT NULL,               -- [{ "day": "1985-01-02", "url": "https://www.sec.gov/news/digest/1985/dig010285.pdf" }, …]
  read_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sec_digest_issues (
  url        text PRIMARY KEY,
  issued_on  date NOT NULL,
  entries    integer NOT NULL,            -- 0 for an issue whose text layer held none
  missing    boolean NOT NULL DEFAULT false, -- listed by the archive, answered 404: never asked again
  read_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sec_digest_entries (
  url           text NOT NULL REFERENCES sec_digest_issues (url) ON DELETE CASCADE,
  seq           integer NOT NULL,         -- the entry's place in its issue
  issued_on     date NOT NULL,
  kind          text NOT NULL,            -- '8-K report', 'registration', 'order', … (DigestKind)
  party         text NOT NULL,            -- the name as printed
  is_row        boolean NOT NULL,         -- a table row: the SEC's conformed name
  line          text NOT NULL,
  party_key     text NOT NULL,            -- conformedKey(party)
  party_folded  text NOT NULL,            -- foldedKey(party), a row read through the OCR
  party_loose   text NOT NULL,            -- loose(party), what a heading's names are found in
  PRIMARY KEY (url, seq)
);

CREATE INDEX IF NOT EXISTS sec_digest_entries_key ON sec_digest_entries (party_key);
CREATE INDEX IF NOT EXISTS sec_digest_entries_folded ON sec_digest_entries (party_folded) WHERE is_row;
CREATE INDEX IF NOT EXISTS sec_digest_entries_day ON sec_digest_entries (issued_on);
