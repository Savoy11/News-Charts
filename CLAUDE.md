# News Charts — Claude Code Project Guide

This file is auto-loaded by Claude Code at session start. It orients a session before it
touches anything; the deep documentation lives in `README.md` and `docs/`.

---

## ⛔ Scope rule — read this first

**This repository is `Savoy11/News-Charts` (for a time `Savoy11/chronolens`): a standalone
product.** It shares an owner — and nothing else — with the other products. Both names resolve
to this one repo; `scripts/check-boundary.ts` accepts either, and a further rename means adding
the new name to its `THIS_REPO_NAMES`.

1. **Never touch another product's repository from a session here.** Crypto-Stuff / CAEP /
   "Finance Now" (and its free-edition copy, `Savoy11/Finance-Now-Free`) are separate projects
   with their own repos, their own checklists, and their own sessions. This repo has exactly one
   git remote (`Savoy11/News-Charts`), no submodules, and no workflow that checks out another
   repository. Keep it that way — do not add a remote, a submodule, or a `repository:` override
   to reach a sibling project.
2. **No shared code, no runtime coupling.** The `Scope & independence` section of
   `docs/MASTER-CHECKLIST.md` rules the projects independent; this repo must build and run with
   the others absent. As of 2026-08-08 there is **no cross-promotion either** — the CAEP promo
   banner was removed and its slots now hold blank `AdSlot` placeholders, so nothing in the UI
   references a sibling product. Cross-promotion would be marketing rather than coupling and is
   not barred by the scope rule, but re-introducing it is an explicit owner decision, as is any
   deeper cross-project connection — never something to assume or add in passing.
3. **The work log for this repo is [`docs/MASTER-CHECKLIST.md`](docs/MASTER-CHECKLIST.md)** —
   prioritised backlog plus done log. Check the box in the same change that ships the work.
   The task ledger beside it (`docs/audits/nc-task-queue-2026-09-28.json`) cites its evidence by file, lines and
   quote; `npm run check:ledger` holds each to the file as it is, so run `npm run ledger:reanchor` after editing
   a document it cites (batch 187).
4. **This boundary is enforced by test, not just prose:** `npm run check:boundary`
   (`scripts/check-boundary.ts`, part of `npm run check`) fails if a submodule, foreign remote,
   cross-repo checkout, escaping import, or a stale path into another product's checkout
   appears. If you find an absolute Windows path in any doc here, it is a stale pointer
   inherited from another project's layout — treat it as a bug and fix it, don't follow it.

---

## What this is

**Exchange-traded securities on a timeline** — publicly traded companies, ETFs, and mutual
funds, with news, SEC filings, and earnings pegged to the price chart so analysts can spot what
sparked a move. The build scope (refocused 2026-08-08) is depth of coverage for listed
securities: as many reports and articles per security as the sources honestly allow. Topic
pages still exist for subjects already held (crypto assets, sector themes), but search resolves
securities, and new enhancement work targets securities coverage first — see "Scope refocus"
in the checklist. Built to drive traffic and ad revenue supporting the CAEP desktop app — a
business relationship, not a code one (see the scope rule). Business decisions made in Finance
Now sessions that bear on this repo (US-only, the D22 launch trigger, the affiliate stance, the
working pricing plan) are summarised in
[`docs/decisions/2026-09-28-business-decisions.md`](docs/decisions/2026-09-28-business-decisions.md)
— a summary, not the record.

**Prompt search is live (v2, 2026-10-20).** A question that names a security and a concern —
"how did covid affect Best Buy's stock price" — opens BBY's page with `?focus=covid`, its
timeline narrowed and ranked by the concern. `lib/resolveSearch.ts` runs `parseSearchPrompt`
(`lib/prompt.ts`) before the ladder, but never on a query that is already a security's or a held
subject's name ("Jack in the Box"); `lib/focus.ts` grades events by the focus words and reads
years as a date window; FocusBar and BestMatches show it, from the server's first render: the pages read
`?focus=` (`focusFromParam`), a redirect keeps it, and a focused link's preview names only words the
page's records hold (`lib/focusMeta.ts`, NC-003, batch 156). Other words for a common concern
("covid" → pandemic, lockdown) come from the curated list in `lib/concepts.ts` — read its rules
before adding to it; a loose synonym fills a narrowed page with unrelated events. A company's
other names — "Google" for Alphabet, "Facebook" for Meta, "P&G" — come from Wikidata through the
committed `data/company-aliases.json` (`npm run sync:aliases`); every rule about what may become a
name is in `lib/companyAliases.ts`, and an exact EDGAR title always outranks an alias. News may use
only the strongest of them — the company's own former names and a predecessor whose ticker it
carries, never an acquisition's or a loose alias (`newsNamesFor`): Sun's 1990s news is not Oracle's.
"Google" scores Alphabet's headlines but is never put in a GDELT query, which matches it in page
furniture everywhere (`gdeltNames` in `lib/news.ts`). The Federal Register company feed searches the
same names in one request and keeps a title only when it names one (`lib/frCompany.ts`); each year
back to 1994, or to the company's first price if later, is read once, under the EDGAR former names in use
that year (`lib/ingest/frBackfill.ts`),
and routine rail-board, FERC and NRC notices are grouped a row a month on the page. Every path
that scores a company's headlines — ingest, a first visit, `npm run score`, the backfill — takes its
names from one place, `companyScoringAliases` in `lib/scoringNames.ts`; build no second list. The
SEC's and the Justice Department's release rules, the SEC's case captions (`lib/secCases.ts`),
the Federal Reserve Board's releases (`lib/fedPress.ts`; its orders of 1996–2005 from the committed
`data/fed-orders-1996-2005.json`, each with its page's sentence naming every party, batch 99) and the CFPB's actions (`lib/cfpb.ts`) alone also read `lib/releaseNames.ts`: the securities units a bank owned, each between the days its
filings give (Merrill Lynch is Bank of America's from 2009-01-01), the other listed banks', brokers' and
managers' own banks, broker-dealers and advisers (`BANK_UNITS`, batch 88: Regions Bank, Ameriprise
Financial Services, Franklin Advisers…; batch 89: the units the CFPB charges, Capital One Bank, the
mortgage insurers…), the operating units EPA files under, by their own names on the same days (`OPERATING_UNITS`, batch 121: Pratt & Whitney, Ohio Edison, PacifiCorp…), the drug and device makers' own companies (`HEALTH_UNITS`, batch 128: Novartis Pharmaceuticals, Merck Sharp & Dohme, Guidant…), the companies named after their brokers, banks and managers (batch 145: Invesco Funds Group, RBC Capital Markets, Ford Motor Credit, HSBC Bank USA…), and the notes records that take no release. Every one of these rules reads a
company from its first price on; the only names read before it are the units marked `beforeListing`
(the owner's calls b and c, batch 90; the owner's rule of 2026-11-05 that a case goes on every
company it involves, batch 93). It is not a scoring list; keep it that way. A whole name two different listed companies hold, as
everyday or legal name, names neither anywhere (`listedCompaniesNamed`, batch 109): `companyNames`
gives such a company its own legal name instead, or none ("Independent Bank", INDB's and IBCP's), and
headlines name it by its ticker; one group's two records keep theirs (`ONE_GROUP` in
`lib/sharedNames.ts`), and check:shared-names lists the twelve held now. A legal name is read in both
spellings of its form, "TORO CO" as "TORO Company" (`legalSpellings`, batch 111), and the two count as one
name. A caption names a company only by its name or its legal name with legal words after it; the namesakes that rule cannot tell apart were read by
hand and are listed by CIK in `NOT_THE_COMPANY` (one list each in `lib/secCases.ts`, `lib/fedPress.ts`,
`lib/cfpb.ts`, `lib/epaCases.ts`, `lib/cftc.ts` and `lib/cpscRecalls.ts`; batch 100 read every CPSC firm by hand). EPA and
the CPSC hold their own `UNITS` lists instead of the release map: a unit filed under its own name, on its owner's page
between the days the owner held it, each day read from a filing (Sunoco, Inc. on Energy Transfer, Graco Children's Products on Newell, batch 101;
the CPSC's 81 more on 47 companies, American Honda on Honda to Kidde on RTX, batch 126, where no 8-K reports a deal the
two filings EDGAR's full-text search finds around it, with no recall between them; its fifth round, BRP US to
A. O. Smith Electrical Products on 7 more, batch 145; its sixth, Fisher-Price on Mattel to Lawn-Boy on Toro, whose days
waited on the contact, batch 148, when six recalls the service dates in the wrong year took their notices' own days
(`DAYS_READ`);
EPA's operating units of 34 more companies, Chevron U.S.A. to Union Carbide, batch 104, with a branded station never the brand's unit and a joint venture no one's; the utilities' operating companies, Georgia Power to PSE&G, on 33 companies, batch 114; BNSF on Berkshire to Kennecott on Rio Tinto, 28 more companies' units, batch 120, a unit sold to another listed company on that company's page from the day, each day read from data.sec.gov's filing lists; a fourth round, Ashland Chemical to Seaboard Farms on 13 companies, batch 135; a fifth, the companies named after their owners, National Fuel Gas Supply to Coca-Cola Refreshments on 31 more and six already listed, batch 145, with GE Plastics' and Denison Mines (USA)'s names in `NOT_THE_COMPANY` after their sales, since the caption rule read them as their sellers'; and batch 148's units of the vehicle, rail and product maps, Hino on
Toyota to Playskool on Hasbro, on the same days, batch 150, as a unit read for one map is read for EPA's too). A name holding "&" is read with "and" too by the caption rule every one of these sources shares (`andSpellings`, batch 120), and the table of taken names reads "AT AND T" as "AT&T". A fund's series is never a party to any of these five rules (`FUND_SERIES`): its page knows only its
series name, and "Growth Fund, Ltd." is a Ponzi scheme's fund, not American Century's. The
Justice Department's API is asked by its `title` filter, which it reads; it ignores `parameters[title]` and answered every name asked that way with the same 488 releases (batch 121). Its releases of 1996–2008, which the API does not hold, come from its archive's
month pages, each read once and kept (`lib/dojArchive.ts`, batch 94), under the same rule; a one-word
name that is an everyday word ("CITY", "TARGET") needs its legal word in a title written in
capitals, and as an object is the word after "the" or before "of" (`isEverydayWord`). EPA's
civil enforcement cases come from its whole case file, a zip read once a month (`lib/epaCases.ts`,
`lib/zip.ts`); a defendant is the company by the same caption rule, with two guards of its own ("…
Power and Light Company" is one name; "RETHERFORD, DANA" is a person), and money stays numeric. A
case EPA gives no penalty total takes its one settlement's, the row names the work ordered ("among N
parties" on a settlement of several) and carries EPA's own summary when it says something (batch
113, `summaryOf`), and EPA's cost recovery by the same rule (batch 129, `costRecovery`); its supplemental environmental projects are each settlement's `SEP_AMT` and the projects table's text, a case its one settlement's or its own day's added, as EPA gives no total, never another day's (batches 141–142, `projectsFigure`, db/050); text is stored without control characters, EPA's Windows-1252 punctuation read as itself (batch 142), since a NUL made Postgres refuse the
whole month's read. A suit filed over 30 days before its first settlement has a row on the filing day,
the rule's tests run that day (batch 122), and a court case of settlements on several days has a row a
day on the page whose own are every defendant that day; a case's own day keeps its row and key. The
CPSC's recalls (`lib/cpscRecalls.ts`) go on every listed company a recall names: its makers,
importers and distributors by the caption rule, its stores as whole items of the "Sold at" line, a
store's recalls of other makers' products grouped a row a month, a recall's row with the Commission's injury
statement as written (batch 136), whole where the units text can give way, else cut at a word and marked (batch
137). The FRA's railroad accident reports (`lib/railAccidents.ts`, batch 127) reach a
railroad company's page only through `RAIL_OWNERS`, each reporting railroad between its owner's days, from
the company's first price, at the owner's floor: a death, an evacuation or $5,000,000 of damage, a crossing
collision only with the last two; its dead and injured are the accident's, Form 55a's count, never one
record's Form 54 part (batch 130), unless the railroad's own report gives more, which the row then says (batch 146), its text the railroad's own narrative and the dead by kind where they add
up (batch 136). MSHA's mine accidents (`lib/mineAccidents.ts`, batch 134), the deaths of
its Accidents file kept from a weekly read of two zips (`lib/ingest/mineWalk.ts`, db/046), reach a page only
through `MINE_CONTROLLERS`, each controller ID between its company's days, from the first price; MSHA gives
an ID's present name on an old record, so a title names no operator. MSHA's own finding follows the report
on the row (batch 139): its Inspections and Assessed Violations files, streamed monthly (`eachZipLine`,
db/048), give the violations an investigation begun within 14 days cited and the penalties, in cents. The
CFTC's actions (`lib/cftc.ts`) are read by the Justice rule with the release map's units, plus the
Commission's object form ("CFTC Orders UBS to Pay") and four guards of its own; read its header first.

The EEOC's press releases since 1994 (`lib/eeoc.ts`, batch 152) are its newsroom listing, read whole
once a year and its newest page daily (`lib/ingest/eeocWalk.ts`, db/052), kept by the Justice rule and
the Commission's own title shapes under the company's names, the release map's units and its own
`EEOC_UNITS`; a franchisee's, bottler's or licensee's release is the brand's by neither its title nor its
first lines, one release posted twice is one row, and an undated release a rule keeps has its page read
once for the day its text gives, else makes no row. A release no rule can place is read by hand into
`RELEASES_OF`, by title and company, from a day (batch 155: Murphy USA's suit of 2016).

The OCC's enforcement actions since 1987 (`lib/occActions.ts`, batch 153) are the search page's own API,
every institution action in one keyless answer read once a process (`lib/ingest/occFor.ts`), complete when
it holds the count's number: an action is a page's by the caption rule on the bank's name, the release
map's banks, or `OCC_BANKS`, the OCC's own spellings of 51 companies' banks by charter number and name, each
bought or sold bank between its owner's filing days (MUFG Union Bank is MUFG's to 2022-11-30, U.S. Bancorp's
from 2022-12-01); a namesake is refused by charter (`NOT_THE_COMPANY`). One row a company a day, each order's
kind, numeric amount, subject matters, number and the day it ended on it. The OTS's orders of 1989–2011
join them from the archive the OCC keeps (`lib/otsOrders.ts`, batch 154), read once into the committed
`data/ots-orders.json` (`npm run sync:ots-orders`): a thrift's OTS docket is its OCC charter less 700000, a
holding company is read by the caption rule or refused by docket, an order the OCC's list carries on is the
OCC's row, and a termination is a line on the order it ended.

The Labor Department's trade adjustment certifications of 1975–2022 (`lib/taaPetitions.ts`, batch 159) are one
keyless zip read once into the committed `data/taa-certifications.json.gz` (`npm run sync:taa`; no petition is
decided after 2022-06-30, when the program lapsed): only the codes the Federal Register lists as issued
certifications (C, C1, C2, CU) are kept, a denial making no row. A certification is a page's by the caption rule
on its firm under the company's names of the year, the release map's units of the day, EPA's and the CPSC's
`UNITS` on their days (batch 160), or `TAA_UNITS`, the units named after it the rule does not read, a sold one
with its `to` and its buyer's `from` read from a filing; a namesake is refused in `NOT_THE_COMPANY`. One row a company a day, each
site's town, product and the Department's worker estimate given, never added up.

The NLRB's Board decisions since 1935 (`lib/nlrbDecisions.ts`, batch 161) are its decision listing, read whole
once a year and its newest page daily (`lib/ingest/nlrbWalk.ts`, db/054), the whole read begun only in the NLRB's
night window for bulk reads, 11 pm to 6 am Eastern, by its policy (`inNightWindow`), across runs and nights
(db/055, batch 162, the whole listing read on the nights of 2026-11-21 and 2026-11-22, batch 168: the site's firewall refused the first night read at page 340 with a "Request Rejected" page
served as HTTP 200, `REJECTED`, which ends the night's reading); a page is full by its rows, dated or not; until the
last page is read an answer is never complete. It is asked once a process (`walkNlrbOnce`), any failure rests the read
that failed 12 hours, the daily read takes at most 5 pages, and a page whose rows give no decision is an error (batch 164). The case number gives the kind: a case against the employer (CA, C) or an election or unit question
at it (RC, RD, RM, R, RE, UA, UC, UD, AC); a case against a union makes no row. A decision is a page's by EPA's form of
the caption rule (`epaParty`, its "d/b/a" read by `respondents`) under the company's names of the year, the release
map's and the EEOC's units, EPA's and the CPSC's `UNITS` on their days, or `NLRB_UNITS`; a namesake is refused in
`NOT_THE_COMPANY`. One row a company a day, its id the decisions' documents; the listing gives no ruling, and the row
says so.

The antitrust agencies' early terminations of the merger waiting period since 1994 (`lib/hsrEarly.ts`, batch 166)
are the Federal Register's grant notices, whose titles name no company, read from govinfo into the committed
`data/hsr-early-terminations.json.gz` (`npm run sync:hsr`, monthly, a notice the file holds never asked again): each
notice's table in its layout, every transaction number its text holds read (`readGrantNotice`), a group whose day the
notice lost kept with none and making no row, and from 2011 the third name the acquiring side's, never an entity
acquired (`thirdIsAcquiring`). A grant is a page's by the caption rule on each party under the company's names of the
year, the release map's units and EPA's and the CPSC's `UNITS` on their days, a ".com" legal name read as EDGAR writes
it, never a credit union or a namesake in `NOT_THE_COMPANY`; one row a company a day, an individual's filing labelled,
its id the day's transaction numbers ("Also on", db/056). The row never says the deal closed. A firm named with commas
is one party ("Clayton, Dubilier & Rice", `byCommas`), a day that is no calendar day or falls after its notice's is no
day (`grantDayValid`), a reprinted grant is kept once and a number two deals were given is each deal's with its day
(`sameDeal`, `sharedNumbers`; batch 170).

The ITC's Section 337 investigations since 1995 (`lib/itc337.ts`, batch 167) are the Commission's Federal Register
notices, read from govinfo into the committed `data/itc-337.json.gz` (`npm run sync:itc`, monthly): a notice of
institution by its abstract (`isInstitution`), its parties a line or a block each (`readInstitution`), the
investigation followed by its number to the last notice deciding it on the merits, dated by the day the Commission
issued it (`issuedOn`), or ending it otherwise (`noticeOutcome`). A party is a page's by the merger notices' rule
(`partyIsCompany`), its namesakes in this source's `NOT_THE_COMPANY`; a row a company a day instituted and one
decided, a settlement a line on the first, its id the investigations' numbers ("Also on", db/057). A scrap of an
address is no party (`isAddressScrap`, batch 170).

The FDA's own press releases and talk papers of 1962–2014 (`lib/fdaHistory.ts`, batch 169) are openFDA's historical
documents, one CC0 zip of OCR text read once into the committed `data/fda-history.json.gz` (`npm run
sync:fda-history`, again only after sync:tickers; the file ends in 2014): a document dated by its head in its own year
(`headDate`), a company named by the prose rule (`proseParty`: its name with a legal word, or its whole name of two
words or more printed capitalised, never after another capitalised word but the words a name follows, `LEADS`,
`BASED` and a headline's capitals), then the caption rule and `takenBefore`. A document naming more than two listed
companies names none; every kept row was read by hand once, and the refused are listed by document and CIK
(`REFUSED`), the three the guard refuses and the hand read keeps with their quoted sentences (`NAMED_BY_HAND`). One row a company a day, its title the document's sentence naming the company (`sentenceAt`); a release
about one of its approvals that day, naming the drug, is a line on that approval's row instead (`releaseFor`, the owner's
call; by drug since batch 170), never a row. The day beside the release line or the talk paper's number is read first
(`headDate`), a revision's day never.

The FDA's 510(k) clearances and De Novo grants since 1976 (`lib/fdaClearances.ts`, batch 172) are openFDA's
`device/510k` file, streamed a record at a time (`clearanceReader` through `eachZipLine`) into the committed
`data/fda-clearances.json.gz` (`npm run sync:fda-clearances`, monthly): a clearance is a page's by `approvalIsCompany` on
its day, among the company's candidates by the file's word index (`candidatesFor`), less the names read by hand
(`NOT_THE_COMPANY`: namesakes, and a unit's own records under its owner's later name before the day, `before`). The
recall map's units carry their purchase days back to 1976 for it, each from a filing (Howmedica, DePuy, Cordis,
Physio-Control, Linvatec, Radiometer, KaVo) but LifeScan's, bought in 1986 before EDGAR and dated from 1987, and J&J's
"Ortho" names are its own Ortho companies only. One row a company
a month naming each device and its number, a De Novo grant its own (the owner's call); the row never says the device
was launched.

The Supreme Court's decisions since 1962 (`lib/supremeCourt.ts`, batch 176) are the U.S. Reports on govinfo, each volume's
record (368 to 586) read once, and the Court's own slip-opinion lists from the 2018 term, into the committed
`data/supreme-court.json.gz` (`npm run sync:supreme-court`, monthly; govinfo 3 s apart): a case the record gives no day, and
every slip opinion, where a side can be a company, has its PDF's first pages read once for its day and disposition
(`caseHead`: "Decided October 23, 1967." and the line after, or the syllabus's line citing the decision below). A side is a
page's by the merger notices' rule (`partyIsCompany`) in the Reports' spellings read as words (`partySpellings`,
`expandAbbreviations`: "Pacific Gas & Elec. Co.", "U. S. Bank N. A.", "Teva Pharmaceuticals USA, Inc."), only with a legal
word or a name of two words or more (`corporateParty`: a caption names a person by the surname, "Cummins", "Pearson"), the
taken names read first; and by the other maps' units on their days: the railroads' owners (`RAIL_OWNERS`), the Labor
Department's and the NLRB's units (`TAA_UNITS`, `NLRB_UNITS`), the EEOC's, and this source's own (`SC_UNITS`, ten, eight dated by
a filing's day: Travelers' insurers on TRV from 2004-04-01, WesternGeco on SLB from 2006-04-28…). Namesakes are refused in
`NOT_THE_COMPANY` (the old General Motors, Southland Corp. of 7-Eleven), a company a caption names by one word is given its case
in `NAMED_BY_HAND` (FCC v. AT&T). One row a company a day, the Court's disposition and the company's side, its id the day's
citations ("Also on", db/060); the row never summarises a holding. A record's predecessor's names are not read (old Alcoa's
cases are Howmet's record's, whose chart begins in 2016), nor a name before EDGAR (Standard Oil Co. of California).

The European Commission's merger notifications since 1990 (`lib/euMergers.ts`, batch 174) are the Official Journal's,
listed by the EU Publications Office's SPARQL endpoint year by year (`noticeQuery`) and read from its document store, CELLAR
(XHTML since 2004, the PDF with pdftotext before), into the committed `data/eu-mergers.json.gz` (`npm run sync:eu-mergers`,
monthly, and after sync:tickers): a title's short names ("Merck/Sigma-Aldrich") only pick the candidates, and a text's first
paragraph decides (`firstParagraph`, `noticeParties`: each "Merck KGaA ('Merck', Germany)" with its part, a controller taking
its unit's, a notice with no brackets read by its words, "the undertakings A, B and C" a party each where every item ends in
a legal word, batch 175), the day the Commission received it its row's day (`notifiedOn`); a case number is read with or
without "Case" before it (`caseOf`, batch 175). A year's list never shorter than the file's, or the sync fails. A
party is a page's by the merger notices' rule (`partyIsCompany`) on its full name, its namesakes in `NOT_THE_COMPANY`, a name
another company took up after the record's own company gave it up refused from a day read from a filing (`from`: "Standard
Life plc" off SLFPY from 2017-09-01, batch 175). One row
a company a day, its id the day's case numbers ("Also on", db/059); the first-phase clearance, a notice of non-opposition, a
line on it (`clearanceOf`, the owner's call); the row never says the deal closed. "© European Union,
https://eur-lex.europa.eu".

The European Commission's antitrust and cartel decisions since 1973 and its State aid notices and decisions
(`lib/euAntitrust.ts`, batch 177) are the Official Journal's English titles the same endpoint lists year by year, two
queries a year, each decision's text read once from CELLAR into the committed `data/eu-antitrust.json.gz` (`npm run
sync:eu-antitrust`, monthly; needs pdftotext), which keeps only each text's addressee and fine passages, read at load. A
draft, an agenda or a Euratom decision is none, a title's "decision" read in either case (Google Shopping's, batch 178),
and a decision held twice is one by its case and day (an archive scan's "2. VII. 1987" read, `decidedOn`). Its addressees
are its own passages' (`decisionAddressees`): the article with their addresses, "was addressed" or "The following
companies were addressees" too (an item after a bare comma a name only with a legal word, a postcode or a street never),
a summary's groups ("— MAGNA: …", "for Dow: … from 1 July 1996"), the fines (a list's "as follows" too) and the
commitments, one name in its spellings once (`nameKey`: "Co." and "Co., Ltd."); "made binding the commitments offered by"
recalls an earlier decision and names one only where nothing else does. A fine (`decisionFines`) is whole euros with
every name jointly liable, a parent liable for a part none, EUR 0 none. An addressee is a page's by the merger notices'
rule on its full or short name ("Google"), its namesakes in `NOT_THE_COMPANY` ("Dow" off Dow Inc. before 2019-04-01,
"Merck", Merck KGaA's, off Merck & Co.),
its units in `EU_UNITS`; a State aid title's beneficiary by the same rule, the row saying the company is the
beneficiary. A bank's notes record takes none. One row a company a day, its id the day's case numbers ("Also on",
db/061); the row says what the Commission did on its day, which can be appealed.

The EU courts' judgments since 1955 (`lib/euCourts.ts`, batch 183, the 2026-11-22c proposal 3 with call (a)) are the
English titles holding "judgment of the" the same endpoint lists year by year (`courtsQuery`, 73 lists), into the committed
`data/eu-courts.json.gz` (`npm run sync:eu-courts`, monthly, and after sync:tickers; needs pdftotext): a judgment's own title
("Judgment of the Court of First Instance … of 14 December 2005.#General Electric Company v Commission …#Case T-210/01.")
and its Official Journal notice in three forms (`readJudgmentTitle`) are one judgment by their first case and day
(`mergeJudgments`), a case before 1989 written with no letter the Court of Justice's ("Case 1/55" C-1/55). A trade mark or
design case against the EU's IP office and a Civil Service Tribunal case are none (`isTradeMarkCase`). A side's names are split
at commas and "and" only where every part is a legal name or a public body (`sideParties`: "Apple and Pear Australia Ltd" one,
"Ministero … and ENI SpA" two, "Eli Lilly and Co." one, a former name its own); a party is a page's by the merger notices' rule
(`partyIsCompany`), its namesakes in this source's `NOT_THE_COMPANY` (the old General Motors, FMC plc, IBP Ltd, Knoll
International, Honeywell Aerospace GmbH off the spin-off before its record), its units in `EU_COURT_UNITS` (Honeywell's
Aerospace GmbH to 2025-09-30). Each judgment a replay of every listed company finds has its operative part read once from
CELLAR, the notice's text first (`operativePart`). One row a company a day, the company's side only where one case has two
sides (`sideOf`), its id the day's case numbers ("Also on", db/062); the row never summarises a judgment's reasons.

Big investors' 13F holdings changes since 2013 (`lib/instHoldings.ts`, batch 179; the owner's call of 2026-11-24, with
N-PORT and insider trades to follow in batches 180–181) are the SEC's Form 13F data sets, read once each into `npm run
sync:13f`'s git-ignored cache (`.cache/13f`, about 5 GB; 10 GB of memory) and committed as `data/13f/<year>.json.gz`: no
order or trade is public, so a change is the difference between a manager's two quarterly reports. A manager's quarter is
`effectiveFilings`' (a "new holdings" amendment as large as what it amends replaces it, Morgan Stanley's of 2024; a notice
none), compared only where both reports hold positions of like size (`comparable`), a position whose value gives no
other manager's price set aside (`markSuspect`), a split read from the holders' ratios or, where too few held through,
the company's stated counts (`splitFactor`, `simpleRatio`), the holders' split only where a twenty-fifth show its factor
exactly, a median a few percent off a factor read where three or more show it exactly (`nearSplit`, batch 185:
National Beverage's two for one of 2021) (`confirmedSplit`, batch 184: a stock merger's quarter, First Citizens' CIT one, reads as stated; a split down
neither that nor the price confirms reads nothing), a split down's stated count read by the next quarter's (`shareBasis`),
and a quarter whose change exceeds the company read as none.
One summary row a quarter on its 45-day deadline (`deadlineOf`) naming the three biggest buyers and sellers, and a row
for each manager's change of 1% or more of the company's shares (data.sec.gov's XBRL frames) on its report's day. A
security's CUSIP is a page's ticker by the SEC's fails-to-deliver files (`lib/cusipMap.ts`, committed as
`data/13f/cusips.json.gz`), its description agreeing with the company's names, former names included; an ETF's share
class by its series' name (`fundNamesAgree`, batch 180: its sponsor's brand where the CUSIP still trades under the ticker,
else two of its own words too, as a closed fund's ticker is taken up by another). An ETF is a page; a mutual fund none.

Mutual funds' and ETFs' N-PORT holdings changes since 2019 (`lib/fundHoldings.ts`, batch 180, with 13F's call) are the
SEC's Form N-PORT data sets, each fund's public report of its fiscal quarter's last month, read once each into `npm run
sync:nport`'s git-ignored cache (`.cache/nport`, about 5 GB; 8 GB of memory) and committed as `data/nport/<year>.json.gz`
by report month: a change is the difference between a fund's two reports two to four months apart (`pairable`), long
shares of stocks, preferreds and funds only, a report its month's last filed (`effectiveReports`), compared where both
hold like-sized positions. A security is keyed by its page's ticker through the 13F map, else its CUSIP, a new CUSIP under
the same name one security (`rekeyRenamed`); a position five times off the funds' median price is set aside
(`markSuspect`); a split is the median ratio of the funds that held through the same two months, five or more, where the
13F holders read it too, a twenty-fifth of the funds show it exactly, or else their median price moved the other way
(`priceAgrees`: funds that all grew a stake by half in an offering read none), never where the 13F holders read no split in
every overlapping quarter from 20 managers or more (`quarterNoSplit`, batch 184: Hawaiian Electric's offering of 2024),
and a split down none of those confirm reads nothing; the fund's own exact ratio with its price (`heldSplit`) only where
fewer than five held through and the 13F holders do not read none; a position held through is not compared where the 13F
holders, the company's stated counts or a price two and a half times up show a split the funds do not, and a new or closed
one then makes no move. A fund's page has a row on each report's filing day naming its three biggest purchases and sales
of half a percent of its net assets or more (`BIG_SHARE`); a company's page a row for each fund's change of 1% or more of
its shares (`MOVE_BP`), against the 13F frames' count of the later quarter only where the earlier agrees (`basisOf`: the
frames hold counts a hundred times off, and counts stated after a reverse split).

Insiders' open-market trades since 2006 (`lib/insiderTrades.ts`, batch 181, the owner's call of 2026-11-24 reversing
2026-10-18's) are the SEC's insider transactions data sets, Forms 4 and 5 a zip a quarter, read once each into `npm run
sync:insiders`'s git-ignored cache (`.cache/insiders`) and committed as `data/insiders/<year>.json.gz` by filing day: only
purchases (P) and sales (S) of the company's own non-derivative shares by an officer, a director or a 10% owner
(`isInsider`; "Other" alone none), never a grant, exercise, withholding or gift, which `lib/secForms.ts` still leaves
out as forms, and of its common shares only, never a preferred share, a note or a warrant (`ownShares`, batch 184). A
filing is its first reporting owner's, the joint filers counted; an amendment restates the last filing before it by the
same owner, issuer and period, on that filing's day, its trades dated later a filing of their own on its day
(`effectiveFilings`). A price is compared with the company's other filings' (`readPrices`, batch 184): five times the 10
days' median, fifty times the year's, a hundred times the whole record's, or with none to compare over $1,000,000 a share
or $5 billion a trade, is read as the trade's total where that gives a share's price, else set aside (Mubadala's AMD
shares of 2017 "at $525,600,000.00"). One row a company a filing day (`companyDays`), each insider's purchases and sales an
entry with shares, whole-dollar value (a priced subtotal beside an unpriced trade) and trade days, the owner's name as
filed, one block related owners each reported, alike to the share and the holdings after, counted once naming the others
(`also`: Antero's 12,000,000 shares of 2014-05-21, thirteen filers); by the issuer's CIK, and a predecessor's record's up to its handover day (`predecessorsOf`). A day is kept
only where its trades with a price come to $1 million or more together (`MIN_DAY_VALUE`, `bigEnough`: the owner's call of
2026-11-24, batch 182), at the sync, so the committed files hold no smaller day.

The Federal Reserve's actions on applications since 1996 (`lib/fedH2.ts`, batch 173) are the Board's weekly H.2 release,
each week's PDF read once with `pdftotext -layout` into the committed `data/fed-h2.json.gz` (`npm run sync:fed-h2`, weekly; a
week the file holds is never asked again, a transfer cut short is not held, nor a week whose text gives no action, which fails
the sync, batch 175): three layouts (`readH2`), each action under the
Board's or the delegated section, its heading and its Reserve Bank or office, the scans of 1996–1997 and the Board's damaged
file of 2018-05-26 listed as unread. Only a deal makes a row (`isDeal`: an acquisition, a merger, a change in control, a new
holding company, an activity, an election), never the routine actions filed beside it. A party is a page's by the merger
notices' rule (`partyIsCompany`) on each applicant and each company acquired, with the place the release gives it
(`listParties`, `takenParties`; a party with none takes the last one written before it); a company with namesakes is a party
only at its own places (`HOMES`, 89 read by hand, a move of its head office its own). One row a company a day, its id the
day's actions ("Also on", db/058). A Board action the Board's own release or order of its day names, in its title or the words
its row shows (`releaseNamesAction`), is a line on that row, the same on every page that holds it (`releaseH2Line`, batch 175;
`fed_press` read first, and `fed_h2` reads the same words back from the stored row), never its own. The row says what the Fed
did on the day, not the deal's closing.

The SEC News Digest of 1956–1993 (`lib/secDigest.ts`, batch 102) is read once, issue by issue, into
db/040's tables (`lib/ingest/secDigestWalk.ts`), and each company's own entries are found there at
its ingest. Its names are dated by the committed `data/digest-records.json` (`npm run
sync:digest-records`): a company is in the Digest only under the names its EDGAR record, or a
mapped predecessor's, had by 1996, and an entry two companies' names claim on its day is neither's (a company and
the old record it maps with `listedAs` are one claimant, batch 163).
The walk needs `NEWS_CHARTS_CONTACT` and poppler's `pdftotext` on the host.

The FDA's new-drug approvals since 1985 (`lib/fdaApprovals.ts`, batch 105) come from a committed
workbook read once a year (`npm run sync:fda-approvals`, `lib/xlsx.ts`): an approval is the page of
the company that applied, by the caption rule, the recall map's firms (`FDA_FIRMS`) or the names only
approvals use (`APPLICANT_NAMES`), each on its days; an acquisition's past is never the buyer's.
Their later efficacy supplements (`lib/fdaSupplements.ts`, batch 115) come from Drugs@FDA through
openFDA, a committed file read monthly (`npm run sync:fda-supplements`): a supplement is a page's only
where the drug's holder never left the company (`holderKept`: today's sponsor is the applicant by
name, a name of the company, or one of `SPONSOR_SPELLINGS`), then by the same rule on its own day;
its title says only "an efficacy supplement", never "new indication". The FDA's warning letters since 2021
(`lib/fdaWarningLetters.ts`, batch 140) come from the list's own table data, read whole both ways once a
week and kept (`lib/ingest/fdaWarningWalk.ts`, db/049): one way alone loses the letters of a day a page's
edge cuts. A letter is a page's by `approvalIsCompany` on its issue day or by `LETTER_NAMES`, read by hand
(Amazon.com, Inc.…); a company's letters of a day are one row. The FDA's device recalls of 2000 to mid-2012,
before the enforcement reports (`lib/fdaDeviceRecalls.ts`, batch 144), come from openFDA's device recall file
under the recall map's own rule (`FDA_FIRMS`, `firmFor` on the day the firm began it), less the reports' own
events; each recall's class is its FDA recall-database page's, read once and kept (db/051), a few hundred a
run, and only Class I and II become rows. The map's days for the units bought and sold 2000–2012 were read for
it: the file gives a bought unit's own past under its later name ("Boston Scientific CRM Corp" for Guidant's
2005 recalls), so every such unit carries the day its owner took it.

A row of one of the seventeen multi-party sources (DOJ, the SEC's two, the Board's, CFPB, EPA, CPSC,
CFTC, the EEOC, batch 155, the NLRB, batch 161, the merger waiting period's grants, batch 166, the ITC's, batch 167, the Fed's H.2 actions, batch 173, the EU's merger notifications, batch 174, the Supreme Court's decisions, batch 176, the EU's competition decisions, batch 177, the EU courts' judgments, batch 183) says which other held company pages carry the same case: "Also on Ford Motor, General Motors
and 25 more" (`lib/alsoOn.ts`, batch 106). A case is the same source's same number, compared as a set
for a grouped row (db/041's index, with no pending list since db/042, batch 111: a GIN index's queue made
every lookup read it); a release held once on several pages counts too. A page's links are found by
db/042's `event_subjects (subject_id)` index; the key begins with the event. It is read
beside `loadEvents` and never breaks a page; adding a multi-party source means adding it to
`ALSO_ON_SOURCES`, `ALSO_ON_SOURCE_IDS` and the index's list, in a new migration that builds it again (db/053
added the EEOC's, db/054 the NLRB's, db/056 the merger grants', db/057 the ITC's, db/058 the Fed's H.2 actions, db/059 the EU's merger notifications, db/060 the Supreme Court's decisions, db/061 the EU's competition decisions, db/062 the EU courts' judgments), which check:also-on holds together. A row
whose case numbers are joined (EPA, CPSC, CFTC, SEC cases, CFPB, the Digest's months, the FDA's warning letters' days, the EEOC's days, the NLRB's days, the merger grants' days, the ITC's days, the FDA's own releases' days, the FDA's clearances' months, the Fed's H.2 days, the EU's notification days, the Supreme Court's days, the EU's competition days, the EU courts' days) is stored again
when its list grows, so its versions count once in "· N sources" (`GROUPED_ROW_SOURCES` in
`lib/corroboration.ts`, batch 107); a new source that joins numbers goes there too, and check:also-on
finds one that does not.

A ticker whose company moved to a new SEC record — a holding-company reorganisation or redomicile
(XOM in 2026, Alphabet in 2015, Disney in 2019) — reads its earlier filings from the predecessor's
record up to the handover day, through the hand-checked map in `lib/predecessors.ts`; read its
header before adding an entry. Batch 132 added 17 pages the full-text search had missed (Comcast,
Oracle, Duke…) on their own filing lists' evidence, the owner's call of 2026-11-10, and batch 133 30
more from a scan of every listed company's list (Con Edison, PG&E, Transocean, Accenture…); a name a
predecessor took and gave back within half a year is EDGAR's churn, not a rename; a quarterly report it filed
after the day for a quarter before it, which the successor never filed, is kept by accession (`after`, PPL's
and IDACORP's, batch 137). Batch 149 read the handovers that waited on the contact: Roanoke Gas's record is
RGC's, and the old Digimarc's is Digimarc's to its spin-off of 2008-08-01, the ticker and the chart carrying on. Batch 163
maps two old records that still list tickers of their own, by the owner's call of 2026-11-21 (`listedAs`, and only those
two): old Alcoa's on AA to the separation of 2016-11-01 (Howmet's record now) and old du Pont's on DD to the merger of
2017-08-31 (EIDP's), as Yahoo's splits show both charts are the old companies'; the one stored row of such a filing
is titled on both pages with the old record's name then (`sharedRecordOf`, batch 164). RGC's own
10-Qs of 1999, an empty new parent's for quarters Roanoke Gas reported, stay off as read and as stored (`shellReports`,
batch 150). Merck's is a merger the other way round (batch 108): MRK's record was
Schering-Plough's until it took old Merck's name and ticker on 2009-11-03, so old Merck's record is
MRK's history; the record's own past before it, Schering-Plough's filings, cases, approvals and
Digest entries, stays on the page labelled as Schering-Plough's (`OWN_RECORD_FROM`,
`ownPastLabelled` at read time, batch 110, the owner's call); Stratasys's and Waste Connections's are
the same (batch 118: Objet's and Progressive Waste's records took their names and tickers, and the
charts are the old companies', as Yahoo's splits show), and so are Lennar's, Healthcare Realty's and
Iron Mountain's (batch 133: Pacific Greystone's, Healthcare Trust of America's and Pierce Leahy's
records, the charts' first prices older than those companies' own listings). The reverse, a record that took another
company's name, never takes that company's past: one table, `TAKEN_NAMES` in `lib/takenNames.ts`
(batches 117–118: 32 records, Tyco's took Johnson Controls' in batch 146, Central Valley's Community West's in batch 149 and Avago's parent Broadcom's in batch 165; SBC's took AT&T's name, ACE's Chubb's, Norwest's Wells Fargo's, TGC's
Dawson's…, each day read from a filing), refuses a row before the day that names only the taken name
and none of the record's own names of then. Every caption rule reads it (`takenBefore`), ingest
drops such rows from every source found by name, news and the Federal Register included
(`withoutTakenNames`), a page and its "Also on" leave stored ones off (`hiddenAsTaken`), and the
Federal Register's years and GDELT's months before the day are asked under the record's own name
of then (`thenNameIn`; a record with none of its own, Linde plc's, keeps the present name,
`noOwnNameBefore`); the record's own filings and prices are never read this way
(`OWN_RECORD_SOURCES`). Add a takeover there, never as one source's entry; check:taken-names holds it
to the committed scan of 175 renamed records (`scripts/fixtures/taken-names-scan.json`). A case
source's answer is complete when it is built from data kept whole (`FetchResult.complete`), and a
run then takes the company off that source's stored rows its rules no longer give it (`unlinkGone`,
check:unlink); an answer from a capped API or a live feed is not.

A fund's CIK is its trust's, and the trust files for every fund it sells. Which filings are a fund's
own comes from the filing list EDGAR keeps for its series (`lib/fundSeries.ts`; the id is in
`data/edgar-tickers.json`), read at ingest: a sibling's are not linked to the fund. The stored row
keeps the trust's name, since one row serves every sibling's page; the fund's page shows its own
under its name, at read time (`loadEvents`). The lists begin in February 2006, so older trust
filings keep their hedge.

## Stack & layout

| Layer | Choice |
|---|---|
| Framework | Next.js 16 App Router, React 19 |
| Language | TypeScript |
| Styling | Tailwind CSS 4 — v3's colours, fonts and line heights pinned in `app/globals.css` |
| Database | Postgres via `pg` — plain SQL migrations in `db/` (`npm run db:migrate`) |
| Charts | lightweight-charts + hand-rolled SVG timelines |

```
app/          # pages: /, /company/[ticker], /topic/[slug], /industry/[slug],
              #   /group/[name], /compare, /explore, /following + app/api/* routes
components/   # HorizontalTimeline, PriceTimeline, PriceOverlay, EventList, …
lib/          # data layer: prices, sec (EDGAR), signals, suggestions, markers,
              #   onchain/*, ai/*, store/*
db/           # numbered SQL migrations (001_…)
scripts/      # ingest / score / signals / backup + the check-*.ts suite
docs/         # MASTER-CHECKLIST.md (work log), EVENTS-SCHEMA.md, COVERAGE-MAP.md,
              #   OWNER-ACTIONS.md, audits/, proposals/
```

## Commands

```bash
npm run dev              # http://localhost:3000
npm run check            # full offline check suite (parsers, dates, markers, …, boundary)
npm run check:boundary   # repo-boundary checks alone
npm run ledger:reanchor  # put the task ledger's cited lines back where their quotes are (after editing a document it cites; check:ledger fails otherwise)
npm run db:migrate       # apply db/*.sql in order
npm run ingest -- …      # pull events for a subject (see README)
npm run sync:aliases     # rebuild data/company-aliases.json from Wikidata (after sync:tickers)
npm run sync:word-names  # rebuild data/english-word-names.json and data/shared-name-words.json (after sync:tickers)
npm run sync:digest-records # rebuild data/digest-records.json from EDGAR's 1993–1996 indexes (after sync:tickers)
npm run sync:fda-approvals  # rebuild data/fda-nme-approvals.json from the FDA's workbook (once a year, in the spring)
npm run sync:fda-supplements # rebuild data/fda-supplements.json from openFDA's Drugs@FDA file (monthly, and after sync:fda-approvals)
npm run sync:ots-orders     # rebuild data/ots-orders.json from the OTS archive the OCC keeps (closed: once, or if the OCC changes it)
npm run sync:taa            # rebuild data/taa-certifications.json.gz from the Labor Department's petition zip (closed: once, or if check:live finds a later determination)
npm run sync:hsr            # add the FTC's new grant notices to data/hsr-early-terminations.json.gz from govinfo (monthly; a notice the file holds is never asked again)
npm run sync:itc            # add the ITC's new Section 337 notices to data/itc-337.json.gz from the Federal Register API and govinfo (monthly)
npm run sync:fda-history    # rebuild data/fda-history.json.gz from openFDA's historical documents (closed: once, and after sync:tickers)
npm run sync:fda-clearances # rebuild data/fda-clearances.json.gz from openFDA's 510(k) file, streamed (monthly, and after sync:tickers)
npm run sync:fed-h2         # add the Board's new weekly H.2 releases to data/fed-h2.json.gz (weekly; needs pdftotext; a week the file holds is never asked again)
npm run sync:eu-mergers     # add the Official Journal's new EU merger notices to data/eu-mergers.json.gz from the Publications Office (monthly, and after sync:tickers; needs pdftotext)
npm run sync:eu-antitrust   # add the Official Journal's new EU antitrust decisions and State aid titles to data/eu-antitrust.json.gz from the Publications Office (monthly; needs pdftotext; a decision's text the file holds is never asked again)
npm run sync:eu-courts     # rebuild data/eu-courts.json.gz from the Publications Office's yearly judgment lists and CELLAR's texts (monthly, and after sync:tickers; needs pdftotext; an operative part the file holds is never asked again)
npm run sync:13f           # rebuild data/13f/ from the SEC's Form 13F data sets, fails-to-deliver files and share-count frames (monthly; a zip its cache holds is never asked again; 5 GB of cache, 10 GB of memory)
npm run sync:insiders      # rebuild data/insiders/ from the SEC's insider transactions data sets (quarterly; a zip its cache holds is never asked again; 6 GB of memory)
npm run sync:nport         # rebuild data/nport/ from the SEC's Form N-PORT data sets (quarterly, after sync:13f, whose map and frames it reads; a zip its cache holds is never asked again; 5 GB of cache, 8 GB of memory)
npm run sync:supreme-court  # rebuild data/supreme-court.json.gz from govinfo's U.S. Reports and the Court's slip lists (monthly; needs pdftotext; a case's PDF the file holds read is never asked again)
```

The `check-*.ts` scripts in the `check` chain are offline by construction (network/fetch is
mocked where needed) — safe anywhere, including CI. When adding a verification, follow that
pattern: a `scripts/check-<thing>.ts` wired into the `check` chain in `package.json`. Three are
deliberately outside the chain because they need more than the code: `check:live` and
`check:feeds` call the real services, and `check:ui` drives a browser against a running server.

## Key invariants

- **Licensing:** several news sources are on non-commercial free tiers. `COMMERCIAL_MODE=true`
  withholds them (enforced by `check:commercial-mode`); it must be on in any environment
  someone other than the owner can load — a private preview included — before the first such
  page load (D22, applied 2026-10-19; open `P0` in the checklist). A federal agency's own work is
  usable where its site states no licence (17 U.S.C. § 105; the owner's ruling of 2026-11-12); terms a
  site does state are still read and quoted. The terms reading of 2026-11-25
  (`docs/decisions/2026-11-25-source-licences.md`, batch 186) took DefiLlama's incident list and the
  Etherscan-keyed supply feeds off the ingest path (`WITHHELD_ONCHAIN_FEEDS`), withholds a stored row of a
  non-commercial source from a public page (`lib/licenceGate.ts`), and pauses the visitor's own NYT and
  Guardian keys on a public build until their terms are read (`lib/visitorKeysGate.ts`). Yahoo's headline
  feed and its chart prices are not cleared by Yahoo's terms: each carries a `launchBlocker` in `SOURCES`
  and an open line in the pre-release gate, and `commercialOk` on them is no clearance.
- **Events schema:** `docs/EVENTS-SCHEMA.md` is the spec — subjects, events, documents are
  three separate axes; enrichments degrade pages, never break them.
- **Money is numeric, never float** — same rule as the schema doc states.
- **The checklist is the single work log.** A checklist that overstates what is left is as
  misleading as one that overstates what is done.
