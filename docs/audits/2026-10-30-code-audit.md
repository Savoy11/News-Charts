# Code audit, 2026-10-30 (batches 72–77: `3243d71..1353574`)

Run by the `code-auditor` agent (read-only). It covers `git diff 3243d71..1353574`: 37 files, 13 commits (7 batch commits and 6 merges; +3,308 / −171).

**Commit:** `1353574` (branch `claude/lucid-goodall-6km6ea`, equal to `origin/main`). **Date:** 2026-10-30.

**Where it ran:** the cloud build container (`/home/user/News-Charts`, Node 22.22.0). It went out through the session proxy, using curl.

**Network: 6 requests in all.** Each carried the User-Agent `News Charts Research marcusowens94@gmail.com`.
- **www.federalreserve.gov, 2:** `ea-old.json` and `ea-cms-recent.json`.
- **www.sec.gov, 2:** release 2006-145 (Prudential), and release 2012-233 at its odd `2012-2012-233htm` address.
- **data.transportation.gov, 2:** the adapters' own recall and investigation queries for the sold-brand makers.

**Database:** Postgres 16 was down when the audit started. The auditor started it and only ran reads:
- in `chronolens_b73`: `sec_press_releases`, `sec_press_years` and the schema;
- across `chronolens` and `chronolens_b30`…`_b73`: subject and first-price lookups.

It then stopped the cluster again. Nothing was written. Probes and outputs are in the scratch folder. `git status` is clean.

**Checks run:**
- **`npm run check`:** tsc plus 51 suites, 52 in all. All pass in 1 m 17 s: sec-press 46, sec-forms 124, fed-actions 42, fda-recalls 61, vehicle-recalls 74, doj 45, relevance 85, wiring 215.
- **`npm run lint`:** clean, in 8 s.

**Checks skipped:**
- **`check:feeds`, `check:live` and `check:ui`:** as instructed. They make many requests or need a server. The paths behind the findings were probed directly instead (above).
- **`next build`:** not needed for these findings.

## Summary

The mechanics of batches 72–77 hold on real data:
- the SEC year walk and its storage;
- the 14 foreign banks;
- the sold vehicle brands;
- N-30B-2;
- the counts in the docs. The replay gives exactly 209 SEC releases on 122 companies, 37 Fed events and 56 + 12 recalls.

The defects are in which company a release or action belongs to:
- Prudential Financial's $600 million settlement is put on Prudential plc's page, scored as certain;
- a headline that names two companies with a comma lands only on the second;
- BBVA's US bank is missing from the Fed map, contrary to the batch's own rule;
- a company's first ingest asks for SEC releases before it has prices.

Fix finding 1 first: it is the only one that puts a wrong company's event on a page.

## Findings

### 1. The SEC's 2006 Prudential Securities settlement ($600 million) lands on Prudential plc, the UK insurer, scored 0.95 · `P2`

**Evidence**

*The release.*
- The stored title of 2006-145 (`chronolens_b73`, 2006-08-28) is "Prudential to Pay $600 Million in Global Settlement of Fraud Charges in Connection With Deceptive Market Timing of Mutual Funds".
- The release itself (www.sec.gov, fetched here) says: "settled enforcement proceedings against Prudential Equity Group, LLC (PEG), formerly known as Prudential Securities Inc. … PEG is a registered broker-dealer and investment adviser subsidiary of Prudential Financial, Inc., headquartered in New York".

*The replay.* The party rule was run over all 6,894 stored releases for every company in the index.
- It puts this release on **PUK** (CIK 1116578, PRUDENTIAL PLC) and on no other company.
- `secPressEvents(…, () => ["PRUDENTIAL"], "2000-06-28")` returns it.
- `deterministicScore` gives `{"score":0.95,"reason":"an SEC release naming the company as a party"}`.
- PRU, Prudential Financial (CIK 1137774), gets none.

*Cause.*
- PUK's only name is `commonName("PRUDENTIAL PLC")` = "PRUDENTIAL". PRU's is "PRUDENTIAL FINANCIAL".
- `listedCompaniesNamed("Prudential")` is 1, so the shared-name guard (`lib/secPress.ts:176`) passes.
- The title holds no "Prudential Financial", so `longerListedNameIn` does not fire either.
- `namedAsSubject` (`lib/doj.ts:149-157`) then reads "Prudential to Pay" as the subject: the title opens with the name, and "To Pay" is a `PARTY_VERB`.
- The Justice Department rule runs the same test. `releaseNamesParty(<this title>, ["PRUDENTIAL"])` also returns `true`, so the DOJ feed has the same exposure on PUK's page. That was not measured here: no justice.gov request was made.

*Why the batch missed it.* The ledger says "Every match was read by hand, and 22 wrong ones are refused" (batch 73). The same probe flags every match whose name is the first word of another listed company's everyday name (`listedNamesContaining`): 55 of them. Read one by one, PUK's is the only one where the other company is the party.

**Failure scenario**
- Prudential plc's page shows a US market-timing fraud and a $600 million penalty as its own, with the weight of an SEC release.
- PUK's NYSE ADRs date from 2000, so the first-price gate does not hold the release back. That is not measured: no scratch database holds PUK.

**Smallest fix**
- Treat a one-word everyday name as ambiguous when another operating company's everyday name begins with it ("Prudential" → "Prudential Financial"). Then require the title to carry PUK's own legal form or a word that marks it ("Prudential plc").
- Keep the company's own funds out of that test: "Goldman Sachs" also begins "Goldman Sachs BDC", and those matches are right.
- Apply the change in `namedAsSubject`'s callers, so the DOJ feed gets it too.

**Check:** `check:sec-press` asserts that 2006-145 lands on neither PUK nor PRU, while 2010-59 (GS), 2003-159 (MS) and 2015-71 (BLK) still land.

*Importance:* high: a wrong company's fraud penalty on a large-cap page, scored as certain · *Efficiency:* one guard · *Practicality:* easy.

### 2. A headline that names two companies with a comma lands only on the second: Morgan Stanley, Barclays, BOK Financial and Freddie Mac miss their own charges · `P3`

**Evidence**

*Replayed with each company's ingest names* (`companyNames` + `newsNamesFor` + possessive):

| Release | Title | Company | Result |
|---|---|---|---|
| 2017-30 | "Morgan Stanley, Citigroup Charged With Misleading Investors About Forex Trading Program" | MS | `false` |
| | | C | `true` |
| 2016-16 | "Barclays, Credit Suisse Charged With Dark Pool Violations" | BCS | `false` |
| | | GLDI, Credit Suisse AG's ETN record | lands there |
| 2016-182 | "BOK Financial, Senior Executive Charged With Turning Blind Eye to Investment Scheme" | BOKF | `false` |
| 2007-205 | "Freddie Mac, Four Former Executives Settle SEC Action Relating to Multi-Billion Dollar Accounting Fraud" | FMCC (`["FEDERAL HOME LOAN MORTGAGE","Freddie Mac"]`) | `false` |

*Cause.*
- `namedAsSubject`'s pattern (`lib/doj.ts:152`) takes the verb directly after the name (`,?\s+PARTY_VERB`), or after "and" and up to four more words (`\s+and(?:\s+[A-Z]…){1,4}\s+PLURAL_VERB`).
- It does not take a comma followed by another party and the verb. The second name passes only because `CLAUSE_START` allows a comma before it.
- The SEC's own-verb path (`lib/secPress.ts:179`) needs "SEC Charges" or "… Against" in front, which these headlines do not have.

*Why the checks miss it.* `check:sec-press`'s two-company cases are "SEC SUES MORGAN STANLEY AND GOLDMAN SACHS" (2005-10) and "Wells Fargo and LPL Financial Charged" (2024-207). Both use "and".

**Failure scenario:** Morgan Stanley's page, which leads the docs' ranking with 13 releases, lacks its 2017 forex charge. Barclays' page lacks its 2016 dark-pool charge, which goes only to a Credit Suisse ETN.

**Smallest fix:** in the subject pattern, accept `,\s+<one to four capitalised words>\s+PLURAL_VERB`, as "and" is accepted now. Keep the `Former`/`who` guards, so "Rio Tinto, Former Top Executives Charged" still turns on the shared-name rule.

**Check:** `check:sec-press` asserts that 2017-30 lands on MS and C, 2016-16 on BCS, and 2016-182 on BOKF.

*Importance:* medium: missing enforcement events on large banks · *Efficiency:* one alternation · *Practicality:* easy.

### 3. BBVA's map leaves out Compass Bank, the US bank it bought in 2007, so its 2009 Federal Reserve penalty is on no page · `P3`

**Evidence**
- The Board's old file, read here, holds row `{"id":1224,"edt":"2009-09-21","bkorg":"Compass Bank, Birmingham, Alabama","type":"Civil Money Penalty","url":"/newsevents/pressreleases/enforcement20090924c.htm"}`.
- BBVA's entry (`lib/fedActions.ts:178-181`) matches only `/\bBanco Bilbao Vizcaya\b/i`.
- Replaying `fedActionEvents` over all 2,899 rows gives BBVA 2 events (2000-06-12, 2016-12-21), and the Compass row lands on no bank.
- Batch 74's rule, in its own words (`docs/MASTER-CHECKLIST.md`, batch 74 ledger, and `README.md`): "the bank, its US holding company and branches, and a US bank it bought from the day it did".
- BBVA bought Compass Bancshares in September 2007 and sold the bank, by then BBVA USA, to PNC in June 2021. These days are not read from a filing here; the map's practice is to take them from BBVA's 20-F.
- The ledger's "Refused" list and the scout's 37-event count both leave the row out.

*Searched for other cases.* The same search, over the Board's organisation names, found no other unmapped US unit of the 14 banks: Harris, Banknorth, UnionBanCal, Taunus, Republic New York and Santander BanCorp have no rows. "Bank of the West, Irving, TX" (1991) is a namesake.

**Failure scenario:** BBVA's page shows 2 Federal Reserve actions, not 3.

**Smallest fix:** add `/\bCompass Bank\b[^;]*\bBirmingham\b/i` to BBVA, from the purchase day to the sale day, each read from BBVA's filings.

**Check:** `check:fed-actions` pins row 1224 on BBVA, and pins no Compass row before the purchase day.

*Importance:* low: one penalty, probably small (the row carries no amount) · *Efficiency:* one regex · *Practicality:* easy, once the two days are read.

### 4. On a company's first ingest, the SEC step runs before its prices exist, logs "empty", and the company's releases wait a day · `P3`

**Evidence**
- `ingestCompany` runs `sec_press` at `scripts/ingest.ts:652`, and the price step (`yahoo_prices`) only from `:793`.
- `secPressFor` reads `min(on_date) FROM prices` (`lib/ingest/secPressWalk.ts:179-183`). With none, it returns `{ events: [], outcome: "empty", detail: "no prices to start from" }` (`:185-188`).
- `loadLastFetched` counts an `empty` row as asked (`lib/ingest/store.ts:460`, `outcome IN ('ok','empty')`), and `SOURCE_TTL_MINUTES.sec_press` is 1440 (`lib/ingest/refresh.ts:52`).
- So the first ingest stores nothing and marks the source fresh for 24 hours.
- Who reaches `ingestCompany` with no prices:
  - a ticker added with `npm run ingest -- TICKER`;
  - a queued request that `scripts/refresh.ts:177` serves without a completed first pass. The first pass, `lib/ingest/firstPass.ts`, is what writes prices for a visitor.
- `check:sec-press` asserts the empty outcome ("none for a company with no prices yet"), not the order.

**Same order, outside this range:** batch 71's Federal Register walk (`:589`, `frBackfill.ts:167`) and the GDELT month walk (`:677`, `newsBackfill.ts:122`) also run before prices, and also stop on "no prices to start from".

**Failure scenario:** a newly added bank's page has none of its SEC releases until the next day's refresh.

**Smallest fix:** run the price step before the date-bounded sources, or return a non-fresh outcome ("deferred") when there are no prices, so the next run asks again.

**Check:** `check:wiring` (or `check:sec-press`) asserts that in `ingestCompany` the `yahoo_prices` write comes before `run("sec_press"`.

*Importance:* low: it fixes itself in a day · *Efficiency:* a reorder · *Practicality:* easy.

## Known before this audit (6): four confirmed, one of them widened, two not re-examined

- **J.P. Morgan without "Chase".** 2012-233 ("SEC Charges J.P. Morgan and Credit Suisse …") and 2022-131 ("SEC Charges JPMorgan, UBS, and TradeStation …") do not reach JPM.
- **UBS.** Exactly 11 releases land on AMUB (UBS AG's ETN record), none on UBS Group.
  - *Widened:* the same mechanism puts **7 Credit Suisse releases on GLDI**, Credit Suisse AG's ETN record: 2012-233, 2014-39, 2015-214, 2016-16, 2018-128, 2018-224, 2021-213. The ledger names GLDI only for Fed actions (`docs/MASTER-CHECKLIST.md:1162`).
  - The docs' ranking ("Morgan Stanley 13, Citigroup 10, Wells Fargo 9 …") leaves AMUB 11 and GLDI 7 out, though both are among the 209.
- **Deutsche Bank.** 2009-127 ("…With Bank of America, RBC, and Deutsche Bank") lands on BAC and RY, not DB.
- **Popular, Inc.** Its rows of 1999-06-21, 2000-03-09 and 2023-01-20 are unmapped.
- **Not re-examined:** Fresenius Vial and the Form 25 / 25-NSE labels.

## Set aside (4)

- **Namesakes held off only by the first-price gate.** Of the 209 replayed matches, these name an older, different company:
  - ITG, Inc. (CIK 2110117) gets Investment Technology Group's 2015 and 2018 releases;
  - Trinity Capital Inc. gets Trinity Capital Corporation's (2015);
  - Lucent, Inc. gets Lucent Technologies' (2004);
  - Broadcom Inc. gets Broadcom Corp.'s (2008);
  - Alcoa Corp gets Alcoa Inc.'s (2014; Alcoa Inc. is Howmet's record);
  - Bristow Group gets the old Bristow's (2007).

  Each company listed after the release, so `secPressFor` should drop them. None was measured against real prices. The docs' "209 … on 122 companies … each read by hand" counts them as landing.
- **The walk ends a year when a parsed page is short** (`lib/ingest/secPressWalk.ts:98`, after `parseListing` skips any row missing a field). A skipped mid-year row, or a renamed row class with `views-view-table` still on the page (`lib/secPress.ts:96`), would mark a past year `complete` without all its releases, and it would never be read again. No instance today: the stored years add up to all 293 pages.
- **Rio Tinto plc's 2023 charge (2023-46) reaches neither listing.** The title says "plc", which names CIK 863064 alone. This is pinned on purpose in `check:sec-press:228`.
- **`sec_press_years.releases` for the current year is overwritten** by each daily read: 25 after a one-page read. Cosmetic.

## Checked and found sound

- **Batch 73, the party rule, on all 6,894 stored releases** against every company in the index under its current names:
  - 209 matches on 122 companies, 125 before 2017, 54 before 2009, none before 2000;
  - MS 13, C 10, WFC 9, GS 8, BAC 8, exactly as `README.md` and `docs/COVERAGE-MAP.md` say.
  - Every match was read: apart from finding 1, the namesakes above and the known items, each lands on its own party.
- **Batch 73, the walk:**
  - `sec_press_years` holds 1997–2026, with pages summing to 293 and releases to 6,894 (the four repeats once);
  - only 2026 is not complete.
  - The 310 releases of 2012–13 stored at addresses like `…/2012-2012-233htm` resolve (HTTP 200 with the right title).
  - A refusal is logged as `throttled`, and the run-wide back-off sees it (`shouldBackOff`'s `latest`).
  - `namedAsSubject` was split out of `releaseNamesParty` with its tests unchanged (the diff), and `check:doj` passes 45/45.
  - The source has the same settings as `doj_press`: TTL, quota, `SOURCES` id 27, the 0.95 score, the credits.
- **Batch 74, the Fed map, replayed on both files** (2,899 rows):
  - 37 events on the 14 foreign banks, 27 before 2017, 8 with a penalty of $100 million or more;
  - 109 events on 32 of 39 banks, 78 before 2017, the first 1993-09-29;
  - no row on two banks.
  - Bankers Trust 1991/1994, Credit Suisse 2009/2014/2020, Newark City National and the Commerce, Irwin, Highlands and Bowling Green namesakes are all refused.
- **Batch 77, live through the adapters' own queries:**
  - Ford 56 recalls: Volvo 30, Jaguar 13, Land Rover 13, from 1990-02-08 to 2009-12-18;
  - Ford 29 investigations (17/6/6);
  - GM 12 Saab recalls (2001-05-18 to 2008-04-09) and 9 investigations, all as recorded.
  - Titles name the brand, and the `VOLVO/`, `GM/SAAB/` and `SAAB\` prefixes are gone.
- **Batch 75:** N-30B-2 is added in all three places that list fund forms (`wanted`, `FUND_LABELS`, `REGISTRANT_FORM`), and nothing in `app/`, `components/` or `lib/` lists N-30D anywhere else.
- **Batch 76:** read only, against openFDA's offline fixture. Fresenius SE's FMC and NxStage days agree with FMC's own entry (`lib/fdaRecalls.ts:407-416`); Siemens Healthineers is bounded at 2018-03-16.
- **Docs and counts:**
  - `SOURCES` 27 (19 cleared for commercial use), `FDA_FIRMS` 73, `FED_BANKS` 39;
  - the suite totals the ledger gives;
  - the 181 `docs/MASTER-CHECKLIST.md:N` references in `docs/audits/nc-task-queue-2026-09-28.json` that the range shifted still point at the same lines.
- **Wiring:** every new export has a production caller: `walkSecPress` and `secPressFor` (`scripts/ingest.ts:652-658`), `heldOn` and `makersWhere` (both NHTSA adapters), and `listedCompaniesNamed`.

*For `opportunity-scout`:* `check:sec-press` could replay the whole stored listing against the index, as this audit did, so that a change to the rule shows its full effect.
