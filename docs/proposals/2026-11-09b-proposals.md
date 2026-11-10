# Opportunity proposals — 2026-11-09 (second run)

**Commit:** 58851b403fd340ab230ec170674e46c262139381 (`claude/lucid-goodall-6km6ea`, equal to `origin/main` after batch 130) · **Reviewed:** `CLAUDE.md`; `.claude/agents/opportunity-scout.md`; `README.md` ("Data sources", "Sources evaluated and rejected"); `docs/COVERAGE-MAP.md`; `docs/OWNER-ACTIONS.md`; `docs/decisions/2026-09-28-business-decisions.md` (D3); `docs/MASTER-CHECKLIST.md` (the batch 125–130 ledgers, the batch 53, 55 and 117–118 ledgers for the predecessor map and the taken-names scan, Scope refocus and its open boxes, the legend); `docs/proposals/2026-11-09-proposals.md` whole, and the "Considered and cut" sections of 2026-11-05, 11-06, 11-07 and 11-08; `docs/audits/2026-11-09-code-audit-b125-129.md`; code: `lib/doj.ts` (`ACTION`, `ALONGSIDE`, `CLAUSE_START`, `UNIT`, `releaseNamesParty`, `namedAsSubject`, `dojEvents`), `lib/cftc.ts` (`cftcNamesParty`, `cftcEvents`), `lib/dojArchive.ts`, `lib/releaseNames.ts`, `lib/railAccidents.ts` (`FIELDS`, `accidentQuery`, `accidentEvents`, `RAIL_OWNERS`), `lib/cpscRecalls.ts` (`parseRecalls`, `cpscEvents`), `lib/epaCases.ts` (`UNITS`, `epaParty`, `epaEvents`), `lib/secCases.ts` (`captionParty`), `lib/predecessors.ts` (header and `PREDECESSORS`), `lib/takenNames.ts`, `lib/sec.ts` and `lib/secForms.ts` (the forms a page keeps), `lib/ingest/store.ts` (the SEC's licence note); `scripts/check-doj.ts`, `scripts/check-cpsc.ts` and `scripts/check-rail-accidents.ts` (their replays); data: `data/edgar-tickers.json`; fixtures: `doj-archive-months.json.gz`, `doj-archive-1996-2000.json.gz`, `doj-releases.json`, `cftc-list.json.gz`, `cpsc-recalls.json.gz`, `fra-accidents.json.gz`, `taken-names-scan.json` · **Proposals:** 4

> - **No rejection log exists** (`docs/audits/rejected-proposals.md`), and nothing has been
>   rejected. Every proposal of the first 2026-11-09 file is approved and built (batches 126–129), and
>   batch 130 fixed what the audit of batches 125–129 found. Nothing carries forward and nothing was
>   deferred.
> - **Owner calls already open, not raised again:** DuPont's past on DD; Alcoa's past on AA; the death
>   only a railroad's Form 54 gives (batch 130); "Drugs whose holder changed"; JCI's 2016 case on
>   Tyco's record; GE Capital Retail Bank on GE; PayPal's 2015 CFPB action on eBay; the Digest's
>   first-price floor and older names; widening `MANY_PARTIES`. The waits on `NEWS_CHARTS_CONTACT`
>   are not proposals either: batch 123's six NHTSA makers, batch 126's four CPSC brands, batch 127's
>   two railroads, Southern Natural Gas, the Digest walk.
> - **The three leads the recent batches left, each measured:**
>   - the release rule's object position with a trade descriptor ("Complaint Against Drug Maker Teva
>     Pharmaceuticals"): 3 releases on every committed and saved title, none wrong. Cut; see the end;
>   - "J&J Subsidiary DePuy Agrees": no new row. Cut; see the end;
>   - FRA's `narrative` and Form 55a's casualty split: part (b) of #4.
> - **Two proposals measure lines of the first 2026-11-09 file's cut list,** and say what changed:
>   #2 (MSHA, "Not measured") and #3 (a fourth round of EPA's units, "Not measured"). #1 was raised
>   nowhere; it comes from reading the predecessor map against the companies' own filing lists.
> - **Saved data used instead of the network:** batch 95's copy of EPA's case file (2026-10-31,
>   137,103 cases); the committed Justice, CFTC, CPSC, FRA and taken-names fixtures; 343 saved
>   Justice API answers (batches 82, 83, 121 and 128, and the first 2026-11-09 run); batch 53's scan of
>   notices of succession (its 264 results and their triage, kept in the session scratchpad); 651 first
>   trading days saved by the first 2026-11-09 run. Each was read as data, with `python3 -I`, or through
>   the repository's own functions from scripts in the session scratchpad (`scout131/probes/`).
> - **Measured live on 2026-11-09 from this container.** Every figure below is measured unless it
>   says it is an estimate. Requests, by host:
>   - data.sec.gov 70: the filing lists of 24 successor and 22 predecessor records, and 24 of their
>     older pages (#1);
>   - www.justice.gov 12: the API by `title` for 12 trade descriptors (the cut lead);
>   - efts.sec.gov 13: 12 name lookups for predecessor records (#1), two of which answered 500, and one
>     full-text search for notices of succession, which answered 500;
>   - query1 and query2.finance.yahoo.com 12: first trading days for #2; 5 answered 200, 7 refused
>     with 429;
>   - arlweb.msha.gov 4: the open-data page and three of its files (#2);
>   - data.transportation.gov 2: FRA's floor grouped by holding company (cut), and the narrative and
>     casualty fields of every mapped report at the floor (#4);
>   - www.saferproducts.gov 1: the CPSC's whole answer (#4);
>   - one each, none answering with data: www.ftc.gov (404), apps.occ.gov (302 to the OCC's home
>     page), www.fsis.usda.gov (403), www.dol.gov (403, the Labor Department's notices page),
>     catalog.data.gov (404).
>
>   That is 119 requests: 104 answered 200, and 15 did not (7 × 429, 3 × 500, 2 × 404, 2 × 403 and
>   one 302). Each carried the User-Agent `News Charts Research`, with no email address, and each
>   began at least 1.3 s after the one before ended. No www.sec.gov page was asked. Postgres was not
>   used and the app was not run. The log is in the session scratchpad (`scout131/requests.log`).
> - **Nothing here needs a key, a paid tier or a recurring charge.** #1 reads records EDGAR already
>   serves the pages. #2 is a new keyless source, MSHA's open files; its licence wording could not be
>   read from here and must be before the owner says yes. #3 adds entries to a list a built source
>   reads. #4 reads fields of answers the ingest already downloads.
> - Ranked by importance, securities depth first:
>   1. the older SEC records of 17 companies that moved to a new parent: Comcast, Oracle, Duke, Trane,
>      Regions, Vulcan, Ashland, Alkermes, Berkshire Hathaway, Northrop Grumman, NiSource…;
>   2. fatal mine accidents from the Mine Safety and Health Administration, a new source, since 2000;
>   3. EPA's cases under a fourth round of units: Ashland Chemical, Akzo Nobel Chemicals, Gerdau
>      Ameristeel, Morgan Stanley Capital Group, Seaboard Farms…;
>   4. the regulator's own account on rows pages already hold: the CPSC's injury statement and the
>      railroad's narrative.

Mark each proposal below: `APPROVED`, `REJECTED`, or `DEFERRED`, and add a
reason for anything rejected. Then run the scout in FILE mode.

---

## 1. The older SEC records of 17 companies that moved to a new parent: Comcast, Oracle, Duke, Trane, Regions, Vulcan, Ashland, Alkermes, Berkshire Hathaway, Northrop Grumman, NiSource… · proposed `P1` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — by the owner, 2026-11-10 ("1. Older SEC filings"), on the filing lists' evidence ("Use the filing lists (Recommended)"): each handover rests on the filing its lists hold, with its form, day and accession number, and not on the notice's text, which waits on `NEWS_CHARTS_CONTACT`. Built in batch 132 for the 17 pages measured here: 20 records in `PREDECESSORS`, ten with a notice of succession and ten on the 8-K that reports the handover, as Merck's. Read by the page's own filings reader on the saved lists, they give 3,277 filings on the 17 pages, 631 of them 8-Ks and 788 annual or quarterly reports, every one before 2017, from 1994 on 16 pages (Lamar from 1996). The eight estimated days were read from the lists: Berkshire 1999-01-05, Northrop 2001-04-17, NiSource 2000-11-01, ONEOK 1997-11-29 (the old record's last annual report was filed 1997-11-28, two days after the handover, and is the company's), Cracker Barrel 1999-01-15, Alkermes 2011-09-16, Lamar 1999-08-20 (its 8-K12G3, a month after the handover), and Ashland's 2005-06-30 and 2016-09-20; Ingersoll-Rand's move to Bermuda is 2002-01-02. One step more than drafted: CenterPoint's record was Houston Lighting & Power, the utility, until the old Houston Industries merged into it on 1997-08-06, so the old Houston Industries' record is CNP's before that day and the utility's own filings are not. The records' names also date the SEC News Digest: on 1985 alone, 14 more rows on six of the pages (Houston Industries 7 on CenterPoint, Duke Power 2, ONEOK 2, Comcast, First Alabama Bancshares on Regions, Northrop), none fewer anywhere. Amcor is a merger into a new company, as Linde, and is not mapped. The rest of the population is built in batch 133: a scan of all 8,024 listed records' filing lists, every older page included, found 52 notices of succession near a record's start that no batch had read, 16 of them one company's history (PPL, DTE, PG&E, OGE, T. Rowe Price, Transocean, Accenture, Intercontinental Exchange, Zillow…); by hand, 14 more pages, among them Graphic Packaging, Con Edison, Newmont, Valero, Simon and three of Merck's kind (Lennar, Healthcare Realty, Iron Mountain), whose records' own pasts are labelled. 4,823 filings on 30 pages, 4,176 before 2017; with batch 132's, 8,100 on 47 pages. Four wait for a filing's text.
**Owner's reason (if rejected):**

**Raised before:** no, not as a proposal.
- The map (`lib/predecessors.ts`) came from the 2026-10-25 audit; batches 53 and 55 read the 115
  listed companies whose record starts with a notice of succession found by EDGAR's full-text search,
  and mapped 70 (79 entries now).
- Batch 117's scan of renamed records (`scripts/fixtures/taken-names-scan.json`) read 86 records as
  "the same company's other record: a new parent (Disney's of 2019, Duke's of 2006), a redomicile, its
  own unit, its own fund's trust", and used them only to keep those names off the table of taken
  names. No batch mapped their history.

**What changed:** measured here, from the companies' own filing lists.
- **The full-text search missed notices of succession** inside its own scope (filed since 2001).
  Batch 53's 264 results, kept in the session scratchpad, hold none of these eight, which
  data.sec.gov's lists give with their accession numbers: Comcast's 8-K12G3 of 2002-11-18
  (0000950103-02-001194), MGE Energy's 8-K12G3 of 2002-08-12, CenterPoint's 8-K12B of 2002-09-06
  (0000950129-02-004524), Regions' 8-K12G3 of 2004-07-01 (0000950144-04-006742), Oracle's 8-K12G3 of
  2006-02-06 (0001193125-06-020874), Duke's 8-K12B of 2006-04-04 (0001193125-06-072085), Vulcan's
  8-K12B of 2007-11-16 (0000950123-07-015677) and Trane's (Ingersoll-Rand plc's) 8-K12B of 2009-07-01
  (0001193125-09-142260). Seven of the eight sit on an older page of the list, which holds a large
  filer's filings before its newest thousand; only MGE Energy's is in the newest.
- **Before 2001,** outside that scope, the same kind of handover often has no 8-K12 form: Devon's
  8-K12G3 of 1999-08-18 is one, while Berkshire's of 1998 and NiSource's of 2000 have none on their
  lists and are found by their records' names. ONEOK's of 1997 was not looked for.

**Anchor:** a capability asymmetry inside one source. XOM, DIS, GOOGL and MRK read their
predecessor's filings: "Read from the new record alone, XOM's page carried 8 filings where it should
carry 581" (the map's header). Pages whose new parent is not in the map start their SEC filings at
the new record's first, though their charts reach back decades:

| Page | SEC filings begin today | Chart begins (Yahoo) |
| --- | --- | --- |
| Comcast | 2002-02-11 | 1980-03-17 |
| Oracle | 2005-10-19 | 1986-03-12 |
| Duke Energy | 2005-05-09 | 1980-03-17 |
| Regions | 2004-02-27 | 1980-03-17 |
| Vulcan Materials | 2007-04-12 | 1973-02-21 |
| Trane Technologies | 2009-07-01 | 1980-03-17 |
| Ashland | 2016-05-31 | 1980-03-17 |

**What:** entries in `PREDECESSORS`, by the rule batch 55 stated for the map: "a holding-company
reorganisation, a move of legal home …" and "an acquisition made through a new parent, when the
buyer's ticker carried on".
- **Each predecessor's filings before the handover are the page's;** its later ones, a subsidiary's
  debt filings, are not, as now.
- **Two pages read two steps:** Trane, Ingersoll-Rand Company (New Jersey) to its 2001 move to Bermuda
  (the day to be read) and Ingersoll-Rand Company Limited to 2009-07-01; Ashland, the old Ashland Inc.
  to 2005-06-30 and the record now named Ashland LLC to 2016-09-20.
- **The rest of the population** at the build:
  - the other two "new parent" records of batch 117's scan (Amcor, Graphic Packaging);
  - the rest of its other 71 "own" records where they are a handover (CenterPoint, MGE and Trane are
    not among the 86);
  - a scan of every listed company's whole filing list, every older page included, for 8-K12B and
    8-K12G3, in place of the full-text search.

**Licence:** no new source. EDGAR is source 4, already read for every page: "Information presented on
sec.gov is considered public information and may be copied or further distributed by users of the
web site without the SEC's permission" (quoted in `lib/ingest/store.ts`).

**Grounded in:**
- **The records.** For each page, the successor's list (data.sec.gov, every page of it) for its
  notice, and the predecessor's for its filings. A predecessor was found by EDGAR's name lookup and
  confirmed by the names; for most pairs they swap on the handover day. Comcast's new record was "AT&T
  COMCAST CORP" to 2002-11-18, the day CIK 22301 stopped being "COMCAST CORP"; Oracle's "Ozark Holding
  Inc." and CIK 777676's "ORACLE CORP /DE/" both end 2006-02-01; Duke's "Duke Energy Holding Corp." and
  CIK 30371's "DUKE ENERGY CORP" both end 2006-04-03; Vulcan's "Virginia Holdco, Inc." ends 2007-11-16
  and CIK 103973's "VULCAN MATERIALS CO" 2007-11-15. No predecessor holds a ticker now.
- **The gain,** counted as a page counts filings (the forms `lib/sec.ts` keeps: 8-Ks, annual and
  quarterly reports, proxies, registrations, tender and ownership schedules), before each handover:
  3,093 filings on 17 pages, 1,026 of them 8-Ks, every one before 2017, most from 1994.

  | Page | Predecessor (CIK), to | Filings (8-Ks) |
  | --- | --- | --- |
  | Ashland | Ashland LLC's record (1305014), to 2016-09-20 | 448 (335) |
  | Alkermes | Alkermes, Inc. (874663), to 2011-09-16, an estimate | 382 (136) |
  | Trane | Ingersoll-Rand Co. Ltd (1160497), to 2009-07-01; Ingersoll-Rand Co. (50485), to 2001 | 348 (122) |
  | Oracle | Oracle Systems (777676), to 2006-02-06 | 267 (50) |
  | Duke Energy | Duke Energy Carolinas' record (30371), to 2006-04-04 | 261 (79) |
  | Comcast | Comcast Holdings (22301), to 2002-11-18 | 243 (54) |
  | Regions | Regions Financial (36032), to 2004-07-01 | 230 (62) |
  | Vulcan Materials | Legacy Vulcan (103973), to 2007-11-16 | 192 (53) |
  | CenterPoint | CenterPoint Energy Houston Electric's record (48732), to 2002-09-06 | 114 (34) |
  | NiSource | Old NiSource (823392), to 2000-11-01, an estimate | 104 (19) |
  | Northrop Grumman | Northrop Grumman Systems' record (72945), to 2001-04-02, an estimate | 103 (12) |
  | Devon | Devon Energy /OK/ (837330), to 1999-08-18 | 88 (20) |
  | Lamar | Lamar Media's record (899045), to 1999-07-19 | 87 (21) |
  | Berkshire Hathaway | OBH's record (109694), to 1998-12-21, an estimate | 85 (8) |
  | MGE Energy | Madison Gas & Electric (61339), to 2002-08-12 | 67 (3) |
  | ONEOK | ONEOK Inc.'s old record (74154), to 1997-11-26, an estimate | 42 (16) |
  | Cracker Barrel | Cracker Barrel Old Country Store's old record (25373), to 1998-12-31, an estimate | 32 (2) |

  Not counted: the old Ashland Inc.'s 215 more (91 8-Ks) of 1997–2005 and its older page, and
  Ingersoll-Rand's day of 2001.
- **For example,** none of them on any page today:
  - Comcast's 8-K of 2001-12-20 (items 5 and 7), the month the AT&T Broadband agreement was signed;
  - Oracle's 8-Ks of 2004-12-14 (item 1.01) and 2005-01-03 (items 2.01 and 9.01), around the
    PeopleSoft purchase its new parent was formed for;
  - Duke Power's 8-K of 1997-06-27 (items 2 and 7), and Duke Energy's of 2005-05-17 (items 1.01, 5.02
    and 9.01);
  - Vulcan's 8-K of 2007-02-20 (items 1.01, 8.01 and 9.01), the Florida Rock agreement; Regions' 8-K
    of 2004-01-26 (items 5 and 9).
- **Read by hand:** each pair above, its names on the day, and the "why" batch 117 wrote for it
  ("Comcast's parent of 2002, formed for AT&T Broadband; old Comcast its subsidiary").

**Who benefits and how:** Readers of 17 large pages, Comcast, Oracle, Duke, Berkshire Hathaway,
Northrop Grumman and Trane among them, whose SEC record begins between 1998 and 2016. They gain the
company's own filings of 1994 onward: annual and quarterly results, 8-Ks with their press releases'
headlines, proxies and merger filings. These are the backbone of a page before GDELT's 2017 floor.

**Risk:**
- **The notices' text is the map's standard,** and www.sec.gov serves it only with
  `NEWS_CHARTS_CONTACT` set. From here, the lists give each notice's form and accession, and the names'
  swap on the day. The owner may take that as enough for the nine with a notice, or wait for the
  setting.
- **Eight days are estimates** (Alkermes, NiSource, Berkshire, ONEOK, Cracker Barrel, Northrop
  Grumman, Lamar, Ashland's two steps), from the records' names. Each is to be read from a filing.
- **Utilities' predecessors still file** as the operating company (Duke Energy Carolinas, CenterPoint
  Houston, Madison Gas & Electric). Their filings after the day stay off, as the rule already says.
- **The other sources are not changed:** they find a company by name, and the names are the same.

**Cost:** none. One more record's list a page, read at ingest as the predecessor's now is.
**Effort:** medium:
- 17 entries now, each with its `until`, notice and `why`;
- the scan of every listed company's whole list, and the hand read of what it finds;
- the rest of batch 117's 86 read again for handovers;
- `check:predecessors` re-pinned, with fixtures of the new lists.

**How to check:** new `check:predecessors` cases, against stand-in lists:
- Comcast's page holds CIK 22301's 8-K of 2001-12-20 and none of 22301's filings after 2002-11-18;
- Oracle's holds 777676's 8-K of 2005-01-03;
- Duke's holds 30371's 8-K of 1997-06-27, and not Duke Energy Carolinas' filings of 2007;
- Vulcan's holds 103973's 8-K of 2007-02-20;
- Trane reads two steps, and Ashland two;
- a scan finds a notice on an older page of a list, as Comcast's is.

On main they fail: none of these records is in `PREDECESSORS`.

**Depends on:** nothing for the lists. The notices' text depends on `NEWS_CHARTS_CONTACT`
(OWNER-ACTIONS §2), unless the owner takes the lists' evidence.

**Buildable by:** a cloud session for the lists; data.sec.gov answered all 70 requests from here.

*Importance:* high — 3,093 filings on 17 large pages, 1,026 of them 8-Ks, all before 2017, from
decades of filings no page shows today · *Efficiency:* high — entries in a map every page already
reads · *Practicality:* medium-high — measured; eight days to read, and the notices' text waits on
the contact setting unless the owner accepts the lists

---

## 2. Fatal mine accidents from the Mine Safety and Health Administration, a new source: Alliance Resource, CONSOL (CNX), Martin Marietta, Freeport-McMoRan, CRH, Newmont, Barrick, Vulcan… since 2000 · proposed `P2` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — by the owner, 2026-11-10 ("2. Mine accidents (new source)"), on the condition the owner set ("Read it first, then build (Recommended)"): the Labor Department's licence notice is read and quoted before anything is built, and if it does not allow free reuse the build stops and the owner is asked. Read on 2026-11-10 (www.dol.gov/general/aboutdol/copyright, through a browser, as the Department's site refuses a plain request): "Materials created by the federal government are generally part of the public domain and may be used, reproduced and distributed without permission. Therefore, content on this website which is in the public domain may be used without the prior permission of the U.S. Department of Labor (DOL). However, such materials may not be used in a manner that implies any affiliation or endorsement by the DOL of your company, website or publication." Free reuse, commercial use included, so built in batch 134: `lib/mineAccidents.ts`, source 38, credited to the Department, its seals not used. 54 controller IDs on 52 companies, each between the days the filings give (CONSOL Energy's on CNX to 2017-11-27 and on Core Natural Resources from 2017-11-28; Mosaic's from 2004-10-22; MDU's to 2023-05-31; Trinity's to 2018-10-31; ArcelorMittal's to 2020-12-08). Grouped by mine and day rather than mine, day and time: Kinross's two dead of 2026-09-03 were recorded five minutes apart, so 1,130 accidents, not 1,131. MSHA names an ID's present operator and controller on every old record (Minorca's of 2007 says Cleveland-Cliffs), so a title names the place and the dead, never the operator. Measured on the files of 2026-11-09, from first prices read from Yahoo on 2026-11-10: 224 accidents, 237 dead, on 51 pages, 144 before 2017; Arcosa's two wait, its chart on Yahoo beginning 2026-07-17.
**Owner's reason (if rejected):**

**Raised before:** as a line. The first 2026-11-09 file's cut list: "Not measured: OSHA and MSHA
enforcement (the Labor Department's bulk files, hundreds of megabytes, with establishment names full
of namesakes)".

**What changed:** measured here. MSHA's open files answered from this container, and their own
fields answer the namesake question.
- Each accident report names the mine's controller by MSHA's own ID.
- Of the 1,131 fatal accidents, 1,125 fall within that controller's tenure at the mine, by MSHA's own
  controller history. 602 name a controller other than the mine's today.
- So the map is of about 50 controller IDs, read by hand. No establishment name is matched.

**Anchor:** a capability asymmetry between sectors.
- Railroads carry FRA's accidents (batch 127), carmakers NHTSA's recalls and investigations, and
  consumer-goods makers the CPSC's recalls.
- Mining and building-materials pages carry nothing from their mine-safety regulator: Peabody,
  Alliance, Martin Marietta, Vulcan, Freeport, Newmont.

**What:** an adapter like `lib/railAccidents.ts`, in four parts.
- **The read:** MSHA's Accidents file (`arlweb.msha.gov/OpenGovernmentData/DataSets/Accidents.zip`, 52
  MB, 275,799 reports from 2000-01-01, "updated every Friday afternoon"), read once a week with
  `lib/zip.ts`.
- **The row:** a death (degree of injury 01, the floor; the owner's to widen) at a mine, one row an
  accident (mine, day and time), with MSHA's own classification and narrative. For example, "CONSOL
  Energy: 3 killed at McElroy Coal Company's mine, Cameron, West Virginia — ignition or explosion of
  gas or dust" (MSHA's Mines file gives the town, and the mine's name today, Marshall County). A
  contractor's employee's death says so (64 of the 221).
- **The map** (`MINE_CONTROLLERS`): each controller ID to its company, between days where they matter,
  each read from a filing, by the batch 120 rule.
- **Each page from its first price,** and a predecessor's past never the buyer's: Massey's, Walter's,
  Arch's, Texas Industries' and Phelps Dodge's stay off.

**Licence:** MSHA's files are the agency's own compilation of the Form 7000-1 reports mine operators
file with it. By my reading that is a work of the U.S. Government, with no copyright (17 U.S.C.
§ 105). The Labor Department's own notice, linked from MSHA's page as "Disclaimers"
(www.dol.gov/general/disclaim), answered 403 from here, and data.gov's catalog 404, so its wording was
not read. It must be read and quoted before the owner's yes. This is a new source.

**Grounded in:**
- **The files of 2026-11-09:** Accidents (52 MB), Controller/Operator History (4.5 MB) and Mines (7.3
  MB). 1,221 deaths in 1,131 fatal accidents, 2000 to 2026, 24 to 83 a year.
- **The map, read by hand:** 235 accidents on 51 listed companies.
  - Left off by hand, 46: Arch Resources' 21, merged into Core Natural Resources in 2025; "Ashland Inc
    et al" 11, MSHA's stale record for Arch Coal's mines years after Ashland gave up Arch; Legacy
    Vulcan's 6, VMC's predecessor (they join VMC with #1); Alcoa Inc.'s 3, under the owner's open AA
    call; Rogers Group's 3, a namesake of Rogers Corporation; Hycroft's 1, and Ashland's APAC quarry's
    1. Two more fall outside their draft days: Mosaic's of 2002, before its formation, and CONSOL's of
    2019, the new CONSOL's, so CNR's.
  - Kept off by a first price: Peabody's 14 before BTU's first trading day, 2017-04-03, as Yahoo gives
    it after the bankruptcy.
- **On pages,** 221 accidents (233 dead) on 51 pages, 139 before 2017 on 37 of them. 140 of these (90
  before 2017) are on pages whose first price was read; the other 81 are on 29 whose first price was
  not, as Yahoo answered 429 (CNX's 29 among them).

  | Page | Accidents (before 2017) |
  | --- | --- |
  | Alliance Resource Partners | 30 (23) |
  | CNX (old CONSOL Energy) | 29 (29) |
  | Martin Marietta | 19 (11) |
  | Freeport-McMoRan | 12 (6) |
  | CRH | 11 (4) |
  | Newmont | 10 (9) |
  | Barrick, Vulcan | 9 (9), 9 (2) |
  | Cemex, Alpha Metallurgical, Kinross, AEP | 8 (4), 7 (0), 5 (2), 4 (4) |
  | 39 more | 68 (36): MDU's Knife River, US Lime, Teck, Sibanye-Stillwater, 3M's quarries, Chevron's coal, Rio Tinto, Peabody (from 2017), Coeur, Hecla, Mosaic from 2004… |

- **For example, each read by hand on its record:**
  - CONSOL's McElroy mine, 2003-01-22: "an apparent methane explosion … resulting in three
    fatalities";
  - Alliance's Gibson County mine, 2007-08-10, 3 killed in a shaft's sinking bucket;
  - Barrick Goldstrike, 2002-10-17, 2 mine-rescue team members in an exercise;
  - Hecla's Lucky Friday, 2011-04-15, "completely burying an employee under 30 feet of rock";
  - Rio Tinto Kennecott's Copperton concentrator, 2008-10-29; Freeport's Morenci, 2008-09-01.
- **On no page:** the largest disasters were at companies no listed record carries: Upper Big Branch
  (Massey, 2010, 29 killed), Brookwood (Walter, 2001, 13), Sago (International Coal Group, 2006, 12),
  Crandall Canyon (Murray, 2007, 6 and 3).

**Who benefits and how:** Readers of 51 mining, materials and utility pages. A death at a company's
mine is a dated event on its regulator's record, with the regulator's own account of it. 139 of them
fall before 2017, where these pages hold little but filings.

**Risk:**
- **Controller records can be stale:** "Ashland Inc et al" stays on Arch Coal's Hobet and Thunder
  Basin mines to 2006. Each controller's days are to be read from filings, as `RAIL_OWNERS`' are.
- **A controller's name is today's name of its ID:** "Mosaic Company" from 1993 on IMC's mines. The
  draft counts Mosaic from its formation, 2004-10-22.
- **CONSOL's ID spans the 2017 split:** old CONSOL's, CNX's record, to the coal spin-off (2017-11-28,
  a draft day), and the new CONSOL's, now CNR's, after.
- **Only from 2000:** MSHA's open files begin there.
- **The licence wording is unread** (above).

**Cost:** none. One 52 MB zip a week; the controller history once.
**Effort:** medium:
- an adapter, its row in `SOURCES`, and the map, about 50 IDs and their days;
- titles, a committed slice of real reports, and `check:mine-accidents` in the check chain;
- the coverage map's and README's lines.

**How to check:** `check:mine-accidents` on the slice:
- McElroy (2003-01-22) lands on CNX, and Gibson County (2007-08-10) on ARLP;
- "Ashland Inc et al"'s Hobet report of 2004-08-29 lands on no page;
- Upper Big Branch (2010-04-05) lands on no page;
- Peabody's report of 2001-04-12 lands on no page (its first price), and its of 2018-09-07 on BTU;
- a report with no death lands on no page.

On main they fail: no reader exists.

**Depends on:** the owner's approval of a new source, with the licence read. Legacy Vulcan's 6 need
#1.

**Buildable by:** a cloud session; arlweb.msha.gov answered all 4 requests from here, www.dol.gov did
not.

*Importance:* medium-high — 221 fatal accidents on 51 pages, 139 before 2017 · *Efficiency:* medium
— one keyless file, a map of about 50 IDs · *Practicality:* medium — measured; the licence unread
and about 15 days to read

---

## 3. EPA's cases under a fourth round of units: Ashland Chemical, Akzo Nobel Chemicals, Gerdau Ameristeel, Morgan Stanley Capital Group, Seaboard Farms, Novartis's companies, GATX Terminals, Lennar Homes… · proposed `P2` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — by the owner, 2026-11-10 ("3. More EPA subsidiaries"). To be built in batch 135.
**Owner's reason (if rejected):**

**Raised before:** as lines.
- The first 2026-11-09 file's cut list: "Not measured: a fourth round of EPA's units".
- The 2026-11-08 file's "EPA units not drafted in #1": ArcelorMittal, Columbia Gas Transmission, Baker
  Hughes, Hess on Chevron, Texas Eastern on Duke. None of those is drafted here.

**What changed:** measured on EPA's whole file with today's `UNITS` (95 companies, after batch 120).

**Anchor:** a gap inside one source.
- The caption rule refuses a company's name followed by words that are not legal words, as it should.
- So "ASHLAND CHEMICAL COMPANY", "AKZO NOBEL CHEMICALS, INC.", "GERDAU AMERISTEEL" and "SEABOARD
  FARMS, INC." are no page's, and no `UNITS` entry reads them.
- Gerdau's and Seaboard's pages hold no EPA row today.

**What:** about 15 patterns on 13 companies, each between the days its owner held the unit, read from
filings by the batch 120 rule. The caption rule and the floor stay as they are. My draft, the days
estimates:
- Ashland's chemical, petroleum and distribution companies (Ashland Chemical, Ashland Petroleum), to
  the sales the filings give;
- Akzo Nobel's US companies; Novartis's (Crop Protection to the Syngenta spin-off, 2000-11-13);
  Gerdau Ameristeel; Seaboard Farms; GATX Terminals, to its 2001 sale;
- Morgan Stanley Capital Group; Lennar Homes; Kroger Limited Partnership; The Andersons' ethanol
  companies; Kirby Inland Marine; Ball Metal; Waste Management's disposal companies, from the 1998
  merger.

**Licence:** no new source. EPA's case file was approved on 2026-11-05 with EPA's terms quoted in
`lib/epaCases.ts`.

**Grounded in:**
- **The scan:** court or penalty cases from first prices whose defendant begins with a listed
  company's whole everyday name and goes on with other words, refused by the caption rule and read by
  no `UNITS` pattern: 3,208 cases on 419 companies. Most are namesakes ("CITY OF …", "SOUTHERN PACIFIC
  TRANSPORTATION", "CABOT OIL & GAS" for Cabot Corporation) or former names the replay did not carry
  ("CUMMINS ENGINE", "CROWN CORK & SEAL"). The top 70 were read by hand, and 13 companies' units
  drafted from them.
- **The replay:** each company through `epaEvents` with today's code, before and after the draft
  patterns, from its first price, comparing case numbers on its rows. 153 court or penalty cases more
  on 13 pages, 134 before 2017; none fewer.

  | Page | Cases on the page, before → after | Court or penalty cases added (before 2017) |
  | --- | --- | --- |
  | Ashland | 71 → 170 | 64 (62) |
  | Akzo Nobel | 43 → 88 | 23 (21) |
  | Gerdau | 0 → 16 | 9 (6) |
  | Novartis, GATX, Morgan Stanley, Lennar | 8 → 23, 8 → 16, 1 → 9, 1 → 11 | 8 (8), 8 (8), 8 (7), 8 (3) |
  | Seaboard, The Andersons, Kroger, Kirby | 0 → 9, 4 → 10, 14 → 21, 1 → 6 | 6 (6), 6 (3), 5 (4), 4 (2) |
  | Ball, Waste Management | 16 → 23, 104 → 109 | 2 (2), 2 (2) |

  Four pages' first prices were not read (Gerdau, Seaboard, Kirby, Ball), so their counts are before
  any floor.
- **For example,** none of them on any page today:
  - Seaboard Farms' three settlements of 2006-09 ($205,000, $105,000 and $240,000);
  - Morgan Stanley Capital Group's $1,119,000 (2017-12-14, EF-2017-0003) and $405,000 (2009);
  - GATX Terminals' two Region 6 orders of 1999-12-15; Novartis Crop Protection's case of 2000-11-06;
  - Akzo Nobel Functional Chemicals' $300,000 (2019).

**Who benefits and how:** Readers of 13 chemical, steel, food, finance and homebuilding pages. Ashland
gains 62 cases before 2017 and Akzo Nobel 21. Gerdau and Seaboard gain their first EPA rows.

**Risk:**
- **The days are my drafts,** to be read from filings at the build. Ashland's needs the most care: its
  2011 sale of Ashland Distribution and the 2005 and 2016 records (#1).
- **The scan is by first word,** so units named otherwise ("Frito-Lay") are not in it; another round
  would need another method.
- **A unit's multi-party Superfund cases** show it as one party of many, as "Also on" already says.

**Cost:** none; the file is already read every month.
**Effort:** small-medium: about 15 patterns and about 10 days to read; the slice gains the new keys'
cases, and `check:epa-cases` re-pins its totals.

**How to check:** new `check:epa-cases` cases on the slice:
- Seaboard Farms' 08-2003-0023 lands on SEB;
- Morgan Stanley Capital Group's EF-2017-0003 lands on MS;
- a Novartis Crop Protection case after 2000-11-13 lands on no page;
- a GATX Terminals case after its sale lands on no page;
- "CABOT OIL & GAS" lands on no page of Cabot Corporation's.

On main the new cases fail: none of these units is in `UNITS`.

**Depends on:** nothing. Ashland's days read better after #1.

**Buildable by:** a cloud session; the saved file and data.sec.gov are enough.

*Importance:* medium — 153 cases on 13 pages, 134 before 2017 · *Efficiency:* high — entries in a list
a built source already reads · *Practicality:* high — measured on the saved file; about 10 days to
read

---

## 4. The regulator's own account on rows pages already hold: the CPSC's injury statement and the railroad's narrative · proposed `P2` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — by the owner, 2026-11-10 ("4. Regulators' own words"), both parts ("Both parts (Recommended)"). To be built in batch 136.
**Owner's reason (if rejected):**

**Raised before:**
- (a) no.
- (b) as a note: the 2026-11-09 audit's last line, "FRA's `narrative` field and Form 55a casualty
  detail could caption the worst accidents".

**What changed:** both measured here.

**Anchor:** data collected and never surfaced.
- **(a)** The CPSC's answer, read whole each week, gives each recall an `Injuries` statement.
  `parseRecalls` (`lib/cpscRecalls.ts`) does not read it. So Kidde's fire-extinguisher row on RTX
  gives its units and its hazard, and not "The firm is aware of a 2014 death involving a car fire
  following a crash. Emergency responders could not get the recalled Kidde fire extinguishers to work."
- **(b)** FRA's dataset gives each report a narrative (block 52 of Form 54) and the dead and injured by
  kind (crew, passengers, others). The reader's `FIELDS` ask for neither, and the cause line drops the
  form's pointer "Other causes (Provide detailed description in narrative)" because the row carries
  none.

**What:** two parts, each approvable alone. Neither adds an event, nor changes a row's day, title or
key.
- **(a)** The recall's injury statement on its own row, as written, capped at the description's
  length; "None reported" is said as it is.
- **(b)** The railroad's narrative on its row, with the dataset's empty-part filler ("NoneNone…")
  removed, said as the railroad's own words. The dead are split by kind where the report's split adds
  up to the accident's count: "9 killed (1 railroad employee, 8 others)" at Graniteville.

**Licence:** no new source.
- The CPSC's recalls are a work of the U.S. Government, approved 2026-11-05.
- FRA's dataset is "Public Domain U.S. Government", approved 2026-11-09.

**Grounded in:**
- **(a) The CPSC's answer of 2026-11-09** (10,082 recalls), joined by recall number to the rows of
  check:cpsc's every-company replay, before first prices:
  - 952 of the 1,121 rows where the company made, imported or distributed the product carry a
    statement. Those without are nearly all of 1973–1999, before the service's statements begin;
  - on the 61 pages whose first price was read, 319 of the 438 such rows before 2017 carry one;
  - 9 name a death, among them Kidde's extinguishers on RTX (2017-11-02), Textron's Bad Boy off-road
    vehicles (2017-01-11: "a 14-year-old male passenger died"), Target's weighted blankets
    (2022-12-22), Black Diamond's avalanche transceivers on Clarus (2021-04-12);
  - most count reports and injuries: GE's dishwashers (2000-12-14), "approximately 90 incidents of
    fire … No injuries have been reported"; Maytag's on Whirlpool (2007-02-01), "135 reports of
    dishwasher fires … Four injuries".
- **(b) FRA's answer of 2026-11-09** for every mapped report at the floor (one request), joined to the
  490 rows the committed fixture gives the six pages:
  - 478 carry a narrative of 20 characters or more (median 203), 392 of them before 2017;
  - 113 of the 136 rows with a death give a split that adds up to the accident's count. 22 give none,
    Chatsworth's and Bourbonnais's among them: their dead are on the other railroad's report
    (Metrolink's, Amtrak's), as Form 54's own counts were (batch 130). One, Union Pacific's at Lonjct
    (1993), gives 2 of 5, and would keep the count alone;
  - for example, Bourbonnais on CN (1999-03-15): "AMTRAK #59 COLLIDED WITH A TRACTOR TRAILER LOADED
    WITH STEEL REBAR …"; Chatsworth on Union Pacific (2008-09-12): "SCAX'S METROLINK TRAIN 111 RAN BY A
    RED SIGNAL RESULTING IN A HEAD-ON COLLISION WITH UP'S TRAIN"; Minot on CPKC (2002-01-18), the
    anhydrous ammonia cars and the evacuation.

**Who benefits and how:**
- (a) Readers of the 209 pages with CPSC rows. They see what harm the Commission recorded beside each
  recall, deaths first.
- (b) Readers of the six railroad pages. The worst accidents carry the railroad's own account.

**Risk:**
- **(a) A statement can name another firm's reports** on a joint recall: it is the Commission's text,
  cited to it.
- **(b) Narratives are in capitals, in the railroads' shorthand,** and some report a crew member's drug
  test ("ONE CREW MEMBER TESTED POSITIVE FOR CHLORPHENIRAMINE … NOT SIGNIFICANT"). No person is named in
  those read. The owner may prefer the narrative on rows with a death or an evacuation only.

**Cost:** none. (a) reads a field of the weekly answer; (b) adds fields to the daily query.
**Effort:** small: two fields in `parseRecalls` and the store; seven in FRA's `FIELDS`, the
description, the fixture read again with them, and the checks re-pinned.

**How to check:**
- `check:cpsc`: Kidde's 18022 row names "a 2014 death"; GE's 01054 says "No injuries have been
  reported".
- `check:rail-accidents`: Bourbonnais carries its narrative; Graniteville's dead are split, 1 railroad
  employee and 8 others; Chatsworth's, whose split is on Metrolink's report, are not; a narrative of
  filler only gives none.

On main they fail: neither field is read.

**Depends on:** nothing.

**Buildable by:** a cloud session; both services answered from here.

*Importance:* medium-low — no new event; the account of harm on 952 CPSC rows and 478 railroad rows ·
*Efficiency:* high — fields of answers already downloaded · *Practicality:* high — measured on both
answers

---

## Considered and cut

- **A trade descriptor in the release rule's object position (measured, cut).** It is the lead batch
  130 left: "Complaint Against Drug Maker Teva Pharmaceuticals".
  - **Simulated** by deleting the descriptor after an action word (the subject position's own trade
    words, up to two words before them) and taking the union with today's rule. Run over every
    committed and saved title: the archive's 8,320 releases of 1996–2008, 598 saved API releases and
    the CFTC's 2,610 actions.
  - **3 releases more, none wrong:** Nucor's environmental settlement of 2000-12-19 ("STEEL
    MANUFACTURER NUCOR"), Wal-Mart's Clean Water Act settlement of 2004-05-12 ("RETAIL GIANT
    WAL-MART") and Teva's complaint of 2020-08-18.
  - **The API, asked for 12 descriptors by `title`** ("Drug Maker", "Defense Contractor", "Health
    Care Company"…): 386 more releases, 17 more changed by the widening, and no release more. Their
    objects name no company ("Against Medical Device Manufacturer and Its Owner"), or one no listed
    record holds (Mallinckrodt).
  - Too few for a rule change.
- **"J&J Subsidiary DePuy Agrees" (measured, cut).** A one-word unit after "<Parent> Subsidiary" as the
  subject: on every saved title it adds no row. The one release of that shape is the twin of "DePuy
  Synthes, Inc. Agrees to Pay $9.75 Million", which lands on J&J that day; a page keeps one release a
  day. "Boston Scientific Subsidiary Guidant Pays" and "Prudential Financial Subsidiary Agrees" already
  land.
- **FRA's own holding-company fields (measured, cut).** The floor's reports grouped by
  `reporting_railroad_holding_company` show no unmapped railroad of a listed company that would reach a
  page:
  - CN's Duluth, Winnipeg & Pacific (4, 1977–1990), Elgin, Joliet & Eastern (3, before 1999) and
    Bessemer & Lake Erie (2, 1982) fall before CN's first price or ownership;
  - Florida East Coast's 51 belong to owners no listed record carries (Florida East Coast Industries
    to 2007, then Fortress and Grupo México);
  - the short-line groups (Genesee & Wyoming, Watco, Patriot) are private.
- **EPA defendants written as a company and its plant (measured, cut):** "GENERAL ELECTRIC CO -
  COLUMBIA", "OLIN CORP-MCINTOSH", "PFIZER INC / GROTON SITE". 58 cases on 36 companies, about 35 of
  them the company's own plants (GE 5, Olin 4, Chevron 3), the rest namesakes ("ARMCO, INC.", "TIMCO,
  INC."). A follow-on to #3, not a proposal.
- **MSHA beyond deaths:** permanent disabilities (2,491 reports) and assessed penalties were not
  measured; #2's floor is a death.
- **Retried, and still unreachable:** the FTC (404 with a page that is not the FTC's), the OCC (its
  search redirects to the home page) and FSIS (403), as on 2026-11-05. www.dol.gov answered 403, so
  OSHA's files on the Labor Department's enforcement host were not tried.
- **Not retried, nothing having changed:** the FDIC's failed-bank list (no licence wording), PHMSA
  (403, no copy on DOT's open-data host), FERC (403), the NRC (needs its script), the NTSB (an Access
  database; still no reader here).
- **Not measured:** non-US regulators (the European Commission, the UK's FCA), as before.
- **Owner decisions and tracked waits, not raised:** listed in the header.
- **Re-prioritisations:** none proposed. One count for the owner's queue: `NEWS_CHARTS_CONTACT`
  (OWNER-ACTIONS §2) now also stands before #1's notices' text, if the owner wants the text read rather
  than the lists'.
- **Anything touching another product:** nothing here reads, references or connects to another
  product's repository.

*One closing note, not a proposal* — noticed in passing. The header of `lib/predecessors.ts` says "Of
the 264 listed companies that have filed a notice of succession since 2001, 115 have a record that
starts at most 18 months before it". The full-text search behind that count did not return at least
eight notices filed since 2001 that the companies' own lists hold (#1), so the count is understated;
the `code-auditor` may want it corrected if #1 is not approved.
