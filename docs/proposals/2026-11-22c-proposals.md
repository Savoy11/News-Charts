# Opportunity proposals — 2026-11-22 (third run)

**Commit:** 851eb588b5344af853ae15b34eac4fd8a1aa8818 (`origin/main` after batch 175) · **Reviewed:** `CLAUDE.md`; `README.md` (intro, the EU merger notifications' section, "Sources evaluated and rejected"); `docs/COVERAGE-MAP.md` ("The gaps worth knowing about"); `docs/OWNER-ACTIONS.md` (the ruling on federal works); `docs/MASTER-CHECKLIST.md` (the ledgers of batches 173–175); `docs/audits/2026-11-22-code-audit-b170-174.md` whole; `docs/audits/nc-task-queue-2026-09-28.json` (NC-074); `docs/proposals/2026-11-22b-proposals.md` whole, the "Considered and cut" lists of 2026-11-22, 2026-11-18, 2026-11-15 and 2026-11-11b, the notes on non-US regulators of 2026-11-09 and 2026-11-11, and every proposal file's titles back to 2026-07-30; code: `lib/euMergers.ts` (header, `noticeQuery`, `NOT_THE_COMPANY`, `euPartyIsCompany`), `scripts/sync-eu-mergers.ts` (how CELLAR is asked), `scripts/check-eu-mergers.ts` (its replay of every company), `lib/hsrEarly.ts` (`partyIsCompany`), `lib/ingest/store.ts` (sources 45 and 46, govinfo's notice), `data/company-aliases.json`, `data/edgar-tickers.json` · **Proposals:** 3

> - **No rejection log exists** (`docs/audits/rejected-proposals.md`), and nothing has been rejected. All three
>   proposals of 2026-11-22b are approved and built (batch 172, the FDA's 510(k) clearances; batch 173, the Fed's
>   H.2 actions; batch 174, the EU merger notifications), and batch 175 fixed their audit. Nothing was deferred and
>   nothing carries forward.
> - **Settled, not raised again:** batch 175's fixes, SLFPY's day among them; the ruling that a federal agency's own
>   work is usable where its site states no licence.
> - **Defaults still yours to change, not raised:** the Digest's first-price floor and its names older than EDGAR's;
>   widening `MANY_PARTIES`; "Drugs whose holder changed". NC-074 (whether international coverage is in scope) is
>   still open; #2 and #3 depend on it.
> - **What is new:** three sources no adapter reads.
>   - The Supreme Court's decisions (#1), from the U.S. Reports on govinfo, the host of two held sources, and the
>     Court's own term lists. The 2026-11-22 file cut this as not reachable; govinfo's copy is.
>   - The European Commission's antitrust and cartel decisions (#2), from the endpoint and document store batch 174
>     reads. The 2026-11-11 file left them unmeasured for want of "an official bulk copy, if one exists".
>   - The EU courts' judgments in the company's own cases (#3), from the same endpoint.
> - **"Stored but never surfaced":** not swept again. `event_enrichments` is still written by no code.
> - **Saved data used instead of the network:**
>   - the first trading days of 954 tickers from the committed fixtures (`digest-1985-entries`, `eeoc-listing`,
>     `fda-device-recalls`, `occ-actions`), as `check:eu-mergers` reads them;
>   - the ticker index, the alias file and the release map's units, through the repository's own functions
>     (`partyIsCompany`, `companyNames`, `namesForYear`, `newsNamesFor`, `possessiveNameFor`, `dojPossessive`,
>     `releaseNamesOn`, `andSpellings`, `withoutTag`).
>
>   EDGAR's former names were not used: ingest reads them from the database, and no request went to the SEC. So
>   every replay below is under present names, and what they miss was read by hand and is counted separately.
>   Each download was read as data, with `python3 -I`, `pdftotext` or the functions above. The probes are in the
>   session scratchpad (`scout176/`). The downloads are under `/var/tmp/scout176/`, one directory each.
> - **Measured live on 2026-11-22 from this container.** Every figure below is measured unless it says it is an
>   estimate. Requests, by host:
>   - publications.europa.eu 94: robots.txt, 12 SPARQL queries, 80 decision texts from CELLAR (two answered 404) and
>     one Official Journal notice of a judgment (#2, #3);
>   - op.europa.eu 3: robots.txt, the legal notices and the copyright notice (#2, #3);
>   - www.govinfo.gov 30: robots.txt, the U.S. Reports' sitemap index and two yearly sitemaps, 21 volumes' records, two
>     case records (the first answered 503, "Please Retry later in 15 Seconds"; asked again 25 s later), one case's
>     PDF, the collection's help page and the policies page (#1);
>   - www.supremecourt.gov 10: robots.txt, eight terms' slip-opinion lists, and one policies address that served an
>     error page (#1);
>   - curia.europa.eu 3: robots.txt, the home page and the copyright page (#3);
>   - eur-lex.europa.eu 2: robots.txt and the legal notice, both answered 202 with `x-amzn-waf-action: challenge` and
>     no body (not worked around);
>   - fraser.stlouisfed.org 3: robots.txt, no answer each time (cut);
>   - www.courtlistener.com 1: robots.txt, 403 from CloudFront (cut).
>
>   That is 146 requests: 137 answered 200, two 202, two 404, one 403, one 503 and three no answer. Each carried the
>   User-Agent `News Charts Research`, with no email address. They ran one at a time, each at least 1.6 s after the
>   one before ended; govinfo's after its 503 at least 3 s apart, and the Court's at least 2 s (its robots.txt asks
>   1 s). EUR-Lex's second request came 12 s after its first. No request went to www.nlrb.gov, www.sec.gov,
>   data.sec.gov or efts.sec.gov. Postgres was not used and the app was not run. The log is
>   `/var/tmp/scout176/requests.log`.
> - **Nothing here needs a key, a paid tier or a recurring charge.** #1 reads 218 volume records and an estimated
>   1,000 to 2,500 case PDFs once, then a volume or two a year and a term list weekly in term. #2 reads about 700
>   texts once. #3 reads about 75 SPARQL lists and about 350 notices once. Each then asks a few a month.
> - Ranked by importance, securities depth first:
>   1. the Supreme Court's decisions in the company's own cases, 1962–2026: few a page, each a landmark, most of them
>      in the thin stretch;
>   2. the European Commission's antitrust and cartel decisions addressed to the company, 1973–2026, and its State aid
>      decisions naming it: three in four before 2017;
>   3. the EU courts' judgments in the company's own cases: largely the appeals of #2 and of batch 174's merger bans.

Mark each proposal below: `APPROVED`, `REJECTED`, or `DEFERRED`, and add a
reason for anything rejected. Then run the scout in FILE mode.

---

## 1. The Supreme Court's decisions in the company's own cases, 1962–2026: GE v. Gilbert (1976), Ford v. EEOC (1982), Carnival Cruise Lines v. Shute (1991), Wal-Mart v. Samara Brothers (2000), Comcast v. Behrend (2013), Apple v. Pepper (2019), Google v. Oracle (2021)… · proposed `P1` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — 2026-11-22, "#1 Supreme Court (Recommended), #2 EU antitrust and State aid, #3 EU court rulings" and "Use the defaults (Recommended)", with call (a): the U.S. Reports to volume 586 and the Court's slip lists from the 2018 term, every decision naming the company as a party, per curiam dispositions and in-chambers opinions included, each on its decided day. Filed under Scope refocus; built in batch 176.
**Owner's reason (if rejected):**

**Raised before:** yes, and cut as not reachable on 2026-11-22: the Library of Congress's U.S. Reports answered a
Cloudflare challenge (429), the Caselaw Access Project's static site disallows every agent, and CourtListener was not
tried. The 2026-11-22b file kept it on the cut list. What changed: govinfo, the Government Publishing Office's site
that sources 45 and 46 already read, holds the U.S. Reports as its own collection (`USREPORTS`), and it answered here.
CourtListener was tried today: 403.

**Anchor:** the thin stretch. The coverage map calls 1963–2017 "the single biggest hole in the corpus", and before
EDGAR "a company's page holds little but Yahoo's dividends and splits". A decision of the Supreme Court in a company's
own case is among the most material legal events a page can hold, and no adapter reads the Court.

**What:** an adapter, `lib/supremeCourt.ts`, with a new source key and a committed file:
- **The volumes:** govinfo's record of each U.S. Reports volume (`/metadata/pkg/USREPORTS-<n>/mods.xml`) lists every
  case in it, its title ("Comcast Corp. v. Behrend, 569 U.S. 27 (2013)"), its decision day for most, and its PDF. The
  newest volume govinfo lists is 586, in its 2026 sitemap; volume 585 holds the 2017 term's last cases (June 2018).
  Volumes 369–586 cover 1962 on, the earliest first prices Yahoo gives.
- **The day and the caption:** 271 of the 943 cases sampled carry no decision day in the volume's record, most of them
  the older volumes' per curiam dispositions and every case of volume 585. A case's own record gives a placeholder
  (`1967-01-01` for 389 U.S. 49). Its PDF gives the day and the full caption on its first page ("UNITED STATES v.
  ALUMINUM CO. OF AMERICA et al. … Decided October 23, 1967. Vacated and remanded."). The build reads the PDF of each
  candidate case once.
- **After the volumes:** the Court's slip-opinion list for each term (`supremecourt.gov/opinions/slipopinion/<yy>`),
  one page a term with the day, docket number and case name, from the 2018 term on (call (a)).
- **The rule:** the merger notices' (`partyIsCompany`) on each party of the caption, under the company's names of the
  year, the release map's and EPA's and the CPSC's units, the taken names and the first price. Two additions:
  - **a legal word or a whole name of two words or more,** never a one-word everyday name alone. The sample's five
    namesakes are all persons: Parker Seal Co. v. Cummins (1976), Pearson v. Dodd (1977), United States v. Woodward
    (1985), Parsons v. Buckley (1965) and Vale v. Louisiana (1970); the slip lists' three are Box, Mckesson (2020) and
    Harrow;
  - **the Reports' abbreviations** read as words ("R. Co.", "Elec.", "Int'l", "Ins.", "Cal.", "U. S. Steel"), and
    every company's matched captions read by hand once, as batch 174 read every EU party.
- **The row:** one a company a day: "The Supreme Court decided Comcast Corp. v. Behrend, 569 U.S. 27 (2013): Reversed"
  with the company's side (petitioner, respondent, appellant…), the disposition the syllabus prints, and the PDF,
  linked. No holding is summarised. A case of two listed companies ("Travelers Casualty & Surety Co. of America v.
  Pacific Gas & Elec. Co.", "Amgen Inc. v. Sanofi") is on both pages, saying "Also on" (a migration).

**Licence:**
- **govinfo:** its policies page, read today (`www.govinfo.gov/about/policies`), as the registry records for sources 45
  and 46: "Copyright protection under this title is not available for any work of the United States Government … By
  virtue of the foregoing, public documents can generally be reprinted without legal restriction." It asks that
  "customary credit should be given to the Government department or agency which prepared the material". Its
  robots.txt leaves `/metadata/` and `/content/` open. No key.
- **The Court's own site,** for the slip lists: robots.txt allows `/opinions/` with a 1 s crawl delay. Its terms were
  not read: the policies address tried served an error page. The opinions are the Court's own work, but your ruling of
  2026-11-12 speaks of an agency; under call (a) the build reads the site's terms first and quotes them.

**Grounded in:**
- **The sample:** 21 volumes, one about every ten (369, 379 … 569, 585), 943 cases, 1962–2018.
- **The replay,** every company in the index under its present names:
  - 28 company cases: 22 the company's own, 5 the persons above, and 1 old General Motors' (General Motors Corp. v.
    Tracy, 1997), which GM's 2009 record is not and its first price keeps off;
  - 20 more read by hand, which present names miss: former names (Wal-Mart Stores, Inc.; Rockwell Int'l Corp.;
    Standard Oil Co. of Cal. on Chevron, 1970 and 1976; Aluminum Co. of America on AA, 1967), units (Union Pacific R.
    Co., 1978; Norfolk & Western R. Co., 1991; Shell Oil Co., 1997; Allstate Ins. Co., 2010; Wisconsin Central Ltd. on
    CN and WesternGeco on SLB, 2018) and abbreviations (Pacific Gas & Elec. Co., 2007). Three more, U.S. Steel's of 1964
    and 1977 and Brooke Group's of 1993, are companies the committed index no longer holds;
  - **42 company cases in 21 volumes,** about 2 a volume: about 440 over volumes 369–586 (an estimate; it could be off
    by a third). 38 of the 42 fall before 2017 and 13 before 1994;
  - **first prices:** the fixtures carry 33 of the 42's tickers, and 30 fall after them. ITT's of 1975, Union Pacific's
    of 1978 and United Air Lines' of 1964 fall before.
- **The slip lists,** 529 opinions of the 2018 to 2025 terms (to 2026-06-23): 45 company cases by the rule, 3 of them
  persons the legal-word rule refuses, so 42; and 17 more by hand (Merck Sharp & Dohme, Teva Pharmaceuticals USA,
  BNSF R. Co., Oracle America twice, GE Energy Power Conversion, U. S. Bank, Slack Technologies on Salesforce,
  Supervalu on UNFI, Wisconsin Bell on AT&T, Sony Music…): **59 in eight terms.**
- **About 500 company days in all** (an estimate), about four in five before 2017 and one in four before 1994.
- **For example,** each from the sample:
  - United States v. Aluminum Co. of America (1967-10-23), Standard Oil Co. of Cal. v. United States (1976), General
    Electric Co. v. Gilbert (1976-12-07), Brunswick Corp. v. Pueblo Bowl-o-Mat (1977), New York Times Co. v. Jascalevich
    (1978), Ford Motor Co. v. EEOC (1982-06-28), International Paper Co. v. Ouellette (1987), Carnival Cruise Lines v.
    Shute (1991);
  - Caterpillar Inc. v. Lewis (1996), Free v. Abbott Laboratories (2000), Geier v. American Honda Motor Co. (2000),
    Nike, Inc. v. Kasky (2003), Weyerhaeuser Co. v. Ross-Simmons (2007), Merck & Co. v. Reynolds (2010), Hertz Corp. v.
    Friend (2010), Comcast Corp. v. Behrend (2013-03-27), Association for Molecular Pathology v. Myriad Genetics (2013);
  - South Dakota v. Wayfair (2018), Ohio v. American Express Co. (2018), Apple Inc. v. Pepper (2019-05-13), Google LLC
    v. Oracle America (2021-04-05), Goldman Sachs Group v. Arkansas Teacher Retirement System (2021), Starbucks Corp. v.
    McKinney (2024), Exxon Mobil Corp. v. Corporación Cimex (2026).

**Who benefits and how:** readers of the oldest large companies' pages, which hold least before EDGAR: the railroads
(Union Pacific, Norfolk Southern, CN, BNSF on Berkshire), oil (Chevron, BP, Shell, Exxon), Ford, Honda, GE, the
utilities (Duke, PPL, PG&E), International Paper, Weyerhaeuser, Caterpillar. They get the day the Court decided each of
the company's cases, from 1962. The consumer and technology pages get the cases that set law on them (Wal-Mart, Comcast,
American Express, Apple, Google, Facebook). Few a page, each a landmark: I cannot size the traffic, but no other source
here carries the Court.

**Risk:**
- **An estimate from 21 volumes.** It could be off by a third.
- **Names are the work:** 20 of the 42 came only by hand, from former names, units and the Reports' abbreviations.
  Ingest's former names take some; the rest is a names list read once.
- **Persons and the companies they share a name with:** the legal-word rule keeps them off. A company named by one
  word and no legal form ("FCC v. AT&T") is read by hand.
- **A parent and its listed unit:** "Entergy Louisiana, Inc." went to Entergy Corp. by the rule; Entergy Louisiana has
  its own record (ELC). The build reads such pairs as batch 172 did.
- **The OCR's typos** ("Firesone Tire", "Entergy Loisiana") are read as printed; a caption the rule cannot read is
  listed, never guessed.
- **govinfo's pace:** it answered 503 to the 17th request in a row at 1.6 s, and took the next 30 at 3 s.

**One call inside it, for the owner:**
- **How far it reaches:**
  - (a) the U.S. Reports to volume 586 and the Court's slip lists from the 2018 term, the overlap read once, every
    decision in which the company is a named party, per curiam dispositions and in-chambers opinions included, each
    on its decided day (recommended): about 500;
  - (b) the U.S. Reports only: about 440, and no second host;
  - (c) as (a), argued cases with a full opinion only: 2 of the sample's 42 (a per curiam vacatur and an in-chambers
    opinion) fall out.

**Cost:** none. About 218 volume records once and the candidates' PDFs, an estimated 1,000 to 2,500 at 3 s (one to
two hours), then a volume or two a year; under (a), eight term lists once and the current term's weekly.
**Effort:** medium:
- the volumes, the PDFs' day, caption and disposition;
- the abbreviations, the legal-word rule and the names read by hand;
- the rows and "Also on" (a migration);
- a committed slice and `check:supreme-court`;
- the coverage map's, README's and the Sources panel's lines.

**How to check:** a new `check:supreme-court` on a committed slice of volume records and PDFs' first pages:
- Comcast Corp. v. Behrend, 569 U.S. 27 (2013-03-27), lands on CMCSA, and General Electric Co. v. Gilbert, 429 U.S. 125
  (1976-12-07), on GE;
- United States v. Aluminum Co. of America, 389 U.S. 49, undated in its volume's record, is dated 1967-10-23 from its
  PDF and lands on AA, "Vacated and remanded";
- Travelers Casualty & Surety Co. of America v. Pacific Gas & Elec. Co., 549 U.S. 443 (2007), lands on TRV and on
  PG&E's page, each saying "Also on";
- Parker Seal Co. v. Cummins, Pearson v. Dodd, United States v. Woodward, Parsons v. Buckley and Vale v. Louisiana stay
  off CMI, PSO, WWD, PSN and VALE;
- General Motors Corp. v. Tracy (1997) stays off GM;
- under (a), Google LLC v. Oracle America, Inc. (2021-04-05) lands on GOOGL and ORCL from the 2020 term's list.

On main they fail: the source does not exist.

**Depends on:** the owner's approval of a new source on a host whose notice the registry already records; under (a),
the Court's site terms read.

**Buildable by:** a cloud session. www.govinfo.gov and www.supremecourt.gov answered from here; `pdftotext` is
installed.

*Importance:* high — about 500 company days (an estimate from 21 volumes and eight terms, 42 and 59 cases read by
hand), four in five before 2017, each a decision of the Court in the company's own case · *Efficiency:* high — one record
a volume, one page a term, no key · *Practicality:* medium — nearly half the names come by hand, and older cases need their
PDF for the day

---

## 2. The European Commission's antitrust and cartel decisions, 1973–2026: the decisions addressed to the company — Ford-Werke (1983), GlaxoSmithKline (2001), AstraZeneca (2005), the switchgear cartel on ABB, Alstom and Hitachi (2007), MasterCard (2007), Teva in Servier's case (2014), Google Shopping (2017) — and the State aid decisions naming it: Starbucks (2015), Apple (2016), Amazon (2017)… · proposed `P2` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — 2026-11-22, "#1 Supreme Court (Recommended), #2 EU antitrust and State aid, #3 EU court rulings" and "Use the defaults (Recommended)", with call (a): State aid included where the company is the beneficiary. The approval also settles NC-074 for regulation: international coverage is in scope. Filed under Scope refocus; to be built in batch 177.
**Owner's reason (if rejected):**

**Raised before:** yes, unmeasured. The 2026-11-09 file listed "the European Commission's competition decisions" as
not measured. The 2026-11-11 file found the Commission's case search keyed and asked for "a measured note from an
official bulk copy, if one exists". What changed: batch 174 proved the Official Journal's route, the Publications
Office's SPARQL endpoint and its document store, CELLAR; the decisions are printed there, and are measured here.

**Anchor:** the coverage map's gap, "Nothing here reaches non-US regulation but the European Commission's merger
notifications (batch 174)", and NC-074, still open. Pages hold the Commission's view of a company's deals, never of its
conduct: no fine, no commitments decision, no cartel.

**What:** an adapter, `lib/euAntitrust.ts`, with a new source key and a committed file:
- **The list:** the endpoint asked for the Official Journal's English titles of decisions "relating to a proceeding"
  (and the older wordings "relating to proceedings", "relating to a procedure"): 863 works under the first, 1973–2026;
  811 once judgments, orders, drafts, corrigenda, amendments and the 13 merger decisions are set aside; **662 distinct
  decisions** by day and case number, as the older ones are listed twice (the Official Journal's page and its scan).
  The other wordings add some more; about 700 in all (an estimate). 560 of the 662 fall before 2017 and 282 before
  1994.
- **The text:** each decision once from CELLAR, as batch 174 reads it (XHTML, HTML, or the PDF with pdftotext). Titles
  name a cartel by its product ("Marine Hoses", "Chloroprene Rubber"), so every decision's text is read.
- **The addressees:** the decision's own list, in four forms seen here: "This Decision is addressed to: 1. … 2. …" with
  addresses (to 2003), an annex list, the summaries' "addressed to the following legal entities" (since 2003), and the
  fines' list. A company the text names but the decision is not addressed to makes no row.
- **The rule:** the merger notices' (`partyIsCompany`) on each addressee's full name, its namesakes in this source's
  `NOT_THE_COMPANY`, and the units listed companies held then (Ford-Werke AG, BP Chemicals International, Philips
  Lighting Holding, Midland Bank under HSBC, John Deere Ltd), each day read from a filing where EDGAR holds one and
  otherwise dated as batch 172 dated the recall map's units before 1993.
- **The row:** one a company a day: "The European Commission's decision in Case AT.39740 (Google Search (Shopping))
  was addressed to Alphabet Inc. and Google Inc." with the kind (infringement and fine, commitments, exemption,
  negative clearance), the fine the text states as a number, and the decision, linked. A cartel's other listed
  addressees say "Also on" (a migration).
- **State aid, under call (a):** the Commission's notices opening a formal investigation and its final decisions whose
  title or text names the company as the beneficiary ("Alleged aid to Apple", "implemented by Ireland to Apple"), each
  on its day. The member state is the addressee, so the row says the company is the beneficiary.

**Licence:** EUR-Lex's legal notice, as the registry records it for source 50 (read 2026-11-22 for batch 174): "©
European Union, 1998-2026. The Commission's document reuse policy is based on Decision 2011/833/EU. Unless otherwise
specified, you can re-use the legal documents published in EUR-Lex for commercial or non-commercial purposes." The
credit reads "© European Union, https://eur-lex.europa.eu". EUR-Lex refused both requests today (a firewall
challenge), so the wording is the registry's, not re-read. The Publications Office's own copyright notice, read today
(op.europa.eu): its editorial content is "licensed under the Creative Commons Attribution 4.0 International licence";
for its publications, "please check their respective copyright notices". Its robots.txt allows the endpoint and CELLAR
and sets no delay. No key.

**Grounded in:**
- **The sample:** 80 decisions drawn at random, 40 and 40; 78 texts served (two older scans have no English file), one
  the EFTA Surveillance Authority's and set aside. 77 read.
- **The replay,** every company in the index under its present names, on the addressee passages:
  - 28 company decisions: 20 addressees; 4 words my rough split cut from prose ("the gravity", "innovate"); 3
    companies the text names but the decision is not addressed to (Apple in Penguin's e-books decision of 2013, Visa in
    MasterCard's of 2007, Daimler as a customer in Closure Systems of 2020); and 1 an old record's, The Dow Chemical
    Company of 2007, which Dow Inc.'s record of 2019 is not;
  - 11 more read by hand: units (Ford Werke AG 1983, BP Chemicals International 1988, Philips Lighting Holding 1994,
    Midland Bank plc on HSBC 1999), former names (UCAR International on GrafTech 2001, GlaxoSmithkline PLC 2001) and
    names the split missed (Mueller Industries 2004, AstraZeneca 2005, E.ON 2008, Bank of America and UBS in European
    Government Bonds 2021); one left open and not counted, Philip Morris Holland BV (1982), Philip Morris Inc.'s then,
    three years before Altria's holding company;
  - **31 company days on 26 of the 77 decisions;** 23 of the 31 before 2017.
- **The estimate:** about 0.4 company days a decision, about 280 over about 700 decisions (it could be off by a third),
  about three in four before 2017.
- **First prices:** the fixtures carry 15 of the 31's tickers, and 14 fall after them (Rio Tinto Zinc's of 1984 falls
  before Rio Tinto's of 1990). Many addressees are foreign issuers whose first price the fixtures do not carry (E.ON,
  Lufthansa, ABB, Alstom, Hitachi, Eni, FLSmidth).
- **State aid,** titles only: 3,645 English works name an aid's beneficiary, 2,228 of them neither a court's nor a
  question; 1,219 of the 2000s. By the rule on the title's beneficiary, 20 company days: Ryanair 9 (2007–2021), Apple 2
  (the opening of 2014-10-17 and the decision of 2016-08-30), Amazon 2, Starbucks 2, McDonald's (2016), Nike (2019),
  Zoetis (2019), Alstom (2003) and Infineon (2004). Titles naming a unit ("Ford España SA" 2002, "General Motors
  Belgium" 2006, "Alcoa Trasformazioni" 2009) need the text.
- **For example,** each from the sample: Ford Werke AG's distribution system (1983), BP Chemicals with Bayer (1988),
  John Deere Ltd in the UK tractor registration exchange (1992), GlaxoSmithKline's Spanish pricing (2001), UCAR
  International in graphite electrodes (2001), Mueller Industries in copper plumbing tubes (2004), AstraZeneca's Losec
  (2005), ABB, Alstom and Hitachi in gas-insulated switchgear (2007), DuPont and Eni in chloroprene rubber (2007),
  MasterCard's interchange fees (2007), Parker Hannifin in marine hoses (2009), Akzo Nobel in calcium carbide (2009),
  Teva in perindopril (2014), Google Shopping (2017), Autoliv in occupant safety systems (2019), Magna in closure
  systems (2020), Trinseo in styrene monomer (2022).

**Who benefits and how:** readers of the pages of companies fined or bound in Europe: the drug makers (GSK,
AstraZeneca, Teva), the chemical makers (DuPont, Akzo Nobel, Eni, Trinseo), the engineering groups (ABB, Alstom,
Hitachi, Parker Hannifin), the car makers and suppliers (Ford, Autoliv, Magna), the banks (Bank of America, UBS, NatWest,
Nomura, HSBC), MasterCard, Google, and under (a) Apple, Amazon, Starbucks, McDonald's and Nike. Three in four rows fall
before 2017, from 1973.

**Risk:**
- **An estimate from 77 texts.** It could be off by a third.
- **The addressee lists** come in four forms, with addresses, annexes and subsidiaries; a list the reader cannot split
  is listed, never guessed.
- **Units:** 7 of the 31 came only through a unit or a former name. The units' days are read from filings.
- **Foreign issuers' first prices:** half the 31's tickers have none in the fixtures; their older rows may stay off.
- **A decision is not the last word:** many were appealed and some annulled. #3 carries the courts' judgments; this row
  says what the Commission decided on its day.
- **EUR-Lex refused this container today;** the build reads only CELLAR, as batch 174 does.

**One call inside it, for the owner:**
- **State aid:**
  - (a) the antitrust and cartel decisions addressed to the company, and the State aid notices and decisions naming
    it as the beneficiary, each on its day (recommended): about 280 and at least 20 more;
  - (b) the antitrust and cartel decisions only.

**Cost:** none. About six SPARQL queries and about 700 CELLAR texts once, about 300 more under (a), at 1.6 s (about 30
minutes), then a few a month.
**Effort:** medium:
- the lists in their wordings, and the texts;
- the addressee lists in their four forms, the fines, the units' days;
- the namesakes read by hand;
- the rows and "Also on" (a migration);
- a committed slice and `check:eu-antitrust`;
- the coverage map's, README's and the Sources panel's lines, and the credit.

**How to check:** a new `check:eu-antitrust` on a committed slice of texts:
- AT.39740 Google Search (Shopping), 2017-06-27, lands on GOOGL with its fine; COMP/C-3/37.990 Intel, 2009-05-13, on
  INTC;
- COMP/38.899 Gas Insulated Switchgear, 2007-01-24, lands on ABB, Alstom and Hitachi, each saying "Also on" the others;
- COMP/38.629 Chloroprene Rubber, 2007-12-05, lands on DD and Eni, and The Dow Chemical Company stays off DOW;
- IV/30.696 Ford Werke AG, 1983-11-16, lands on F through the unit; IV/31.370 and 31.446, the UK Agricultural Tractor
  Registration Exchange (1992-02-17), lands on DE through John Deere Ltd;
- COMP/39.847 E-books (Penguin, 2013-07-25) stays off AAPL, and COMP/34.579 MasterCard (2007-12-19) lands on MA and stays
  off V;
- under (a), SA.38373's decision of 2016-08-30 lands on AAPL as the beneficiary.

On main they fail: the source does not exist.

**Depends on:** NC-074 (whether international coverage is in scope), and the owner's approval of a new source under
the licence the registry records for source 50.

**Buildable by:** a cloud session. publications.europa.eu answered every list and text asked here.

*Importance:* medium — about 280 company days (an estimate from 77 texts, 31 company days read), three in four before
2017, each a decision with a fine or an order; and under (a) the State aid decisions, Apple's of 2016 among them ·
*Efficiency:* high — batch 174's endpoint, document store and rule · *Practicality:* medium — four forms of addressee
list, units read by hand, NC-074 open

---

## 3. The EU courts' judgments in the company's own cases, 1954–2026: GE's and Honeywell's appeals of the merger ban (2005), the Commission's heat stabiliser decision of 2011 annulled on Akzo Nobel's appeal (2015), Eni, LG Display, Lufthansa and LATAM on their cartel fines (2015), Ryanair, Merck Sharp & Dohme, Novartis… · proposed `P2` · target section: Scope refocus — exchange-traded securities (2026-08-08)

**Status:** APPROVED — 2026-11-22, "#1 Supreme Court (Recommended), #2 EU antitrust and State aid, #3 EU court rulings" and "Use the defaults (Recommended)", with call (a): every subject but trade-mark and staff cases. Filed under Scope refocus; to be built in batch 178.
**Owner's reason (if rejected):**

**Raised before:** no.

**Anchor:** the same gap as #2, and the other half of it: a Commission decision appealed to the General Court and then
the Court of Justice has its last word there (GE/Honeywell's prohibition, upheld in 2005; the Commission's amending
decision of 2011 in heat stabilisers, annulled on Akzo Nobel's appeal in 2015). The courts also rule on references
from national courts naming a company. No adapter reads them.

**What:** an adapter, `lib/euCourts.ts`, with a new source key and a committed file:
- **The list:** the endpoint asked year by year for the English titles holding "judgment of the": 77,843 works,
  1954–2026, 39,400 of them before 2017; the judgment and the Official Journal's notice of it are two works and make
  one row. No year holds more than 4,484, under the endpoint's 5,000.
- **The parties:** the title names them in full: "Judgment of the General Court … of 14 December 2005.#General
  Electric Company v Commission of the European Communities.#Competition — Concentrations …". The day is the
  judgment's own, in the title; the subject words follow it. No text is needed to find a party.
- **The outcome:** the notice's operative part, from CELLAR once a matched case ("Operative part of the judgment The
  Court: 1. Annuls the Commission Decision of 30 June 2011 … (Case COMP/38.589 — Heat Stabilisers)").
- **The rule:** the merger notices' (`partyIsCompany`) on each party's whole name, never a part of one ("Apple and
  Pear Australia Ltd" is one name), the company's units on their days, and namesakes in `NOT_THE_COMPANY`. Staff cases
  make no row.
- **The row:** one a company a day: "The General Court ruled in General Electric Company v Commission (T-210/01):
  Competition — Concentrations …" with the court, the case number, the company's side, the operative part and the
  judgment, linked. A case of two listed companies says "Also on" (a migration).

**Licence:**
- **The Court's own,** read today (`curia.europa.eu`, Copyright): "The original content on this website is copyright of
  the European Union. Editorial content and the case-law can be reproduced provided the source is acknowledged … You
  may reproduce the judicial decisions found in the case-law database." The credit reads "Court of Justice of the
  European Union". It states no restriction to non-commercial use.
- **The notices,** as #2: EUR-Lex's legal notice as source 50 records it, and the Publications Office's notice read
  today. No key.

**Grounded in:**
- **The sample:** four years' titles, 1985, 1995, 2005 and 2015, 5,151 works; 465 staff cases set aside. By subject:
  trade marks and designs 870, competition 398, State aid 179, anti-dumping 126, other 3,113.
- **The replay,** every company in the index under its present names, on each title's parties:
  - 30 company days matched: 16 the company's own in its own cases; 6 trade mark cases (PepsiCo, Colgate, Osotspa,
    Creative, BlackRock, H&M) and 2 more before first prices (Alcon, Levi Strauss); 5 not the company's (Apple and Pear
    Australia, my split of one name; Knoll International in 2015 on MillerKnoll, which bought it in 2021; SLM and Ori
    Martin on SLM Corp.; Cactus v OHIM on Cactus, Inc.; and Honeywell Aerospace GmbH's customs case of 2005-01-20 on the
    2026 spin-off's record); 1 left open, Barclays Bank plc's case on the record that carries its exchange-traded notes;
  - 1 more by hand: that Honeywell Aerospace case is Honeywell's, its unit's then. **17 in all;**
  - of the 17, 11 are competition, State aid or merger cases and 6 other (customs, a supplementary patent certificate,
    a database right, consumer credit): 1995 2, 2005 6, 2015 9;
  - **first prices:** the fixtures carry 8 of the 17's tickers, and 7 fall after them (Solvay's of 1995 before its
    2012).
- **The estimate:** 17 in 5,151 titles is about 260 company days over the 77,843 (it could be off by half), about half
  before 2017; trade marks would add about 90.
- **For example,** each from the sample: Solvay v Commission on the soda ash decisions (1995-06-29), Hauptzollamt
  München-West v Analog Devices GmbH (1995), Merck Sharp & Dohme v Belgian State (2005), General Electric and Honeywell
  International v Commission (2005-12-14), EDP v Commission (2005), Ryanair v PR Aviation and Ryanair v Commission
  (2015), Akzo Nobel v Commission (2015-01-28 and 2015-07-15), Commission v Versalis and Eni (2015-03-05), LG Display v
  Commission (2015-04-23), Deutsche Lufthansa and LATAM Airlines v Commission (2015-12-16).

**Who benefits and how:** readers of the pages #2 and batch 174 serve, who see a Commission decision and not what became
of it: GE and Honeywell, Akzo Nobel, Eni, LG Display, Lufthansa, LATAM, Ryanair, Solvay, and the drug makers whose
national cases reach Luxembourg (Merck, Novartis). Later years, outside the sample, hold the large ones (Intel, Google,
Qualcomm, Apple's and Amazon's State aid); I did not measure them.

**Risk:**
- **An estimate from four years.** It could be off by half; the years since 2017 hold half the titles and none was
  sampled.
- **Party names in titles are whole names,** but a party list split at "and" breaks a name ("Apple and Pear Australia");
  the build splits only where each part is a legal name, as batch 175's `legalList` does.
- **Units and their days:** a German or Dutch unit (Analog Devices GmbH, Merck Sharp & Dohme BV) is the company's only
  on its days; a bought company's case is never the buyer's before (Knoll, 2015).
- **Trade marks** are many and routine; call (a) leaves them off.

**One call inside it, for the owner:**
- **Which subjects make a row:**
  - (a) every judgment in which the company is a party by name, but trade mark and design cases against the EU's IP
    office and staff cases (recommended): about 260;
  - (b) (a) and the trade mark and design cases: about 350;
  - (c) competition, State aid and merger cases only: 11 of the sample's 17.

**Cost:** none. About 75 SPARQL lists once and about 350 notices for the operative parts (an estimate), then one list and
a few notices a month.
**Effort:** small-medium:
- the yearly lists, the titles' parties, days and subjects;
- the operative parts;
- the namesakes and units read by hand;
- the rows and "Also on" (a migration);
- a committed slice and `check:eu-courts`;
- the coverage map's, README's and the Sources panel's lines, and the Court's credit.

**How to check:** a new `check:eu-courts` on a committed slice of titles and notices:
- T-210/01 General Electric v Commission and T-209/01 Honeywell International v Commission, 2005-12-14, land on GE and
  HON;
- T-485/11 Akzo Nobel and Akcros Chemicals v Commission, 2015-07-15, lands on AKZOY with its operative part, "Annuls the
  Commission Decision of 30 June 2011";
- the judgment and its Official Journal notice make one row;
- T-378/13 Apple and Pear Australia v OHIM stays off AAPL, T-389/10 SLM and Ori Martin off SLM, and C-516/13 Knoll
  International (2015) off MLKN;
- under (a), T-59/14 BlackRock v OHIM makes no row.

On main they fail: the source does not exist.

**Depends on:** NC-074, the owner's approval of a new source under the Court's stated terms; best built after #2.

**Buildable by:** a cloud session. publications.europa.eu and curia.europa.eu answered from here.

*Importance:* medium-low — about 260 company days (an estimate from four years' titles, 30 read), half before 2017, the
last word on many of #2's and batch 174's decisions · *Efficiency:* high — titles name the parties, one list a year ·
*Practicality:* medium — an estimate from four years, units read by hand, NC-074 open

---

## Considered and cut

- **The Aberdeen Group's own EU notifications (the audit's opportunity; measured, cut on size).** Record 1370418
  (SLFPY) would need the group's later names, Standard Life Aberdeen plc, abrdn plc and Aberdeen Group plc, each with a
  day read from a filing. The committed files hold three notices under them: M.8817 (2018), M.12329 and M.12414 (2026),
  in `data/eu-mergers.json.gz`. The merger grants', H.2's, ITC's, TAA's and clearances' files hold none; Aberdeen Asset
  Management PLC's grants of 2005 and 2013 are the other company's, before the 2017 merger. The alias file holds no name
  for the record. Three rows: an entry in a names list when the build next touches it, not a proposal.
- **FRASER, the H.2 before late 1996 and the Federal Reserve Bulletin's orders (not reachable).**
  fraser.stlouisfed.org closed the connection to its robots.txt three times (no answer; an HTTP/2 stream error; an empty
  reply). Nothing else was asked.
- **CourtListener's federal court opinions (not reachable).** www.courtlistener.com answered 403 (CloudFront) to its
  robots.txt.
- **govinfo's federal court opinions since 2004 (`USCOURTS`) and GAO's decisions (`GAOREPORTS`) (seen, not measured).**
  Both are in govinfo's sitemap list. A large company's lower-court cases run to hundreds, most of them routine; any use
  would need a floor of yours first.
- **The Commission's merger decisions beyond the notices (seen; cut).** 9,943 English titles "declaring a concentration",
  1990–2026, most of them first-phase clearances batch 174's clearance line already carries. The second-phase
  prohibitions and conditional clearances, a few hundred, would be a line on batch 174's rows if wanted; not measured on
  companies.
- **Not retried, nothing having changed:** the FTC's site, FSIS, PHMSA, FERC, the NRC, GAO's own site, the NTSB's Access
  files, OFAC, TARP, USAspending, the FDIC's failed-bank list and orders, the CPSC's civil penalties, the FCC,
  www.dol.gov, BIS, the FAA, the Defense Department, the BLS and DOE's OE-417.
- **Owner decisions and tracked waits, not raised:** listed in the header.
- **Re-prioritisations:** none proposed.
- **Anything touching another product:** nothing here reads, references or connects to another product's repository.

*One closing note, not a proposal* — noticed in passing. `data/eu-mergers.json.gz` reads the party "abrdn Investments
Limited" of the 2026 Aberdeen notices as "Investments Limited": a name that begins in lower case loses its first word.
The `code-auditor` may want it.
