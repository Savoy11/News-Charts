-- Several securities can share one registrant CIK (NC-138).
--
-- `subjects_cik_uq` made the CIK an identity, but EDGAR's CIK identifies the *filer*, not the
-- security: Alphabet files once for GOOGL and GOOG, Berkshire once for BRK-A and BRK-B, and a fund
-- trust once for every series and share class it sells. The committed ticker index has 1,443
-- company CIKs with more than one ticker and about 1,000 fund CIKs with several symbols.
--
-- With the unique index, the second ticker under a CIK could never be ingested: the subject upsert
-- handles a slug conflict only, so the insert failed on the CIK, the first pass reported the
-- security unavailable ("not on News Charts yet"), and its scheduled request was retried every
-- hour for ever. The ticker stays unique (`subjects_ticker_uq`), which is the identity a page is
-- addressed by; the CIK keeps a plain index for lookups.
DROP INDEX IF EXISTS subjects_cik_uq;
CREATE INDEX IF NOT EXISTS subjects_cik_idx ON subjects (cik) WHERE cik IS NOT NULL;
