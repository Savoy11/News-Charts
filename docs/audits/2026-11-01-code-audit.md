# Code audit, 2026-11-01 (batches 78–84: `1353574..960c3be`)

Run by the `code-auditor` agent (read-only). It covers `git diff 1353574..960c3be`: 53 files, 15 commits (7 batch commits, a batch-79 follow-up and 7 merges; +14,410 / −200).

**Commit:** `960c3be` (branch `claude/lucid-goodall-6km6ea`, equal to `origin/main`). **Date:** 2026-11-01.

**Where it ran:** the cloud build container (`/home/user/News-Charts`, Node 22.22.0). It went out through the session proxy, using curl.

**Data used:**
- the committed fixtures and `data/edgar-tickers.json`;
- the pages batch 83 saved when it walked both SEC case listings on 2026-11-01: 344 pages, 30,750 rows served, 30,654 distinct;
- the Board feed batch 84 saved (`ne-press.json`, 4,650 rows).

Both sets sit in this session's scratch folder. They were parsed with the repository's own parsers, `parseCaseListing` and `parseFedFeed`, and replays through them give exactly the batches' pinned counts.

**Network: 2 requests in all.** Each carried the User-Agent `News Charts Research marcusowens94@gmail.com`.
- **www.sec.gov, 1:** `/enforcement-litigation/litigation-releases?year=2010&month=10&page=0`, for finding 3.
- **query1.finance.yahoo.com, 1:** `/v8/finance/chart/TWCGX?range=max&interval=3mo`, the fund's first price, for finding 1.

**Database:** Postgres 16 was already running. The auditor ran only reads:
- in `chronolens_b83`: `sec_cases_years`, `sec_cases` and `subjects`;
- in `chronolens`, `_b68`, `_b69`, `_b73`, `_b83` and `_b84`: counts of company subjects and stored EDGAR rename events;
- in `chronolens_b73`: the six stored former names.

Nothing was written, and the cluster was left running. Probes and outputs are in the scratch folder. `git status` shows only this file.

**Checks run:**
- **`npm run check`:** tsc plus 53 suites, 2,866 checks. All pass in 1 m 33 s: sec-cases 47, fed-press 40, sec-press 73, doj 54, sec-forms 134, fed-actions 44, recall 59, focus 78, wiring 223.
- **`npm run lint`:** clean, in 9 s.

**Checks skipped:**
- **`check:feeds`, `check:live` and `check:ui`:** as instructed. They make many requests or need a server. The paths behind the findings were replayed offline on the saved real data instead.
- **`next build`:** not needed for these findings.

## Summary

The mechanics of batches 78–84 hold:
- the previous audit's four fixes;
- the bank map's days;
- the Fed feed's parser, times and cache;
- the `partyNamesFor` refactor;
- every count in the docs, replayed on the full saved data.

The defects:
- **Funds named for a word take strangers' cases.** The new caption rule never met a fund page. Mutual funds named only "Growth Fund", "Income Fund" or "Total Return Fund" take unrelated Ponzi cases, scored 0.95.
- **Big banks' own names are missed.** The caption rule misses the biggest banks' own spellings and units: 23 company days on JPMorgan, Morgan Stanley, Goldman, Citigroup and Bank of America.
- **The year walk loses rows for good.** The listings' pages overlap where rows tie, so 96 rows were never served. The walk marks their years complete and never reads them again.
- **Two checks replay less than they say.** The new checks say they replay everything, but they replay only their fixtures.

Fix finding 1 first: it is the only one that puts another party's fraud on a page.

## Findings

### 1. Mutual funds named only "Growth Fund", "Income Fund" or "Total Return Fund" take unrelated fraud cases, scored 0.95 · `P2`

**How sure:** high. Reproduced through the ingest's own functions on real rows; one fund's first price was read from Yahoo.

**Evidence**

*How a fund's page asks.*
- A fund ticker resolves offline to its series name: `resolveCompany` → `fundNameFor` (`lib/sec.ts:683-688`). For TWCGX the name is "GROWTH FUND", under CIK 100334.
- `ingestCompany` runs the `sec_cases` step for it like any company (`scripts/ingest.ts:680-686`).
- `captionParty` takes "Growth Fund" followed by a legal word as the party.
- The only shared-name guard is `listedCompaniesNamed(name) > 1` (`lib/secCases.ts:175`). It counts the company index alone (`lib/sec.ts:750`, `everydayRows` ← `tickerIndex.companies`).
- So "Growth Fund", which four fund registrants' series carry, passes as one company's name. The names that pass are:

  | Series name | Registrants with it |
  |---|---|
  | "Growth Fund" | 4 |
  | "The Growth Fund", "Income Fund", "Select Fund", "Tax-Exempt Fund", "Total Return Fund" | 1 each |

  29 share-class symbols carry these six names.

*The replay.* `resolveCompany` → `secCasesFor` → `deterministicScore`, run on the saved rows with a stand-in first price of 1995-01-03, gives 10 events on 9 fund pages, each scored 0.95:

| Fund (CIK, series) | Day | Row | Caption |
|---|---|---|---|
| TWCGX (100334, "GROWTH FUND"), VCULX (719423), HNASX (865733), MNRGX (1003924) "Growth Fund", CFGRX (926243) "The Growth Fund", FOIPX (932381) "Income Fund" | 2003-12-24 | LR-18525 | "James P. Lewis, Jr., Individually and Doing Business as Financial Advisory Consultants, Income Fund, Ltd. and Growth Fund, Ltd." |
| TWCIX (100334, "SELECT FUND") | 2009-09-08 | LR-21198 | "Sidney S. Hanson, … Queen Shoals Fund, … Select Fund, LLC" |
| NOTEX (916620, "TAX-EXEMPT FUND") | 1997-06-23 | 34-38754 | "George W. Meyers, Gregory W. Meyers, Tax Exempt Fund, Municipal Fund, and Fox, Reusch & Co., Inc." |
| JHTRX (1659326, "Total Return Fund") | 2008-02-27, 2009-07-09 | LR-20469, LR-21121 | "James B. Duncan, … and Total Return Fund, LLC" |

*Why the first price does not stop it.* Yahoo's history for TWCGX ("American Century Growth Inv", MUTUALFUND) starts in 1980 (`firstTradeDate` 1980-01-02), so the 2003 case passes the first-price gate. The other funds' first prices were not read.

*Not affected:*
- The same names give fund pages nothing from the Fed feed (0 of 2,219 releases) or the SEC press releases (0 of 6,894). The replay covered all 12,545 fund series in the index.
- The Justice Department source was not measured: no justice.gov request was made.

*Why the batch missed it.* Every replay iterates `tickerIndex.companies` only: `scripts/check-sec-cases.ts:63` and the batch's measurement (see finding 4). The fund pages were never asked.

**Failure scenario:** American Century Growth Fund's page shows "SEC litigation release: Growth Fund, Ltd. and others", the 2003 action against James P. Lewis's Ponzi scheme, as its own regulatory event. The scheme is described in the release's own caption. So does every other share class of these series.

**Smallest fix**
- Count fund series names in the shared-name guard.
- Or, for a fund subject, accept only its full registrant or series name, never a generic series name.
- Pinning these five rows to no fund is the check.

**Check:** `check:sec-cases` resolves TWCGX, TWCIX, FOIPX, NOTEX and JHTRX as ingest does and asserts no event from LR-18525, LR-21198, 34-38754, LR-20469 or LR-21121.

*Importance:* high: another party's fraud on a fund page, scored as certain · *Efficiency:* one guard · *Practicality:* easy.

### 2. The caption rule misses the biggest banks' own spellings and units: 23 company days with no event · `P3`

**How sure:** high for the misses. Run through `captionParty` with the names ingest uses, units included. The units named after a bank are its own.

**Evidence.** These rows name a bank's own legal name or a unit named after it, and land on none of its days:

| Bank | Rows | What the caption writes |
|---|---|---|
| JPM | 4 | "JP Morgan Chase & Co." (34-79335, the 2016-11-17 FCPA order; 34-81383 of 2017-08-11 and 34-86727 of 2019-08-22, both in file 3-15507, the proceeding of the 2013-09-19 order 34-70458, AAER-3490); "J. P. Morgan Securities LLC" (34-97787, 2023-06-22, file 3-21502) |
| MS | 8 (7 days) | "Morgan Stanley DW Inc." / "Dean Witter Reynolds Inc., n/k/a Morgan Stanley DW, Inc.", 2002-10-01 to 2006-06-15 |
| GS | 4, plus 2 | "Goldman Sachs Execution & Clearing, L.P." (2007-03-14, 2009-03-04, 2010-05-04) and "Goldman Sachs Asset Management, L.P." (2022-11-22). Plus the SEC's own typo "Goldman and Sachs & Co." (2015-06-30, 2016-01-14) |
| C | 5 | "Citibank, N.A." (2001-11-19, 2018-11-07); "Salomon Smith Barney Inc." (2000-04-06, 2002-12-03); "Smith Barney Fund Management LLC" (2007-09-28) |
| BAC | 1 | "BofA Securities, Inc., et al." (2022-09-27) |

*Cause.*
- `pressName` (`lib/secPress.ts:144-153`) treats only one-letter words as initials:
  - "J.P." is one word, so it matches only "J.P." literally, never "J. P.";
  - "JPMorgan" never matches "JP Morgan".
- JPMorgan's names at ingest are "JPMORGAN CHASE", "JPMORGAN CHASE & CO" and the map's "J.P. Morgan", "JPMorgan", "J.P. Morgan Securities", ….
- Its stored former name "J P MORGAN CHASE & CO" would read "JP Morgan Chase", but only until 2011-10-06 (`chronolens_b73`).
- The map (`lib/releaseNames.ts`) has no "Morgan Stanley DW", "Citibank" or "BofA Securities", and no entry for Goldman Sachs at all.
- `LEAD` (`lib/secCases.ts:117`) requires a separator before a party, so "Smith Barney" never matches inside "Salomon Smith Barney". That was Citigroup's brokerage from 1997 to 2003, which the map's own `why` for "Smith Barney" describes.
- `newsNamesFor` is empty for BAC, C, MS and JPM.

*Against the batch's claim.* Batch 83 says "the bank units the captions name in full join the release rules' map". Morgan Stanley DW (8 rows) is the same kind of unit as the Wells Fargo brokerages it added.

*Known already, not counted here:* UBS's own-name units (6 rows: UBS Warburg, UBS PaineWebber, UBS Global Asset Management, UBS O'Connor, UBS Willow).

**Failure scenario**
- JPMorgan's page has file 3-15507's orders of 2013–2015, 2018 and 2024, written "JPMorgan Chase & Co.", but not those of 2017 and 2019.
- The 2016-11-17 FCPA order reaches the page only through that day's press release (2016-241).
- The 2023 order against J.P. Morgan Securities is on no page. No press release of that day names JPMorgan in the stored listing.
- Morgan Stanley's page has none of Morgan Stanley DW's seven days of orders.

**Smallest fix**
- Let `pressName` take initials run together or spaced ("JP", "J. P.", "J.P.") as one pattern.
- Add the named-after units to the map, with their days.
- Allow a party to start after a firm's own prefix only where the map says so.

**Check:** `check:sec-cases` asserts that 34-81383, 34-97787, 33-8339 (Morgan Stanley DW) and 33-10571 (Citibank) land on JPM, JPM, MS and C.

*Importance:* medium: missing enforcement orders on the largest banks' pages · *Efficiency:* a pattern and map rows · *Practicality:* easy; each unit's days must be read.

### 3. The listings' pages overlap where rows tie, so the year walk never sees 96 rows, and marks their years complete for good · `P3`

**How sure:** high for the mechanism, proven against the SEC's own pages. It was not measured which of the 96 rows name a listed company.

**Evidence**

*The SEC's own counts.*
- Each saved page states its total ("1 to 100 of 439 items").
- Summed over the 66 listing-years, the listings hold 30,750 items. The walk was served 30,750 rows, but only 30,654 distinct.
- The other 96 are repeats, in 39 listing-years. Each repeat sits at a page boundary: rows #95–99 of page N come back as rows #0–10 of page N+1. For example, LR-21696 is row 99 of 2010's page 0 and row 0 of page 1.
- None repeats inside a page. This is how an unstable sort on tied days pages: a row shown twice means another row is never shown.

*The unseen rows can be found.*
- 20 release numbers missing from the walk sit next to one of the 21 repeated litigation rows. For example, LR-21695 is missing between LR-21694 (2010-10-14) and the repeated LR-21696 (2010-10-15).
- October 2010's month listing, fetched here, is one page of 38 items. It holds `LR-21695 2010-10-15 "Jason K. Fifield"`, which is in none of the year walk's 439 rows.

*The same in the press-release listing* (batch 73, outside this range): its pages say 6,898 items, and 6,894 are distinct. 2006-200 is missing beside the repeated 2006-198. The previous audit recorded "the four repeats once" as sound.

*Why it is permanent.*
- `walkSecCases` closes a year after its last short page (`lib/ingest/secCasesWalk.ts:103`) and stores it `complete` (`:112`).
- Its due rule never asks for a complete year again (`:76`).
- `check:sec-cases:327` pins the repeat as correct: "a row the listing shows twice is stored once, without failing the year".

*Docs.*
- README:259, `lib/ingest/secCasesWalk.ts:24` and the ledger give "30,654 rows" as what the listings hold.
- They also give "344 pages (139 litigation, 205 proceedings)" for 1995–2026. The batch's own walk log sums 342 (138 + 204); the 344 counts 1994's two empty pages. `QUOTAS.sec_cases` has the same 344.

**Failure scenario:** about 0.3% of every year's rows never reach any page, in both SEC walks, now and for every year to come. At the rule's hit rate of 3.4%, about 3 of the 96 would be company events. That is not measured. Nothing re-reads a complete year.

**Smallest fix**
- Read a past year by month: October 2010 is one page of 38 litigation rows, though a month of proceedings may still run past one page.
- Or compare the distinct rows read with the page's own "of N items", and leave the year incomplete when they differ.
- Then reset `complete` for the 39 listing-years in each database that holds them.

**Check:** a `check:sec-cases` stand-in that serves a tied row twice across a page boundary, and drops its partner, leaves the year incomplete.

*Importance:* medium-low: missing rows, few on any page, but permanent and in two sources · *Efficiency:* one comparison · *Practicality:* easy.

### 4. `check:sec-cases` and `check:fed-press` say they replay every row. They replay their own fixtures, and never a fund · `P3`

**How sure:** high. Code, and a mutation run on scratch copies.

**Evidence**

*What the checks claim and replay.*
- `check:sec-cases:282` is named "the 30,654 rows of 1995–2026 give 1,022 company days … as replayed in full". It replays `scripts/fixtures/sec-cases.json`: 1,421 rows, chosen as the rows the rule already matched plus selected refusals.
- `check:fed-press:189` says "the 2,219 releases read give 225 matches". It replays 228 releases.
- Both iterate `tickerIndex.companies` only (`:63` and `:56`).
- `check:sec-press`, by contrast, commits the whole stored listing.

*What the fixtures leave out.*
- Of the 30,654 rows, 5,391 hold the letters of some company's name of five or more letters; 4,164 of them are not in the fixture.
- Of the Fed releases, 675 hold such a name; 459 are not in the fixture.
- LR-18525 and LR-21198, finding 1's rows, are among those left out.

*The mutation.* A copy of `lib/secCases.ts` (in scratch) adds "Holdings|Financial|Securities|Group" to `LEGAL_WORD`, the loosening batch 83 measured and refused.
- On the full rows it moves 1,022 → 1,115 (93 new company days).
- On the fixture it moves 1,022 → 1,053. The check fails, but it sees 31 of the 93.
- A change whose new matches all fall outside the fixture, such as a new alias or a new name rule, passes unseen. So does every fund page.

**Failure scenario:** the next loosened rule or alias puts wrong cases on pages while both checks stay green, which is how finding 1 shipped.

**Smallest fix**
- Commit the full saved data, as `check:sec-press` does:
  - the Fed feed is 1 MB;
  - the case rows are about 4.3 MB as compact tuples.
- Replay companies and fund series both.
- Or rename the checks to say what they replay.

**Check:** the checks themselves.

*Importance:* medium: the checks cannot see the defect class this project ships most · *Efficiency:* one fixture each · *Practicality:* easy.

### 5. A company with no prices still logs its releases, cases and Fed releases as "empty", fresh for a day · `P3`

**How sure:** high on the code path. How often Yahoo is throttled was not measured.

**Evidence**
- Batch 78 moved `companyPrices` first (`scripts/ingest.ts:476`). But it returns without prices while Yahoo is in back-off (`:852-855`), and on a failed fetch.
- Then three steps return `outcome: "empty", detail: "no prices to start from"`:
  - `secPressFor` (`lib/ingest/secPressWalk.ts:195`);
  - `secCasesFor` (`lib/ingest/secCasesWalk.ts:196`), new in batch 83;
  - `fedPressFor` (`lib/ingest/fedPressFor.ts:17`), new in batch 84.
- `loadLastFetched` counts `empty` as asked (`lib/ingest/store.ts:490`). All three have a TTL of 1440 minutes.
- `check:sec-cases` and `check:fed-press` assert this outcome as correct.

**Failure scenario:** a company first ingested within 10 minutes of any Yahoo refusal (the back-off is source-wide) gets none of its SEC releases, cases or Fed releases until the next day. This is the remainder of the 2026-10-30 audit's finding 4, which offered a non-fresh outcome as the other half of the fix.

**Smallest fix:** return a non-fresh outcome (`error` with the detail, or a new `deferred`) when there is no first price, so the next run asks again.

**Check:** `check:sec-cases` and `check:fed-press` assert that the no-prices outcome is not one `loadLastFetched` counts.

*Importance:* low: it heals in a day · *Efficiency:* three return values · *Practicality:* easy.

## Known before this audit, not re-reported

- Popular, Inc. missing from `FED_BANKS`, and orders filed under a subsidiary bank ("Regions Bank", "Frost Bank", "Comerica Bank"): seen in the replay, as recorded.
- HawkScan.
- Credit Suisse's releases off GLDI.
- UBS's own-name units: confirmed, 6 case rows.
- **Not re-examined:** Deutsche Bank's "deutsche" scoring name.

## Set aside (4)

- **A year closes on the UTC date.** `walkSecCases` and `walkSecPress` take `today` from `toISOString()` (`secCasesWalk.ts:56`, `secPressWalk.ts:55`), while rows are dated by the Washington day. A walk on the evening of 31 December, Washington time, would mark that year complete before its evening rows. 60 saved rows were posted between 00:00 and 05:00 UTC. None was measured on 31 December.
- **Former legal names have no start day.** `partyNamesFor` counts a former legal name in every year up to its `until`, with no start. README:296 says "in the years it had them". JPM's stored "CHASE MANHATTAN CORP /DE/" (until 2000-11-21) would read the old Chase's 1995–96 cases as JPMorgan's. No such caption exists in the data (searched).
- **Left to the first price, and not measured:**
  - IMPP takes "Imperial Petroleum, Inc." (2013–2016), and MRDN "Meridian Holdings, Inc." (2007, 2009);
  - LASE takes a 1997 "Laser Photonics, Inc.";
  - BKR takes "Baker Hughes Incorporated" (2001, 2007);
  - JCI takes "Johnson Controls, Inc." (2016-07-11), on Tyco's record before the merger. That one is an ownership call for the owner.
- **`companyPrices` is not wrapped like `runSource`.** A throw while writing prices now ends a company's ingest before its filings; before batch 78 it came last. No trigger was found.

## Checked and found sound

- **Batch 84's Fed feed, on the full saved file:**
  - 4,650 rows; 2,219 of the three types on the Board's site; 1,929 with a time.
  - The timed rows run from 12:15 AM to 11:30 PM, Washington time. The DST cases the check pins hold.
  - The replay gives exactly 225 matches on 103 companies, 126 before 2017, 181 orders.
  - All 225 were read. Each is the applicant, what it buys, or the bank the Board acts on.
  - The map adds only BB&T (Truist), Goldman Sachs Bank USA and Morgan Stanley's two filings.
  - The cache drops a failure.
- **Batch 83's party rule, on all 30,654 saved rows:**
  - exactly 1,022 company days on 352 companies, 478 before 2017;
  - BAC 72, MS 66, WFC 47, UBS 46, JPM 46, C 44, DB 19, BCS 18, as the docs say.
  - All 299 unit matches were read: each falls inside its unit's days. Merrill Lynch's eight rows of 1995–2006, Wachovia's before 2008-12-31 and Bear Stearns' before 2008-05-31 stay out.
  - Rows naming two banks land on each, under its own party.
- **Times:** every one of the 30,750 served case rows has an `easternDay` equal to the date the listing prints (0 mismatches), the 60 posted in Washington's evening among them.
- **Batch 84's refactor:** `partyNamesFor` returns exactly what `secCasesFor` computed before (the diff `8ea2980..4e0585c`), and the 1,022 replay is unchanged.
- **The walk:**
  - the budget and the 20-page cap;
  - the stop on a refusal or a page without its table;
  - a year with none (1994's `views-empty`);
  - closed years not re-asked;
  - the current year read down to a kept row;
  - de-duplication before the upsert;
  - re-reads that update only changed rows.
- **Ingest:**
  - prices before `sec_edgar`, `sec_press`, `sec_cases` and `fed_press`;
  - walk failures carried as `throttled`/`error`;
  - notes records (ATMP, AMUB, GLDI) taking nothing from all four release sources.
- **Batches 78, 80 and 81:**
  - the four fixes hold under their checks;
  - 10KSB, 10QSB, SC 14D1 and SC 13E4 are in `MATERIAL_FORMS` and the filing list's `FORM_RE`, and search reads 10KSB/10QSB as 10-K/10-Q (`lib/focus.ts`);
  - the long legal forms strip as stated (`check:recall`'s index-wide check).
- **Docs:** `SOURCES` 29 (21 cleared for commercial use) and the COVERAGE-MAP header; the README's sec_press, sec_cases and fed_press counts and rankings, apart from finding 3's row and page totals.

