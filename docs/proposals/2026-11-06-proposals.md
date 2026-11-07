# Opportunity proposals — 2026-11-06

**Commit:** 9718f0ecb1dff9d4888e8d502ee256f3e0cb8091 (`claude/lucid-goodall-6km6ea`, equal to `origin/main` after batch 102) · **Reviewed:** `CLAUDE.md`; `.claude/agents/opportunity-scout.md`; `README.md` (searched: the regulator sections and "Sources evaluated and rejected"); `docs/MASTER-CHECKLIST.md` (the batch 92–102 ledgers, the open boxes, Scope refocus); `docs/COVERAGE-MAP.md`; `docs/OWNER-ACTIONS.md`; `docs/audits/2026-11-05-code-audit-b94-99.md` (what it found sound, set aside and knew before); `docs/proposals/2026-11-05-proposals.md` whole, and the cut lists of 2026-10-26, 11-01 and 11-02; code: `lib/epaCases.ts` (`epaParty`, `UNITS`, `epaEvents`), `lib/fdaRecalls.ts` (`FDA_FIRMS`, `firmFor`), `lib/secCases.ts` (`captionParty`), `lib/store/read.ts` (`loadEvents`), `db/001_init.sql`; data: `data/edgar-tickers.json`, and the scratch copies named below · **Proposals:** 3

> - **No rejection log exists** (`docs/audits/rejected-proposals.md`), and nothing has been
>   rejected. Every proposal of 2026-11-02 and 2026-11-05 is approved and built (batches 87–102), so
>   nothing carries forward. Nothing here was deferred.
> - **Owner calls already open, not raised again:** JCI's 2016 case on Tyco's record; GE Capital
>   Retail Bank on GE; PayPal's 2015 CFPB action on eBay; whether the Digest keeps the first-price
>   floor. The Digest's names older than EDGAR's (Caterpillar Tractor) are an owner decision in
>   `docs/OWNER-ACTIONS.md` and are not raised either. #2 asks one new call, about Shell.
> - **Two proposals reopen items an earlier run cut.** Each says what changed. #1 reopens the
>   2026-10-26 cut of drug approvals: a source now gives the company that applied, not today's
>   holder. #3 reopens the cut of "Also on" links: the owner's multi-company rule and four new
>   sources now give it something to show.
> - **Saved data used instead of the network.** Batch 95's parse of EPA's case file (the copy of
>   2026-10-31, 137,103 cases, the file batch 95 read). Batch 95's and batch 96's saved replays.
>   The first trading days batches 87 and 94 read from Yahoo (364 tickers). The committed indexes.
>   Each was read as data.
> - **Measured live on 2026-11-06 from this container.** Every figure below is measured unless
>   it says it is an estimate. Requests, by host:
>   - query1.finance.yahoo.com 38: first trading days for 38 tickers;
>   - data.sec.gov 12: the filing lists of six banks in TARP's program, five of their older
>     pages, and Waste Management's record;
>   - home.treasury.gov 5: the TARP page twice (the first at a wrong path answered with a
>     redirect page), its reports page, its transaction reports page, and the final transactions
>     report (832 KB);
>   - www.fda.gov 4: the compilation's page, the compilation (294 KB), its data dictionary and
>     the website policies;
>   - ofac.treasury.gov 4: the civil penalties page and the years 2008, 2014 and 2016.
>
>   That is 63 requests, every one answered 200, and none redirected (curl followed none). Each
>   carried the User-Agent `News Charts Research`, with no email address, at least 1.1 s after
>   the one before. No www.sec.gov page was asked. Neither was GDELT, Wikipedia, Wikidata or the
>   Federal Register. Postgres was not used. The log is in the session scratchpad
>   (`b103/requests.log`).
> - **Nothing here needs a key, a paid tier or a recurring charge.** #1 is a new source, written
>   as a decision for the owner, with its licence quoted from the FDA's own page. #2 adds rows to
>   a list a built source already reads. #3 reads what the database already holds.
> - Ranked by importance, securities depth first:
>   1. the FDA's new-drug approvals since 1985, on the page of the company that applied;
>   2. EPA's cases against the companies' own operating units: Chevron U.S.A., Shell Oil Company,
>      Union Pacific Railroad, Atlantic Richfield…;
>   3. a case's other listed companies, linked from its row.

Mark each proposal below: `APPROVED`, `REJECTED`, or `DEFERRED`, and add a
reason for anything rejected. Then run the scout in FILE mode.

---

## 1. The FDA's new-drug approvals since 1985, on the page of the company that applied — a source for the owner to decide · proposed `P1` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — by the owner, 2026-11-06: "Approve all three, Shell from 2005-07-20". Built in batch 105.
**Owner's reason (if rejected):**

**Raised before:** yes, and cut. The 2026-10-26 file cut "Drug approvals from Drugs@FDA" because
"the sponsor field names today's holder, not the approval's". It said the item was "Worth
reopening only with a per-application source of the original sponsor". **What changed:** the FDA
publishes one. Its *Compilation of CDER New Molecular Entity (NME) Drug and New Biologic
Approvals* says the product information "reflect[s] the state of each application at the time of
original marketing approval". Its data dictionary says: "The name of the applicant is listed in
the approval letter." Checked on four approvals:
- Lipitor (1996-12-17): Parke-Davis, not Pfizer;
- Celebrex (1998-12-31): Searle;
- Humira (2002-12-31): Abbott Laboratories, not AbbVie;
- Ambien (1992-12-16): Lorex.

**Anchor:** a capability one sector lacks. Drugmakers' only FDA source is recalls, from mid-2012
(`docs/COVERAGE-MAP.md:42`). No source puts a new drug's approval on its maker's page, though an
approval is the event an analyst most often looks for on a drugmaker's chart. One reaches a page
today only when the company filed its press release under an 8-K or 6-K, and so never before
1994.

**What:** The owner's decision first. If yes:
- read the compilation (`www.fda.gov/media/177921/download`, one Excel file of 294 KB, last
  modified 2026-05-12) once a year into a committed file. This is how the Board's 1996–2005
  orders are kept (`data/fed-orders-1996-2005.json`, `npm run sync:fed-orders`); here it would be
  a `sync:fda-nme`;
- at each company's ingest, keep an approval whose applicant is the company. That is the caption
  rule (`captionParty`), or one of `FDA_FIRMS`' hand-checked firms on its days (`firmFor`, the
  recall map), from the company's first price;
- the title says what the FDA did: "FDA approves Prozac (fluoxetine hydrochloride), a new
  molecular entity". The file's abbreviated indication is the row's line, and the day is the
  approval day. Link the row to the application's Drugs@FDA page; I did not request that link
  pattern here;
- add the names the recall map never needed, each read by hand with its days:
  - AstraZeneca's "Zeneca" (its EDGAR record was Zeneca Group's) and "AstraZeneca
    Pharmaceuticals";
  - Lilly's "Lilly";
  - Johnson & Johnson's Ortho, R.W. Johnson and Tibotec, and Centocor from J&J's purchase of it
    in 1999;
  - Bristol-Myers Squibb's "Bristol-Myers", and Squibb from the 1989 merger;
  - Takeda's own names;
- give a start day to the recall map's units that have none because the recall reports begin in
  2012: Genzyme on Sanofi (bought in 2011), and Alcon on Novartis (owned from 2010–2011).

**Licence:** "Unless otherwise noted, the contents of the FDA website (www.fda.gov) — both text and
graphics — are not copyrighted. They are in the public domain and may be republished, reprinted
and otherwise used freely by anyone without the need to obtain permission from FDA. Credit to the
U.S. Food and Drug Administration as the source is appreciated but not required."
(www.fda.gov/about-fda/about-website/website-policies, "Linking to or Copying Information on the
FDA Website", read 2026-11-06.) No key. I found no other terms on the compilation page (searched
for "copyright", "licence" and "terms"; its only "license" is the biologics licence).

**Grounded in:**
- **The file:** 1,387 approvals, from 1985-04-09 (Lupron, TAP Pharmaceuticals) to 2025-12-30
  (Nereus, Vanda). 279 are biologics (BLAs), 943 fall before 2017 and 208 before 1993. It holds
  681 distinct applicant names. The 14 rows of late 2025 give their day as text, not as a date;
  my counts leave them out (Cytokinetics, Arrowhead, Omeros and GSK among them).
- **Replayed** through the caption rule, with every index company's present names (former names
  left aside), and through `FDA_FIRMS`' firms:
  - 499 company approvals, of 488 approvals, on 84 companies;
  - from Yahoo's first trading days, 461 on 82 companies: 279 before 2017 on 38 companies, 102
    before 2001 and 53 before 1993;
  - 295 came through the recall map's firms and 166 through the caption rule;
  - 56 companies' first prices were not read; their 82 rows (17 before 2017) are counted
    unfloored.
- **Most:** Merck 47 (37 before 2017), Novartis 45 (31), Pfizer 39 (25), Johnson & Johnson 32
  (23), Bristol-Myers Squibb 30 (26), Lilly 27 (18), Sanofi 22 (16), GSK 21 (15), Amgen 19 (14),
  Gilead 15 (11), Abbott 14 (14).
- **Before EDGAR,** for example: Merck's Vasotec (1985) and Mevacor (1987); Lilly's Prozac
  (1987); Abbott's Biaxin (1991); Pfizer's Zoloft (1991) and Norvasc (1992); BMS's Pravachol
  (1991).
- **The first price keeps 38 off:**
  - Novartis's 10 before its 1996-11-07 listing (Sandoz's and Alcon's);
  - Organon's 9 (OGN lists from 2021), Alcon's 8 (2019), Sanofi's 6 (2002), Bausch + Lomb's 4
    (2022);
  - Block Drug's Actinex (1992), which the caption rule gives Block, Inc. (2015).
- **Read by hand, 12 more to fix before building:**
  - Alcon's five approvals of 1996–2005 (Patanol, Emadine, Azopt, Travatan, Nevanac) land on
    Novartis, which did not own Alcon until 2010–2011;
  - Genzyme's five of 2003–2010 (Fabrazyme to Lumizyme) land on Sanofi, which bought it in 2011;
  - the recall map's "Merck" also reads two joint ventures: DuPont Merck's Neurolite (1994) and
    Astra Merck's Atacand (1998).

  That leaves about 449. Also to read at the build: DuPont's three of 1986–1990 on DD. DD's EDGAR
  record is DowDuPont's of 2015, though Yahoo's DD series runs from 1972.
- **Missed by both rules,** found with rough patterns rather than the hand list: about 57 from
  first prices, 51 of them before 2017. These are estimates until the hand read:
  - AstraZeneca 20: Zeneca's Arimidex (1995) and Seroquel (1997), then Crestor (2003), Brilinta
    (2011) and Tagrisso (2015);
  - Johnson & Johnson 15: Ortho's and R.W. Johnson's Topamax (1996), Tibotec's Prezista (2006),
    and Centocor's from 1999;
  - Bristol-Myers Squibb 8: Buspar (1986), Paraplatin (1989);
  - Takeda 8, from its 2010 first price;
  - Lilly 6, filed as "Lilly": Gemzar, Humalog, Zyprexa, Evista.
- **Left out, as the rule requires** (an acquisition's past is never the buyer's):
  - Parke-Davis's 8 (Lipitor among them), Searle's 6, Wyeth's 17 and Pharmacia & Upjohn's, all
    before Pfizer bought them;
  - Genentech's 29 (Roche has no SEC record in the index);
  - GSK's predecessors before the 2000 merger: Glaxo, Glaxo Wellcome, SmithKline Beecham,
    Burroughs Wellcome and Beecham, about 40 between 1985 and 2000;
  - "Schering" (12), which could be Schering-Plough or Germany's Schering AG. I did not read
    them.
- **Not covered:** biologics approved by the FDA's biologics centre, CBER (vaccines, gene
  therapies); a drug's later indications; generics; devices.
- **Overlap with what pages already hold:** not measured. Before 1994 no page can hold one.

**Who benefits and how:** Readers of 82 drug and biotech companies' pages, 38 of them before 2017:
Merck, Novartis, Pfizer, Johnson & Johnson, BMS, Lilly, Sanofi, GSK, Amgen, Gilead, Abbott,
AstraZeneca. Each new drug's approval lands on its own day, so a reader can tell which approval
moved the chart. 53 of them fall before EDGAR, when these pages hold little but dividends.

**Cost:** none recurring beyond one 294 KB file a year; no key. This year's approvals arrive with
the next year's file, so they wait up to about 17 months. Until then, the company's own 8-K
headline is what carries them.
**Effort:** small:
- a sync script with a reader for the sheet's XML (`lib/zip.ts` already opens zips; no new
  dependency), writing a committed JSON of about 1,400 rows;
- the company step, and the names and days above;
- registered in `SOURCES`, credited, and scored without the model.

**Verified by:** a new `check:fda-nme` on the committed file:
- Prozac (1987-12-29) lands on LLY;
- Lipitor (1996-12-17) and Celebrex (1998-12-31) land on no page;
- Humira (2002-12-31) lands on ABT, not on ABBV;
- Patanol (1996-12-18) is not on NVS, and Fabrazyme (2003-04-24) is not on SNY;
- Actinex (1992-09-04) is not on XYZ;
- Seroquel (1997-09-26) lands on AZN under Zeneca;
- a late-2025 row whose day is written as text is read.

On main it cannot run: the adapter does not exist.

**Depends on:** the owner's yes.

**Buildable by:** a cloud session; www.fda.gov answered from here (measured).

*Importance:* high — a drugmaker's defining events, 1985 to 2016, on 38 pages, 53 of them before
EDGAR · *Efficiency:* high — one small file a year, the recall map reused · *Practicality:* high
— public domain and measured; a hand read of about 60 names

---

## 2. EPA's cases against the companies' own operating units: Chevron U.S.A., Shell Oil Company, Union Pacific Railroad, Atlantic Richfield… · proposed `P1` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — by the owner, 2026-11-06: "Approve all three, Shell from 2005-07-20". Shell's units count from 2005-07-20. Built in batch 104.
**Owner's reason (if rejected):**

**Raised before:** only as a line, never as a box. Batch 95 lists, under "Not done here", "a map
of the units EPA charges under their own names (BP Products North America, Motiva): the replay
read the companies' own names only" (`docs/MASTER-CHECKLIST.md:1411`). Batch 101 built that map,
`UNITS` (`lib/epaCases.ts:208`), with one entry: Sunoco, Inc. on Energy Transfer, on the owner's
call.

**Anchor:** a gap inside one source. ExxonMobil's page has 163 EPA rows. Chevron's has 20, Shell's
15, BP's 4, Occidental's 10, Union Pacific's 6, CSX's 5 and Norfolk Southern's none. EPA names
those companies' operating subsidiaries, and the caption rule refuses a company's name followed by
words that are not legal words, as it should.

**What:** Extend `UNITS` with a hand-checked list. Each entry is a unit's name pattern and the
days its owner held it, read from the owner's filings. The candidates, by my reading:

| Company | Units |
| --- | --- |
| Chevron | Chevron U.S.A.; its products, pipeline, environmental management and mining companies; Chevron Chemical to 2000-06-30; Texaco from 2001-10-09; Unocal and Union Oil Company of California from 2005-08-10 |
| Shell | Shell Oil Company, and its chemical, pipeline, offshore and Western companies |
| BP | BP Products North America, BP Exploration, BP America and BP Oil; Amoco from 1998-12-31; Atlantic Richfield and ARCO from 2000-04-18 |
| ExxonMobil | Exxon's and ExxonMobil's production, chemical, pipeline and oil companies; Mobil from 1999-11-30 |
| Occidental | Occidental Chemical |
| Union Pacific | Union Pacific Railroad; Union Pacific Resources until its 1996 spin-off |
| CSX | CSX Transportation |
| Norfolk Southern | Norfolk Southern Railway |
| Waste Management | "Waste Management of <state>", from the 1998 merger |
| Murphy Oil, Murphy USA | Murphy Oil USA: on Murphy Oil until 2013-08-29, on Murphy USA from 2013-08-30 |
| Others | Clean Harbors', Northrop Grumman's, Con Edison of New York, Halliburton's, Akzo Nobel's and others (33 companies in all) |

Two more rules come with the list:
- **A guard:** a station, store, dealer or numbered site under a brand is not the brand owner's
  unit ("SHELL SERVICE STATION #000329").
- **Joint ventures stay out:** Chevron Phillips Chemical, Motiva, Equilon, and Duke Energy Field
  Services (DCP).

**Licence:** no new source. EPA's case file is already read once a month (approved 2026-11-05).

**Grounded in:**
- **Replayed on the saved parse of EPA's file**, through `epaEvents` itself:
  - each company from its first price;
  - a unit's defendant read as the company on the unit's days;
  - the index's present names, with former names left aside.

  The list reads 891 distinct unit names on 33 companies, in 2,385 defendant rows. It adds 1,607
  rows, 1,382 of them before 2017. 715 of those rows are a court case or a penalty (657 before
  2017). The rest are no-penalty orders, alone or grouped a row a month. Rows before → after:

  | Company | Rows before | Rows after | Court or penalty rows added |
  | --- | --- | --- | --- |
  | Chevron | 20 | 258 | 112 |
  | BP | 4 | 238 | 99 |
  | Shell | 15 | 208 | 100 |
  | Occidental | 10 | 152 | 67 |
  | ExxonMobil | 163 | 276 | 55 |
  | Union Pacific | 6 | 98 | 44 |
  | Waste Management | 29 | 103 | 38 |
  | CSX | 5 | 77 | 36 |
  | Clean Harbors | 18 | 70 | 15 |
  | Akzo Nobel | 8 | 62 | 17 |
  | Con Edison | 9 | 42 | 12 |
  | Northrop Grumman | 11 | 36 | 12 |
  | Norfolk Southern | 0 | 30 | 11 |
  | Halliburton | 4 | 27 | 10 |
- **The largest unit names, by defendant rows:**
  - Shell Oil Company and its chemical, pipeline and offshore companies 250;
  - Occidental Chemical 186;
  - Chevron U.S.A. 168;
  - Atlantic Richfield from 2000, 112: ARCO's mining legacy among them;
  - Union Pacific Railroad 102;
  - the Waste Management state companies from 1998, 91;
  - CSX Transportation 89.
- **Read by hand:**
  - **The top names:** the 22 most frequent unit names of each of 15 companies. Every one is the
    company's own unit or the company.
  - **A sample:** a fixed random sample of 40 court or penalty cases, drawn before the unit days
    were applied. Each names the company or its unit. Six fall outside the owner's days, and the
    days drop them:
    - Amoco Oil's of 1984;
    - ARCO Chemical's and Atlantic Richfield's of 1997;
    - Texaco's of 1994;
    - Mobil Exploration's of 1998;
    - Murphy Oil USA's $5,500,000 decree of 2002, which is Murphy Oil's, not Murphy USA's.

    No branded station is in the sample.
  - **The station guard:** it took 85 such names (Amoco 33, Texaco 15, BP 11, Shell 10…). A few
    may be the company's own numbered sites ("AMOCO OIL CO. (#05132)"); the hand read decides
    those.
- **Waste Management's day, read today:** its EDGAR record was USA WASTE SERVICES INC until
  1998-07-10 (data.sec.gov). So the state companies are its own only from the 1998 merger.
- **One owner call, Shell:**
  - Shell plc's record dates from 2005, when Royal Dutch Shell plc became the group's single
    parent. Yahoo's SHEL series runs from 1984-03-12.
  - From the first price, as every rule reads, Shell's units give 100 days with a court case or
    a penalty. From 2005-07-20 they give 22, 16 of them before 2017.
- **The other days are my reading, to be read from the owners' filings at the build:**
  - the acquisitions: Texaco, Unocal, Mobil, Amoco, ARCO;
  - Dow Chemical and Union Carbide under Dow Inc. from 2019-04-01;
  - the spin-offs and sales: Chevron Chemical into Chevron Phillips (2000), Union Pacific
    Resources (1996), Murphy USA (2013), Northrop's shipyards to HII (2011), Verizon's
    directories (2006), Akzo Nobel's chemicals (2018).
- **Not measured:**
  - former names, which add more at ingest;
  - the units of the other 630 or so companies with EPA rows. This list is the 33 companies I
    read.

**Who benefits and how:** Readers of the oil majors, railroads, and waste and chemical companies:
Chevron, BP, Shell, ExxonMobil, Occidental, Union Pacific, CSX, Norfolk Southern, Waste
Management, Clean Harbors, Akzo Nobel, Con Edison. For several of them, EPA's record of their
refineries, rail yards and Superfund sites now lands on the page instead of being nearly empty.
The 1,382 new rows before 2017 add about a quarter to the source's 5,156 before 2017.

**Cost:** none; the file is already read.
**Effort:** medium:
- about 70 patterns on 33 companies, each unit's days read from its owner's 8-Ks and annual
  reports. data.sec.gov's filing lists answer from here; www.sec.gov's documents need the
  contact address;
- the station guard;
- the stored-case lookup by unit (`unitKeysOf`), the slice rebuilt with the unit keys, and the
  replay counts re-pinned.

**Verified by:** new `check:epa-cases` cases:
- Chevron U.S.A.'s court case of 1995-12-08 (02-1992-0107, $155,000) lands on CVX;
- Shell Oil Company's of 1996-03-27 (06-1991-0011, $775,000) lands on SHEL, or not, as the owner
  rules;
- Occidental Chemical's of 1998-02-12 (06-1996-0541) lands on OXY;
- Union Pacific Railroad's of 2003-07-17 (08-2002-0155) lands on UNP;
- Atlantic Richfield's of 2011-12-22 (03-1997-0379) lands on BP, and its case of 1997-05-01
  (08-1996-0057) on no page;
- Amoco Oil's of 1984-10-19 (07-1980-0011) lands on no page;
- Murphy Oil USA's decree of 2002-01-24 (05-1998-0719, $5,500,000) lands on MUR, not MUSA;
- "SHELL SERVICE STATION #000329" lands on no page, nor does Chevron Phillips Chemical.

On main the new cases fail: none of these units is in `UNITS`.

**Depends on:** nothing, except the owner's call on Shell's start day.

**Buildable by:** a cloud session.

*Importance:* high — 1,382 rows before 2017 on 33 large companies, most of them nearly empty in
this source today · *Efficiency:* high — one list; the source is already read ·
*Practicality:* medium — about 70 ownership days to read from filings, and one owner call

---

## 3. A case's other listed companies, linked from its row: "Also on Ford, General Motors and 25 more" · proposed `P2` · target section: Scope refocus — exchange-traded securities (2026-08-08), beside "Route topic pages to the securities they share events with"

**Status:** APPROVED — by the owner, 2026-11-06: "Approve all three, Shell from 2005-07-20". Built in batch 106.
**Owner's reason (if rejected):**

**Raised before:** yes, and cut. The 2026-10-26 file cut "'Also on' links between held companies:
2 events are linked to two held companies among the 17 in the batch 42 database. Nothing to show."
**What changed:**
- the owner's rule of 2026-11-05: a case goes on every company it involves (batch 93);
- four sources built since that name many companies at once: EPA's cases (batch 95), the CPSC's
  recalls (96), the CFTC's actions (97) and the Board's 1996–2005 orders (99).

**Anchor:** a dead end in the user path. A row says "EPA consent decree with 28 parties", or
"with 27 other defendants", and names none of them. A reader on GE's page cannot reach Ford's
page from the Superfund settlement they share.

**What:** No new data and no new source. Beside `loadEvents` (`lib/store/read.ts:241`), one more
read for a page's rows from the sources that name several parties:
- it finds the other company pages holding an attestation of the same source and case
  (`event_attestations.external_id`). EPA's rows list several case numbers, so it matches any one
  of them;
- it shows "Also on: Ford, General Motors, Boeing and 25 more" under the row, each name a link to
  that company's page;
- it lists only companies whose pages are held.

**Grounded in:**
- **EPA,** from batch 95's saved replay of every company in the index, before first prices:
  - 3,871 cases on company pages, 543 of them on two companies or more (515 numbered before
    2017);
  - 2,659 of the 5,996 rows (44%) hold a case another company's page holds too;
  - by the number of companies: 201 cases on two, 98 on three, 68 on four, 112 on five to nine,
    and 64 on ten or more;
  - one case (04-2013-3751) lands on 30, among them Alcoa, Boeing, BMS, Deere, Honeywell,
    PepsiCo, Pfizer and PPG.
- **The CPSC,** by row title from batch 96's saved replay. This is an estimate, not a count of
  recalls: 286 of 1,948 distinct rows sit on two pages or more, most of them stores' monthly
  rows.
- **The Board's 1996–2005 orders:** 3 on two pages or more (batch 99's ledger).
- **Not counted:** the SEC's cases and releases, the Justice Department's releases and the CFTC's
  actions.
- **These counts are a ceiling.** A link shows only companies whose pages are held, so a new
  site shows fewer.

**Who benefits and how:** Readers of the industrial, chemical and retail pages, where shared cases
cluster: on 44% of EPA's rows they can see which other listed companies share the case and go to
their pages. This adds no depth. It makes the owner's multi-company rule visible on the page.

**Cost:** none.
**Effort:** small:
- one read query, with an index on attestations by source if the query plan needs it;
- one line in `EventList`;
- the case lists of the grouped month rows.

**Verified by:**
- a check on a fake database: a case held by GE and Ford shows each on the other's row;
- a company's own two rows of one case do not list it;
- an index company with no page held is not shown;
- a grouped month row lists by its cases;
- `check:ui` on a page with a shared case.

On main it fails: no such read exists.

**Depends on:** nothing.

**Buildable by:** a cloud session.

*Importance:* medium — a route between related securities on 44% of EPA's rows, but no new events
· *Efficiency:* high — the data is already stored · *Practicality:* high — one query and one line
of UI

---

## Considered and cut

- **TARP's Capital Purchase Program (measured; raised twice before as "not measured").**
  - **The file:** Treasury's final transactions report (2023-09-30) lists 707 institutions,
    with 738 investments and 901 repayments or sales, from 2008 to 2014.
  - **The caption-rule replay:** 109 matches on 108 companies. At least 7 are namesakes, told
    apart by city: Citizens Bank & Trust of Covington on CFG, Peoples Bancorp of Lynden on PEBO,
    The First Bancshares of Hattiesburg on FBSI, United Bancorp of Tecumseh on UBCP, Community
    West of Goleta on CWBC, Trinity Capital of Los Alamos on TRIN, and Rockland's Independent
    Bank Corp. on IBCP.
  - **Missed by the rule:** Seacoast, First Bancorp (NC) and (PR), Banner, and Independent Bank
    of Ionia; and, under former names, BB&T, First Horizon National, Bank of the Ozarks and Nara.
  - **Why it is cut:** in a sample of five banks (KeyCorp, Wintrust, Cathay, 1st Source, Park
    National), 9 of the 11 investment and exit days already carry the bank's own 8-K, filed that
    day or within four days (data.sec.gov). TARP would mostly re-date what pages already hold. A
    label on those 8-Ks would be the better build. Treasury's licence was not read.
- **OFAC's civil penalties (3 of its 23 yearly pages, 2003–2025, measured).**
  - **Volume:** 2008 has 106 rows, 2014 has 23 and 2016 has 9.
  - **Matches:** 11 by the caption rule. Six of them are 2008's, every one under $20,000 (Bank
    of America's was $1,337.50). The large penalties fall on companies with no SEC record here
    (BNP Paribas $963.6 million, Clearstream $151.9 million). Alcon's of 2016 was Novartis's, not
    Alcon Inc.'s.
  - **Why it is cut:** volume without materiality. The licence was not read.
- **Not retried:** the FTC, the OCC and FSIS, all unreachable from here on 2026-11-05. The FDIC's
  failed-bank list still has no licence wording.
- **Known, and small:** the CFTC trading units the release map lacks (Morgan Stanley Capital
  Group, Merrill Lynch Commodities, J.P. Morgan Futures, RBC Capital Markets, Avista Energy). The
  2026-11-05 audit already lists them under "Known before this audit". They are rows in a map,
  not a proposal.
- **Not measured, so not proposed:** a drug's later indications in Drugs@FDA, where the
  sponsor-ownership problem returns; device approvals (PMA, 510(k)); NTSB aviation accidents;
  PHMSA pipeline incidents.
- **Owner decisions, not raised:** the Digest's names older than EDGAR's, and its first-price
  floor; JCI's 2016 case, GE Capital Retail Bank and PayPal's 2015 action.
- **Re-prioritisations:** none. The open items nearest securities depth all still need the
  production host or a key: the Digest walk (`NEWS_CHARTS_CONTACT` and `pdftotext`), the GDELT
  backfill's production watch, the 203 held-back everyday-word names, and the paid-tier
  evidence.
- **Anything touching another product:** nothing here reads, references or connects to another
  product's repository.

*One closing note, not a proposal* — noticed in passing: "Independent Bank Corp." is two listed
companies' EDGAR name, INDB of Rockland, Massachusetts and IBCP of Michigan. In the TARP replay
the caption rule gave Rockland's investment to both, and any source read by that rule would do the
same. Separately, the old Waste Management, Inc.'s court case of 1998-05-11 (04-1996-0208, before
the merger) reaches WM's page under its present name. The `code-auditor` may want both.
