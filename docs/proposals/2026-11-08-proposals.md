# Opportunity proposals — 2026-11-08

**Commit:** 5dc9b26527b8efb9509688a4dbf3f8ad5b513525 (`claude/lucid-goodall-6km6ea`, equal to `origin/main` after batch 118) · **Reviewed:** `CLAUDE.md`; `README.md` (the regulator sections, "Data sources", "Sources evaluated and rejected"); `docs/MASTER-CHECKLIST.md` (the batch 104 and 112–118 ledgers, Scope refocus and its open boxes, the legend); `docs/COVERAGE-MAP.md`; `docs/OWNER-ACTIONS.md`; `docs/proposals/2026-11-07-proposals.md` whole, the "Considered and cut" sections of 2026-07-30, 10-17, 10-26, 10-28, 11-01, 11-02, 11-05 and 11-06, and the 2026-10-22 shortlist's "Not shortlisted"; code: `lib/epaCases.ts` (`readCases`, `UNITS`, `epaParty`, `ownRow`, `epaEvents`), `lib/recalls.ts` (`RECALL_MAKERS`, `recallEvents`), `lib/fdaRecalls.ts` (`FDA_FIRMS`), `lib/doj.ts` (`dojEvents`), `lib/releaseNames.ts`, `lib/takenNames.ts`, `lib/edgarName.ts` (`legalSpellings`); data: `data/edgar-tickers.json`; fixtures: `doj-archive-months.json.gz`, `cpsc-recalls.json.gz`, `sec-cases-all.json.gz`, `nhtsa-recalls.json` · **Proposals:** 3

> - **No rejection log exists** (`docs/audits/rejected-proposals.md`), and nothing has been
>   rejected. Every proposal of 2026-11-07 is approved and built (batches 113–115), the 2026-11-07
>   audit's findings are fixed (batch 116), and batches 117–118 built the table of taken names. Nothing
>   carries forward and nothing was deferred.
> - **Owner calls already open, not raised again:** DuPont's past on DD's page; "Drugs whose holder
>   changed" and its two hand lists (OWNER-ACTIONS); JCI's 2016 case on Tyco's record; GE Capital
>   Retail Bank on GE; PayPal's 2015 CFPB action on eBay; whether the Digest keeps the first-price
>   floor; the Digest's names older than EDGAR's (Caterpillar Tractor). The recorded leftovers are not
>   proposals either: FBP's 2007 litigation release, the 9 pre-2000 CPSC recalls naming plain "Toro",
>   BP Amoco Chemical's rows after the 2020 INEOS sale, and Savannah Electric's and PSNH's four cases
>   waiting for www.sec.gov.
> - **Two proposals reopen items earlier runs set aside,** and say what changed:
>   - #1 is the follow-on the 2026-11-07 file named in its cut list ("pipelines … and conglomerates'
>     named companies … A follow-on to #3 if it is approved"). #3 was approved and built (batch 114).
>     It is measured here for the first time.
>   - #2(b) reopens "Splitting a case by settlement is a larger build, not proposed" (2026-11-07 #1),
>     for the cases all of whose defendants are the page's own. What changed: it is measured, and the
>     measure shows those rows dated by a later amendment, with no penalty, as the 2026-11-07 closing
>     note suspected (Wisconsin Electric's, Virginia Electric and Power's).
> - **Saved data used instead of the network:** batch 95's copy of EPA's case file (2026-10-31,
>   137,103 cases as `readCaseFile` reads them, all 22 tables); the committed fixtures named above;
>   first trading days saved by batches 103, 112, 115 and 117; EDGAR former-name lists saved by
>   earlier batches (413 records). Each was read as data, with `python3 -I`, or through the
>   repository's own functions from scripts in the session scratchpad (`b119/scripts/`).
> - **Measured live on 2026-11-07 and 11-08 from this container.** Every figure below is measured
>   unless it says it is an estimate. Requests, by host:
>   - data.sec.gov 17: the filing lists of 17 records, for their former names (#1);
>   - query1.finance.yahoo.com 15: first trading days (#1);
>   - data.transportation.gov 2: NHTSA's recalls of 10,000 or more, counted by maker, and the rows of
>     42 unmapped makers (#3);
>   - download.open.fda.gov 3 and api.fda.gov 1: openFDA's drug, food and device enforcement files
>     and their index (cut, below);
>   - www.nrc.gov 3: a redirect, the enforcement index and its letter E page (cut);
>   - api.us.socrata.com 1: DOT's catalog, searched for pipeline incident data, which holds none
>     (cut);
>   - www.phmsa.dot.gov 1 and www.ferc.gov 1, both refused (cut).
>
>   That is 44 requests: 41 answered 200, 1 a redirect (301), and 2 a refusal (403). Each carried the
>   User-Agent `News Charts Research`, with no email address, at least 1.1 s after the one before. No
>   www.sec.gov page was asked, and neither was GDELT, Wikipedia, Wikidata, the Federal Register or
>   the Justice Department. Postgres was not used and the app was not run. The log is in the session
>   scratchpad (`b119/requests.log`).
> - **Nothing here needs a key, a paid tier or a recurring charge.** #1 adds rows to two lists built
>   sources already read (`UNITS`, the release map) and one spelling to the caption rule. #2 reads days
>   from two tables of the zip the monthly walk already downloads. #3 adds makers to NHTSA's map: a
>   maker added to a mapped company adds no request, and each of about 14 new companies adds one a day.
> - Ranked by importance, securities depth first:
>   1. EPA's cases under 28 more companies' own operating units: BNSF on Berkshire, Pratt & Whitney
>      and Carrier on RTX, AlliedSignal's on Honeywell, Valero Refining, Enbridge Energy, American
>      Honda, Kennecott on Rio Tinto;
>   2. EPA's own days on the cases pages already hold: the day the suit was filed, and each
>      settlement of a case that is all the company's;
>   3. the NHTSA recalls filed under makers listed companies own and the map lacks: Graco's child seats
>      on Newell, Dana, Lippert on LCI, Hino on Toyota, Kelly-Springfield on Goodyear.

Mark each proposal below: `APPROVED`, `REJECTED`, or `DEFERRED`, and add a
reason for anything rejected. Then run the scout in FILE mode.

---

## 1. EPA's cases under 28 more companies' own operating units: BNSF on Berkshire, Pratt & Whitney and Carrier on RTX, AlliedSignal's on Honeywell, Valero Refining, Enbridge Energy, American Honda, Kennecott on Rio Tinto… · proposed `P1` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — by the owner, 2026-11-08: "All three", and on its two calls "Yes, both as drafted": Pharmacia LLC counts on Pfizer's page from 2003, and MidAmerican Energy as Berkshire's from 2006-02-09. Parts (a) and (b) built in batch 120, every ownership day read from a filing: 906 cases and 818 rows more on 41 pages from first prices, none fewer. Part (c) built in batch 121: 288 unit names on 74 companies in the release map (`OPERATING_UNITS`), each on its EPA days; 54 more Justice Department releases on 23 pages from first prices, 14 of 2001–2008 and 40 from the API's years, which batch 121 found unread since the API stopped reading `parameters[title]`, now asked by `title`.
**Owner's reason (if rejected):**

**Raised before:** as lines, never measured.
- The 2026-11-07 file's cut list: "Other units in EPA's file, not measured: pipelines (El Paso
  Natural Gas and Tennessee Gas on Kinder Morgan from 2012, Texas Eastern on Enbridge from 2017),
  and conglomerates' named companies (BNSF on Berkshire from 2010; Pratt & Whitney, Otis, Carrier and
  Sikorsky on RTX's record, each to its separation). A follow-on to #3 if it is approved."
- Batch 104's "Left for later": "the other ~630 companies with EPA rows, whose units no one has read".
- Batch 114's "Left as it is": the Justice archive's titles naming the utilities' units are not in
  the release map, and "whether today's rule gives them to the parent was not replayed".

**Anchor:** a gap inside one source. `UNITS` (`lib/epaCases.ts`) reads the operating units of 65
companies. The caption rule refuses a name followed by words that are not legal words, as it should,
so "BNSF Railway Company", "Valero Refining-Texas, L.P.", "Enbridge Energy, Limited Partnership" and
"Schlumberger Technology Corporation" are no page's. From first prices, with today's code and the
companies' EDGAR former names, these pages hold:
- Berkshire Hathaway 0 EPA rows, TotalEnergies 0, Honda 0, Molson Coors 0, TC Energy 0, AB InBev 0;
- Enbridge 1, Rio Tinto 1, Sysco 1, LyondellBasell 1;
- Valero 11 and Kinder Morgan 10, against ExxonMobil's 288.

**What:** three parts, each approvable alone.
- **(a) The units,** about 100 patterns on 28 companies, each between the days its owner held it, read
  from EDGAR as batches 104 and 114 read theirs. My draft, with the days my estimates, to be read from
  filings at the build:

  | Company | Units (from or to, where not its own throughout) | Rows from first price, before → after | Court or penalty cases added (before 2017) |
  | --- | --- | --- | --- |
  | Honeywell | AlliedSignal's companies, its record's own; old Honeywell's from 1999-12-01 | 156 → 246 | 65 (60) |
  | Berkshire Hathaway | Shaw from 2001-01-08, Johns Manville 2001-02-27, Benjamin Moore 2000-12-18, McLane 2003-05-23, Fruit of the Loom 2002-04-30, Clayton 2003-08-07; MidAmerican Energy, Northern Natural Gas and Kern River 2006-02-09; PacifiCorp 2006-03-21; Marmon 2008-03-18; BNSF 2010-02-12; Lubrizol 2011-09-16; NV Energy's 2013-12-19; Precision Castparts 2016-01-29 | 0 → 80 | 39 (23) |
  | RTX | Pratt & Whitney, Hamilton Sundstrand and United Technologies' divisions; Sikorsky to 2015-11-05; Otis and Carrier to 2020-04-02; UT Automotive to 1999-05-04; Goodrich from 2012-07-26; Rockwell Collins 2018-11-26; Raytheon Company 2020-04-03 | 45 → 121 | 44 (38) |
  | Valero | its refining companies; Ultramar Diamond Shamrock from 2001-12-31; Premcor 2005-09-01 | 11 → 57 | 36 (30) |
  | Pfizer | Warner-Lambert and Parke-Davis from 2000-06-19; Pharmacia and Upjohn 2003-04-16; Wyeth 2009-10-15 | 59 → 105 | 31 (20) |
  | Sysco | its operating companies ("Sysco Food Services of Dallas") | 1 → 30 | 26 (17) |
  | Westlake | its vinyls, polymers and petrochemicals companies; Axiall and Georgia Gulf from 2016-08-31 | 3 → 35 | 21 (6) |
  | TotalEnergies | Total Petrochemicals USA; Fina from 1999-06-01; Atofina 1999-06-01 to 2006-05-17 | 0 → 34 | 20 (19) |
  | Williams | Transco, Northwest Pipeline, Williams Field Services and its other companies | 6 → 36 | 19 (16) |
  | Tyson | Tyson Fresh Meats, Poultry, Farms; IBP from 2001-09-28; Hillshire 2014-08-28 | 37 → 60 | 19 (12) |
  | LyondellBasell | Equistar, Lyondell, Houston Refining, Millennium (from its first price, 2010-04-28) | 1 → 26 | 18 (9) |
  | Republic Services | its companies; Allied Waste and BFI from 2008-12-05 | 3 → 33 | 18 (13) |
  | Rio Tinto | Kennecott, U.S. Borax | 1 → 38 | 17 (15) |
  | Kinder Morgan | its companies and SFPP; El Paso's pipelines from 2012-05-25 | 10 → 36 | 17 (8) |
  | Mosaic | Mosaic Fertilizer and Phosphates, IMC and Cargill Fertilizer, from 2004-10-22 | 3 → 22 | 12 (8) |
  | Freeport-McMoRan, PepsiCo, Schlumberger, Enbridge | Freeport's companies, Phelps Dodge's and Cyprus Amax's from 2007-03-19; Frito-Lay, Quaker Oats from 2001-08-02, Pepsi Bottling from 2010-02-26; Schlumberger Technology, Smith from 2010-08-27, Cameron 2016-04-01; Enbridge Energy, Spectra's pipelines from 2017-02-27 | 5→25, 3→22, 4→20, 1→12 | 11 (9), 11 (8), 8 (8), 8 (5) |
  | Nine more | Molson Coors (Coors Brewing), Textron (Bell Helicopter, Cessna from 1992-02-28), Huntsman, TC Energy (ANR from 2007-02-22, Columbia Gas Transmission 2016-07-01), Honda (American Honda), Deere (John Deere), CVS (CVS Pharmacy), AB InBev (Anheuser-Busch from 2008-11-18), Cleveland-Cliffs (AK Steel 2020-03-13, ArcelorMittal USA 2020-12-09) | 0→9, 59→71, 2→18, 0→9, 0→5, 14→26, 4→10, 0→5, 0→2 | 7 (6), 6 (6), 5 (2), 5 (2), 4 (4), 4 (4), 4 (2), 4 (0), 2 (0) |

- **(b) A name with "&" read with "and" too,** as batch 111 reads a legal form in both spellings
  (`legalSpellings`, `lib/edgarName.ts`). EPA writes "Goodyear Tire and Rubber Company" and "Air
  Products and Chemicals, Inc."; the companies' names hold "&".
- **(c) The same units' names in the release map** (`lib/releaseNames.ts`), on their days, for the
  Justice Department's rule.

**Licence:** no new source. EPA's case file was approved on 2026-11-05 with both of EPA's texts in
front of the owner; the Justice Department's releases are public domain (justice.gov/legalpolicies,
quoted in `lib/doj.ts`).

**Grounded in:**
- **The replay.** EPA's whole file, through `epaEvents` with today's code. Each company is read from
  its first price: Yahoo's first trading days, 13 read today and 15 saved. It is read under its EDGAR
  former names, 15 lists read today and 8 saved; the other five (Molson Coors, Textron, Deere, AB
  InBev, Cleveland-Cliffs) were read without them. A case already on the page by today's rules is
  left out: before → after compares case numbers.
- **(a) The gain:** 847 cases on 28 companies, 765 more rows.
  - 481 of the cases are a court case or a penalty, 350 of them before 2017. 297 carry a penalty, 15
    of them $1 million or more.
  - 7 companies with no EPA row gain some: Berkshire 80, TotalEnergies 34, Molson Coors 9, TC Energy
    9, Honda 5, AB InBev 5, Cleveland-Cliffs 2.
  - No case comes off any page: a unit adds only to its owner.
- **(a) What they include,** none of them on any page today:
  - Enbridge Energy's decree of 2016-07-20, $62,000,000 (05-2011-7061): the Marshall, Michigan, and
    Romeoville spills;
  - American Honda's of 1998-06-03, $10,100,000 (HQ-1998-0104);
  - Valero Refining's national refinery decree of 2005-06-16, $3,592,308;
  - Mosaic Phosphates' of 2015-09-30, $3,900,000; Equistar and Lyondell's of 2021-10-13, $3,400,000;
    Honeywell Resins & Chemicals' of 2013-03-28, $3,000,000;
  - Atofina's of 2001-12-28, $1,900,000, on TotalEnergies; BNSF's of 2021-12-17, $1,513,750; Transco's
    of 2002-02-01, $1,400,000.
- **(a) Read by hand,** for false matches:
  - a fixed random sample of 40 of the gained court or penalty cases (one of them Goodyear's, now part
    (b)). Every one names the owner or its unit inside the draft days. 10 are Superfund or other
    multi-party cases where the unit is one party of many (Omega Chemical, Lakeland Disposal, Sutton
    Brook);
  - the most frequent names of every pattern, on the whole file. The patterns refuse "Sikorsky
    Autowerk", "Huntsman, A. Blaine Jr." and "Diamond Shamrock Chemical", which went to Occidental
    in 1986.
- **(b) The spelling,** replayed the same way on the companies whose names hold "&":
  - EPA: 112 cases, 63 of them a court case or a penalty, 58 before 2017, on 11 companies. Air
    Products 55 (29), Goodyear 33 (21), Deere 6, International Flavors & Fragrances 6, Central Garden
    & Pet 4, Babcock & Wilcox 3, and one each for Merck, Aimco, Chicago Rivet and Connecticut Light and
    Power. Air Products' first price was not read, so its 55 are before the floor.
  - the CPSC's recalls: 4, on Stanley Black & Decker, Bath & Body Works, Academy Sports and Outdoors
    and John Wiley & Sons. Academy's, of 2003, predates its listing of 2020, whose first price was not
    read. The SEC's case captions: none.
  - **One is wrong:** "AT AND T", a 1993 order. It is AT&T Corp.'s, before T's record took the name,
    and the table of taken names reads only "AT&T".
- **(c) The Justice archive** of 2001–2008 (committed fixture), through `dojEvents` with about 40 unit
  names: 12 releases on 8 pages that hold none of them today.
  - PSEG Fossil's settlements of 2002-01-24 and 2006-11-30;
  - Ohio Edison's "Landmark Clean Air Act Case" of 2005-03-18, and the 2003-08-07 statement on the
    court's ruling against it;
  - FirstEnergy Nuclear Operating Company's $28 million of 2006-01-20 (Davis-Besse);
  - Wisconsin Electric's of 2003-04-29; Pratt & Whitney's $52 million of 2008-08-01; Dominion
    Exploration & Production's of 2003-02-07; Valero Refining-Texas's of 2008-06-10;
  - Mobil's of 2004-08-03 and 2005-04-08 on ExxonMobil; Atlantic Richfield's $187 million Montana
    Superfund settlement of 2008-02-07 on BP.

  The rule gives none to Illinois Power's "Settlement of Illinois Power Case" (2005) or "Partial
  Settlement with Alabama Power" (2006). The display names in `UNITS` ("Southern's operating
  companies") are no use to a title; the build needs the units' own names. The API's years, 2009 on,
  were not measured: they need justice.gov.

**Who benefits and how:** Readers of 28 large companies' pages: Berkshire, RTX, Honeywell, Pfizer,
Valero, Tyson, Kinder Morgan, Williams, Enbridge, Rio Tinto, TotalEnergies. EPA's record of their
railroads, refineries, pipelines, mines and plants reaches their pages, from nothing for seven of
them. The largest cases are among the most material events these pages can hold, Enbridge's $62
million decree first.

**Risk:**
- **The days are my reading,** from memory of the deals; each must be read from a filing at the build.
  Two need the owner:
  - **Pharmacia LLC on Pfizer.** Pharmacia LLC is the old Monsanto Company's legal entity, Pfizer's
    since 2003, but Monsanto's successors carry its environmental liabilities by contract. 37 of
    Pfizer's gained cases name it, PCB sites among them. On Pfizer's page from 2003, as the unit rule
    reads it, or left off.
  - **MidAmerican Energy.** Berkshire held about 80% of it from 2000-03-14 but under 10% of the vote
    until 2006. The draft counts it from 2006-02-09.
- **A Superfund unit is one party of many:** "Also on" already says so on such a row.
- **(b) needs the taken table to read "and" too,** or AT&T Corp.'s 1993 order reaches T.

**Cost:** none; the file is already read every month.
**Effort:** medium:
- (a) about 100 patterns and about 47 days to read from data.sec.gov filing lists (estimates);
- the slice rebuilt with the new keys' cases, and the replay counts re-pinned;
- (b) one spelling beside `legalSpellings`, read by the taken-name table too;
- (c) about 40 release-map entries.

**How to check:** new `check:epa-cases` cases on the slice:
- Enbridge's 2016 decree (05-2011-7061) lands on ENB;
- American Honda's of 1998 (HQ-1998-0104) lands on HMC;
- BNSF's of 2021 (07-2019-0252) lands on BRK-B, and a BNSF case before 2010-02-12 on no page;
- Sikorsky's of 2006 (01-2006-1005) lands on RTX, and a Sikorsky case after 2015-11-05 on none;
- a Premcor case of 2002 lands on no page, and Premcor's of 2007 on VLO;
- "Air Products and Chemicals" lands on APD, and "AT AND T" of 1993 on no page.

Also a `check:doj` case: Ohio Edison's release of 2005-03-18 and Davis-Besse's of 2006-01-20 land on
FE. On main the new cases fail: none of these units is in `UNITS`.

**Depends on:** nothing. (c) reads better after (a), whose names it reuses.

**Buildable by:** a cloud session; the saved file, the slice and data.sec.gov are enough.

*Importance:* high — 481 court or penalty cases, 350 before 2017, on 28 large companies, seven of them
empty in this source today · *Efficiency:* high — lists a built source already reads · *Practicality:*
medium — about 47 ownership days to read from filings, and two owner calls inside

---

## 2. EPA's own days on the cases pages already hold: the day the suit was filed, and each settlement of a case that is all the company's · proposed `P2` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — by the owner, 2026-11-08: "All three". Next, in batch 122.
**Owner's reason (if rejected):**

**Raised before:**
- (a), the suit's day: never.
- (b), the settlements: yes. The 2026-11-07 file left "the 44 cases of several settlements and no
  case total" as they were: "Splitting a case by settlement is a larger build, not proposed." Its
  closing note asked whether Wisconsin Electric's and Virginia Electric and Power's rows "take the
  later day, which may be a later amendment's". Batch 112 handed the note "for the next audit"; the
  audit of batches 108–115 did not take it up.

**What changed:** measured. For the cases all of whose defendants are the page's own, a settlement's
party is never in doubt, and each settlement carries its own lodged day in EPA's table.

**Anchor:** data collected and never surfaced. `readCases` (`lib/epaCases.ts`) reads the milestone
"Complaint Filed With Court" (CMF) and uses it only when a court case has no settlement day. From
`CASE_ENFORCEMENT_CONCLUSIONS.csv` it reads each settlement's penalty and work, never its own
`SETTLEMENT_LODGED_DATE`. So a court case has one row, on the day EPA's milestones give the
settlement:
- AEP's national New Source Review suit was filed on 1999-11-03 and settled on 2007-10-09. Its page
  holds 2007 only.
- Wisconsin Electric's case holds a settlement lodged 2003-07-10, with a $3,100,000 federal and
  $100,000 state penalty and $620,000,000 of work ordered. Its row is dated 2014-07-08, the lodging of
  a later amendment, and shows no penalty, since a case of several settlements keeps only its case
  total, which EPA leaves blank.

**What:** two parts, each approvable alone.
- **(a) The day the suit was filed.** A court case filed more than 30 days before its first settlement
  gets a second row on the filing day: "EPA suit filed in court (Clean Air Act)", the wording `what()`
  already gives a filed case, with the case's name, the page's defendants and the case report link.
  - It carries no penalty: the money stays on the settlement's row.
  - The rule's tests apply on the filing day: a unit counts only if its owner held it then.
  - It is kept only where the page's own that day are every defendant, or at least half of fewer
    than 10 (my threshold; the owner may widen it).
- **(b) Each settlement of a case that is all the company's** on its own lodged day, with its own
  penalty and work ordered. A case of several parties keeps one row, as now.

**Licence:** no new source; two more columns of a table already read, and a milestone already read.

**Grounded in:**
- **The replay:** the same file and method as #1. 7,899 rows on 679 companies before first prices,
  the coverage map's count, joined to each case's milestones and settlements. From first prices where they
  were read (60 of the 85 pages below); the other 25 pages keep their rows unfloored.
- **(a) Suits filed more than 30 days before their first settlement,** where on the filing day the
  page's own are every defendant, or at least half of fewer than 10:
  - 178 cases on 85 pages, 168 before 2017, 128 before 2001;
  - 85 settled more than a year after filing, 34 more than three years after; 106 settled with a
    penalty.
  - Wider: 284 cases on 121 pages with any of the page's own among fewer than 10 defendants; 517 on 232
    pages if every Superfund party counts.
  - 33 filings are refused because the unit was not yet the owner's on the filing day. Mobil's suit
    of 1996 is no ExxonMobil row; Cinergy's of 2000 is no Duke row.
  - **For example:**

    | Page | Suit filed | Settled | The case |
    | --- | --- | --- | --- |
    | AEP | 1999-11-03 | 2007-10-09 | three case numbers of its national New Source Review case, one row |
    | Duke Energy | 2000-12-22 | 2015-09-10 | Duke Energy Corp.'s Clean Air Act suit (04-2000-0278) |
    | Southern | 2001-01-12 | 2006-04-24 | Alabama Power Company (04-2000-0099) |
    | BP | 2009-03-31 | 2011-05-03 | BP Exploration (Alaska), $20,500,000 at settlement |
    | Norfolk Southern | 2008-04-23 and 2023-03-30 | 2010-03-08 and 2024-05-23 | Graniteville; East Palestine |
    | Murphy Oil | 2000-06-29 | 2002-01-24 | Murphy Oil USA, $5,500,000 |
    | Ford | 1984-09-26 | 1988-04-28 | its Mount Clemens vinyl plant, $1,750,000 |

  - **Read by hand:** a fixed random sample of 25. Every one names the page's company among the
    defendants on the filing day.
    - 22 read as a suit filed and settled later: Texas Instruments 1980, Con Edison 1988, Ford 1991,
      Alabama Power 2001, Norfolk Southern 2008, Detroit Edison 2014;
    - one is a bankruptcy claim (Tronox, 2009), and one names the company only as "(POSSIBLE)"
      (Louisiana-Pacific, in Ketchikan Pulp's case of 1988);
    - one is a settlement announced on its filing day: the Justice Department announced PSEG Fossil's
      on 2002-01-24, while EPA dates the lodging 2002-05-31. Wisconsin Electric's of 2003-04-29,
      outside the sample, is another.
  - **Against the Justice Department's releases:** none of the 20 filings of 2001–2008 has a release on
    its page within three days today. Two would once #1(c) is built: PSEG Fossil's (2002) and Wisconsin
    Electric's (2003), on the same days. The 33 filings since 2009 were not checked against the API.
- **(b) Cases of several settlements, every defendant the page's:** 26 cases, on 27 rows of 23 pages
  (Wisconsin Electric's is on WEC and on its notes page, WELPP).
  - Every one of those rows today shows no penalty. Their other 46 settlements were all lodged before
    the row's day, 36 of them before 2017; 16 carry a penalty, and 28 order $1 million of work or
    more. Counted by row, so Wisconsin Electric's settlement counts twice.
  - **For example:**

    | Page | Row today | Settlement on its own day |
    | --- | --- | --- |
    | GE | 2010-12-31, no figure | 2005-10-06, the Hudson River decree: $150,000,000 of work |
    | GE | 2025-05-01, no figure | 1999-10-07, Pittsfield and the Housatonic: $500,000,000 of work; and 2016-10-20 |
    | Dominion | 2016-09-20, no penalty | 2003-04-21: $5,300,000; $1,210,900,000 of work |
    | WEC | 2014-07-08, no penalty | 2003-07-10: $3,100,000 and $100,000; $620,000,000 of work |
    | PSEG | 2006-11-30, no penalty | 2002-05-31: $1,400,000; $345,000,000 of work |
    | Southern | 2015-08-24, no penalty | 2006-04-24, Alabama Power: $100,000; $205,100,000 of work |
    | ExxonMobil | 2021-04-13, no penalty | 2005-10-11, its national refinery case: $779,089 and $650,000; $198,210,000 of work |
    | AEP | 2020-08-26, no penalty | 2007-10-09, Muskingum River: $8,025,000; $2,480,260,000 of work |

  - AEP's settlement lands on its existing 2007-10-09 row and completes it: $6,225,000, $750,000 and
    $8,025,000, $15,000,000 in all.
  - **Left as they are:** the 166 other cases of several settlements on pages. They have several
    parties, and EPA names no settlement's party in a field.

**Who benefits and how:** Readers of 85 pages, AEP, Duke, Southern, Chevron, GE, BP and Ford among
them. The day a suit is filed is a dated public act, often years before its settlement. EPA's file
holds 10 court cases filed on 1999-11-03 alone, against AEP, Southern's companies, Ohio Edison,
Cinergy, Tampa Electric and Southern Indiana Gas & Electric. A settlement on its own day, with its
money, replaces a bare row dated by an amendment years later.

**Risk:**
- **EPA's milestones can disagree with the Justice Department's releases,** as PSEG Fossil's do. A
  filing row says "suit filed" and nothing more. It never says "contested".
- **(b) moves rows.** Today's rows are dated by the latest lodging; their attestations must move with
  them, by `legacyDedupBasis` (batch 100 and 113 mechanics). Check that at the build.
- **Some filing rows predate a first price not read here:** 25 of the 85 pages.

**Cost:** none.
**Effort:** small to medium:
- `readCases` keeps the filing day and reads two more columns of the settlements table;
- `epaEvents` adds the filing row and splits a one-owner case by settlement;
- a migration adds the filing day and the settlements' days to `epa_cases`;
- the slice gains the two columns; the counts are re-pinned.

**How to check:** new `check:epa-cases` cases on the slice:
- AEP's three case numbers of 1999-11-03 make one "suit filed" row that day;
- Duke's 04-2000-0278 has a row on 2000-12-22;
- Mobil's suit of 1996 (02-1994-0104) has no ExxonMobil filing row;
- Wisconsin Electric's 05-2003-0333 has a row on 2003-07-10 with $3,100,000, $100,000 and
  $620,000,000 of work;
- GE's Hudson River case (02-2005-0015) has a row on 2005-10-06;
- a Superfund suit of 174 parties (Chem-Dyne, 05-1982-0016) gets no filing row;
- every moved row keeps its history.

On main the new cases fail: no filing day is kept.

**Depends on:** nothing.

**Buildable by:** a cloud session, offline.

*Importance:* medium-high — 178 suits filed, 128 of them before 2001, and 46 settlements moved to
their days with their money · *Efficiency:* high — the same zip · *Practicality:* high — measured on
the saved file; one threshold and the moved rows to watch

---

## 3. The NHTSA recalls filed under makers listed companies own and the map lacks: Graco's child seats on Newell, Dana, Lippert on LCI, Hino on Toyota, Kelly-Springfield on Goodyear… · proposed `P2` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — by the owner, 2026-11-08: "All three". After #2, in batch 123, each maker's day read from filings.
**Owner's reason (if rejected):**

**Raised before:** no. Batches 30 and 31 mapped vehicle and RV makers. Tire, equipment and child-seat
makers were never counted.

**Anchor:** a capability asymmetry inside one source. The recall map (`RECALL_MAKERS`,
`lib/recalls.ts`) reads 39 maker names on 20 companies, and the dataset files every recall under its
maker. Newell's page carries Graco's stroller and swing recalls from the CPSC since 1999-03-24 (batch
101), but not Graco's car seats, which are NHTSA's. Its 2014 recall of 4,176,601 seats is on no page.

**What:** about 20 more makers on 20 companies, with the recall floor (10,000) and the map's rules
unchanged:

| Company | Maker, as NHTSA files it | Recalls (before 2017) | Largest |
| --- | --- | --- | --- |
| Newell | Graco Children's Products, from 1999-03-24, batch 101's day | 12 (11) | 2014-02-10, 4,176,601 child seats, buckle may not unlatch |
| Dana | Dana Corporation and Dana Incorporated, its record's own | 10 (8) | 1978-05-10, 65,000 units |
| LCI | Lippert | 9 (2) | 2013-11-07, 528,228 units, door lock |
| Toyota | Hino Motors Sales U.S.A., while Toyota held Hino (2001 to 2026, my estimate) | 6 (3) | 2012-12-03, 35,142 trucks |
| Autoliv | Autoliv, Inc. | 6 (2) | 2021-06-14, 266,772 units |
| Caterpillar | Caterpillar, Inc. (engines) | 5 (5) | 2009-04-28, 147,777 |
| RTX, Carrier | Carrier Corporation, RTX's to 2020-04-02, Carrier Global's after | 4 (4), 1 (0) | 2011-01-25, 44,915 |
| Skyline Champion | Skyline Corporation | 4 (4) | 2007-03-05, 57,295 |
| Goodyear | Kelly-Springfield, its unit in all three recalls' years (my reading) | 3 (3) | 1998-04-21, 594,853 tires |
| GE, Honeywell, Harley-Davidson | GE's lamps; Honeywell's Fram and Prestone; Buell, from 1998-02 (estimate) | 3 (3) each | 2005-09-01, 297,000 GE headlamp bulbs |
| Seven more | Dorman 3, Polestar 3, Mattel (Fisher-Price from 1993-11-30, estimate) 2, Thor (Thor California) 2, Eaton 2, Winnebago (Winnebago Towable) 2, Wabash (Supreme from 2017-09-27, estimate) 1 | 15 (6) | |

**Licence:** no new source. NHTSA's recall data is "Public Domain U.S. Government" in the dataset's own
licence field (quoted in `lib/recalls.ts`, approved 2026-10-22).

**Grounded in:**
- **The dataset, today:** 660 makers have a recall of 10,000 or more: 5,446 vehicle recalls, 707
  equipment, 170 child seat and 160 tire. 614 of those makers are unmapped, with 3,150 recalls; most
  are carmakers with no SEC record (Volkswagen, Nissan, Hyundai) or private makers.
- **The listed companies among them,** read by hand against the company index: 84 recalls on 20
  pages, 57 before 2017, inside the days above.
- **Left out, and why:**
  - Adient's 4 are battery recalls of 1991–1999, filed under Adient's present name; they were Johnson
    Controls' battery business, now Clarios, and are neither company's;
  - Fisher-Price's 11 before Mattel bought it; Cooper Tire's 19, all before Goodyear's purchase of
    2021;
  - TRW, Federal-Mogul, Takata, Meritor, Tenneco and Master Lock: companies gone or private;
  - Bombardier Recreational Products' 8: not in the company index;
  - Mack, Volvo and Daimler trucks: no SEC record.

**Who benefits and how:** Readers of Newell, Dana, LCI, Autoliv, Goodyear, Toyota and Caterpillar. A
child-seat or parts recall is the kind of event these companies report, and 57 of them fall before
2017. Graco's two buckle recalls of 2014, 6.1 million seats between them, are the largest.

**Risk:**
- Six days are my estimates (Hino, Buell, Fisher-Price, Supreme, Carrier's split, Kelly-Springfield's
  years); each is to be read from a filing, as batch 31 read its nine.
- Eaton's clutch recall of 2018 falls after Eaton and Cummins formed a joint venture for automated
  transmissions in 2017. Read it before mapping it.
- The volume is small. This is a list, not a new rule.

**Cost:** none. One request a day for each of about 14 new companies; the source has no published cap
without an app token.
**Effort:** small: about 20 makers in `RECALL_MAKERS`, each `why` naming its filing, as
`check:vehicle-recalls` already requires; fixture rows for the new cases.

**How to check:** new `check:vehicle-recalls` cases on real rows:
- Graco's 14C001000 of 2014-02-10 lands on NWL, and its 86C006000 of 1986 on no page;
- Kelly-Springfield's 98T002000 lands on GT;
- Hino's 12V555000 lands on TM;
- Buell's 99V105000 lands on HOG;
- Supreme's 16V296000 lands on no page, and its 18V168000 on WNC;
- Carrier's 16E087000 lands on RTX, and its 23E026000 on CARR.

On main they fail: none of these makers is mapped.

**Depends on:** nothing.

**Buildable by:** a cloud session; data.transportation.gov and data.sec.gov answered from here.

*Importance:* medium — 84 recalls on 20 pages, 57 before 2017, Graco's 6.1 million seats among them ·
*Efficiency:* high — rows in a list · *Practicality:* high — six days to read

---

## Considered and cut

- **FDA enforcement reports against every company by the caption rule (measured, cut).**
  - **The files:** openFDA's three of 2026-11-03 hold 25,441 Class I and II recall events.
  - **By the caption rule, on present names,** 529 events reach 133 companies the hand map
    (`FDA_FIRMS`, 73) lacks, 158 of them before 2017. Most companies get one to five.
  - **Why it is cut:**
    - the largest is a namesake: "Encore Medical, LP", DJO's unit, gives its 61 to Encore Medical,
      Inc. (EMI). That is why the map is built by hand;
    - next come retailers, which batch 70 left out on purpose (Kroger 38, Albertsons 15, Weis 12);
    - then small device makers (LeMaitre 20, OrthoPediatrics 20, Bio-Rad 19, Accuray 17).

    Units, which carry most of a group's recalls, were not scanned. A follow-on to batch 70 if the
    owner wants it.
- **Not reachable, so not measured:**
  - **PHMSA's pipeline incidents:** www.phmsa.dot.gov answered 403 "Access Denied", and DOT's open
    data catalog holds no copy. It would reach pipeline operators and gas utilities, with batch 114's
    units (an estimate). Worth a measured note from the owner's host.
  - **FERC's civil penalties:** www.ferc.gov answered 403 behind a script check.
  - **The NRC's escalated enforcement actions:** the pages answer, but list nothing without their
    script ("No content for this letter" on E).
- **EPA units not drafted in #1:**
  - ArcelorMittal: its record was Arcelor's until 2007, and its chart is Ispat's from 1997, a history
    question like Merck's;
  - NiSource's Columbia Gas Transmission, 2000–2015: not replayed;
  - Baker Hughes: BKR's record is 2017's, and old Baker Hughes's past was not read;
  - Hess Corporation on Chevron from 2025-07-18: not measured;
  - Texas Eastern on Duke, 1997–2007: replayed, and it adds nothing on its days.
- **EPA's multi-party cases of several settlements** (166 on pages): EPA's tables name no
  settlement's party in a field. Left as they are, as in 2026-11-07.
- **EPA's facility table:** as on 2026-11-07, a place line #2 does not need.
- **Not retried:** the FTC, the OCC and FSIS (unreachable on 2026-11-05); the FDIC's failed-bank list
  (still no licence wording); TARP and OFAC (measured and cut on 2026-11-06). **Not measured:** NTSB
  aviation accidents. Its download is an Access database, and this container has no reader for it.
- **Owner decisions and recorded leftovers, not raised:** listed in the header.
- **Re-prioritisations:** none. The open items nearest securities depth still need the production
  host or a key: the Digest walk (`NEWS_CHARTS_CONTACT` and `pdftotext`), the GDELT backfill's
  production watch, the 203 held-back everyday-word names, the paid-tier evidence.
- **Anything touching another product:** nothing here reads, references or connects to another
  product's repository.

*One closing note, not a proposal* — noticed in passing. JCI's page holds 38 of its 45 EPA rows from
before 2016-09-02, old Johnson Controls, Inc.'s, on a record that was Tyco's. The owner's open JCI call
now covers those rows, not one SEC case. The `code-auditor` may also want #2(b)'s 26 rows on its own:
they are dated by a later amendment and show no penalty.
