# Opportunity proposals — 2026-11-11 (second run)

**Commit:** a89c8e9c4386bfb7044cc5ea1887bbba5d2b91ef (`claude/lucid-goodall-6km6ea`, equal to `origin/main` after batch 142) · **Reviewed:** `CLAUDE.md`; `README.md` ("Data sources", "Sources evaluated and rejected", the FDA sections); `docs/COVERAGE-MAP.md`; `docs/OWNER-ACTIONS.md` (§3 the licensing decisions, "Decisions I can't make for you"); `docs/MASTER-CHECKLIST.md` (Scope & independence, the batch 138–142 ledgers, the head of Scope refocus, the legend); `docs/proposals/2026-11-11-proposals.md` whole, `docs/proposals/2026-10-22-news-sources.md` (#3, the FDA enforcement reports and their limits), and the "Considered and cut" section of every other proposal file; `docs/audits/2026-11-11-code-audit-b138-141.md`, its six findings and seven set-asides; code: `lib/fdaRecalls.ts` (header, `FDA_FIRMS`, `firmFor`, `recallDay`, `fdaRecallEvents`), `lib/secCases.ts` (`captionParty`, `chargedParties`, `LEGAL_WORD`, `secCaseEvents`, `NOT_THE_COMPANY`), `lib/secPress.ts` (`pressName`), `lib/sec.ts` (`listedCompaniesNamed`, `outrankingNameFor`, `newsNamesFor`), `lib/frCompany.ts` (`longerListedNameIn`), `lib/doj.ts` (`releaseNamesParty`, `namedAsSubject`), `lib/releaseNames.ts` (`RELEASE_NAMES`, `releaseNamesOn`, the units' header), `lib/epaCases.ts` (header, `UNITS`, `BRANDED_SITE`, `caseLine`, `bySettlement`), `lib/cpscRecalls.ts` (`firmName`, `firmIsCompany`, `UNITS`), `lib/fdaWarningLetters.ts` (`LETTER_NAMES`, `letterIsCompany`), `lib/investigations.ts` (header), `lib/fedActions.ts` (the row), `lib/takenNames.ts` (`takenBefore`), `lib/ingest/secCasesWalk.ts` (`partyNamesFor`), `lib/ingest/store.ts` (the FDA sources' entries) · **Proposals:** 2

> - **No rejection log exists** (`docs/audits/rejected-proposals.md`), and nothing has been
>   rejected. Every proposal of the first 2026-11-11 file is approved and built (batches 139–141), and
>   batch 142 fixed the six findings of the audit of batches 138–141. Nothing carries forward and
>   nothing was deferred.
> - **Owner calls already open, not raised again:** DuPont's past on DD; Alcoa's past on AA; the deaths
>   only a railroad's Form 54 gives (batch 130); "Drugs whose holder changed"; JCI's 2016 case on
>   Tyco's record (and with it the old Johnson Controls' EPA rows, which #2 leaves out); GE Capital
>   Retail Bank on GE; PayPal's 2015 CFPB action on eBay; the Digest's first-price floor and older
>   names; widening `MANY_PARTIES`.
> - **Waits on `NEWS_CHARTS_CONTACT`, not proposals:** batch 123's six NHTSA makers, batch 126's four
>   CPSC brands, batch 127's two railroads, Southern Natural Gas, the Digest walk, batch 133's four
>   records, Novartis Nutrition's sale day. **Other tracked items, not raised:** Arcosa's Yahoo chart;
>   Knife River's MSHA entry; the ledger tidy already offered.
> - **The leads I was given, each measured:**
>   - **Amazon's consignee orders:** 20 EPA cases name "Amazon" and stay off its page. 14 name it only
>     as the consignee, "c/o" or "/Amazon" beside another firm, and none carries a penalty. Cut; see the
>     end. One more, "AMAZON.SERVICES, INC." (2020), is Amazon's own and a spelling the unit misses: a
>     line in the closing note;
>   - **gaps of the shared caption rule:** a general rule for "a unit named after its owner" is not
>     safe. Read on a sample, 12 of the 33 multi-word hits after a first price, and 29 of the 38
>     one-word ones, are another company's. #2 is the hand round the finder points to. The ".com"
>     gap bites nowhere but Amazon's, which batch 142 settled. The "X/Y" shape is the
>     company-and-plant lead, cut twice before. Both are cut at the end;
>   - **a new federal source:** #1, openFDA's device recall file, is one. The EEOC's press releases
>     and USAspending's contract actions were measured and cut;
>   - **enrichments of rows pages hold:** EPA's complying actions and pollutant reductions, and
>     NHTSA's investigation columns, were measured and cut.
> - **What is new:** #1 reads a second openFDA file. It holds the FDA's device recalls from 2002, ten
>   years before the enforcement reports that pages read today begin. #2 adds entries to three hand
>   lists that already exist, and adds no new rule.
> - **Saved data used instead of the network:**
>   - EPA's case file of 2026-10-31 (`b95/dl`), extracted again into `scout143/unz-epa`;
>   - the committed fixtures: the SEC cases' 30,747 rows, the CPSC's 10,070 recalls, the CFPB's 386
>     actions, the Justice archive's months, the CFTC list and the Board's feed;
>   - the FDA warning-letter list of 2026-11-11 as the last scout read it (`scout138/out`);
>   - the first trading days of 651 tickers (`scout125/out/first-merged.json`).
>
>   Each was read as data, with `python3 -I` or through the repository's own functions: `readCaseFile`,
>   `epaEvents`, `ownRow`, `unitKeysOf`, `parseRecalls`, `firmName`, `cpscEvents`, `captionParty`,
>   `chargedParties`, `caseKey`, `secCaseEvents`, `letterIsCompany`, `cfpbEvents`, `firmFor`,
>   `releaseNamesOn`, `takenBefore`, `releaseNamesParty`, `pressName`, `longerListedNameIn`,
>   `listedCompaniesNamed`, `companyNames`, `namesForYear`, `newsNamesFor`, and the `UNITS`,
>   `RELEASE_NAMES`, `LETTER_NAMES` and `FDA_FIRMS` lists. The probes are in the session scratchpad
>   (`scout143/probes/`).
> - **Measured live on 2026-11-11 from this container.** Every figure below is measured unless it says
>   it is an estimate. Requests, by host:
>   - www.eeoc.gov 9: the newsroom's first and last pages and four between them, its disclaimer and
>     privacy pages, and a site search (404) (cut);
>   - api.fda.gov 2: a device recall query for Medtronic and openFDA's download index (#1). A third was
>     never sent: curl refused the address's brackets before connecting, and the log says so;
>   - download.open.fda.gov 2: the whole device recall file (a 289,909,622-byte zip) and the whole
>     device enforcement file (95,522,528 bytes) (#1);
>   - www.accessdata.fda.gov 2: two of the FDA's own recall pages, to see that they give the class (#1);
>   - open.fda.gov 1: the licence (#1);
>   - query1.finance.yahoo.com 6: the first trading days of Philips, Boston Scientific, Baxter, Zimmer
>     Biomet and Teleflex, and one refused with 429 (Smith & Nephew) (#1);
>   - api.usaspending.gov 1 (cut); data.transportation.gov 1: the NHTSA investigations dataset's
>     columns (cut);
>   - www.ftc.gov 1 (404), www.gao.gov 1 (403) and www.cpsc.gov 1 (403), each refused (cut).
>
>   That is 27 requests: 22 answered 200, and 5 did not (one each of 429, 403, 403, 404 and 404). Each
>   carried the User-Agent `News Charts Research`, with no email address, and each began at least
>   1.3 s after the one before ended. No www.sec.gov, data.sec.gov or efts.sec.gov page was asked.
>   Postgres was not used and the app was not run. The log is in the session scratchpad
>   (`scout143/requests.log`).
> - **Nothing here needs a key, a paid tier or a recurring charge.** #1 reads a keyless CC0 file
>   whose licence is quoted below as read today: one or two requests a mapped company a month, and
>   about 7,900 of the FDA's recall pages once. #2 reads data already downloaded. Its days come from
>   data.sec.gov and efts.sec.gov, which answer without a contact.
> - Ranked by importance, securities depth first:
>   1. the FDA's device recalls of 2002 to mid-2012, for the companies the recall map already holds;
>   2. a fifth round of units named after their owners, found across five sources at once.

Mark each proposal below: `APPROVED`, `REJECTED`, or `DEFERRED`, and add a
reason for anything rejected. Then run the scout in FILE mode.

---

## 1. The FDA's device recalls of 2002 to mid-2012, ten years the recall rows do not reach: Medtronic's Sprint Fidelis, DePuy's ASR hip, Alaris pumps, Zimmer's Durom cup… · proposed `P1` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — by the owner, 2026-11-12 ("Approve (Recommended)"). Built in batch 144: openFDA's device recall file for the map's firms, less the reports' 470 events of those years, each recall's class read once from the FDA's recall database (db/051), the map's days for the units bought and sold 2000–2012 read from filings. From first prices, 1,981 rows on 19 pages, all before 2017, 73 of them Class I; 255 more are Class III and give none, where this file estimated about 60, and 345 rows wait on 18 companies' first prices.
**Owner's reason (if rejected):**

**Raised before:** no. The 2026-10-22 shortlist proposed the FDA's enforcement reports and named their
limit, "it starts in mid-2012". No file names openFDA's device recall file.

**Anchor:** a documented gap, and data the source's host already serves.
- The FDA recall rows of the 73 companies `FDA_FIRMS` maps come from the weekly enforcement
  reports. openFDA holds those from 2012-06-20, so a device maker's page has no recall before then.
- openFDA also publishes the FDA's own recall database for devices (its "device recall" file). It
  goes back to 2002, under the same event numbers the enforcement reports use.

**What:** an adapter beside `lib/fdaRecalls.ts`, a new source key (40, `fda_device_recalls`) so the
Sources panel names the dataset.
- **The read:** for each mapped company, openFDA's `device/recall.json` with the map's firm names,
  for recalls the firm began before 2012-06-20. That is one or two requests of 1,000 a company
  (Stryker's 1,113 product records are the most), once a month. 2,599 of the 2,600 recalls below
  are closed, so the answer hardly changes.
- **The rule:** the map's own, `firmFor` on the day the firm began the recall, as the rows of 2012
  on are matched. A recall whose event number is in the enforcement reports is already a row and is
  skipped.
- **The class:** the file gives none. The FDA's recall page for each product does: "Class 1 Device
  Recall Medtronic Sprint Fidelis Lead". Each product's page is read once and kept. A recall takes
  its most serious product's class, and only Class I and II become rows, the floor the rows of 2012
  on keep. A product whose page gives no class gives no row.
- **The row:** as today's, "Class I device recall: Medtronic Sprint Fidelis 6949 … (4 products)",
  with the FDA's reason, on the day the firm began it. It links to the FDA's recall page, since the
  enforcement report's page exists only from 2012.

**Licence:** a new file on a host already read. open.fda.gov/license, read 2026-11-11: "unless
otherwise noted, the content, data, documentation, code, and related materials on openFDA is public
domain and made available with a Creative Commons CC0 1.0 Universal dedication … You can copy, modify,
distribute and perform the work, even for commercial purposes, all without asking permission." The
same terms `lib/fdaRecalls.ts` quotes from 2026-10-24.
- **The class pages:** www.accessdata.fda.gov, which the rows already link to. The FDA's website
  policies, quoted in the first 2026-11-11 file as read that day, say the FDA website's contents "are
  not copyrighted". They name www.fda.gov. What is kept from a page is the class, a fact.
- No key and no paid tier. Without a key openFDA allows 1,000 requests a day, and the new read adds
  one or two a company a month.

**Grounded in:**
- **The files of 2026-11-10** (openFDA's export day):
  - the device recall file: 59,705 product records, 1,501,815,909 bytes of JSON. Its 23 fields
    (and `openfda`) include no recall class;
  - the device enforcement file: 40,481 records, reported 2012-06-20 to 2026-11-04.
- **The replay:** every product record against `FDA_FIRMS` with `firmFor`, on the day the firm began
  the recall, grouped by event number:
  - **9,023 recalls on 54 mapped companies.** 6,416 are in the enforcement reports already: Class I
    459, II 5,810 and III 147, by each recall's most serious product;
  - **2,600 are in no report and on no page.** They were begun from 2000-04-11 to 2012-05-07, on 38
    companies, with 7,865 product records. 7 more, of 2026, are waiting for a report;
  - **from first prices, 2,228 recalls on 20 pages, every one before 2017.** That counts the saved
    first days, and five read today: Philips from 1980-03-17, Boston Scientific 1992-05-19, Baxter
    1981-10-27, Zimmer Biomet 2001-07-25, Teleflex 1980-03-17. Every recall of those pages falls after
    its first price;
  - 372 more on 18 companies whose first price was not read: Smith & Nephew 56, CONMED 51, Integra
    49, Merit 34, Steris 29, Edwards 27 and others. Medline's 14 and Penumbra's 5 fall before their
    listings of 2025 and 2015, by my reading (an estimate).

  | Page | Recalls of 2002 to mid-2012 gained |
  | --- | --- |
  | Stryker, Abbott, GE (GE Healthcare, while GE's) | 281, 269, 254 |
  | Philips, Medtronic, Johnson & Johnson | 241, 212, 210 |
  | Boston Scientific, Baxter, BD, Zimmer Biomet | 190, 133, 123, 112 |
  | Danaher, Teleflex, Cardinal Health, 3M | 79, 51, 44, 15 |
  | Kimberly-Clark 9, and five drugmakers with one each | 14 |
  | 18 more, first price not read | 372 |

- **The class:** read on two of the FDA's pages today. Medtronic Xomed's Oto-Flex bur of 2002-01-25
  is "Class 2 Device Recall", and the Sprint Fidelis lead of 2007-10-15 is "Class 1 Device Recall".
  - Of the same firms' recalls in the reports since 2012, 2.3% were Class III.
  - About 60 of the 2,600 would then drop (an estimate).
- **For example,** each read on its record:
  - Medtronic, 2007-10-15 (event 45403, 4 products): the Sprint Fidelis leads, "voluntarily suspended
    worldwide distribution", Class I;
  - Johnson & Johnson, 2010-08-23 (event 57177, 68 products): DePuy's ASR acetabular cup system, the
    ASR hip recall;
  - Cardinal Health, 2006-08-10 (event 36064): the Alaris SE infusion pump, "a potential for over
    infusion", Cardinal's before it spun off CareFusion in 2009;
  - Zimmer Biomet, 2008-07-22 (event 49079, 12 products): the Durom acetabular cup, "instructions
    for use … are inadequate";
  - Philips, 2002-11-25: the HeartStart XL defibrillator's "defective energy switch".

**Who benefits and how:** Readers of 20 device and health pages, and 18 more once their first prices
are read. The years 2002–2012 gain the FDA's own recall record: the Sprint Fidelis and ASR recalls,
and the routine Class II recalls the rows already show from 2012. Before mid-2012 these pages hold no
FDA recall at all.

**Risk:**
- **No class in the file.** About 7,865 product pages to read once, nearly three hours at 1.3 s
  apart, spread over runs as the Digest's walk is (a few hundred a run). The FDA's recall database
  also has a search that lists the class with each product, which may cut the reads; not measured.
- **Firm names a later owner rewrote.** Guidant's VENTAK PRIZM recalls of 2005-06-17 and 2005-07-25
  are filed under "Boston Scientific CRM Corp". Boston Scientific bought Guidant on 2006-04-21 (the
  release map's day, from its 8-K), and an acquisition's past is never the buyer's. The map reads
  "Boston Scientific" in every year, so these two would land on its page unless dated.
- **The map's days were read for 2012 on.** Its notes give the years ("its breast-implant maker since
  2009" for Mentor Texas, "Danaher's since 2006" for Sybron Dental, "since 2005" for Leica) but carry
  no `from` day, which no recall of 2012 on needed. I found about 14 recalls that fall before such a
  purchase, each to be dated from a filing:
  - Guidant's two above;
  - Mentor Texas on J&J, 4 of 2003–2008;
  - Datex-Ohmeda on GE, 4 of 2002–2003, before GE bought Instrumentarium in 2003 (my reading);
  - Sybron Dental, Ormco and Leica on Danaher, 4 of 2003–2005.

  The units the map already dates hold: Arrow on Teleflex from 2007-10-01, Beckman Coulter on Danaher
  from 2011-06-30, Synthes on J&J from 2012-06-14.
- **Volume.** Stryker gains 281 rows and Abbott 269. By the mix of the rows of 2012 on, about nine
  in ten would be Class II (an estimate). A long timeline already opens with its older years folded
  (batch 38).
- **openFDA's own warning:** "you should assume all results are unvalidated". The day is the one the
  firm began the recall, as `recallDay` takes it.

**Cost:** none. One or two keyless requests a mapped company a month, and the class pages once.
**Effort:** medium:
- the read and the rule on the map, skipping event numbers already in the reports;
- the class reader and a small db table of product and class, read a few hundred a run;
- the map's days for 2002–2012: about 14 recalls found here, the rest to be read;
- the rows, a committed slice of the file for the mapped firms, `check:fda-recalls` cases;
- the coverage map's, README's and the Sources panel's lines.

**How to check:** new `check:fda-recalls` cases on the slice:
- Medtronic's Sprint Fidelis recall of 2007-10-15 (event 45403) lands on MDT as Class I, its four
  products one row;
- DePuy's ASR recall of 2010-08-23 (event 57177) lands on JNJ;
- Guidant's VENTAK PRIZM recall of 2005-06-17, under "Boston Scientific CRM Corp", lands on no page;
- Mentor Texas's recall of 2003-12-16 lands on no page;
- a recall in both files is one row, the enforcement report's;
- a product page without a class gives no row, and a Class III recall none.

On main they fail: the file is not read.

**Depends on:** the owner's approval of a new dataset. Its licence is the enforcement reports'.

**Buildable by:** a cloud session. api.fda.gov, download.open.fda.gov and www.accessdata.fda.gov all
answered from here.

*Importance:* high — 2,228 recalls on 20 pages from first prices, all before 2017, where device
pages hold no recall before mid-2012 · *Efficiency:* high — the licence, the firm map and the row
exist; the class reads are the new work · *Practicality:* medium — measured, but the class needs
~7,900 page reads once and the map needs its older days

---

## 2. A fifth round of units named after their owners, found across five sources at once: Invesco Funds Group, Raymond James Financial Services, RBC Capital Markets, National Fuel Gas Distribution, A. O. Smith Electrical Products, BRP US, Coca-Cola Refreshments… · proposed `P2` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — by the owner, 2026-11-12 ("Approve (Recommended)"). Filed under Scope refocus by batch 144, to be built in batch 145.
**Owner's reason (if rejected):**

**Raised before:** in parts. Each source's units came in rounds of their own:
- EPA in batches 104, 114, 120 and 135;
- the CPSC in batch 126;
- the release map in batches 88, 89, 121 and 128.

The general rule is the lead batch 142's findings hint at (ADM Animal Nutrition, Reckitt/Mead
Johnson). Its "company and plant" shape was cut on 2026-11-09 and 2026-11-11.

**What changed:** measured here across five sources at once, with a finder. I also read a sample to
see whether the finder could become the rule itself. It cannot.

**Anchor:** data collected and never surfaced. Cases and recalls already downloaded name a listed
company's own unit by a name that begins with the company's. The caption rule refuses them, rightly
in general, since a legal word must follow the name. No hand list holds them.

**What:** 51 entries in the three lists that exist, each a unit, its owner and its days. No new rule
and no new source:
- EPA's `UNITS`;
- the CPSC's `UNITS`;
- `RELEASE_NAMES`, which the SEC cases and the CFPB read.

Optionally, the finder kept as a script outside the check chain, to list candidates for any later
round.

**The general rule, measured, and why it is not proposed:**
- **The finder:** a party is a gain when it begins with the company's whole name of that year, adds
  one to five words before its legal words, and today's rows for the company do not hold it. It was
  run on EPA's 137,103 cases, the CPSC's 10,070 recalls, the SEC's 30,747 case rows, the FDA's 3,807
  letters and the CFPB's 386 actions.
- **What it found:** 4,389 items on 602 companies, and 130 more where a party is split at "/" (cut at
  the end). After the units the lists already hold on other days, and the names other records took,
  4,107 of the 4,519 remain, on 598 companies, 3,130 before 2017. From first prices where read, that
  is 1,405 on 177 pages.
- **Read on a random sample of 80:**
  - for names of two words or more, 21 of 40 are the company's own on the day, 12 are another
    company's, and 7 fall before the first price. The 12 include Coca-Cola Enterprises on Coca-Cola,
    Gold Fields American Corp. on Gold Fields, and American Express Financial Corporation on American
    Express in 2016, eleven years after it became Ameriprise;
  - for one-word names, 9 of 40 are own, 29 another's, and 2 fall before the first price: Southern
    Class Trucking on Southern Company, Sinclair Oil on Sinclair the broadcaster, Sun Chemical on SUN
    (SUNI), and so on.

  A rule that is wrong on 36% and 76% of what it adds after a first price is not safe for six
  sources. So each entry below was read by hand.

**Licence:** no new source. The EPA, CPSC, SEC and CFPB sources were approved with their terms quoted
in their modules.

**Grounded in:**
- **The drafted entries:** 51 units on 49 companies, each read against the finder's hits. Left out:
  - namesakes;
  - joint ventures (Chevron Phillips Chemical, Duke Energy Field Services, Dow Corning);
  - the owner's open JCI call (Johnson Controls Battery Group);
  - a company's own former legal names, which ingest reads from EDGAR's former names as far as I can
    tell offline (Hershey Foods, ITT Industries, Polaris Industries), and names that fall before a
    first price (Owens-Corning Fiberglas, before Owens Corning's record of 2006).
- **What they give:** 299 items on 47 companies, 159 before 2017: EPA 182, CPSC 69, SEC cases 48.
  - **From first prices where read: 114 on 26 pages, 81 before 2017.**
  - 185 more on 21 companies whose first price was not read: BRP 35, ACCO 22, BAE Systems 16,
    Enterprise Products 15, SharkNinja 14, Raymond James 13, RH 12, Hayward 11, Yamaha Motor 10, KB
    Home 8 and others. Some fall before a listing: BRP's of 2005–2012, SharkNinja's before 2023,
    Hayward's before 2021, by my reading of their listing years (an estimate).
  - Of EPA's 182, 71 have a court step or a penalty and are rows of their own, 53 of them before
    2017. The rest are orders without a penalty, which join the month rows.

  | Page (first price read) | Items gained |
  | --- | --- |
  | Invesco (Invesco Funds Group), RBC (RBC Capital Markets) | 16, 9 |
  | National Fuel Gas, Walmart ("WALMART STORES", one word) | 8, 7 |
  | A. O. Smith, FMC, Graphic Packaging, Energy Transfer | 6, 6, 6, 6 |
  | Kaiser Aluminum, Owens Corning, P&G, Devon, Eastman, Northern Trust | 5, 5, 4, 4, 4, 4 |
  | 12 more (Coca-Cola, Churchill Downs, GE, Cleveland-Cliffs, Ford…) | 24 |

- **For example,** each read on its record:
  - Invesco Funds Group, Inc.: the SEC's litigation release LR-18482 of 2003-12-02, whose caption
    names it alone, and 15 more items to 2013;
  - Raymond James Financial Services, Inc.: SEC proceedings of 2004-02-12, 2004-09-30, 2005-01-28 and
    2005-07-29;
  - RBC Capital Markets Corporation: the proceeding of 2009-02-24 and the litigation release of
    2009-06-03;
  - National Fuel Gas Supply Corporation: EPA's court case 02-1993-0149 of 1995-06-20;
  - A. O. Smith Electrical Products: CPSC recalls of 2003-12-09 to 2008-06-24, before its sale to
    Regal Beloit in 2011;
  - Coca-Cola Refreshments USA: EPA's court case 04-2009-9006 of 2012-02-09, from the day Coca-Cola
    bought it in 2010;
  - Walmart: 7 EPA cases of 1993–2017 written "WALMART STORES, INC.", one word. Neither "Walmart"
    (no legal word follows) nor the former name "Wal-Mart Stores" reads that spelling;
  - J.B. Hunt: "J.B. HUNT TRANSPORT SERVICES, INC.", its own legal name. Its EDGAR title is the
    inverted "HUNT J B TRANSPORT SERVICES INC", so the rule never reads it (2 cases, 2007 and 2010).

**Who benefits and how:** Readers of 47 company pages, 26 of them measured from first prices. They see
the regulators' cases against the company's own named companies: Invesco Funds Group's SEC case of
2003, Raymond James's and RBC's brokerage cases, and the EPA and CPSC records of utilities, chemical
makers and consumer-goods makers. Most fall before 2017. The gain is small, and I say so: about a
hundred items on the pages measured.

**Risk:**
- **Former names offline.** The replay reads no EDGAR former names; ingest does (`partyNamesFor`). So
  an item that is a company's own former legal name may already be on its page in production. The
  entries leave out every one I could see; the build checks the rest at ingest.
- **Days.** Most units were held throughout. Six need days, given here from my reading, each to be
  read from a filing:
  - A. O. Smith Electrical Products to its sale in 2011;
  - FMC Wyoming to the sale of FMC's soda ash business in 2015;
  - Denison's US mines to 2012;
  - Early Times to Brown-Forman's sale in 2020;
  - GE Plastics to 2007;
  - Coca-Cola Refreshments from 2010-10-02.
- **First prices not read** for 21 of the 47 companies, so their counts are upper bounds.

**Cost:** none; the data is held.
**Effort:** small-medium:
- 51 entries, each with its days from a filing (data.sec.gov and efts.sec.gov answer without a
  contact);
- the slices gain their cases, and `check:epa-cases`, `check:cpsc` and `check:sec-cases` gain cases;
- the coverage map's and README's counts.

**How to check:** new cases on the slices:
- Invesco Funds Group's release of 2003-12-02 lands on IVZ;
- National Fuel Gas Supply's case 02-1993-0149 lands on NFG;
- A. O. Smith Electrical Products' recall of 2008-06-24 lands on AOS, and none of its name after the
  sale day;
- Coca-Cola Refreshments' case 04-2009-9006 lands on KO, and Coca-Cola Enterprises' cases do not;
- the namesakes stay off: Southern California Water Company on Southern Company, Sun Chemical on
  SUN, Gold Fields Mining on Gold Fields, and American Express Financial Corporation's cases after
  2005-09-30 on American Express.

On main they fail: no entry exists.

**Depends on:** nothing.

**Buildable by:** a cloud session; the saved files are enough, and the days need only data.sec.gov
and efts.sec.gov.

*Importance:* low-medium — 114 items on 26 pages from first prices, 81 before 2017, and up to 185 on
21 more · *Efficiency:* medium-high — the data and the lists exist; each entry is a reading and a
day · *Practicality:* high — measured on the saved files

---

## Considered and cut

- **A general rule for "a unit named after its owner" (measured; see #2).** On the five sources it
  adds 4,107 items no list holds. A sample of 80 reads 12 of 33 multi-word hits and 29 of 38
  one-word hits as another company's. Not safe; #2 takes the ones read as right.
- **The "X/Y" shape (measured, cut again).** A party split at "/", one side of which the rule reads as
  the company: 130 items on 84 companies, 116 before 2017, nearly all EPA's. It holds real ones
  ("EXXON MOBIL CORPORATION / EXXONMOBIL OIL CORP", "WALMART, INC./SAM'S CLUB", the SEC's "Pfizer Inc. /
  Wyeth LLC" of 2012) beside wrong ones:
  - branded stations ("BP/FOOD MART/EL-CHEAPO FUEL STOP", "TRIANGLE SHELL/EXXON LLC");
  - towns ("EAST BATON ROUGE, CITY/PARISH OF" on City Holding);
  - Amazon as a consignee ("Li Ke / Amazon").

  It is the company-and-plant lead cut on 2026-11-09 and 2026-11-11, and still too few and too mixed
  for a rule six sources share.
- **".com" in a legal name (measured).** Across every source held whole, only Amazon is written with
  ".com":
  - the CPSC's 1,329 "Amazon.com" mentions are stores in "Sold at" lines, already on Amazon's page;
  - EPA's 15 defendants written "Amazon.com" are Amazon.com Services, the unit batch 142 added, or
    another firm "c/o Amazon.com" (below);
  - the FDA's 10 letters are on the hand list.

  drugstore.com, eBay.com and Overstock.com appear only as stores. No rule is needed.
- **Amazon's consignee orders (read).** 56 EPA cases name "Amazon"; 36 are on Amazon's rows. Of the
  other 20:
  - 5 are namesakes (Amazon Construction, Amazon Nutraceuticals, Amazon Lights, the City of Amazonia,
    "Amazong");
  - 14 name Amazon as the consignee, "c/o" or "/Amazon" beside an importer or seller, 2018–2026, none
    with a penalty. They are import refusals and stop-sale orders for other sellers' goods: the
    importer's case, not Amazon's. Left off;
  - one is Amazon's own (closing note).
- **EPA's complying actions and pollutant reductions (measured, cut).** Both tables are in the zip the
  monthly walk reads.
  - The complying actions' own text reaches 61 rows from first prices, all before 2017, mostly bland
    ("REMEDIAL INVESTIGATION/FEASIBILITY STUDY", "HEIGHTENED COMPANY'S AWARENESS OF TSCA
    REQUIREMENTS").
  - The pollutant reductions give a weight (pounds, tons or pounds a year) on 755 rows from first
    prices, but 666 of them name no pollutant, and the other entries mix units ("yd3", "gal", "ppb"),
    so a sentence would mislead.
- **The EEOC's press releases (measured, cut on its licence).** Its newsroom lists 7,622 items from
  1996 on, 24 a page.
  - **The sample:** 134 titles from six pages. The Justice title rule gives 8 to pages: Wal-Mart 2001
    and 2008, Dillard's 2008, AT&T 2013, Hitachi 2019, Union Pacific 2019, BNSF on Berkshire 2026,
    Lockheed Martin 2026. It misses others ("FINAL DECREE ENTERED WITH WALGREENS FOR $24 MILLION",
    2008). At that rate, about 450 releases would reach pages, two-thirds before 2017 (an estimate).
  - **Why cut:** neither its disclaimer nor its privacy policy, read 2026-11-11, states a licence or
    that its pages are public domain, and its site search answered 404. The FDIC's failed-bank list
    was cut for the same reason (2026-11-02, 2026-11-05).
  - **What would reopen it:** the Commission's own words, or an owner ruling that a federal agency's
    work may be used on the statute's terms (17 U.S.C. § 105) where its site is silent. That ruling
    would reopen the FDIC's list too.
- **USAspending's contract actions (one request, cut).** The keyless API answered. The 100 largest
  contract actions of October 2007 to September 2016 run from $344.7 billion to $1.06 billion, so a
  $1 billion floor alone keeps at least 100. The top one, "Miscellaneous Foreign Awardees" for a
  firing range on 2013-09-26, is plainly an error, and the second is $116.1 billion to Fluor in
  2009. The recipients are operating units (Electric Boat and Bath Iron Works for General Dynamics,
  Huntington Ingalls while Northrop's, Bell Boeing's joint office), which would need a map. An
  obligation is not an announcement. Its licence was not read.
- **NHTSA's investigations (one request).** The dataset's ten columns hold no summary beyond the
  subject line the rows already show. Nothing to add.
- **Retried, and still refused:** the FTC's case list (404 from its host's front end, as before); GAO's
  bid protests (403); the CPSC's civil-penalty page on www.cpsc.gov (403). The penalties would have
  been a good companion to the recalls; worth a try from the owner's host.
- **Not retried, nothing having changed:** the OCC and FSIS; the FDIC (licence); PHMSA and FERC (403);
  the NRC (needs its script); the NTSB (an Access database; still no reader here); OSHA (key); the
  European Commission.
- **A company's names from before EDGAR (seen, not raised).** The finder met "CATERPILLAR TRACTOR CO."
  in two EPA cases of 1985 and 1988, Caterpillar's own name until 1986. That is the question of the
  owner's open call on the Digest's older names.
- **Owner decisions and tracked waits, not raised:** listed in the header.
- **Re-prioritisations:** none proposed.
- **Anything touching another product:** nothing here reads, references or connects to another
  product's repository.

*One closing note, not a proposal* — noticed in passing. EPA's case 04-2021-1234 of 2020-11-17 names
"AMAZON.SERVICES, INC." (a FIFRA order with no penalty). It is Amazon's own company, but batch 142's
EPA unit pattern (`^AMAZON(?:\.COM)?\s+SERVICES\b`) wants a space after "AMAZON", so the order is on
no page. J.B. Hunt's EDGAR title is the inverted "HUNT J B TRANSPORT SERVICES INC", so no
caption rule reads its legal name as written; #2 covers its two EPA cases, but the other caption
sources may miss it the same way. The `code-auditor` may want both.
