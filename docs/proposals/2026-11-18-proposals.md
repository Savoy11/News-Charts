# Opportunity proposals — 2026-11-18

**Commit:** 69569a5e70b1e75fdd5157bd6d3db96b89bfc63d (`claude/lucid-goodall-6km6ea`, equal to `origin/main` after batch 157) · **Reviewed:** `CLAUDE.md`; `README.md` ("Data sources", "Sources evaluated and rejected"); `docs/COVERAGE-MAP.md`; `docs/OWNER-ACTIONS.md` (§3 with the ruling on federal works, "Decisions I can't make for you"); `docs/MASTER-CHECKLIST.md` (Scope & independence, the batch 151–157 ledgers, batch 146's DuPont call); `docs/proposals/2026-11-15-proposals.md` whole, and the "Considered and cut" sections of the 2026-11-09, 2026-11-09b and 2026-11-11 files (OSHA, MSHA, the Labor Department's hosts); the schema (`db/001`–`db/053`) against what pages read; code: `lib/secCases.ts` (`captionParty`, `chargedParties`), `lib/cfpb.ts` (`respondents`), `lib/doj.ts` (`releaseNamesParty`, `dojPossessive`), `lib/frCompany.ts` (`companyNames`), `lib/ingest/frBackfill.ts` (`namesForYear`), `lib/sec.ts` (`newsNamesFor`), `lib/releaseNames.ts` (`releaseNamesOn`), `lib/takenNames.ts` (`takenBefore`, Johnson Controls' entry), `lib/ingest/store.ts` (the source ids; MSHA's licence note), `scripts/check-occ.ts` (its replay of every company in the index) · **Proposals:** 2

> - **No rejection log exists** (`docs/audits/rejected-proposals.md`), and nothing has been rejected.
>   Both proposals of 2026-11-15 are approved and built (batch 152, the EEOC's press releases; batches 153
>   and 154, the OCC's actions and the OTS archive). Nothing was deferred and nothing carries forward.
> - **Settled, not raised again:** batch 155's fixes of the audit of batches 150–154 and its set-asides;
>   NC-003, a `?focus=` page rendered focused on the server (batch 156); Next.js 16.4.6 (batch 157); the
>   lint tooling's minimatch advisory, logged to apply from 2026-11-30; the ruling that a federal agency's
>   own work is usable where its site states no licence; DuPont's past on DD (batch 146, kept). The open
>   ledger entries all wait on the owner (licences, money, the production host).
> - **Defaults still yours to change, not raised:** the Digest's first-price floor and its names older
>   than EDGAR's (it bears on #2: "Allied Chemical Corp." is Honeywell's record's name before EDGAR, left
>   out of every count below); widening `MANY_PARTIES`; "Drugs whose holder changed".
> - **The leads I was given, each measured:**
>   - **The NLRB's Board decisions:** #2;
>   - **The Labor Department's enforcement data:** the catalog does offer keyless zips. WHD's file holds
>     no day a case ended (cut); OSHA's are 1.5 and 2.3 GB, measured by a range read (cut). A third file
>     in the same catalog, the Trade Adjustment Assistance determinations, is #1;
>   - **BIS export enforcement, the FAA's civil penalties, the FCC Enforcement Bureau:** cut, each with
>     its figures below. The FCC is not raised in any earlier proposal file.
> - **"Stored but never surfaced":** nothing found. Volume, filing times, the CPSC's injury statements,
>   MSHA's findings, the FDA's device classes and warning-letter close-outs are all rendered;
>   `event_enrichments` is read and written by no code, so nothing is stored there.
> - **Saved data used instead of the network:**
>   - the first trading days of 735 tickers from the committed fixtures (`eeoc-listing`,
>     `fda-device-recalls`, `occ-actions`, `digest-1985-entries`);
>   - the committed ticker index and alias file, through the repository's own functions.
>
>   Each download was read as data, with `python3 -I` or through `captionParty`, `respondents`,
>   `releaseNamesParty`, `dojPossessive`, `companyNames`, `namesForYear`, `newsNamesFor`,
>   `releaseNamesOn` and `takenBefore`. The probes are in the session scratchpad (`scout158/probes/`).
> - **Measured live on 2026-11-18 from this container.** Every figure below is measured unless it says
>   it is an estimate. Requests, by host:
>   - www.nlrb.gov 27: 24 Board-decision listing pages, the site's policies page, the first page at 20
>     a page and the judges' decisions' first page; apps.nlrb.gov 3: one HEAD and two decisions' PDFs
>     (#2);
>   - data.dol.gov 10 and apiprod.dol.gov 5: the portal's page and script, the dataset catalog (5
>     pages), four HEADs, the WHD and TAA zips, and two range reads of OSHA's inspection file (#1, cut);
>   - www.federalregister.gov 8: one count of BIS orders, six searches for TAA petitions by number (four
>     found nothing, as the Register writes the numbers with a comma) and one notice's text (302) (#1,
>     cut);
>   - query1.finance.yahoo.com 8: first trading days (four answered, four refused with 429 and not
>     retried);
>   - www.bis.gov 2 and efoia.bis.doc.gov 1 (301 to the FOIA page); www.faa.gov 4; www.fcc.gov 1 (403);
>     www.dol.gov 1 (403); api.us.socrata.com 1, the FCC's open-data catalog (cut).
>
>   That is 71 requests: 63 answered 200 or 206, two 403, four 429, one 301, one 302. Each carried the
>   User-Agent `News Charts Research`, with no email address, and each began at least 1.3 s after the
>   one before ended. No www.sec.gov, data.sec.gov or efts.sec.gov page was asked. Postgres was not used
>   and the app was not run. The log is in the session scratchpad (`scout158/requests.log`).
> - **Nothing here needs a key, a paid tier or a recurring charge.** #1 reads one keyless 48 MB zip once.
>   #2 reads 667 listing pages once, at night by the NLRB's own policy, then its newest page daily.
> - Ranked by importance, securities depth first:
>   1. the Labor Department's trade adjustment certifications, 1975–2022: job losses at the company's
>      named plant or office, tied to imports or a shift abroad;
>   2. the NLRB's Board decisions in the company's own cases, from 1962.

Mark each proposal below: `APPROVED`, `REJECTED`, or `DEFERRED`, and add a
reason for anything rejected. Then run the scout in FILE mode.

---

## 1. The Labor Department's trade adjustment certifications, 1975–2022: job losses at the company's plant tied to imports or a shift abroad — Ford's assembly plants of 1980, Boeing's Commercial Airplane Group of 2002, IBM, GE, Honeywell, Weyerhaeuser… · proposed `P1` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** PENDING
**Owner's reason (if rejected):**

**Raised before:** no. The Labor Department's hosts were met for OSHA (2026-11-09, 2026-11-09b,
2026-11-11: "its API answered 401 without a key"). Nobody looked at the catalog's other files, nor at
the keyless zip each one offers.

**Anchor:** the 1963–2017 hole the coverage map calls "the single biggest hole in the corpus", for
manufacturers above all. Before EDGAR a manufacturer's page holds little but Yahoo's dividends and
splits. Since EDGAR a plant closing reaches a page only if the company filed an 8-K about it. The Trade
Act of 1974 had the Labor Department rule, petition by petition, whether a named plant's or office's job
losses came from imports or a shift abroad. Each ruling gives the plant, the town, the product and the
workers. No source the pages read holds them. The Federal Register prints them weekly, but under
titles that name no company ("Notice of Determinations Regarding Eligibility To Apply for Worker
Adjustment Assistance"), so the company feed never sees them.

**What:** an adapter, `lib/taaPetitions.ts`, with a new source key (43, `dol_taa`):
- **The read:** the Employment and Training Administration's petition file, one keyless zip on the
  Labor Department's open-data portal (`data.dol.gov/data-catalog/ETA/otaa_petition/ETA_otaa_petition.zip`).
  It is read once and committed, as the OTS archive was (`npm run sync:taa`). The file holds no
  determination after 2022-06-30, so it is closed in practice. `check:live` says when a later
  determination appears.
- **The rule:** the caption rule (`captionParty`) on the worker group's firm, under the company's names of
  the year and the release map's units, as EPA's and the CPSC's are read. Added: a units and spellings list
  read by hand, namesakes in `NOT_THE_COMPANY`, the table of taken names, and the company's first price.
- **What makes a row:** a certification. A day's certifications on one company are one row, as EPA's
  orders of a day are.
- **The row:** "Labor Department certified workers at Ford Motor Co.'s Wayne Assembly (Wayne, Mich.) for
  trade adjustment assistance". It gives each site with its division, town, product and the
  Department's estimate of workers, the day separations were covered from (`IMPACT_DATE`) and the
  petition number (TA-W-6955).

**Licence:** a new source. The Labor Department's terms are the repository's own record, read
2026-11-10 for MSHA (`lib/ingest/store.ts`, source 38): "Materials created by the federal government are
generally part of the public domain and may be used, reproduced and distributed without permission",
credited "to the U.S. Department of Labor", and never "in a manner that implies any affiliation or
endorsement by the DOL". www.dol.gov answered 403 today, so they were not re-read. The portal's catalog
and its download state none. Its Terms of Service appear only when you register for an API key, which
the zip does not need. No key.

**Grounded in:**
- **The file:** 47,935,779 bytes, `Last-Modified: Wed, 18 Nov 2026 11:20:46 GMT`; one CSV of 86,334
  petitions with 66 columns, 86,306 of them with a determination day, 1975-05-15 to 2022-06-30. By the
  Department's code: D 31,130, C 23,767, C2 13,338, C1 8,539, T 6,854, CU 1,984, P 515, CD 179.
- **The codes,** read by their dates:
  - C, C1, C2 and CU are certifications, 47,628 in all (C 1975–2003, C1 1978–2022, C2 from 2001, CU from
    2003). The Federal Register's notices of 2009 list "trade adjustment assistance … and alternative
    trade adjustment assistance (ATAA)" determinations by number. TA-W-71,862 (C2, 2009-09-18) is in
    E9-26567 of 2009-11-05, and TA-W-64,986 (CU, 2009-02-23) in E9-5899 of 2009-03-19;
  - D is a denial, T a termination, P and CD partial;
  - the codebook itself sits behind the portal's API key and www.dol.gov, so it was not read. The build
    confirms the codes from the notices.
- **The replay,** today's caption rule and release map under each company's names of the year, with the
  table of taken names:
  - 7,631 petition–company pairs on 591 companies, 4,274 of them certifications;
  - first prices are read here for the companies of 2,797 of those 4,274. **From first prices, 2,121
    certifications on 179 pages: 1,292 company days, 1,063 before 2017.** 527 of the certifications
    fall before 1993, 1,267 in 1993–2016 and 327 since;
  - by page, in certifications: Ford 210, IBM 180, GE 112, Boeing 85, Genesco 79, Halliburton 77,
    Honeywell 54, Quest Diagnostics 46, Weyerhaeuser 42, Chevron and International Paper 38 each;
  - by page, in company days: GE 101, IBM 86, Honeywell 45, Ford 40, Weyerhaeuser 36, International
    Paper 34, Goodyear 31, Xerox 26, RTX 25 (Hamilton Sundstrand, Carrier and Pratt & Whitney through the
    release map), Boeing 24.
- **Read by hand:** 60 of the 2,121, drawn at random. 59 are the company's own plant, office or division.
  One is a sold unit: "Coupled Products LLC (Formerly known as Dana…)" of 2008-10-27, on DAN, which goes
  in `NOT_THE_COMPANY`.
- **Not counted, so the figures above are a floor:**
  - 1,477 certifications on 279 companies whose first price is not read here. At the measured share,
    that is about 1,100 more certifications and about 670 more company days, so about 1,950 company days
    in all. This is an estimate;
  - names the offline replay lacks:
    - EDGAR's former names, which ingest reads: Hewlett-Packard has 158 certifications unmatched today
      (HPQ's record), Motorola 48 (MSI's) and AlliedSignal 15 (Honeywell's);
    - spellings and units for a hand list: "VF Corporation" 92 (the index writes "V F CORP"), and
      Oracle's units 10.
- **The taken names hold:** the 67 certifications under Johnson Controls' name before 2016-09-02
  (TA-W-60727 of 2007-01-25 among them) stay off JCI, Tyco's record, which took that name on that day.
  Its certifications of 2016-09-14 (TA-W-91818 and -A, the Finance Shared Service Center in Milwaukee)
  and six later ones land. The first price holds too: 343 of General Motors' 350 certifications fall
  before GM's first price (2010-11-18) and stay off, as do 110 of Levi Strauss's 111 before LEVI's
  (2019-03-21).
- **For example,** each from the file:
  - Ford, 1979-12-26: its Cleveland Castings Plant (5,031 workers) and Plant #1 (5,005). 1980-04-17: Wayne
    Assembly 6,844 and Lorain Assembly 6,751. 1980-03-25: Kansas City 5,605;
  - Boeing, 2002-03-18: the Commercial Airplane Group at Seattle, Puget Sound and Spokane (6,000 each) and
    at Wichita and Portland (5,000 each), TA-W-40525 and -A to -D. 2017-08-08, Tukwila 5,275.
    2020-06-23, Tukwila 7,252;
  - IBM, 1994-12-16, Rochester, Minn. (400), and its Global Technology Services groups of 2010–2011;
  - Goodyear, 1990-03-09, East Gadsden, Ala. (350); Xerox, 2019-03-28, Webster, N.Y. (179).
- **Size:** the median certification covers 47 workers (the Department's estimate). 194 of 2,110 cover
  500 or more.

**Who benefits and how:** readers of manufacturer, paper, oil-service, technology and aerospace pages:
Ford, GE, IBM, Boeing, Honeywell, Weyerhaeuser, International Paper, Goodyear, Xerox, Halliburton,
Medtronic, Texas Instruments, Intel. They get the federal finding that a named plant's or office's job
losses came from imports or a move abroad, on the day it was made. Ford's page gets the import crisis of
1979–1980 plant by plant. Boeing's gets its post-2001 cuts, and IBM's the services moved offshore after
2009. More than four fifths fall before 2017, and a quarter before 1993.

**Risk:**
- **The codes are read from their dates,** not from a codebook. The build reads the codebook or a week's
  notice first, and keeps a code it cannot place off the pages.
- **Workers are the Department's estimate per worker group,** and a petition's sites can repeat one
  figure (Boeing's TA-W-40525 and its four letters). The row gives each site's figure and never adds them
  up.
- **Store- and office-level names,** "IBM Global Technology Services", "Leased Workers from Adecco": the
  caption rule reads the firm, and a staffing agency named in the division is not a party.
- **A split company's later petitions** ("Hewlett-Packard Company" after HP's split of 2015) need a day
  in the hand list, as the release map's units carry.
- **The link:** the Department's petition pages are on www.dol.gov, which refuses this container. The
  row links the Federal Register notice that lists the petition where the build finds it by number (with
  its comma), else the dataset's page on data.dol.gov.

**One call inside it, for the owner:**
- **Denials:** (a) no row (recommended). A denial is the Department's finding that trade did not cause the
  job losses, and the petition alone is the workers' claim. Or (b) a row of its own, "petition denied":
  about 1,330 more from first prices, by the same replay.

**Cost:** none. One keyless 48 MB zip, once, and a committed slim file of the certifications (about 7 MB
as JSON before compression, an estimate).
**Effort:** small-medium:
- the sync script and the committed file;
- the rule as EPA's and the CPSC's;
- a units and spellings list and the namesakes, read by hand;
- the rows, `check:taa` on a committed slice, and the coverage map's, README's and the Sources panel's
  lines.

**How to check:** a new `check:taa` on a committed slice of the file:
- Ford's certifications of 1980-04-17 (Wayne Assembly TA-W-6955, 6,844 workers; Lorain; Wixom) are one row
  on F;
- Boeing's of 2002-03-18 (TA-W-40525 and -A to -D) are one row on BA, five sites listed, their workers
  never summed;
- Johnson Controls, Inc.'s certification of 2007-01-25 (TA-W-60727) stays off JCI, and TA-W-91818 of
  2016-09-14 lands;
- General Motors Corp.'s certifications before 2010-11-18 stay off GM, and General Motors' seven of
  2014–2019 land (TA-W-85510, Marion Metal Center, 2014-10-08, the first);
- "Coupled Products LLC (Formerly known as Dana…)" stays off DAN;
- a denial makes no row under (a).

On main they fail: the source does not exist.

**Depends on:** the owner's approval of a new source. Its licence is the Labor Department's, read
2026-11-10 and recorded for MSHA.

**Buildable by:** a cloud session. data.dol.gov answered every request from here; www.dol.gov did not.

*Importance:* high — 1,292 company days on 179 pages measured from first prices, 1,063 before 2017, about
1,950 with the companies whose first price is not read here (an estimate), Ford's, GE's, IBM's and
Boeing's plant by plant · *Efficiency:* very high — one keyless file, read once; the caption rule and the
units map exist · *Practicality:* high — measured on the whole file; the codebook and a hand list are to
be read

---

## 2. The NLRB's Board decisions in the company's own cases, from 1962: GE's, Goodyear's, General Dynamics', Exxon's and AEP's of the 1960s–80s, Caterpillar's, Starbucks', Apple's and Tesla's of today… · proposed `P1` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** PENDING
**Owner's reason (if rejected):**

**Raised before:** no. No earlier file mentions the NLRB.

**Anchor:** a stated objective with no work behind it, and the same 1963–2017 hole. The National Labor
Relations Board decides every unfair labor practice case and contested union election in the private
sector. Its decisions name the employer as the case's caption. No source the pages read covers labour
relations. The EEOC's releases (batch 152) are discrimination suits, and the Board's cases are its own,
not in the Justice Department's releases.

**What:** an adapter, `lib/nlrbDecisions.ts`, and a walk, `lib/ingest/nlrbWalk.ts`, with a new source key
(44, `nlrb_decisions`) and a table (db/054), as the EEOC's are built:
- **The read:** the Board's decision listing (`/cases-decisions/decisions/board-decisions`), 100 a page,
  667 pages read once and kept, then its newest page once a day. Each row gives the issue day, the
  citation ("375 NLRB No. 63"), the case name, the decision's PDF and the case number. That is about 15
  minutes at 1.3 s apart, run in the NLRB's night window (below).
- **The rule:** the caption rule (`captionParty`, with `respondents`' reading of "d/b/a") on the case
  name, under the company's names of the year and the release map's units, from its first price, with
  the table of taken names. Added: a units list read by hand (`NLRB_UNITS`) and namesakes in
  `NOT_THE_COMPANY`.
- **The kind, from the case number:** CA (and C before 1948) is an unfair labor practice case against the
  employer. RC, RD, RM and UC (R before 1948) are an election or a unit question at the employer. CB, CC,
  CD, CE, CG and CP are cases against a union, and make no row whatever their caption names
  ("UFCW, LOCAL 700 (KROGER)").
- **The row:** one a company a day. "NLRB decision: Tesla, Inc., 375 NLRB No. 63 (case 03-CA-312352), an
  unfair labor practice case", linked to the decision.

**Licence:** a new source. The NLRB's policies page, read today, states no licence or copyright terms.
So the owner's ruling applies: the decisions are a federal agency's own work. It does state a disclaimer
and a bulk-data policy, both binding on the build:
- "While we try to keep the information timely and accurate, we make no guarantees. … Users should be
  aware that the information available on this web site may not reflect official positions of the NLRB."
- "The NLRB welcomes individuals and organizations who wish to download information about cases and other
  datasets available through this website. We ask, however, that bulk data extractions be scheduled for
  non-peak hours (between 11pm EST – 6am EST) … Further, we ask that automated programs not run more than
  5 concurrent requests from the same IP, or the total requests exceed 20 per 200ms."

Today's 30 requests ran one at a time, 1.3 s or more apart, between 13:50 and 14:15 Eastern. That is a
sample inside the stated limits, not a bulk extraction, but it was in peak hours, and I say so. No key.

**Grounded in:**
- **The listing:** 66,645 decisions (666 pages of 100 and 45 on the last), volumes 0 to 375.
  - The newest is 2026-11-12 (Blick Art Materials, 375 NLRB No. 68). The oldest are of April 1936 (Jones &
    Laughlin Steel, Aluminum Co. of America), and a few are misdated (1919, 1924) under volumes 38–81.
  - Pages 0 to about 405 run from 2026 back to 1962: about 40,000 decisions from Yahoo's earliest prices.
  - A page of 100 covers about six months in 2026 and in 2019, three to seven months in 2010–2014, and
    three to five weeks in the 1970s.
- **The sample:** 24 pages of 100 spread across the list (0, 11, 22, 33, then every 33rd to 660, and 666),
  2,345 decisions, 3.5%.
- **The replay,** today's caption rule and release map under each company's names of the year:
  - 36 decision–company pairs after first prices, on 23 companies. One namesake is taken out: "National
    Steel Corp." of 1973 is not CSN. "Shell Co." of Puerto Rico (1994) is set aside as unread;
  - by page: Starbucks 7 (2026), GE 4 (1963, 1970, 1973, 1989), Caterpillar, Goodyear, General
    Dynamics and Anheuser-Busch 2 each; Kroger, PepsiCo (Frito-Lay), Apple, Tesla, Snowflake, American
    Tower, Merck (Merck Sharp & Dohme), Constellation Brands, Murphy USA (Murphy Oil USA), UNFI, ABB,
    Timken, Occidental (Occidental Chemical), Pinnacle West (Arizona Public Service), Exxon Mobil (Exxon
    Co.), AEP (Appalachian Power) and International Paper 1 each;
  - about three quarters are unfair labor practice cases, the rest elections and unit questions. No case
    against a union was matched.
- **The estimate, from the sample:** each sampled page weighted by the pages it stands for.
  - About 650 decisions after first prices, about 540 of them before 2017, most before EDGAR;
  - 36 hits could be off by a third or more, and I say so. Page 0 (May–November 2026, Starbucks-heavy)
    stands for six pages only.
- **Missed by the rule, read by hand:** 21 more in the sample, after first prices:
  - units: Fred Meyer Stores and two Kroger partnerships; Rhode Island CVS Pharmacy; DaVita's two
    dialysis companies; Pacific Bell and Michigan Bell; Home Depot USA; Lockheed Martin Tactical Aircraft
    Systems and Skunk Works; Novartis Nutrition; PPG Aerospace; Exxon Pipeline; General Electric Wiring
    Devices; XPO Logistics Freight; Walt Disney Parks and Resorts U.S.; FedEx Home Delivery; Entergy
    Nuclear Operations; CHS Community Health Systems;
  - a spelling: "Amazon.com Services, LLC", as the 2026-11-11 file found for the FDA's letters.

  Weighted, that is about 330 more: **up to about 1,000 decisions, about 780 before 2017** (an estimate).
  It leaves out Allied Chemical's two (1963, 1967), a name older than EDGAR's, by your default.
- **One decision's PDF, read:** Tesla's of 2026-10-28 adopts the judge's order: "the complaint is
  dismissed". A row from the listing alone could not say so (the call below). A 1963 PDF (GE's) has a text
  layer, but it is a slice of the bound volume and opens on another case's remedy.
- **Also seen, not measured:** the judges' decisions, 274 pages of 20 (about 5,480).

**Who benefits and how:** readers of manufacturing, utility, grocery, retail and technology pages. They
get the labour board's own decisions in the company's cases on their days: GE's and Goodyear's of the
1960s–80s, General Dynamics' elections of 1970, Exxon's of 1976, Appalachian Power's of 1973 on AEP, and
Starbucks', Amazon's, Apple's and Tesla's of the 2020s. Most fall before EDGAR, where these pages hold
almost nothing else.

**Risk:**
- **The listing does not say how the Board ruled.** The decision does. The call below is yours.
- **Units and joint employers.** "Fred Meyer Stores, Inc., a subsidiary of The Kroger Company" needs the
  units list, as the EEOC's did, and a joint-employer caption can name two companies (an "Also on" case).
- **Namesakes by the shared rule:**
  - "Wisconsin Power and Light Co." (1938) read as a party "Light Co.", Light S.A.'s name. It is before
    any first price, but EPA's rule carries its own guard for "… Power and Light Company", and this rule
    needs one too;
  - "National Steel Corp." (1973) on CSN.
- **Misdated old rows** (a "1919" under volume 81): a day before its volume's years is read from the
  volume, or the row is left off.
- **Franchisees and namesakes** under brand names ("McDonald's Drive-in Restaurant", 1973; "Fairfield Inn
  & Suites by Marriott", 2026) are other employers. They need guards read by hand.
- **A page, not a dataset:** its markup can change. `check:feeds` should watch it.

**One call inside it, for the owner:**
- **The outcome:** (a) the row from the listing alone (recommended). It names the decision and its kind,
  and links it, and says "how the Board ruled is in the decision". Or (b) also read each kept decision's
  PDF once for its order ("the complaint is dismissed", "shall cease and desist"): about 1,000 PDFs, with
  a rule per format for the bound volumes' slices.

**Cost:** none. 667 listing pages once, at night, then one a day; under (b), each kept decision's PDF
once.
**Effort:** medium:
- the walk and its table (db/054), the newest page daily;
- the rule: the caption rule, the kinds by case number, the union guard, the misdated rows;
- a units list and namesakes read by hand;
- the rows, a committed slice and `check:nlrb`, and the coverage map's, README's and the Sources panel's
  lines.

**How to check:** a new `check:nlrb` on a committed slice of the listing:
- Tesla's decision of 2026-10-28 (375 NLRB No. 63, 03-CA-312352) lands on TSLA, linked to its PDF;
- Starbucks' two decisions of 2026-06-05 (19-CA-299573 and 19-CA-295708) are one row on SBUX;
- GE's of 1963-07-30 (09-CA-002667) lands on GE, an unfair labor practice case. International Paper's of
  1963-08-05 (36-RC-000751) lands on IP as an election case;
- "General Motors Corp." of 1978 and 1994 stays off GM, before its first price, and "National Steel Corp."
  of 1973 off SID;
- "UFCW, LOCAL 700 (KROGER)" (25-CB-008896) makes no row on KR;
- "Fred Meyer Stores, Inc., a subsidiary of The Kroger Company" (19-CA-272795) lands on KR;
- "Wisconsin Power and Light Co." makes no row on LGSXY.

On main they fail: the source does not exist.

**Depends on:** the owner's approval of a new source. Its licence is settled by the ruling of
2026-11-12.

**Buildable by:** a cloud session. www.nlrb.gov and apps.nlrb.gov answered every request from here. The
walk's one long read is scheduled for 11pm–6am Eastern, by the NLRB's policy.

*Importance:* high — about 650 decisions on pages from first prices, up to about 1,000 with a units list,
most before 1993 (an estimate from 2,345 sampled decisions) · *Efficiency:* medium — the caption rule
exists; the walk, the kinds and the guards are new · *Practicality:* medium — sampled, not counted whole;
the night window and the outcome call shape the build

---

## Considered and cut

- **The Wage and Hour Division's enforcement file (measured; cut on its days).**
  - **The file:** keyless on the same portal
    (`data.dol.gov/data-catalog/WHD/enforcement/WHD_enforcement.zip`), 201,460,570 bytes, changed
    2026-11-16. It holds 370,964 cases: 223,273 with money, 9,192 of $100,000 or more in back wages and
    penalties, and 355 of $1,000,000 or more.
  - **On pages:** the caption rule ties 184 of the 9,192 to listed companies by legal or trade name, 23 of
    $1,000,000 or more. Among them: Wal-Mart's $30,857,204.68 in back wages, findings 2000-02-11 to
    2007-07-30; Halliburton's $18,163,583.02, 2013-05-05 to 2015-05-03; Corrections Corporation of
    America's $8,071,861.24; Kroger's $7,873,304.57.
  - **Why cut:** the file gives no day a case ended or was announced, only the period the findings cover
    and a load stamp (2015-02-20 on a case of 2005). A row would be dated by the end of the period
    investigated, which is no event. Trade names add franchisees: "McDonald's" 15 of the 184.
  - **The Department's newsroom,** which dates such cases, is on www.dol.gov, which still answers 403
    (Akamai).
- **OSHA's inspections (measured by a range read; cut).**
  - **The files:** keyless zips on the portal, changed 2026-11-17: inspections 1,456,720,530 bytes,
    violations 2,275,875,467, plus accident files. Each is one CSV stored uncompressed, so a byte range
    samples it.
  - **The sample:** 4 MB from the middle of the inspection file held 14,687 inspections of the 1970s to the
    2010s. 160 were at listed companies' sites by the caption rule (UPS 13, RTX 11, Lowe's 5…), 16 of them
    accident inspections.
  - **Why cut:** that projects to tens of thousands of inspections on pages (an estimate), most of them
    routine, at store level ("HOME DEPOT, STORE #1007") and under franchise brands. A floor like MSHA's
    (a death) needs the accident and injury files joined to the inspection file by number, several GB a
    read, and it was not measured on deaths. It is worth a measured note if the owner wants OSHA.
- **BIS export enforcement (measured; cut, small and recent).**
  - **The list:** bis.gov's enforcement news, 436 items in one page's data, 2017-02-24 to 2026-11-16,
    30 before 2020.
  - **On pages:** the Justice title rule gives 4 (SAP 2021-04-29, Microsoft 2023-04-06, Cadence
    2025-07-28, Applied Materials' $252 million 2026-02-12). By hand, about 12 more: Seagate Technology
    LLC's $300 million of 2023-04-19, Regal Beloit, Pratt & Whitney Component Solutions, Wabtec, Quantum,
    GlobalFoundries, Alpha and Omega Semiconductor, Teledyne FLIR, Solventum and others. That is about 16
    on about 15 pages, none before 2021.
  - **Older cases:** the old e-FOIA library (efoia.bis.doc.gov) now redirects to the FOIA program page.
    Only 69 BIS documents in the Federal Register use "Order Relating to", none naming these companies.
- **The FAA's civil penalties (measured; cut).**
  - **The archive:** www.faa.gov answers. Its press releases begin in 2025, with an archive behind a
    keyword filter. "civil penalty" gives 8 pages, about 73 releases, 2019-02-15 to 2024-12-03.
  - **Why cut:** most are small operators (Kalitta Air's $400,000, SpaceX's $633,009, Spirit Airlines'
    $146,500 of 2024-03-22), and nothing reaches before 2019.
- **The FCC Enforcement Bureau's orders (not reachable).** www.fcc.gov answered 403 (Akamai). The FCC's
  open-data catalog holds one enforcement dataset, the Pirate Radio database, which names no listed
  company. Not raised in any earlier file.
- **The NLRB's other lists (seen, not proposed):** the judges' decisions (274 pages of 20), a follow-on
  to #2; the case search's charges, which are a party's allegation, not the Board's act.
- **Not retried, nothing having changed:** the FTC, FSIS, PHMSA, FERC, the NRC, GAO, the NTSB, OFAC, TARP,
  USAspending, the FDIC and the CPSC's civil-penalty page.
- **Owner decisions and tracked waits, not raised:** listed in the header.
- **Re-prioritisations:** none proposed.
- **Anything touching another product:** nothing here reads, references or connects to another
  product's repository.

*One closing note, not a proposal* — noticed in passing. `captionParty` read "Wisconsin Power and Light
Co." as the party "Light Co.", Light S.A.'s (LGSXY) name, taking "and" for a separator. EPA's rule has
its own guard for "… Power and Light Company", but the shared rule has none. It is the class of the
2026-11-15 note on "… and Trust Company". I did not check whether the SEC's captions, the Board's orders,
the CFPB's actions or the CPSC's firms hold such a party after a first price. The `code-auditor` may want
it.
