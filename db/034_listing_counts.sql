-- Each SEC listing-year's own count of its rows (batch 85, the 2026-11-01 audit's finding 3).
--
-- The press-release listing and both case listings sort a year by day alone, so where rows tie on
-- a day across a page boundary the next page shows some again and never shows others. Each page
-- states the count its view holds ("1 to 100 of 439 items"); a year whose pages show fewer distinct
-- rows is filled from the months its repeated rows fall in (lib/listingGaps.ts), and the count is
-- kept here.
--
-- Where a page gives no count, the rows read stand in for it, so the year is not read again.
-- A year stored before this migration has no count, so the walk asks its first page once: where
-- the rows kept already reach the count, it only records it; otherwise it reads the year again,
-- with the months. Nothing is deleted or reset.
ALTER TABLE sec_press_years ADD COLUMN IF NOT EXISTS listed integer;   -- the listing's own count, its first page's footer
ALTER TABLE sec_cases_years ADD COLUMN IF NOT EXISTS listed integer;
