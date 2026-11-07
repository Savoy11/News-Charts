# News Charts

Research any topic on a linear timeline. For publicly traded companies, news, SEC filings, and
earnings are pegged to the stock price chart so analysts can spot what sparked a move. For
everything else, get the topic's full history as a timeline.

Built to drive traffic and ad revenue supporting the CAEP desktop app.

## Run

Needs Node 20.9 or later (Next.js 16).

```
npm install
npm run dev        # http://localhost:3000 (or -p 3001)
```

## Homepage suggestions

The "Try:" chips rotate. `lib/suggestions.ts` holds a seed pool of 34 (24 securities — household
tickers plus the biggest index funds — and 10 market-adjacent topics), securities-first per the
2026-08-08 scope. `/api/suggestions` blends in subjects that already have 10+ events in the
database, so the homepage gets richer as the site is used, and falls back to the seed pool alone
if the database is down.

`components/SuggestionChips.tsx` renders a **fixed** set on the server and only shuffles after
mount — shuffling during render would break hydration. One chip swaps every 3.8s, replaced
like-for-like by kind so the 4-security/1-topic balance holds, never re-rolling the slot it just
changed. Rotation pauses when the tab is hidden and is disabled entirely under
`prefers-reduced-motion`; the ↻ button reshuffles on demand.

## Industry graph

Every EDGAR submissions record carries an SIC code, so peer grouping is **authoritative and
free** rather than inferred — NVDA and INTC both return `3674 Semiconductors & Related Devices`.
Ingesting a company creates (or joins) that industry automatically.

Industries are ordinary `subjects` (`kind='industry'`, slug `sic-<code>`), so they inherit
timelines, relevance scoring and — later — syntheses for free. Membership is a join table
rather than a `sic` equality check, so curated groupings that span SIC codes ("AI chip makers")
can be added without a migration.

`/industry/sic-3674` shows the members and a merged sector timeline, with each event tagged by
which peers it touches. **Events touching more than one peer are the trend signal** and they
fall out of the existing content-dedup for free: ingesting AMD after NVIDIA reported "30 events,
26 new" — four stories about AI infrastructure and chipmaking materials were one event linked to
both companies, not two rows.

### Regulatory events (Federal Register)

```
npm run ingest -- --industry sic-3674
```

Pulls rules, proposed rules and notices from the Federal Register — public domain, no key,
generous limits — and links them to the **industry** subject rather than any member company.
An export-control rule is a semiconductor event that happens to matter to Nvidia, not an Nvidia
event. The sector timeline shows them tagged `sector-wide`; company events keep their tickers.

The search term comes from a stored `subject_aliases` row if present, otherwise the leading word
of EDGAR's own label ("Semiconductors & Related Devices" → `semiconductors`). Add an alias to
override a bad default rather than editing code.

**These are the first events the deterministic scorer deliberately refuses to score.** A
full-text search match doesn't prove relevance — an immigration rule mentioning semiconductors
in passing looks identical to an ITC ruling on DRAM devices. All 60 are left `NULL` for the
model tier, which means they display until something can actually judge them. That is the
relevance problem the AI layer exists for, now with real material to work on.

The one exception is a document whose **title** names the company — an FTC consent order, an
NHTSA petition, an ITC investigation naming it as respondent. `npm run ingest -- --ticker F` asks
for those too (`lib/frCompany.ts`), never an airworthiness directive (an aircraft maker gets
about a hundred a year, each on one part). The daily ask reads the current year, up to 40 a run;
each year from 1994, where the API begins, or from the company's first price if later (batch 71: Dow Inc.,
listed 2019, had kept 2010's Dow Jones notices), to last year is read once, every page, and every
document whose title names the company is kept (`lib/ingest/frBackfill.ts`, kept in `fr_windows`:
at most 40 years a run, 1 s apart, newest first). A year is searched under the names the company
had then, so Walmart's 1999 FTC order is found under "Wal-Mart Stores", its EDGAR name until 2018.
Before batch 63 the feed read from 2015 and kept the newest 40, so each run read the same forty. A one-word name needs a
company word after it ("Apple Inc.", not "Light Brown Apple Moth"), and a longer listed name
owns the mention ("Portland General Electric" isn't GE's). The company's own other names are
searched in the same request (`newsNamesFor`; the API ORs phrases joined by `|`), so Alphabet's
page gets Google LLC's FTC orders; a one-word other name needs its company word straight after it
("Google LLC", not "Amazon Produce Network, LLC"). A document linked to both the company and its
sector is listed once on the company's page. These are scored without the model: the title
naming the company is the evidence.

Routine notices are grouped, one row a month (the owner, 2026-10-26): a railroad's trackage-rights
and abandonment exemptions before the Surface Transportation Board (and the ICC before it), a
utility's FERC and NRC notices. Over 1994–2025 they are 1,203 of Union Pacific's and CSX's 1,340
documents, 579 of Duke Energy's 614. A month with two or more of one board's notices becomes one
row naming how many, its description listing the first few and its link the newest; a lone
notice, and any merger, control case, complaint, order, petition or settlement, keeps its dated
row (`pageRegulations`). Grouping happens when the page is read, so the database keeps every
notice. It reads the issuing board from the row's label, which before batch 63 named the
department ("Transportation Department"); a year the walk re-reads corrects it.

### Vehicle recalls (`lib/recalls.ts`)

A carmaker's page carries the safety recalls it filed with NHTSA, back to 1966 — the one free
source found that reaches into the years between the old newspapers and GDELT and may be used
commercially. Only recalls of 10,000 vehicles or more are kept (Ford: 861 of 1,754). The dataset
names a maker, never a listed company, and files every recall under the maker's *current* name, so
`RECALL_MAKERS` maps makers to companies by hand, each with the day it became that company's:
"Chrysler (FCA US, LLC)" counts for Stellantis from 2014-10-12, when today's Stellantis N.V. (then
FCA N.V.) became Chrysler's parent, and "General Motors, LLC" counts for GM back to 1966 because
today's GM carries old GM's ticker. A maker a listed company bought counts from the closing date
the buyer's own SEC filing gives: Thor's Keystone from 2001-11-09, Jayco from 2016-06-30, Winnebago's
Grand Design from 2016-11-08, Berkshire Hathaway's Forest River from 2005-08-31. A brand a company
sold counts for it until the day it left, as a sold business does in the FDA and Federal Reserve
maps (the owner's call of 2026-10-29, batch 77), each day from the company's own filings: Volvo is
Ford's from 1999-03-31 to 2010-08-01, Land Rover from 2000-06-30 and Jaguar from 1990 to 2008-06-01,
when Ford sold both to Tata, and Saab GM's from 2000-01-28, when it bought the half it did not own, to
2010-02-22. Their titles name the brand ("Recall of 220,407 Volvo vehicles: ISOFIX guide"), which a
reader of today's Ford page would not otherwise know: 56 recalls on Ford's page and 12 on GM's, 29 and
9 investigations. Before 2000 GM held half of Saab, a joint venture carried at equity, and those years stay
out. Scored without the model, as a filing is.

The defect investigations NHTSA opened into the same makers come from the same open-data portal,
through the same map and its dates (`lib/investigations.ts`, batch 66): preliminary evaluations,
engineering analyses, defect-petition reviews and recall queries, back to 1975. Toyota's RQ10003,
"Unintended and Uncontrolled Acceleration", opened 2010-02-16. By the owner's call (2026-10-26) they
sit under the Recalls tag, one row on the day an investigation opened, its closing and the recall
NHTSA links to it said in that row. On the chart each is a small dot ranked like news, never the R
a recall gets: an investigation opened is no recall. Measured 2026-10-27: 1,766 for 18 companies,
1,579 of them before 2017 (Ford 684, GM 651, Toyota 114, Honda 113, Stellantis 50 from 2014).

### Federal Reserve enforcement actions (`lib/fedActions.ts`)

A bank's page carries the Federal Reserve Board's enforcement actions against it, back to 1993:
cease-and-desist orders, written agreements, civil money penalties ("Federal Reserve:
Cease-and-desist order and $342 million civil money penalty", JPMorgan's of 2015-05-20), with the
organisation the Board named and the day an order ended beneath. They come from the two keyless
files behind the Board's enforcement-action search (public domain, cited to the Board), read once a
process. A day's actions against a bank are one row. One against a person who worked at a bank is
not the bank's. The Board names an organisation and its city, never a listed company, so a bank
reaches a page only through the hand-checked map in `lib/fedActions.ts`, by CIK, with the same
rule as recalls: a company's own history counts, an acquisition's past never does. SunTrust's orders
are not Truist's, AmSouth's are not Regions', and "Huntington Bancshares, Inc., Huntington, Texas"
is not Huntington. Scored without the model. Measured 2026-10-27: 72 events on 18 of the 25 mapped
US banks, 51 of them before 2017 (JPMorgan 10, Citigroup 10, Wells Fargo 7, Goldman Sachs 7).

The foreign banks with a page here are mapped too (batch 74): the bank, its US holding company and
branches, and a US bank it bought from the day it did, each day read from its own SEC filing.
Bankers Trust's agreement of 1994 is not Deutsche Bank's, which bought it in 1999; RBC Centura's
penalty of 2007 is RBC's, between its purchase in 2001 and its sale to PNC in 2012; Credit
Suisse's actions are UBS's only from 2023-06-12; Compass Bank's are BBVA's from its purchase on
2007-09-07 to its sale to PNC on 2021-06-01 (batch 78). Measured 2026-10-30: 38 events on the 14 of
them, 28 before 2017 (HSBC 7, Deutsche Bank 7, Santander 4), eight with a penalty of $100 million or
more.

The listed banks the Board has acted against that the map left out are mapped too (batch 98): 23
of them, most of them regional, each by its own legal name, or its bank named after it, and its home
city. Arrow Financial's written agreement of 1992, the agreements of 2009–2012 with Hanmi, Central
Pacific, Old Second, Plumas and Orrstown, MetLife's order of 2011 and penalty of 2012 while it was a
bank holding company, Jack Henry's agreement of 2013, Crédit Agricole's five from 2000. A namesake
elsewhere stays off: TCSB Bancorp of Traverse City is not CSB Bancorp, and Commerce Bancshares of
Catoosa, Centennial Bank of Lubbock and Community West Bancshares of Goleta are no mapped company's.
Measured 2026-11-05: 39 events on the 23, 32 before 2017; 152 on 56 of the 63 mapped banks in all.

### FDA recalls (`lib/fdaRecalls.ts`)

A drug, device or food company's page carries its Class I and II recalls from the FDA's weekly
enforcement report, back to mid-2012: "Class I device recall: MiniMed 780G Insulin Pump (3
products)", with the recall's reason beneath and a link to the report's page for it. Class III,
unlikely to cause harm, is left out. The report names a firm, never a listed company, in many
spellings (Medtronic files under more than 25), so `FDA_FIRMS` maps 73 companies by hand: a phrase
the company's firm names contain, the look-alikes that are other companies ("Hershey Creamery",
Germany's "Merck Millipore"), and the days a bought firm joined or a business left. Covidien counts
for Medtronic from 2015-01-26, Hospira for Pfizer from 2015-09-03, and "GE Healthcare" for GE until
the spin-off on 2023-01-03 and for GE HealthCare after, each from the company's own SEC filing.
A business sold on is followed to its buyer where the buyer is listed: J&J's Cordis counts for
Cardinal Health from 2015-10-02, its Codman for Integra from 2017-10-02, its old Ortho-Clinical for
QuidelOrtho from 2022-05-27, and its consumer business for Kenvue from Kenvue's IPO on 2023-05-08.
A unit filing under its own name counts too, once mapped: Teleflex's Arrow International, Stryker's
Howmedica Osteonics, BD's CareFusion (from 2015-03-17), GE's "GE Medical Systems" and Datex-Ohmeda.
Batch 70 added those and 33 companies (Danaher, Medline, ICU Medical, Fresenius Medical Care,
Bausch Health, GSK and Haleon, Sanofi, Dr. Reddy's, Unilever, Dole and others). A majority-held
listed unit's recall is both companies' while the parent holds most of it, as Kenvue's was: Envista's
until Danaher's split-off, Bausch + Lomb's still. About 6,600 recalls in all (2026-10-27): Philips
590, Medtronic 533, Johnson & Johnson 511, Stryker 467, Danaher 377, BD 376, Medline 254. Scored
without the model, as a filing is.

Batch 76 added the two companies batch 70 left out for a rule, by the owner's calls of 2026-10-29.
Siemens Healthineers' recalls count from its listing on 2018-03-16, the one day the map takes from
a company's annual report rather than an SEC filing, since none dates it; its earlier recalls were
Siemens AG's, which has no page here (298 from the listing, 2026-10-30). Fresenius SE has Fresenius
Kabi's recalls and, while it controlled Fresenius Medical Care through FMC's general partner, FMC's
too, until FMC's deconsolidation on 2023-11-30 (125).

### FDA new-drug approvals (`lib/fdaApprovals.ts`)

A drugmaker's page carries the new drugs and new therapeutic biologics the FDA's drug centre
approved on its application, from 1985: "FDA approves Prozac (fluoxetine hydrochloride), a new
molecular entity", on its approval day, with its indication and review beneath, and a link to the
application's Drugs@FDA page. The source is CDER's compilation of new molecular entities and new
biologics, one workbook of 1,387 approvals read once a year into the committed
`data/fda-nme-approvals.json` (`npm run sync:fda-approvals`; the workbook's sheet is read by
`lib/xlsx.ts`, with the repository's own zip reader, no dependency). Its applicant is the one the
approval letter names, so an approval is the page of the company that applied, not of the
company that holds the drug today: Lipitor (1996) was Parke-Davis's, Celebrex (1998) Searle's, and
neither is on Pfizer's page; Humira (2002) is Abbott's, not AbbVie's.

An applicant is the company when, on the approval's day, it is the company's name by the caption
rule, one of the FDA recall map's firms on its days (`FDA_FIRMS`), or a name only approvals use
(`APPLICANT_NAMES`): the company's own other names ("Zeneca", "Lilly", "Bristol-Myers", "Ortho",
"R.W. Johnson") and the units it bought, from the day each deal closed by the bought company's own
filings: Celgene on Bristol-Myers Squibb from 2019-11-20, Wyeth on Pfizer from 2009-10-15, Loxo
Oncology on Lilly from 2019-02-15, Millennium and Ariad on Takeda, Human Genome Sciences on GSK,
Advanced Accelerator Applications on Novartis from 2018-01-22; and, since batch 107, Alexion on
AstraZeneca from 2021-07-21, Anacor on Pfizer from 2016-06-24, Bioverativ (2018-03-08) and Ablynx
(from its Form 25 of 2018-06-12) on Sanofi, and Jazz's Irish company on Jazz. Batch 105 gave the recall map's
Alcon (Novartis from 2010-08-26) and Genzyme (Sanofi from 2011-04-08) the start days the recall
reports, beginning in 2012, never needed. Joint ventures are no one's (DuPont Merck, Astra Merck,
Lilly ICOS, TAP), and two applicants are refused by name (`NOT_THE_APPLICANT`): DuPont's
pharmaceuticals of 1986–2001 are not DuPont de Nemours's, whose record is DowDuPont's of 2015, and
Block Drug's Actinex (1992) is not Block, Inc.'s; since batch 115, nor is old Biogen, Inc.'s past
Biogen's: IDEC Pharmaceuticals, Biogen's record, bought it on 2003-11-12 and took its name, so
Avonex (1996) and Amevive (early 2003) are no page's. From the first prices of the 26 drugmakers
Yahoo gave: 450 approvals, 314 before 2017, 71 before EDGAR (1994); most on Merck 58, Johnson &
Johnson 47, Novartis 44, Pfizer 42, Bristol-Myers Squibb 39 and Lilly 34. Organon's approvals of 1990–2001
(Remeron, NuvaRing…) are Akzo Nobel's, which owned it until Schering-Plough bought it on 2007-11-19
(batch 108). Schering-Plough's own, by its US company "Schering" (Claritin, Zetia…), and Organon's
Saphris of 2009 are on Merck's page as Schering-Plough's, labelled so, before the 2009 merger
(batch 110, the owner's call); Victrelis (2011) is Merck's own. Public domain by the FDA's website
policies; no key.

### FDA efficacy supplements (`lib/fdaSupplements.ts`)

The approvals that follow a new drug's often move a drugmaker's stock more: a new indication, a new
population, a new dose. A page carries each efficacy supplement the FDA approved to one of the
compilation's drugs, on its day: "FDA approves an efficacy supplement to Keytruda (pembrolizumab)",
with the supplement's number, the review and the orphan mark beneath, and a link to the letter
Drugs@FDA lists for it (always at https://), or to Drugs@FDA's page where none is listed. The title
says only what the data says, the owner's call: Drugs@FDA classes a supplement "EFFICACY" and no
more, so a row never says "new indication", which only the letter can. The source is Drugs@FDA as
openFDA publishes it, one zip of about 9 MB read monthly into the committed
`data/fda-supplements.json` (`npm run sync:fda-supplements`): 3,132 supplements on 861 of the
compilation's applications.

Drugs@FDA's sponsor is today's holder, and no field says when a drug changed hands. A supplement
is a company's only where the holder never left it, and then by batch 105's rule unchanged, on the
supplement's own day, from the company's first price. The holder never left when today's sponsor is
the compilation's applicant by name (legal, kind and place words and Drugs@FDA's shortenings left
out: "NOVARTIS PHARMS CORP" is "Novartis Pharmaceuticals Corporation"), one of the company's own
names (Celgene's Revlimid, "BRISTOL MYERS SQUIBB" today, is BMS's from 2019-11-20), or one of
three short forms read by hand ("LILLY", "BRISTOL", "NOVO"). Humira, Abbott's then and AbbVie's now,
lands on no page; neither do Merck's drugs now Organon's, nor the moves inside one company that no
name shows (PF Prism's, Janssen's, "MSD SUB MERCK"). From first prices: 1,191 supplements on 48
pages, 420 before 2017, 131 before 2005; most on Bristol-Myers Squibb 172, Merck 171, Novartis 116,
Lilly 97, Johnson & Johnson 96, AstraZeneca and Gilead 71. Schering's before the 2009 merger are on
Merck's page with batch 110's label. Public domain under CC0 (openFDA's licence); no key.

### Justice Department releases (`lib/doj.ts`)

A company's page carries the Justice Department press releases in which it is a party, back to
2009: "Goldman Sachs Charged in Foreign Bribery Case and Agrees to Pay Over $2.9 Billion",
"Department of Justice Files Nationwide Lawsuit Against Walmart Inc.", "Justice Department Sues to
Block UnitedHealth Group's Acquisition of Change Healthcare". The API matches a name anywhere in a
title, and most matches are about someone else — a former employee, a bank robbery, a crime
committed on Facebook, an "Apple Valley" resident — so a release is kept only when its title makes
the company the subject of the verb (it pays, pleads, settles, is charged), the object of an
action (a lawsuit against it, a settlement with it, "U.S. v."), or the owner of a deal. A one-word
name must open the title or a clause, since "Visa" and "3M" are also a document and the end of
"$5.3M". The company's own other names count ("Facebook" for Meta), and the release the national
office posted wins over the same story from a U.S. Attorney's office: one a day per company.
Tuned on 912 titles naming 41 large companies and tried on 40 others; neither set kept a release
that was not about the company. A release is a regulation event and is scored without the model.
The SEC releases' map of a bank's units is read here too (`lib/releaseNames.ts`, batch 82): the
units are asked for whatever their days, and a release counts only inside them — Wachovia Bank's
2011 admission is Wells Fargo's, and the record $13 billion settlement "with JPMorgan" of 2013
JPMorgan's. As the other release rules read, a release counts only from the company's first price
(batch 90): Citizens Republic Bancorp's settlement of 2011 with its own Citizens Bank is not Citizens
Financial Group's, listed in 2014, and a company with no prices yet is asked again on the next run.
A bank's notes record is asked nothing. A name under five characters stands in for no
longer one when the API is asked, since its ask stops at one page when crowded.

The API holds nothing before 2009, so the releases of 2001–2008 come from the Department's own
archive, one page a month at `www.justice.gov/archive/opa/pr/YYYY/Month/` (`lib/dojArchive.ts`,
batch 94). The archive is closed: each of its 96 months is read once for every company and kept
(`doj_archive_releases` and `doj_archive_months`, `lib/ingest/dojArchiveWalk.ts`), at most 24 months
a process, a second apart, a month stored only when its page answered with releases it could read.
Two layouts: 2001–2004 a list, "#807: 12-30-04 HEALTHSOUTH TO PAY…", mostly in capitals; 2005–2008
day headings over each title, from mid-2005 with its first lines, kept as the teaser. The old pages
write Windows-1252's quotes, read as quotes, and the 2005–2008 pages' possessive "VERIZON&#8216;S"
as one (batch 100). 5,712 releases; the 5 rows a slip leaves without a day
(a "02-30-02") are left unread, not guessed. Each company keeps the kept releases the rule above
makes it a party to, under the names it had that year (Wal-Mart's of 2001–2004 under its own
"Wal-Mart", BB&T's under Truist's former name), from its first price on: against every company in
the index, 111 releases on 73 pages, every year of the eight (AEP's $30 million criminal penalty of
2005, Weyerhaeuser's Kalamazoo River settlement, Akzo Nobel's antitrust plea, Whirlpool's Maytag and
Verizon's MCI cases; Walmart 6, Tenet 5, Exxon Mobil 4). A one-word name that is only an industry's
word for a company, The Bancorp's "Bancorp", names it after "the" but not after another capitalised
word: "Berkshire Hills Bancorp and Legacy Bancorp" are two other banks (batch 100). Same source,
`doj_press`, under the same terms.

A one-word name that is an everyday word (`isEverydayWord`, `lib/wordNames.ts`) is read more
strictly (batch 94). In a title written in capitals, as the Department's were to 2004, it names the
company only with a legal word after it: "TARGET CORPORATION" is Target's, "CITY AGREES TO PAY" is not
City Holding's. In any title, as the object of an action, it is the word when "the" or another
capitalised word comes before it or "of" after: "Lawsuit Against the City of Marion" and "Suit
Against Newport News Shipbuilding" are no company's, while "Justice Department Sues Visa for
Monopolizing Debit Markets" stays Visa's. Without it, City Holding would take 46 of the archive's
releases about cities.

### SEC press releases (`lib/secPress.ts`)

A company's page carries the SEC's own press releases in which it is the party, back to 1997: "SEC
Charges Goldman Sachs With Fraud in Structuring and Marketing of CDO Tied to Subprime Mortgages",
"Morgan Stanley Pays $50 Million To Settle SEC Action", "SEC Settles Enforcement Proceedings against
J.P. Morgan Chase and Citigroup". The newsroom lists releases by year, 25 a page, for every company
at once, so the listing is read once for all of them (`lib/ingest/secPressWalk.ts`, kept in
`sec_press_releases` and `sec_press_years`): each past year once, every page, and the current year
again a day after its last read, from its newest page to the first release already kept. At most
120 pages a process, 1 s apart; 1997–2026 is 293 pages. Each company then keeps the kept releases
whose headline makes it the party, under the names it had that year (its EDGAR former names count
until the day they stopped, as in the Federal Register walk), from its first price on.

A release is the party's when the company pays, settles, agrees or is charged (the Justice
Department rule's subject test), or when the SEC charges, sues or sanctions it, or brings
proceedings, an action or an order against it; two parties a comma joins ("Morgan Stanley,
Citigroup Charged") are both its subject. A bank's securities units count while it owned them,
each day from its own filings (`lib/releaseNames.ts`, batch 82): Banc of America Securities, and
Merrill Lynch from 2009-01-01, for Bank of America; Wachovia from 2008-12-31 for Wells Fargo; Smith
Barney until 2009-05-30 and Citigroup Global Markets for Citigroup; Morgan Stanley Smith Barney from
2009-05-31; Morgan Keegan for Regions from 2001-03-30 to 2012-04-01. By the owner's calls of
2026-11-01, "J.P. Morgan" and "JPMorgan" are JPMorgan Chase's from its merger with J.P. Morgan & Co.
on 2000-12-31, a bare "UBS" is UBS Group's and Credit Suisse its own from 2023-06-12, and the banks'
notes records (UBS AG's AMUB, Credit Suisse AG's GLDI, and from batch 83 Barclays Bank PLC's ATMP)
take none. Merrill Lynch's Enron charge of 2003 stays Merrill Lynch's. Batch 83 added the units the
SEC's case captions name in full (J.P. Morgan Securities, UBS Financial Services, Wells Fargo's
brokerages, Deutsche Bank Securities, State Street Bank and Trust, BNY Mellon Securities, Barclays
Bank and Barclays Capital). The map is read by the release rules alone, never by headline scoring.
Batch 85 added the units the 2026-11-01 audit found missing (Morgan Stanley DW, Citibank, N.A. from
1998-10-08, Salomon Smith Barney, BofA Securities, and Goldman Sachs's clearing firm and fund adviser),
and initials as the SEC spaces them ("J. P. Morgan", "JP Morgan Chase"). Batch 88 added the other
listed banks', brokers' and asset managers' own units, 34 companies' (`BANK_UNITS`): their banks
(Regions Bank, Frost Bank, Centennial Bank, Five Star Bank, PlainsCapital Bank, Banco Popular de Puerto
Rico…) and their broker-dealers and advisers (Ameriprise Financial Services, Fifth Third Securities,
Franklin Advisers, KeyBanc Capital Markets, U.S. Bancorp Piper Jaffray until its spin-off at the end
of 2003…), each bought or sold one between the days its filings give, read through EDGAR's full-text
search. American Express Financial Advisors' cases before the 2005 spin-off are on both American
Express's and Ameriprise's pages, and Prudential Securities' on Prudential Financial's, the owner's
calls; those two units, and batch 93's Synchrony Bank and PayPal (the owner's rule that a case goes
on every company it involves), are the only names read before their company's first price
(`beforeListing`), so the case of 2004-02-12 reaches Ameriprise, listed 2005-09-15, and Prudential
Securities' three of 2000–2001 reach Prudential, listed 2001-12-13. Johnson Controls, Inc.'s order of
2016-07-11 stays on JCI's page: the business merged that September into the record JCI now uses. Lazard Capital Markets was LFCM Holdings', not Lazard's, and Fiserv Securities' case of 2005
came after Fiserv sold it: neither is on a page. Batch 89 added the units the Consumer Financial
Protection Bureau charges, 22 more companies' and ten names for six banks already mapped: Capital One
Bank, American Express Centurion Bank, U.S. Bank National Association, Chase Bank USA, CitiMortgage,
Goldman Sachs Bank USA, the mortgage insurers (MGIC's, Genworth's, Radian's, Old Republic's and AIG's
United Guaranty until its sale at the end of 2016), Toyota's and Honda's US lenders, Verizon
Wireless, National City Bank on PNC's page from its purchase on 2008-12-31, and OneMain's from
2015-11-15; they add TD Bank's SEC case and press release of 2013 and U.S. Bank's own SEC order of
2005. Batch 90 added four more companies', which the Bureau's titles name and their own filings
list: Mastercard International, Conduent Business Services and Conduent Education Services,
Sterling Jewelers (from Signet's first filing that names it, 2003-04-24) and Acima (Upbound's from
2021-02-17). Read against every company
in the index under its current names, 266 of the 6,897 stored releases land on 129 companies, 161 of
them before 2017 (Daimler's and Novartis's bribery charges since batch 100 reads "AG" as a legal word) (Bank of America 28, Morgan Stanley 18, Citigroup 14, JPMorgan 13, UBS Group 12,
Wells Fargo 10, Goldman Sachs 9, Deutsche Bank 7), each read by hand (batch 78, after the 2026-10-30
audit; Deutsche Bank's since batch 81, when its everyday name lost its "AKTIENGESELLSCHAFT"; the
banks' units since batches 82 and 85). `check:sec-press` replays the whole stored listing against
the index and pins the count.

The listing sorts a year by day alone, so where releases tie on a day across a page boundary the
next page shows some again and never shows others: 2006-198 came twice and 2006-200 not at all.
Each page states its view's own count ("1 to 25 of 258 items"); a past year whose pages show fewer
distinct releases is filled from the months its repeated releases fall in (`lib/listingGaps.ts`,
batch 85), and the count is kept (db/034). The three releases the year pages never showed came
back that way; one of 2024 is still missing from its month, and the walk reports it. A fund's
series is never the party of a release, nor of a case below or a Board release: its page knows
only its series name, and "Growth Fund" is another firm's (batch 85).

What is refused: a release about a company's people ("SEC Charges Former Carter's Executive", "Board
Member of Goldman Sachs and Procter & Gamble Charged"), a name followed by "of" ("SEC Charges City of
Miami" is not City Holding), by a hyphen or an "-ing" word ("Crypto-Focused Advisory Firm"), the
SEC's own divisions ("Division of Risk, Strategy, and Financial Innovation"), and a name more than
one listed company has ("First Bancorp" is three banks'), and a short name a bigger listed company's
name begins with, unless a legal word of its own follows it: "Prudential to Pay $600 Million" is no
more Prudential plc's than Prudential Financial's, so it lands on no page; "Crown Holdings to Pay"
would still be Crown Holdings', beneath Crown Castle. The bigger company must rank above the company
asking as well, and is never one of its own names: "UBS Agrees to Pay" is UBS Group's, since nothing
ranked above UBS Group begins "UBS". The Justice Department rule refuses the same. A release's day is
the day in Washington, and its identity is its number and its day, since the SEC has given one
number twice. A release is a regulation event and is scored without the model.

### SEC litigation releases and administrative proceedings (`lib/secCases.ts`)

The SEC's record of each case it brings: a litigation release for each step of a suit in court,
an administrative proceeding for each order it issues itself, back to 1995, the first year either
listing holds. Most press releases have one behind them, and most of these have no press release:
the 2010-11-04 customs-bribery charges against Transocean, Noble and Tidewater have no press release
naming any of them. Both listings are read by year for every company at once, as the press releases
are (`lib/ingest/secCasesWalk.ts`, kept in `sec_cases` and `sec_cases_years`): 1995–2026 is 342
pages, 100 rows a page, the most in one year 11 pages (measured 2026-11-01). They showed 30,654
distinct rows of the 30,750 the listings count; the 93 they repeated others in place of came back
from the 75 months that hold them (batch 85, as for the press releases above), so 30,747 are kept,
and 3 the months' own pages never showed are reported. Each row
gives a caption listing the defendants or respondents ("Huntington Bancshares, Inc.; Thomas E.
Hoaglin, Michael J. McMennamin, and John Van Fleet, CPA"), and a company keeps the rows that name it
as a party of its own: its name, or its full legal name, followed only by legal words (Inc., Corp.,
LLC, plc, N.A., S.A.), from one entry of the caption to the next. "Southern Financial Group, Inc."
is not Southern Company, "Reliance Holdings, LLC" not Reliance, "Lucent Technologies Inc." not
Lucent, Inc.; a stock is not a party ("Unknown Purchasers of Securities of Martek"), nor a relief
defendant, nor an amicus brief; a one-word name with no legal word counts only standing alone
("Sanofi"), so "Dow, Mitchell B." is a person and "Fox, Reusch & Co." another firm. A bank's units
reach it through the release rules' map, while it owned them. Namesakes the rule cannot tell from
the company — another Acorn Energy, "McDonalds Ltd.", the American National Steel of 2001, lists of
revoked registrations naming a shell called "Telos, Inc." — were read by hand and are kept off by
CIK (`NOT_THE_COMPANY`). A company's rows of a day make one event, titled by its own party ("SEC
litigation release: Transocean Inc."), with the whole caption, each release number and a
proceeding's file number in its description. Read against every company in the index under its
current names, the 30,747 rows give 1,150 company days on 371 companies, 559 of them before 2017
(Bank of America 73, Morgan Stanley 73, JPMorgan 52, Citigroup 49, Wells Fargo 47, UBS Group 47,
Goldman Sachs 20); a company's former names add more, and its first price keeps it off the years
before it listed. A party ends before its other name ("…, L.P. f/k/a Spear, Leeds & Kellogg") as it
begins after one. `check:sec-cases` replays every row against every company and every fund series
in the index and pins the count. A case is a regulation event and is
scored without the model.

### Federal Reserve Board press releases (`lib/fedPress.ts`)

The Board's own announcements since 2006, the first year its press-release feed holds
(www.federalreserve.gov/json/ne-press.json, one file of about 1 MB, read once a process for every
company). Two kinds reach a company's page. An order on a banking application, kept when the
company is the applicant ("Approval of proposal by Wells Fargo & Company to acquire Wachovia
Corporation", 2008-10-12) or what the applicant buys ("…by Mitsubishi UFJ Financial Group to acquire
voting shares of Morgan Stanley", 2008-10-06, on both pages); each party is read as a case caption
is, its name or its legal name with legal words after it, so "Banco Popular Español" is not Popular,
Inc. and Michigan's "Citizens Banking Corporation" not Citizens, Inc. And a policy release that names
the company as the one the Board acts on, by the Board's own phrase before the name: the rescue of
Bank of America (2009-01-16), the joint statement on Citigroup (2008-11-23), "requiring Bank of
America Corporation to resubmit its capital plan" (2014-04-28), Morgan Stanley's stress capital
buffer; a title that only mentions a bank ("will voluntarily recuse himself from participating in
matters specific to Wells Fargo") is not one. An order filed under a bank batch 69's hand-checked map
gives the company counts on its days ("Goldman Sachs Bank USA", BB&T's orders until Truist), and a
company's former legal names count in the years it had them. "Approval of proposal by Fortis"
(2007-12-04) is the Belgian bank, and is kept off Fortis Inc. by CIK (`NOT_THE_COMPANY`). Enforcement
actions are not read here (batch 69 reads them from the Board's own files), nor monetary policy.
A release carries its time where the feed gives one, so a release after 4 p.m. is marked after the
close. Read against every company in the index under its current names, the 2,219 releases of the
types read give 252 matches on 112 companies, 138 before 2017, 208 of them orders, each read by hand;
`check:fed-press` replays them and pins the count. An order filed under a bank whose name is not its
holding company's ("Regions Bank", "Frost Bank", "Banco Popular de Puerto Rico") is the company's
through the release rules' map since batch 88, which added 27 of them; "Federal Reserve Board approves
Banco Popular de Puerto Rico to acquire…" names its applicant by the Board's verb. A fund's series takes none (batch 85): replayed against all 19,540
series names in the index, the feed gives them nothing, and the case captions would have given 10
other firms' cases. A release is a regulation event and is scored without the model.

The decade before the feed, the decade of the mergers that made today's largest banks, is read
from the Board's ten yearly pages (www.federalreserve.gov/newsevents/press/all/1996all.htm to
2005all.htm; batch 99, `lib/fedOrders.ts`). The archive is closed, so it was read once, by
`npm run sync:fed-orders` (479 pages a second apart: the ten lists and each order's own page), into
the committed `data/fed-orders-1996-2005.json`: the 469 orders the pages list, each with its day,
title, link and its own page's first sentence, which gives every party and its city — "…the
proposal of Norwest Corporation, Minneapolis, Minnesota, to acquire Wells Fargo & Company, San
Francisco, California" (1998-10-14). Each company's ingest reads them beside the feed under the same
rule, the title's parties and the sentence's: the sentence is kept whole, since an order can name
fifteen banks ("Barnett Banks, Inc., …; BB&T Corporation, …; First Citizens Bancshares, …", 1997-10-06)
and every listed one is a party, and the page shows it cut at 400 characters. A company's EDGAR
former names count in the years it had them, so NationsBank's orders are Bank of America's, Norwest's
Wells Fargo's, BB&T's and Southern National's Truist's, and the Royal Bank of Scotland's NatWest's;
its first price bounds them, so Citizens, listed in 2014, takes none. Five namesakes, told apart by
the city each sentence gives, are kept off by CIK (`NOT_THE_COMPANY` in `lib/fedPress.ts`): the
First Financial Corporation of Stevens Point, Wisconsin (not Terre Haute's), the Horizon Bancorp of
Beckley, West Virginia, the Republic Bancorp of Munden, Kansas, the Northwest Bancshares of
Vancouver, Washington, and the IBT Bancorp of Irwin, Pennsylvania (not Isabella Bank's). Under the
committed indexes' names the 469 give 141 matches on 59 companies (Wells Fargo 10, Royal Bank of
Canada 7, JPMorgan and Popular 6); with every name each company has filed under, 179, each read by
hand, before the first prices. Two orders have no sentence: FirstMerit's page of 1998-12-07 states
no approval, and the release of 2003-09-08 is a guide, not an order. SierraCities.com's page of
2000-04-12 lost its section signs on the Board's side ("12 U.S.C. � 1842") and is read with them.
`check:fed-press` rebuilds the file from the saved pages (`scripts/fixtures/fed-orders-pages.json.gz`)
and pins the count.

### CFPB enforcement actions (`lib/cfpb.ts`)

The Consumer Financial Protection Bureau's orders and suits since its first, of 2012-07-17, against
the banks, card issuers, lenders, servicers and debt buyers whose consumer business it regulates —
which neither the Board's actions (holding companies) nor the SEC's cases (broker-dealers) reach.
Read from the Bureau's list (www.consumerfinance.gov/enforcement/actions/, 25 a page, 386 actions on
16 pages on 2026-11-05) once for every company (`lib/ingest/cfpbWalk.ts`, db/035): every page once a
month, which also picks up a summary the Bureau corrects, and its first page once a day, with
further pages only while each holds no action already kept. Not the Bureau's feed: it dates an item
by when its page last changed (Apple's order of 2024-10-23 as 2025-09-22), where the list gives the
day filed. Each title names the respondents ("JPMorgan Chase Bank, N.A.; and Chase Bank USA,
N.A."), and a company keeps an action when the title names it as a case caption names a party —
its name, or its legal name with legal words after it, or a unit the release rules' map gives it,
since the Bureau charges the bank, not its holding company ("Capital One Bank", 2012-07-18). The
Bureau's "dba" and "d/ba/" are read as "d/b/a". A company's actions of a day make one event
(American Express's three of 2012-10-01). Read against every company in the index under its current
names, the 386 actions give 95 company days on 52 companies, 38 before 2017 (Bank of America, Wells
Fargo and Citigroup 6 each, JPMorgan 5, U.S. Bancorp 4), each read by hand; without batch 89's
units they gave 44 on 21, and batch 90 added Mastercard International, Conduent's two units,
Sterling Jewelers and Acima (from its purchase on 2021-02-17). A case naming several companies goes
on each of their pages, the owner's rule of 2026-11-05 (batch 93): GE Capital Retail Bank's two of
2013 and 2014 are on GE's page, its owner until the split-off of Synchrony on 2015-11-17, and PayPal's
of 2015-05-19 on eBay's, its owner until the spin-off of 2015-07-17. Synchrony's and PayPal
Holdings' pages carry theirs too, though each fell weeks before the company listed, through the
units marked to count before listing. Ingest reads a company's other actions from its first price
on, so 92 of the 95 reach a page, on 49 companies, 36 before 2017; the three before their company's
first price are Ally's of 2013-12-20, Chime's of 2024-05-07 and Santander Holdings USA's of
2016-07-14. Not their own, and on no page: Discover Bank's, Hudson City Savings Bank's and Sprint's,
each an acquisition's past; Flagstar Bank, F.S.B.'s of 2014, before today's FLG took the name; and
the tax-refund lender "formerly d/b/a H&R Block" (by CIK, `NOT_THE_COMPANY`). `check:cfpb` replays
every action against every company and fund series, and pins both counts with each company's first
trading day. Public
domain, cited to the Bureau; no key. An action is a regulation event and is scored without the
model.

### EPA civil enforcement cases (`lib/epaCases.ts`)

The EPA's own record of the cases it brings, from the 1970s on: consent decrees lodged in court,
suits filed, and the final orders of its administrative cases, each with its penalty and the law it
enforces (Clean Air Act, Clean Water Act, the Superfund law…). For a chemical maker, an oil company,
a paper mill, an industrial or a utility, the regulator's record that carmakers (NHTSA), drug makers
(FDA) and banks (the Board, the SEC, the CFPB) already had. Read from EPA's case file, one 82 MB zip
of CSV tables (`echo.epa.gov/files/echodownloads/case_downloads.zip`, 137,108 cases on 2026-10-31),
once a month for every company (`lib/ingest/epaWalk.ts`, db/037) and not again while EPA has not
changed it; four of its tables are read (`lib/zip.ts`, no dependency). A case's day is its public
one: the day a court settlement was lodged (Caterpillar's of 1998-10-22, entered in 1999), else
entered or filed; the day an administrative final order was issued, else the complaint's. A company
keeps a case when one of its defendants is the company by the caption rule (`captionParty`), under
its names that year, from its first price, with two guards a case file needs: one name joined by
"and" is one name ("Pennsylvania Power and Light Company" is not Light S.A.), and a person written
surname first is no company ("RETHERFORD, DANA" is not Dana). Every listed defendant gets the case,
the owner's rule of 2026-11-05, so a Superfund site's settlement goes on each listed party's page
and says how many parties it has. A court case or a case with a penalty has its own row, linked to
EPA's case report; a month's orders with no penalty are grouped into one row, as the Federal
Register's routine notices are, under the month's key from its first, so a month read with one and
again with two keeps one row. A unit the company owned whose cases EPA files under the unit's
name counts from the day it owned it (`UNITS`, read by hand; the owner's call of 2026-11-06):
Sunoco, Inc.'s cases are Energy Transfer's from 2012-10-05, the day Sunoco's own 8-K gives for the
completed acquisition, ten of them from 2012-10-16 to 2020-01-13. Sunoco, Inc. is not Sunoco LP,
which was Susser Petroleum Partners until 2014 (by CIK, `NOT_THE_COMPANY`; batch 100). Batch 104,
on the owner's approval of 2026-11-06, read the operating units of 34 more companies into the same
list (52 entries), each between the days its owner held it as the owners' filings give them:
Chevron U.S.A., Texaco from 2001-10-09 and Unocal from 2005-08-10 on Chevron; Atlantic Richfield
from 2000-04-18 and Amoco from 1998-12-31 on BP; Mobil from 1999-11-30 on ExxonMobil; Shell Oil
Company from 2005-07-20 on Shell (the owner's call); Union Pacific Railroad, CSX Transportation,
Norfolk Southern Railway, Occidental Chemical, Waste Management's state companies from 1998-07-16,
Northrop Grumman's shipbuilders on Huntington Ingalls from 2011-03-31, Union Carbide on Dow Inc. from
2019-04-01. A station, store or numbered site under an oil brand is not the brand's unit
(`BRANDED_SITE`), and joint ventures (Chevron Phillips Chemical, Nucor-Yamato) are no one's. Against
every company in the index, before first prices: 7,964 rows on 683 companies, 6,817 before 2017
(ExxonMobil 288, GE 284, Chevron 269, BP 248, GM 225; 5,994 on 667 before the units, every one of
whose cases is still there; BP 4 and 3M 67 by their own names).

**The utilities' operating companies** (batch 114, the owner's approval of 2026-11-07). EPA files a
utility's cases under its operating companies, whose names do not carry the parent's: Georgia Power is
Southern's, Ohio Edison FirstEnergy's, Virginia Electric and Power Dominion's, Public Service Electric
and Gas PSEG's. 140 more `UNITS` entries on 33 companies read them, each between the days its owner
held it. Every day comes from data.sec.gov's filing lists, 63 lists and pages read: the buyer's 8-K reporting
the completed merger, the bought company's change in control, or its deregistration that day. Gulf
Power is Southern's to 2018-12-31 and NextEra's from 2019-01-01; Baltimore Gas and Electric
Exelon's from 2012-03-12; Narragansett Electric National Grid's to 2022-05-24 and PPL's after. A
company bought is never its buyer's before: Progress Energy's cases, all before 2012-07-02, are not
Duke's. Two purchases are older than EDGAR (Southern's of Savannah Electric in 1988, Northeast
Utilities' of PSNH in 1992), so those units count from their first filings in the buyer's system and
four of their cases wait for those days. "MISSISSIPPI POWER & LIGHT" is Entergy Mississippi's old
name, not Southern's. On the replay, 419 more rows on 31 companies, 261 of them a court case or a
penalty, 218 before 2017; thirteen companies had no EPA row and now do: PSEG 44 (43 from its first
price), Exelon 22, NextEra 19, NiSource and DTE 16, WEC 13, Vistra, OGE, Hawaiian Electric, MGE,
IDACORP, TXNM and Evergy.

**EPA's own figures on each row** (batch 113, the owner's approval of 2026-11-07). The same zip holds
each case's settlements (`CASE_ENFORCEMENT_CONCLUSIONS.csv`), EPA's estimate of the cost of the work a
case orders, and EPA's own summary of it. A case EPA gives no penalty total takes its one
settlement's federal and state penalty, added in whole cents; a case of several settlements keeps
none, since a sum would put other parties' settlements of other years on one row (Deepwater
Horizon's four of 2012–2015). EPA's case totals stop in the 2010s, so before this no row from 2017
on gave a penalty; now 2,125 rows do, 1,250 more, among them AEP's 2007 decree ($6,225,000 and
$750,000 on its two cases, $2.16 billion of work ordered) and Cummins's diesel decree of 2024
($1,675,000,000). The row names the work ordered on 2,805 rows, "among N parties" on a settlement of
several ("among 271 parties", Omega Chemical's Superfund site). EPA's summary is the row's
description on 6,417 rows when it says something: at least 25 characters, not a placeholder ("CASE
SUMMARY REQUESTED", "TO BE ENTERED") or a facility's address, cut at a word after 600; the characters
EPA's file lost are read back as an apostrophe, a section sign or a quotation mark. A case that now
has a penalty has its own row, and a month row of "no penalty" its cases all left moves onto the
first of their rows (`legacyDedupBasis`), so no stored row loses its history. Text is stored without
control characters: a NUL in the case "H.O.D. LANDFILL" made Postgres refuse the whole month's read
before batch 113 (db/043 also forgets the last read, so the next run reads the file whole). An acquisition's past is not the
buyer's here either: WM's record was USA Waste Services until it bought the old Waste Management and
took its name on 1998-07-16, so the old company's nine cases before are not WM's (`NOT_THE_COMPANY`
with a day, batch 108). The
first price keeps a successor off its predecessor's years: today's GM listed in 2010, so the old
GM's $11 million Clean Air Act decree of 1995 is not on it, and today's Kodak stock dates from 2013.
Public domain under EPA's open data licence; EPA's note that commercial use of documents on its
sites may be protected concerns documents, and none is copied — only the file's fields and a link.

### CPSC product recalls (`lib/cpscRecalls.ts`)

The Consumer Product Safety Commission's recalls of toys, tools, appliances, furniture and other
consumer products, from the first of 1973-06-08. Read from the Commission's keyless recall service,
every recall in one answer (`www.saferproducts.gov/RestWebServices/Recall?format=json`, 28 MB,
10,070 recalls on 2026-11-05), once a week for every company (`lib/ingest/cpscWalk.ts`, db/038). A
recall names its firms by role, and every listed company it names gets it, the owner's rule of
2026-11-05: a manufacturer, importer or distributor by the caption rule ("Office Depot, Inc., of
Boca Raton, Fla.", or "Swinton Avenue Trading, a division of Office Depot"), and a store as a whole
item of its "Sold at" line ("Target, Walmart, and … online at Bodum.com, Amazon.com": Target,
Walmart and Amazon; not Home Depot for "home goods stores", nor Target for "Target Marketplace"). A
recall the company made, imported or distributed has its own row; a store's recalls of other
makers' products are grouped a row a month, under the month's key from its first, since Target,
Walmart and Amazon each sold the products of hundreds. A store is a proper name: "coffee and home
goods stores" names no Coffee Holding. Batch 100 read every firm the recalls give the index by hand
and keeps the namesakes off by CIK (`NOT_THE_COMPANY`): Graco Children's Products is not Graco Inc.,
SLM International's toys not Sallie Mae's, "Asweets Global Inc., City of Industry" not City
Holding's; eight companies that are no retailers take no store line ("Barnes and Noble" is not
Noble's). A unit the company owned counts from the day it owned it (`UNITS`; the owner's call of
2026-11-06): Graco Children's Products' recalls are Newell's from 1999-03-24, the day Newell merged
with Rubbermaid, Graco's owner (Newell's EDGAR record and 8-K), 22 of them from 1999 to 2020; those
before are no listed company's. Against every company in the index, before first prices: 2,302 rows
on 196 companies, 723 of them as maker, importer or distributor (Mattel's first of 1978, GE's hair dryers of 1979,
IBM's ThinkPad batteries of 2006). A work of the U.S. Government, public domain; the Commission's
site refused this session's requests (403), so the basis is the law's and the federal catalog's,
not a page re-read.

### CFTC enforcement actions (`lib/cftc.ts`)

The Commodity Futures Trading Commission's orders and suits, from 1995-07-27: the benchmark-rigging,
spoofing, swaps-reporting and record-keeping cases against the banks and brokers, and the
energy-trading cases of 2001–2004 against the utilities' trading arms. Read from the Commission's
enforcement list (`www.cftc.gov/LawRegulation/EnforcementActions/index.htm`, 10 a page, 261 pages
and 2,607 actions on 2026-11-05) for every company at once (`lib/ingest/cftcWalk.ts`, db/039): the
whole list once a year, and its newest page once a day. A company keeps an action whose title makes
it the party by the Justice Department's rule, with the release map's units ("Deutsche Bank
Securities", "Merrill Lynch" from 2009), and the Commission's own forms: the company as the object of
its order ("CFTC Orders UBS to Pay"), and a registrant's name with its comma ("Goldman, Sachs &
Co."). Four guards measured on the list: a count before a name ("Six Financial Institutions"), a name
only ever after "Former", another company's unit ("Prudential Securities" is Prudential Financial's,
not Prudential plc's), and an everyday word with a possessive ("People’s Alternative"). The company
may carry "AG" or follow where it is based ("Deutsche Bank AG", "London-Based Barclays Bank PLC",
batch 100). Against every company in the index, before first prices: 88 company days on 33
companies, 47 before 2017 (JPMorgan 12, Deutsche Bank 7, Morgan Stanley 7, Barclays 6, Goldman Sachs
6; AEP's suit of 2003, NRG's of 2004, Duke Energy's and Xcel's trading units of 2003–2004). Public domain, acknowledged to the CFTC.

### The SEC News Digest (`lib/secDigest.ts`, `lib/ingest/secDigestWalk.ts`)

A source since batch 102 (`sec_digest`, the 2026-11-02 proposal 1: the owner asked for a count
first, then said go ahead on 2026-11-06). The Digest is the
SEC's daily summary of its business from 1956 — the 8-K reports filed, registration statements,
13D and 14D-1 filings, Holding Company and Investment Company Act orders, enforcement actions,
listing and delisting orders — one scanned PDF an issue on yearly archive pages
(www.sec.gov/news/digest/digarchives/digarchYYYY.shtml). `npm run digest-report -- 1985` reads one
year's issues once, a second apart, takes each PDF's text with poppler's `pdftotext` (on the host,
not a package), splits each issue into its entries and prints, per listed company and section, the
rows that name it. It stores nothing.

An entry is about one name as printed: a table row's company, a registration's registrant, a
heading cut to its parties ("CLARENCE E. LONG AND JOSEPH A. LUGO ENJOINED"), or a listing order's
item. An entry's body never names its party, so the underwriter of another company's offering and
the parent named in its subsidiary's order are no one's entry. A row names a company when it is one
of the company's conformed names, of two words or more and with the same registration tag if it
carries one ("&" dropped as the 8-K lists drop it, "COMPANY" read as "CO"), or that name read back
letter by letter through the scans' misreadings ("AIERICAI EIPRESS CO", 1990, but not "MITEL CORP"
for Intel). A heading or item names it as a case caption names a party, and a one-word name only
with its legal words, at the entry's head. A name another listed company has today names neither,
and an entry two companies' names both claim that day is neither's.

The names are dated. A former name counts only while the company's EDGAR record had it
(data.sec.gov/submissions). Before EDGAR, a record counts only under the name it filed under in its
first quarter of EDGAR's 1993–1996 company indexes, and only if EDGAR opened it by the end of 1996.
So 1985's Chase Manhattan, BankAmerica, Wells Fargo and Chubb are not JPMorgan's, Bank of
America's, Wells Fargo's or Chubb's records (in 1994 those were Chemical Banking, NationsBank,
Norwest and ACE), and the McGraw-Hill of 1990 is S&P Global's, not McGraw Hill's (a 2022 record).
`lib/predecessors.ts` adds a predecessor's names before its handover: Merck is read by old Merck's
names (batch 108), and by its record's own, Schering-Plough's, whose rows the page labels as
Schering-Plough's (batch 110). An issue's entries on one
company in one section are one row. Each matched company's first trading day comes from Yahoo, and
the rows before it — today's first-price floor for every source — are counted apart.

The count of 1985, the 250 issues (batch 87): 23,922 entries read, 517 naming a listed company in 508
rows on 258 companies — 184 8-K reports, 129 registrations, 109 registrations made effective, 30
13D or 14D-1 filings, 53 orders (most of them on utilities, under the Holding Company Act), 3 other.
199 of the rows are under a name other than today's (Minnesota Mining & Manufacturing, FPL Group,
New Orleans Public Service), and 50 of 50 sampled by hand were the company's own. Every name, undated,
would have given 594 rows. Of the 86 the dates take away, 58 are on records EDGAR opened after 1996
(Deutsche Bank's, 2002) and 28 were another company's then. The first-price floor keeps 361 of the
508. `check:digest` replays six issues, one every five years from 1965 to 1990, against every listed
company under its dated names.

Step 2, the source (batch 102). The walk reads each year's archive page, 1993 back to 1956, once
for its issues, then each issue's PDF once, newest first, 60 a process and a second apart (about
9,500 issues, a week or so of hourly runs). It keeps every entry, with the keys a company is asked
by, in `sec_digest_years`, `sec_digest_issues` and `sec_digest_entries` (db/040); the PDFs are not
kept. Only an answer is stored, or an issue www.sec.gov answers 404 for, kept as missing. A refusal
or a block page ends the process's asking; a PDF whose text cannot be read, or a year page that
fails or lists no issue, is passed over until the next run, so one bad scan or page holds back
nothing (the year page since batch 107); a host without `pdftotext` asks nothing. Each company's ingest then asks the kept entries by its names' keys and keeps those
the rule above makes its own, under the names its record had on the issue's day, from its first
price. A month's 8-K reports are one row; an order, an action or a listing order is the SEC acting,
titled by its heading; each row links to its issue's PDF. The dated names come from the committed
`data/digest-records.json`: what EDGAR's sixteen company indexes of 1993–1996 called each listed
company and each mapped predecessor (1,456 records, old Merck's added in batch 108), written by `npm run sync:digest-records`
(sixteen zips a second apart from www.sec.gov, or `-- --dir <path>` for saved ones; run after
`npm run sync:tickers`). On 1985 the source gives 512 rows on 260 companies, 361 events on 189
pages: batch 87's 508, Crane Co.'s registration of 1985-10-11, which batch 87's first pass gave
to no one because today's Crane Company (a 2023 record) seemed to share the name, and old Merck's
three 8-K reports (batch 108). www.sec.gov
answers 403 to a client without a contact address, so the walk needs `NEWS_CHARTS_CONTACT`, and
poppler's `pdftotext`, on the host that runs ingest. `check:digest-walk` replays all of 1985
through the walk's tables and the company step.

### Source planning (`lib/enrich/plan.ts`)

```
npm run plan -- --subject sic-3674              # propose only
npm run plan -- --subject sic-3674 --execute    # fetch and ingest them
```

The model proposes **which searches to run**, not what is true. It emits a source key from a
fixed list plus a plain search term; deterministic code does the fetching, and results land as
ordinary events with real URLs. Provenance is untouched — the model never becomes a source.

**`validatePlans` is a trust boundary and treats model output as hostile.** It drops unknown
sources, URLs and schemes, protocol-relative addresses, shell metacharacters, control
characters, over-long or over-short terms, duplicates, and repeats of anything already
searched — rejecting rather than repairing. Tested against 14 hostile inputs including an
SSRF attempt at `169.254.169.254` and `file:///etc/passwd`: **12 rejected, only the 2
legitimate plans accepted.**

This is the same rule as visitor-supplied sources, for the same reason: anything that could
name a URL is a fetch-anything proxy. Dry by default; `--execute` is required to touch the
network, and each executed query is logged to `source_fetches` with the model that proposed
it, so a bad suggestion is auditable after the fact.

### Explaining a signal (`lib/enrich/explain.ts`)

```
npm run explain -- --industry sic-3674
npm run explain -- --industry sic-3674 --dry-run   # prices the run, calls nothing
npm run explain -- --max-usd 3                     # raise the $1 cap
```

The first step that uses a model, and it is handed an anomaly **plus its evidence** — never a
blank page and a pile of headlines. The prompt carries one signal and only the events that
signal cites, and forbids outside knowledge, speculation about causes or prices, and market
commentary. "These events don't explain it" is an accepted answer.

**An explanation with no citations is discarded, not stored.** The model returns indices into
the event list it was shown; a reply citing an event it was never shown, carrying a link, or
running far past the length asked for is thrown away whole. The events go into the prompt as a
delimited block of JSON lines the model is told never to obey — titles come from news feeds and
source labels from Wikipedia, which anyone can edit. `synthesis_citations` uses `ON DELETE RESTRICT`, so a cited event
cannot later vanish beneath a published claim. Explanations render under their signal with each
citation as a link to the original document.

Cost is bounded structurally: the cache key is the signal plus a hash of the exact event
content shown, so an unchanged anomaly is never paid for twice — kept *or* refused, since a
discarded reply was billed the same and is recorded in `synthesis_refusals`. The whole run is
priced before the first call, stops above the same $1 cap as `npm run score` (`--max-usd` to
raise it), and reports its own token usage and dollar cost, refusals included. Requires `ANTHROPIC_API_KEY` in `.env.local`; without it the
command reports what it *would* explain and generates nothing. Signals and timelines are
unaffected — explanations are purely additive.

### Visitor preferences (`lib/prefs.ts`)

Behind the same ⚙ as the model settings, three things a visitor can add:

- **Signal sensitivity** — event floor, deviations above baseline, lookback, price-divergence
  cutoff. The Signals panel re-computes live; its header doubles as a readout
  (`floor 5 · 2σ · 30mo`) and a shortcut back into settings.
- **Their own sources** — extra Federal Register search terms merged into sector timelines.
  **Terms, not URLs.** Accepting arbitrary URLs would turn the server into an SSRF proxy, so
  visitors compose queries against sources News Charts already trusts.
- **Custom peer groups** — named ticker sets that can span SIC codes ("AI chip makers"), each
  with its own timeline and signals at `/group/<name>`.

Preferences live in `localStorage` and are **sent as parameters** to `/api/signals` and
`/api/group`; the server stays stateless. Nothing a visitor configures is stored server-side,
so one person's thresholds or feeds can never change what anyone else sees, and nothing they
type can write into the shared corpus. Same rule as the BYO-model key.

Federal Register terms are the one preference that reaches another service, so they are bounded:
at most five per request, normalised so "Export Controls" and "export controls" are one cached
fetch, and `proxy.ts` (Next 16's name for middleware) refuses a client's sixteenth *new* term
in an hour (repeats come from the cache). The same proxy caps every client at 120 requests a
minute to `/api/*` and `/search`. It is in memory and per server instance, so a host or WAF limit is the durable version.

`computeSignals` takes a scope of subject ids rather than an industry id, which is what lets a
SIC industry and an ad-hoc ticker set run through identical code.

### Trend signals (`lib/signals.ts`)

```
npm run signals -- --industry sic-3674 --since 2024-01-01
```

**Computed, not generated.** Every signal is arithmetic over the event table, and each one
carries the event ids that produced it. Statistics find *where* something happened; explaining
*what it means* is a separate step that must cite these rows. Keeping those apart is what stops
a model inventing a confident narrative from a pile of headlines — it is handed an anomaly and
its evidence, not a blank page.

Four signals today:

| Signal | Method |
| --- | --- |
| `volume_spike` | weekly event count vs a **median + MAD** baseline, per kind |
| `regulatory_burst` | same, restricted to Federal Register events |
| `cross_peer_cluster` | weeks where one event concerned several peers at once |
| `price_divergence` | a member's return vs the sector median over the window |

Two deliberate choices. The baseline uses **median absolute deviation**, not standard deviation,
because the spikes we're hunting would inflate a mean-based baseline and hide themselves. And
every spike must clear an **absolute floor** as well as the statistical threshold — without it,
2 events against a baseline of 0 looks infinitely significant and every quiet sector produces
noise.

Real output on the semiconductor sector: `INTC lagged the sector by 172.3 points`
(+120.6% vs a sector median of +292.9% since 2024). No model involved.

## Backups

Git covers the source; it does **not** cover the database. Postgres keeps its data under
`C:\Program Files\PostgreSQL\17\data` — outside both the repo and OneDrive — so without this the
ingested events, prices and relevance scores exist in exactly one place.

```
npm run db:backup
```

Writes a compressed `pg_dump -Fc` into `backups/` (gitignored, inside OneDrive so it syncs off
the machine), keeps the newest 14, and prunes the rest. `pg_dump` isn't on PATH in a default
Windows install, so the script finds it under `C:\Program Files\PostgreSQL\<version>\bin`; set
`PG_DUMP_PATH` to override, or `BACKUP_DIR` to write elsewhere. The password is passed via
`PGPASSWORD` rather than argv, keeping it out of the process list.

Each run prints what it captured and verifies the file with `pg_restore -l` before pruning
anything — a dump that can't be listed can't be restored, and an unverified backup that silently
contains nothing is worse than none.

Restore:

```
pg_restore --clean --if-exists -d "$DATABASE_URL" backups/news-charts-<timestamp>.dump
```

### Rehearsing a restore

```
createdb -U postgres news_charts_restore             # once, by a role with CREATEDB
RESTORE_TARGET_URL=postgresql://…/news_charts_restore npm run db:verify-restore
npm run db:verify-restore -- --target postgresql://…/news_charts_restore --file backups/news-charts-….dump
```

A backup nobody has restored is a guess. This **restores the dump for real into a separate,
disposable database** — overwriting it — exactly as recovery would, with `--no-owner` so a
fresh host needs none of the original roles, then compares the restored row counts with the
counts `npm run db:backup` recorded beside the dump (`….dump.counts.json`). It refuses to run
when the target is `DATABASE_URL`.

It used to replay the dump inside a rolled-back transaction against the live database. That
held exclusive locks on every production table for the whole reload, proved nothing about a
fresh host (the roles and extensions were already there), and never checked what came back
(NC-152). **Never point a rehearsal at the production database.** The `chronolens` role lacks
`CREATEDB`, so the scratch database is created once by a role that has it, on this server or
another one.

It earned its keep on the first run:

> **A dump taken before a schema migration cannot be `--clean` restored over the evolved
> schema.** A dump from before `subject_members` existed failed with *"cannot drop constraint
> subjects_pkey … subject_members_industry_id_fkey depends on it"* — the dump's DROP statements
> can't remove objects that newer, not-in-the-dump tables still reference. **Restore an old dump
> into an empty database, never over a migrated one.** A current dump verifies cleanly (157
> statements).

Contents were separately checked by expanding a dump to SQL and comparing row counts against
the live database — all 12 tables matched exactly. The rehearsal now makes that comparison
itself on every run.

## Database and ingest worker

News Charts owns a dedicated `chronolens` database and a non-superuser `chronolens` role —
the product's original name, which the live database has kept across every rename (renaming a
running Postgres role is infrastructure work, and the docs describe the database that actually
exists). **It shares nothing with any other project on this machine** — no credentials, no
schema, no data. `DATABASE_URL` lives in `.env.local` (gitignored).

Every request to a public service sends one User-Agent, `News Charts Research` and the build's
contact address from `NEWS_CHARTS_CONTACT` in `.env.local` (`lib/contact.ts`, batch 92). The SEC asks
automated clients for a contact and refuses EDGAR requests without one, so ingest needs it set. The
address is never written in the code; `check:contact` fails if one appears.

**A rule change reaches the stored pages.** Every case source (the SEC's cases and press releases,
the Justice Department's archive of 2001–2008, the CFPB's, EPA's, the CPSC's, the CFTC's actions, the
Digest, the FDA's approvals) builds a company's rows from data kept whole, so its answer is
complete: a run takes the company off that source's stored rows its rules no longer give it
(`unlinkGone`, batch 108). Only the link goes, and only for a row no other source attests; the
Justice Department's API answers, capped, and the Federal Reserve Board's live feed are never read
as complete. A batch that refuses a case (the old Waste Management's on WM) takes it off the page at
the company's next run, not only off new ones.

**A record that was another company labels that company's past** (batch 110, the owner's call of
2026-11-07). MRK's SEC record was Schering-Plough's until the 2009 merger, when it took old Merck's
name and ticker. Old Merck's record is Merck's history (`lib/predecessors.ts`, batch 108), matching
the price chart back to 1962, and Schering-Plough's past stays on the page beside it. Each row of
it says whose: "Schering-Plough: Annual report (10-K)", from "SEC EDGAR · Schering-Plough, before
its 2009 merger with Merck" (`ownPastLabelled`, at read time). Labelled rows are the record's own
filings before 2009-11-04, and the cases, approvals and Digest entries of those years that name
Schering-Plough or its Organon and not Merck. One naming both is old Merck's history too.

```
npm run db:gen      # regenerate db/001_init.sql from docs/EVENTS-SCHEMA.md
npm run db:migrate  # apply pending db/*.sql, tracked in schema_migrations
npm run ingest -- --topic bicycle
npm run ingest -- --ticker AAPL
npm run db:seed-demo # network-free demo corpus, for verifying the UI
```

### Chart overlays

The price chart carries three optional overlays, toggled above it and **off by default**:
**Volume**, **50d avg** and **200d avg**. Volume comes from the same Yahoo chart response as the
closes — no extra request — and renders on its own scale pinned to the bottom of the plot, tinted
by the day's direction, so an event can be read against whether the day actually traded. The
moving averages are computed client-side from the closes; one whose window is longer than the
available history draws nothing rather than a partial-window stub.

Dividends and stock splits arrive on that same request (`events=div,splits`) and become
`corporate_action` events with their own marker, badge and filter chip. Prices from Yahoo are
split-adjusted, so the line does not step on a split — the marker is the only thing that says it
happened. That is the point: a mechanical change should never read as a reaction to news.

Renames share that chip, now called **Corporate actions**. EDGAR's company record lists every
name a filer has used and the day it stopped (`formerNames`), and it arrives with the filings at
no extra request: "Renamed from FACEBOOK INC to Meta Platforms, Inc." goes on the timeline, and
the ingest stores each old everyday name as a search alias, so "facebook" finds a held Meta. A
change of case, punctuation or state tag isn't a rename, a fund doesn't inherit its trust's old
names, and a rename that came with a new CIK (Google → Alphabet) isn't in the record.
`npm run former-names-report -- META AAPL` prints what the record says.

An 8-K is titled by its item — "Other events (8-K 8.01)" — which says what kind of thing was
reported and not what it was. When the 8-K carries the company's press release as an exhibit
(EX-99, or EX-20 before 2004), the release's headline becomes the title instead: "Boeing Sets 787
First Delivery Date for Mid-First Quarter 2011 (8-K 8.01)", the form and item kept at the end and
the item's name moved into the description, and its link opens the release itself rather than the
8-K's cover form (`lib/secHeadlines.ts`). Only a press release gives a
headline: an exhibit counts as one when a dateline ("DEARBORN, Mich., Sept. 1, 2004 –") sits in
its first 40 lines, or, with none, a lead paragraph in which the company announces or reports
something "today", or, with neither, when the first headline under its letterhead announces
results — "JPMorgan Chase Reports Third-Quarter 2022 Net Income…", "Tesla Q1 2017 Vehicle
Production and Deliveries" — so a contract, a slide deck, a shareholder letter or a certification
filed as EX-99 gives nothing and the filing keeps its item title. A headline written in capitals is recased ("IBM", "UPS" and
"Non-GAAP" kept). A foreign company's 6-K, until now just "6-K filing", is read the same way: its
release attached as EX-99, or the announcement in the 6-K's own document once the SEC's cover page
and the signature under it are cut — "NIO Inc. Provides April 2023 Delivery Update (6-K)", "Shell announces commencement of a
share buyback programme (6-K)". A Japanese 6-K that lists its release by title ("Press release
entitled “…”") gives that title, when the entry opens its own line above any dateline (a sentence
citing an earlier release names that release, not this one); a routine one — a monthly share return, a buyback report, a set
of accounts — gives nothing. Reading one costs two to four EDGAR requests and a filing never
changes, so each is read once and the answer kept in `sec_headlines` (`db/029`); the scheduled
ingest reads up to 150 a run, newest first, and stops at the first refusal, so a long history fills
in over a few runs (Boeing's 336 took three). The first pass applies what is stored and reads
nothing.

A filing whose headline reports a period's results is typed as earnings, as an 8-K's item 2.02 is
(`announcesResults`, batch 64). A 6-K says nothing of what it carries, and an 8-K before August
2004 had no 2.02, so the release's headline is what says so: "NIO Inc. Reports Unaudited Third
Quarter 2019 Financial Results (6-K)", "Boeing Reports 1997 2nd Quarter Results (8-K)". Of the 960
headlines stored for ten companies, it marks 47 such filings (NIO 32, Novartis 8, Boeing 4, GSK 2,
Lloyds 1) and nothing else, and it agrees with item 2.02 on 117 of the 130 releases filed under it.
By the owner's call (2026-10-26), only reported results count: a profit alert, a preliminary
figure, an expectation, a guidance update or a revised forecast stays a filing, shown with its
headline; so do a trial's "topline results", a tender's, and an amended 8-K. A stored filing
re-types on its next ingest, as its title does.

### Checks

```
npm run check              # the offline suites: prompts, on-chain, licence gate, refresh windows
npm run check:ui           # 64 browser checks — needs a seeded database and a dev server
```

`check:ui` exists because every defect that reached a page in this project was invisible to
`tsc` and `next build`: a price overlay silently replaced by a notice, a chart that sized itself
to 2102px on a phone, a filter chip that rendered inactive so its rows never appeared. All of
them needed data on screen. Seed first (`npm run db:seed-demo`), start `npm run dev`, then run
it; add `-- --base http://localhost:3001` for a server on another port.

### Refresh windows and the Sources panel

Each source carries its own refresh window (`lib/ingest/refresh.ts`) rather than sharing one
per-subject TTL. Windows are set by how fast a source actually changes *and* how much quota it
has, and **quota wins where they disagree** — a feed that is silent because its budget was burned
is worse than one that is six hours stale. Wikipedia refreshes daily, Chronicling America weekly
(digitised 1800s newspapers will never change), GNews every six hours against its 100/day cap.
`npm run check:refresh` asserts the arithmetic, so the table can be argued with.

A `throttled` or `error` attempt does not count as having asked, so a rate-limited feed stays due
for retry rather than being silenced. Because a refresh covers only the sources actually due,
each ingest run prints what it skipped and why; the page reads the union out of the database, so
a partial refresh costs a page nothing.

`npm run check:wiring` asserts the other half — that the windows are *consulted*. Every defect it
was written for was one shape: a working, registered, checked source that no entry point called.
It asserts every `SourceKey` has an ingest call site or a written-down reason not to, that no
source barred from commercial use sits on the ingest path, that `refresh.ts` reaches every
subject kind an ingester exists for, and that every `EventType` has a filter chip that can show
it.

Every subject page carries a **Sources** panel showing what each feed contributed, when it was
last asked, and its attribution and licence. The states that matter are the middle two: *nothing
returned* and *rate limited* look identical on a page without it, which is how a half-broken page
sends you debugging in the wrong direction.

### On-chain events

Crypto assets are **topic** subjects that happen to carry a price series — the schema bars a
company without a CIK and ticker, and inventing one would be a lie. A topic with price rows
renders the same chart a company page does, which is what lets a Bitcoin halving be read against
the BTC price; ordinary topics have no price rows and are unaffected.

```
npm run ingest -- --onchain btc     # halvings, dated from the chain
npm run ingest -- --onchain eth     # network upgrades
npm run ingest -- --onchain all
npm run check:onchain               # adapters against canned responses, offline
```

Sources are raw chain facts and public explorers only — mempool.space and Blockstream for
Bitcoin, Blockscout for Ethereum, Etherscan for token supply moves. All are `commercialOk: true`,
and that stays true only while they stay raw: Dune and Nansen sell *aggregations* and their terms
bar the ad-supported path. Only the stablecoin adapter needs a key (`ETHERSCAN_API_KEY`); without
it that one adapter sits out and the rest of the on-chain timeline is unaffected.

Live feeds — the stablecoin and USDT supply moves — read blocks minutes old, so a finality gate
(`lib/onchain/finality.ts`) withholds any on-chain event younger than its chain's settling time
(an hour on Ethereum) until a later run. It exists because an orphaned event that a synthesis
already cites cannot be deleted, by design (`ON DELETE RESTRICT`).

### Seeding without the network

`npm run db:seed-demo` writes a small demo corpus — two companies with a price series, a topic,
an industry — straight to Postgres through the same upserts ingest uses, with no API calls. It
exists because most of the UI can only be checked against data on screen, and a machine with no
keys, no egress, or a rate-limited feed otherwise has nothing to look at.

It seeds *shapes*, not volume: year-only dates (which bucket under the year instead of inventing
a January day), a clean run of filing-only days (which condense into one cyclable card), a
pre-IPO era (the "Before the chart" run-up), and planted >2% single-day price moves with an
after-close earnings the session before (which is what "Biggest moves" pairs against). It is
idempotent, never deletes, and only touches the four subjects it owns.

Because the price series only runs 18 months, every seeded history event predates the earliest
close, so the "Before the chart" section is larger than it would be against real prices.

### Bring your own model (visitor-side AI search)

Visitors connect **their own** model and use it to search a timeline in natural language —
"antitrust and regulation", "product launches", "anything about supply chain". The timeline
narrows to matching events, best matches first.

Supported: Anthropic, OpenAI, Google Gemini, and anything speaking the OpenAI
`/chat/completions` protocol — which covers Ollama, LM Studio, Groq and OpenRouter. Model names
are free-text fields, not dropdowns, so a new model release doesn't require a code change.

Settings live behind the **⚙ in the header**, so they're reachable from every page including
the homepage (`components/SettingsMenu.tsx` → `AiSettingsForm.tsx`). The gear carries a dot when
a model is connected. `AiPanel` on timeline pages has no form of its own — it fires an
`OPEN_SETTINGS_EVENT` so there is exactly one place these settings are edited, and it listens
for `CONFIG_EVENT` so saving or forgetting a key updates every mounted panel immediately
(plus the `storage` event, which keeps other tabs in step).

> The dialog is portalled to `document.body` on purpose. The header uses `backdrop-blur`, and a
> `backdrop-filter` makes an element a containing block for `position: fixed` descendants —
> without the portal the modal renders trapped inside the header bar.

**The key never touches a News Charts server.** `lib/ai/client.ts` and `components/AiPanel.tsx`
are both `"use client"`, and every request goes straight from the browser to the chosen
provider. There is no API route, no server action, and no server module that reads the stored
config — verify with:

```
grep -rn "apiKey" app/ lib/ components/     # only the two client files, plus the
                                            # separate operator-side scorer
grep -rln "news-charts:ai" app/ lib/         # nothing server-side
```

That's what makes "your key stays in this browser" a checkable claim rather than a promise.
Choosing a local model (Ollama et al.) means nothing leaves the machine at all. Anthropic calls
send `anthropic-dangerous-direct-browser-access: true`, which is required for browser-origin
requests.

This is also the answer to the cost problem: AI on the visitor's key removes ad revenue as the
ceiling on AI usage. The operator-side scorer below stays available for enrichment you want
applied for everyone.

### Relevance scoring

`event_subjects.relevance` answers "is this event actually *about* this subject?" — the fix for
GDELT keyword-matching, which put TSMC and Netflix headlines on the Apple page (measured:
**56% of "Apple" news was not about Apple**). Relevance is per *pair*, so a TSMC story can be
1.0 for TSMC and 0.1 for Apple.

```
npm run score                      # every subject
npm run score -- --subject aapl    # one
npm run score -- --dry-run         # no writes, and no model call
npm run score -- --strict-headline # see below
npm run score -- --rescore --limit 100000  # work out the free tier's own scores again
```

Two tiers, cheapest first:

1. **Deterministic (free).** Scores only what provenance makes certain: filings and earnings are
   1.0 (indexed under the subject's own CIK) — except a fund registrant's forms, 0.7, since a
   trust files for every series it sells, unless the fund's own EDGAR series list names the
   filing (1.0, scored `deterministic-series`; a sibling's is not linked at all, batch 67) —
   history sentences are 1.0 (extracted from the
   subject's own article), press mentions 0.7, and a news headline that names the subject 0.9.
   Everything ambiguous is left `NULL`.
2. **Model (paid, batched).** Scores the remainder — in practice, news headlines. Set
   `ANTHROPIC_API_KEY` in `.env.local` to enable it; without a key the pass is skipped cleanly.
   One request scores 25 headlines, so cost tracks new content, not rows or pageviews. Runs
   once per pair, never per pageview.

**Unscored means visible.** The read query is `relevance IS NULL OR relevance >= 0.4`, so
nothing is hidden without evidence and the site behaves identically with scoring switched off.

**An everyday word names a company only with its capital** (batch 59). A ticker names a headline
only in capitals ("COST", never "Cost of living rises"), and a name that is also an English word
only with its capital ("Visa beats estimates", never "New rules tighten student visa approvals";
the words are in `data/english-word-names.json`, rebuilt by `npm run sync:word-names`). For a
company whose own name is one such word, a headline with it only in lowercase is scored 0.2 and
hidden: "IMF urges retaining 5 % inflation target" is not Target's. A headline in lowercase
throughout is read as before.

**A word many companies' names share names none of them alone** (batch 60). "Gold" is a word of
130 listed companies' names, "american" of 52, "companies" of 24; a word five or more share no
longer names a company by itself, unless it is the company's whole name ("Target"). The company is
still named by its common name whole ("Southern Copper") and by that name without its trailing
generic words ("American Water" for American Water Works) when no other listed company's name holds
it, and only written with its capitals (batch 61): "New York" names no New York Times news, and "top
clean energy stocks" none of Clean Energy Fuels'. Measured on 4,165 Yahoo Finance
headlines from 235 companies' feeds: other feeds' headlines naming a company fell from 3,098 to
1,236 (sixty of those removed, picked at random, were all wrong: "American Depositary Receipts" for
American Airlines), while the companies' own feeds named them 2,009 times against 2,029. The counts
are in `data/shared-name-words.json`, rebuilt by `npm run sync:word-names`. A web address's "com"
names no company either: "AMAZON COM INC" made "Investing.com's stocks of the week" Amazon's.

**A whole name two listed companies hold names neither** (batch 109). Twelve everyday names are two
or more listed records' (`check:shared-names` lists them). Three are one group's two records, which
keep it (`ONE_GROUP` in `lib/sharedNames.ts`: Rio Tinto plc and Ltd, Resolution Minerals and its ADR,
WISeQey and the record it succeeded). The other nine are different companies':
- "Independent Bank" is the Massachusetts bank's (INDB) and the Michigan bank's (IBCP);
- "First Bancorp" is Puerto Rico's, North Carolina's and Maine's;
- "Toro" is the mower maker's and a shipping company's;
- and Graham, Citizens, Blue Owl Capital, Farmers & Merchants Bancorp, Meridian and Fluent.

For those, the name, and the words of it, name neither in any source: a headline, a case caption, a
Justice Department or Federal Register title. Each company is named instead by its own legal name
where no other listed company's is the same ("TORO CO", "First Bancorp, Inc"), and in headlines by
its ticker. The two Independent Bank banks and Puerto Rico's and North Carolina's First Bancorp have
the same legal names, so they are asked nothing by name. The SEC's caption rule already refused an
everyday name two companies hold (batch 73); a legal name is now counted too (`listedCompaniesNamed`).
The price: "Toro beats estimates" is no longer the mower maker's news, since it is as much the
shipping company's.

A legal name is read in both spellings of the form it ends with (batch 111, `legalSpellings` in
`lib/edgarName.ts`): Co and Company, Corp and Corporation, Inc and Incorporated, Ltd and Limited.
EDGAR keeps one ("TORO CO"), and a recall, a caption or a title writes either ("The Toro Company").
Toro's page held 5 of the recalls naming it, and holds 19: 16 as maker, from the riding mowers of
2001 to the snowthrowers of 2021, and 3 it imported or distributed. The SEC's two cases against Rio
Tinto plc and Rio Tinto Limited, of 2018 and 2023, are now also on RTNTF, the Limited's record
("RIO TINTO LTD"). The two spellings count as one name, so "Independent Bank Corporation" is still
both banks' and neither's.

A stored score follows a corrected rule on the story's next ingest,
or at once with `--rescore`, which works out the free tier's own scores again and hands those it
no longer settles back to the model; a model's score is never touched. It reaches the newest 500
rows a subject has unless `--limit` says more, and a `--strict-headline` score only when run with
that flag too: strict scores are kept apart (`deterministic-strict`), so a plain rescore, or ingest's
own, leaves those demotions alone.

`--strict-headline` is a product decision, not a fact: it scores company news 0.2 when the
*headline* never names the subject. Against 12 real headlines captured from the live AAPL page
it took visible items from 12/12 to 4/12, removing every market-roundup and rival-company
story — at the cost of demoting oblique headlines like "iPhone maker rebounds". Off by default.

### Measuring search

Every search goes through `/api/resolve`, and every resolution is now recorded: what was typed,
what `parseSearchPrompt` made of it, which rung of the ladder answered, and — the number that
matters — whether the subject it routed to had any events.

```
npm run search-report            # last 7 days
npm run search-report 30
npm run search-report -- --purge # apply the 90-day retention now
```

The ladder is `known_company` → `known_subject` → `edgar` → `assumed_topic`, and the last rung is
where wrong pages come from: nothing matched, so the typed string is assumed to name a topic. The
report separates them, because "we routed the visitor somewhere" and "the visitor saw something"
are different claims and only the second is accuracy. A row whose outcome could not be determined
is excluded from the headline rather than counted as a success.

It is also a live check on the ladder itself. With the SEC ticker index unreachable, a real ticker
falls past `edgar` and is logged as `assumed_topic` — the network-on-the-read-path fragility,
visible as a number instead of an anecdote.

**Privacy.** The query is stored with nothing attached that could identify anybody: no IP, no user
agent, no session or cookie, no join key to any other table. Queries are capped at 200 characters,
nothing reads the table but the operator's report, and the scheduled refresh deletes rows after 90
days — retention that depends on someone remembering is not retention.

### How pages read

`lib/page-data.ts` **reads the database and nothing else**. It used to be a read-through cache
that fetched live on a miss or a stale subject, which cost three things: the visitor arriving
first after a TTL expired waited on eleven feeds, several arriving together each triggered their
own fetch, and a database outage turned every page view into a live fetch — burning the free
tiers exactly when they could least be spared. `npm run refresh` owns fetching now, so cost is a
function of how many subjects exist (a number we choose) rather than of how much traffic arrives
(which is not).

Measured on this machine: `/topic/bicycle` went from ~11–16s live to **0.6s** from the database.

**A page carries what fits in Next's cache.** Next caches no entry over 2 MB, measured as the
entry's JSON with the page inside it as a string, so every quote counts twice. News is what
grows, so `boundPageNews` (`lib/pageNews.ts`) lets it fill the room the rest of a page leaves,
under a 1.8 MB budget: the newest stories first, then the strongest story of each earlier day,
the days the price moved most first. Every filing and other record stays, the database keeps
every story, and a page that leaves stories out says how many.

**A long timeline opens with its older years folded.** The list lays out about 300 rows at most
when a page opens (`OPEN_ROW_BUDGET`, `components/EventList.tsx`). The newest years stay open while
they fit, and the newest one is always open. Each older year shows its header and its count, and
opens on a click, with "Expand all", or by itself when the chart jumps into it. JPMorgan's page
went from 2,212 rows laid out to 382. A page whose list fits opens whole, as before.

**A case's row names the other companies it is on.** Under the owner's rule that a case goes on
every listed company it involves, an EPA case, a CPSC recall, a CFTC order, an SEC litigation
release or a CFPB action is held once for each company, and a Justice Department, SEC or Board press
release once, linked to every page it names. A row of one of those eight sources says, on a line of
its own beneath it, which other held company pages carry the same case: "Also on Ford Motor, General
Motors, Caterpillar and 24 more", each a link to its page (`lib/alsoOn.ts`, batch 106). A case is the
same source's same number, and a day's or a month's grouped row carries all its cases' numbers (an
SEC or CFPB row too, since batch 106), so they are compared as sets (db/041 indexes them, taking each new row straight into the index since
batch 111's db/042). The page's own company is never named, nor another
ticker of its own SEC record, nor a page the case sits below the relevance floor on. Only held pages
can be named, so the line is a floor of the companies a case involves. On the batch 104 replay of
EPA's cases, 672 are on two or more pages, 3,366 of 7,436 rows hold a case another page holds, and
one case is on 36. The line is read beside the page's events; if the read fails, the rows show
without it.

**A row says how many documents attest it.** "· 3 sources" after a description counts its
attestations: a story twelve papers carried says twelve. A row of the six sources whose one row
carries several cases' numbers (EPA, the CPSC, the CFTC, the SEC's litigation releases, the CFPB,
the Digest's month rows) is stored again when its list grows, and its versions count once
(`lib/corroboration.ts`, batch 107): Amazon's months of CPSC recalls no longer read as if several
sources confirmed each.

A small `stored` badge on each page carries the date that copy was last refreshed. It replaced a
`stored` / `live` badge, which after the cut-over had one reachable value and implied a
comparison the code no longer performed.

**A subject we do not have is not fetched under a visitor.** The page says so, and the request is
recorded in `subject_requests` for the next scheduled run to work most-wanted first. Reloading a
page does not raise its rank: a repeat ask counts at most once an hour, nothing is recorded while
the first pass has the slug in failure back-off, and requests nobody repeats for 90 days are
deleted by the scheduled refresh. A database
outage is now an outage: it logs a warning and the page renders its "not indexed yet" notice
rather than silently becoming eleven live fetches per view.

The worker fetches through the same `lib/` functions the site uses, then stores each item as
an **event** (deduplicated by content), an **attestation** (the document it came from), and a
**subject link**. Re-running is idempotent: a second pass reports `0 new`.

Two behaviours worth knowing:

- **Cross-subject dedup pays off immediately.** Ingesting a second subject that resolves to the
  same article yields `events 71 (0 new) … links +71` — one row, two links. After ingesting
  `bicycle`, `history of the bicycle` and `AAPL`: 280 events carry 351 subject links.
- **Back-off is enforced from the fetch log.** If a source's last attempt within 10 minutes was
  `throttled` *or* `error`, it is skipped rather than retried. A rate-limited host often stops
  answering entirely (GDELT returns 429, then drops the connection), and retrying deepens the ban.

## Data sources

The sources the scheduled ingest reads. All are free; only the stablecoin and USDT supply feeds
need a key. The registry in `lib/ingest/store.ts` (`SOURCES`) is the authority — it also carries
each source's licence, whether it is cleared for commercial use, and when that was last
reviewed — and `docs/COVERAGE-MAP.md` says how far back each one reaches.

| Source | Used for | Notes |
| --- | --- | --- |
| Yahoo Finance chart API | Every daily close Yahoo holds, to six places (from 1962 at the earliest; read once, then 10y refreshes; whole history again after a split), dividends, splits. End of day only: a session still trading is left out | Unofficial; swap for a paid API before scale. Full history is asked for by date — `range=max` comes back quarterly (`3mo`) |
| Yahoo Finance RSS | Company headlines | Headline, link and date only |
| SEC EDGAR | Filings, earnings (10-K/10-Q/8-K 2.02, and a results release whatever its form), fund filings (a shareholder report on the Earnings chip, a unit investment trust's N-30B-2 among them: QQQ's since 2005) — a fund's own, by the filing list EDGAR keeps for its series (`lib/fundSeries.ts`; the series id is in the committed ticker index), shown on its page under its name, a sibling's left off, and a filing from before the list begins kept with its hedge; an 8-K's or 6-K's press-release headline as its title. Each filing's EDGAR acceptance time (`events.occurred_at`; until 2002 EDGAR kept most filings' day only, stamped midnight Eastern, which is read as no time): its row says "4:30 pm ET, after the close", and Biggest moves never captions a move with a filing that came out after that session closed (`lib/marketTime.ts`). The material forms the owner picked (`MATERIAL_FORMS`, lib/secForms.ts): corrections, mergers and tenders, large stakes, offerings (S-3, S-3ASR, F-1, F-3, F-10), late-filing notices (NT 10-K, NT 10-Q, NT 20-F), proxy fights and exits; no insider trades. The forms of the years before: a smaller company's annual and quarterly reports until 2008 (10KSB, 10QSB, on the Earnings chip as a 10-K and 10-Q are), the tender offers before 2000 (SC 14D1, SC 13E4), 10-K405/A, SB-2 and 10-12B (batch 80; 10-12G left out on the owner's call). A tender offer or proxy fight the company made about another company is named as its own (`DEAL_FORM`), and a busy month of DFAN14As or tender updates is one row | Requires a `User-Agent` with contact email; headlines read once each and stored (`sec_headlines`) |
| GDELT 2.0 | News headlines | English-filtered; 2017+. A company is searched under its everyday name and its own other names in one query ("Goldman Sachs Group" OR "Goldman Sachs"; `newsNamesFor`), except words printed around every article ("Google"). GDELT refuses a quoted phrase under five characters, so a short name that is no English word and stands for nothing else first goes bare ("IBM", "ETSY"; `unquotable`, with the word list in `data/english-short-words.json`), its articles kept only when the headline names the company; any other short name is asked with its legal form ("VISA Inc", "CGI Inc"; `gdeltEverydayName`) or, as an other name ("UPS"), only scores headlines. GDELT drops a possessive "'s", so a possessive name of more than one word is asked as GDELT holds it ("DOMINO PIZZA"; `gdeltForm`, with the company's own spelling kept in the name index's `possessive`), and a headline naming "McDonald" names McDonald's. A name measured to drown in passing mentions newest first is asked by relevance over the last three days instead, its articles kept only when the headline names the company and not as a person's name ("MCDONALD", "lowe", Uber's "uber"; `GDELT_BY_RELEVANCE`). That hourly ask returns the newest hundred, so each month since 2017 (or since the company's first price) is also asked once, by relevance, keeping only the headlines that name the company: at most 40 months a run, 6 s apart, newest first (`lib/ingest/newsBackfill.ts`, kept in `gdelt_windows`). A company asked under one everyday word ("Target", "Southern"; `data/english-word-names.json`, rebuilt by `npm run sync:word-names` after `sync:tickers`) is held back from that until a month of its own is measured, since "the headline names it" is true of the word; a measured one ("Apple") counts a headline only where the name has its capital. Headline scoring, too, counts a name that is a word only with its capital, and hides a headline that has a company's own one-word name only in lowercase (batch 59), and a word many companies' names share names none of them alone (batch 60; see Relevance scoring). Throttles per IP — see note below |
| Wikipedia | Topic histories and company backstory | "History of ..." + "Timeline of ..." merged; search-index fallback |
| LoC Chronicling America | Historical newspapers ~1770–1963 | Public domain; fills the pre-2017 gap |
| Internet Archive | Catalogued items (reports, catalogues, film) | Relevance-ranked; impossible dates dropped |
| Federal Register | Sector-level rules and notices; documents naming a company | Keyword hits attach to industries; a title naming the company, or one of its own other names ("Google LLC"), attaches to it (no airworthiness directives) |
| Federal Reserve | FOMC policy statements since 1994 | Economy subject; on company pages behind the Economy chip (off by default). `npm run ingest -- --macro` |
| BLS | CPI release dates since 2008 | Same subject and chip; needs a contact `User-Agent` |
| NHTSA (Transportation Department open data) | Vehicle safety recalls since 1966; defect investigations since 1975 | Recalls of 10,000 vehicles or more, and every investigation NHTSA opened, only for the vehicle and tyre makers `lib/recalls.ts` maps by hand to a listed company, with the day each became that company's (Chrysler counts for Stellantis from 2014). Public domain; no key |
| Federal Reserve Board (enforcement actions) | Cease-and-desist orders, written agreements and civil money penalties against a bank, since 1993 | Only for the 63 banks `lib/fedActions.ts` maps by hand to a listed company — 49 US banks and 14 foreign banks with their US arms; an action against a person is left out. Public domain, cited to the Board; two keyless files |
| FDA (openFDA enforcement reports) | Drug, device and food recalls since 2012 | Class I and II only, for the 73 companies `lib/fdaRecalls.ts` maps by hand, with the days bought firms joined and businesses left. Public domain (CC0); no key, 1,000 requests a day |
| FDA (CDER's new-drug approvals) | New molecular entities and new biologics since 1985, on the page of the company that applied | One committed workbook a year (`npm run sync:fda-approvals`); kept when the applicant is the company by the caption rule, a recall-map firm or a unit it then owned (`lib/fdaApprovals.ts`), from its first price; linked to Drugs@FDA. Public domain; no key |
| FDA (Drugs@FDA, via openFDA) | Each approved efficacy supplement to those drugs, on its day | One committed file a month (`npm run sync:fda-supplements`); kept where the drug never left the company and the applicant was the company that day (`lib/fdaSupplements.ts`), from its first price; linked to the letter. Titles from the data alone. CC0; no key |
| U.S. Department of Justice | Press releases since 2001 (the API's from 2009, the archive's month pages before) in which a company is a party — a settlement, a plea, a suit against it, a merger case | Kept only when the title makes the company the one acting or acted against (`lib/doj.ts`); one release a day per company. Public domain; no key |
| SEC newsroom (press releases) | Press releases since 1997 in which a company is the party — the SEC charges, sues or sanctions it, or it settles | The year listing, read once for every company (`lib/ingest/secPressWalk.ts`); kept only when the headline makes the company the party (`lib/secPress.ts`). Public information the SEC lets anyone copy, cited to the SEC; no key |
| SEC litigation releases and administrative proceedings | The SEC's record of each case since 1995 whose caption names the company as a defendant or respondent | Both year listings, read once for every company (`lib/ingest/secCasesWalk.ts`); kept only when a caption entry is the company's name with its legal form (`lib/secCases.ts`). Public information the SEC lets anyone copy, cited to the SEC; no key |
| Federal Reserve Board press releases | The Board's orders on a bank's applications since 1996 (1996–2005 from its yearly pages, committed), and its policy releases that act on a named bank — a rescue, a capital plan | One file of every release, read once for every company (`lib/fedPress.ts`); an order kept when the company is the applicant or what it buys, a policy release when the Board's own phrase names it. Public domain, cited to the Board; no key |
| Consumer Financial Protection Bureau | The Bureau's enforcement actions since 2012 against a bank, card issuer, lender or debt buyer whose respondents are the company or a unit it owned | The action list, read whole once a month and its newest page once a day, for every company (`lib/ingest/cfpbWalk.ts`); kept when a respondent is the company's name with its legal form, or its unit (`lib/cfpb.ts`). Public domain, cited to the Bureau; no key |
| U.S. Environmental Protection Agency | EPA's civil enforcement cases from the 1970s, in court and before its own judges, one of whose defendants is the company | EPA's whole case file, one zip read once a month for every company (`lib/ingest/epaWalk.ts`); kept when a defendant is the company's name with its legal form, or one of the operating units 35 companies held, on the days they held them (`UNITS` in `lib/epaCases.ts`); the orders with no penalty grouped a row a month. Public domain under EPA's open data licence; no key |
| U.S. Consumer Product Safety Commission | Consumer-product recalls since 1973 naming the company as the maker, importer or distributor, or as a store that sold the product | The Commission's recall service, every recall in one answer, read once a week for every company (`lib/ingest/cpscWalk.ts`); kept when a named firm is the company by the caption rule or a store in the "Sold at" line is its name (`lib/cpscRecalls.ts`); a store's recalls of other makers' products grouped a row a month. Public domain, a work of the U.S. Government; no key |
| Commodity Futures Trading Commission | The Commission's enforcement actions since 1995 whose title makes the company the party — a bank's benchmark-rigging order, an energy trader's manipulation suit | The enforcement list, read whole once a year and its newest page once a day, for every company (`lib/ingest/cftcWalk.ts`); kept by the Justice Department's title rule with the release map's units (`lib/cftc.ts`). Public domain, acknowledged to the CFTC; no key |
| SEC News Digest | The SEC's daily summary of 1956–1993: the 8-K reports a company filed, its registration statements, the 13D and 14D-1 filings on its shares, the SEC's orders and actions on it, its listing orders | Every issue's PDF read once for every company, 60 a run (`lib/ingest/secDigestWalk.ts`); kept when an entry's party is the company under the name its EDGAR record had that day and no other company's (`lib/secDigest.ts`), from its first price; a month's 8-K reports one row. Public information the SEC lets anyone copy, cited to the SEC; no key; needs `pdftotext` and `NEWS_CHARTS_CONTACT` |
| Wikidata | Other names for listed companies ("Google" → Alphabet, "Facebook" → Meta, "P&G", and a company's own initials: "IBM", "AIG", "BMS", which claim its news too unless they mean something else first, as Philip Morris's "PMI"). Search uses them all; news queries, headline scoring and the company Federal Register feed use only a company's own names and a predecessor's (`newsNamesFor`), as written ("U.S. Bancorp") | CC0. Committed as `data/company-aliases.json` by `npm run sync:aliases` (run after the ticker index); rules in `lib/companyAliases.ts`. Also P856 website domains (`lib/wikidata.ts`) |
| mempool.space, Blockstream, Blockscout | Bitcoin halvings, Ethereum milestones | Keyless explorers |
| Etherscan (V2) | Stablecoin and USDT supply moves | `ETHERSCAN_API_KEY` |
| Snapshot | Protocol governance votes | Keyless GraphQL |
| DefiLlama | Protocol exploits | Open hacks dataset |

The eight keyed news aggregators (NYT, Guardian, Newsdata, GNews, Currents, Marketaux, EODHD,
Finnhub) have adapters but are not ingested: their free tiers bar commercial use. NYT and the
Guardian are available to a visitor who brings their own key, in their browser, never stored.

Topic pages are **Wikipedia for the historical spine, GDELT for recent news**. There is no
general-purpose historical event source beyond Wikipedia in the free tier — GDELT only reaches
back to 2017, so anything older on a topic page comes from the article prose.

Wikipedia links are **deep links to the exact sentence** via URL text fragments
(`#:~:text=start,end`), anchored on the first and last five words so citation markers in the
rendered page don't break the match.

### Chronicling America gotchas (`lib/loc.ts`)

- The old `chroniclingamerica.loc.gov` API is dead (308 → 404). Use
  `https://www.loc.gov/collections/chronicling-america/?q=…&fo=json&at=results`.
- It throttles hard and returns **503** under load — retry with a ~4s backoff.
- **Never sort by date.** Old newspaper OCR is garbled, so `&sb=date` surfaces misreads first
  (a "bicycle" hit dated 1837). Relevance order lands on genuine mentions; sort client-side after.
- Filtering on the returned `description` does not work — it's a truncated OCR snippet, so the
  matched term usually isn't in it (that filter dropped 24 of 25 real results).
- Instead, discard anything earlier than the topic's first Wikipedia-documented year
  (`dropImplausiblePress`). Topics after 1963 correctly get zero press events.

### Internet Archive

**Wayback is used, but for enrichment rather than events.** Every company-page row carries a
"site that day" link showing the company's homepage as it looked on that date. This costs
**zero API calls** — `https://web.archive.org/web/YYYYMMDD/http://domain` 302-redirects to the
nearest capture. The domain comes from Wikidata P856 (`lib/wikidata.ts`); EDGAR has `website`
and `investorWebsite` fields but leaves them empty for most filers, including Apple. Wikidata
often stores a locale URL (`https://apple.com/at/`), so normalise to the hostname.

**archive.org item search was later adopted**, reversing the rejection recorded below.
`lib/archive.ts` reads the advancedsearch index under source key `internet_archive` and files
items as `citation` events on both the topic and company ingest paths. What changed is the
handling, not the data: a bare year now stays year-precision instead of being normalised to
1 January, a `collection` is not treated as an event, and items predating the subject's first
recorded year are dropped by the same `dropImplausiblePress` floor the newspaper scans use.
`npm run check:archive` (48 cases) is aimed squarely at that parsing — and, since 2026-08-12, at what the request asks for, which is where a defect sat that every parsing case passed.

Rejected as *event* sources after testing:

- **archive.org item search** — *superseded, see above.* Item dates are unreliable: "The Bicycle
  Girl" exists twice, dated 1895 (correct) and 1770 (garbage), and a date-sorted bicycle search
  returns four items from 1770. The parsing rules above are what made this workable.
- **Wayback first-capture as an event** — confounded by the Archive's own crawl history. Both
  apple.com and nvidia.com report 1996-10-22 because that's when the Archive started crawling,
  not when either site launched. Only meaningful for sites first archived later (tesla.com,
  2002-11-25).
- **Wayback yearly snapshots** — 23–31 near-identical entries per company; noise, not signal.
- **Open Library** — works, but a "bicycle" search returns children's fiction. Low signal.

### Sources evaluated and rejected

- **Google News RSS** — see below; non-commercial terms.
- **Crossref** (works, CC0) — relevance is poor for general topics; a "bicycle" search returns
  items like "Bicycle Crunches". Worth revisiting for explicitly scientific topics.
- **Wikidata SPARQL** (endpoint works) — needs entity resolution before it returns anything
  useful; naive label queries come back empty. Real option, but a project of its own.

### Do not use Google News RSS

It works without a key and is tempting, but its terms restrict the feed to "personal,
non-commercial use" in a personal feed reader. This site is ad-supported, so that's off the table.
For more news coverage, budget for a licensed API (Marketaux, Tiingo, NewsAPI paid tier) or use
publishers' own RSS feeds with attribution.

## Structure

- `lib/` — source adapters (`sec.ts`, `prices.ts`, `news.ts`, `wiki.ts`, …), called by the
  scheduled ingest (`scripts/ingest.ts`, `scripts/refresh.ts`); `lib/store/read.ts` is what pages
  read. Pages read only the database — the one exception is a bounded first-visit gather
  (`lib/ingest/firstPass.ts`) for a subject not yet held
- `app/company/[ticker]` — price chart + merged event timeline (server-rendered per request; the
  held-page database reads are cached for 15 minutes, a miss never is)
- `app/topic/[slug]` — Wikipedia history + news, rendered as a horizontal left-to-right timeline
  (cached the same way)
- `app/industry/[slug]` — a sector's merged timeline and signals (the whole page cached for 15 minutes)
- `components/HorizontalTimeline.tsx` — the scrolling time axis. Horizontal spacing is
  proportional to elapsed time (clamped to a min/max gap so cards never overlap and quiet
  centuries don't become miles of blank track), with quiet stretches labelled "N years".
  Cards alternate above/below the axis; drag or scroll to pan; three zoom densities.
- `app/api/resolve` — routes a search query to company or topic mode
- `components/PriceTimeline.tsx` — lightweight-charts v5 area chart with event markers
- `components/AdSlot.tsx` — placeholder; wire up AdSense here once approved

Cards are whole-card links (`target="_blank"`). Some embedded browsers — including the Claude
preview pane — block popups and load `_blank` links in place instead, so the timeline's scroll
position, zoom, view and filters are saved to `sessionStorage` and restored on return. Persist
**only from user actions**: an effect that writes on mount fires with default state before the
restore lands and clobbers what was stored (React StrictMode re-runs effects, which hides it in
dev). The restore's own programmatic scroll also fires a `scroll` event — that write is suppressed
for two frames.

## Known constraint: GDELT throttling

GDELT allows roughly one request per 5 seconds per IP and soft-bans an IP after a burst. A
throttled reply arrives as **HTTP 200 with a plain-text body**, so `lib/news.ts` sniffs for a
leading `{` before parsing and retries with a cache-busting suffix (Next.js would otherwise cache
the bad body). Pages degrade to history-only when news is unavailable. Page-level ISR is what
makes this viable in production — if traffic grows, move news to a keyed API. The monthly backfill
of older news spaces its requests 6 s apart, asks at most 40 months a run, and stops at the first
refusal; a refused month is asked again on a later run. From a shared address (a cloud session)
GDELT can refuse every request for long stretches, so measure the backfill from the production host.

## Monetization TODO

1. ⚠ Turn on `COMMERCIAL_MODE` before anyone but the owner can load the deployment — a private
   preview counts (D22, applied 2026-10-19). Several news sources are licensed for
   non-commercial use only (open `P0` in `docs/MASTER-CHECKLIST.md`)
2. Deploy (Vercel free tier works for MVP)
3. Buy domain, apply for Google AdSense, replace `AdSlot` placeholders — each one declares the
   IAB format it is standing in for (`leaderboard` 728×90, `billboard` 970×250, `rectangle`
   300×250), so the live unit drops into a space the page has already reserved. Set the
   network's script as `NEXT_PUBLIC_AD_SCRIPT_URL`; it never loads in a browser holding a
   visitor's key (NC-164)
