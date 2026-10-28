# Code audit, 2026-10-28 (batches 62–70: `5e2a1f7..0da40a1`)

Run by the `code-auditor` agent (read-only). It covers `git diff 5e2a1f7..0da40a1`: 64 files, 19 commits.

**Commit:** `0da40a1` (branch `claude/lucid-goodall-6km6ea`, equal to `origin/main`). **Date:** 2026-10-28.

**Where it ran:** the cloud build container (`/home/user/News-Charts`, Node 22.22.0), going out through the session proxy with `NODE_USE_ENV_PROXY=1`.

**Network: 9 requests in all.** Each carried the User-Agent `News Charts Research marcusowens94@gmail.com`.
- **federalregister.gov, 4:** Solventum, Carrier Global, the old News Corporation, and Dow Inc.'s 2010.
- **federalreserve.gov, 1:** `ea-old.json`.
- **data.sec.gov, 3:** Perrigo's submissions record and its older shard, and News Corp's record.
- **www.sec.gov, 1:** Ford's exhibit 99 of 2022-01-18.

**Database:** Postgres 16 was down when the audit started (stale pid file). The auditor started it, only ran reads against `chronolens_b63`, `_b67`, `_b67b` and `_b68`, and counted `sec_headlines` in the others. It then stopped the cluster again. Nothing was written, so no scratch copy was needed. The working tree is clean, and all probes are kept outside the repository.

**Checks run:**
- **`npm run check`:** tsc plus 50 suites, 51 in all. All pass, 0 failures, in 1 m 19 s. The suite totals match the ledger: sec-forms 119, sec-headlines 266, markers 30, tickers 108, wiring 211, vehicle-recalls 53, fda-recalls 55, fed-actions 30, fr-backfill 39.
- **`npm run lint`:** clean, in 14 s.

**Checks skipped:**
- **`check:feeds` and `check:live`:** each sends many requests to GDELT, Yahoo, Wikipedia and others, which is far beyond "a small number". The paths that bear on the findings were probed directly instead (above).
- **`check:ui` and `next build`:** not needed for these findings.

## Summary

The mechanics of batches 62–70 are sound. The bank map, the series split, acceptance times, the deal-form rule and the counts in the docs all hold on real data. The three defects are in the rules the new feeds use to decide what a document is:
- the year walk reads every company back to 1994 under today's name, so other companies' documents arrive scored 0.95;
- the results-release rule types a preliminary special-items notice as earnings;
- the routine-notice rule misses titles whose words run together, so CSX's Conrail control case reads as "routine notices".

Fix finding 1 before the year walk runs on a production refresh: once a year is read, it is not read again.

## Findings

### 1. The Federal Register year walk reads every company back to 1994 under today's name, so Dow Inc.'s 2010 alone keeps Dow Jones and Dow Corning documents · `P2`

**Evidence**

*The code.*
- `closedYears(today)` (`lib/ingest/frBackfill.ts:41-45`, used at `:150`) runs from `FR_COMPANY_FROM = "1994-01-01"` for every company. There is no floor at the company's start.
- The GDELT month walk has that floor: "Months start no earlier than the company's first price, so the years before it listed, when 'Snowflake' was the weather, are not asked" (`lib/ingest/newsBackfill.ts:24-25`, query at `:117-122`).
- A one-word everyday name counts as named when a legal-form word comes within three words after it (`lib/frCompany.ts:118`, `i === 0 ? 3 : 1`).

*Live, Dow Inc.* The walk's exact request for Dow Inc. (CIK 1751788, term `"DOW"`, 2010-01-01..2010-12-31) returned 103 hits, and the walk's filter keeps 7 of them:
```
2010-08-30  Foreign-Trade Zone 29; Application for Subzone Authority; Dow Corning Corporation; Extension of Rebuttal Period
2010-07-29  (the same, Dow Corning Corporation)
2010-06-04  (the same, Dow Corning Corporation; Invitation for Public Comment …)
2010-07-26  Dow Jones & Company, Sharon Pennsylvania Print Plant a Subsidiary of News Corporation, West Middlesex, Pennsylvania; Notice of Negative Determination …
            + The Dow Chemical Company (LNG export), Dow Intrastate Gas Company, and an EPA well petition
```
- `deterministicScore` gives the Dow Jones and Dow Corning titles `{"score":0.95,"reason":"the document's title names the company"}` for DOW.
- Dow Inc. has no entry in `lib/predecessors.ts`.
- `listedNamesContaining("dow")` holds only an SPDR ETF, so nothing claims "Dow Jones" for another company.

*Live, News Corp.* CIK 1564708; its EDGAR record begins 2012-12-21 as "New Newscorp LLC", and its everyday name is `"NEWS"`.
- A request for the old company's names (1994–2012) found 2 titles that the walk's own rule passes.
- One is "United States v. The News Corporation Limited, Fox Television Holdings, Inc., and Chris-Craft Industries, Inc. Proposed Final Judgment …" (2001-06-04, FR 01-13863). That is the old News Corp's TV-stations antitrust case, 11 years before this company's record begins, and it scores 0.95.

*Live, Carrier Global.* CIK 1783180; its Wikidata alias "Carrier Corporation" is searched in every year.
- 115 hits for 1994–2019, of which 8 are kept, dated 1994–2011: DOE waivers and trade-adjustment notices from when Carrier Corporation belonged to United Technologies.
- Batch 70's FDA map rules the other way for a spin-off: GE HealthCare's recalls "before that … were GE's" (`lib/fdaRecalls.ts`, the GEHC entry).

**Worse than recorded.** The ledger's known limit (`docs/MASTER-CHECKLIST.md:1496-1498`) names only "Union Pacific Resources Company": a former unit, matched on a company that existed all along. The defect is wider in two ways:
- the rule takes in wholly different companies (Dow Jones);
- the walk asks years before the company existed (the old News Corp).

**Failure scenario:** on the next ingest after `db/031`, Dow Inc.'s 2010 timeline shows a Dow Jones print-plant notice and three Dow Corning zone applications as its own, each scored as certain. Each year is stored in `fr_windows` and never asked again. The same goes for any one-word or borrowed name across 32 years.

**Smallest fix:**
- Floor the walk at the company's first price, with the same `min(prices.on_date)` query `backfillNews` already makes.
- Then, for a one-word everyday name, don't count a following proper noun ("Jones", "Corning") as part of the window.
- Pin the Dow Jones title in `check:fr-backfill`.

*Importance:* medium-high: wrong companies' documents, scored as certain, on large-cap pages · *Efficiency:* one query plus one guard · *Practicality:* easy.

### 2. Batch 64's rule types Ford's preliminary special-items notice as earnings · `P2`

**Evidence**

*The stored row.* In `chronolens_b68` (Ford ingested with batch 68's code, which includes batch 64), exactly one Ford or Apple 8-K is typed `earnings` without item 2.02:
```
2022-01-18 | earnings | FORD MOTOR CO: Ford Provides Update on Certain Special Items for FY2021 Results (8-K 7.01)
body: A results release, counted as earnings. Regulation FD disclosure (8-K 7.01). …
```

*The press release* (EDGAR, `000003799622000005/exhibit99jan182022.htm`): "Ford today outlined several large special items that it intends to report in early February as part of the company's fourth-quarter and full-year 2021 financial results … On a preliminary basis, the special items are expected to include: 1) A fourth-quarter gain of $8.2 billion on Ford's equity investment in Rivian…"

*The owner's call* (`docs/MASTER-CHECKLIST.md:1425-1428`): "a profit alert, a preliminary figure, an expectation … a charge" all stay filings.

*Cause.*
- `PERIOD_FIGURE` (`lib/secHeadlines.ts:995-996`) matches "FY2021 Results" with no verb, and `announcesResults` returns true on it (`:1024`) before any reporting-verb check.
- `NOT_REPORTED_RESULTS` (`:1007-1008`) has no "special items" or "update on".

*Out of sample.* Of the 146 stored Ford and Apple headlines not in `scripts/fixtures/results-headlines.json`, this is the only filing whose type the rule changed. The fixture holds no Ford headline.

**Failure scenario:**
- Ford's page shows two FY2021 earnings events, each with the "E" marker (`lib/markers.ts:13`): this one on 2022-01-18, and the real release on 2022-02-03.
- The Earnings chip lists the notice as a results release, and `nearestCatalyst(…, "2022-01-19")` (a −7.92% day) returns it as earnings, "4:06 pm ET, after the close".
- That day ranks 105th by size in Ford's series, so the six-move panel does not show it by default.
- Any 6-K or pre-2004 8-K headline of the form "… for FY20xx Results" without a reporting verb is open to the same mistake.

**Smallest fix:** add `special items` and `update on` to `NOT_REPORTED_RESULTS`, or require a reporting verb on the `PERIOD_FIGURE` path when the headline says "Provides"/"Update". Pin this headline in `check:sec-headlines`.

*Importance:* medium: a wrong classification on a mega-cap's earnings history · *Efficiency:* one regex · *Practicality:* trivial.

### 3. The routine-notice rule folds 8 notices of CSX's Conrail control case into "routine notices" rows · `P2`

**Evidence**

*The code.* `NOT_ROUTINE` (`lib/frCompany.ts:360-361`) puts a `\b` before every word. The Federal Register's 1990s titles run words together where an em dash was ("…Norfolk Southern Railway Company**Control** and Operating Leases/Agreements Conrail Inc."), so there is no word boundary before "Control".

*Replay.* `pageRegulations` run over CSX's 572 stored rows in `chronolens_b63` (the batch's own live run) reproduces the recorded 572 → 330. But of the 19 Conrail control-docket notices:
- **8 are classed routine and folded:** 1997-04-21, 05-13, 07-07, 07-23, 10-01, 10-07, 11-20 and 1998-03-02. They land in six month rows titled "Surface Transportation Board: 3 / 4 / 6 / 5 / 3 / 3 routine notices".
- **11 keep their dated rows.**

*Minimal reproduction.* `routineNoticeAgency` returns:
- `"Surface Transportation Board"` for "…Railway CompanyControl and Operating Leases/Agreements Conrail Inc.";
- `null` for "…Railway Company-Control and…".

*Also folded:* "Public Listening Session Regarding CSX Transportation, Inc.'s Rail Service Issues; Joint Petition of …" (2017-08-30), the STB hearing on CSX's 2017 service crisis. It lands in "Surface Transportation Board: 3 routine notices", because the rule lists only `petition for`.

*Why the checks miss it.*
- The ledger records "the 1996–97 Conrail merger notices stay dated" (`docs/MASTER-CHECKLIST.md:1480-1481`).
- `check:fr-backfill`'s control case is written with hyphens ("…Company-Control-Norfolk…", `scripts/check-fr-backfill.ts:273`), so it never meets the run-together form the live API returns.

**Failure scenario:** a reader of CSX's 1997–98 timeline finds the largest transaction in its history listed as routine paperwork, behind a "routine notices" title.

**Smallest fix:**
- Test `NOT_ROUTINE` against the title with run-together words split, e.g. `.replace(/([a-z.,])([A-Z])/g, "$1 $2")`.
- Widen `petition for` to `petition`.
- Pin one 1997 Conrail title in `check:fr-backfill`.

*Importance:* medium · *Efficiency:* one line · *Practicality:* trivial.

## Set aside (5)

- **Dead exports.** `MONTHLY_FORM` (`lib/secForms.ts:188`) has no reader: `pageFilings` hard-codes the same two forms in `MONTHLY_ROW`. `isInvestigation` is called only by `check:vehicle-recalls`, and production repeats its regex in `isMinorRecall`. A drift risk, not a defect yet.
- **Acceptance stamps far from the filing day.** 4 of the 1,325 stored Ford and Apple stamps fall on a day well away from the filing's date. For example, Ford's Form 25 is dated 2002-12-05 but was accepted 2002-12-16, so its row reads "Dec 16, 4:05 pm ET, after the close". These are rare exchange-filed or date-adjusted filings.
- **A rounded penalty.** JPMorgan's $61,932,500 penalty reads "$61.93 million". That is conventional rounding.
- **Synthetic results headlines.** Made-up headlines such as "Acme Schedules Third Quarter 2024 Earnings Release" also pass `announcesResults`. No real instance was found, so this is not a finding.
- **Batch 63's daily ask.** It reads only the current year's newest 40. A company first held late in a busy year waits until January for that year's older documents. This is implied by the record.

## Checked and found sound

- **Batch 69, the bank map, replayed on the Board's older file** (2,514 rows):
  - 62 events on 17 banks.
  - No pre-1998 "Wells Fargo & Company" row and no pre-1997 "U.S. Bancorp" row exists to mis-assign.
  - Every penalty title matches the Board's amount.
- **Batch 65, the no-file-number rule, on a real target.** Perrigo's record carries its own file number 005-87911 on all 11 of Mylan's 2015 SC TO-T and SC TO-T/A filings, so they correctly read "by an outside bidder".
- **Batch 67, fund series:**
  - VOO's series list tags the filings a trust makes for every fund: N-CEN 4 of 4, 24F-2NT 4 of 4, and the DEF 14A and DEFA14A proxy filings. So none of them is unlinked as a sibling's.
  - `chronolens_b67b` holds VOO 294 and VTI 259 own-series links, as recorded.
  - The read-time name comes from the index's series name.
- **Batch 68, acceptance times:**
  - No constant (date-only) stamp among the 1,325 stored instants.
  - `occurred_at` is `timestamptz`.
  - `publishedAfterClose` handles filings dated the day after they came out.
  - The cache key moved to v8.
- **Batch 63, the mechanics:**
  - CSX 572 → 330 rows, with 135 month rows, as recorded.
  - The former-name reader's regex matches the text `renameEvents` writes (`lib/sec.ts:1028`).
  - Years are stored only on an answer.
  - Solventum's alias "3M Health Care" keeps nothing before its spin-off (5 hits, 0 titles).
- **Batches 66 and 70.** Investigations reuse the dated maker map and are drawn as minor markers. The FDA map's dated units read consistently.
- **Docs.** `FDA_FIRMS` 71, `FED_BANKS` 25 and `SOURCES` 26 match `README.md` and `docs/COVERAGE-MAP.md`.
- **Dead code.** Every new export has a production caller except the two set aside above.

*For `opportunity-scout`:* `check:fr-backfill` could replay a few real titles from 1990s years, which is where the run-together form lives.
