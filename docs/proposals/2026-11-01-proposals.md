# Opportunity proposals — 2026-11-01

**Commit:** 5dc6cb2d2abe2f43c6c4791c5d1b83170317589a (`claude/lucid-goodall-6km6ea`, equal to `origin/main` after batch 78) · **Reviewed:** `CLAUDE.md`, `README.md` (its opening sections through the Federal Reserve adapter), `docs/MASTER-CHECKLIST.md` (the batch 72–78 ledgers, Scope refocus, the legend and every open box), `docs/COVERAGE-MAP.md`, `docs/audits/2026-10-30-code-audit.md`, all five files in `docs/proposals/` (2026-10-28 whole; the others' proposals and cut lists); code — `lib/sec.ts` (the form filter, `newsNamesFor`), `lib/secForms.ts`, `lib/edgarName.ts`, `lib/secPress.ts`, `lib/doj.ts`, `lib/ingest/secPressWalk.ts`, `lib/ingest/frBackfill.ts`, `lib/ingest/newsBackfill.ts`, `lib/ingest/store.ts` (`SOURCES`), `lib/scoringNames.ts`, `lib/news.ts` (`gdeltNames`), `lib/predecessors.ts` (header), `lib/focus.ts`, `scripts/ingest.ts` (the names each source is asked by), `scripts/check-sec-press.ts`, `scripts/check-recall.ts`; data — `data/edgar-tickers.json`, `data/company-aliases.json`, and the local `chronolens_b73` database (read-only) · **Proposals:** 5

> - **No rejection log exists** (`docs/audits/rejected-proposals.md`), and nothing has been
>   rejected: all five 2026-10-28 proposals were approved and built (batches 73–77), and batch 78
>   fixed the four findings of the 2026-10-30 audit. No item was deferred, so none carries forward.
>   CPSC recalls still await the owner's call on the 2026-10-22 shortlist and are not re-proposed.
>   Insider-trade forms stay out, as decided on 2026-10-18.
> - **Owner calls raised before and still open.** Ranked here, each with what is new: Deutsche
>   Bank's name (#3); JPMorgan's "J.P. Morgan", UBS Group's "UBS" and Credit Suisse's releases on
>   GLDI (#4); Popular, Inc. in the Fed map (a note in #5). Not ranked: Fresenius Vial's one recall
>   and the Form 25 / 25-NSE labels (see the end).
> - **Measured live on 2026-11-01 from this container**, every figure below unless it says it was
>   read from the checklist or the local database. Requests, by host: www.sec.gov 18 (three of
>   EDGAR's quarterly form indexes, for 1998, 2003 and 2007; 13 pages of the 2010 enforcement
>   listings, the whole year; the first page of each for 2004); data.sec.gov 4 (two submissions
>   records and one older shard of each: Eagle Bancorp, Dillard's); www.justice.gov 4 (title
>   searches); www.federalreserve.gov 1 (its press-release feed); www.consumerfinance.gov 1 (its
>   enforcement list). 28 in all, each with the User-Agent `News Charts Research`
>   and the owner's contact address (removed from the repository in batch 92); sec.gov hosts paced at about one a second. GDELT, Wikidata,
>   Wikipedia, Yahoo, the Federal Register, openFDA and NHTSA were not asked. The local Postgres
>   cluster was down; I started it for read-only queries on `chronolens_b73` and stopped it again.
> - **Nothing here needs a key, a paid tier or a recurring charge.** Two proposals, #2 and #5,
>   read datasets the site does not read today; each is written as a decision for the owner, with
>   its licence quoted. #4 carries three owner calls, all raised before. #1 and #3 need none.
> - Ranked by importance, securities depth first:
>   1 · the small-business annual and quarterly reports, and the 1990s tender offers, that ingest
>   downloads and the form filter drops — 2 · the SEC's litigation releases and administrative
>   proceedings, by the parties their captions name (a source decision) — 3 · a legal form left in
>   the everyday name, which leaves Deutsche Bank asked by a phrase nobody writes — 4 · the banks'
>   securities units while they owned them, and three names for the owner — 5 · the Federal
>   Reserve Board's approvals of banks' acquisitions, from its press-release feed (a source
>   decision).
> - Five, not eight. What else I looked at, and why it was cut, is at the end.

Mark each proposal below: `APPROVED`, `REJECTED`, or `DEFERRED`, and add a
reason for anything rejected. Then run the scout in FILE mode.

---

## 1. The small-business reports and the 1990s tender offers: forms ingest downloads and the filter drops · proposed `P1` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — by the owner, 2026-11-01, with the call: groups (a), (b) and (c), and of the options SB-2 and 10-12B; 10-12G, a registration under section 12(g) rather than for an exchange listing, stays out.
**Owner's reason (if rejected):**

**Anchor:** data already downloaded and never surfaced · a capability present for one era and
missing for the one before it. The 10-K405 is kept as "the annual report's own form until 2002,
which the older shards reach" (`lib/secForms.ts:120-121`), and so are SC TO-T, SC TO-T/A and
SC TO-I (`lib/secForms.ts:125-130`). The forms a small company reported on until 2008, and the
tender-offer forms Schedule TO replaced in 2000, are not.

**What:** Keep, in `MATERIAL_FORMS`, in groups the owner picks:
- **(a) the small-business annual and quarterly reports:** 10KSB, 10KSB40 and 10QSB (EDGAR writes
  them without a hyphen), with their amendments, labelled and typed earnings as the 10-K and 10-Q
  are;
- **(b) the tender-offer forms before 2000:** SC 14D1, an outside bidder's offer, read by batch
  65's file-number rule as the company's own offer when it made one, its amendments a row a month
  as SC TO-T/A's are; and SC 13E4, the company's offer for its own shares, as SC TO-I is;
- **(c) 10-K405/A,** the amended annual report of the 10-K405 years, beside the 10-K/A kept;
- **optional:** SB-2, a small company's registration to sell shares, beside the S-1 kept; and
  10-12B and 10-12G, a spin-off's registration of its shares.

**Grounded in:**
- **The filter** (`lib/sec.ts:869-894`) drops any form not in `wanted`, `MATERIAL_FORMS`, 8-K/A
  or the 424B prospectuses. None of these forms is in any of them, and none is named anywhere in
  the code, the checklist or a proposal. The count behind batch 65 read 45 large companies'
  records (`docs/proposals/2026-10-26-proposals.md:212`): a large company files no small-business
  report, and that count did not list the old tender forms.
- **Measured** on EDGAR's quarterly form indexes
  (`www.sec.gov/Archives/edgar/full-index/Y/QTRn/form.gz`, every filing of the quarter by form and
  CIK), kept to the CIKs in `data/edgar-tickers.json`:

  | Quarter | Rows on index companies | Kept today | 10QSB | 10KSB, 10KSB40 | their amendments |
  |---|---:|---:|---:|---:|---:|
  | 1998 Q2 | 6,482 | 4,282 | 151 | 50 | 30 |
  | 2003 Q2 | 24,478 | 9,353 | 248 | 84 | 80 |
  | 2007 Q2 | 48,097 | 15,435 | 326 | 151 | 72 |

  That is 1,192 small-business reports on **464 companies** in three quarters. Among them, in
  index order: Take-Two (TTWO, a 10QSB of 1998-06-15), Axon (as TASER International, 2003-05-02),
  XPO (as Segmentz, 2003-05-15), Halozyme (2003), Celsius (2007-05-15), Universal Display
  (1998-05-14), Neogen (1998-04-07), Gulfport Energy (2003 and 2007), BJ's Restaurants (as Chicago
  Pizza & Brewery, 1998-05-15).
- **One record read whole, Eagle Bancorp's** (EGBN, its older shard): 18 small-business reports
  from 1998-04-28 to 2002-11-14, 4 10KSB and 14 10QSB, each with its report date. Of its reports
  for 1998–2002, the filter keeps one, the 10-Q of 1999-05-14. Its SB-2 of 1997-12-12, the
  offering its record begins with, is dropped too.
- **The tender forms, 1998 Q2.** Across all filers: SC 14D1 140, SC 14D1/A 590, SC 13E4 28,
  SC 13E4/A 57. On index companies:
  - five offers they made: SPX's for Echlin (1998-04-30), Viad's for MoneyGram Payment Systems
    (04-10, on PRSU's record), Dillard's for Mercantile Stores (05-21), Tyco's for Sigma Circuits
    (06-05, on JCI's record) and Armstrong's for Triangle Pacific (06-19);
  - 39 amendments on 11 companies (Abbott, Alcoa on Howmet's record, Motorola, Snap-on, Cendant
    on Avis Budget's…);
  - The Limited's offer for its own shares of 1998-04-15 (BBWI's record) and five amendments,
    and SAP's of 06-25.

  None of these forms occurs in the 2003 or 2007 quarters.
- **Dillard's record** (its older shard): the SC 14D1 of 1998-05-21 and nine amendments to
  1998-08-19 carry no file number, while its 1990s 10-Ks, 10-Qs, 8-Ks and 13Gs all carry one. So
  `DEAL_FORM`'s rule (`lib/secForms.ts:172`) reads them as Dillard's own offer, as it reads
  Pfizer's SC TO-T filings.
- **10-K405/A:** 42 rows on 39 index companies in 1998 Q2 (AMD, ATI, AXP, AAL…), none later.
- **The options:** SB-2 3, 7 and 31 rows in the three quarters; 10-12B and 10-12G 5, 4 and 3.

**Who benefits and how:** Readers of the companies that were small before 2009, at least 464 and
many large now (Take-Two, Axon, XPO, Halozyme, Celsius). Their pages gain the annual and quarterly
reports of their early years, on the Earnings chip and as the chart's markers. Today those years
carry 8-Ks and nothing marks a reporting date. Readers of Dillard's, SPX, Armstrong, Abbott,
Alcoa's Howmet and the others gain the tender offers they made in the 1990s, on the day each
began, with its amendments a row a month.

**Cost:** none — no key, licence or recurring charge, and no request: the rows are in the older
shards ingest already reads (`docs/MASTER-CHECKLIST.md:4998`). Size, estimated from the three
quarters rather than counted (a filer's second-quarter 10QSB taken as one of its three a year):
about 700 small-business reports a year in 1998 and 1,300 to 1,600 in 2003–2007, so on the order
of 10,000–15,000 rows over 1996–2008. The tender forms come to a few hundred rows over
1993–1999, their amendments grouped by month.
**Effort:** small.
- Rows in `MATERIAL_FORMS`; SC 14D1 and SC 14D1/A in `DEAL_FORM`, `FOR_ANOTHER_COMPANY` and
  `MONTHLY_FORM`.
- Search and the filing stacks: focus reads a 10-K405 as a 10-K (`lib/focus.ts:67-68`) and should
  read a 10KSB so, and a 10QSB as a 10-Q; `EventList`'s form pattern names 10-K405
  (`components/EventList.tsx:416`) and needs the new forms.
- **A caveat to state:** a few of these records were shells or blank-check companies then. QXO's
  2007 10KSB is Trey Resources'; Primoris's is Rhapsody Acquisition's. Their reports would read
  under today's name, as those records' 8-Ks of the same years already do. I did not count how
  many of the 464 are such records.

**Verified by:** `check:sec-forms` cases on rows pinned from the two records read:
- EGBN's 10QSB of 1998-04-28 (report date 1998-03-31) is kept as a quarterly report, typed
  earnings, and its 10KSB of 1999-03-30 as an annual report;
- Dillard's SC 14D1 of 1998-05-21 is kept as its own tender offer, and its amendments make one row
  a month;
- a 10-K405/A is kept as an amended annual report.

In `check:focus`, "10-K" finds a 10KSB and "10-Q" a 10QSB. On main each row is dropped at
`lib/sec.ts:894`, so the cases fail.

**Depends on:** nothing. The owner picks the groups, as on 2026-10-18 and 2026-10-26.

**Buildable by:** a cloud session, offline; the counts above were made here.

*Importance:* high — years of primary results documents on hundreds of pages, all before 2009 ·
*Efficiency:* very high — rows already downloaded, one function · *Practicality:* high — one
owner pick

---

## 2. The SEC's litigation releases and administrative proceedings, by the parties they name — a source for the owner to decide · proposed `P1` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — by the owner, 2026-11-01: yes to the source.
**Owner's reason (if rejected):**

**Anchor:** a capability present for one of the SEC's three enforcement listings and missing for
the other two, on the same host and under the same licence. The press releases are read back to
1997 (batch 73). The litigation releases and administrative proceedings, the SEC's record of each
case it brings, are not · the 1963–2017 hole (`docs/COVERAGE-MAP.md:88`), in every sector.

**What:** The owner's decision first. If yes: read each year's two listings once, back to the
oldest year they hold, in the shape of the press-release walk (`lib/ingest/secPressWalk.ts`). Keep
a release on a company's page when its caption names the company as a defendant or respondent,
under the names it had that year.

**Licence:** the press releases' own (`lib/secPress.ts:13-16`, read 2026-10-28): "Information
presented on sec.gov is considered public information and may be copied or further distributed by
users of the web site without the SEC's permission. Please consider appropriate citation to the
SEC as the source." No key.

**Grounded in:**
- **What changed since the 2026-10-22 note.** It did not shortlist "SEC enforcement releases":
  "finding a company means reading every year's pages, and the latest page of litigation releases
  named individuals and small firms only" (`docs/proposals/2026-10-22-news-sources.md:170-172`).
  Reading every year once is now built: batch 73's walk read 293 pages and never asks a closed
  year again. And the latest page is not the year: 2010, read whole, names 16 listed companies.
- **The listings:** `www.sec.gov/enforcement-litigation/litigation-releases?year=Y&month=All&page=N`
  and the same for `administrative-proceedings`, 100 rows a page, newest first. Each row has a
  `<time>` instant; the caption, which lists the defendants or respondents ("Huntington
  Bancshares, Inc.; Thomas E. Hoaglin, Michael J. McMennamin, and John Van Fleet, CPA"); the
  release numbers (LR-21795, 34-63571); a proceeding's file number (3-14153); and a link.
- **2010, read whole:** 439 litigation releases on 5 pages, 739 proceedings on 8. A party matched
  to an index company by its exact everyday name gives **25 events (a company and a day) on 16
  companies**:
  - litigation releases: Transocean, Tidewater and Noble (all 2010-11-04, the customs-bribery
    cases), ABB, Universal Corp, Citigroup, General Electric, Eni, Innospec, Assurant, Bank of
    America (three days in January and February), and Morgan Stanley & Co. among the dealers
    named on 03-19;
  - proceedings: Morgan Stanley & Co. (four days), Value Line (four days, under one caption),
    Huntington Bancshares (11-09), Daxor and China Yuchai.
  - **Only 4 of the 25 fall on a day a press release names the company:** Innospec 03-18, GE
    07-27, Citigroup 07-29, ABB 09-29 (`sec_press_releases`, `chronolens_b73`). The press release
    of 2010-11-04 names none of the three drillers: "SEC Charges Seven Oil Services and Freight
    Forwarding Companies for Widespread Bribery of Customs Officials" (2010-214).
- **What the rule must refuse, all on those pages:**
  - a namesake: "Overland Energy, Inc., Acorn Energy, Inc., Garry B. Smith, …" (2010-11-10), whose
    co-defendants are not Acorn Energy's (ACFN) people; on my reading another company;
  - relief defendants, who are not charged ("…, Defendants, and Tega Operating Company, Relief
    Defendant");
  - a company's stock as the subject: "One or More Unknown Purchasers of Securities of Martek
    Biosciences Corporation", "…of Options of InterMune, Inc.";
  - the lists of delinquent registrants whose registration is revoked, five to seven shells a
    caption ("EC Power, Inc., Electro Energy, Inc., EMB Corporation (n/k/a AMTGroup, Inc.), …",
    2010-12-21);
  - an acquisition's past, once units are mapped (#4). "Jefferies and Co., Inc." (2010-12-09) was
    Jefferies Group's, which Leucadia, today's JEF (CIK 96223), bought in 2013. "Janus Capital
    Management LLC" (12-01) is Janus's, which merged with Henderson in 2017.
- **Units the captions name exactly**, which #4's map would reach: "Banc of America Securities
  LLC" (four rows in November and December 2010), "Wachovia Securities, LLC" (12-03, beside
  Evergreen), and "J.P. Morgan Securities Inc." and "Bear, Stearns & Co. Inc." among the 03-19
  dealers.
- **2004's first pages** (October to December, 200 rows): Disney (12-20), AIG (two proceedings on
  12-20, a litigation release on 11-30) and Morgan Stanley (11-04). Also two companies with no page
  here: Wachovia Corporation (11-04), which is not Wells Fargo's before 2008-12-31, and Qwest
  (10-21).

**Who benefits and how:** Readers of every sector. They get the SEC's own record of the cases it
brought against the company, dated, in the years GDELT does not reach: the court actions and
settled proceedings behind most press releases, and many that no press release named. **I cannot
size it past the year read.** If 2010 is typical (25 events, 21 on a day no press release
names the company), it is about 20 a year, roughly 450 for 1995–2016. The press releases on pages
today hold 120 before 2017. 2004's 200 rows gave 4 events on 3 companies, about the same rate.

**Cost:** none recurring — no key, licence fee or charge. 2010 took 13 pages. Reading 1995–2025
once is roughly 300–400 requests if other years are 2010's size, a second apart, once for all
companies. Then each listing's newest page a day.
**Effort:** medium.
- A second year walk beside the press releases', its rows stored once, as `sec_press_releases`
  and `sec_press_years` are, and each company matched at its ingest.
- The caption split into its parties (at ";", ", and", "Defendants", "et al.", "(n/k/a …)"). Each
  party is compared with the company's names for that year (`namesForYear`, as the press releases
  and the Federal Register walk do), under the longer-listed-name and shared-name guards already
  written.
- A day's releases on one company make one row; a proceeding's file number ties its steps.
- The `<time>` is an instant; the day is Washington's (`easternDay`, `lib/secPress.ts`).
- Registered in `SOURCES`, credited, and scored without the model, as the press releases are.

**Verified by:** a new check on rows pinned from 2010's pages:
- Transocean, Tidewater and Noble land on RIG, TDW and NE on 2010-11-04 (Noble's through its
  predecessor in `lib/predecessors.ts`), and Huntington's on HBAN;
- Acorn Energy's case is refused for ACFN;
- Martek's unknown purchasers, the revocation lists and a relief defendant land on no company;
- with #4, Banc of America Securities' order of 2010-12-17 lands on BAC, and Jefferies and Co.'s
  is refused for JEF;
- a closed year is not asked twice.

On main it cannot run: the adapter does not exist.

**Depends on:** the owner's yes. The units need #4; the exact names do not.

**Buildable by:** a cloud session; sec.gov answers from here (measured).

*Importance:* high — the SEC's cases against companies in every sector, most of them before 2017
· *Efficiency:* medium-high — a host, a licence and a walk already built · *Practicality:* medium —
the owner's yes first, and the namesakes a caption can carry

---

## 3. A legal form left in the everyday name: Deutsche Bank, Fresenius SE, YPF and eleven others · proposed `P1` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — by the owner, 2026-11-01.
**Owner's reason (if rejected):**

**Raised before:** Deutsche Bank's part, in batch 73 (`docs/MASTER-CHECKLIST.md:1323-1325`),
confirmed by the 2026-10-30 audit and left as an owner call. I propose it without one, for the
reason under "Why no call"; the owner may still want one. What is new: the same fault measured
across the whole index, and its cost measured on the SEC's and the Justice Department's releases.

**Anchor:** a dead end every name-based source shares. The name they ask for is one no headline,
title or caption writes.

**What:** Strip the long forms of legal suffixes the rule already strips in short:
Aktiengesellschaft (the rule strips "AG", `lib/edgarName.ts:16-17`), KGaA, Sociedad Anonima (it
strips "S.A."), S.A.A., B.V., A.S., PCL and Societas (it strips "SE"). Then extend the index-wide
check to them.

**Grounded in:**
- **Measured on the whole committed index:** 14 companies' everyday names (`commonName`) keep a
  legal form:
  - DEUTSCHE BANK AKTIENGESELLSCHAFT (DB, 287th in the index), Fresenius SE & Co. KGaA (FSNUY,
    494th), YPF SOCIEDAD ANONIMA (YPF, 641st);
  - Ottobock, Turk Altin Isletmeleri (A.S), SCHOTT Pharma, Springer Nature, InoBat, LuxExperience,
    Loma Negra, Cementos Pacasmayo (SAA), Meridian Mining UK (Societas), Com7 (PCL) and TKMS.
- **The check that should catch it does not:** "no everyday name in the committed index keeps a
  mark or a legal form" (`scripts/check-recall.ts:92-95`) passes, because its pattern knows only
  the short forms. "DEUTSCHE LUFTHANSA A G" is a case there (`:73`); "AKTIENGESELLSCHAFT" is not.
- **What each source asks for Deutsche Bank today**, from the code's own functions:
  - GDELT: "DEUTSCHE BANK AKTIENGESELLSCHAFT" (`gdeltNewsPlan`, `scripts/ingest.ts:671`);
  - the Justice Department's title search: the same (`dojQueryNames`);
  - the SEC and Federal Register title rules: the same (`companyNames`);
  - its scoring names include "aktiengesellschaft" (`companyScoringAliases`), and Wikidata gives
    it no other name (`data/company-aliases.json`).

  Fresenius SE and YPF are asked the same way, by "Fresenius SE & Co. KGaA" and "YPF SOCIEDAD
  ANONIMA".
- **The SEC's releases**, the 6,894 stored (`chronolens_b73`), replayed with the rule unchanged and
  "Deutsche Bank" as the name: 7 make it the party, 4 before 2017. Among them are 2004-120 (Deutsche
  Bank Securities, research conflicts), 2009-127 (auction-rate securities, which lands today on
  Bank of America and RBC only), 2015-99 ("SEC Charges Deutsche Bank With Misstating Financial
  Reports During Financial Crisis") and 2016-264. Under today's name: none.
- **The Justice Department's**, asked here for "Deutsche Bank": 21 titles, none containing the name
  the adapter asks. About 8 days make the bank a party:
  - "Deutsche Bank Agrees to Pay $7.2 Billion for Misleading Investors in its Sale of Residential
    Mortgage-Backed Securities" (2017-01-17);
  - its London subsidiary's LIBOR plea (2015-04-23);
  - the 2014-12-08 suit over a tax scheme;
  - "United States Sues Deutsche Bank and Subsidiary MortgageIT" (2011-05-03).

  The rest are about the bank's people (former traders, a broker, a former head of trading),
  which the rule refuses.
- **Why no call:** this is the rule's own reach, not a new name. "AG" is stripped wherever it
  stands, and "Aktiengesellschaft" is the word it abbreviates. The calls in #4 add names a
  company's record does not carry; this only finishes cleaning the one it does.
- **Nothing to re-read by hand:** the GDELT months and Federal Register years are kept by the
  names they were asked under ("months not yet asked under this query",
  `lib/ingest/newsBackfill.ts:78`; `lib/ingest/frBackfill.ts:107`), so a corrected name is asked
  afresh on its own.

**Who benefits and how:** Readers of Deutsche Bank, one of the largest foreign banks with a page
here. Its news, its Justice Department and SEC releases and its Federal Register documents are all
asked for by a phrase nobody writes. Readers of Fresenius SE, whose page batch 76 gave recalls and
little else, and of YPF. And eleven smaller listings.

**Cost:** none — no request beyond each company's usual ones.
**Effort:** small: one alternation and its cases. Two things to watch:
- "Fresenius" alone then names Fresenius SE, while "Fresenius Medical Care" stays FMC's by the
  longer-name rule (`longerListedNameIn`);
- "YPF" is under five letters, so GDELT is asked with its legal form, as Visa is
  (`docs/COVERAGE-MAP.md`, the GDELT row).

**Verified by:** cases in `check:recall`: "DEUTSCHE BANK AKTIENGESELLSCHAFT" is "DEUTSCHE BANK",
"Fresenius SE & Co. KGaA" is "Fresenius", "CEMENTOS PACASMAYO SAA" is "CEMENTOS PACASMAYO"; the
index-wide check, with its pattern extended, finds none of the 14. A `check:sec-press` case:
2015-99 lands on DB. On main the cases fail, and the extended index-wide check finds 14.

**Depends on:** nothing.

**Buildable by:** a cloud session, offline.

*Importance:* medium-high — every name-based source on a large bank's page, and two others' ·
*Efficiency:* very high — one rule · *Practicality:* high — no call, if the owner agrees it needs
none

---

## 4. The banks as the SEC names them: their securities units while they owned them, and three names for the owner · proposed `P2` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — by the owner, 2026-11-01, with the calls: (a) yes, "J.P. Morgan" and "JPMorgan" are JPMorgan's names in the release rules' map; (b) yes, a bare "UBS" is UBS Group's there; (c) yes, Credit Suisse's releases come off GLDI. All three in the release rules' own map only, never in the names headlines are scored by.
**Owner's reason (if rejected):**

**Raised before:** JPMorgan's "J.P. Morgan" and UBS Group's missing "UBS" (batch 73,
`docs/MASTER-CHECKLIST.md:1317-1322`), and Credit Suisse's 7 releases on GLDI (batch 78,
`:1052-1055`). All three are still owner calls. What is new: each is measured on all 6,894 stored
releases, and beside them the units, which need no call.

**Anchor:** a capability present in three maps and missing in a fourth. The FDA, Federal Reserve
and NHTSA maps count a unit the company owned while it owned it ("A unit the company sold stops
counting the day it left", `lib/fedActions.ts:51`; `lib/fdaRecalls.ts:78`; `RecallMaker.to`). The
SEC's and the Justice Department's rules know a company only by the names its own record carries,
so "Units named otherwise ('J.P. Morgan Securities', 'Banc of America Securities') are not reached"
(`docs/MASTER-CHECKLIST.md:5277-5279`).

**What:**
- **No call:** a dated map of the units the SEC charges by name, read only by the release rules
  (the SEC's press releases, #2's captions, the Justice Department's releases). Each day comes from
  the company's own filings, as the other maps' days do:
  - Bank of America: Banc of America Securities, Investment Services and Capital Management, and
    Merrill Lynch from its purchase;
  - Wells Fargo: Wachovia from its purchase;
  - JPMorgan Chase: J.P. Morgan Securities, and Bear Stearns from its purchase;
  - Citigroup: Citigroup Global Markets, and Smith Barney until it went into the joint venture;
  - Morgan Stanley: Morgan Stanley Smith Barney from that venture's start;
  - Regions: Morgan Keegan while it owned it.
- **Three calls, all raised before:**
  - (a) "J.P. Morgan" and "JPMorgan" as JPMorgan Chase's names;
  - (b) the bare "UBS" as UBS Group's name, and "Credit Suisse" from UBS's purchase of it;
  - (c) the banks' releases kept off the two notes records, AMUB (UBS AG's) and GLDI (Credit
    Suisse AG's), as batch 74 kept their Fed actions off.

**Grounded in:**
- **Measured:** the 6,894 stored releases (`chronolens_b73`) replayed with `secReleaseNamesParty`
  unchanged, each company's names of today (and JPMorgan's former name), and the names below
  inside sizing windows; the real days come from the filings:

  | Bank | Names added | On its page today | Added | Of them before 2017 |
  |---|---|---:|---:|---:|
  | Bank of America | Banc of America Securities, Investment Services, Capital Management; Merrill Lynch from 2009-01-01 | 8 | 20 | 12 |
  | JPMorgan Chase | J.P. Morgan Securities · call (a) | 2 | 3 · 8 | 2 · 4 |
  | Citigroup | Citigroup Global Markets; Smith Barney until 2009-06-01 | 10 | 3 | 2 |
  | Morgan Stanley | Morgan Stanley Smith Barney from 2009-06-01 | 14 | 3 | 0 |
  | Regions | Morgan Keegan, 2001-06-29 to 2012-04-02 | 0 | 3 | 3 |
  | Wells Fargo | Wachovia from 2008-12-31 | 9 | 1 | 1 |
  | UBS Group | call (b) | 0 | about 18, read by hand | about 14 |

  The units add 33 releases (20 before 2017), call (a) 8 more and call (b) about 18. With #3's
  Deutsche Bank, about 66 on 8 banks, beside the 201 on 122 companies today.
- **Examples:**
  - "Banc of America Capital Management, BACAP Distributors and Banc of America Securities to Pay
    $375 Million…" (2005-16);
  - "Merrill Lynch to Pay $415 Million for Misusing Customer Cash…" (2016-128);
  - "Morgan Keegan to Pay $200 Million to Settle Fraud Charges Related to Subprime Mortgage-Backed
    Securities" (2011-132);
  - "J.P. Morgan to Pay $153.6 Million to Settle SEC Charges of Misleading Investors in CDO…"
    (2011-131);
  - "UBS Agrees to Pay $200 Million…" (2009-29).
- **What stays out under the rule unchanged:**
  - before the purchase: Merrill Lynch's Enron charge of 2003 and its auction-rate settlement of
    2008, Wachovia's of 2004 and 2008, Bear Stearns' of 2006;
  - people: "SEC Charges Two J.P. Morgan Traders…" (2013-154), "Former Countrywide Executives"
    (2009-129).
- **Why (a) and (b) are calls:** a hand-added name goes everywhere — news, scoring, the Justice
  Department search — through `newsNamesFor` (`scripts/ingest.ts:448`), the one place CLAUDE.md
  allows.
  - JPMorgan's scoring names already include "jpmorgan" (`companyScoringAliases`), so its headline
    scoring would not change. Its GDELT query would, and a "JPMorgan" headline can be about
    another company's stock, with the bank as its analyst; I did not measure how often.
  - Bare "UBS" today names UBS AG's notes record and is outranked there by UBS Group
    (`outrankingNameFor`), so neither page takes it. UBS AG is left out of UBS Group's history on
    purpose (`lib/predecessors.ts:20-21`).
- **(c), measured:** GLDI carries 7 Credit Suisse releases today, from 2012-11-16 to 2021-10-19
  (the audit's list). Off the notes record they sit on no page, since Credit Suisse Group is not in
  the index. Only a release after 2023-06-12 would be UBS's ("Credit Suisse Entities to Pay $10
  Million…", 2023-12-13).
- **The Justice Department, asked here:** "Merrill Lynch" has 5 titles, one of them a party
  (Merrill Lynch Commodities, 2019-06-25); "J.P. Morgan" 4, none; "Banc of America" 1, none. Its
  gain is Deutsche Bank's (#3).
- The map is not a list of names to score headlines by; CLAUDE.md's one place stays
  `companyScoringAliases`. It is the release rules' own map, as `FED_BANKS` is the Fed adapter's.

**Who benefits and how:** Readers of the largest banks, whose SEC cases were mostly brought against
their securities units:
- Bank of America's page goes from 8 SEC releases to 28;
- JPMorgan's goes from 2 to 5, or 13 with call (a);
- UBS Group's goes from none to about 18 with call (b);
- Regions gains Morgan Keegan's three cases of 2009–2011.

#2's captions name the same units exactly.

**Cost:** none — no request; the releases are stored.
**Effort:** small to medium. About a dozen rows, each day from a filing, as batch 74 dated its
banks' purchases; the release rules read them for the year; (a) to (c) as the owner calls them.

**Verified by:** `check:sec-press` cases on the stored rows:
- Banc of America Securities' charge of 2010-12-07 (2010-239) lands on BAC;
- Merrill Lynch's 2016-128 lands on BAC, and its 2003-32 does not;
- Morgan Keegan's 2011-132 lands on RF;
- "Two J.P. Morgan Traders" lands nowhere;
- by the calls, 2011-131 lands on JPM, 2009-29 on UBS, and nothing on GLDI.

Then the whole stored listing replayed against the index with its count pinned, as the 2026-10-30
audit suggested to the scout (`docs/audits/2026-10-30-code-audit.md:211`), so the change shows its
full effect. On main the unit cases fail.

**Depends on:** nothing for the units; the owner's three calls for (a) to (c).

**Buildable by:** a cloud session: the press releases offline, the purchase days from EDGAR.

*Importance:* medium — tens of releases, on the most-read financial pages · *Efficiency:* high —
rows on a rule that exists, no request · *Practicality:* medium — three calls, though the units
need none

---

## 5. The Federal Reserve Board's own announcements about a bank: its approvals since 2006 — a source for the owner to decide · proposed `P2` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — by the owner, 2026-11-01: yes to the source.
**Owner's reason (if rejected):**

**Anchor:** data served by a host the site already reads, and not read. The Board's enforcement
files and FOMC statements come from federalreserve.gov. Its press-release feed, which announces by
name each approval of a bank's acquisition, does not · a dead end on bank pages: a deal carries
its 8-Ks, not the approval that let it close.

**What:** The owner's decision first. If yes: read the Board's press-release feed once a day, one
file for every bank. On a bank's page, keep an "Orders on Banking Applications" release whose
applicant is the bank, and a policy release that names the bank as the one acted on (its capital
plan objected to, its rescue). The existing map's rule holds: a bank's own history counts, an
acquisition's past does not.

**Licence:** "Unless otherwise indicated, information on Board's website is in the public domain
and may be copied and distributed without permission. Please cite to the Board as the source of
the information." (federalreserve.gov/disclaimer.htm, read 2026-10-26, quoted for the enforcement
files at `lib/ingest/store.ts:318-320`; not re-read for this run.) No key.

**Grounded in:**
- **The feed:** `https://www.federalreserve.gov/json/ne-press.json`, 1.0 MB, 4,650 releases from
  2006-01-10 to 2026-10-29. Each has its day (most with a time), title, type and link. By type:
  Enforcement Actions 1,335, Banking and Consumer Regulatory Policy 1,103, Monetary Policy 1,076,
  Other Announcements 672, Orders on Banking Applications 463.
- **Measured:** of the 463 orders, **157 name an index company as the applicant** by its exact
  everyday name, 83 of them before 2017, on 89 companies:
  - "Approval of proposal by Wells Fargo & Company to acquire Wachovia Corporation" (2008-10-12);
  - "…by Bank of America to acquire Merrill Lynch" (2008-11-26);
  - "…by Mitsubishi UFJ Financial Group to acquire voting shares of Morgan Stanley" (2008-10-06).

  PNC has 7, Huntington 6, Bank of America 5, and TD, Capital One, Scotiabank, Old National and
  Ameris 4 each; the other 81, most of them regional banks, have one to three.
- **Namesakes:** among the 157, "Approval of proposal by Fortis" (2007-12-04) is the Belgian
  bank, not Fortis Inc. (FTS). A looser first match also took "Banco Popular Español"
  (2006-02-08) for Popular, Inc., and Michigan's "Citizens Banking Corporation" (2006) for
  Citizens, Inc. The 157 need reading by hand, as batch 73's 209 were.
- **Policy releases naming a large bank:** 34, 21 before 2017. They include:
  - the joint statement on Citigroup (2008-11-23);
  - "Treasury, Federal Reserve, and the FDIC Provide Assistance to Bank of America" (2009-01-16);
  - Goldman Sachs and Morgan Stanley's applications to become bank holding companies (2008-09-21);
  - the capital plans, among them "…requiring Bank of America Corporation to resubmit its capital
    plan and to suspend planned increases in capital distributions" (2014-04-28).

  I counted these by a list of names, not by a rule.
- **Most releases carry their time** ("10/29/2026 4:30:00 PM"), so batch 68's after-the-close
  mark applies, as it does for a filing. 468, all before 2017, give a day only ("1/2/2008").
- **Popular, Inc.** (BPOP) is missing from the Fed map (batch 74,
  `docs/MASTER-CHECKLIST.md:1249-1251`; raised before). Its order of 2010-04-30 ("…approves
  Banco Popular de Puerto Rico to acquire assets and assume liabilities of Westernbank Puerto
  Rico") is in the feed, beside its three actions in the files. One row in `FED_BANKS` would serve
  both.
- Not measured: the Board's orders before 2006, which its site keeps on yearly pages.

**Who benefits and how:** Readers of about 90 listed banks, most of them regional banks whose pages
carry little beyond their filings. They get the day the Board let a deal close, a few per bank.
Readers of the largest banks also get the Board's 2008–2014 announcements about their rescues and
their capital plans.

**Cost:** none recurring — one request of about 1 MB a day for every bank, no key.
**Effort:** small to medium:
- a parser for the feed;
- the applicant read from "by X" in the title, and matched as the Federal Register company titles
  are (`lib/frCompany.ts`'s rules, the longer listed name owning the mention);
- policy releases through the same party rule;
- the 157 and 34 read by hand;
- registered in `SOURCES`, credited, scored without the model.

**Verified by:** a new check on rows pinned from the feed:
- Wells Fargo's approval of 2008-10-12 lands on WFC;
- Bank of America's of 2008-11-26 lands on BAC;
- MUFG's of 2008-10-06 lands on MUFG and Morgan Stanley;
- "Fortis" is refused for FTS, and "Banco Popular Español" for BPOP;
- the capital-plan release of 2014-04-28 lands on BAC;
- an approval released after the close carries its time, and a 2008 release with a day only
  carries none.

On main it cannot run: the adapter does not exist.

**Depends on:** the owner's yes.

**Buildable by:** a cloud session; federalreserve.gov answers from here (measured).

*Importance:* medium — a few events per bank, on many thin bank pages · *Efficiency:* high — one
file a day · *Practicality:* medium-high — the owner's yes, and a hand read of 191 matches

---

## Considered and cut

- **CFPB enforcement actions** (consumerfinance.gov): its list holds 386 actions. Its first page of
  25 names, among others, American Honda Finance, Equifax, Block, Capital One, Walmart, Bank of
  America, JPMorgan Chase Bank, Wells Fargo Bank, Comerica, Apple, Goldman Sachs Bank USA and TD
  Bank. The Bureau opened in 2011, so its reach before 2017 is five or six years at most. I read
  one page, and not its licence. A measured proposal for the next run, if the owner wants
  consumer-finance depth; it would want #4's unit map.
- **Other forms in the three quarters, routine or repeats:**
  - ARS (353 and 359 a quarter in 2003 and 2007, one a company): the annual report to
    shareholders, a second annual row beside the 10-K's;
  - 11-K and S-8 (employee plans); FWP (banks' term sheets, 853 in 2007 Q2); 13F-HR (an investor's
    holdings);
  - PRE 14A (the draft of the DEF 14A kept); S-1/A, S-3/A, S-4/A and POS AM (amendments of
    registrations kept);
  - 8-A12B and CERTNYS (listings of classes, mostly debt, as the 2026-10-28 run found); REGDEX,
    EFFECT and NO ACT; the utility holding-company forms (U-1, 35-CERT, U5S); the fund forms NSAR
    and N-Q, which the owner did not pick on 2026-10-29;
  - SC TO-I/A (70 rows on 27 companies in 2003 Q2): the amendments of a company's own offer, not
    kept for SC TO-I either;
  - DEFS14A (6 special-meeting proxies in 1998 Q2) and the 10-KT and 10-QT transition reports (2
    or 3 a quarter): too few to matter.
- **The Board's orders before 2006:** on yearly pages, unmeasured; a follow-up to #5 if approved.
- **FDIC BankFind's structure history** (every merger a bank absorbed, back decades): it would reach
  regional banks' deals before EDGAR, but tying an FDIC certificate to a listed holding company
  needs a map no free source keeps by CIK. Not measured.
- **Raised before, not ranked here:**
  - Fresenius Vial's one recall of 2017: still no filing ties it to either Fresenius company
    (`docs/MASTER-CHECKLIST.md:1177`);
  - the Form 25 and 25-NSE labels (`lib/secForms.ts:157-158`): a labelling question for the
    `code-auditor`, not a coverage gain.
- **Re-prioritisations:** none. The open items nearest securities depth (the GDELT backfill's
  production watch, the 203 held-back everyday-word names, the paid-tier evidence) still need the
  production host or a key.
- **Anything touching another product:** nothing here reads, references or connects to another
  product's repository.

*One closing note, not a proposal* — noticed in passing and not investigated: Deutsche Bank's
scoring names are "deutsche", "aktiengesellschaft", "deutsche bank aktiengesellschaft" and "db"
(`companyScoringAliases`; #3 would change them), so whether a headline about another "Deutsche"
company scores for it depends on that company's longer name being in the index. The
`code-auditor` may want it.
