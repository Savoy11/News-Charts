# Opportunity proposals — 2026-11-05

**Commit:** 73a88f7ee57dd9379ad5d079f4d71e2926857b9e (`claude/lucid-goodall-6km6ea`, equal to `origin/main` after batch 90) · **Reviewed:** `CLAUDE.md`; `.claude/agents/opportunity-scout.md`; `README.md` (searched, not read whole: the regulator sections and "Sources evaluated and rejected"); `docs/MASTER-CHECKLIST.md` (the batch 86–90 ledgers, batch 69's, Scope refocus's open boxes, the legend); `docs/COVERAGE-MAP.md`; `docs/audits/2026-11-05-code-audit.md` (set-asides, what it found sound); `docs/proposals/2026-11-02-proposals.md` whole, and the cut lists of 2026-10-22, 10-26, 10-28 and 11-01; code — `lib/releaseNames.ts` (header, `BANK_UNITS`), `lib/fedActions.ts` (header, `FED_BANKS`), `lib/secCases.ts` (`captionParty`, `secCaseEvents`, `NOT_THE_COMPANY`), `lib/secPress.ts` and `lib/doj.ts` (the party rules), `lib/fdaRecalls.ts` (`FDA_FIRMS`), `lib/recalls.ts` (`RECALL_MAKERS`), and the replay in `scripts/check-sec-cases.ts`; data — `data/edgar-tickers.json`, `scripts/fixtures/sec-cases-all.json.gz`, `sec-press-listing.json`, `fed-press-feed.json.gz`, `fed-actions.json`, `doj-releases.json` · **Proposals:** 3

> - **No rejection log exists** (`docs/audits/rejected-proposals.md`), and nothing has been
>   rejected. Of the 2026-11-02 proposals, #1's step 1 was built in batch 87 (a count; step 2 is the
>   owner's call), #4 in batch 88 and #5 in batch 89. #2 (the Justice Department's 2001–2008
>   archive) and #3 (the Board's 1996–2005 orders) are still unmarked, so they are not raised again
>   here. Nothing was deferred, so nothing carries forward. Insider-trade forms stay out, as decided
>   on 2026-10-18.
> - **Owner calls already open, not raised again:** CPSC recalls (the 2026-10-22 shortlist); JCI's
>   2016 case on Tyco's record; GE Capital Retail Bank on GE, and PayPal's 2015 CFPB action on eBay;
>   the Digest's step 2. #1 below touches the JCI call and says how.
> - **Measured live on 2026-11-05 from this container.** Every figure below is measured unless it
>   says it is an estimate or was read from the saved fixtures. Requests, by host:
>   - www.cftc.gov 12: the enforcement-action list's first and last pages, its web policy, and one
>     page each for eight years (1999, 2003 twice, 2007, 2010, 2012, 2013, 2014, 2016);
>   - echo.epa.gov 3: one size check and one download of the case file (82 MB), and one case
>     report page;
>   - www.epa.gov 1 and edg.epa.gov 1: the disclaimers page and the data licence;
>   - www.federalreserve.gov 2: the two enforcement-action files;
>   - www.ftc.gov 2: both answered 404 with a page that is not the FTC's;
>   - www.occ.gov 1 and apps.occ.gov 2: the news page redirected to the OCC's home page. The search
>     page answered, but its script redirected three times to www.occ.treas.gov, where curl stopped;
>   - api.fdic.gov 1: the BankFind API documentation;
>   - www.fsis.usda.gov 1: 403, "Access Denied".
>
>   That is 26 asks. Counting the redirects curl followed (one at the CFTC, one at www.occ.gov and
>   three on the OCC's script), it is about 31 requests. Each carried the User-Agent `News Charts
>   Research`, with no email address. The CFTC pages were paced at about one a second. No sec.gov
>   host, GDELT, Wikipedia, Wikidata, Yahoo or the Federal Register was asked. Postgres was not used.
> - **Nothing here needs a key, a paid tier or a recurring charge.** #1 and #2 would be new sources.
>   Each is written as a decision for the owner, with its licence quoted from the source's own page.
>   #3 adds rows to a map an existing source already reads.
> - Ranked by importance, securities depth first:
>   1. the EPA's civil enforcement cases, from the 1970s, on industrial, chemical, energy, paper and
>      carmakers' pages (a source decision);
>   2. the CFTC's enforcement actions, from 1995, on banks', brokers' and energy companies' pages (a
>      source decision);
>   3. the Board's enforcement actions against the 23 listed banks its map leaves out.
> - Three, not five. What else I looked at, and why it was cut, is at the end.

Mark each proposal below: `APPROVED`, `REJECTED`, or `DEFERRED`, and add a
reason for anything rejected. Then run the scout in FILE mode.

---

## 1. The EPA's civil enforcement cases, from the 1970s: the regulator's own record for industrial companies — a source for the owner to decide · proposed `P1` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — by the owner, 2026-11-05: "Lets move forward with all of the proposals." With the owner's rule of the same day, "for any instance that multiple companies are involved in a case add the story to all relevant companies pages": a case naming several listed companies goes on each of their pages.
**Owner's reason (if rejected):**

**Raised before:** no. No earlier proposal file, ledger or doc names the EPA or ECHO (searched).

**Anchor:** a capability other sectors have and these companies lack.
- Carmakers' pages carry their regulator's record from 1966 (NHTSA), drug, device and food makers'
  from 2012 (FDA), and banks' from 1989 (the Federal Reserve), 1995 (the SEC's cases) and 2012 (the
  CFPB).
- A chemical maker, an oil company, a paper company, an industrial or a utility has only the Justice
  Department's releases, which begin in 2009 (`docs/COVERAGE-MAP.md:96-101`).
- The EPA's own case file is public and reaches back to the 1970s. Nothing reads it.

**What:** The owner's decision first. If yes:
- read EPA's case file (`echo.epa.gov/files/echodownloads/case_downloads.zip`, 82 MB) once a month.
  Take four of its tables: the cases, their defendants, their settlements and their milestones;
- keep a case on a company's page when a defendant is the company by the caption rule
  (`captionParty`), under its names for that year, from its first price;
- give the case's public day: for a court case, the day the settlement was lodged; for an
  administrative case, the day the final order was issued;
- title it with what EPA did and the penalty ("EPA consent decree: $11,000,000 civil penalty"),
  name the law (Clean Air Act, CERCLA…), and link it to the case's ECHO report
  (`echo.epa.gov/enforcement-case-report?id=<case number>`);
- give its own row to a court case, or an order with a penalty, that names three defendants or
  fewer. Group the rest (Superfund agreements with dozens to hundreds of parties, and orders
  without a penalty) a row a month, as routine Federal Register notices are, or leave them out.
  That is the owner's call.

**Licence:**
- **The data:** "Unless otherwise specified, all data produced by the U.S EPA is by default in the
  public domain and is not subject to domestic copyright protection under 17 U.S.C. § 105."
  (EPA Standard Open Data License, edg.epa.gov/EPA_Data_License.html, read 2026-11-05.) No key.
- **A caveat, from EPA's disclaimers page,** under "Copyright Status": "These documents may be
  freely distributed and used for non-commercial, scientific and educational purposes. Commercial
  use of the documents available from the EPA websites may be protected under the U.S. and Foreign
  Copyright Laws." (www.epa.gov/web-policies-and-procedures/epa-disclaimers, read 2026-11-05.)
- **My reading:** the case file is data EPA produced, so the data licence governs it. The
  disclaimers' "documents" are documents on the site. The build would store the file's fields and
  link to EPA's case page; it would copy no document. That is a reading for the owner to check, not
  EPA's words on this file.

**Grounded in:**
- **The file** (last modified 2026-10-31): 137,108 cases, 127,990 administrative and 9,118 in court,
  with 202,602 defendant rows. By the fiscal year EPA gives each case: 1970s 735, 1980s 13,284,
  1990s 27,304, 2000s 45,973, 2010s 28,426, 2020s 21,386. Every case EPA leads; no state cases.
- **Replayed through the repo's caption rule** with every index company's present names, as
  `check:sec-cases` replays its rows (former names, predecessors and first prices left aside):
  - 6,406 cases on 663 companies;
  - 2,264 of them court cases;
  - 5,505 before 2017, and 902 before 1993, the year EDGAR's record begins;
  - 130 companies have ten or more before 2017.
- **Under the own-row rule above,** leaving out Light S.A.'s and National Steel's rows (below):
  1,771 cases, or 1,662 company days, on 418 companies. 1,348 of the days fall before 2017 and 265
  before 1993. The rest is 4,550 cases, which grouped a row a month would make 4,115 rows. 2,687 of
  the 6,406 cases have ten defendants or more.
- **Most before 2017:** GE 48 days, GM 45, ExxonMobil 42, Ford 39, PPG 25, International Paper 25,
  Kodak 24, FMC 23, Stepan 23 and Olin 23 (Sunoco LP's 28 are left out of that list: most are
  Sunoco, Inc.'s, which was not that record's). Among them:
  - GM's consent decree of 1995-11-30, an $11,000,000 penalty (HQ-1996-0001);
  - Caterpillar's, lodged 1998-10-22 and entered 1999-07-01, $25,000,000 (HQ-1998-0303);
  - Kodak's of 1995-03-10, $5,000,000;
  - Chevron's of 1985-09-30, $6,054,000;
  - Exxon's court cases of 1976 and 1977.
- **Little overlap with what pages hold now.** 1,209 of the 2,264 court cases carry a Justice
  Department docket number. But 320 of the 494 court cases with three defendants or fewer fall
  before 2009, the Justice API's floor, and 217 before 2001.
- **A sample of 40 matched cases, read by hand:** 31 are the company's own.
  - Six of the nine wrong ones fall before the company's record or listing, by my reading of when
    each began trading (not checked against Yahoo). The first-price floor every source applies
    would drop them:
    - Alcoa Inc.'s case of 2014 on AA, a 2016 spin-off;
    - Ingersoll-Rand Company's of 2012 on IR, Gardner Denver's record until 2020;
    - Southland Corporation's of 1985 on SLND;
    - Siemens Energy & Automation's of 1991 on SMERY;
    - Graphic Packaging Corp's of 1999 on GPK;
    - Sunoco, Inc.'s of 2012 on SUN.
  - Three need guards. "City Water and Light" on Light S.A. (LGSXY), and "NATIONAL STEEL" on
    CSN (SID), which `NOT_THE_COMPANY` already holds for the SEC's cases. The third is Sunoco,
    Inc. (R&M)'s of 2015 on Sunoco LP: Energy Transfer's business then, by my reading, not that
    record's.
- **The guards the rule lacks,** each tested here:
  - `captionParty` reads "Pennsylvania Power and Light Company" as the party "Light Company".
    That gives Light S.A. 56 cases, every one a utility named "… Power and Light", "… Water and
    Light" or "… Fuel and Light" (Kansas City, Florida, Pennsylvania, Arkansas…).
  - It reads a trailing given name after a comma as a one-word company: "RETHERFORD, DANA" lands on
    Dana and "FAYE, BALL" on Ball.
  - National Steel's 29 cases on SID need the SID row in `NOT_THE_COMPANY`.
- **The open JCI call reaches here.** 40 of JCI's 47 matches are before 2017, and most of them
  name "Johnson Controls, Inc.", the company that merged into Tyco's record in 2016. They follow
  the owner's call on JCI's 2016 case. This asks for no new call.
- **The link answers:** `echo.epa.gov/enforcement-case-report?id=HQ-1996-0001` returned 200, titled
  "Civil Enforcement Case Report | ECHO | US EPA". Its content loads in the browser; I did not see
  it rendered.
- **Not measured:** each company's first price. Nor the cases filed under a subsidiary's own name
  (BP Products North America, Motiva): the replay read the companies' own names only, and no unit
  map was tried.

**Who benefits and how:** Readers of industrial, chemical, energy, paper, packaging, carmakers' and
drugmakers' pages: GE, GM, ExxonMobil, Ford, PPG, International Paper, Olin, Sherwin-Williams,
Goodyear, Weyerhaeuser, Pfizer, 3M, Boeing and about 400 others. Their 1970s–2000s years get the
regulator's suits and orders, each with its penalty and law, on the day it was settled. Those are
the decades the coverage map calls "the single biggest hole in the corpus". 1,348 company days
before 2017 is more than twice the 559 the SEC's cases give.

**Cost:** none recurring beyond one 82 MB download a month (about 1 GB a year), no key. How often
EPA refreshes the file was not read; the copy read was modified 2026-10-31.
**Effort:** medium:
- a zip reader on the ingest path: `unzip` on the host, or a dependency such as `yauzl` (MIT);
- a join of four tables, about 160 MB unpacked, stored once a month. Match at each company's ingest,
  or match the whole index once when the file is read, as the replay does in seconds;
- the two guards in `captionParty`, and SID's row;
- the own-row rule, the grouping, and the lodged day;
- registered in `SOURCES`, credited, and scored without the model. Penalties stored as numeric
  values, never floats.

**Verified by:** a new `check:epa-cases` on a committed slice of the four tables:
- GM's HQ-1996-0001 lands on GM on 1995-11-30 with its $11,000,000;
- Caterpillar's HQ-1998-0303 lands on CAT on 1998-10-22, the day it was lodged;
- Kodak's 02-1991-0208 lands on KODK;
- "PENNSYLVANIA POWER AND LIGHT COMPANY" lands on no page, nor "RETHERFORD, DANA" on DAN, nor
  "NATIONAL STEEL CORP." on SID;
- Southland Corporation's of 1985 is refused by SLND's first price;
- a Superfund order of 100 or more parties is grouped, or kept off, as the owner rules;
- a company's two cases on one day make one event.

On main it cannot run: the adapter does not exist.

**Depends on:** the owner's yes, and the call on the rows not given their own. JCI's rows follow the
open JCI call.

**Buildable by:** a cloud session. echo.epa.gov answered from here (measured), and the whole file
is one request.

*Importance:* high — 1970s to 2016, every industrial sector, more pre-2017 company days than any
source here · *Efficiency:* high — one public file, the caption rule already written ·
*Practicality:* medium — a licence reading for the owner, a materiality call, two guards, a zip
reader

---

## 2. The CFTC's enforcement actions, from 1995: banks', brokers' and energy traders' cases before the derivatives regulator — a source for the owner to decide · proposed `P2` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — by the owner, 2026-11-05: "Lets move forward with all of the proposals." With the owner's rule of the same day, "for any instance that multiple companies are involved in a case add the story to all relevant companies pages": a case naming several listed companies goes on each of their pages.
**Owner's reason (if rejected):**

**Raised before:** no (searched every proposal file, the checklist, the coverage map and README).

**Anchor:** a regulator missing from the set the banks' pages already read. The SEC's cases (1995)
and releases (1997), the Board's actions (1989) and releases (2006), the CFPB (2012) and the Justice
Department (2009) all have sources (`docs/COVERAGE-MAP.md:30-38`). The Commodity Futures Trading
Commission, which brought the benchmark-rigging, swaps-reporting and energy-trading cases against
listed banks and utilities, has none.

**What:** The owner's decision first. If yes:
- read the Commission's enforcement list once. It is
  `www.cftc.gov/LawRegulation/EnforcementActions/index.htm`, 10 actions a page, with a year
  filter (`?year=YYYY`) that lets a closed year be read once, as `sec_press_years` is;
- then read its first page once a day, one read for every company;
- store each row's day, release number, title and link;
- at each company's ingest, keep a release whose title makes the company the party, by the Justice
  Department's rule (`releaseNamesParty`) with the release map's units (`BANK_UNITS`,
  `RELEASE_NAMES`), from its first price;
- one event a company a day.

**Licence:** "Government information at the CFTC website is in the public domain. Public domain
information may be freely distributed and copied, but it is requested that in any subsequent use the
CFTC be given appropriate acknowledgement." (www.cftc.gov/WebPolicy/index.htm, "Copyright", read
2026-11-05.) No key.

**Grounded in:**
- **The list:** 261 pages of 10, the last full, so 2,610 actions. The newest is of 2026-11-03 and
  the oldest of 1995-07-27. The year menu offers 1995–1997 and 1999–2026; 1998 is not in it.
- **Eight years' totals, from each year's own page count:** 1999 61–70, 2003 101–110, 2007 101–110,
  2010 71–80, 2012 151–160, 2013 131–140, 2014 121–130, 2016 101–110.
- **The years before 2017 hold about 1,600–2,000 of the 2,610.** That is an estimate: the newest
  page spans ten weeks, which suggests some 55–100 a year since 2017.
- **100 titles before 2017 read by hand** (the newest page of each year above, a second 2003 page,
  and the list's last page): 6 make a listed company the party.
  - "CFTC SUES AMERICAN ELECTRIC POWER COMPANY, INC. AND ITS SUBSIDIARY, CHARGING FALSE REPORTING
    AND ATTEMPTED MANIPULATION OF NATURAL GAS PRICES" (2003-10-01, AEP);
  - "CFTC Orders Goldman, Sachs & Co., a Commission Registrant, to Pay $1.5 Million for Supervision
    Failures" (2012-12-08, GS);
  - "CFTC Orders UBS to Pay $700 Million Penalty to Settle Charges of Manipulation… of LIBOR"
    (2012-12-20, UBS);
  - "Federal Court Orders Royal Bank of Canada to Pay $35 Million Penalty for Illegal Wash Sales…"
    (2014-12-19, RY);
  - "CFTC Orders Deutsche Bank Securities Inc. to Pay $3 Million…" (2014-12-23, DB, through its
    unit's name);
  - "CFTC Orders Goldman Sachs to Pay $120 Million Penalty for Attempted Manipulation of… ISDAFIX"
    (2016-12-22, GS).
- **An estimate, not a count:** about 6 in 100 gives on the order of 100–120 releases on listed
  companies before 2017, most of them banks and brokers, some of them energy companies.
- **Replayed through the repo's rules** (`releaseNamesParty`, and `secReleaseNamesParty` with
  "CFTC" read as "SEC"), with every index company's names and the release map, on all 110 titles
  read:
  - 4 of the 6 are found: AEP, RY, DB and GS's of 2016;
  - two are missed, each a small rule case: a bare "UBS" after "Orders", and "Goldman, Sachs & Co.,
    a Commission Registrant", with its comma;
  - the rule already refuses "Hartford Financial Group, Inc." (1999-12-09, not The Hartford) and
    "Former Avista Energy Vice-President" (2003-10-07, a person, not Avista).
- **On no page today:** none of the six falls on a day the saved SEC cases or SEC releases name the
  company (checked against both fixtures). The Justice Department's UBS LIBOR case of the day before
  is the one likely neighbour, by my recollection; I did not check it against its API.
- **Not their own:** MF Global (2007, 2014), Refco (1996) and MG Refining (1995) are no listed
  company's. "Reliant Energy Services" (2003-11-25) was Reliant Resources', which no index company's
  record carries, by my reading.
- **Dates:** a day only, no time.

**Who benefits and how:** Readers of the largest banks and brokers (Goldman Sachs, UBS, Deutsche
Bank, RBC and the other banks the benchmark cases reached) and of utilities and energy traders, such
as AEP's 2003 suit. They get the Commission's orders and suits, with their penalties, from 1995.
That is fourteen years before the Justice API begins. I cannot size the energy-trading cases of
2002–2004 past the one read.

**Cost:** none recurring beyond one page a day; no key. Once: 261 list pages, about 2.9 MB, a second
apart (about five minutes).
**Effort:** small to medium:
- a parser for the list's table (day, title, link) and a year walk with its table. 1998 is reached
  by paging the unfiltered list;
- the two rule cases above;
- registered in `SOURCES`, credited, and scored without the model.

**Verified by:** a new `check:cftc` on the saved pages:
- AEP's suit of 2003-10-01 lands on AEP, and RBC's order of 2014-12-19 on RY;
- Deutsche Bank Securities' of 2014-12-23 lands on DB;
- Goldman's of 2012-12-08 and 2016-12-22 land on GS, and UBS's of 2012-12-20 on UBS;
- Hartford Financial Group's of 1999-12-09 lands on no page, nor the Avista officer's on AVA;
- a closed year is not asked twice.

On main it cannot run: the adapter does not exist.

**Depends on:** the owner's yes. Nothing else; the release map it reads is built.

**Buildable by:** a cloud session; www.cftc.gov answered from here (measured).

*Importance:* medium-high — 1995 to 2016, banks, brokers and some utilities · *Efficiency:* high —
small pages, a rule already written · *Practicality:* high — plain HTML, public domain, two rule
cases

---

## 3. The Board's enforcement actions against the 23 listed banks its map leaves out · proposed `P2` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — by the owner, 2026-11-05: "Lets move forward with all of the proposals." With the owner's rule of the same day, "for any instance that multiple companies are involved in a case add the story to all relevant companies pages": a case naming several listed companies goes on each of their pages.
**Owner's reason (if rejected):**

**Raised before:** not as such. Batch 69 mapped 25 large banks by hand and named the foreign banks
as the next step, which batch 74 built. Batch 88 added Popular. The other listed banks in the files
were never counted.

**Anchor:** a capability present for every company in one of the Board's sources and for 40 banks in
the other. The Board's press releases are read against every company in the index (batch 84;
`docs/COVERAGE-MAP.md:34`). Its enforcement actions reach a page only through the hand-checked map
(`lib/fedActions.ts:19-21`, `FED_BANKS` at `:53`), since "The Board names an organisation and its
city, never a listed company" (README, "Federal Reserve enforcement actions").

**What:** One row in `FED_BANKS` for each of the 23 banks below, each matched by its legal name and
home city, as batch 69's rows are. Each row is read against every row of both files, and the
namesakes are refused by city. No new source; the files are already read once a process.

**Grounded in:**
- **The two files, read 2026-11-05:** 2,899 actions (2,514 from 1989-09-25 to 2018-12-26, 385 from
  2019-01-18 to 2026-10-08). 1,562 are against an organisation rather than a person, 1,390 of them
  before 2017.
- **Replayed through `captionParty`** with every index company's present names and the release
  map's units, organisation by organisation: 137 company days, 54 of them on companies not in
  `FED_BANKS`, on 43 companies.
- **Read by hand, city by city:**
  - **29 days on 23 companies are the company's own, 23 of them before 2017, on 19 companies:**
    - Arrow Financial (written agreement, 1992-07-22) and CSB Bancorp (2000-11-22);
    - Crédit Agricole (CRARF: a consent order of 2004-01-08 and an $8,000,000 penalty of
      2004-03-09) and Banco de Chile (cease-and-desist order, 2005-02-01);
    - East West Bank (2007, 2015) and First Interstate Bank (2005);
    - Hanmi (2009); Broadway Financial, Central Pacific Financial, New Peoples Bankshares and
      OptimumBank (2010); Old Second and Plumas (2011); Orrstown (2012); Patriot National (2010,
      2012);
    - MetLife, a bank holding company then (cease-and-desist order 2011-04-13, $3,200,000 penalty
      2012-08-06);
    - Jack Henry & Associates, a bank technology provider (2013-12-04);
    - Riverview (2013) and Fulton (2014);
    - and since 2017: Wintrust (2019, $1,012,500), East West Bank (2020), Green Dot (2024),
      Customers Bancorp (2024), First Interstate (2024) and Bank of Hawaii (2025).
  - **10 days fall before the company's record or listing, by my reading.** The first-price floor
    would drop them: Coastal Financial (2009), Northpointe (2009), Metropolitan Bank Holding (2011),
    Commercial Bancgroup, CoastalSouth and Richmond Mutual (2012), Lake Shore (2023), and Santander
    Holdings USA's three (2014, 2015, 2017; its preferred shares first traded 2026-08-28, per
    batch 90).
  - **15 days are namesakes or another record's past, refused by city:**
    - Commerce Bancshares of Catoosa, Franklin and Edina, three, not Kansas City's;
    - Community Bancorp of Las Vegas, not Vermont's; First Bancshares of Cold Spring, not
      Missouri's; First National Corporation of Savannah, not Virginia's;
    - Centennial Bank of Lubbock, not Conway's; International Bancshares of Gladstone, not Laredo's;
    - Merchants Bancorp of Gresham, and Miners and Merchants; Pioneer Bancorp of Fullerton; United
      Bancshares of Philadelphia, not Ohio's;
    - Trinity Capital of Los Alamos, already a namesake in `NOT_THE_COMPANY`; Princeton Capital's
      LLCs;
    - Community West Bancshares of Goleta (2012). By my reading, CWBC's record is Central Valley
      Community Bancorp's, which took that name in 2024.
- **Not measured:** actions under a bank's name that is not the company's, and under EDGAR former
  names. The replay read present names only.

**Who benefits and how:** Readers of 23 listed banks, most of them regional, Crédit Agricole and
MetLife among them. Each gets its one to three actions from the Board, among them the written
agreements of 2009–2012 that marked the banks hit hardest after 2008, on the day the Board signed
them. It is small per page. On a regional bank's page before 2017 it is often the one regulatory
event.

**Cost:** none; the files are already read.
**Effort:** small:
- 23 rows, each a legal-name pattern and a city;
- the hand read is done above, and would be redone on the day of the build;
- the counts re-pinned.

**Verified by:** `check:fed-actions` cases on rows from both files:
- Arrow Financial's agreement of 1992-07-22 lands on AROW, and Hanmi's of 2009-11-02 on HAFC;
- MetLife's order of 2011-04-13 and penalty of 2012-08-06 land on MET, and Jack Henry's of
  2013-12-04 on JKHY;
- Commerce Bancshares of Catoosa, Oklahoma lands on no page, nor Centennial Bank of Lubbock on HOMB,
  nor Community West Bancshares of Goleta's 2012 agreement on CWBC;
- every mapped bank's count is re-pinned.

On main the new cases fail: none of the 23 is in `FED_BANKS`.

**Depends on:** nothing.

**Buildable by:** a cloud session; www.federalreserve.gov answered from here (measured).

*Importance:* medium-low — one to three events on each of 23 bank pages, 23 days before 2017 ·
*Efficiency:* high — rows in a map, no new source · *Practicality:* high — the same rule and files
as batch 69

---

## Considered and cut

- **Not reachable from here, so not measured:**
  - **The FTC's cases and proceedings** (mergers and consumer-protection orders, every sector). Both
    requests answered 404 with a page that is not the FTC's. Worth a measured note from the owner's
    host.
  - **The OCC's enforcement search** (the national banks themselves). Its page answered this time,
    but its script redirected to the OCC's home page, as on 2026-10-28.
  - **USDA FSIS meat and poultry recalls:** 403, "Access Denied", as on 2026-10-28.
- **The FDIC's failed-bank list.** The 2026-11-02 cut gave two reasons. #4's unit map is now built;
  the licence is still not stated. The BankFind API documentation (api.fdic.gov/banks/docs/) says
  nothing about reuse either, as the website policies did not. Reopen it only with the FDIC's own
  words.
- **The FDA and vehicle maps' units in the release rules** (cheap leverage, measured offline). 132
  unit names on 49 companies (`FDA_FIRMS`, `RECALL_MAKERS`) were replayed on the saved 30,747 SEC
  case rows and 6,897 SEC releases. They gave 1 new day, and that came from GSK's own older name
  ("GlaxoSmithKline plc", 2016-09-30), not from a unit. The Justice Department's releases are
  likelier to name the drugmakers' units, but none is saved for a unit and I did not ask.
- **EPA's informal actions and inspections,** in the same file (`EPA_INFORMAL_ENFORCEMENT_ACTIONS`,
  `ICIS_FEC_EPA_INSPECTIONS`): volume without an event a reader needs.
- **The SEC cases' accounting-release numbers as a label** (3,221 of the 30,747 rows carry an AAER
  number): a label, not depth.
- **Not measured, so not proposed:** the Treasury's TARP capital purchases (2008–2014); NTSB
  aviation accidents, for the airlines; PHMSA pipeline incidents, for pipelines and gas utilities.
- **Still waiting, not raised again:** the 2026-11-02 #2 and #3, unmarked; CPSC recalls; JCI's 2016
  case; GE Capital Retail Bank and PayPal's 2015 action; the Digest's step 2.
- **Re-prioritisations:** none. The open items nearest securities depth (the GDELT backfill's
  production watch, the 203 held-back everyday-word names, the paid-tier evidence) still need the
  production host or a key.
- **Anything touching another product:** nothing here reads, references or connects to another
  product's repository.

*One closing note, not a proposal* — noticed in passing: `captionParty` reads "Pennsylvania Power
and Light Company" as Light S.A.'s party "Light Company", and a trailing given name ("Retherford,
Dana", "Faye, Ball") as a one-word company. No saved SEC caption has the first shape. I did not
search the saved rows for the second, or replay the Board's and the Bureau's rows for either; the
`code-auditor` may want to check.
