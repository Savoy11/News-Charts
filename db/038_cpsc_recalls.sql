-- The Consumer Product Safety Commission's recalls, every recall its recall service holds
-- (batch 96, lib/cpscRecalls.ts, lib/ingest/cpscWalk.ts).
--
-- The service answers every recall at once (10,070 from 1973, 28 MB, 2026-11-05). It is read once a
-- week for every company; a whole answer replaces the kept recalls. Each company's ingest keeps the
-- recalls that name it as maker, importer, distributor or a store that sold the product.
--
-- Only an answer is stored. A refused or failed read is logged in `source_fetches` with the
-- company whose ingest asked, and the service is asked again later.
CREATE TABLE IF NOT EXISTS cpsc_recalls (
  recall_number  text PRIMARY KEY,        -- the Commission's, "27055"
  recalled_on    date NOT NULL,
  title          text NOT NULL,
  url            text,                    -- the recall's notice on cpsc.gov
  hazard         text,
  units          text,                    -- as the Commission writes it, "5.9 million"
  makers         text[] NOT NULL,
  importers      text[] NOT NULL,
  distributors   text[] NOT NULL,
  sold_at        text NOT NULL,           -- the stores that sold it, one line
  name_keys      text NOT NULL            -- every firm and store in lower-case letters and digits, for finding a company's
);

CREATE TABLE IF NOT EXISTS cpsc_reads (
  id        integer PRIMARY KEY CHECK (id = 1),
  recalls   integer NOT NULL,
  read_at   timestamptz NOT NULL DEFAULT now()
);
