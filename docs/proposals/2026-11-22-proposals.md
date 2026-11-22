# Opportunity proposals — 2026-11-22

**Commit:** c11bc9b3f409e4a4c93015a8495d3c21aea674ee (`claude/lucid-goodall-6km6ea`, equal to `origin/main` after batch 164) · **Reviewed:** `CLAUDE.md`; `README.md` ("Sources evaluated and rejected"); `docs/COVERAGE-MAP.md`; `docs/OWNER-ACTIONS.md` (§3 with the ruling on federal works, "Decisions I can't make for you"); `docs/MASTER-CHECKLIST.md` (the batch 158 and 151 ledgers and their cut lists); `docs/proposals/2026-11-18-proposals.md` and `2026-11-15-proposals.md` whole, every other proposal file's titles and "Considered and cut" lists back to 2026-07-30; code: `lib/secCases.ts` (`captionParty`, `chargedParties`), `lib/epaCases.ts` (`epaParty`, `UNITS`), `lib/cpscRecalls.ts` (`UNITS`), `lib/cfpb.ts` (`respondents`), `lib/frCompany.ts` (`companyNames`, the company feed's title rule), `lib/ingest/frBackfill.ts` (`namesForYear`), `lib/sec.ts` (`newsNamesFor`), `lib/releaseNames.ts` (`releaseNamesOn`), `lib/takenNames.ts` (`takenBefore`), `lib/taaPetitions.ts` (`taaIsCompany`, `taaEvents`), `lib/predecessors.ts` (AVGO's entry), `lib/ingest/store.ts` (the source ids; openFDA's and the Federal Register's licence notes), `scripts/check-taa.ts` and `scripts/check-nlrb.ts` (their replay of every company in the index) · **Proposals:** 3

> - **No rejection log exists** (`docs/audits/rejected-proposals.md`), and nothing has been rejected.
>   Both proposals of 2026-11-18 are approved and built (batches 159–160, the trade adjustment
>   certifications; batches 161–162, the NLRB's Board decisions). Nothing was deferred and nothing carries
>   forward.
> - **Settled, not raised again:** batch 163 (old Alcoa's and old du Pont's filings, the owner's call of
>   2026-11-21); batch 164's fixes of the audit of batches 155–163; the NLRB's night read, which resumes on
>   its own (no request went to www.nlrb.gov from here); the ruling that a federal agency's own work is
>   usable where its site states no licence.
> - **Defaults still yours to change, not raised:** the Digest's first-price floor and its names older than
>   EDGAR's (it bears on #3: "Bristol-Myers" is BMY's record's own name before 1989, left out of every count
>   below); widening `MANY_PARTIES`; "Drugs whose holder changed".
> - **What is new:** two kinds of Federal Register notice whose titles never name a company, so the company
>   feed, which keeps a title only when it names one, has never kept them (#1, #2), and an openFDA file no
>   adapter reads (#3).
>   - The Federal Register's own text pages refused this container: all 20 asked answered 302 to
>     `unblock.federalregister.gov`. Its API answered every request. The text was read from the Government
>     Publishing Office's copy on www.govinfo.gov, which answered every request, and a build would read it
>     there too.
> - **"Stored but never surfaced":** not swept again whole. `event_enrichments` is still written by no code;
>   only `scripts/cost-report.ts` reads it, to count spend.
> - **Saved data used instead of the network:**
>   - the first trading days of 954 tickers from the committed fixtures (`digest-1985-entries`,
>     `eeoc-listing`, `fda-device-recalls`, `occ-actions`), as `check:taa` and `check:nlrb` read them;
>   - EDGAR's former names of 487 companies from `scripts/fixtures/nlrb-decisions-2026-11-21.json.gz`;
>   - the ticker index, the alias file, the release map and EPA's and the CPSC's `UNITS`, through the
>     repository's own functions.
>
>   Each download was read as data, with `python3 -I` or through `captionParty`, `epaParty`, `respondents`,
>   `companyNames`, `namesForYear`, `newsNamesFor`, `possessiveNameFor`, `dojPossessive`, `releaseNamesOn`
>   and `takenBefore`. The probes are in the session scratchpad (`scout165/scripts/`). The downloads are
>   under `/var/tmp/scout165/`, one directory each.
> - **Measured live on 2026-11-22 from this container.** Every figure below is measured unless it says
>   it is an estimate. Requests, by host:
>   - www.govinfo.gov 55: robots.txt, the site's policies page, 38 of the ITC's institution notices (#2)
>     and 15 of the antitrust agencies' early-termination notices (#1, one of them twice);
>   - www.federalregister.gov 31: robots.txt and 10 API searches (#1, #2, cut), and the 20 text pages
>     that answered 302;
>   - download.open.fda.gov 2 and api.fda.gov 1: openFDA's file list, its historical documents (#3) and
>     its complete response letters (cut);
>   - www.data.boem.gov 2, www.loc.gov 2 (the second a 429 behind a Cloudflare challenge),
>     static.case.law 1, pubapps2.usitc.gov 2 (the proxy's 502), www.usitc.gov 1 (403) and
>     orders.fdic.gov 1 (failed certificate verification): all cut.
>
>   That is 98 requests: 73 answered 200, 20 answered 302, one 403, one 429 and three no answer. Each carried
>   the User-Agent `News Charts Research`, with no email address. They ran one at a time, each at least
>   1.6 s after the one before ended, and at least 5.5 s apart for www.loc.gov, whose robots.txt asks 5. No
>   request went to www.nlrb.gov, www.sec.gov or data.sec.gov. Postgres was not used and the app was not
>   run. The log is `/var/tmp/scout165/requests.log`.
> - **Nothing here needs a key, a paid tier or a recurring charge.** #1 reads 440 notices once, then one a
>   month. #2 reads about 1,140 notices once, then about four a month. #3 reads one 13 MB file once.
> - Ranked by importance, securities depth first:
>   1. the antitrust agencies' early terminations of the merger waiting period, 1995–2026: the company's
>      acquisitions, sales and stakes, every sector;
>   2. the ITC's Section 337 investigations, 1995–2026: import-ban cases the company brought or faces;
>   3. the FDA's own press releases and talk papers, 1962–2014: recalls, withdrawals, seizures and
>      approvals in the FDA's words, much of it before EDGAR.

Mark each proposal below: `APPROVED`, `REJECTED`, or `DEFERRED`, and add a
reason for anything rejected. Then run the scout in FILE mode.

**Marked 2026-11-22: all three approved** ("Approve all three (Recommended)"), each with its recommended call, and filed
into the checklist under Scope refocus by batch 166, which builds #1.

---

## 1. The antitrust agencies' early terminations of the merger waiting period, 1995–2026: the company's acquisitions, sales and stakes cleared early — J&J's Closure Medical, Microsoft's Ensemble Studios, Google's Dropcam, Kroger's Vitacost, HCA's purchase from Tenet, Trian's stake in BNY Mellon… · proposed `P1` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — 2026-11-22, "Approve all three (Recommended)", with call (a): every grant naming the company, as acquirer, acquired person or acquired entity, one row a company a day, an individual's purchase labelled. Filed under Scope refocus; built in batch 166.
**Owner's reason (if rejected):**

**Raised before:** no. The FTC's own case list was tried on 2026-11-05, 2026-11-09b and 2026-11-11b and
answered 404. Nobody looked at the Federal Register's notices of the waiting periods the FTC and the
Justice Department end early.

**Anchor:** a stated objective with no work behind it, in every sector. A company planning an acquisition
above the Hart-Scott-Rodino thresholds must notify both agencies and wait. Section 7A(b)(2) lets the agencies
end the wait early and "requires that notice of this action be published in the Federal Register", in the
notices' own words. Each grant names the acquiring person, the acquired person and the entities bought, on
the day it was granted. Pages hold a deal only where an 8-K or a tender form announced it, and never the day
the agencies cleared it. The notices' titles name no company ("Granting of Request for Early Termination of
the Waiting Period Under the Premerger Notification Rules"), so the company feed never kept one.

**What:** an adapter, `lib/hsrEarly.ts`, with a new source key and a table, as the EEOC's are built:
- **The read:**
  - the Federal Register API's list of the FTC's notices that hold "early termination" and "waiting
    period": one request, 469 documents, 440 of them titled as grants, 1994-11-02 to 2026-11-20;
  - each notice's text once from govinfo (`www.govinfo.gov/content/pkg/FR-<day>/html/<document>.htm`),
    440 requests at 1.3 s or more apart, about ten minutes once;
  - then each new notice as the API lists it, about one a month since the notices began again in 2025
    (none in 2022–2024, 2 in 2025, 9 in 2026).
- **The tables:** five layouts, seen here:
  - 1995–1998, each transaction a run of lines ending in its PMN number and the day terminated;
  - in some notices of 1999–2003, one party a line under "Party name", by the day granted;
  - in others of 2001–2009, three columns (Acquiring, Acquired, Entities) under each day's header;
  - 2010–2026, the parties joined by semicolons, under a day's header or beside an "ET date" column.
- **The rule:** the caption rule (`captionParty`) on each party, under the company's names of the year,
  the release map's units and EPA's and the CPSC's `UNITS` on their days, with the table of taken names
  and the company's first price. A namesakes list read by hand (`NOT_THE_COMPANY`).
- **The row:** one a company a day, on the grant's day: "FTC and Justice Department ended the merger
  waiting period early: Johnson & Johnson's acquisition of Closure Medical Corporation". It gives each
  transaction's number, its parties as the notice writes them, and the notice's own day and link.
- **"Also on":** a grant whose acquirer and target are both listed (HCA and Tenet, AEP and Sempra, Valero
  and VeraSun) is a multi-party case. Add it to `ALSO_ON_SOURCES` and the index, as db/054 did for the
  NLRB.

**Licence:** a new source, but no new terms:
- the notices are the FTC's and the Justice Department's own work in the Federal Register, which the
  registry already records as public domain, credited to the Government Publishing Office (source 5,
  `federal_register`);
- govinfo's policies page, read today, states: "Title 17, Section 105, United States Code, provides
  that: Copyright protection under this title is not available for any work of the United States
  Government … By virtue of the foregoing, public documents can generally be reprinted without legal
  restriction. However, Government publications may contain copyrighted material which was used with
  permission of the copyright owner." It asks that "customary credit should be given to the Government
  department or agency which prepared the material".

govinfo's robots.txt leaves `/content/` open and states no crawl delay. Its policies page states no rate
limit for its content pages. Its API wants an api.data.gov key; the content pages do not. No key.

**Grounded in:**
- **The list:** 440 grant notices on 1,571 Federal Register pages:
  - 23 to 26 a year in 1995–1998, 10 to 24 a year in the 2000s, 4 to 20 a year in 2010–2021;
  - 87% of the pages fall before 2017.
- **The sample:** 10 notices of 1995, 1997, 1998, 2001, 2005, 2007, 2009, 2014, 2017 and 2019, read on
  govinfo and parsed here: 777 transactions. Four more (1999, 2003, 2011, 2026) are in layouts this probe
  did not parse, and they are left out of every figure.
- **The replay,** today's caption rule and release map under each company's names of the year, with the
  table of taken names:
  - 197 of the 777 transactions name a listed company (25%): 212 matches, 193 company days on 159
    companies, 150 of the matches before 2017;
  - of the 114 whose first price is read here, 107 fall after it. 98 more, on 82 companies, have no first
    price read here;
  - by role, where the layout gives columns: the company acquires in 92, is the acquired person in 65 and
    an acquired entity in 2, and 6 I could not place. 47 are in the 1995–1998 layout, which gives no
    columns;
  - in 8 of the 193, a person buys the company's own voting securities: Timothy D. Cook's Apple shares
    (2014-07-25), Edward S. Lampert's AutoNation (2014-07-25), Dr. Phillip Frost's OPKO (2007, 2009),
    Stephen J. Luczo's Seagate (2005).
- **The estimate:**
  - the 8 notices parsed whole hold 721 transactions on 23 pages, 31 a page. At that rate the 1,571 pages
    hold about 49,000 transactions;
  - at the sample's 25%, about 12,000 name a listed company. That is about 11,000 company days from first
    prices, about 9,500 of them before 2017;
  - GE, the most frequent in the sample (8 of 777), would have about 500.

  These are estimates from 10 of 440 notices and could be off by a third either way. I say so.
- **Read by hand:** 30 of the 193, drawn at random. 29 are the company's own deal or stake. One I could not
  settle: "Republic Bancorp, Inc." with "Republic Bank & Trust Company" in MBNA's grant of 1997-06-16, on
  RBCAA ("REPUBLIC BANCORP INC /KY/" in the index), may be its own sale or another Republic's.
  Also seen, outside the 30:
  - "AGI Incorporated" (1998) reached AGBK, a record far younger than the grant, whose first price would
    keep it off;
  - "UBS AG" reaches two records, UBS Group's (its bank, through the release map) and UBS AG's own
    (AMUB's notes). The build decides which, as the release rules do.
- **For example,** each from the notices:
  - Microsoft's acquisition of Ensemble Studios, granted 2001-04-20;
  - Johnson & Johnson's of Closure Medical, 2005-05-02, and of Peninsula Pharmaceuticals, 2005-05-06;
  - Cisco's of Topspin Communications, 2005-04-29;
  - Valero's from VeraSun Energy, 2009-04-03;
  - Google's of Dropcam, 2014-07-10; Kroger's of Vitacost.com, 2014-07-25; Stryker's of Small Bone
    Innovations, 2014-07-16;
  - Trian Partners' stake in The Bank of New York Mellon, 2014-07-24, and Starboard Value's in Darden
    Restaurants, 2014-07-17;
  - HCA Healthcare's purchase from Tenet Healthcare, 2017-06-29; American Electric Power's from Sempra
    Energy, 2019-03-08;
  - General Electric's GE Railcar Wheel to ABC Rail Products, 1995-04-21.

**Who benefits and how:** readers of every sector's pages, and above all the acquisitive ones: GE,
Cisco, Johnson & Johnson, Berkshire Hathaway, the banks, the health-care and utility companies. They get
the day the antitrust agencies cleared each deal early. For a target or a company selling a unit, that is
the day the antitrust wait on a pending deal ended. For an activist's stake, it is the day the stake was
cleared. Nearly nine tenths fall before 2017, from 1995, the hole the coverage map names.

**Risk:**
- **Volume on serial acquirers.** GE's estimated 500 rows over 31 years are routine one by one. The row is
  one a company a day, so a day's several GE grants are one row. The call below can halve it.
- **Five table layouts,** and fixed-width columns that wrap names across lines ("Apollo Investment Fund /
  IV, L.P."). The build reads each layout from a committed slice and checks that every transaction
  number in a notice's text is parsed.
- **Not a deal's announcement:** the row says the agencies ended the waiting period early. It does not say
  the deal closed, its value, or that it was announced that day.
- **The grant's day is not the notice's:** the notice prints weeks later (05-10027 of 2005-05-19 lists
  grants of 2005-04-22 to 05-06). The row is on the grant's day and gives the notice's.
- **Hosts:** the Federal Register's own text pages refuse this container (302). govinfo answered all 55
  requests. A build that met a refusal there would keep what it has read and try again the next run.

**One call inside it, for the owner:**
- **Which grants make a row:**
  - (a) every grant that names the company, as acquirer, acquired person or acquired entity, one row a
    company a day (recommended). A person buying the company's own shares (8 of the 193) is labelled as
    such;
  - (b) only where the company is the acquired person or entity: its sale, a unit's sale, a stake in it.
    67 of the 165 matches the columns place, about 40%.

**Cost:** none. 440 govinfo pages once, then one a month.
**Effort:** medium:
- the list, the text reads and the five layouts, with a table and its migration;
- the rule, as EPA's and the CPSC's, and the namesakes read by hand;
- the rows and "Also on" (a migration that builds the index again);
- a committed slice and `check:hsr`;
- the coverage map's, README's and the Sources panel's lines.

**How to check:** a new `check:hsr` on a committed slice of the notices:
- Johnson & Johnson's grant of 2005-05-02 (Closure Medical Corporation) lands on JNJ, and Microsoft's of
  2001-04-20 (Ensemble Studios Corporation) on MSFT;
- HCA Healthcare's of 2017-06-29 with Tenet Healthcare lands on HCA and on THC, each saying "Also on";
- General Electric's of 1995-04-21 lands on GE, read from the 1995–1998 layout;
- every transaction number in the text of the notices of 1995, 1999, 2005, 2014 and 2026 is parsed, one
  notice in each layout;
- a grant of 1998 to "AGI Incorporated" stays off AGBK;
- under (a), Timothy D. Cook's grant of 2014-07-25 is a row on AAPL labelled as a person's purchase of
  its shares.

On main they fail: the source does not exist.

**Depends on:** the owner's approval of a new source. Its text is the Federal Register's, public domain by
the registry's own entry and govinfo's stated notice.

**Buildable by:** a cloud session. govinfo and the Federal Register's API answered every request from here.

*Importance:* high — about 11,000 company days from first prices, about 9,500 before 2017, in every sector
(an estimate from 10 of 440 notices, 777 transactions read) · *Efficiency:* high — 440 pages once; the
caption rule and the units maps exist · *Practicality:* medium — five layouts to parse, and volume on
serial acquirers that the call shapes

---

## 2. The ITC's Section 337 investigations, 1995–2026: import-ban cases the company brought or faces — Kodak v. Apple and RIM, Qualcomm v. Apple, Cisco v. Arista, Paice v. Ford, Fisher & Paykel v. ResMed, Novartis v. Regeneron… · proposed `P1` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — 2026-11-22, "Approve all three (Recommended)", with call (a): a second row on the day of the Commission's final determination, with the exclusion order where it issued one; a settlement or withdrawal a line on the institution row. Filed under Scope refocus; built in batch 167.
**Owner's reason (if rejected):**

**Raised before:** no. No earlier file mentions the International Trade Commission.

**Anchor:** a stated objective with no work behind it, for technology, device, drug and consumer-product
pages. Under section 337 of the Tariff Act the Commission investigates complaints that imports infringe a
patent or trademark. A violation found ends in an exclusion order that bars the products at the border. The
complainant is often a listed company, and so are the respondents: Apple, BlackBerry, Ford, ResMed,
Regeneron, Verizon, Sonos. No source the pages read holds these cases. The Commission's notices name no
company in their titles ("Certain Mobile Electronic Devices; Institution of Investigation"), so the company
feed never kept one.

**What:** an adapter, `lib/itc337.ts`, with a new source key and a table:
- **The read:**
  - the Federal Register API's list of the Commission's institution notices: three searches, 1,136
    notices, 1995-01-19 to 2026-11-16, 655 of them before 2017;
  - each notice's text once from govinfo, about 1,140 requests, about 25 minutes once;
  - then the newest, about four a month (56 in 2026).
- **The parties:** each notice lists them a line each, "(a) The complainant is" and "(b) The respondents
  are the following entities". The summary names the complainant too ("on behalf of Apple Inc. of
  Cupertino, California").
- **The rule:** the caption rule on each party line, under the company's names of the year, the release
  map's units and EPA's and the CPSC's `UNITS` on their days, with the table of taken names and the
  company's first price. Namesakes in `NOT_THE_COMPANY`.
- **The row:** one a company a day, on the notice's day. "ITC instituted an investigation (337-TA-1093) on
  Qualcomm Incorporated's complaint against Apple Inc.: certain mobile electronic devices", on both pages.
  It gives the role, the products as the notice describes them, the investigation number, and the link.
- **"Also on":** Qualcomm and Apple, Cisco and Arista, Novartis and Regeneron are one case on two pages.

**Licence:** a new source, no new terms. The notices are the Commission's own work in the Federal
Register, read from govinfo, as #1 (public domain; govinfo's notice quoted there). No key.

**Grounded in:**
- **The notices:** 1,136 institution notices whose summary names the complainant: 57 of 1995–1999, 17 to
  41 a year in the 2000s, 35 to 66 a year since 2010.
- **Complainants, all 1,136 read** by today's caption rule under each company's names of the year:
  - 233 investigation–company pairs on 128 companies, 228 company days, 131 before 2017;
  - of the 92 whose first price is read here, 90 fall after it, on 47 pages. 141 more, on 80 companies,
    have no first price read here (Ericsson, Nokia, Canon, ResMed, Netlist, Align, Rambus…);
  - by page: Ericsson 9, Apple 8, Microsoft 8, Honeywell 7, Canon 7, Align 6, Broadcom, Nokia, ResMed and
    Netlist 5 each, Intel and Qualcomm 4 each;
  - read by hand, all 233: three are not the company. "Broadcom Corporation" of 2003 and 2005 on AVGO is the
    old Broadcom, whose name AVGO's line took in 2016. AVGO's first price, not read here, decides whether
    they land; its earliest mapped record is Avago Technologies Limited's (`lib/predecessors.ts`). "Amtech
    Systems LLC" of Albuquerque (2020) is not Amtech Systems, Inc., ASYS. Units land as they should:
    Covidien LP on Medtronic (2016), The Gillette Company on P&G (2017), Ethicon on J&J (2019), Graco
    Children's Products on Newell (2011, 2021).
- **Respondents, from 38 notices** spread over 1995–2026, read whole on govinfo (362 respondent lines):
  - 14 investigation–company pairs by the rule:
    - Apple 3 (337-TA-703 of 2010, Kodak's; 337-TA-1093 of 2018, Qualcomm's; 337-TA-1150 of 2019);
    - BlackBerry 2 (2010 as Research In Motion, 2016);
    - one each: STMicroelectronics (2006, SanDisk's), Seagate (2012), Arista (337-TA-945 of 2015,
      Cisco's), Ford (337-TA-1042 of 2017, Paice's), ResMed (337-TA-1136 of 2018), Verizon (2019),
      Regeneron (337-TA-1207 of 2020, Novartis's), Sonos (337-TA-1330 of 2022, Google's) and Fortinet
      (2004);
  - the same 38 notices give 9 complainant pairs, so the respondents add about 1.6 for each complainant
    pair;
  - three more, read by hand, that the rule missed: Sony Corporation (2016, a line with no comma before its
    address), ASM Lithography Holding N.V. (2002, ASML's name then, which this replay does not hold) and
    Amazon.com, Inc. (2019, the ".com" class the 2026-11-11 file noted).
- **The estimate:** about 370 respondent pairs by the rule (1.6 times 233), about 600 investigation–company
  pairs in all before first prices. That is about 500 company days on pages, a little over half before 2017.
  It is an estimate from 14 respondent matches and could be off by half. I say so.
- **The outcomes:** each later notice carries the investigation's number. Of the oldest 1,000 of the 3,386
  Commission notices that mention an exclusion order (1995–2012), 96 are titled as a violation found or an
  exclusion order issued, and 35 as no violation. The rest of the 3,386 were not read.

**Who benefits and how:** readers of technology, semiconductor, telecom, device, drug and consumer-product
pages: Apple, Qualcomm, Intel, Microsoft, Cisco, Arista, Ericsson, Nokia, BlackBerry, Seagate, ResMed,
Medtronic, Regeneron, Novartis, Ford, Crocs, Sonos. They get each import-ban case on its day, from either
side. Qualcomm v. Apple of 2018 sits on both pages, Kodak's 2010 case against Apple and RIM on Apple's and
BlackBerry's. A little over half fall before 2017, from 1995.

**Risk:**
- **The respondents are sampled, not counted.** 14 matches, so the estimate could be off by half.
- **Layout:** some notices run a respondent's name into its address with no comma (Sony's of 2016). The
  build reads the respondents a line each and checks a committed slice.
- **The ".com" class:** "Amazon.com, Inc." reaches no company by the caption rule today. That is a fix
  to the shared rule, for the `code-auditor`, not this adapter.
- **Before 1995:** the Commission's own database (337Info, from 1972) refused this container (the proxy's
  502), and www.usitc.gov answered 403. The Federal Register's API begins in 1994.
- **A complaint is an allegation.** The row says the Commission instituted an investigation. It does not
  say the patent was infringed.

**One call inside it, for the owner:**
- **The outcome:**
  - (a) a second row on the day of the Commission's final determination, violation or not, with the
    exclusion order where it issued one, read from the later notices by the investigation's number
    (recommended). A settlement or withdrawal is a line on the institution row, as the OCC's terminations
    are;
  - (b) the institution row alone.

**Cost:** none. About 1,140 govinfo pages once, then about four a month, and under (a) each case's
determination notice once.
**Effort:** medium:
- the list and the text reads, with a table and its migration;
- the parties' lines and the rule, with namesakes read by hand;
- the rows and "Also on"; under (a), the determination notices;
- a committed slice and `check:itc337`;
- the coverage map's, README's and the Sources panel's lines.

**How to check:** a new `check:itc337` on a committed slice of the notices:
- 337-TA-1093 of 2018-01-08 lands on QCOM as complainant and on AAPL as respondent, each saying "Also on";
- 337-TA-703 of 2010-02-23 (Eastman Kodak Company's) lands on AAPL and on BB as Research In Motion, Ltd.,
  and stays off KODK, before its first price;
- 337-TA-1042 of 2017-03-10 lands on F, and 337-TA-1207 of 2020-07-27 on NVS and REGN;
- "Sony Corporation 1-7-1 Konan" (337-TA-994 of 2016) lands on SONY under its EDGAR name of 2016, read a
  line at a time;
- "Amtech Systems LLC" of 2020 stays off ASYS;
- under (a), a case with a final determination has its second row on that day.

On main they fail: the source does not exist.

**Depends on:** the owner's approval of a new source. Its text is the Federal Register's, public domain.
It shares #1's text read; built second, it reuses #1's govinfo fetch.

**Buildable by:** a cloud session. govinfo and the Federal Register's API answered every request from here.

*Importance:* medium-high — 228 complainant company days measured on all 1,136 notices, about 500 company
days with the respondents (an estimate), a little over half before 2017 · *Efficiency:* medium-high — one
text read a notice, the parties a line each · *Practicality:* medium — respondents sampled; before 1995 out
of reach; the outcomes need a second read

---

## 3. The FDA's own press releases and talk papers, 1962–2014: recalls, withdrawals, seizures and approvals in the FDA's words — Lilly's Ilosone (1979) and Oraflex (1982), GE's sunlamps (1977), P&G's "fresh" orange juice (1991), Abbott's Omniflox (1992), Pfizer's Bextra (2005)… · proposed `P2` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — 2026-11-22, "Approve all three (Recommended)", with call (a): a release on a day the page holds the company's approval adds its words to that row and makes none of its own. Filed under Scope refocus; built in batch 169.
**Owner's reason (if rejected):**

**Raised before:** no. No earlier file mentions openFDA's historical documents.

**Anchor:** the 1963–2017 hole, before EDGAR above all, for drug, device, food and consumer-product
makers. The FDA's held sources begin late: new-drug approvals in 1985, device recalls in 2000, enforcement
reports in mid-2012, warning letters in 2021. openFDA publishes the FDA's own press releases and talk papers
from 1913 to 2014 as one file, OCR text, and no adapter reads it.

**What:** an adapter, `lib/fdaHistory.ts`, with a new source key:
- **The read:** openFDA's `other/historicaldocument` file, one keyless zip of 13,869,827 bytes, read once
  and committed, as the OTS archive was. It ends in 2014, so it is closed in practice.
- **The day:** the file gives a year only. The release's own text gives the day, as in "FOR IMMEDIATE
  RELEASE … April 26, 1993", read from its head. A document whose head gives no day of its own year makes
  no row.
- **The rule:** a new one for prose. The company's name is matched in either of two forms:
  - with its legal form ("Eli Lilly and Company", "Abbott Laboratories, Inc."), or
  - as its whole name of two words or more, printed capitalised ("Procter & Gamble").

  It is matched under the company's names of the year and the release map's units, and then put through
  the caption rule's guards (a name two listed companies share, a longer listed name). The table of taken
  names and the first price apply.
- **What makes a row:** a document naming at most two listed companies. A list of many firms (the
  pharmacies of a 1999 campaign, a 1969 table of drug makers) names none.
- **The row:** the document's first line or headline, the day, the kind (press release or talk paper),
  and a link to openFDA's record.

**Licence:** openFDA's terms, the repository's own record, read 2026-11-11 for source 40
(`fda_device_recalls`): "unless otherwise noted, the content, data, documentation, code, and related
materials on openFDA is public domain and made available with a Creative Commons CC0 1.0 Universal
dedication… You can copy, modify, distribute and perform the work, even for commercial purposes, all without
asking permission." The file's own header points to the same licence and adds: "Do not rely on openFDA to
make decisions regarding medical care. While we make every effort to ensure that data is accurate, you
should assume all results are unvalidated." No key. One read, well inside the 1,000 a day openFDA allows
without one.

**Grounded in:**
- **The file:** 8,858 documents, 6,748 press releases and 2,110 talk papers, 1913 to 2014. 7,085 are of
  1962 on, and the head of the text gives a day of the document's own year for 6,178 of them (87%).
- **The replay,** the company's names of the year from the repository's functions, the name printed
  capitalised:
  - 566 document–company pairs on 114 companies; from first prices, 397 on 43 pages, as 392 company days.
    All fall before 2017; 125 before 1993, and 55 before 1985, the year of the first approval the pages
    hold;
  - by decade from first prices: the 1960s 10, the 1970s 21, the 1980s 75, the 1990s 71, the 2000s 128,
    2010–2014 92;
  - by page: Lilly 64, Pfizer 49, Abbott 48, Merck 37 (Merck Sharp & Dohme through the release map, and
    Schering-Plough's own past, labelled), Johnson & Johnson 29, P&G 22, Novartis 22, Amgen 14, Gilead 11,
    Sanofi 11, GE 9, Medtronic 9.
- **Read by hand:** 40 of the 397, drawn at random:
  - 27 are about the company itself: an approval, a recall, a withdrawal, a seizure, an investigation;
  - 11 name it in a list of several firms (a 1969 table of drug makers, the makers of the drugs a 2010
    safety notice covers, the 13 companies of a 2014 program);
  - 2 are namesakes: the FDA's "Innovative Food Defense" grants (2008, 2009) on IVFH.
- **With the row rule** (a document naming at most two listed companies, IVFH's namesakes out): 368 company
  days on 40 pages, 112 before 1993, 47 before 1985. A second draw of 30 of those: 22 about the company, 6
  lists, 1 namesake ("Global Technologies, LLC", 2012, on GTLL) and 1 unclear (a subsidiary of Pfizer's in
  a U.S. Attorney's release of 2010).
- **What pages hold already:** 160 of the 397 fall within three days of a new-drug approval of any company.
  That is a bound on how many repeat a held approval, not a count.
- **Not counted, so the figures are a floor:**
  - a units list: the 24 documents naming McNeil's Tylenol, 18 of them before 1993, reach J&J once;
  - "Bristol-Myers", BMY's own name before 1989: 39 documents before 1993. It is a name older than EDGAR's,
    so your default leaves it out.
- **For example,** each from the file:
  - Lilly: the talk paper of 1979-08-30 on the FDA's request that Dista Products Company, "a division of
    Eli Lilly and Company", take the antibiotic Ilosone off the market; a talk paper and a release of
    1982-08-05 on the FDA's investigation of Eli Lilly, the release naming Oraflex;
  - GE: 5,300 microwave ovens to be corrected (1975-05-30), 14,000 sunlamp kits recalled (1977-05-03);
  - Procter & Gamble, warned over "fresh" on its orange juice (1991-04-24);
  - Abbott recalling Omniflox (1992-06-05), and agreeing to withdraw Meridia (2010-10-08);
  - Pfizer, asked to withdraw Bextra (2005-04-07).

**Who benefits and how:** readers of the drug, device, food and household-product pages: Lilly, Pfizer,
Abbott, Merck, Johnson & Johnson, P&G, Novartis, Amgen, GE. They get the FDA's own announcements on their
days, from the 1960s, where these pages hold little before EDGAR but dividends and splits. About a third
fall before 1993.

**Risk:**
- **OCR text.** Names come misread ("Mancplax", "lndianapolis") and some documents have no legible day.
  A row quotes the document's own line; it is never rewritten.
- **A new kind of rule.** Every other source reads a caption, a title or a firm field. A name in prose is
  weaker: two thirds to three quarters of the draws above are about the company. The build reads every
  kept row by hand once (about 370), as batch 100 read every CPSC firm.
- **Talk papers** were written for FDA staff answering questions, not for release. The row says which it
  is.
- **Repeats:** a release of an approval day repeats the approval row. The call below settles it.

**One call inside it, for the owner:**
- **A release on a day the page already holds the company's approval:**
  - (a) it adds the FDA's words to that approval's row, as the CPSC's injury statements were added (batch
    136), and makes no row of its own (recommended);
  - (b) its own row.

**Cost:** none. One 13 MB file once, committed slim (a few MB, an estimate).
**Effort:** small-medium:
- the sync script and the committed file;
- the prose rule, the day from the text, and the two-company rule;
- every kept row read by hand once, and the namesakes;
- the rows, `check:fda-history` on a committed slice, and the coverage map's, README's and the Sources
  panel's lines.

**How to check:** a new `check:fda-history` on a committed slice of the file:
- the talk paper of 1979-08-30 on Ilosone lands on LLY, dated from its text;
- the release of 1977-05-03 (sunlamp kits) lands on GE, and that of 1991-04-24 on PG;
- "Innovative Food Defense" (2009-10-09) stays off IVFH;
- a document of 1999-09-30 listing dozens of pharmacies makes no row on KR or COST;
- a document whose head gives no day of its own year makes no row;
- under (a), a release on the day of one of the company's approvals is a line on that row.

On main they fail: the source does not exist.

**Depends on:** the owner's approval of a new source. Its licence is openFDA's, already recorded in the
registry for openFDA's other files.

**Buildable by:** a cloud session. download.open.fda.gov answered from here.

*Importance:* medium — about 370 company days on 40 pages, all before 2017, 112 before 1993 (measured on
the whole file) · *Efficiency:* very high — one keyless file · *Practicality:* medium-low — OCR text and a
prose rule, so every kept row is read by hand once

---

## Considered and cut

- **The FDA's complete response letters (measured; cut, small and recent).**
  - **The file:** openFDA's `transparency/crl`, one keyless zip of 1,078,050 bytes. It holds 466 letters,
    2002-03-15 to 2026-11-13: 312 for products later approved, 154 not.
  - **On pages:** the caption rule ties 100 letters to 59 companies. 47 on 21 pages fall after first prices
    where read; 51 on 37 companies have none read. Only 12 fall before 2017: Bristol-Myers Squibb 2012,
    Merck 2013, Amgen 2015, Teva, Sandoz on Novartis and United Therapeutics 2016 among them.
  - **Wrong owners, kept off by first prices:** "Organon, Inc." of 2002 and 2004 on OGN, and "3M Health
    Care" of 2016–2017 on SOLV.
  - **Why cut:** no depth. It is a cheap follow-on, one file a week, if you want the FDA's own letters
    declining to approve an application, on the drug makers' pages.
- **Commerce's anti-dumping and countervailing-duty petitions (measured from the API's excerpts; cut).**
  - **The notices:** 661 initiation notices of 1995–2026 whose excerpt names the petitioner.
  - **On pages:** 100 matches on 33 companies: Nucor 18, Steel Dynamics 14, ADM 6, Worthington 6,
    Carpenter 5, Whirlpool 5.
  - **Why cut:**
    - a petition makes one notice for each product and country, so the company days are fewer;
    - many petitioners are coalitions ("the Rebar Trade Action Coalition") that name no company;
    - "National Steel Corporation", one of the steelmakers in Bethlehem Steel's group petitions of
      1998–2001, reaches SID eight times: the namesake `lib/secCases.ts` already refuses.

    A follow-on to #2 if you want trade cases from the domestic side.
- **The ITC's own database, 337Info, from 1972 (not reachable).** pubapps2.usitc.gov failed through the proxy
  (502), and www.usitc.gov answered 403 (Akamai). #2 starts in 1995 for that reason.
- **The FDA's advisory committee meetings (measured on the list only; cut).** 448 FDA notices hold both
  "advisory committee" and "submitted by", 288 of them meeting notices, 279 of those from 2011. The sponsor is
  in the body and the vote is in the FDA's minutes, not the notice. Not measured on companies.
- **The Supreme Court's decisions in the company's own cases (not reachable).**
  - The Library of Congress's U.S. Reports collection answered a Cloudflare challenge (429) to its API,
    after its robots.txt's 5 s crawl delay was honoured.
  - The Caselaw Access Project's static.case.law states `Disallow: /` for every agent.
  - CourtListener was not tried.
- **The FDIC's enforcement orders (not reachable).** orders.fdic.gov failed certificate verification from
  here ("unable to get local issuer certificate"). It was not retried, and verification was not turned off.
- **NTSB aviation accidents (not measured again).** The airlines' first prices in the fixtures are Delta
  2007-05-03, United 2006-02-06 and American 2005-09-27, so their older accidents would reach no page.
  Southwest and Alaska begin in 1980. The 2026-11-15 file's notes on the Access files and the 2027 API stand.
- **BOEM's offshore lease data (seen, not measured).** The data center answers and its robots.txt names only
  other agents. Its leasing page offers lease, owner and company files, and no file of bids was seen.
- **The Federal Register's own document text (refused).** Its text pages answered 302 to
  `unblock.federalregister.gov` for all 20 asked. #1 and #2 read govinfo's copy instead.
- **Not retried, nothing having changed:** the FTC's site, FSIS, PHMSA, FERC, the NRC, GAO, the NTSB's Access
  files, OFAC, TARP, USAspending, the FDIC's failed-bank list, the CPSC's civil penalties, the FCC,
  www.dol.gov, BIS and the FAA.
- **Owner decisions and tracked waits, not raised:** listed in the header.
- **Re-prioritisations:** none proposed.
- **Anything touching another product:** nothing here reads, references or connects to another product's
  repository.

*One closing note, not a proposal* — noticed in passing. Old Broadcom Corporation's name has no entry in
`lib/takenNames.ts`, though AVGO's line took it in February 2016 (Avago Technologies Limited to 2016-02-02 in
`lib/predecessors.ts`). Today's TAA replay puts
TA-W-82,946 of 2013-09-09 ("Broadcom Corporation", Irvine) on AVGO from any first price before that day; I
did not read AVGO's. The `code-auditor` may want it.
