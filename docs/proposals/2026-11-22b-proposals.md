# Opportunity proposals — 2026-11-22 (second run)

**Commit:** 89fce0c6838d9c5806e1120253a57e0ec7dd216a (`claude/lucid-goodall-6km6ea`, equal to `origin/main` after batch 170) · **Reviewed:** `CLAUDE.md`; `README.md` ("Sources evaluated and rejected"); `docs/COVERAGE-MAP.md` (47 sources, "The gaps worth knowing about"); `docs/OWNER-ACTIONS.md` (§3 with the ruling on federal works, "Decisions I can't make for you"); `docs/MASTER-CHECKLIST.md` (Scope refocus and its open items, the ledgers of batches 164–170); `docs/proposals/2026-11-22-proposals.md` whole, every other proposal file's titles, statuses and "Considered and cut" lists back to 2026-07-30; `docs/decisions/2026-09-28-business-decisions.md` (D3); code: `lib/hsrEarly.ts` (`partyIsCompany`, `hsrEvents`), `lib/fdaApprovals.ts` (`approvalIsCompany`, `APPLICANT_NAMES`), `lib/fdaRecalls.ts` (`FDA_FIRMS`, `firmFor`), `lib/fedPress.ts`, `lib/fedOrders.ts`, `lib/fedActions.ts`, `lib/secCases.ts` (`captionParty`), `lib/frCompany.ts` (`companyNames`), `lib/ingest/frBackfill.ts` (`namesForYear`), `lib/sec.ts` (`newsNamesFor`, `possessiveNameFor`, `renamesFrom`), `lib/doj.ts` (`dojPossessive`), `lib/releaseNames.ts` (`releaseNamesOn`), `lib/takenNames.ts` (`takenBefore`), `lib/ingest/store.ts` (the Federal Reserve's and openFDA's licence notes), `scripts/check-hsr.ts` and `scripts/check-nlrb.ts` (their replay of every company in the index) · **Proposals:** 3

> - **No rejection log exists** (`docs/audits/rejected-proposals.md`), and nothing has been rejected.
>   All three proposals of 2026-11-22 are approved and built (batch 166, the merger waiting period's early
>   terminations; batch 167, the ITC's Section 337 investigations; batch 169, the FDA's press releases and
>   talk papers), and batch 170 fixed their audit. Nothing was deferred and nothing carries forward.
> - **Settled, not raised again:** batch 168's whole NLRB listing; batch 170's fixes; batch 165's entry for old
>   Broadcom's name; the ruling that a federal agency's own work is usable where its site states no licence.
> - **Defaults still yours to change, not raised:** the Digest's first-price floor and its names older than
>   EDGAR's; widening `MANY_PARTIES`; "Drugs whose holder changed".
> - **What is new:** three sources no adapter reads.
>   - openFDA's 510(k) file (#1), on the host and under the licence of the device recalls pages already hold.
>   - The Federal Reserve's weekly H.2 release (#2), on the host of three held sources.
>   - The Official Journal's merger notices (#3), listed by the EU Publications Office's SPARQL endpoint and
>     read from EUR-Lex: the first non-US regulator, a gap the coverage map names.
> - **"Stored but never surfaced":** not swept again. `event_enrichments` is still written by no code.
> - **Saved data used instead of the network:**
>   - the first trading days of 954 tickers from the committed fixtures (`digest-1985-entries`,
>     `eeoc-listing`, `fda-device-recalls`, `occ-actions`), as `check:taa` and `check:nlrb` read them;
>   - EDGAR's former names of 510 companies from `scripts/fixtures/nlrb-decisions-2026-11-22.json.gz`;
>   - the ticker index, the alias file, the release map, EPA's and the CPSC's `UNITS`, the recall map
>     (`FDA_FIRMS`), the approvals' names and the committed merger grants, through the repository's own
>     functions.
>
>   Each download was read as data, with `python3 -I`, `pdftotext` or `openpyxl`, or through
>   `partyIsCompany`, `approvalIsCompany`, `captionParty`, `companyNames`, `namesForYear`, `newsNamesFor`,
>   `possessiveNameFor`, `dojPossessive`, `releaseNamesOn`, `takenBefore` and `hsrEvents`. The probes are in
>   the session scratchpad (`scout171/scripts/`). The downloads are under `/var/tmp/scout171/`, one directory
>   each.
> - **Measured live on 2026-11-22 from this container.** Every figure below is measured unless it says it is
>   an estimate. Requests, by host:
>   - www.federalreserve.gov 45: robots.txt (404, none served), the H.2 index, 40 weekly releases, one week's
>     two HTML pages, the Board's disclaimer (#2);
>   - www.govinfo.gov 16: 14 of the Board's Federal Register notices of applications (#2's call), a 1985
>     issue's metadata and, by HEAD, its PDF's size (cut);
>   - www.federalregister.gov 7: a yearly count and six list pages, the last empty (#2's call);
>   - publications.europa.eu 7 (its robots.txt a 301 to op.europa.eu's), op.europa.eu 1 and
>     eur-lex.europa.eu 3: five SPARQL queries, one refused (400) for an offset past 10,000, robots.txt,
>     EUR-Lex's legal notice, its robots.txt and one notice's text (#3);
>   - api.fda.gov 2 and download.open.fda.gov 1: two counts of applicants and the 510(k) file (#1);
>   - nrc.uscg.mil 5, www.nrc.gov 3: cut;
>   - www.defense.gov 1 (403), www.bls.gov 1 (403), www.oe.netl.doe.gov 1 (the proxy's 502): cut.
>
>   That is 93 requests: 85 answered 200, two 301, one 302, one 400, two 403, one 404 and one no answer. Each
>   carried the User-Agent `News Charts Research`, with no email address. They ran one at a time, each at
>   least 1.6 s after the one before ended. EUR-Lex's robots.txt asks a 10 s crawl delay, and its one notice
>   was asked 12 s after it; its legal notice had been read six minutes before its robots.txt, which allows
>   it. No request went to www.nlrb.gov, www.sec.gov, data.sec.gov or efts.sec.gov. Postgres was not used and
>   the app was not run. The log is `/var/tmp/scout171/requests.log`.
> - **Nothing here needs a key, a paid tier or a recurring charge.** #1 reads one 250 MB file a month. #2
>   reads 1,567 weekly PDFs once, then one a week. #3 reads about 37 SPARQL lists and about 2,200 notices once,
>   then a few a month.
> - Ranked by importance, securities depth first:
>   1. the FDA's 510(k) clearances, 1976–2026: each device the company was cleared to sell, from before
>      EDGAR;
>   2. the Federal Reserve's weekly actions on the company's applications, 1996–2026: the banks' deals, which
>      the merger waiting period's grants hold few of;
>   3. the European Commission's merger reviews, 1990–2026: the company's deals notified in Brussels.

Mark each proposal below: `APPROVED`, `REJECTED`, or `DEFERRED`, and add a
reason for anything rejected. Then run the scout in FILE mode.

---

## 1. The FDA's 510(k) clearances, 1976–2026: each device the FDA cleared the company to sell — Abbott's cardiac monitor of 1976, GE's x-ray tables, DePuy's hip liners under J&J, Intuitive Surgical's first instruments, Align's aligners, Insulet's pump, Apple's ECG app… · proposed `P1` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** PENDING
**Owner's reason (if rejected):**

**Raised before:** as unmeasured only. The 2026-11-06 file listed "device approvals (PMA, 510(k))" as not
measured. The 2026-11-07 file measured the PMA file and cut it, because its applicant is today's holder (St.
Jude's heart valve of 1982 reads "ABBOTT MEDICAL"). Nobody read the 510(k) file. What changed: it is measured
here, and unlike the PMA file it keeps the applicant that filed.

**Anchor:** data on a held host that no adapter reads, and the 1963–2017 hole for the device makers. Pages
hold the FDA's device recalls from 2000 (batch 144) and its enforcement reports from mid-2012, from openFDA
under the same licence. The approvals' rule (`approvalIsCompany`) and the recall map's units exist. Nothing
holds what the FDA cleared the company to sell. Since the Medical Device Amendments of 1976 a device of
moderate risk reaches the market by a 510(k) premarket notification the FDA finds "substantially equivalent",
or by a De Novo grant. openFDA publishes all 176,683 decisions as one keyless file.

**What:** an adapter, `lib/fdaClearances.ts`, with a new source key and no table:
- **The read:** openFDA's `device/510k` file, one zip of 249,823,383 bytes (1,623,961,753 bytes of JSON,
  exported 2026-11-18). `npm run sync:fda-clearances` streams it monthly and commits the clearances any company
  in the index could hold: about 22,000, about a megabyte compressed (an estimate). It is run again after
  `npm run sync:tickers`. Ingest asks nothing.
- **The rule:** `approvalIsCompany` on the applicant, on the decision's day. That is the caption rule under
  the company's names of the year, the recall map's firms (`FDA_FIRMS`) and the approvals' names
  (`APPLICANT_NAMES`) on their days, the table of taken names and the company's first price. Two additions:
  - **the units' days before 2000.** The map's days were read for recalls from 2000 on, and its own notes say
    so: Howmedica "held before the reports begin" (`lib/fdaRecalls.ts:113`), DePuy "since 1998" (`:332`),
    Radiometer "Danaher's since 2004" (`:441`), and Cordis with a `to` and no `from` (`:357`). 92 of its 163
    firm entries have no `from`. The build reads each unit's purchase day back to 1976 from a filing, as
    batch 144 did for 2000–2012;
  - **namesakes read by hand** into a `NOT_THE_COMPANY`: every company's distinct applicant names, once.
- **The row:** "FDA cleared Intuitive Surgical, Inc.'s Intuitive Surgical Stereo View Endoscopic System, Model
  SVS-1 (K990188): substantially equivalent to a device already marketed". It gives the 510(k) number, the
  product code, the FDA's decision words, and a link to the FDA's own 510(k) page
  (`accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm?ID=K990188`). A De Novo grant says so.

**Licence:** openFDA's, the repository's own record for sources 40 and 47 (read 2026-11-22 for source 47):
"unless otherwise noted, the content, data, documentation, code, and related materials on openFDA is public
domain and made available with a Creative Commons CC0 1.0 Universal dedication… You can copy, modify,
distribute and perform the work, even for commercial purposes, all without asking permission." Today's API
answers carry the same notice: "Do not rely on openFDA to make decisions regarding medical care. While we make
every effort to ensure that data is accurate, you should assume all results are unvalidated." No key: one
file a month. The two API counts here were well inside the 1,000 a day openFDA allows without one.

**Grounded in:**
- **The file:** 176,683 decisions, 1976-07-15 to 2026-11-08. 145,760 fall before 2017 and 64,228 before 1994.
  173,114 are "substantially equivalent" and 493 are De Novo grants.
- **The applicant is the one that filed:**
  - openFDA's count of applicants holding "St Jude Medical" gives "St Jude Medical" 105 and "St. Jude Medical,
    Inc." 23, 128 records of 1989–2018. The ten that name Abbott ("Abbott (St. Jude Medical)", "St. Jude
    Medical (Now Abbott Medical)") are all of 2017-08-18 or later, after Abbott's purchase. Before 2017
    "Abbott Medical" appears only as Abbott Medical Optics (12) and Abbott Medical Electronics Co. (2);
  - 16 names only a buyer could hold (Zimmer Biomet, Howmedica Osteonics, GE Healthcare, Covidien, Abbott
    Medical…) hold 2,151 records. 39 are dated before the name could exist: 27 "Medtronic Minimed" of
    1988–2001, 6 "Meadox Medicals, Div. Boston Scientific Corp." of 1976, 5 "Edwards Lifesciences" before 2000
    (one of 1979), 1 "DePuy Synthes" of 1979. Zimmer Biomet, Howmedica Osteonics, GE Healthcare, Covidien and
    Abbott Medical have none. The unit's day refuses the 39.
- **The replay,** every company in the index, `approvalIsCompany` under each company's names of the year:
  - 22,026 matches, 21,704 distinct clearances, on 279 companies: 19,481 company days, 14,424 before 2017,
    4,586 before 1994;
  - from the first prices the fixtures carry: 13,063 company days on 67 pages, 10,250 before 2017, 3,296
    before 1994. By decade: the 1970s 329, the 1980s 1,915, the 1990s 2,881, the 2000s 3,000, the 2010s 3,040,
    the 2020s 1,898;
  - by page: Johnson & Johnson 2,357, Medtronic 1,561, Stryker 1,383, BD 1,102, GE 1,066, Abbott 953, Philips
    889, Boston Scientific 760, Baxter 576, 3M 531, Zimmer Biomet 510, Danaher 382. Eleven pages get 500 or
    more, three 100 to 499 and 53 fewer;
  - 5,420 more fall on 200 companies with no first price read here: Smith & Nephew 744, Siemens Healthineers
    341, Medline 282, CONMED 222, STERIS 206, Intuitive Surgical 193, Merit Medical 181, Globus 175, Edwards
    163, Cooper 140;
  - one row a company a month gives 5,675 from first prices, 4,350 before 2017;
  - 322 clearances reach two companies: 3M and Solventum 125, Fresenius Medical Care's two listings 91, Akzo
    Nobel and Organon 41, Bausch Health and Bausch + Lomb 35. First prices and the units' days settle most.
    "Boston Scientific, Target" (19) reaches Target Corporation, a namesake.
- **Read by hand:** 45 drawn at random.
  - 36 are the company's own: Abbott Laboratories' NutriMix and AxSYM, Ethicon's suture clips, Boston
    Scientific Scimed's Wallstent, Datex-Ohmeda's under GE after 2003, Philips Volcano's catheter, Varian's on
    Siemens Healthineers.
  - 2 are the business's own from before its spin-off, which the first price keeps off: Zimmer's of 1980 on
    Zimmer Biomet, and 3M Health Care Sarns's of 1994 on Solventum.
  - 6 are a unit's from before the company bought it: Howmedica Corp.'s of 1981, 1988 and 1994 on Stryker,
    Cordis Corp.'s of 1984 and DePuy, Inc.'s of 1997 on Johnson & Johnson, and Radiometer America's of 1993 on
    Danaher.
  - 1 is a namesake: "Quantum Co., Ltd.", Shandong's exam gloves of 2009, on Quantum Corporation.
- **The units before 2000, counted:**
  - 11,825 of the 19,481 company days come only through a unit's name, 4,746 of them before 2000.
  - Of those on pages, at least 898 fall before the company bought the unit, as I read the companies'
    histories: Howmedica's 289 on Stryker (Pfizer's to 1998), DePuy's 270 and Cordis's 208 on Johnson &
    Johnson (bought 1998 and 1996), Physio-Control's 66 on Medtronic (1998), Radiometer's 47 on Danaher (2004)
    and Meadox's 18 on Boston Scientific.
  - The figures above include them. With them out, about 12,000 company days fall from first prices (an
    estimate). The build reads each day from a filing.
- **For example,** each from the file:
  - Abbott Laboratories' portable cardiac monitor "Abby" (K760593, 1976-09-16) and GE's x-ray table
    (K760466, 1976-08-26);
  - Intuitive Surgical's Monarch laparoscopic manipulator (K965001, 1997-07-31) and its da Vinci Single Site
    instruments (K112208, 2011-12-08);
  - Align Technology's first aligner system (K981095, 1998-09-08); Insulet's IXL diabetes management system
    (K031373, 2003-12-19);
  - Apple's ECG app and irregular rhythm notification (DEN180044 and DEN180042, De Novo grants of
    2018-09-11), and its hearing aid feature (DEN230081, 2024-09-12);
  - Acclarent's Aera balloon on Johnson & Johnson (DEN150056, 2016-09-16).

**Who benefits and how:** readers of the device makers' pages: Johnson & Johnson, Medtronic, Stryker, BD, GE,
Abbott, Philips, Boston Scientific, Baxter, 3M, Zimmer Biomet, Danaher, and the smaller ones whose products are
the story (Intuitive Surgical, Edwards, Dexcom, Insulet, Align). Each device appears on the day the FDA cleared
it. It is the deepest source yet for the sector before EDGAR: 3,296 company days from first prices before 1994.

**Risk:**
- **Volume on the largest makers.** Johnson & Johnson gets 2,357 days and Medtronic 1,561, most of them
  routine. The call below shapes it.
- **The units' days before 2000** are the work: at least 898 rows fall before a purchase, and only the units'
  days keep them off.
- **Namesakes among the small:** 189 of the 279 companies have twelve matches or fewer, and among them are
  "Adm, Inc." on ADM, "Aon Co., Ltd." on Aon, "Blackstone" on Blackstone and "Denali Corporation" on Dell. The
  build reads every company's distinct applicant names by hand, as batch 100 read every CPSC firm.
- **The approvals' names were read for drugs:** J&J's `/^Ortho\b(?!\s+Clinical)/i` (`lib/fdaApprovals.ts:125`)
  lets the hyphenated "Ortho-Clinical Diagnostics" through. 15 of its clearances, on 13 days after J&J sold it
  in 2014, reach JNJ. The build's rule refuses them; see the closing note.
- **A clearance is not a launch.** The row says the FDA found the device substantially equivalent, nothing
  more.
- **The file is 1.6 GB of JSON.** The sync streams it a record at a time and never parses it whole.

**One call inside it, for the owner:**
- **How the clearances sit on a page:**
  - (a) one row a company a month, naming each device and its number (recommended): 5,675 rows from first
    prices instead of 13,063. A De Novo grant is always a row of its own;
  - (b) one row a company a day.

**Cost:** none. One 250 MB file a month, and nothing at ingest.
**Effort:** medium-large:
- the streamed sync and the committed file;
- the units' purchase and sale days back to 1976, each from a filing;
- the namesakes read by hand;
- the rows and the month grouping;
- a committed slice and `check:fda-clearances`;
- the coverage map's, README's and the Sources panel's lines.

**How to check:** a new `check:fda-clearances` on a committed slice of the file:
- K760593 (Abbott Laboratories, 1976-09-16) lands on ABT, and DEN180044 (Apple's ECG app, 2018-09-11) lands on
  AAPL as a De Novo grant;
- Howmedica Corp.'s K803127 (1981), K874923 (1988) and K930223 (1994) stay off SYK, and Howmedica Osteonics'
  after Stryker's purchase land;
- Cordis Corp.'s K811259 (1984-12-27) and DePuy, Inc.'s K972568 (1997-09-19) stay off JNJ, and DePuy
  Orthopaedics' K000172 (2000-02-03) lands;
- "Medtronic Minimed"'s K880623 (1988-04-21) stays off MDT;
- Ortho-Clinical Diagnostics' K160495 (2016-10-18) stays off JNJ;
- "Quantum Co., Ltd."'s K083931 stays off QMCO, and "Boston Scientific, Target"'s K002181 off TGT;
- under (a), Johnson & Johnson's clearances of a month are one row and a De Novo grant is its own.

On main they fail: the source does not exist.

**Depends on:** the owner's approval of a new source, under a licence the registry already records.

**Buildable by:** a cloud session. download.open.fda.gov and api.fda.gov answered from here.

*Importance:* high — 13,063 company days on 67 pages from first prices, 10,250 before 2017, 3,296 before 1994,
measured on the whole file (about 12,000 once the units' days are read, an estimate), and 5,420 more on 200
companies whose first price is not read here · *Efficiency:* high — one keyless file; the approvals' rule and
the recall map exist · *Practicality:* medium — the units' purchase days back to 1976, and the small
companies' names read by hand

---

## 2. The Federal Reserve's weekly actions on the company's applications, 1996–2026: each bank or business it was approved to buy, and each stake approved in it — Norwest's and Wells Fargo's acquisitions, State Street's Askari, Citigroup's commodity trading, FBOP's stake in Banner, BNP Paribas's in Shinhan, PNC's RBC Bank (USA)… · proposed `P1` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** PENDING
**Owner's reason (if rejected):**

**Raised before:** no. Pages hold the Board's own orders of 1996–2005 (`lib/fedOrders.ts`, batch 99, 469
orders) and its press releases since 2006 (`lib/fedPress.ts`, batch 84). Those carry only what the Board itself
decided and announced. In the sample below, 47 of 57 deals were decided by a Reserve Bank or the staff under
delegated authority, and the H.2 is where those are published. FDIC BankFind's structure history was cut on
2026-11-01, unmeasured, because tying an FDIC certificate to a listed holding company needs a map. The H.2
names the holding company and its city.

**Anchor:** a sector the deal sources under-serve. Batch 166's grants give acquisitive companies their deals.
But a bank acquisition the Board or a bank regulator must approve is exempt from the Hart-Scott-Rodino filing
(section 7A(c)(7) of the Clayton Act), so the grants hold few of the banks' bank deals. The Board's weekly
release "H.2, Actions of the Board, Its Staff, and the Federal Reserve Banks; Applications and Reports
Received" lists the week's actions on applications, each under its Reserve Bank, with the outcome and its day.
The archive runs from 1996 and no adapter reads it.

**What:** an adapter, `lib/fedH2.ts`, with a new source key and no table:
- **The read:** the release index (one page lists 1,567 weeks), then each week's full release, a PDF, once.
  At the sample's mean of 346 KB that is about 540 MB, about an hour at 1.6 s apart. Then one a week.
  `npm run sync:fed-h2` writes a committed file of the parsed actions. Ingest asks nothing. The sync needs
  poppler's `pdftotext`, which the Digest walk needs on its host already.
- **The layouts,** three, seen here, each read with every action under its section (the Board's, or
  delegated), category and Reserve Bank:
  - 1996 to early 1998, the categories in capitals (still so on 1998-01-24);
  - 1998–2022, "Applicant, City, State -- what it applied for" and "- Approved, May 7, 1999" (still so on
    2022-09-24);
  - 2023–2026, an em dash and "Approved: September 7, 2023".
- **Which actions make a row:** bank holding companies, bank mergers, changes in bank control, financial
  holding company elections, savings and loan holding companies, and the acquisitions of state member and
  foreign banks. Routine actions make none: branches, membership, public welfare investments, Regulation K
  investments, offices abroad, waivers of a notice period, interlock exemptions, extensions of time, comment
  periods and internal reorganizations.
- **The rule:** the merger notices' (`partyIsCompany`) on each applicant and each company acquired. That is the
  caption rule under the company's names of the year, the release map's banks (`BANK_UNITS`: Centennial Bank on
  Home BancShares), the table of taken names and the first price. Add a namesake guard by the city and state
  the release gives: each company's cities are read by hand once, and a move of its own head office is kept
  (United Community Banks, Blairsville, Georgia, then Greenville, South Carolina; both are in the sample).
- **The row:** one a company a day: "Federal Reserve Bank of Dallas approved, under delegated authority, Wells
  Fargo & Company's application to acquire Prime Bancshares, Inc., Houston, Texas, and Prime Bank". It gives
  the outcome (approved, permitted, withdrawn, denied), the company's role and the week's release, linked.
  - A Board action on a day the page already holds the Board's order joins that row instead of making its
    own, as the FDA's releases join approvals (batch 169).
  - A deal of two listed companies is on both pages, saying "Also on" (a new multi-party source, with a
    migration that builds the index again).

**Licence:** the Board's own, read today (`federalreserve.gov/disclaimer.htm`), as the registry records it for
sources 26 and 29: "Unless otherwise indicated, information on Board's website is in the public domain and may
be copied and distributed without permission. Please cite to the Board as the source of the information."
www.federalreserve.gov serves no robots.txt (404). No key.

**Grounded in:**
- **The archive:** 1,567 weekly releases, 1996-11-02 to 2026-11-14, 1,052 of them before 2017.
- **The sample:** 40 releases drawn at random, one or two a year (13,850,877 bytes, 95 KB to 1.4 MB each). 38
  have text. Two are scans with no text layer ("tiff2ps"): 1996-12-14 and 1997-04-19. How many more of
  1996–1997's are scans was not counted.
- **Parsed:** 1,102 actions, 611 of them in the categories above.
- **The replay,** the shared party rule under each company's names of the year, every one of the 88 company
  days read by hand. They fall on 63 companies:
  - **57 deals or stakes.** 37 fall before 2017. 33 are from first prices where read, 1 before one, and 23 on
    companies with no first price read here. 47 are the Reserve Banks' or the staff's under delegated
    authority, which no held source carries; 10 are the Board's own.
  - **23 routine:** public welfare investments 6, internal reorganizations 4, notice-period waivers 3, Regulation
    K and other investments abroad 2, offices abroad 2, interlock exemptions 2, comment-period requests 2, a
    section 23A exemption, a relief from commitments. They sit in the same categories as the deals, so the
    routine filter reads what the action is, not only its heading.
  - **8 namesakes, each in another city than the company:** Citizens Bank of Shawano, Wisconsin (1998) on
    Citizens Financial; FNB, Inc. of Dennison, Ohio (1998) on F.N.B.; Equity Bank of Marlton, New Jersey (2002)
    on Equity Bancshares; First National Corporation of Folkston, Georgia (2002) on First National Corp. of
    Virginia; Timberland Bancorp of Baxter, Minnesota (2004) on Timberland; CSB Financial Corporation of Miles,
    Texas (2008) on CSB Financial, probably; Peoples Bancorp of Prairie du Chien, Wisconsin (2008) on Peoples
    Bancorp of Ohio; Commerce Bancshares of White Castle, Louisiana (2021) on Commerce Bancshares.
- **The estimate:** 1.5 deals a week. Over 1,567 weeks that is about 2,350 company days before first prices,
  about 2,100 on pages and about 1,500 before 2017. It is an estimate from 38 weeks and could be off by a
  third. I say so.
- **A floor:**
  - Norwest's actions of 1997 reached Wells Fargo only through the EDGAR former name the NLRB fixture carries
    for it ("NORWEST CORP" to 1998-10-21). Ingest reads every company's;
  - BB&T Corporation (Truist's record, 1999) and Tompkins Trustco (Tompkins Financial's) were missed for want
    of them;
  - spellings missed too: "F.N.B. Corporation" of Hermitage, Pennsylvania, against EDGAR's "FNB CORP/PA/",
    and "Fidelity D&D Bancorp" against "FIDELITY D & D BANCORP INC".
- **For example,** each from the releases:
  - Norwest's residential mortgage lending acquisition (1997-11-17, on Wells Fargo), State Street's Askari
    (1998-06-23), Huntington's SecureWare (1998-01-23);
  - Wells Fargo's Prime Bancshares (1999-12-10) and Texas Financial Bancorporation (2001-12-20, a Board
    action); Fulton's Skylands (2000-06-29); Citigroup's physical commodity trading (2003-10-01, a Board
    action);
  - FBOP Corporation's stake in Banner (2007-09-11); Fifth Third's R-G Crown Bank (2007-09-13); BNP Paribas's
    shares of Shinhan (2008-12-05); Goldman Sachs's shares of SKBHC Holdings (2010-06-17);
  - PNC's RBC Bank (USA) (2011-12-19, a Board action); First Business Financial's Aslin Group, withdrawn
    (2014-07-02);
  - The Vanguard Group's change-in-control notice on Northern Trust (2021-02-18); Nicolet's Advantage Community
    Bancshares (2020-06-25).

**Who benefits and how:** readers of the bank pages, above all the regional banks whose pages hold filings and
little else (First Interstate, Fulton, WesBanco, Banner, Associated, Park National, United Community, Nicolet,
Renasant). They get each deal the Fed acted on, on its day, from 1996, and each stake an investor was cleared
to take in them. The large banks gain the deals below the Board's own orders. About two thirds fall before 2017.

**Risk:**
- **An estimate from 38 weeks.** It could be off by a third.
- **Scans:** two of the sample's three releases of 1996–1997 have no text. A scanned week gives no row and is
  listed as unread, never guessed.
- **Namesakes by city:** common bank names ("First", "United", "Peoples", "Commerce") are the risk. The city
  guard, read by hand, takes the eight above off.
- **Not the deal's announcement or its closing:** the row says what the Fed did on the day. A withdrawal says
  so.
- **The Board's own actions** overlap the held orders and press releases; they join those rows.

**One call inside it, for the owner:**
- **Which events make a row:**
  - (a) the Fed's actions on the company's deals, on the action's day (recommended);
  - (b) (a), and each application on the day the Board's Federal Register notice published it:
    - 4,544 notices headed "Formations of, Acquisitions by, and Mergers of Bank Holding Companies",
      1994-01-05 to 2026-11-19, 3,602 of them before 2017, each read from govinfo as batches 166 and 167 read
      the Federal Register;
    - a sample of 14 held 31 applications. 6 matched, 4 the company's own: Capital One's for Discover
      (2024-03-27), First Interstate's (2015), Camden National's (1999) and BayCom's (2019);
    - the other 2 are namesakes by city: First Bancshares of Gladstone, Michigan on FBSI, and United
      Bancshares of New Orleans on UBOH;
    - about one more row a deal (an estimate), on its filing day.

**Cost:** none. 1,567 PDFs once, then one a week. Under (b), 4,544 govinfo pages once, then about two a week.
**Effort:** medium:
- the index, the PDFs and the three layouts;
- the category filter, the rule and the cities read by hand;
- the rows, the Board actions' join and "Also on" (a migration);
- a committed slice and `check:fed-h2`;
- the coverage map's, README's and the Sources panel's lines.

**How to check:** a new `check:fed-h2` on a committed slice of releases:
- Wells Fargo's approval of 1999-12-10 (Prime Bancshares) lands on WFC, and Norwest's of 1997-11-17 lands on
  WFC under its EDGAR former name;
- FBOP Corporation's stake in Banner Corporation (2007-09-11) lands on BANR as the company acquired, and BNP
  Paribas's shares of Shinhan (2008-12-05) on SHG;
- Commerce Bancshares of White Castle, Louisiana (2021-02-16) stays off CBSH, Peoples Bancorp of Prairie du
  Chien (2008-12-05) off PEBO, and Timberland Bancorp of Baxter, Minnesota (2004-10-01) off TSBK;
- United Community Banks' deals as of Blairsville, Georgia (2017-08-28, 2020-06-25) land on UCB, and its later
  head office, Greenville, South Carolina (2024), is read as its own city, not a namesake's;
- M&T's public welfare investment of 2015-12-29 makes no row;
- every action in the releases of 1997-11-22, 2011-03-26 and 2023-09-09 is parsed, one in each layout, and the
  scan of 1997-04-19 gives no row and is listed as unread;
- Bank of America's Board action of 2007-09-12 (ABN AMRO North America) joins the Board's release of that day
  where the page holds it.

On main they fail: the source does not exist.

**Depends on:** the owner's approval of a new source on a host whose terms the registry already records.

**Buildable by:** a cloud session. www.federalreserve.gov answered every release asked here; `pdftotext` is
installed in this container.

*Importance:* medium-high — about 2,100 company days on bank pages, about 1,500 before 2017 (an estimate from
38 weekly releases, 57 deals read by hand), where the merger grants hold few · *Efficiency:* medium — 1,567
PDFs once, three layouts · *Practicality:* medium — a category filter and a city guard read by hand; scanned
weeks in 1996–1997

---

## 3. The European Commission's merger reviews, 1990–2026: the company's deals notified in Brussels — Boeing/McDonnell Douglas, Exxon/Mobil, AlliedSignal/Honeywell, GE/Honeywell, P&G/Gillette, Oracle/Sun, Microsoft/Skype, Apple/Beats, Medtronic/Covidien… · proposed `P2` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** PENDING
**Owner's reason (if rejected):**

**Raised before:** yes, as unmeasured, on 2026-11-11. The Commission's case search needed a key from its
page's configuration, and that file asked for "a measured note from an official bulk copy, if one exists".
What changed: one exists. The EU Publications Office's SPARQL endpoint lists every Official Journal notice's
title without a key, and EUR-Lex serves each notice's text under a stated licence that allows commercial reuse.

**Anchor:** a gap the coverage map names: "Nothing here reaches non-US regulation". A deal above the EU
thresholds is notified to the Commission, which publishes each notification in the Official Journal naming the
parties ("Prior notification of a concentration (Case M.5529 — Oracle/Sun Microsystems)"), and later its
clearance. Pages hold the US agencies' view of a deal (the waiting period's grants), never the Commission's.
Foreign issuers listed here (Daimler, E.ON, ABB, Telenor) get no regulator of their home market at all.

**What:** an adapter, `lib/euMergers.ts`, with a new source key and a committed file:
- **The list:** the Publications Office's SPARQL endpoint, asked for the Official Journal's English notices
  titled "Prior notification of a concentration". It is asked year by year, since it refuses an offset past
  10,000 (measured: the third page of 5,000 answered 400). That is about 37 queries once, then one a month.
- **The candidates:** a party in a title's "A/B" that is exactly one of the company's names of the year or
  aliases. That gives about 2,200.
- **The text:** each candidate's notice once from EUR-Lex
  (`eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELLAR:<id>`), at its robots.txt's 10 s crawl delay:
  about six hours once, across runs, as the NLRB's night read went across nights.
  - The caption rule decides on the full names in its first paragraph ("Merck KGaA ('Merck', Germany)
    acquires… Sigma-Aldrich Corporation ('Sigma-Aldrich', the United States)"), the table of taken names and the
    first price applying.
  - The row's day is the notification's, which the text gives ("On 21 April 2015, the Commission received a
    notification").
  - A notice whose text names the company in no party makes no row.
- **The row:** one a company a day: "European Commission received notification of Oracle Corporation's
  acquisition of Sun Microsystems, Inc. (M.5529)". It gives the company's role (acquirer, acquired, joint
  venture parent), the case number and the notice's Official Journal reference, linked.
  - A case of two listed companies is on both pages, saying "Also on" (a migration).

**Licence:** EUR-Lex's legal notice, read today: "Copyright notice © European Union, 1998-2026 The Commission's
document reuse policy is based on Decision 2011/833/EU. Unless otherwise specified, you can re-use the legal
documents published in EUR-Lex for commercial or non-commercial purposes." The credit reads "© European Union,
https://eur-lex.europa.eu". op.europa.eu's robots.txt allows the endpoint. EUR-Lex's disallows its DOC and SIG
renditions, not the HTML read here, and asks a 10 s crawl delay. No key.

**Grounded in:**
- **The notices:** 10,290 prior notifications, 1990–2026, 6,486 before 2017: 11 in 1990, 97 in 1994, 357 in
  2000, 402 in 2007, 336 in 2015. Also 8,523 notices of non-opposition, the clearances, 4,923 before 2017,
  nearly all from 2000.
- **The titles, 10,000 read** (to 2026-02-24, the endpoint's limit): 9,845 name the case's parties, 9,729
  cases.
- **The replay,** a title's party exactly one of the company's names of the year or aliases:
  - 2,166 case–company pairs on 484 companies: 2,148 company days, 1,391 before 2017;
  - from first prices, 888 on 171 pages, 598 before 2017. By decade: the 1990s 106, the 2000s 276, the 2010s
    319, the 2020s 187. Goldman Sachs 99, Brookfield 41, Deutsche Bank 36, Shell 31, DuPont 19, ADM 18, IBM 17,
    Santander 16, Alcoa 16, GE 15, ArcelorMittal 15, TPG 15;
  - 1,138 more fall on 303 companies with no first price read here: KKR 131, Blackstone 85, Daimler, E.ON,
    Itochu, ABB, Telenor…
- **What pages hold already:** 328 of the 888 fall within 90 days of one of the company's rows from the merger
  waiting period's grants, most of them the same deal before the other regulator. 560 have none.
- **Read by hand:** 40 drawn at random.
  - 33 are the company's own: Verizon/MCI, Intel/Altera, Seagate/Samsung's HDD business, Delta/Virgin
    Atlantic, Biogen/Samsung Bioepis, Adobe/Figma, GATX's rail assets. Three of them are a predecessor's that
    the first price keeps off: old Dana's of 2003, old Dow Chemical's of 2005, GRAIL's of 2021.
  - 5 are namesakes: Fortis/La Caixa (1992) on Fortis Inc., Granada/Compass (2000) on Compass, Inc.,
    Sun/StorageTek (2005) on a new "Sun" listing, EQT/Investindustrial (2021) on EQT Corporation, and ADP
    (Aéroports de Paris)/JCDecaux (2023) on Automatic Data Processing.
  - 2 could not be settled from the title: Metro/Géant Polska (2006) on METRY, and a "Prudential" of 2019 on
    Prudential plc.
- **Merck:** 4 of MRK's 10 are Merck KGaA's: Schering AG and Serono of 2006, Millipore of 2010 and
  Sigma-Aldrich of 2015. The last was read: "Merck KGaA ('Merck', Germany)". The text read is what keeps them
  off.
- **For example,** each from the titles, on pages from first prices:
  - Boeing/McDonnell Douglas (1997-02-26), Exxon/Mobil (1999-05-07), Walmart/ASDA (1999-06-26),
    AlliedSignal/Honeywell (1999-07-28), General Electric/Honeywell (2001-02-13);
  - Procter & Gamble/Gillette (2005-06-08), Pfizer/Wyeth (2009-06-11), Oracle/Sun Microsystems (2009-08-05),
    Microsoft/Skype (2011-09-10), Caterpillar/Bucyrus (2011-04-07), Apple/Beats (2014-07-02),
    Medtronic/Covidien (2014-10-18).

**Who benefits and how:** readers of every sector's pages, US and foreign, where a company buys in Europe or
is bought there. That means IBM, P&G, Caterpillar, GE, Pfizer, Oracle, Microsoft and the banks' and the
buyout firms' deals (Goldman Sachs, Brookfield, Deutsche Bank). It also reaches foreign issuers listed here,
whose pages hold no European regulator: Daimler, E.ON, ABB, Telenor. Nearly two thirds fall before 2017, from
1990.

**Risk:**
- **Titles name parties by short names.** The replay's 5 namesakes in 40, and Merck, are why each candidate's
  text is read; a title alone never makes a row.
- **The crawl delay:** about 2,200 texts at 10 s each, about six hours once. A build that met a refusal would
  keep what it has read and resume, as the NLRB read does.
- **A notification is not a clearance or a closing.** Some are withdrawn, and a few prohibited (GE/Honeywell,
  2001). The row says the deal was notified, and the call below adds the clearance.
- **The same deal twice:** 328 of the 888 sit within 90 days of a waiting-period grant of the same company.
  They are two regulators' acts on two days, and each says so.
- **First prices:** many of the 303 companies with none read here are foreign issuers or buyout firms listed
  late (KKR in 2010, Blackstone in 2007). Their earlier deals stay off.

**One call inside it, for the owner:**
- **The clearance:**
  - (a) a row on the notification's day; the Commission's clearance, where its non-opposition notice is
    published, is a line on that row (recommended);
  - (b) a second row on the clearance's day, read from the 8,523 non-opposition notices the same way.

**Cost:** none. About 37 SPARQL queries and about 2,200 EUR-Lex pages once, then a few a month.
**Effort:** medium:
- the yearly lists and the candidates;
- the text read at EUR-Lex's crawl delay, the first paragraph's parties and the notification day;
- the rows and "Also on" (a migration);
- a committed slice and `check:eu-mergers`;
- the coverage map's (its first non-US regulator), README's and the Sources panel's lines, and the credit.

**How to check:** a new `check:eu-mergers` on a committed slice of titles and texts:
- M.7290 Apple/Beats lands on AAPL, M.5529 Oracle/Sun Microsystems on ORCL, M.877 Boeing/McDonnell Douglas on
  BA, and M.3732 Procter & Gamble/Gillette on PG;
- M.7435 Merck/Sigma-Aldrich stays off MRK, its text naming Merck KGaA, and M.5502 Merck/Schering-Plough lands
  on MRK;
- M.10202 EQT/Investindustrial stays off EQT, and M.11023 ADP/JCDecaux off ADP;
- M.7435's row is dated 2015-04-21, the notification day its text gives, not 2015-04-28, its publication;
- under (a), a case with a non-opposition notice carries its clearance as a line.

On main they fail: the source does not exist.

**Depends on:** the owner's approval of a new source, the first outside the United States, under EUR-Lex's
reuse licence with its credit.

**Buildable by:** a cloud session. publications.europa.eu and eur-lex.europa.eu answered from here.

*Importance:* medium — 888 company days on 171 pages from first prices, 598 before 2017, measured on 10,000
titles, and 1,138 more on 303 companies whose first price is not read; 560 of the 888 with no waiting-period
row near them; the first non-US regulator · *Efficiency:* high — the list from one keyless endpoint, a text
read only for candidates · *Practicality:* medium — the short names need each candidate's text, at a 10 s
crawl delay

---

## Considered and cut

- **The National Response Center's incident reports, 1990–2026 (measured on three years; cut).**
  - **The files:** the Coast Guard's call center publishes every oil, chemical and railroad report it takes as
    a keyless yearly workbook (`nrc.uscg.mil/FOIAFiles/CY05.xlsx`, 17,851,193 bytes). It held 32,001 calls in
    1995, 32,854 in 2005 and 26,915 in 2015, each with a responsible company and the deaths, injuries and
    evacuations.
  - **Calls with a death, an injury or an evacuation:** 924, 757 and 656. By the shared party rule they give
    70, 110 and 121 company days, 60, 81 and 83 on pages (Union Pacific 21 and CSX 14 in 2005).
  - **Most are one injured driver or a trespasser struck by a train,** and the railroads lead, whose accidents
    the FRA's reports carry at your floor.
  - **With a death or 50 evacuated,** the railroads left to the FRA, 16, 13 and 9 reach pages a year. Pfizer's
    ammonia release at Holland, Michigan (2005, 50 evacuated) and Alcoa's chlorine release at Riverdale, Iowa
    (80) are among them.
  - **Why cut:** the site says its spreadsheets "contain INITIAL incident data that has not been validated or
    investigated by a federal/state response agency", and the company is the caller's word. A small,
    unvalidated follow-on, labelled as such, if wanted.
- **The Board's Federal Register notices of applications (measured; #2's call (b)).** 4,544 notices,
  1994–2026, read like batches 166–167's. In 14 sampled, 4 of 31 applications were the company's and 2 were
  namesakes by city. They give the filing day, where the H.2 gives the decision.
- **The Federal Register before 1994 (measured; cut on size).** govinfo holds the digitized issues as
  whole-issue scans. FR-1985-06-03 is 138 pages, ingested 2017-08-24: one PDF of 21,876,006 bytes, with no
  documents within it. That is about 5 GB a year, so the merger grants of 1978–1993, the ITC's investigations
  before 1995 or the Board's notices before 1994 would each mean reading every issue.
- **The NRC's event notification reports (seen, not measured).** The daily pages since 1999 answer, after one
  redirect. A power reactor event names its plant ("Columbia Generating Station"), not its licensee, so it
  would need a plant map with each owner's days (the pattern of the FRA's railroads and MSHA's controllers) and
  about 10,000 daily pages once. A follow-on for the utilities' pages, if wanted.
- **Not reachable from here:**
  - the Defense Department's daily contract announcements: www.defense.gov answered 403 (AkamaiGHost) to its
    robots.txt;
  - DOE's electric disturbance reports (OE-417): www.oe.netl.doe.gov failed through the proxy (502);
  - the BLS's major work stoppages: www.bls.gov answered 403 to a request with no contact, as the coverage
    map says it does. The ingest host has one. Not measured.
- **The H.2 before late 1996, and the Federal Reserve Bulletin's orders before the Board's yearly pages (not
  tried).** FRASER was not asked.
- **The 2026-11-22 cut list, not revisited, nothing having changed:** the FDA's complete response letters,
  Commerce's anti-dumping and countervailing-duty petitions, the ITC's 337Info, the FDA's advisory committees,
  the Supreme Court's decisions, the FDIC's orders, NTSB accidents, BOEM's lease data and the Federal Register's
  own text pages. The European Commission's cases, cut as unmeasured on 2026-11-11, are #3.
- **Not retried, nothing having changed:** the FTC's site, FSIS, PHMSA, FERC, GAO, the NTSB's Access files,
  OFAC, TARP, USAspending, the FDIC's failed-bank list, the CPSC's civil penalties, the FCC, www.dol.gov, BIS
  and the FAA.
- **Owner decisions and tracked waits, not raised:** listed in the header.
- **Re-prioritisations:** none proposed.
- **Anything touching another product:** nothing here reads, references or connects to another product's
  repository.

*One closing note, not a proposal* — noticed in passing. In `lib/fdaApprovals.ts:125` J&J's approvals' name
`/^Ortho\b(?!\s+Clinical)/i` lets the hyphenated "Ortho-Clinical Diagnostics" through, because the lookahead
wants a space. `approvalIsCompany` therefore gives JNJ Ortho-Clinical's 510(k) clearances after J&J sold it in
2014. The FDA's warning letters (batch 140) read the same rule. The `code-auditor` may want it.
