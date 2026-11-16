# Opportunity proposals — 2026-11-15

**Commit:** 30ba57fea632922cd666c9001eacfcc951fed6ce (`claude/lucid-goodall-6km6ea`, equal to `origin/main` after batch 149) · **Reviewed:** `CLAUDE.md`; `README.md` ("Data sources", "Sources evaluated and rejected"); `docs/COVERAGE-MAP.md`; `docs/OWNER-ACTIONS.md` (§3 with the ruling on federal works, "Decisions I can't make for you"); `docs/MASTER-CHECKLIST.md` (Scope & independence, the batch 143–149 ledgers); `docs/proposals/2026-11-11b-proposals.md` whole, the "Considered and cut" section of every other proposal file since 2026-11-01, and the OCC note of `docs/proposals/2026-10-28-proposals.md`; `docs/audits/2026-11-15-code-audit-b143-149.md` (its summary and findings, which batch 150 is fixing); code: `lib/doj.ts` (`releaseNamesParty`, `plainText`), `lib/secCases.ts` (`captionParty`, `NOT_THE_COMPANY`), `lib/releaseNames.ts` (`BANK_UNITS`, `releaseNamesOn`), `lib/fedActions.ts` (`FED_BANKS`), `lib/fdaApprovals.ts` (`approvalIsCompany`), `lib/fdaWarningLetters.ts` (header), `lib/frCompany.ts`, `lib/ingest/frBackfill.ts` (`namesForYear`), `lib/sec.ts` (`newsNamesFor`), `lib/takenNames.ts` (`takenBefore`), `lib/ingest/store.ts` (the source ids) · **Proposals:** 2

> - **No rejection log exists** (`docs/audits/rejected-proposals.md`), and nothing has been rejected.
>   Both proposals of 2026-11-11b are approved and built (batch 144, the FDA's device recalls of 2000
>   to mid-2012; batch 145, a fifth round of units named after their owners). Nothing was deferred and
>   nothing carries forward.
> - **Settled, not raised again:** the owner's calls of 2026-11-12 decided by best judgment (batch 146:
>   DuPont's past on DD, Alcoa's on AA, Tyco's record took Johnson Controls' name, Arcosa waits, the
>   railroads' own death counts); every read that waited on the build contact (batches 148 and 149);
>   the ruling that a federal agency's own work is usable where its site states no licence, with the
>   non-commercial news feeds still withheld under `COMMERCIAL_MODE`.
> - **The audit of batches 143–149 and batch 150:** the audit's six findings (EPA's units for Hino,
>   Kelly-Springfield, Missouri Pacific, the Delaware & Hudson, Fisher-Price, Playskool and Milton
>   Bradley; RGC's duplicate quarterly reports; stale totals; a check that cannot fail; the contact
>   notes; doc drift) are batch 150's, in progress. None is raised here.
> - **Defaults still yours to change, not raised:** the Digest's first-price floor and its names older
>   than EDGAR's; widening `MANY_PARTIES`; "Drugs whose holder changed".
> - **The leads I was given, each measured:**
>   - **The EEOC's press releases**, reopened by the ruling: #1;
>   - **The FDIC's failed-bank list**, reopened by the ruling: measured and cut (the end). All four
>     deals sampled carry the acquirer's own 8-K naming the failed bank 4–6 days later.
> - **What is new:**
>   - #1 is the EEOC's newsroom, cut on 2026-11-11b on its licence alone;
>   - #2 is the OCC, the national banks' own regulator. It was unreachable from here on 2026-10-28,
>     2026-11-05 and 2026-11-09b. It answered today, and the search page's own API gives every action
>     in one request.
> - **Saved data used instead of the network:**
>   - the first trading days of 651 tickers (`scout125/out/first-merged.json`);
>   - the last scout's 134 EEOC titles and its saved disclaimer (`scout143/out`, `scout143/dl`);
>   - the committed fixtures: the Board's enforcement actions (`scripts/fixtures/fed-actions.json`).
>
>   Each was read as data, with `python3 -I` or through the repository's own functions:
>   `releaseNamesParty`, `plainText`, `dojPossessive`, `captionParty`, `companyNames`,
>   `namesForYear`, `newsNamesFor`, `releaseNamesOn`, `releaseNamesAsked`, `isNotesRecord`,
>   `takenBefore`. The probes are in the session scratchpad (`scout151/probes/`).
> - **Measured live on 2026-11-15 from this container.** Every figure below is measured unless it says
>   it is an estimate. Requests, by host:
>   - www.eeoc.gov 13: the sitemap index and its two pages, one test of a larger page size (refused
>     silently: 24 a page still), eight listing pages and one release page (#1);
>   - apps.occ.gov 4: the enforcement search page, its script, its API's count and the whole list of
>     institution actions (#2);
>   - occ.gov 3: the enforcement information page, the web privacy policy and the OTS archive
>     spreadsheet (#2);
>   - www.fdic.gov 1 and api.fdic.gov 2: the failed-bank list, and BankFind's failures, three records
>     and then all 4,117 (cut);
>   - efts.sec.gov 4: EDGAR's full-text search for four FDIC-assisted deals (cut);
>   - data.ntsb.gov 1: the aviation download page (cut).
>
>   That is 28 requests, every one answered 200. Each carried the User-Agent `News Charts Research`, with
>   no email address, and each began at least 1.3 s after the one before ended. No www.sec.gov or
>   data.sec.gov page was asked, so the contact helpers were not needed. Postgres was not used and the
>   app was not run. The log is in the session scratchpad (`scout151/requests.log`).
> - **Nothing here needs a key, a paid tier or a recurring charge.** #1 reads a federal newsroom with no
>   key: 318 listing pages once, then its newest page. #2 reads one keyless JSON answer of 2.2 MB a week
>   and one spreadsheet once.
> - Ranked by importance, securities depth first:
>   1. the EEOC's suits and settlements since 1996, on the company's page;
>   2. the OCC's enforcement actions against the company's national bank since 1989.

Mark each proposal below: `APPROVED`, `REJECTED`, or `DEFERRED`, and add a
reason for anything rejected. Then run the scout in FILE mode.

---

## 1. The EEOC's press releases since 1996, its suits and settlements against the company: Walmart, Dollar General, UPS, AT&T, Morgan Stanley, Dillard's, AutoZone, Lockheed Martin… · proposed `P1` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — by the owner, 2026-11-15 ("Approve both (Recommended)"), with the recommended call (a): an undated release the rule keeps has its own page read once for its day. Built in batch 152: the whole listing, 7,625 releases from 1994-06-22, read once a year and its newest page daily (db/052); the Justice rule, the Commission's own shapes and an `EEOC_UNITS` list of 18 companies, franchisees, bottlers, mediation pacts and nine namesakes left off. Before first prices 550 rows on 179 companies, 276 before 2017; from first prices where read, 324 on 81 pages, 165 before 2017, where this file estimated about 500, up to about 770. Only 70 releases are undated once the listing's excerpts are read, and the rule keeps 3.
**Owner's reason (if rejected):**

**Raised before:** yes. The 2026-11-11b file measured it and cut it on its licence alone: "neither its
disclaimer nor its privacy policy … states a licence". **What changed:** the owner's ruling of
2026-11-12 ("Allow federal works"). OWNER-ACTIONS §3 says it "reopens the EEOC's press releases …
for the next scout".

**Anchor:** a stated objective with no work behind it, and the 1963–2017 hole the coverage map calls
"the single biggest hole in the corpus". The EEOC announces each suit it files and each settlement it
reaches, from 1996, against employers of every sector. No source the pages read covers employment
cases: the Justice Department brings few, and the EEOC's own suits are not in the Department's
releases.

**What:** an adapter, `lib/eeoc.ts`, and a walk, `lib/ingest/eeocWalk.ts`, with a new source key (41,
`eeoc_press`) so the Sources panel names the Commission:
- **The read:** the newsroom's listing (`/newsroom/search`), 24 releases a page, 318 pages read once
  and kept, then its newest page once a day. That is about seven minutes at 1.3 s apart, once.
- **The rule:** the Justice Department's title rule (`releaseNamesParty`) under the company's names of
  the release's year and the release map's units, as the CFTC's actions are read, plus the EEOC's own
  shapes the rule misses today ("Final Decree Entered With X", "EEOC Settles … Suit … Against X",
  "Verdict For EEOC Against X Affirmed"), each with a guard of its own. One release a day per company,
  from the company's first price.
- **The day:** the listing's published date. Where the listing gives none, or two copies give two
  days, the release's own text decides: "PRESS RELEASE 2-21-02". Each such release the rule keeps is
  read once for that line, a few hundred a run.
- **The row:** the title as the Commission wrote it, its first paragraph, the day, linked to the
  release. It says the EEOC's charge is an allegation until a court or a decree resolves it.

**Licence:** a new source. Its disclaimer, read 2026-11-11 and re-read today from the saved copy:
"Reference herein to any specific commercial products, process, or service by trade name, trademark,
manufacturer, or otherwise, does not constitute or imply its endorsement, recommendation, or favoring
by the United States Government. The views and opinions of authors expressed herein do not necessarily
state or reflect those of the United States Government, and shall not be used for advertising or
product endorsement purposes." It states no licence, so the owner's ruling applies: the releases are
the Commission's own work (17 U.S.C. § 105). The rows cite the EEOC and imply no endorsement. No key.

**Grounded in:**
- **The listing:** "Displaying 1 - 24 of 7622 results". Its form filters by year (1994–2026), month,
  type and keywords, but takes no page size. The sitemap lists 7,625 newsroom addresses.
- **The sample:** 326 titles from 14 pages spread across the list (0, 80, 100 … 280, 300, 317), the
  last scout's 134 and 192 read today. Read with the repository's rule, under each company's names of
  the release's year:
  - **24 matches; 20 hold** once two second copies (the Wal-Mart TV-ad release's and Salomon Smith
    Barney's), Cushman & Wakefield's suit of 2016 (before its first price of 2018) and a mediation
    agreement are taken out. 15 of the 20 fall before 2017;
  - **13 more on listed pages are missed,** read by hand:
    - four by the title's shape or form: Optical Cable's $1,000,000 settlement of 2002, "Verdict For
      EEOC Against Autozone Affirmed" (2011-03-18), Instacart's joint settlement and "Horseshoe Casino
      and Caesars Entertainment Companies to Pay $150,000", both of 2026;
    - six by a unit: Darden's Bahama Breeze ($1.26 million, 2009-12-14), Lockheed Martin Global
      Telecommunications ($773,000, 2008-04-07), Xerox State Healthcare (2016), Mesaba Airlines
      (Delta's, 2009), Smithfield Fresh Meats and Oncor;
    - one by its name: Hertz (2018);
    - two by former names, which ingest reads from EDGAR and this offline replay does not: Aaron Rents
      (2009) and Woodward Governor (2003).
  - **one is on no page:** "FINAL DECREE ENTERED WITH WALGREENS FOR $24 MILLION" (2008-03-25).
    Walgreens Boots Alliance is no longer in the company index.
- **The estimate, from the sample:** at the rule's rate, about 470 releases on pages offline, about
  500 with the former names ingest reads; with the EEOC's shapes and a units list, up to about 770.
  About three quarters fall before 2017. A sample of 326 could be off by a third either way, and I say
  so.
- **The concentration, from the sitemap's addresses** (one address a release, its title's words, twins
  taken out): Walmart 72, Dollar General 25, UPS 24, AT&T 18, FedEx 13, Chipotle 11, Ford 10,
  Abercrombie & Fitch 10, BNSF 9, Lockheed Martin 8, Cracker Barrel 7. These count every release that
  names the company, policy releases and franchisees' cases among them, so they are upper bounds.
- **The years:** page 120 is August 2016 and page 260 July–November 2001. From about page 270 on, most
  items carry no date in the listing: 53 of the 62 sampled on pages 280, 300 and 317. That is about
  900 to 1,400 releases, most of 1996–2006, by my reading of the titles. The one release page read
  gives its day in its text: "PRESS RELEASE 2-21-02 ROANOKE, Va."
- **For example,** each read today:
  - Morgan Stanley, 2001-09-10: "EEOC FILES SEX DISCRIMINATION LAWSUIT AGAINST MORGAN STANLEY";
  - Citigroup, 2001-07-16: "EEOC SETTLES SUIT AGAINST SALOMON SMITH BARNEY FOR RACE AND NATIONAL ORIGIN
    BIAS", through the release map's Salomon Smith Barney;
  - Walmart, 2001-09-20: "WAL-MART AGREES TO AIR TV AD AND PAY $427,500 AFTER COURT FINDS RETAILER IN
    CONTEMPT OF COURT" (a twin of it is dated 2001-06-13);
  - Dillard's, 2008-04-01, a class sexual-harassment settlement of half a million dollars;
  - Allstate, 2009-12-17: "Court Approves Distribution of $4.5 Million Settlement in EEOC Age Bias Suit";
  - Whirlpool, 2009-12-29: "Whirlpool Corp. To Pay Over $1 Million …";
  - AT&T, 2012-03-29 and 2013-08-30; AutoZone, 2012-03-28 and 2012-03-30;
  - Optical Cable, 2002-02-21, undated in the listing: "a high-tech employer and publicly held
    company", in the release's own words;
  - Lockheed Martin, 2026-11-04: "Lockheed Martin Agrees to Pay $29.5 Million to Resolve Alleged
    Employment Discrimination Violations".

**Who benefits and how:** readers of retail, restaurant, transport, bank, telecom and manufacturing
pages. They get the federal employment regulator's suits and settlements on their days: Walmart's
dozens, Morgan Stanley's sex-discrimination suit of 2001, Dillard's and AutoZone's cases, the
railroads' and parcel carriers' disability cases. About three quarters fall before 2017, where most
of these pages hold only filings. Most settlements are small beside the company. They are the
regulator's own record of what it charged and what was paid, as EPA's orders without a penalty are.

**Risk:**
- **The undated block.** About 900 to 1,400 old releases have no date in the listing (an estimate from
  the pages read). Each one the rule keeps needs its page read once for the day its text gives. The
  call below is yours.
- **Twins.** 1,144 of the sitemap's 7,625 addresses end in "-0", "-1" or another digit beside an
  address with the same title. Some are real (a monthly digest); others are one release posted
  twice, with two days (the Wal-Mart TV ad, 2001-06-13 and 2001-09-20). A title and company kept
  once, with the text's day, is the build's rule. 68 addresses are Spanish versions, left out.
- **Franchisees and bottlers.** The sitemap holds "IHOP franchisee", "Applebee's franchisee", "Owner of
  Brandon Denny's" and "Little Caesars franchise". "McDONALD'S FRANCHISE TO PAY $505,000" (2008-04-07)
  is a franchisee's case, and the rule refused it in the sample. "Coca-Cola Bottling Company United" and
  "Coca-Cola Beverages Northeast" are not Coca-Cola's. Each needs a guard or a `NOT_THE_COMPANY`
  entry, read by hand.
- **Units need a hand list,** as #2 of 2026-11-11b did for other sources: six were met in 326 titles.
- **A page, not a dataset:** its markup can change. `check:feeds` should watch it.

**One call inside it, for the owner:**
- **The undated releases:** (a) read each kept release's own page once for its day (recommended), or
  (b) leave undated releases off. That would lose most of 1996–2006, Optical Cable's among them.

**Cost:** none. 318 listing pages once, then one a day, and each kept release's page once.
**Effort:** medium:
- the walk and its table (a db migration, 052), the newest page daily;
- the rule: the title rule, the EEOC's shapes and their guards, the day from the text, twins, the
  franchisee guard;
- a units list read by hand; the rows; a committed slice and `check:eeoc`;
- the coverage map's, README's and the Sources panel's lines.

**How to check:** a new `check:eeoc` on a committed slice of the listing and a few release pages:
- Morgan Stanley's suit of 2001-09-10 lands on MS, and Salomon Smith Barney's settlement of 2001-07-16
  on C;
- Optical Cable's undated release lands on OCC on 2002-02-21, the day its text gives;
- the two copies of the Wal-Mart TV-ad release are one row on WMT;
- "Verdict For EEOC Against Autozone Affirmed" of 2011-03-18 lands on AZO by the EEOC's own shape;
- Cushman & Wakefield's suit of 2016-08-08 stays off CWK, before its first price;
- "McDONALD'S FRANCHISE TO PAY $505,000" stays off MCD, and "Coca-Cola Bottling Company United" off KO;
- the CenterPoint Energy mediation agreement makes no row.

On main they fail: the source does not exist.

**Depends on:** the owner's approval of a new source. Its licence is settled by the ruling of
2026-11-12.

**Buildable by:** a cloud session. www.eeoc.gov answered every request from here.

*Importance:* high — about 500 suits and settlements, up to about 770, on many retail, transport and
bank pages, about three quarters before 2017 (estimates from 326 titles) · *Efficiency:* medium — the
title rule exists; the walk, the day from the text and the guards are new · *Practicality:* medium —
sampled, not counted whole; the undated block needs a page read each

---

## 2. The OCC's enforcement actions against the company's national bank since 1989: JPMorgan Chase Bank's $300,000,000 and $350,000,000 penalties, HSBC Bank USA's $500,000,000, Bank of America's $1.13 billion restitution, Citibank's $400,000,000… · proposed `P1` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — by the owner, 2026-11-15 ("Approve both (Recommended)"), with the recommended call: an order's termination as a line on its row. Part (a) built in batch 153: the API's 2,655 institution actions read once a process, the caption rule, the release map and `OCC_BANKS`, 39 companies' banks by charter, four namesakes refused by charter. Before first prices 185 company days on 50 companies; from first prices 180 on 49 pages, 126 before 2017, where this file estimated about 150 on 39. No "Valley National Bank" of the list is Valley National Bancorp's, so its 4 are not. Part (b), the OTS archive, built in batch 154: its 1,497 institution orders read once and committed, 105 the OCC's list carries on left to its rows, 119 terminations made lines on their orders; 12 company days on 11 pages the archive's alone, against the scout's 9 genuine of 14, with AIG, GE, TFS Financial, Ocwen (Onity), Washington Federal, Carver's and First Bancshares' banks by charter, and two holding-company namesakes refused by docket.
**Owner's reason (if rejected):**

**Raised before:** as unreachable, never measured:
- 2026-10-28: "apps.occ.gov answered both requests with a 'Security Redirect'";
- 2026-11-05 and 2026-11-09b: "its search redirects to the home page";
- not retried since.

**What changed:** the search answered today. Its own script calls an API, `/EASearch/api/WebSearch/
Actions`, which gave every institution action in one keyless answer.

**Anchor:** capability asymmetry. Bank pages carry the Federal Reserve Board's actions against the
holding company (63 banks, `lib/fedActions.ts`) and the CFPB's from 2012. The national bank itself,
JPMorgan Chase Bank, N.A. or Wells Fargo Bank, N.A., answers to the OCC, whose orders are on no page.
The OCC's page says it: the Board covers "bank holding companies and their nonbank subsidiaries", and
the OCC "national banks and their subsidiaries".

**What:** an adapter, `lib/occActions.ts`, with a new source key (42, `occ_actions`):
- **The read:** the API's institution actions (`instOnly=true`; an action against a person is never
  read), the whole list, once a week. 2,655 actions, 2,202,663 bytes.
- **The rule:** the caption rule on the bank's name under the company's names that day, with the
  release map's banks, as the CFPB's actions are read. Added to `BANK_UNITS`, each read by hand with
  its days from a filing: the national banks the map lacks (below). Namesakes go in `NOT_THE_COMPANY`.
  The table of taken names applies, and so does the company's first price.
- **The row:** one a company a day (JPMorgan's actions of 2013-09-18 are one). It gives the
  OCC's kind ("civil money penalty", "cease-and-desist order", "formal agreement", "restitution"), the
  amount as numeric money, the OCC's subject matters (given since 2012), the order's number, and a link
  to its document where the OCC holds one.
- **Part (b), the OTS archive,** approvable alone: the thrift regulator's orders of 1989–2011, which
  the OCC keeps as one spreadsheet ("Enforcement actions taken against federally chartered savings
  associations (thrifts) prior to July 21, 2011, are only available in the OTS Enforcement Order
  Archive (XLS)"). Read once, under the same rule.

**Licence:** a new source. The OCC's enforcement page and its web privacy policy, read today, state no
licence and no copyright terms. So the owner's ruling applies: the orders are a federal agency's own
work. The search page's note bears on the rule rather than the licence: "The names of the banking
organizations accessed through the Enforcement Action Search reflect the institutions' identities
when the enforcement documents became final." No key.

**Grounded in:**
- **The list of 2026-11-15:** 2,655 institution actions, 1987-02-11 to 2026-10-13, 2,425 before 2017.
  - Most are small banks' agreements of 1990–1993 and 2009–2012.
  - By kind: formal agreements 1,268, cease-and-desist orders 851, civil money penalties 364,
    restitution 50, and others.
  - 378 carry an amount. The largest is Bank of America, N.A.'s restitution of $1,127,453,261 on
    2013-02-28.
  - 1,652 have a document; few before 2001 do.
- **The replay, today's caption rule and release map,** under each company's names of the day:
  - 190 actions on 25 companies. Three companies' matches are namesakes: "National Bank" and "The
    National Bank and Trust Company" are not National Bank Holdings, "Metropolitan Bank and Trust
    Company" is not Metropolitan Bank Holding, and "F&M Bank and Trust Company" is not F&M Bank Corp
    (closing note);
  - **from first prices, 103 company days on 21 pages, 77 before 2017.** That counts once old
    BankAmerica's two orders of 1992, before BAC's record took the name, are taken off;
  - by page: Wells Fargo 16, JPMorgan 15, Bank of America 13, U.S. Bancorp 11, Capital One 8, HSBC 7,
    Citigroup 6, Old National 4, Trustmark, American Express and Santander 3 each, and 10 more.
- **Missed today, for the hand list:** actions on the names of listed companies' banks that the map
  does not hold, read by name:
  - Citibank, National Association 11, 2011–2020 (the map holds only "Citibank, N.A."), among them
    $350,000,000 on 2014-11-11 and $400,000,000 on 2020-10-07;
  - PNC Bank 10 (2002–2022); First Tennessee Bank 6 (1992–2017); JPMorgan Bank and Trust Company 5;
  - Wachovia Bank 5: its $50,000,000 penalty of 2010-03-12 is Wells Fargo's, its three of 2008, before
    the merger of 2008-12-31, are not;
  - Sovereign Bank 5 (2011–2013, Santander's); Associated Bank 4; Valley National Bank 4; KeyBank 3;
  - MUFG Union Bank 3 and MUFG Bank's US branches 5; UMB Bank 3; BMO Harris 2; Fulton 2; Huntington 2;
    Morgan Stanley Bank 2.

  That is about 80 actions, about 50 company days on about 18 more pages, about 35 before 2017 (an
  estimate; each name and day is to be read).
- **So in all:** about 150 company days on about 39 pages, about 110 before 2017 (an estimate built on
  the measured 103).
- **Beside the Board's actions:** 30 of the 167 matched actions on 14 large banks fall within three days
  of a Board action against the same company in the committed fixture. Among them are the foreclosure
  orders of 2011-04-13 on five banks and HSBC's of 2012-12-11. They are separate orders by separate
  agencies, the bank's and its holding company's, each its own row, as EPA's and the Justice
  Department's are.
- **For example,** each read today in the list:
  - JPMorgan Chase Bank, N.A., 2013-09-18: a $300,000,000 civil money penalty (enterprise governance,
    internal controls, risk management) and, with Chase Bank USA, $60,000,000 (unfair or deceptive
    practices);
  - JPMorgan Chase Bank and Chase Bank USA, 2014-01-07: $350,000,000 (the Bank Secrecy Act);
  - HSBC Bank USA, N.A., 2012-12-11: $500,000,000 (the Bank Secrecy Act);
  - Bank of America, N.A., 2013-02-28: restitution of $1,127,453,261 (foreclosures), with JPMorgan
    Chase Bank's $753,250,131 and U.S. Bank's $80,060,193 that day;
  - Capital One Bank (USA), N.A., 2012-07-17: restitution of $150,000,000 and a $35,000,000 penalty;
  - TD Bank, N.A., 2013-09-20: $37,500,000 (the Bank Secrecy Act);
  - Wells Fargo Bank, N.A., 2016-09-06: $35,000,000 (compensation, governance) and 2018-04-20
    $500,000,000;
  - Trustmark National Bank, 1991-08-20: a formal agreement.
- **The OTS archive:** 3,547 rows, 1,497 against institutions, 1989–2011, each linked to its order's
  file on occ.gov. Today's rule gives 14. By my reading, 9 are the companies' own (American Express
  Bank, FSB 4, Broadway Federal 2, Carver, Waterstone and AmBase 1 each) and 5 are namesakes (First
  Bancshares, United Bancorp twice, Liberty Capital, Metropolitan Bank and Trust). By name, AIG Federal
  Savings Bank, GE Money Bank, Sovereign Bank and Third Federal add one or two each. Small, and I say
  so.

**Who benefits and how:** readers of about 39 bank pages: the largest US banks, the card issuers,
the regional banks, and the foreign banks with federal branches (UBS, MUFG, ICICI, Banco de Chile).
Each gets the main regulator's own orders on its days: the penalties of 2012–2016 and every
cease-and-desist order and formal agreement. Today those pages hold only the holding company's side.

**Risk:**
- **Thin before 2001 for the large banks.** The list's 1990s are mostly small banks', and few of
  those years have a document. A row with no document links to the OCC's search under its docket.
- **Names as of the day the order became final,** as the OCC says. Each hand entry carries its days:
  Wachovia's of 2008 stays off Wells Fargo.
- **An undocumented API.** It is the search page's own, found in its script; its shape can change, so
  `check:feeds` should watch it. The answer is complete when its length equals the count the API gives,
  so a run may take the company off rows the rules no longer give it (`FetchResult.complete`).
- **Terminations:** each order carries the day it was ended (Wells Fargo's of 2021 ended 2025-03-17).
  The call below is yours.

**One call inside it, for the owner:**
- **An order's termination:** (a) a line on the order's row (recommended), or (b) a row of its own on
  the termination day.

**Cost:** none. One keyless request a week and the spreadsheet once.
**Effort:** small-medium:
- the read and the row, the rule as the CFPB's;
- about 20 `BANK_UNITS` entries, each day from a filing, and three `NOT_THE_COMPANY` entries;
- part (b) the spreadsheet read (`lib/xlsx.ts` exists);
- a committed copy of the list, `check:occ`, and the coverage map's, README's and the Sources panel's
  lines.

**How to check:** a new `check:occ` on a committed copy of the list:
- JPMorgan's actions of 2013-09-18 are one row on JPM: two penalties, $300,000,000 (order 2013-140)
  and $60,000,000 (2013-141, against two of its banks);
- HSBC Bank USA's $500,000,000 of 2012-12-11 lands on HSBC;
- "Citibank, National Association"'s $350,000,000 of 2014-11-11 lands on C;
- "Bank Of America, Nt & Sa" of 1992 stays off BAC, the taken name;
- "National Bank" of 2008-10-10 stays off NBHC, and "Metropolitan Bank and Trust Company" off MCB;
- Wachovia Bank's penalty of 2010-03-12 lands on WFC, and its agreement of 2008-04-24 does not;
- an action against a person is never read; amounts stay numeric.

On main they fail: the source does not exist.

**Depends on:** the owner's approval of a new source. Its licence is settled by the ruling of
2026-11-12.

**Buildable by:** a cloud session. apps.occ.gov and occ.gov answered every request from here.

*Importance:* high — the national banks' own regulator, about 150 company days on about 39 pages,
about 110 before 2017 (103, 77 before 2017, measured on today's rules), where bank pages hold only the
holding company's side · *Efficiency:* very high — one keyless request gives every action; the caption
rule and the release map exist · *Practicality:* high — measured on the whole list; the hand list's
days are to be read

---

## Considered and cut

- **The FDIC's failed-bank list (measured; reopened by the ruling, cut on what it adds).**
  - **The files:** the list holds 578 failures, 2000-10-13 to 2026-09-25, 547 before 2017, 31 with no
    acquirer. BankFind's failures API holds 4,117 from 1934 and gives a bidder on 3,307 from 1980 on
    (241 of them "BRANCH SALE" or "PAYOUT").
  - **2000–2026:** today's caption rule and release map give 36 of the 578 to 20 companies. Most listed
    acquirers need a hand list: First-Citizens 11, Ameris 10, U.S. Bank 14 under two spellings, Bank of
    the Ozarks 7, Great Southern and Columbia State 5 each, Simmons First 4.
  - **Why cut:** all four deals sampled carry the acquirer's own 8-K naming the failed bank 4–6 days
    after the closing, by EDGAR's full-text search:
    - Ameris's of 2012-07-12 (Montgomery Bank & Trust, closed 2012-07-06);
    - U.S. Bancorp's of 2008-11-26 (Downey Savings, 2008-11-21);
    - Great Southern's of 2009-03-26 (TeamBank, 2009-03-20);
    - Columbia Banking's of 2010-01-28 (Columbia River Bank, 2010-01-22).

    Pages title an 8-K by its press release's headline. As with TARP's purchases (cut 2026-11-06), the
    list would mostly re-date rows pages hold.
  - **Before EDGAR,** the deeper part: about 130 resolutions of 1984–1993 went to the banks of listed
    companies' own records, by my reading of the names:
    - NCNB and NationsBank 71, on 17 days, 40 of them First RepublicBank's banks on 1988-07-29 (BAC's
      record);
    - Texas Commerce's, Chemical's bank from 1987 by my reading (JPM's record);
    - Comerica 15, Frost 6, Zions 5, BOK 3, Trustmark and First Tennessee 2 each.

    BankFind cuts bidder names at 27 characters ("THE PEOPLES STATE BANK & TR"), and the Digest's
    month rows of 8-K reports may already hold these deals. A small hand-mapped follow-on if the owner
    wants it; not proposed.
- **NTSB aviation accidents (not measured; raised since 2026-11-05).** The download page, read today,
  still offers Access databases only (avall.zip, 97,140,358 bytes; Pre2008.zip, 154,517,908;
  PRE1982.zip, 39,353,261). This container still has no reader for them. New today: "On April 5, 2027,
  NTSB will transition the downloadable aviation dataset to the Enterprise API platform", through a
  "GetCasesByDateRangeV2 API". The API's access terms (a key or not) were not read. A build would
  target that API, after April 2027 at the latest.
- **The EEOC's other pages (seen in its sitemap, not measured):**
  - 1,210 litigation pages, most of them briefs, many in other parties' suits ("Golden v.
    Indianapolis Housing Agency");
  - 50,898 EEO-1 aggregate reports by area and industry, which name no company.

  Neither is an event of the company's.
- **Not retried, nothing having changed:** the FTC (404), FSIS (403), PHMSA and FERC (403), the NRC
  (needs its script), GAO's bid protests and the CPSC's civil-penalty page (403); OSHA and the FDA
  Data Dashboard (a registration each).
- **Owner decisions, batch 150's fixes and tracked waits, not raised:** listed in the header.
- **Re-prioritisations:** none proposed.
- **Anything touching another product:** nothing here reads, references or connects to another
  product's repository.

*One closing note, not a proposal* — noticed in passing. `captionParty` reads "Metropolitan Bank and
Trust Company" as Metropolitan Bank Holding's "Metropolitan Bank", "F&M Bank and Trust Company" as F&M
Bank Corp's "F&M Bank", and "The National Bank and Trust Company" as National Bank Holdings' "The
National Bank". It appears to read "and Trust Company" as legal words after the name. In the OCC's
list these are other banks. I did not check whether the Board's orders, the CFPB's actions or the
SEC's captions hold such a party. The `code-auditor` may want it.
