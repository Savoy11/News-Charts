# Code audit, 2026-11-05 (batches 85–89: `960c3be..d22927c`)

Run by the `code-auditor` agent (read-only). It covers `git diff 960c3be..d22927c`: 49 files, 12 commits (7 batch commits and 5 merges; +5,042 / −1,988).

**Commit:** `d22927c` (branch `claude/lucid-goodall-6km6ea`, equal to `origin/main`). **Date:** 2026-11-05.

**Where it ran:** the cloud build container (`/home/user/News-Charts`, Node 22.22.0). It went out through the session proxy, using curl and Python's urllib.

**Data used:**
- the committed fixtures: `cfpb-actions.json.gz` (386 actions and the first and last pages), `sec-cases-all.json.gz` (30,747 rows), `fed-press-feed.json.gz` (4,650 rows), `doj-releases.json`, `sec-press-listing.json`; and `data/edgar-tickers.json`;
- batch 89's saved pages: the CFPB list pages 1–17, its feed and its licence page;
- batch 87's final 1985 log and its cached `first-prices.json`.

All of it was parsed with the repository's own functions: `parseCfpbList`, `cfpbEvents`, `secCaseEvents`, `parseFedFeed`/`fedPressEvents` and `dojEvents`. The probes and their outputs are in the session scratch folder, under `audit90/`.

**Network: 15 requests in all.** Each carried the User-Agent `News Charts Research`.
- **query1.finance.yahoo.com, 5:** `/v8/finance/chart/{AMP, PRU, CHYM, ALLY}?range=1d&interval=1d`, for the first trading day. PRU drew a 429 and was asked once more. For finding 2.
- **efts.sec.gov, 5:** full-text search, one phrase within one CIK each: "Mastercard International Incorporated" (1141391), "Conduent Business Services, LLC" (1677703), "GE Capital Retail Bank" (40545), "Sterling Jewelers Inc." (832988), "Acima Digital" (933036). For finding 3. Paced about 2 s apart.
- **www.justice.gov, 5:** `/api/v1/press_releases.json`, title filter, page 0 of 50, for "Citizens Bank", "Washington Federal Bank", "Centennial Bank", "Equity Bank" and "Five Star Bank". For finding 1.

**Database:** none. Postgres was not running and was not started.

`git status` shows only this file.

**Checks run:**
- **`npm run check`:** tsc plus 55 suites, 2,995 checks. All pass, in 2 m 16 s. Among them: sec-cases 69, sec-press 75, fed-press 47, cfpb 45, digest 48, fed-actions 45, doj 54, wiring 227.
- **`npm run lint`:** clean, in 11 s.

**Checks skipped:**
- **`check:feeds`, `check:live` and `check:ui`:** as instructed. They make many requests or need a server. The CFPB adapter was replayed on batch 89's saved real pages instead.
- **`npm run digest-report`:** it reads a year of PDFs over the network. Batch 87's saved run was compared with the ledger instead.
- **`next build`:** not needed for these findings.

## Summary

The mechanics of batches 85–89 hold:
- batch 85's five fixes;
- the CFPB parser and walk, on the Bureau's real pages;
- every unit day the saved case rows and feeds exercise;
- every replay count README gives.

The defects:
- **One wrong event.** Batch 89's bare "Citizens Bank" unit reaches the Justice Department step, which applies no first price. It puts another bank's 2011 lending-discrimination settlement on Citizens Financial Group's page, scored 0.95.
- **Some recorded events never show.** The first-price floor quietly overrides the owner's calls (b) and (c), and two CFPB days that README does not name. The checks set that floor aside, so they assert pages production never builds.
- **The CFPB rule misses some listed companies' own units:** 7 days on 5 companies.
- **Docs:** a few counts are stale.

Fix finding 1 first: it is the only one that puts another company's case on a page.

## Findings

### 1. Citizens Financial Group takes Citizens Republic Bancorp's 2011 Justice Department settlement, through batch 89's "Citizens Bank" unit · `P2`

**How sure:** high. Reproduced through `dojEvents` on the API's real answer of today.

**Evidence**

*The map relies on a floor the Justice step does not have.*
- CFG's unit has no `from`. Its own `why` relies on the first price: `lib/releaseNames.ts:280`, `{ name: "Citizens Bank", why: "… the company's first price, of 2014, bounds it (batch 89)" }`. The map's header says the same of every named-after unit (`:41`): it "counts with its name, from the company's first price".
- The SEC press, SEC case, Board and CFPB steps pass `from: listed`. The Justice step passes nothing:
  - `scripts/ingest.ts:658-660` calls `fetchJusticeReleases(company.name, alsoKnownAs, possessive, company.cik)`;
  - `lib/doj.ts:358` calls `dojEvents(releases, names, (day) => releaseNamesOn(cik, day))`, with no date floor.

*What CFG asks and keeps.*
- `justiceQueryNames` for CFG gives `CITIZENS FINANCIAL GROUP | Citizens Bank`. `lib/doj.ts:316` adds `releaseNamesAsked`.
- Asked "Citizens Bank" today, the API holds 25 titles, one page.
- Through `dojEvents` with CFG's names:
  - with the unit, one event: **2011-05-05, "Justice Department Reaches Settlement with Citizens Republic Bancorp Inc. and Citizens Bank Regarding Alleged Lending Discrimination in Detroit"**;
  - without the unit, none.
- The robbery, teller and "Former … Branch Manager" titles are all refused, as they should be.

*Whose bank it was.*
- The title names Citizens Republic Bancorp as the bank's own holding company. That company is not in the index.
- The Board's saved feed has the same pair: "Written agreement with Citizens Republic Bancorp and Citizens Bank" (2010-08-03) and its termination (2012-04-19).
- CFG's own bank was then RBS Citizens, N.A. The Bureau's 2015-08-12 title writes "RBS Citizens, N.A. (N/K/A Citizens Bank, N.A.)".
- CFG's first price is 2014-09-24 (batch 87's cached `first-prices.json`).

*How it reaches the page.*
- It is scored 0.95 without the model (`lib/enrich/relevance.ts:376-377`).
- `lib/store/read.ts` has no date floor.

*Why the batch missed it.*
- The ledger says "The Board's releases and actions and the Justice Department's are unchanged" (`docs/MASTER-CHECKLIST.md:1062`).
- But `check:doj` replays `scripts/fixtures/doj-releases.json`: 26 large companies captured 2026-10-22, plus three unit releases. None of batch 89's 22 companies is in it.

*Tested the same way and clean:*
- "Washington Federal Bank": 13 titles, the failed Chicago bank's among them; 0 events on WAFD.
- "Equity Bank": 6 titles, 0 on EQBK.
- "Centennial Bank" and "Five Star Bank": 0 titles each.

**Failure scenario:** Citizens Financial Group's page shows a 2011 Justice Department lending-discrimination settlement as its own, three years before it listed. The settlement was with another bank holding company, Citizens Republic Bancorp, and its own Citizens Bank.

**Smallest fix:** give "Citizens Bank" a `from` (CFG's first price, or the day RBS Citizens took the name). Or bound the Justice step by the first price, as the other four rules are bounded.

**Check:** add the 2011 release to `check:doj`'s fixture as a refusal on CFG.

*Importance:* high: another firm's case on a page, scored as certain · *Efficiency:* one date, or one parameter · *Practicality:* easy.

### 2. The first-price floor removes events the owner's calls and the docs put on pages, and the checks set it aside · `P3`

**How sure:** high. Yahoo's own first trading days, against the replayed rows.

**Evidence**

*First trading days from Yahoo's `firstTradeDate`:*

| Ticker | First trading day |
|---|---|
| AMP | 2005-09-15 |
| PRU | 2001-12-13 |
| ALLY | 2014-01-28 |
| CHYM | 2025-06-12 |

Ingest's floor is `min(on_date) FROM prices` (`partyNamesFor`, `lib/ingest/secCasesWalk.ts`). Every rule but the Justice Department's drops rows before it.

*The owner's call (b).*
- The ledger: "American Express Financial Advisors' case of 2004-02-12 is on both American Express's page … and Ameriprise's" (`MASTER-CHECKLIST.md:1109`).
- 33-8365 of 2004-02-12 comes 19 months before AMP's first price. It is on AXP's page only.

*The owner's call (c).*
- The call: "Prudential Securities (2000–2003) on Prudential Financial (PRU)" (`docs/proposals/2026-11-02-proposals.md:386`).
- 3 of PRU's 19 replayed days fall before 2001-12-13: 33-7817 (2000-04-06), 33-7945 (2001-01-29) and 33-7947 (2001-01-30). So 16 reach the page, not the ledger's 19 (`:1123`).

*The checks.*
- `scripts/check-sec-cases.ts:88`: "Whether the company's page takes the row, its first price aside".
- `:366-367` then asserts `replayedOn("AMP", "2004-02-12")`, under the name "…on both AXP and AMP (the owner's call b)".

*The CFPB counts.*
- `check:cfpb` pins 87 days on 46 companies, 35 before 2017. It replays with "former names and first prices are ingest's" (`check-cfpb.ts:70`).
- README:360-363 names the days that are "on no page" for their first price: Synchrony Bank's (2014-06-19) and PayPal's (2015-05-19).
- Two more are off for the same reason, and README does not name them:
  - "Ally Financial Inc. and Ally Bank" (2013-12-20);
  - "Chime Financial, Inc." (2024-05-07).
- So at most 83 days on 42 companies reach a page, at most 32 of them before 2017. SNUS-PI's first price was not read.

**Failure scenario:** the owner reads the ledger as having put the 2004 AEFA case and Prudential Securities' 2000–2001 cases on Ameriprise's and Prudential's pages. Neither page will ever show them. Ally's page lacks its 2013-12-20 CFPB order to pay $80 million in damages, and the docs count it as delivered.

**Smallest fix**
- Either tell the owner the floor overrides calls (b) and (c) for these four rows, or let a map entry carry its own floor.
- In README and the ledger, state the counts after the floor, or name all four off-page CFPB days.

**Check:** pin the four rows with their first prices in `check:sec-cases` and `check:cfpb`.

*Importance:* medium: decisions recorded as done that are not in effect · *Efficiency:* docs, or one field · *Practicality:* easy.

### 3. The CFPB rule misses actions against listed companies' own units: 7 company days on 5 companies · `P3`

**How sure:** high for the misses, which come from a replay of all 386 actions. Each unit was found in the company's own filings through EDGAR's full-text search. These companies' first prices were not read.

**Evidence.** None of these lands on any page. Each name is a unit the company's own filings list:

| Company | Action day | Respondent as the Bureau titles it | The company's filing that names the unit |
|---|---|---|---|
| MA | 2017-02-01 | "UniRush LLC and Mastercard International Incorporated" | 10-K filed 2016-02-12, exhibit 21 (22 hits, 2016–2017) |
| CNDT | 2017-11-20, 2019-05-01 | "Conduent Business Services, LLC"; "Conduent Education Services, LLC" | 8-K filed 2017-04-11, 10-Q filed 2017-05-12 (38 hits, 2017–2019) |
| GE | 2013-12-10, 2014-06-19 | "GE Capital Retail Bank and CareCredit LLC"; "Synchrony Bank, f/k/a GE Capital Retail Bank" | 10-K filed 2013-02-26, three 10-Qs of 2013, 10-K filed 2014-02-27 |
| SIG | 2019-01-16 | "Sterling Jewelers, Inc." | 10-K filed 2018-04-02, exhibit 21.1 (36 hits, 2018–2019) |
| UPBD | 2024-07-26 | "Acima Holdings, LLC; Acima Digital, LLC; and Aaron Allred" | 10-Ks filed 2023-02-24 and 2024-02-27, exhibit 21 |

*Why they miss.*
- The index's names are "Mastercard", "CONDUENT", "GENERAL ELECTRIC / GE Aerospace", "SIGNET JEWELERS" and "UPBOUND GROUP".
- None is followed only by legal words in these titles, and none of the units is in `BANK_UNITS`.
- Three of the units are named after their company, the kind `BANK_UNITS` says it maps: Mastercard International, Conduent Business Services and Conduent Education Services, and GE Capital Retail Bank.
- GE still owned Synchrony on 2014-06-19. That day is on SYF's replay, but before SYF's first price. So the 2014 order is on no page.

*Why the batch missed it.*
- The ledger's "Not done" (`MASTER-CHECKLIST.md:1073-1077`) lists only companies the index no longer holds, and Santander Consumer USA on Santander Holdings USA.
- "Every day was read by hand" (`:1044`) covers the 87 days that matched. A unit that never matched was never read.

**Failure scenario:** Mastercard's, Conduent's, GE's, Signet's and Upbound's pages carry none of their CFPB orders, among them Conduent's two: the 2017-11-20 order over Xerox Business Services' software errors, and the 2019-05-01 settlement with Conduent Education Services.

**Smallest fix:** add the five companies' units to `BANK_UNITS`, with the days their filings give.

**Check:** the existing full replay in `check:cfpb` then pins them.

*Importance:* medium-low: missing events, not wrong ones · *Efficiency:* map rows · *Practicality:* easy; each acquired unit's from day must be read.

### 4. Counts and names in the docs that the code no longer gives · `P3`

**How sure:** high. Each is the code's or a check's own output against the prose.

**Evidence**
- **The COVERAGE-MAP header.** `docs/COVERAGE-MAP.md:3` says "29 sources (21 on the ingest path…)". `SOURCES` holds 30, 22 of them `commercialOk`, counted by importing `lib/ingest/store.ts`. The header still reads "Last updated: 2026-11-01".
- **The Board's orders.** `docs/COVERAGE-MAP.md:34` says "252 matches … 181 of them orders". `check:fed-press:218` pins 208 orders, and README:334 says 208. The ranking that follows it is still right (BAC 11, MS 11, COF 8, WFC/PNC/TFC 7, replayed here).
- **"Seven more names."** "Seven more names for banks already mapped" (`MASTER-CHECKLIST.md:1030`; README:243 "seven names") is followed by a list, matching the map, of ten names on six companies: AXP 3, USB 1, FITB 1, JPM 2, C 2, GS 1. PNC's National City Bank is listed separately.

**Smallest fix:** correct the three figures.

*Importance:* low · *Efficiency:* three edits · *Practicality:* trivial.

## Known before this audit, not re-reported

- **Off the map, as the ledger records:**
  - Santander Consumer USA's actions off Santander Holdings USA's page;
  - the Bureau's actions against companies the index no longer lists (Discover, Comerica, Hyundai Capital, Nissan, Experian);
  - the press rule's two missed unit releases (batch 88).
- **Namesake risk on "Centennial Bank" and "Equity Bank"** (batch 88). Tested on the Justice path here: no event today.
- **The previous audit's set-asides:** a year closes on the UTC date; former legal names have no start day; IMPP, MRDN, LASE, BKR and JCI; `companyPrices` unwrapped.

## Set aside (3)

- **`fetchDigestArchive` and `fetchDigestIssue` have no caller.** They are exported from `lib/secDigest.ts:58-77`. `scripts/digest-report.ts` fetches through its own `get` (`:80`), and `check:digest` does not touch them. Presumably they are for step 2. Today they are untested network code.
- **The CFPB daily read sees page 1 only, until it reaches a kept action.** The list is in filed-date order (0 of 386 out of order). So an action posted with an older filed day would wait up to 30 days for the monthly read. `lib/ingest/refresh.ts:59-60` says a daily look "finds each one within a day". Whether the Bureau posts late was not measured.
- **A walk stopped by the run's page budget gives later companies "empty" from what is kept, fresh for a day.** This is the same as the SEC walks, which the 2026-11-01 audit examined. For the CFPB it arises only after a failed whole-list read. It heals in a day.

## Checked and found sound

- **The CFPB adapter, on batch 89's 17 saved pages:**
  - the fixture is byte-identical to `parseCfpbList` over pages 1–16: 386 actions, 386 distinct;
  - every article has exactly one `<time>`, and every page states 386;
  - page 17 equals page 16, so the walk is right to stop at the count;
  - the list is in filed-date order;
  - the feed claim holds: Apple's 2024-10-23 order is dated 2025-09-22, and Capital One's 2025-01-14 suit 2025-01-07;
  - the licence words are on the saved privacy page.
- **The 87 CFPB days, all read:** each respondent is the company, or a unit it owned that day. The same-day folds (AXP 2012-10-01, C 2017-01-23, USB 2013-06-26) are one event each, keyed on `dedupBasis`.
- **The walk:**
  - the due rule (whole list monthly, newest daily);
  - the stop at the count, the 30-page guard and the 40-page budget;
  - storing only after every page answers;
  - de-duplication before the upsert.
- **Wiring:** `cfpb` is in `COMPANY_SOURCES`, `SOURCES` (id 30, public domain), the TTL, `QUOTAS`, `deterministicScore` (0.95), `db/035`, the footer and the terms. `ingestCompany`, the only production caller, passes `fundSeries` to all five release rules.
- **`BANK_UNITS`:** 56 companies, 22 new in batch 89.
  - Every unit-only case day in the full replay falls inside its unit's stated days.
  - So do the rows at the boundaries: U.S. Bancorp Piper Jaffray in 2005 and 2010 (not USB's), AEFA on 2005-12-01 (AMP only), Fiserv Securities on 2005-04-21 and Lazard Capital Markets on 2008-10-30 (neither on a page).
  - The namesakes the saved Board feed holds are of the enforcement type `fed_press` does not read: Citizens Republic's Citizens Bank, and an Equity Bank employee.
- **Replay counts, as README gives them:** sec-press 264 on 127, sec-cases 1,148 on 370 (559 before 2017), fed-press 252 on 112 (138, 208 orders), fed-actions 113 on 33, cfpb 87 on 46 (35).
- **Batch 85:**
  - `listingTotal`/`monthsToReread`, and both walks' recount and month fill, read as specified;
  - `NO_PRICES` is per-subject in `shouldBackOff`, so it trips no source-wide back-off;
  - the fund series figures are both right: 19,558 entries, 19,540 distinct.
- **Batch 87's 1985 count:** the saved final log matches every figure in the ledger. That is 23,922 entries, 517, 508 rows on 258 companies, 184/129/109/30/53/2/1, 199, 594, 86, 147 on 71, 361 and 177.
