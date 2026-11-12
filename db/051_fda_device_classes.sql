-- The FDA's device recalls of 2000 to mid-2012, before the enforcement reports (batch 144, the 2026-11-11b
-- proposal 1, approved by the owner 2026-11-12; lib/fdaDeviceRecalls.ts, lib/ingest/fdaDeviceRecallsFor.ts).
--
-- openFDA's device recall file gives each recall's products and the firm, never the class. The FDA's
-- recall-database page for the event lists its products with their class; a recall takes its most
-- serious product's, and only Class I and II become rows. Each event's page is read once and kept here,
-- at most 200 a process, 1.3 s apart (about 2,600 events on the mapped firms, read in a dozen runs).
-- A page that listed no product keeps a null class and is asked again after 30 days.
CREATE TABLE IF NOT EXISTS fda_device_classes (
  event_number integer PRIMARY KEY,                     -- the recall's event number, as the reports use it
  class        smallint CHECK (class BETWEEN 1 AND 3),  -- its most serious product's; null: the page listed none
  products     integer NOT NULL,                        -- the products the page listed
  read_at      timestamptz NOT NULL DEFAULT now()
);
