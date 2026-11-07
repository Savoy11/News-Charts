# Opportunity proposals — 2026-11-07

**Commit:** d349d4bfad74506eec77f9ea3fae34704868a1d3 (`claude/lucid-goodall-6km6ea`, equal to `origin/main` after batch 111) · **Reviewed:** `CLAUDE.md`; `README.md` (the regulator sections, "Data sources", "Sources evaluated and rejected"); `docs/MASTER-CHECKLIST.md` (the batch 103–111 ledgers, Scope refocus and its open boxes); `docs/COVERAGE-MAP.md`; `docs/OWNER-ACTIONS.md`; `docs/decisions/2026-09-28-business-decisions.md`; `docs/audits/2026-11-07-code-audit-b101-106.md` whole; `docs/proposals/2026-11-06-proposals.md` whole, `2026-10-22-news-sources.md`, and the "Considered and cut" sections of 2026-10-17, 10-26, 10-28, 11-01, 11-02 and 11-05; code: `lib/epaCases.ts` (`readCases`, `UNITS`, `ownRow`, `epaEvents`), `db/037_epa_cases.sql`, `lib/fdaApprovals.ts` (`APPLICANT_NAMES`, `approvalIsCompany`, `approvalEvents`), `lib/releaseNames.ts` (`NOTES_RECORDS`); data: `data/edgar-tickers.json`, `data/fda-nme-approvals.json`, `scripts/fixtures/epa-cases-slice.json.gz`, `scripts/fixtures/doj-archive-months.json.gz`, and the scratch copies named below · **Proposals:** 3

> - **No rejection log exists** (`docs/audits/rejected-proposals.md`), and nothing has been
>   rejected. Every proposal of 2026-11-06 is approved and built (batches 104–106), so nothing
>   carries forward. Nothing here was deferred.
> - **Owner calls already open, not raised again:** JCI's 2016 case on Tyco's record; GE Capital
>   Retail Bank on GE; PayPal's 2015 CFPB action on eBay; whether the Digest keeps the first-price
>   floor; the Digest's names older than EDGAR's (Caterpillar Tractor). The recorded leftovers are
>   not proposals either: FBP's 2007 litigation release, the 9 pre-2000 CPSC recalls naming plain
>   "Toro", BP Amoco Chemical's rows after the 2020 INEOS sale.
> - **One proposal reopens an item an earlier run cut,** and says what changed: #2 reopens "a
>   drug's later indications in Drugs@FDA, where the sponsor-ownership problem returns" (2026-11-06,
>   not measured). Batch 105's compilation now gives each new drug's applicant at approval, so an
>   application whose holder never changed can be told from one that did.
> - **Saved data used instead of the network:** batch 95's copy of EPA's case file (the copy of
>   2026-10-31, 137,108 cases, all 22 tables) and the 2026-11-07 audit's parse of it; the committed
>   fixtures; the first trading days batches 87, 94 and 103 read. Each was read as data, with
>   `python3 -I`, or through the repository's own functions from a script in the scratchpad.
> - **Measured live on 2026-11-07 from this container.** Every figure below is measured unless it
>   says it is an estimate. Requests, by host:
>   - query1.finance.yahoo.com 22: first trading days of 22 utilities (#3);
>   - www.accessdata.fda.gov 18: 12 approval letters of a random sample (#2). 6 were first asked at
>     the `http://` address the dataset gives, which this container cannot resolve (no answer), and
>     then at `https://` (answered 200);
>   - download.open.fda.gov 2: Drugs@FDA (9.2 MB) and the device approvals file (22.3 MB);
>   - api.fda.gov 1: one device-approval query;
>   - open.fda.gov 1: the licence page.
>
>   That is 44 requests: 38 answered 200, and 6 had no answer. Each carried the User-Agent `News
>   Charts Research`, with no email address, at least 1.2 s after the one before. No
>   www.sec.gov or data.sec.gov page was asked, and neither was GDELT, Wikipedia, Wikidata or the
>   Federal Register. Postgres was not used. The log is in the session scratchpad
>   (`b112/requests.log`).
> - **Nothing here needs a key, a paid tier or a recurring charge.** #1 reads one more table and three
>   more columns of a file already read every month. #2 is a new dataset from openFDA, under the CC0 dedication
>   quoted from its page. #3 adds rows to a list a built source already reads.
> - Ranked by importance, securities depth first:
>   1. EPA's own figures on the case rows pages already hold: the penalty its settlement record
>      gives where the case total is blank, and the cost of the work ordered;
>   2. new indications and other efficacy supplements, for drugs whose holder never changed;
>   3. EPA's cases against the utilities' operating companies: Georgia Power, Appalachian Power,
>      Public Service Electric and Gas, Virginia Electric and Power…

Mark each proposal below: `APPROVED`, `REJECTED`, or `DEFERRED`, and add a
reason for anything rejected. Then run the scout in FILE mode.

---

## 1. EPA's own figures on the case rows pages already hold: the penalty its settlement record gives, the cost of the work ordered, and (optionally) its summary · proposed `P1` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** PENDING
**Owner's reason (if rejected):**

**Raised before:** no. EPA's inspections and informal actions were cut on 2026-11-05 ("volume
without an event a reader needs"); this is not that. It reads one more table and three more columns
of the same zip, for the rows already on the pages.

**Anchor:** data collected and never surfaced. The monthly walk downloads EPA's whole case file, 22
tables. `readCases` (`lib/epaCases.ts:96`) reads four of them, and from `CASE_ENFORCEMENTS.csv`
only the case's name, type, total penalty and docket. `db/037_epa_cases.sql` keeps nothing else.
Left unread in the same download:
- `CASE_ENFORCEMENT_CONCLUSIONS.csv`: each settlement's federal and state penalty, its supplemental
  projects, its cost recovery, and EPA's estimate of the cost of the work it orders
  (`COMPLIANCE_ACTION_COST`);
- `CASE_ENFORCEMENTS.csv`'s own `TOTAL_COMP_ACTION_AMT`, `TOTAL_COST_RECOVERY_AMT` and
  `ENF_SUMMARY_TEXT`, EPA's own summary of the case.

**What:** two parts, each approvable alone.
- **(a) The money, in its own words.**
  - A case with one settlement and no case total takes the settlement's penalty, federal plus
    state, as EPA's figure. A case with several settlements keeps its case total, as now: summed,
    one row would carry other parties' settlements of other years.
  - The row names the work ordered: "…; work ordered: $1,923,940,000 (EPA's estimate)". On a case
    of several parties it says the figure is the settlement's whole: "among 225 parties".
  - A case EPA records a penalty for gets its own row, not a place in "orders or complaints with
    no penalty" (`ownRow`).
  - Money stays numeric, never float, as EPA writes it.
- **(b) EPA's summary, as the row's description.** Shown only when it says something: over a
  length floor, and not a bare date, address or form note ("CASE SUMMARY REQUESTED"). Whitespace is
  collapsed, a word broken at a line end ("INITIA- TIVE") is joined, and EPA's capitals are kept as
  written. The case report link stays for the rest.

**Licence:** no new source. EPA's case file was approved on 2026-11-05 with both of EPA's texts in
front of the owner (quoted in `lib/epaCases.ts`). What it adds is fields of the same file, data EPA
produced.

**Grounded in:**
- **The replay.** Every index company's rows were rebuilt with the current code on the committed
  slice (`epaEvents`, as batch 104's replay builds them): 7,428 rows on 670 companies (the ledger's
  7,427), 7,026 of them a case's own row and 402 month rows. Each row was then joined to the saved
  file's tables by case number. Like the ledger's, these counts are before first prices; "before
  2017" is by the row's day.
- **(a) Penalties the pages leave out.**
  - 1,122 own rows, 779 of them before 2017, show no penalty though EPA's settlement record holds
    one. Most of the cases behind them have a single settlement, so the figure is the case's: under
    that rule 1,079 rows gain a penalty, 755 of them before 2017.
  - Of the 931 cases inside "no penalty" month rows, 246 have a penalty in EPA's settlement record.
  - **Left as they are:** the 44 cases of several settlements and no case total. Deepwater Horizon
    is one: its four settlements (MOEX 2012, Transocean 2013, BP and Anadarko 2015) each name their
    own party in free text, and the row's day is Anadarko's. Splitting a case by settlement is a
    larger build, not proposed.
  - **Where both figures exist they agree.** Of 810 page cases with a case total and one
    settlement, 797 match federal plus state to the dollar, 12 match the federal share, and 1
    differs ($15,000 against $11,000).
  - **Before 2017, for example:**

    | Page | Row today | EPA's settlement record |
    | --- | --- | --- |
    | AEP | 2007-10-09, "EPA consent decree (Clean Air Act), and 1 more case that day": its national New Source Review decree | $6,225,000 and $750,000 federal penalties on the two cases; work ordered $1,923,940,000 and $231,800,000 |
    | BP | 2009-02-19, "EPA consent decree (Clean Air Act)": the Texas City refinery | $12,000,000; work $161,000,000 |
    | BP | 2011-05-03, "EPA consent decree (Clean Water Act, Clean Air Act)": BP Exploration (Alaska) | $20,500,000; work $60,500,000 |
    | ExxonMobil | 2005-10-11, its Texas and Louisiana refineries | $4,505,902 federal, $900,000 state; work $153,630,000 |
    | Norfolk Southern | 2010-03-08, "EPA consent decree (Clean Water Act, Superfund law…)" | $4,000,000 |
    | Tyson Foods | 2013-04-04, "EPA consent decree (Clean Air Act)" | $3,950,000 |

    Since 2017: Cummins on 2024-01-10, $1,478,000,000 federal and $197,000,000 state, the RAM
    diesel case, whose row shows no penalty; Mercedes-Benz $875,000,000 (2020); Toyota
    $180,000,000 (2021).
- **(a) The work ordered,** under the same rule (a case of several settlements gives only its case
  total):
  - 2,523 own rows (2,120 before 2017) gain EPA's estimate of the cost of the work ordered.
  - 1,388 of them are cases of three defendants or fewer, 103 of those for $10 million or more.
  - The other 1,135 are multi-party settlements, mostly Superfund, where the figure is the whole
    settlement's: that is why the row must say "among N parties".
  - Also in the record: cost recovery on 2,460 rows, supplemental projects on 155.
  - In all, 4,774 of the 7,026 own rows gain at least one figure.
- **(b) The summaries.**
  - 4,203 of the 4,630 distinct cases on own rows carry one. Length: median 299 characters, 90th
    percentile 1,158, longest 4,000.
  - 2,393 are in capitals. 171 have a word broken at a line end, and 28 a broken character
    ("ï¿½").
  - **Read by hand:** a fixed random sample of 30 own rows before 2017.
    - 20 say what was wrong or what was ordered: CSX Transportation's 1,900-gallon diesel spill
      (2003), Kodak's PCB storage (1993), "Caterpillar Inc. produced 320,000 engines containing
      defeat devices since 1988" (1998).
    - 4 say a little: a site's history, a procedural note.
    - 6 say nothing: two are empty; the rest are "CASE SUMMARY REQUESTED", "'COST RECOVERY'", an
      address, and "ORDER ISSUED TO ONE RESPONDENT".
  - Outside the sample, AEP's 2007 decree reads only "CONSENT DECREE ENTERED ON 12/10/07", and one
    of Toyota's reads " .". Hence the floor.

**Who benefits and how:** Readers of the 670 pages with EPA rows. The changes that matter most are
on the largest cases.
- AEP's page holds its 2007 decree as a bare "consent decree". The Justice Department's release
  of it, in the committed archive fixture, is titled "U.S. Announces Largest Single Environmental
  Settlement in History" (07-797).
- Cummins's page holds its 2024 diesel decree, $1.675 billion in EPA's record, with no figure.

The cost of the work ordered is often the material number: $1.9 billion of pollution controls
against a $6 million penalty. In the hand-read sample, the summary turns two thirds of the rows
from a form name into a sentence.

**Cost:** none; the file is already downloaded every month.
**Effort:** small for (a), small to medium for (b):
- `readCases` reads one more table (17 MB uncompressed) and three more columns;
- a migration adds the columns to `epa_cases`;
- titles and lines in `caseTitle`/`caseLine`;
- the committed slice gains the conclusions table for the slice's cases, and the replay counts are
  re-pinned.

Rows that move from a month row to their own row keep their attestations, by the `legacyDedupBasis`
mechanics batch 100 built; check that at the build.

**Verified by:** new `check:epa-cases` cases on the slice:
- AEP's 2007-10-09 row carries both penalties and "work ordered";
- Cummins's 2024-01-10 row carries $1,675,000,000;
- the Deepwater Horizon case (04-2010-9036, four settlements of 2012–2015, no case total) shows no
  penalty rather than a sum of four parties' settlements;
- a 225-party Superfund decree says "among 225 parties";
- a no-penalty month row no longer holds a case with a settlement penalty;
- a summary under the floor is not shown;
- money is a string of digits throughout.

On main the new cases fail: no settlement is read.

**Depends on:** nothing.

**Buildable by:** a cloud session, offline; the saved file and the slice are enough.

*Importance:* high — a penalty on 1,079 rows that show none, and the work ordered on 2,523, across
670 pages · *Efficiency:* very high — the same download, one more table · *Practicality:* high —
measured on the saved file; (b) needs a floor tuned by hand

---

## 2. New indications and other efficacy supplements, on the page of the company that held the drug — a dataset for the owner to decide · proposed `P2` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** PENDING
**Owner's reason (if rejected):**

**Raised before:** yes, as a line, never measured.
- The 2026-11-06 file listed "a drug's later indications in Drugs@FDA, where the
  sponsor-ownership problem returns" under "Not measured, so not proposed".
- The 2026-10-26 file cut Drugs@FDA's original approvals because its sponsor is today's holder.

**What changed:** batch 105 committed the FDA's compilation, whose applicant is the one in the
approval letter. Where Drugs@FDA's sponsor today is that same applicant, the holder never changed,
and the application's supplements were that applicant's on their days. Where the two differ, the
day it changed is unknown, and the application's supplements stay off. That is Lipitor's case, or
Humira's.

**Anchor:** a capability built for one kind of FDA approval and missing for the next. Since batch
105 a drugmaker's page carries each new drug's approval. The approvals that follow, which often move
the stock more, appear nowhere unless an 8-K or a headline carries them: Keytruda's first-line lung
cancer approval (2017), Remicade for psoriasis (2006), Viread for hepatitis B (2008).

**What:** the owner's decision on a new dataset first. If yes:
- read Drugs@FDA's file (`download.open.fda.gov/drug/drugsfda/drug-drugsfda-0001-of-0001.json.zip`,
  9.2 MB) on the compilation's schedule or monthly;
- for each compilation application whose Drugs@FDA sponsor is its applicant by name, keep each
  approved efficacy supplement (`submission_class_code` "EFFICACY", status "AP") on its day;
- give it to a company by batch 105's rule unchanged (`approvalIsCompany`, with `FDA_FIRMS`,
  `APPLICANT_NAMES` and `NOT_THE_APPLICANT`), from the company's first price. A unit's
  supplements count from the day its owner bought it: Celgene's on BMS from 2019-11-20.
  Schering's before the 2009 merger take batch 110's label;
- **the title says only what the data says,** with two choices for the owner:
  - from the data alone: "FDA approves an efficacy supplement to Keytruda (pembrolizumab)", with
    the review priority and the approval letter linked;
  - or each letter read once and its sentence kept: "…provides for a new indication…". Kept the
    way 8-K headlines are kept (`sec_headlines`), at about 900 PDFs once and then about 60–85 a
    year (an estimate from 2020–2025's counts).

  Either way, a row never says "new indication" unless the letter does.

**Licence:** "unless otherwise noted, the content, data, documentation, code, and related
materials on openFDA is public domain and made available with a Creative Commons CC0 1.0 Universal
dedication. … You can copy, modify, distribute and perform the work, even for commercial purposes,
all without asking permission." (open.fda.gov/license, "Data Licensing", last modified 2014-05-27,
read 2026-11-07.) The letters are FDA documents under the FDA website policies batch 105 quoted. No
key.

**Grounded in:**
- **The file** (openFDA's copy of 2026-11-06): 29,446 applications, 5,600 efficacy supplements in
  all. 1,351 of the compilation's 1,387 approvals are in it, with 3,132 approved efficacy
  supplements.
- **Holder unchanged.** A strict name test (legal words and punctuation removed, one name a prefix
  of the other) passes 523 applications, which hold 1,557 supplements. A looser one passes 702 and
  1,892 by also accepting a shared distinctive word ("Eli Lilly" and "LILLY", "Novartis
  Pharmaceuticals" and "NOVARTIS PHARMS CORP"). The build picks the test; both counts follow.
- **On pages,** through batch 105's own rule, run from a scratch script on every index company:
  - **strict, before first prices:** 976 supplements on 28 pages, 355 before 2017;
  - **strict, from first prices:** 973 on 27 pages, 352 before 2017, 121 before 2005. The floor
    takes off Organon's one (OGN lists from 2021) and two of Sanofi's. Yahoo's first days, saved by
    batch 103, cover 20 of the 28 pages; the other 8 (Incyte, SIGA, Solvay and five with one row
    each) keep their 22 rows unfloored. By decade: 1990s 51, 2000s 140, 2010s 338, 2020s 444;
  - **loose, before first prices:** 1,119 on 29 pages, 428 before 2017;
  - **most (strict, from first prices; before 2017 in brackets):** Merck 179 (51), Bristol-Myers
    Squibb 160 (73), Johnson & Johnson 79 (37), Lilly 72 (31), Novartis 69 (31), Gilead 64 (29),
    AstraZeneca 61 (12), Amgen 58 (30), AbbVie 45 (1), Regeneron 38 (4), Sanofi 30 (8), Pfizer 30
    (7).
- **Read by hand, for false matches:**
  - a fixed random sample of 25 rows: every one is the applicant's company on the supplement's day
    (Remicade through Centocor on J&J, Novolog on Novo Nordisk, Prevymis on Merck…);
  - all 58 page-and-sponsor pairs: each is the company's own name, a unit on its days (Centocor,
    Genzyme, Human Genome Sciences, Ablynx, Celgene, Organon on Akzo Nobel, then Merck, then
    Organon & Co.), Schering on Merck under batch 110's label, or GE HealthCare on GE and then on
    GEHC.
- **What a supplement is,** in 12 approval letters of a fixed random sample. This is an estimate:
  about 60% are new indications.
  - 7 add a new indication: Remicade, plaque psoriasis (2006); Viread, chronic hepatitis B (2008);
    Keytruda with chemotherapy, first-line non-squamous lung cancer (2017, accelerated); Verzenio,
    adjuvant breast cancer (2021); Rinvoq, ankylosing spondylitis (2022); Imfinzi, endometrial
    cancer (2024); Keytruda, muscle-invasive bladder cancer (2026);
  - 1 widens a population: Dupixent for eosinophilic esophagitis down to age 1 (2024);
  - 3 change labelling or dosing: Reyataz's pediatric dosing (2011), Brilinta in dialysis (2019),
    a new Skyrizi presentation (2025);
  - 1 link is a correction notice, not the approval: Opdivo S-092 (2021).

  8 of the 12 say what they provide in one sentence a simple pattern finds ("provides for…", "adds a
  new indication…"). 895 of the 976 rows carry a letter link.
- **Left off, as the rule requires:** applications whose holder changed and Drugs@FDA does not say
  when. These include GSK's oncology drugs now Novartis's (40 supplements), Abbott's now AbbVie's
  (43, Humira among them), Merck's now Organon's (37), Pfizer's now Viatris's (18), and BMS's
  diabetes drugs now AstraZeneca's (15). Some are a change of name inside one company that the
  name test cannot see: Pfizer's held by its Dutch company PF Prism (36), Merck's by "MSD SUB MERCK"
  (23). A later hand list could date or join some of these, as batch 105 did for units; it is not
  proposed here.
- **Not measured:** overlap with what pages already hold. From 2017, GDELT headlines ("FDA approves
  Keytruda for…") and 8-K press releases will carry some; before 2017 few pages hold them.

**Who benefits and how:** Readers of the 27 drugmakers' pages: Merck, BMS, J&J, Lilly, Novartis,
Gilead, AstraZeneca, Amgen. A new indication is often the approval that moves a drugmaker's stock
in the years after launch. It lands on its own day with the FDA's letter, 352 of them before 2017.

**Cost:** none recurring beyond one 9 MB file; no key. Reading the letters, if chosen, is about 900
requests once to www.accessdata.fda.gov, at a second apart, then about 60–85 a year. The dataset
links some letters at `http://`, which must be asked at `https://`.
**Effort:** medium:
- a reader for the file and the holder test;
- the company step reusing `approvalIsCompany`;
- titles, and the letter reader if chosen;
- registered in `SOURCES`, credited, scored without the model;
- a committed fixture of the matched applications.

**Verified by:** a new `check:fda-supplements`, on a committed slice of the file:
- Keytruda's S-016 of 2017-05-10 lands on MRK;
- Remicade's psoriasis supplement of 2006-09-26 lands on JNJ, through Centocor;
- a Humira supplement lands on no page (holder changed);
- a Schering supplement before 2009-11-03 carries batch 110's label on MRK;
- an Organon supplement before 2007-11-19 lands on AKZOY;
- a Celgene supplement before 2019-11-20 lands on no page;
- an `http://` letter is asked at `https://`;
- a title never says "new indication" without the letter.

On main it cannot run: the reader does not exist.

**Depends on:** the owner's yes; batch 105's committed compilation.

**Buildable by:** a cloud session; both FDA hosts answered from here (measured).

*Importance:* medium-high — a drugmaker's most price-relevant later approvals, 352 before 2017 on
27 pages · *Efficiency:* high — one small file, batch 105's rule reused · *Practicality:* medium —
the holder test and the title choice; about 60% of rows are new indications, so honest titles need
the letters or careful wording

---

## 3. EPA's cases against the utilities' operating companies: Georgia Power, Appalachian Power, Public Service Electric and Gas, Virginia Electric and Power… · proposed `P2` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** PENDING
**Owner's reason (if rejected):**

**Raised before:** only as a line. Batch 104 lists, under "Left for later", "the other ~630
companies with EPA rows, whose units no one has read" (`docs/MASTER-CHECKLIST.md:1533`).

**Anchor:** capability asymmetry inside one source. `UNITS` (`lib/epaCases.ts:282`) reads Entergy's,
Duke Energy's, Con Edison of New York's and PPL's operating utilities, and no other utility's. An
electric or gas holding company's plants, pipes and Superfund shares are held by operating companies
whose names do not carry the parent's: "Georgia Power Company" is Southern's, "Ohio Edison" is
FirstEnergy's, "Virginia Electric and Power" is Dominion's. Neither the caption rule nor any alias
reads them. In the replay below, which leaves former names aside as batch 104's did, PSEG's page
has 0 EPA rows, Exelon's 0, NextEra's 0, NiSource's 0, DTE's 0 and WEC's 0.

**What:** about 60 more unit patterns in `UNITS`, on 31 utility holding companies, each with the
days its owner held the unit, read from EDGAR. These operating companies file their own records,
and data.sec.gov's filing lists answer from here. My draft:

| Company | Units (from, if not its own throughout; my estimates, to be read from filings) |
| --- | --- |
| Southern | Alabama Power, Georgia Power, Mississippi Power, Savannah Electric, Southern Company Services, Southern Nuclear; Gulf Power to 2018-12-31; Southern Company Gas's utilities from 2016-07-01 |
| AEP | Appalachian Power, Ohio Power, Columbus Southern Power, Indiana Michigan Power, Kentucky Power, AEP Service Corp.; Southwestern Electric Power, Central Power and Light, West Texas Utilities and PSO from 2000-06-15 |
| FirstEnergy | Ohio Edison, Cleveland Electric, Toledo Edison, Penn Power from 1997-11-08; JCP&L, Met-Ed, Penelec from 2001-11-07; Monongahela, Potomac Edison, West Penn, Allegheny Energy Supply from 2011-02-25 |
| Dominion | Virginia Electric and Power, Dominion's named units; CNG Transmission and East Ohio Gas from 2000-01-28; South Carolina Electric & Gas from 2019-01-01 |
| Exelon / Constellation | ComEd and PECO from 2000-10-20; BGE from 2012-03-12; Pepco, Delmarva, Atlantic City Electric from 2016-03-23; Exelon Generation to 2022-01-31, then Constellation's |
| PSEG, Xcel, Edison International, PG&E, Sempra | PSE&G and PSEG Fossil/Power; Northern States Power, and PSCo and SPS from 2000-08-18; Southern California Edison; Pacific Gas and Electric; SDG&E and SoCalGas from 1998-06-26 |
| Ameren, DTE, CMS, NiSource, WEC, Alliant | Union Electric and CIPS from 1997-12-31, CILCO, Illinois Power 2004–2013; Detroit Edison/DTE Electric, MichCon from 2001-05-31; Consumers Power/Energy; NIPSCO, Columbia Gas from 2000-11-01; Wisconsin Electric, Wisconsin Gas, and WPS, Peoples Gas, North Shore Gas from 2015-06-29; Interstate Power and Light, IES, Wisconsin Power and Light |
| Others | NextEra (FPL; Gulf Power from 2019-01-01), Eversource (CL&P; PSNH from 1992-06-05; NSTAR from 2012-04-10), National Grid (Niagara Mohawk from 2002-01-31, NEES's companies from 2000-03-22, KeySpan from 2007-08-24), Pinnacle West (APS), CenterPoint, OGE, IDACORP, TXNM, Hawaiian Electric, MGE, AES (IPL from 2001-03-27, DP&L from 2011-11-28), PPL (LG&E and KU from 2010-11-01), Duke (Cinergy's from 2006-04-03, Progress's from 2012-07-02, Duke Power), Con Edison (Orange and Rockland from 1999-07-08), Vistra, Evergy |

One guard is needed already: "MISSISSIPPI POWER & LIGHT" is Entergy Mississippi's old name, not
Southern's Mississippi Power.

**Licence:** no new source. EPA's case file is already read once a month (approved 2026-11-05).

**Grounded in:**
- **Replayed** on the audit's parse of the saved file. Each pattern was applied inside its days and
  from the company's first price (Yahoo's, read today for 22 of them and saved for 8; Duke's,
  ED's and Vistra's not read). Cases already on the company's page by the current rules were left
  out.
- **The gain:** 442 cases on 31 companies.
  - 213 are a court case or a penalty, 186 of them before 2017, on 207 company-days. The other 229
    are no-penalty orders, which group a row a month, so rows are fewer than cases (an estimate).
  - **Cases added:** PSEG 0→44, Southern 3→42, AEP 6→42, Dominion 3→37, Alliant 1→30, Exelon 0→22,
    National Grid 5→26, NextEra 0→20, CMS 1→19, NiSource 0→17, DTE 0→16, Xcel 6→21, Eversource
    3→18, FirstEnergy 5→19, WEC 0→13, Pinnacle West 1→13. Before → after counts the cases on the
    page now, as case numbers.
  - 13 companies with no EPA row today gain some: PSEG, Exelon, NextEra, NiSource, DTE, WEC,
    Hawaiian Electric, OGE, TXNM, MGE, IDACORP, Vistra, Evergy.
- **What they include,** with #1's figures from EPA's settlement record:
  - Ohio Edison's New Source Review decree, 2005-03-18 ($8,005,000);
  - NIPSCO's, 2011-07-22 ($3,300,000; work ordered $609,500,000);
  - Consumers Energy's, 2014-09-16 ($2,750,000; $1,000,000,000);
  - Interstate Power and Light's, 2015-07-15 ($733,333 federal and $366,667 state; $620,000,000);
  - the Virginia Electric and Power and Wisconsin Electric decrees.
- **A few are already on an operating company's own page,** where its notes or preferred shares
  trade, and stay there: Wisconsin Electric's 4 on WELPP; Union Electric's 2 on UELMO, which lists
  from 2008; Georgia Power's 1 on GPJA, which lists from 2018. A reader of WEC, AEE or SO sees none
  of them. Before those pages' first prices, the rest are on no page.
- **Read by hand, for false matches:**
  - every distinct defendant name each pattern takes, 257 in all: one is wrong, the Entergy name
    above;
  - a fixed random sample of 25 added cases: every one names the owner's operating company inside
    the days given. Florida Power & Light's Martin plant (2007) on NextEra; Jersey Central and
    Met-Ed in the Metal Bank decree (2018) on FirstEnergy; PSEG Fossil among 90 parties to a BASF
    case (2023); Brooklyn Union Gas d/b/a National Grid (2018).
- **How it meets the existing rules:**
  - each pattern is anchored at the start of a defendant name, as batch 104's are;
  - each unit counts only on its days, and a joint venture is no owner's;
  - `NOT_THE_COMPANY` is unchanged: no pattern takes a listed company's own name from another
    company;
  - the first-price floor applies on top.
- **The days are my reading**, from memory of the deals. Each is to be read from the filing lists at
  the build, as batch 104 read its 24: Gulf Power's sale to NextEra, the Allegheny merger, the
  Integrys purchase, and the rest.
- **The same units elsewhere, not replayed.** The Justice Department archive's month pages
  (committed fixture) name several of these companies in titles of 2001–2008:
  - PSEG Fossil (2002-01-24 and 2006-11);
  - Wisconsin Electric Power (2003-04-29);
  - Ohio Edison (2003-08 and 2005-03);
  - Alabama Power (2004-02-17 and 2006-04);
  - FirstEnergy Nuclear Operating Company (2006-01, Davis-Besse, $28 million).

  Whether today's Justice rule already gives any to the parent was not replayed. Adding the units to
  the release map (`lib/releaseNames.ts`) is a choice for the build.

**Who benefits and how:** Readers of 31 utilities: Southern, AEP, Dominion, PSEG, Exelon, NextEra,
FirstEnergy, Xcel, DTE, CMS, NiSource, WEC, Alliant. EPA's record of their coal plants, gas works
and Superfund shares lands on the page, from nothing for 13 of them. Their largest Clean Air Act
decrees are among the most material events these pages can hold before 2017. This is a smaller gain
than batch 104's (1,382 rows before 2017), but for a whole sector.

**Cost:** none; the file is already read.
**Effort:** medium:
- about 60 patterns, and about 35 days to read from data.sec.gov filing lists;
- one guard;
- the slice rebuilt with the units' keys, and the replay counts re-pinned.

**Verified by:** new `check:epa-cases` cases:
- NIPSCO's 2011-07-22 decree (05-2004-4533) lands on NI;
- Consumers Energy's 2014-09-16 decree (05-2008-3000) lands on CMS;
- Ohio Edison's 2005-03-18 decree (03-2000-0016) lands on FE, and an Ohio Edison case before
  FirstEnergy's formation on no page;
- a Gulf Power case lands on SO before 2019 and on NEE after;
- "MISSISSIPPI POWER & LIGHT" is refused for SO;
- a Georgia Power case of 2023 (04-2022-3204) lands on both SO and GPJA, and one of 1995
  (04-1995-0057) on SO only, GPJA listing from 2018.

On main the new cases fail: none of these units is in `UNITS`.

**Depends on:** nothing. It reads better with #1, which gives these decrees their money.

**Buildable by:** a cloud session.

*Importance:* medium — 213 court or penalty cases, 186 before 2017, on 31 utilities, 13 of them
empty in this source today · *Efficiency:* high — one list; the source is already read ·
*Practicality:* medium — about 35 ownership days to read from filings

---

## Considered and cut

- **Device approvals (PMA), measured and cut.**
  - **The file:** openFDA's PMA file of 2026-11-02 holds 57,421 records: 1,483 original approvals
    from the 1960s, 1,143 of them before 2017, and 471 panel-track supplements, the device
    equivalent of a new indication.
  - **Why it is cut:** the applicant is today's holder, not the one that applied:
    - St. Jude Medical's bileaflet heart valve of 1982 (P810002) and its pacemakers of 1989 read
      "ABBOTT MEDICAL"; Abbott bought St. Jude in 2017;
    - "Boston Scientific" holds a 1981 Cyberlith pacemaker and a 1990 Mansfield aortic valve;
    - "Edwards" holds a 1980 lung-water computer from Baxter's years;
    - and the name does not move consistently either: Guidant's supplements of 2019 and 2023 still
      read "Guidant Corp." inside Boston Scientific.

    This is the problem that cut Drugs@FDA's originals on 2026-10-26, and here no compilation
    gives the original applicant. Reopen it only with one.
- **Drug supplements whose holder changed** (Humira, GSK's oncology drugs, Upjohn's): left out of
  #2, since Drugs@FDA does not say when they changed hands. Dating them by hand is a possible
  follow-up, not proposed.
- **Other units in EPA's file, not measured:** pipelines (El Paso Natural Gas and Tennessee Gas on
  Kinder Morgan from 2012, Texas Eastern on Enbridge from 2017), and conglomerates' named companies
  (BNSF on Berkshire from 2010; Pratt & Whitney, Otis, Carrier and Sikorsky on RTX's record, each to
  its separation). A follow-on to #3 if it is approved.
- **EPA's facility table** (`CASE_FACILITIES`: the plant's name, city and state): a place line,
  mostly said already by #1's summary or the case name. Not proposed on its own.
- **Not retried:** the FTC, the OCC and FSIS (unreachable on 2026-11-05); the FDIC's failed-bank
  list (still no licence wording); TARP and OFAC (measured and cut on 2026-11-06). Not measured: the
  NTSB, PHMSA.
- **Owner decisions and recorded leftovers, not raised:** listed in the header.
- **Re-prioritisations:** none. The open items nearest securities depth still need the production
  host or a key: the Digest walk (`NEWS_CHARTS_CONTACT` and `pdftotext`), the GDELT backfill's
  production watch, the 203 held-back everyday-word names, the paid-tier evidence.
- **Anything touching another product:** nothing here reads, references or connects to another
  product's repository.

*One closing note, not a proposal* — noticed in passing. 246 cases sit in EPA's "orders or
complaints with no penalty" month rows although EPA's settlement record gives them a penalty
(`ownRow` reads only the case total). #1 fixes it, but the `code-auditor` may want it on its own.
Separately, and not checked further: EPA's milestones give Wisconsin Electric's case (05-2003-0333)
a complaint filed 2003-04-29 and an order lodged 2014-07-08, and Virginia Electric and Power's
(03-2000-0138) a complaint of 2003-04-21 and an order of 2016-09-20. Their rows take the later day,
which may be a later amendment's rather than the settlement's.
