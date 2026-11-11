# Opportunity proposals — 2026-11-11

**Commit:** 3f06e911e687edfc216e0986e6b3197f4c0d7359 (`claude/lucid-goodall-6km6ea`, equal to `origin/main` after batch 137) · **Reviewed:** `CLAUDE.md`; `README.md` (the mine-accidents section, "Data sources", "Sources evaluated and rejected"); `docs/COVERAGE-MAP.md`; `docs/decisions/2026-09-28-business-decisions.md`; `docs/OWNER-ACTIONS.md` (searched, the licensing table); `docs/MASTER-CHECKLIST.md` (Scope & independence, the batch 131–137 ledgers, the head of Scope refocus and its items filed by batches 120–132, every open box, the legend); `docs/proposals/2026-11-09b-proposals.md` whole, and the "Considered and cut" section of every other proposal file; `docs/audits/2026-11-10-code-audit-b131-136.md`, its findings, set-asides and "Checked and found sound"; code: `lib/mineAccidents.ts` (header, `MINE_CONTROLLERS`, `fatalAccidents`), `lib/epaCases.ts` (`readCases`, the settlements table's columns, `epaEvents`' row ids), `lib/investigations.ts` (header: the owner's call on an investigation's closing), `lib/fdaApprovals.ts` (licence, `approvalIsCompany`), `lib/fdaRecalls.ts` (`FDA_FIRMS`), `lib/secCases.ts` (`captionParty`, `LEGAL_WORD`), `lib/cpscRecalls.ts` (Amazon's unit), `lib/zip.ts`, `lib/xlsx.ts`; `scripts/check-fda-approvals.ts` (how it builds a company's names offline) · **Proposals:** 3

> - **No rejection log exists** (`docs/audits/rejected-proposals.md`), and nothing has been
>   rejected. Every proposal of 2026-11-09b is approved and built (batches 132–136), and batch 137
>   fixed the four findings of the audit of batches 131–136. Nothing carries forward and nothing was
>   deferred.
> - **Owner calls already open, not raised again:** DuPont's past on DD; Alcoa's past on AA; the deaths
>   only a railroad's Form 54 gives (batch 130); "Drugs whose holder changed"; JCI's 2016 case on
>   Tyco's record; GE Capital Retail Bank on GE; PayPal's 2015 CFPB action on eBay; the Digest's
>   first-price floor and older names; widening `MANY_PARTIES`.
> - **Waits on `NEWS_CHARTS_CONTACT`, not proposals:** batch 123's six NHTSA makers, batch 126's four
>   CPSC brands, batch 127's two railroads, Southern Natural Gas, the Digest walk, batch 133's four
>   records kept for a filing's text (RGC Resources, B2Gold, Sunoco, Biogen), Novartis Nutrition's
>   sale day. **Other tracked items, not raised:** Arcosa's Yahoo chart from 2026-07-17; Knife River's
>   MSHA entry (none needed until an accident); the tidy of six ledger entries already offered; every
>   owner item in `docs/OWNER-ACTIONS.md` and `docs/audits/nc-task-queue-2026-09-28.json`.
> - **The leads the recent batches left, each measured:**
>   - EPA defendants written as a company and its plant: 44 cases on 30 companies. Cut again; see the
>     end;
>   - MSHA beyond deaths: the penalties that follow a death are #1; permanent disabilities, the
>     non-fatal accident kinds and the penalties outside an accident are cut, with figures, at the end;
>   - the audit's four set-asides: none is a proposal; set-aside 2 (MSHA rewrites its files daily)
>     sets #1's reading cadence.
> - **What is new:** #1 joins two more files of MSHA's open-data page to the deaths already on pages.
>   #2 is a new source on a host the FDA's approvals already read. #3 reads a column and a table of
>   EPA's case file, which the monthly walk already downloads.
> - **Saved data used instead of the network:** EPA's case file of 2026-10-31 (`b95/dl`, 137,103
>   cases); MSHA's Accidents, Mines and controller files of 2026-11-09 and the audit's extracted copies
>   (`audit137/out/unz-*`); the audit's replay of the 224 fatal-accident rows on pages
>   (`audit137/out/msha_events.json`); batch 134's first trading days for the mine pages
>   (`b134/out/first.json`) and the 2026-11-09 run's for every other page
>   (`scout125/out/first-merged.json`). Each was read as data, with `python3 -I`, or through the
>   repository's own functions (`readCaseFile`, `epaEvents`, `unitKeysOf`, `readZip`, `decodeText`,
>   `eachCsvRow`, `readSheet`, `approvalIsCompany`, `captionParty`, `companyNames`, `namesForYear`,
>   `MINE_CONTROLLERS`) from scripts in the session scratchpad (`scout138/probes/`).
> - **Measured live on 2026-11-11 from this container.** Every figure below is measured unless it says
>   it is an estimate. Requests, by host:
>   - arlweb.msha.gov 6: two definition files, a HEAD and a GET each of the Assessed Violations and
>     Inspections zips (#1);
>   - www.fda.gov 10: the warning-letter page, its data export (two pages, and its batch export, which
>     answered 302 into a session-held batch and was not followed), the listing's own four pages of
>     1,000 and one of 100, and the website policies (#2);
>   - www.msha.gov 3: the fatality-report listing (one 404 at its old address, two pages; cut);
>   - competition-cases.ec.europa.eu 5: the European Commission's case search, its app and its
>     configuration (cut);
>   - datadashboard.fda.gov 2: the Data Dashboard's compliance-actions page, through one 301 (#2's
>     older years);
>   - enforcedata.dol.gov 1 (301 to data.dol.gov), data.dol.gov 1, apiprod.dol.gov 1 (401 without a
>     key): OSHA (cut);
>   - www.phmsa.dot.gov 1 (403, as on 2026-11-08; cut).
>
>   That is 30 requests: 24 answered 200, and 6 did not (2 × 301, one each of 302, 401, 403 and 404).
>   Each carried the User-Agent `News Charts Research`, with no email address, and each began at least
>   1.3 s after the one before ended. No www.sec.gov, data.sec.gov or efts.sec.gov page was asked.
>   Postgres was not used and the app was not run. The log is in the session scratchpad
>   (`scout138/requests.log`).
> - **Nothing here needs a key, a paid tier or a recurring charge.** #1 reads two keyless files of a
>   source the owner approved on 2026-11-10, about 184 MB a month if read monthly. #2 reads a keyless
>   list on www.fda.gov, four requests a week; its licence is quoted below as read today. #3 reads data
>   already downloaded.
> - Ranked by importance, securities depth first:
>   1. MSHA's own finding on the deaths pages already hold: the violations its investigation cited and
>      the penalties it proposed;
>   2. the FDA's warning letters, 2021 on, a new source;
>   3. EPA's supplemental environmental projects on the settlement rows pages already hold.

Mark each proposal below: `APPROVED`, `REJECTED`, or `DEFERRED`, and add a
reason for anything rejected. Then run the scout in FILE mode.

---

## 1. MSHA's own finding on the deaths pages already hold: the violations its investigation cited and the penalties it proposed · proposed `P2` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — by the owner, 2026-11-11 ("On the death's row (Recommended)"): the finding on the accident's row, not a row of its own. Built in batch 139: MSHA's Inspections and Assessed Violations files streamed once a month (`eachZipLine`, `fetchMineFindings`), kept in db/048, and a sentence on each death's row after the operator's report; 168 rows on 45 pages, 114 before 2017, 316 violations, $11,586,940 proposed and $8,453,138.30 as assessed now, as measured.
**Owner's reason (if rejected):**

**Raised before:** as a line. The 2026-11-09b file's cut list: "MSHA beyond deaths: permanent
disabilities (2,491 reports) and assessed penalties were not measured; #2's floor is a death."

**What changed:** measured here. MSHA's open-data page serves, beside the Accidents file, an
Inspections file (every inspection and investigation, by MSHA's event number, with its activity) and an
Assessed Violations file (every citation MSHA assessed a penalty for, by the same event number). Joined
by that number, they give the outcome of MSHA's own investigation of each death a page holds.

**Anchor:** data collected and never surfaced, on rows pages already hold.
- Every MSHA row ends "The report is the operator's own filing, not a finding of fault." That is true
  of Form 7000-1, and it is all a row can say today.
- MSHA investigates every death and cites what it finds. No page says what it found, or whom it cited.

**What:** a sentence on each fatal-accident row. No new event, and no row's day, title or key changes.
- **The sentence:** "MSHA's investigation cited N violations (M against the operator, K against the
  contractor <name>), N of them unwarrantable-failure citations or orders under section 104(d), and
  proposed $X in penalties; $Y as assessed now."
- **The investigation:** an event of MSHA's fatal-accident investigation activity (code E06 since
  2005; AFA and the older code 30 before) opened at the accident's mine within 14 days of it. Its
  violations come from the Assessed Violations file by event number.
- **Nothing is said when nothing was assessed.** An absence is not a finding, and 13 such rows are of
  2025–2026, perhaps not yet assessed.
- **Room:** MSHA's account gives way, cut at a word and marked, as the CPSC's units text does since
  batch 137. Money stays numeric.
- **The owner's alternative:** a row of its own on the day MSHA proposed the penalty, a median of 307
  days after the death (10th percentile 167, 90th 535). I recommend the accident's row: the finding then
  reads beside the death it concerns.

**Licence:** no new source. MSHA's open data is source 38, approved on 2026-11-10 with the Labor
Department's terms quoted in `lib/mineAccidents.ts`: "Materials created by the federal government are
generally part of the public domain and may be used, reproduced and distributed without permission".
Both files are listed on the same page as the Accidents file (`OGIMSHA.asp`). No key.

**Grounded in:**
- **The files of 2026-11-10,** both last modified 13:16 GMT that day, as the Accidents file:
  - Inspections: a 73,878,745-byte zip, 349,369,870 bytes of text, about 1.16 million records since
    2000; 1,028 fatal-accident investigations under E06 and 201 under AFA;
  - Assessed Violations: a 109,785,492-byte zip, 1,335,417,514 bytes of text, 3,046,123 violations
    since 2000. Its violator's name is "the name of the Operator or Contractor at the time of the
    Assessment" (its definition file), so a contractor can be named as it was then, unlike the
    Accidents file's present names.
- **The rows:** the 224 fatal-accident rows on 51 pages from first prices, as the 2026-11-10 audit
  replayed batch 134 on the files of 2026-11-09.
  - 213 of the 224 have MSHA's investigation within 14 days. 11 do not: Alliance 5, Freeport-McMoRan
    2, Chevron, BHP, CNX's of 2007-04-05 and Vulcan's of 2020-10-14.
  - **168 rows on 45 pages, 114 before 2017, carry violations MSHA assessed under it.** That is 316
    violations, 241 against the operator and 75 against a contractor; on 25 rows only a contractor was
    cited.
  - 98 rows carry a special assessment, and 49 a 104(d) citation or order.
  - Proposed: $11,586,940.00; $8,453,138.30 as assessed now. 106 rows were reduced and one raised.
    Before 2017: $8,239,348.00 proposed, $5,911,821.50 now.

  | Page | Rows gaining MSHA's finding |
  | --- | --- |
  | CNX (old CONSOL Energy), Alliance Resource, Martin Marietta | 19, 17, 16 |
  | Vulcan, Newmont, Barrick, CRH | 13, 10, 9, 9 |
  | Freeport-McMoRan, Cemex, Alpha Metallurgical | 8, 7, 4 |
  | 35 more | 56 |

- **For example,** each read on its records:
  - Barrick's Goldstrike, 2010-08-12, 2 killed: five 104(d)(1) citations and orders against Barrick
    Goldstrike Mines Inc, all specially assessed, $447,600, unchanged;
  - CONSOL's McElroy, 2003-01-22, 3 killed in the shaft explosion: three violations, all against the
    contractor Central Cambria Drilling Co, two of them 104(d)(1) and specially assessed, $110,060;
  - Hecla's Lucky Friday, 2011-04-15: one 104(d)(1) citation against Hecla Limited, specially assessed
    at $159,100, $180,000 as assessed now;
  - Newmont in Eureka County, 2011-10-28: five, $350,000 proposed, $280,000 now; Vulcan in Jackson
    County, Georgia, 2022-06-17: six, $281,456 proposed, $105,764 now.

**Who benefits and how:** Readers of 45 mining, materials and utility pages. 168 deaths gain the
regulator's finding beside the operator's report: whether MSHA cited the company or a contractor, how
gravely (an unwarrantable failure, a special assessment), and at what penalty. 114 of them fall before
2017, where these pages hold little but filings.

**Risk:**
- **A proposed penalty is not a final one.** A contested case goes to the Federal Mine Safety and
  Health Review Commission. The row says "proposed" and "as assessed now", and the second figure can
  rise as well as fall.
- **Size.** 1.34 GB of text cannot be decoded whole the way `lib/zip.ts` reads an entry; the Accidents
  file's 229 MB took 943 MB (batch 134). The walk needs a streaming inflate that keeps only the lines
  whose first field is a wanted event number (every record begins with it), as `fatalRecordsOf` cuts
  by degree of injury.
- **MSHA rewrites its files daily** (the audit's set-aside 2). Read monthly, the two files cost about
  184 MB a month; the Accidents file stays weekly.
- **The match is by mine and a 14-day window,** not by a document number the files share. No
  investigation matched two rows. One row, Kinross's two dead at Bald Mountain on 2026-09-03, has an
  investigation for each.

**Cost:** none beyond the download: two keyless files, about 184 MB a month if read monthly.
**Effort:** medium:
- the streaming read and a db table of the kept investigations and violations;
- the sentence, and the account's cut;
- a committed slice (the investigations and violations for the 224 rows), and `check:mine-accidents`
  cases;
- the coverage map's and README's lines.

**How to check:** new `check:mine-accidents` cases on the slice:
- Goldstrike's row of 2010-08-12 names five 104(d) citations and orders and $447,600;
- McElroy's of 2003-01-22 names the contractor Central Cambria Drilling Co, $110,060, and no operator
  violation;
- Lucky Friday's of 2011-04-15 says $159,100 proposed and $180,000 as assessed now;
- a row whose investigation assessed nothing gains no sentence;
- a violation of another event at the same mine that week is not counted.

On main they fail: neither file is read.

**Depends on:** nothing.

**Buildable by:** a cloud session; arlweb.msha.gov answered all 6 requests from here.

*Importance:* medium — the regulator's finding on 168 deaths on 45 pages, 114 before 2017 ·
*Efficiency:* medium-high — the source, its licence and its map are built; two files join by MSHA's own
event number · *Practicality:* medium — measured; 1.34 GB of text needs a streaming read

---

## 2. The FDA's warning letters, 2021 on, a new source: Lilly, Abbott, Medtronic, Philips, Dexcom, Baxter, Walmart, AstraZeneca… · proposed `P2` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — by the owner, 2026-11-11 ("Approve (Recommended)"). To be built in batch 140.
**Owner's reason (if rejected):**

**Raised before:** no. No earlier file names the FDA's warning letters.

**Anchor:** a capability asymmetry inside one regulator.
- The FDA's recalls (2012 on, for the 73 companies `FDA_FIRMS` maps), its new-drug approvals and its
  efficacy supplements are on pages.
- Its warning letters are on none. A warning letter is the agency's own letter to a company setting out
  what it found, often after an inspection, and the FDA publishes each on a page of its own.

**What:** an adapter, `lib/fdaWarningLetters.ts`.
- **The read:** the FDA's warning-letter list
  (`www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/compliance-actions-and-activities/warning-letters`)
  through the data export the page links ("Data export", xlsx, 1,000 letters a page, read with
  `lib/xlsx.ts`), once a week.
- **The rule:** a letter is the company's when its addressee is the company by the rule the FDA's
  approvals use (`approvalIsCompany`: the caption rule under the year's names, `FDA_FIRMS`,
  `APPLICANT_NAMES`, the table of taken names), on the letter's issue day, from the first price; plus a
  short hand list for the names that rule cannot read (below).
- **The row:** on the issue day. "FDA warning letter: CGMP/QSR/Medical Devices/Adulterated", with the
  addressee as written, the issuing office, the day the FDA posted it and, where posted, the day of
  its close-out letter; linked to the letter's own page. A company's letters of one day are one row
  (Lilly's three of 2025-09-09).

**Licence:** a new source on a host already read. The FDA's website policies
(www.fda.gov/about-fda/about-website/website-policies, read 2026-11-11): "Unless otherwise noted, the
contents of the FDA website (www.fda.gov) — both text and graphics — are not copyrighted. They are in
the public domain and may be republished, reprinted and otherwise used freely by anyone without the need
to obtain permission from FDA. Credit to the U.S. Food and Drug Administration as the source is
appreciated but not required." The same words `lib/fdaApprovals.ts` quotes from 2026-11-06. No key and
no paid tier.

**Grounded in:**
- **The list on 2026-11-11:** 3,807 rows, 3,795 distinct letters, issued from 2021-01-04 to
  2026-11-03 (689 of 2021, 691 of 2022, 608, 569, 737 and 513 of 2026). Read through the listing's own
  pages, four of 1,000; the data export gave 1,000 a page (two pages read).
- **The replay:** every listed company by `approvalIsCompany`: **78 letters on 75 company days, on 56
  pages.** None is before 2017.
  - **25 of the pages are in the FDA's recall map:** Lilly 3, Abbott 3 (Abbott Point of Care Canada,
    Abbott Laboratories, Abbott Diabetes Care), Medline 3, Fresenius Kabi 3, Johnson & Johnson 2
    (Abiomed 2023-09-19, Janssen Vaccines 2025-07-18), Sanofi 2 (one to Genzyme Ireland), BD 2
    (CareFusion), Baxter 2, Fresenius Medical Care 2; one each to Medtronic (2021-12-09), Philips
    (2024-02-23), Dexcom (2025-03-04), Danaher's Beckman Coulter (2024-03-15), Viatris, Cardinal
    Health, Smucker and PepsiCo, among others.
  - **31 are outside it, with 39 letters:** Walmart 5, Novo Nordisk 2, Dollar Tree 2, Turning Point
    Brands 2; one each to AstraZeneca, Amgen, CVS, Elanco, Chewy, Jabil and Neogen, among others; and
    Target, Kroger and Albertsons, whose letters of 2025-12-12 are headed "Infant Botulism Outbreak",
    as Walmart's that day is.
  - **About 12 more for a hand list, read by hand, an estimate:** Amazon.com, Inc. 9 (AMZN's names read
    "AMAZON COM" and "Amazon", so the caption rule refuses "Amazon.com, Inc."; the CPSC's `UNITS` hold
    an entry for its own spelling), Colgate-Palmolive/Tom's of Maine, Procter & Gamble's Mexican unit
    and Labcorp's Toxikon.
  - The rule refuses the namesakes read: "Kraft Drug" is not Kraft Heinz, and "Cooper Institute" is not
    CooperCompanies (CooperSurgical's letter of 2021-02-12 is, by `FDA_FIRMS`).
- **Older letters are not on the list.** The FDA's Data Dashboard publishes its compliance actions
  (warning letters, seizures and injunctions), but its API needs credentials from the FDA's OII Unified
  Logon, a registration (its page, read here). How far back it reaches was not read. It is the owner's
  to request, if wanted, and not part of this proposal.

**Who benefits and how:** Readers of 56 drug, device, food and retail pages, who see the FDA's own
letter on its day, linked. 31 of these pages are outside the recall map, Walmart, Target, Kroger,
AstraZeneca, Amgen and Novo Nordisk among them.

**Risk:**
- **Recent only.** The list begins in 2021, where GDELT's news is already dense; the gain is the
  regulator's own document, not depth before 2017.
- **The export's pages overlap unless ordered:** two unordered pages of 1,000 shared 192 company-and-day pairs. The
  build orders them, and checks the count against the listing's total.
- **Posted after it was issued.** The issue day is the letter's own; the posting day, when the public
  could read it, is said in the row.
- **Shared addressees:** Bausch & Lomb Inc.'s letter of 2026-09-04 lands on both Bausch + Lomb (BLCO)
  and Bausch Health (BHC) by the names; `ONE_GROUP` in `lib/sharedNames.ts`, or an entry, decides. Joint
  addressees ("Becton, Dickinson, and Company/CareFusion 303, Inc.") land on each company they name.
- **A page, not a dataset:** its export's shape can change. `check:feeds` should watch it.

**Cost:** none; about four requests a week.
**Effort:** small-medium:
- an adapter on the approvals rule, its row in `SOURCES` (source 39) and the hand list;
- titles, a committed slice of the list, and `check:fda-warning-letters` in the check chain;
- the coverage map's and README's lines.

**How to check:** `check:fda-warning-letters` on the slice:
- Dexcom's letter of 2025-03-04 lands on DXCM, linked to its own page;
- Abiomed's of 2023-09-19 lands on JNJ (`FDA_FIRMS`: Abiomed from 2022-12-22);
- Lilly's three of 2025-09-09 are one row;
- "Kraft Drug" lands on no page of Kraft Heinz, and "Cooper Institute" on none of CooperCompanies;
- Amazon.com, Inc.'s of 2022-08-04 lands on AMZN by the hand list.

On main they fail: no reader exists.

**Depends on:** the owner's approval of a new source.

**Buildable by:** a cloud session; www.fda.gov answered from here.

*Importance:* medium-low — 78 letters (about 90 with the hand list) on 56 pages, none before 2017 ·
*Efficiency:* medium — a new reader on a rule already built · *Practicality:* medium-high — measured,
licence quoted, no key

---

## 3. EPA's supplemental environmental projects on the settlement rows pages already hold · proposed `P2` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — by the owner, 2026-11-11 ("Approve (Recommended)"). To be built in batch 141.
**Owner's reason (if rejected):**

**Raised before:** no. Batch 129 read the settlements table's cost recovery (the 2026-11-09 proposal
4). Its supplemental-project column and the projects table were not raised.

**Anchor:** data collected and never surfaced.
- EPA's case file, read whole once a month, holds each settlement's `SEP_AMT` in
  `CASE_ENFORCEMENT_CONCLUSIONS.csv`, a table `readCases` already reads for five other columns, and EPA's
  description of each project in `CASE_ENFORCEMENT_CONCLUSION_SEP.csv` (1,992,086 bytes), which it does
  not read.
- A supplemental environmental project is work a defendant agrees to fund as part of a settlement,
  beside the penalty. Toyota's consent decree of 2003-03-07 reads "$500,000 civil penalty" on its page;
  EPA's record adds "Toyota will spend $20 million to retrofit school buses and other heavy duty
  diesels."

**What:** on a settlement's row, after the penalty and the work ordered, "supplemental environmental
projects $X, EPA's figure", and EPA's text of the project as written, cut at a word.
- Each settlement's figure on the row of its own day, by the rule batch 129's cost recovery follows:
  "among N parties" on a settlement of several, nothing on a suit-filed row.
- No new event, and no row's day, title or key changes.

**Licence:** no new source. EPA's case file was approved on 2026-11-05, with EPA's terms quoted in
`lib/epaCases.ts`.

**Grounded in:**
- **EPA's file of 2026-10-31:** 2,914 settlements carry a project amount, on 2,904 cases; 3,704 cases
  carry a project's text.
- **The replay:** every listed company through `epaEvents` with today's code, each amount on the row of
  its own settlement's day, a suit-filed row none:
  - before first prices, 230 rows on 111 companies, 187 before 2017, $209,133,056.96;
  - **from first prices where read, 168 rows on 70 pages, 142 before 2017, $181,844,220.07,** a median
    of $124,625. 161 of the 168 carry EPA's text, and only 3 show no money today: the figure adds to a
    penalty already shown.

  | Page | Rows gaining a project |
  | --- | --- |
  | BP, Chevron | 13, 12 |
  | ExxonMobil, Valero, Eastman Chemical | 8, 8, 7 |
  | Tyson, Shell, ConocoPhillips, Westlake | 6, 5, 5, 5 |
  | 61 more | 99 |

- **For example,** each read on its records:
  - Toyota, 2003-03-07 (HQ-1999-1049): $20,000,000, the school-bus retrofits above;
  - Shell, through Motiva, 2005-09-20 (03-2001-0334): $6,385,000, among them hybrid buses for the
    Delaware Transit Corporation, a conservation easement and shellfish restoration in the Delaware
    River;
  - BP's Texas City refinery, 2009-02-19 (06-2006-3402): $6,000,000, to "retrofit 100 City of Texas
    City vehicles with LNG";
  - Chevron, 2018-10-24: $9,495,909.08, emergency-response equipment for the communities around its
    California refineries;
  - PSEG, 2002-05-31 (02-2001-0020): $6,000,000, on that settlement's row only, not on the case's
    later settlement of 2006-11-30 or its suit of 2002-01-24.

**Who benefits and how:** Readers of 70 energy, chemical, food and utility pages, who see what a
settlement committed the company to spend besides its penalty, in EPA's words. 142 of the rows are
before 2017.

**Risk:**
- **EPA's record is not complete.** An amount is said where EPA recorded one; a project EPA did not
  record stays unsaid, and a row never says "no project".
- **A settlement of several parties** gives one figure, as its penalty does now. Its text may name
  another party: Ameren's row of 2005-03-07, Illinois Power's case, carries text that begins "DMG has
  committed", Dynegy Midwest Generation's. "Among N parties" is said where EPA's record names several.
- **The text is EPA's,** in capitals and with its typing, quoted as EPA's.

**Cost:** none; a column and a 2 MB table of the zip already read every month.
**Effort:** small:
- `readCases` reads the column and the table, and db stores the figure and the text with the row's
  others;
- the description;
- the slice gains the projects table's rows for its cases, and `check:epa-cases` re-pins its totals.

**How to check:** new `check:epa-cases` cases on the slice:
- Toyota's row of 2003-03-07 names $20,000,000 and the retrofit, and its suit row of 1999-07-12 names
  none;
- PSEG's case 02-2001-0020 gives its $6,000,000 to the row of 2002-05-31 alone;
- a case with no project amount says nothing of one.

On main they fail: neither the column nor the table is read.

**Depends on:** nothing.

**Buildable by:** a cloud session; the saved file is enough.

*Importance:* low-medium — no new event; $181.8 million of settlement terms on 168 rows on 70 pages,
142 before 2017 · *Efficiency:* high — data already downloaded · *Practicality:* high — measured on the
saved file

---

## Considered and cut

- **EPA defendants written as a company and its plant (measured again, cut again).** The lead the
  2026-11-09b file called "a follow-on to #3, not a proposal". What changed: #3 (batch 135) is built,
  and Kroger's pharmacy has its days (batch 137). Re-run with today's `UNITS`, requiring a space or
  comma before the legal word (the last run's "ARM" + "CO" took ARMCO's 8 cases):
  - **44 cases on 30 companies, 38 before 2017,** none on a page today: GE 5 ("GENERAL ELECTRIC CO -
    COLUMBIA", 1980s), Olin 4 (1977–1981), Chevron 3, CHS 3, AT&T 2, Ford 2, Sanmina 2, and one each
    to Pfizer's Groton site, Walmart's Sam's Club, Weyerhaeuser's Everett mill and 20 more;
  - **about 39 are the company's own,** by hand. The rest are AT&T Corp.'s before T's record took the
    name (2), National Steel's (no listed record), Knife River's of 2017 (before its listing) and
    Energy Transfer Corp.'s of 2019.
  - Too few for a rule shared by six sources. A line for the next EPA batch, if there is one.
- **MSHA beyond deaths, measured from first prices on the mapped controllers:**
  - **permanent disabilities:** 484 records, 483 accidents, on 46 pages, 316 before 2017, most of them
    handling of materials (205) and machinery (115). Below every floor the owner has set: FRA's is a
    death, an evacuation or $5,000,000 of damage, and NHTSA's 10,000 vehicles;
  - **the non-fatal kinds MSHA must be told of at once:** mine fires 444 accidents on 39 pages,
    entrapments 311 on 27, gas or dust ignitions 270 on 23, inundations 82 on 20, outbursts 38 on 12,
    impoundment failures 9 on 5, fewer than 16 of each with an injury. Read: a kiln's flame-out, a
    faulty ammonia sensor, a hydraulic tank's lid. Not material events;
  - **penalties outside an accident:** MSHA's assessment cases of $100,000 or more, 425 on 31 pages,
    285 before 2017, a median of 57 violations each. That is a quarter's bill at a large underground
    mine, not an event. Cases with a special assessment and $100,000 or more: 149 on 23 pages, 50 of
    them CNX's. Each case was given to a page by the mine's controller of the cited operator on the
    day, from MSHA's controller history. Not proposed; #1 takes the penalties that follow a death.
- **A link from each death to MSHA's own fatality report (not measured).** MSHA's listing
  (www.msha.gov/data-and-reports/fatality-reports/search) answers, but its pages reach back only to
  2019, give no mine ID, and older reports sit on arlweb's year pages (1995–2007 from one index). A
  follow-on to #1, if wanted.
- **OSHA's inspections (not measured).** The Labor Department's enforcement host now redirects to
  data.dol.gov, a script app, and its API answered 401 without a key: "The API key is either incorrect
  or missing from your query." A key is a registration for the owner; nothing was measured.
- **The European Commission's competition cases (not measured).** The case search
  (competition-cases.ec.europa.eu) answers, but its cases are served by the Commission's search service,
  called with a key from the page's own configuration. I did not call it. Its reuse terms were not
  read. Worth a measured note from an official bulk copy, if one exists.
- **The audit's set-asides, none a proposal:** a day's second CPSC statement past the cut (13 of 986
  statements, the existing length rule); MSHA's daily rewrite (it sets #1's monthly cadence);
  CenterPoint's two records overlapping by two days with no filing in them; Knife River (tracked).
- **Retried, and still refused:** PHMSA (403 "Access Denied", as on 2026-11-08).
- **Not retried, nothing having changed:** the FTC, the OCC and FSIS (unreachable on 2026-11-05 and
  2026-11-09); the FDIC's failed-bank list (no licence wording); FERC (403); the NRC (needs its
  script); the NTSB (an Access database; this container still has no reader for one).
- **Owner decisions and tracked waits, not raised:** listed in the header.
- **Re-prioritisations:** none proposed.
- **Anything touching another product:** nothing here reads, references or connects to another
  product's repository.

*One closing note, not a proposal* — noticed in passing. `captionParty` gives "Amazon.com, Inc." to no
page: AMZN's names are "AMAZON COM", "Amazon" and "AMAZON COM INC", and ".com" is no legal word (#2's
nine letters). The CPSC holds a unit entry for Amazon.com Services. Whether the SEC cases', the
Board's, the CFPB's, EPA's and the CFTC's rules miss Amazon.com, Inc. the same way I did not check; the
`code-auditor` may want to.
