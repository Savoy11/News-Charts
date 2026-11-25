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

**The parts, tire, child seat and equipment makers listed companies own** (batch 123, the owner's
approval of 2026-11-08). The dataset files a child seat, a part or a tire under its maker too, and
16 more names are mapped, at the same floor and by the same rules: Graco's child seats on Newell from
1999-03-24, the day the CPSC's map gives it (Newell's 8-K of 1999-03-25 reports the Rubbermaid merger
completed); Dana Corporation and Dana Incorporated on Dana, its record's own; Lippert on LCI; Autoliv;
Caterpillar's engines; Skyline; GE's lamps; Honeywell's Fram filters and Prestone; Dorman; Polestar;
Eaton, whose clutch recall of 2018 is Eaton Corporation's own, not its transmissions venture's;
Winnebago's towables; Thor's own name; and Supreme on Wabash from 2017-09-27 (Wabash's 8-K, item 2.01).
Carrier Corporation is RTX's to 2020-04-01, its titles naming the brand RTX no longer owns, and Carrier
Global's from 2020-04-02 (RTX's 8-K of the separation): one name on two pages, never on the same day.
On the rows read on 2026-11-08, 85 recalls on 20 pages, 58 before 2017, Graco's 4,176,601 seats of
2014 the largest, and 27 investigations with them. Batch 148 added the six makers that waited for a
filing's text, which www.sec.gov serves only to a request naming a contact, each day read from it:
Hino on Toyota (August 2001 to 2026-03-31), Kelly-Springfield on Goodyear (from 1991-10-01, the first
day its filings show it held; its 1976 recall waits for an older record), Buell on Harley-Davidson
(from February 1998), Fisher-Price on Mattel (from the merger of 1993-11-30), and Thor California and
Thor America on Thor. A maker under another name than the company's names its brand in the title:
"Recall of 594,853 Kelly tires".

The defect investigations NHTSA opened into the same makers come from the same open-data portal,
through the same map and its dates (`lib/investigations.ts`, batch 66): preliminary evaluations,
engineering analyses, defect-petition reviews and recall queries, back to 1975. Toyota's RQ10003,
"Unintended and Uncontrolled Acceleration", opened 2010-02-16. By the owner's call (2026-10-26) they
sit under the Recalls tag, one row on the day an investigation opened, its closing and the recall
NHTSA links to it said in that row. On the chart each is a small dot ranked like news, never the R
a recall gets: an investigation opened is no recall. Measured 2026-10-27: 1,766 for 18 companies,
1,579 of them before 2017 (Ford 684, GM 651, Toyota 114, Honda 113, Stellantis 50 from 2014).

### Railroad accidents (`lib/railAccidents.ts`)

A railroad's page carries the accidents its railroads reported to the Federal Railroad Administration,
from 1975 (batch 127, the 2026-11-09 proposal 2, approved by the owner that day): a collision,
derailment, fire or other train accident that killed someone, forced an evacuation or did $5,000,000
of damage; a highway-rail crossing collision, most often a motorist's death, only with an evacuation
or that damage (the owner's floor). Read from FRA's Rail Equipment Accident/Incident Data (Form 54,
data.transportation.gov `85tf-25kj`), the host NHTSA's recalls come from: one keyless request a day
per railroad company, by railroad code. Public domain ("Public Domain U.S. Government" in the
dataset's own licence field). A row gives the railroad, the place, the people killed, injured and
evacuated, the cars that released hazardous material, the damage in whole dollars, the railroad's own
cause code and a link to FRA's readout of the report: "Norfolk Southern: train accident at
Graniteville, South Carolina — 9 killed, 292 injured, 5,200 evacuated". The report is the railroad's
own filing to its regulator, not a finding of fault, and the row says so. The dead and injured are
the accident's (batch 130, the 2026-11-09 audit's finding 1): Form 55a's per-accident count,
`totalpersonskilled`, or the report's own Form 54 count where that is larger; where only the report
gives a death (6 records: CSX at La Grange in 2016 and Illinois Central at Yazoo City in 2022 are on
pages), the row says so, "The 1 killed is the railroad's own report's count; FRA's count for the
accident gives none" (batch 146, the owner's call, decided on the owner's instruction of 2026-11-12 to
use best judgment). Form 54's count is each
record's part ("Do not use this field to sum fatalities", the dataset says), so before it the
deadliest accidents showed none: Big Bayou Canot of 1993 read "$11,369,400 of damage" on CSX's page,
where 47 died, and Union Pacific's report of Chatsworth in 2008 counted none of the 25 Metrolink
passengers killed. Since batch 136 (the 2026-11-09b proposal 4, part b) a row also carries the
railroad's own account, the report's narrative with the dataset's "NoneNone…" filler for empty parts
removed, and the dead by kind where the report's records add up to the row's count: "Killed, by kind:
1 railroad employee and 8 others" at Graniteville. On the six pages, 476 of the 490 rows carry an
account, 390 before 2017, and 113 of the 136 with a death a split; Chatsworth's and Bourbonnais's do
not, their dead being on Metrolink's and Amtrak's reports. No title, day or key changes.

The dataset names a railroad, never a listed company, so a report reaches a page only through the
hand-checked map in `lib/railAccidents.ts` (`RAIL_OWNERS`), by CIK, each railroad between the days
its owner held it, read from the filings: Southern Pacific on Union Pacific from 1996-09-11, BNSF on
Berkshire Hathaway from 2010-02-12, Wisconsin Central on CN from 2001-10-09, Illinois Central from
1998-06-05, the Soo Line and Kansas City Southern on CPKC. A predecessor's past is never the buyer's:
Burlington Northern's, Santa Fe's and Conrail's reports are no page's. Every page also counts only
from its company's first price, so CSX's railroads before CSX existed are no page's. Two railroads in
one accident file a report each, and each is a row on its own owner's page. Missouri Pacific is
Union Pacific's from the merger of 1982-12-22 (the 8-Ks for that day in the SEC News Digest's list),
the Delaware & Hudson CPKC's from 1991-01-18 (a Canadian Pacific plan's own day for it) and the
Chicago, Central & Pacific CN's from 1998-06-05, with Illinois Central, its buyer of 1996: batch 148
read the days from the filings' text (`NEWS_CHARTS_CONTACT`). Measured on the dataset's answer of
2026-11-10, each page from its first price: 503 accidents on six pages, 417 before 2017, 145 before
1993 (CSX 166, Union Pacific 168, Norfolk Southern 69, CN 37, Berkshire Hathaway 37, CPKC 26). Scored without the model.

### Mine accidents (`lib/mineAccidents.ts`)

A mining company's page carries the accidents that killed someone at a mine it controlled, from 2000
(batch 134, the 2026-11-09b proposal 2, approved by the owner on 2026-11-10 once the Labor
Department's terms were read): every record of a death in the Mine Safety and Health Administration's
Accidents file, the Form 7000-1 reports mine operators and contractors file, grouped by mine and day.
MSHA serves the file whole as one 52 MB zip, with a Mines file for each mine's place; both are read once
a week for every company and the deaths kept in db/046 (`lib/ingest/mineWalk.ts`), 1,130 accidents and
1,221 dead on 2026-11-09. Public domain (the Labor Department: "Materials created by the federal
government are generally part of the public domain and may be used, reproduced and distributed without
permission"), credited to the Department, implying no endorsement and using none of its seals. A row
gives the mine's county and state, the dead, MSHA's classification and accident type, the time and
where at the mine, how many of the dead worked for a contractor, and MSHA's own account: "Coal mine
accident in Marshall County, West Virginia — 3 killed (gas or dust explosion)". The report is the
operator's own filing to its regulator, not a finding of fault, and the row says so. MSHA records each
mine's controller and operator by the IDs they had on the day, but under each ID's present name, so a
title names no operator, and the text gives MSHA's present names as present names.

**MSHA's own finding** follows the operator's report on the row since batch 139 (the 2026-11-11 proposal
1, approved by the owner on 2026-11-11, on the death's row). MSHA investigates every death and assesses a
penalty for each violation it cites; its Inspections and Assessed Violations files, from the same
open-data page and under the same terms, are read once a month (74 MB and 110 MB zipped, 1.34 GB of
text, streamed and never decoded whole, `eachZipLine`) and kept in db/048. An investigation (activity
code E06 since 2005; AFA and the older 30 before) is the accident's when MSHA began it at the mine on the
day or up to 14 days after; the row then says what it assessed: "MSHA's investigation cited 5 violations
against the operator, 5 of them under section 104(d) (an unwarrantable failure) and 5 specially
assessed, and proposed $447,600 in penalties, the amount assessed now" (Barrick's Goldstrike, 2010).
McElroy's explosion of 2003 on CNX names the contractor cited, Central Cambria Drilling Co; Hecla's
Lucky Friday of 2011, "$159,100 in penalties; $180,000 as assessed now". A proposed penalty is not a
final one, and the figure assessed now can rise as well as fall; nothing is said where nothing was
assessed. On the files of 2026-11-10: 213 of the 224 deaths on pages have MSHA's investigation, and 168,
on 45 pages, 114 before 2017, carry what it assessed: 316 violations, 241 against the operator and 75
against a contractor, $11,586,940 proposed and $8,453,138.30 as assessed now, in whole cents. MSHA's
account gives way to the finding, cut at a word: 136 of the 168 keep it, 32 lose it whole.

MSHA names a controller, never a listed company, so an accident reaches a page only through the
hand-checked map in `lib/mineAccidents.ts` (`MINE_CONTROLLERS`), 54 controller IDs on 52 companies by
CIK, each between the days its company held it: CONSOL Energy's ID on CNX Resources to the coal spin-off
of 2017-11-28 and on the new CONSOL, now Core Natural Resources, after; Mosaic's from the combination of
2004-10-22; Knife River's quarries on MDU to 2023; Trinity's on Trinity to Arcosa's spin-off;
ArcelorMittal's Minorca mine on ArcelorMittal to its sale to Cleveland-Cliffs in 2020; Legacy Vulcan,
Vulcan Materials' predecessor record, on Vulcan. An acquisition's past is never the buyer's (Massey's,
Alpha Natural Resources', Walter's, Arch's, Phelps Dodge's, Stillwater Mining's), a joint venture is no
one's (Bridger Coal, Nevada Gold Mines), and every page counts only from its company's first price
(Peabody's of 2001 are no page's). Measured on the files of 2026-11-09, each page from its first price:
224 accidents, 237 dead, on 51 pages, 144 before 2017 (Alliance Resource 30, CNX 29, Martin Marietta
19, Vulcan 15, Freeport-McMoRan 12, CRH 11, Newmont 10, Barrick 9). Arcosa's two wait: Yahoo's chart for
it begins 2026-07-17. Scored without the model.

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

**Before the reports: the device recalls of 2000 to mid-2012** (`lib/fdaDeviceRecalls.ts`, batch 144,
approved by the owner 2026-11-12). The reports begin on 2012-06-20, so a device maker's page had no FDA
recall before then. openFDA's other device file, the FDA's own recall database, goes back to 2000 (a mapped
firm's first recall in it began on 2000-04-11) under the same event numbers, and each mapped company's firms are asked for the recalls they began before the reports
(one or two keyless requests). The rule is the map's, on the day the firm began the recall, and a recall the
reports hold (470 events begun before 2012-06-20) stays the reports' row. The file gives no class, so each
recall's page in the FDA's recall database is read once and kept (db/051), at most 200 a process; a recall
takes its most serious product's class, and Class III gives no row. On the files of 2026-11-10 and the
classes read on 2026-11-12: from first prices, 1,981 rows on 19 pages, every one before 2017, 73 of them Class
I (Medtronic's Sprint Fidelis leads of 2007-10-15, the Alaris SE pump of 2006); Stryker 262, GE 243, Philips
234, Abbott 216, Medtronic 202, Johnson & Johnson 175 (DePuy's ASR hip recall of 2010-08-23), Boston
Scientific 154, Baxter 122, Zimmer Biomet 107, BD 95. Older recalls are far more often Class III than the
reports' (283 of the 2,608 read, 255 from first prices). 345 more are held for 18 companies whose first prices
are not yet read (Smith & Nephew 51, CONMED 50, Integra 44…); Medline's 13 and Penumbra's 5 fall before those
companies' listings, so at most 327 of them can ever show (the audit of batches 143–149, finding 6). The map's days for 2000–2012 were read for it, as the
file gives a bought unit's own past under its later name: Guidant's recalls of 2005, filed as "Boston
Scientific CRM Corp", count for Boston Scientific only from 2006-04-21; Datex-Ohmeda for GE from 2003-10-10
(Instrumentarium); Mentor (2009-01-26) and Acclarent (2010-01-20) for Johnson & Johnson; Sybron's dental
companies (2006-05-16) and Leica (2005-07-21) for Danaher; Alaris (2004-07-07) and Viasys's units
(2007-06-21) for Cardinal Health until the CareFusion spin-off of 2009-08-31; Chattem for Sanofi from
2010-02-09; Ascent, filed as "Stryker Sustainability Solutions", for Stryker from 2010-02-26. They keep 15
recalls off pages; Physio-Control, Medtronic's from 1998 to its sale in 2012, adds 21 to Medtronic's, and Kerr
written "Kerr Corp" 3 to Danaher's.

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
Avonex (1996) and Amevive (early 2003) are no page's (since batch 117 by the one table of taken names,
below). From the first prices of the 26 drugmakers
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

### FDA warning letters (`lib/fdaWarningLetters.ts`)

A warning letter is the FDA telling a company, in writing and in public, what it found wrong, most
often after an inspection: a plant's manufacturing practice, a device maker's quality system, a
retailer selling an unapproved drug. Since batch 140 (the 2026-11-11 proposal 2, approved by the owner
on 2026-11-11) a page carries each letter addressed to the company since 2021, on the day the FDA
issued it: "FDA warning letter: CGMP/QSR/Medical Devices/Adulterated" (Dexcom, 2025-03-04), with the
addressee as the FDA wrote it, the office that issued it, the day the FDA posted it and the day of any
close-out letter, read from the close-out's own page name (the list shows the day the FDA posted it,
up to 1,407 days later; batch 142), linked to the letter's own page on www.fda.gov. A company's letters of one day are
one row ("3 FDA warning letters: False & Misleading Claims/Misbranded", Lilly, 2025-09-09). The letter
is the agency's account, not a court's finding, and the row says so.

The list is read whole once a week for every company, through the data the FDA's own table loads
(`lib/ingest/fdaWarningWalk.ts`, db/049): 1,000 letters a request, as the site refused 5,000. It is
read twice, oldest first and newest first, because letters of one day have no order of their own: read
one way only, the list cut the 69 letters of 2025-09-09 differently at a page's edge, gave 12 twice and
never gave 12 others, Royal Philips's among them. The two directions' edges fall on different days, and
together they gave all 3,807 (2026-11-11, eight requests). A read short of the list's own count is
refused, and a letter once kept is never taken off.

A letter is the company's by the rule the FDA's approvals use (`approvalIsCompany`: the caption rule
under the names it had that year, the FDA recall map's firms and units on their days, the table of taken
names), or by a short hand list of addressees that rule cannot read (`LETTER_NAMES`): Amazon.com, Inc.,
whose ".com" the rule reads as no legal word; Hims & Hers doing business as Hims; Reckitt with Mead
Johnson; and named-after or bought units such as P&G's Mexican company, Labcorp's Bedford laboratory,
ADM Animal Nutrition, DuPont Nutrition (IFF's only from their merger of 2021-02-01), IsoTis (Orthofix's
from 2023-01-05) and Catalent Indiana (Novo Nordisk's from 2024-12-18). iRhythm's letter of 2023, to
"iRhythm Technologies, Inc.", is its page's by the former name EDGAR lists, which ingest reads. Namesakes
stay off: Kraft Drug is not Kraft Heinz, Cooper Institute not the Cooper Companies (whose CooperSurgical
is theirs). Before first prices, and leaving EDGAR's former names aside, 104 letters on 69 companies,
100 rows: 79 by the rule and 25 by the hand list (iRhythm's adds one at ingest), most on Amazon 10,
Walmart 5, then Abbott, Fresenius, Lilly and Medline 3 each; 44 of the 69 are outside the FDA recall map. The list begins in 2021; the older letters sit behind the FDA Data
Dashboard's API, which needs a registered key, and are not read. Public domain by the FDA's website
policies; no key.

### Supreme Court decisions, 1962–2026 (`lib/supremeCourt.ts`, batch 176)

The Supreme Court's decisions in the cases naming the company as a party: General Electric Co. v. Gilbert of 1976, Ford
Motor Co. v. EEOC of 1982, Carnival Cruise Lines v. Shute of 1991, Wal-Mart Stores v. Dukes of 2011, Comcast Corp. v.
Behrend of 2013, Google LLC v. Oracle America of 2021, each on the day the Court decided it. Approved by the owner on
2026-11-22 (the 2026-11-22c proposal 1) with call (a): the U.S. Reports to volume 586 and the Court's own slip-opinion
lists from the 2018 term, every decision naming the company, per curiam dispositions and in-chambers opinions included.
A row says what the Court did ("The Supreme Court decided Comcast Corp. v. Behrend, 569 U.S. 27 (2013): Reversed") and
the company's side (the petitioner, the respondent, the appellant…); it never summarises a holding.

The Government Publishing Office's govinfo holds the U.S. Reports as a collection: each volume's record lists its cases,
each with its name, citation and PDF, and for most argued cases the Supreme Court Database's day, kind and disposition.
`npm run sync:supreme-court` reads the records of volumes 368 to 586 (1961 to the 2018 term), 8,940 cases,
and the Court's lists of the 2018 to 2026 terms, 530 opinions. A case the record gives no day (most of the older
volumes' per curiam dispositions, and every case of volumes 585 and 586) and every slip opinion, where a side can be a
company, has its PDF's first pages read once with pdftotext: "Decided October 23, 1967." and the disposition after it, or
the syllabus's line citing the decision below ("855 F. 3d 1356, affirmed."), the "fi" pdftotext drops from the newer
PDFs read again. 1,112 PDFs were read (893 on govinfo, 869 of them giving a day; 219 of the Court's, nine of
them the 2018 and 2019 terms' preliminary prints), 3 s apart on govinfo (it answered 503 at 1.6 s) and 2 s on the Court's site; the
committed file (`data/supreme-court.json.gz`, 280 KB) holds every case, 8,432 of them dated; the 1,038 left undated name
no side that can be a company. It runs monthly; ingest
asks nothing.

A side is the company's by the merger notices' rule on its names of the year, the release map's and EPA's and the CPSC's
units and the taken names, from its first price, in the Reports' own spellings read as words ("Pacific Gas & Elec. Co.",
"Union Pacific R. Co.", "Abbott Labs.", "U. S. Bank N. A.", "Teva Pharmaceuticals USA, Inc."), and only with a legal word
or a name of two words or more: a caption names a person by the surname, so "Parker Seal Co. v. Cummins", "Pearson v.
Dodd" and "Vale v. Louisiana" stay off Cummins, Pearson and Vale, and "FMC" in four captions is the Federal Maritime
Commission. The other maps' units are read on their days: the railroads' owners (Norfolk & Western on Norfolk Southern,
Wisconsin Central on CN from 2001-10-09, BNSF on Berkshire from 2010-02-12), the Labor Department's and the NLRB's
(Oracle America on Oracle, Allstate Insurance on Allstate), and ten of this source's own, eight with the day read from a filing,
Converteam's from the quarter GE's 10-Q gives and Philip Morris USA as Altria's own throughout (batch 184) (`SC_UNITS`: Travelers' insurers from 2004-04-01, Slack on Salesforce, Supervalu on UNFI, Ameritech's Bell companies on
AT&T from 1999-10-08, Converteam on GE, WesternGeco on Schlumberger, Kraft Foods Group on Kraft Heinz, Lorillard on Loews
to 2008-06-09, Sony Music Entertainment on Sony, Philip Morris USA on Altria). Every company's matched captions were read by
hand: seven namesakes refused (`NOT_THE_COMPANY`: the old General Motors on GM's record of 2009, Southland Corp. of
7-Eleven, the Western Union Telegraph Company, Lear, Inc. of 1969, the old Gardner-Denver, Loew's of 1962, The Citizens
Bank of Alabama), and five cases a caption names by one word given to the company (`NAMED_BY_HAND`: FCC v. AT&T of 2011
and 2026, NVIDIA's of 2024, Amgen v. Sanofi on Sanofi, Bruesewitz v. Wyeth on Pfizer). A case of two listed companies
says "Also on" (db/060). Not read: a record's predecessor's names (old Alcoa's cases are Howmet's record's, whose chart
begins in 2016) and a name before EDGAR (Standard Oil Co. of California's on Chevron).

Against every company in the index under its present names: 327 company days on 157 companies (a bank's notes record, which takes none, left out since batch 184); from the first prices
the fixtures carry, 203 rows on 95 pages, 162 before 2017 (Exxon Mobil 12, Ford 9, CSX 7, AT&T 7, GE 6, Norfolk Southern
6, Bank of America 5, Chevron 5, Amgen 4, Boeing 4). With EDGAR's former names for the bank-like companies: 336 on 163,
205 rows on 96 pages, 164 before 2017 and 58 before 1994. The scout's estimate of about 500 counted the names before
EDGAR and the predecessors' that the rule does not read.

govinfo's policies page: "public documents can generally be reprinted without legal restriction", with customary
credit to the agency that prepared them; the Court's site states no licence for its own pages, speaking only of the
copyrighted materials of the sites it links to. No key.

### European Commission merger notifications, 1990–2026 (`lib/euMergers.ts`, batch 174)

The company's deals notified to the European Commission under the EU Merger Regulation, the first regulator outside the
United States on the site: Boeing/McDonnell Douglas of 1997, Walmart/ASDA of 1999, Procter & Gamble/Gillette of 2005,
Oracle/Sun Microsystems of 2009, Apple/Beats of 2014, IBM/Red Hat of 2019, and the foreign issuers' own (Deutsche Bank,
BP, Shell, Toyota, Santander). Approved by the owner on 2026-11-22 (the 2026-11-22b proposal 3) with call (a): one row on
the day the Commission received the notification ("European Commission received notification of Oracle Corporation's
acquisition of Sun Microsystems, Inc. (M.5529)"), and its first-phase clearance, where the Official Journal prints a
notice of non-opposition, a line on that row. A notification is not a clearance or a closing; the row says so.

The EU Publications Office's SPARQL endpoint lists the Official Journal's English notices year by year: 10,264
notifications from 1990-10-09 (corrigenda aside) and 8,507 notices of non-opposition, nearly all from 2000. The titles name
the parties by short names ("Merck/Sigma-Aldrich" is Merck KGaA's, not Merck & Co.'s), so they only pick the candidates: a
title whose party is exactly one of a listed company's names or aliases, or that names none, 2,479 notifications. Each
candidate's text is read once from the Publications Office's document store, CELLAR, whose robots file sets no delay:
its XHTML since 2004, its PDF before, read with pdftotext (an older PDF can print two notices on a page, so the reading
starts at the notice's own case number). `npm run sync:eu-mergers` commits the lists and what each text gives
(`data/eu-mergers.json.gz`, 1.1 MB): the day the Commission received it and the parties its first paragraph names in
full, each with its part in the deal (an acquirer, the undertaking acquired, the seller of a business, a party to a
merger; a controller, "belonging to Alphabet Inc.", takes its unit's; "the undertakings Bayer AG, Deutsche Telekom AG and
Infraserv GmbH & Co. Höchst KG" a party each, since batch 175). It runs monthly; ingest asks nothing. A year the endpoint
lists shorter than the file holds, or answers 404 for, fails the run with the file as it was (batch 175), and
`npm run sync:eu-mergers -- --reparse` reads each held paragraph's parties again with no request. A case number is read
with or without "Case" before it ("(M.6968 — Lufthansa/CAE/JV)", "Cases COMP/ECSC.1340 and COMP/M.2071"), so the eleven
notices written so carry their number and their clearance line (batch 175: FMC's M.8440 of 2017 among them).

A party is the company's by the merger notices' rule on its full name, under its names of the year, the release map's
units, the taken names and its first price. Every company's matched names were read by hand, and 14 namesakes refused
(`NOT_THE_COMPANY`): EQT AB on EQT, NOVA Corporation on Nova, Fortis of Belgium on Fortis Inc., Compass Group on
Compass, Inc., Metro AG on Metro Inc., Orange plc on Orange S.A., Wella AG on the Wella Company, and others; and since batch
175 one with a day, "Standard Life plc" on SLFPY from 2017-09-01: EDGAR's record never took the name Standard Life Aberdeen,
which its depositary's amendment of that day first gives, and the Standard Life plc of M.12645 (2026) is a different company
that took up the name. Merck KGaA's deals stay off Merck & Co. by its full name, with no list. A deal of two listed
companies says "Also on" (db/059).

Against every company in the index under its present names: 1,852 company days on 421 companies (1,853 on 422 before
batch 175 took SLFPY's 2026 row off); from the first prices the fixtures carry, 733 rows on 158 pages, 450 before 2017
(Goldman Sachs 100, Deutsche Bank 31, GE 23, Brookfield 18, BP 15, IBM 15, Boeing 13, Shell 13, TPG 13, Berkshire
Hathaway 12). With EDGAR's former names for the bank-like companies: 1,909 company days on 427, 779 rows on 160 pages, 667
of them with a clearance line (663 before batch 175 read the case numbers written without "Case"). "© European Union,
https://eur-lex.europa.eu"; the Commission's reuse policy (Decision 2011/833/EU) allows commercial reuse. No key.

### Big investors' 13F holdings changes, 2013–2026 (`lib/instHoldings.ts`, batch 179)

What the big investors bought and sold of the company's stock, quarter by quarter, from the SEC's Form 13F reports: every
investment manager with $100 million or more of listed securities reports its holdings at each quarter's end, within 45
days. No one's orders or trades are public, so a change is the difference between two of a manager's reports, and the rows
say so. Approved by the owner on 2026-11-24 with N-PORT (funds and ETFs, batch 180) and insider trades (Forms 3, 4 and 5,
batch 181): "one row per quarter naming the biggest buyers and sellers, plus a separate row for any single holder whose
change equals 1% or more of the company's shares".

- **The quarter's summary,** on the reports' deadline (the 45th day after the quarter): how many managers reported
  holding the stock, the net change of those that reported both quarters, and the three biggest buyers and sellers
  ("Big investors' 13F reports for the quarter ended June 30, 2024: biggest buyer …, biggest seller …").
- **A 1% move,** on the day its manager's report was filed: any one manager's change equal to 1% or more of the company's
  shares ("Berkshire Hathaway Inc reported selling 389,368,450 Apple Inc. shares in the quarter ended June 30, 2024
  (2.6% of the company)"), linked to the report on EDGAR, an amended report said to be one.

The SEC's Form 13F data sets (54 zips, a quarter's to 2023 and three months' filings since, 2.9 GB) are read once each
by `npm run sync:13f` into its cache (`.cache/13f`, git-ignored): each filing and its shares by CUSIP, options and
principal amounts left out. A manager's quarter is its latest original or restatement with the "new holdings" amendments
after it, unless such an amendment is as large as what it amends, when it is the report filed again (Morgan Stanley's
of 2024, which added would have doubled its every position); a notice (Vanguard Group's since 2026, its holdings reported
by its new advisers) is none, and a report whose holdings were omitted as confidential is replaced by the amendment that
gives them (Norges Bank's for 2025's first quarter, its 1,743 holdings filed a year later). A manager is compared only where it reported both quarters, neither report a quarter of the other's size; a
position it dropped in a report omitting confidential holdings, or took up after one, is no change; and a position whose
stated value gives a price five times off every other manager's (J. Stern & Co.'s 125,760,307 NVIDIA shares of 2025, a
units slip), unless by a thousand times (a value in the wrong unit), is set aside. A split is read from the managers'
own ratios (NVIDIA's ten for one of 2024), or where too few held through it from the company's stated share counts
(Wheels Up's one for twenty of 2026); a quarter whose figures still show a change larger than the company reads nothing.
Since batch 184 a split the ratios read is confirmed by the holders that show its factor exactly, as a split multiplies
every untraded holding alike (`confirmedSplit`: 7% to 22% of the holders in the real splits read, none of First Citizens'
194 in its CIT quarter of 2022, which batch 179 read as three for two, as it did Agnico Eagle's Kirkland Lake quarter and
Mativ's Neenah quarter): a split up not confirmed reads the holdings as stated, a stock merger's or an offering's being
real changes of holdings; a split down not confirmed, nor by the price rising, reads nothing (a spin-off's exchange).
The share counts are data.sec.gov's XBRL frames of each quarter (59 requests), a count stated before a split read in the
later unit, the next quarter's count telling which unit a split down's is in (batch 184); a company with several classes, or a trust of many ETFs, has no stated count and so its summary only.

A security's CUSIP is matched to its page by the SEC's fails-to-deliver files (`lib/cusipMap.ts`; one a month from June
2012, 172 files): the ticker the CUSIP last had, where it is in EDGAR's index and the description agrees with the
company's names, its aliases, predecessors and EDGAR former names ("DR HORTON INC" is HORTON D R INC's, Royal Dutch Shell's
CUSIP Shell plc's), a fund's description by its first three words, as its sponsor's brand can lead it ("STATE STREET SPDR
S&P 500 ETF"); a ticker another company took up later keeps the old CUSIP off it (CardioNet's BEAT, HeartBeam's since
2021). Since batch 180 an ETF's share class is matched too, by its series' name (`fundNamesAgree`): the files cut a
description at 30 characters and often lead with the trust's name ("VANGUARD INDEX FDS VANGUARD MO" is VTI's), so the
CUSIP still trading under the ticker needs only its sponsor's brand, and an older one two words of its own as well, since a
closed fund's ticker is taken up by another (QQQ's PowerShares CUSIP, before Invesco's brand, is so left off: its
quarters begin in 2016). 16,297 of the 49,951 CUSIPs seen are mapped (11,081 in batch 179), 3,196 refused by their names.
An ETF is a page like a company's; a mutual fund, which no exchange trades, has none.

The committed files (`data/13f/<year>.json.gz` and `cusips.json.gz`, 22 MB) hold 284,259 quarters on 10,930 pages (4,225
of them ETFs', added in batch 180; a trust states no share count, so an ETF has its summaries only), from
2013's third quarter to 2026's second, and 201,107 moves of 1% or more: none on the median page (7,382 of the 10,930
pages have none, the ETFs' among them), 72 or more on the busiest tenth, mostly small companies whose few holders own
large parts of them. 1,528 quarters read a split (2,201 before batch 184 confirmed each). From the first prices the
fixtures carry, 61,221 rows on 637 pages. The quarters of 2013's first half are left out: the SEC's first data set holds only a
few hundred of their reports. A monthly run needs about 5 GB of disk for its cache and 10 GB of memory; the first, about
two hours. No key; the SEC's own work.

### Insiders' open-market trades, 2006–2026 (`lib/insiderTrades.ts`, batch 181)

What the company's own officers, directors and 10% owners bought and sold of its stock, from the SEC's Forms 4 and 5: an
insider reports a trade within two business days on Form 4, and a late or exempt one on Form 5. Approved by the owner on
2026-11-24 ("Insider trades, Form 4"), reversing the call of 2026-10-18 to leave insider forms out; only the trades an
insider chose are kept, so the timeline is not buried by the forms' routine grants, option exercises, tax withholding and
gifts, which `lib/secForms.ts` still leaves out as filings.

- **One row a company a filing day whose trades come to $1 million or more,** purchases and sales together (the owner's
  call of 2026-11-24, batch 182: every trade made a large company's page busy), naming each insider who bought or sold that day, with the role the filing gives,
  the shares, their value at the prices reported and the trade days ("Musk Elon (CEO, director, 10% owner) sold
  21,995,000 Tesla, Inc. shares, about $3.6 billion"; "BERKSHIRE HATHAWAY INC and 1 joint filer (10% owner) bought
  5,985,190 OCCIDENTAL PETROLEUM CORP shares, about $352.5 million"), a trade under a Rule 10b5-1 plan said to be one
  where the filing's box (since 2023) is ticked, linked to the filing on EDGAR.

The SEC's insider transactions data sets (83 zips, 2006's first quarter on, 2 to 15 MB each) are read once each by `npm run
sync:insiders` into its cache (`.cache/insiders`, git-ignored): each Form 4 or 5 by an officer, director or 10% owner that
reports a non-derivative purchase (code P) or sale (code S) of the company's own shares, never a preferred share, a note,
a warrant or a right (`ownShares`, batch 184: an insurer's 40,000,000 "shares" of a closed-end fund at $40,000,000 each
were its notes), its first reporting owner (a joint filing's others counted, as they report the same shares), the issuer
and each trade's shares, price, day (none where it falls after the filing's), holdings after and whether held directly.
An amendment restates the last filing before it by the same owner for the same issuer and period, and keeps that
filing's day, as the trades were public from it; its trades dated after that day are a filing of their own on the
amendment's day. Each price is compared with the same company's other filings' of the 10 days either side, else the
year's, else its whole record (`readPrices`, batch 184): a filer can put the trade's total in the price column, as
Mubadala's 40,000,000 AMD shares "at $525,600,000.00 a share" of 2017-08-04, read now as $525.6 million; a price that is
no share's is set aside, and the row says so. One block several related owners each reported, alike to the share and
the holdings after, counts once, naming the others (Antero Resources Investment LLC's 12,000,000 shares of 2014-05-21,
reported by thirteen filers, about $744 million, not $9.7 billion). Rows are kept for the issuers EDGAR's index lists and the predecessors' records `lib/predecessors.ts` maps,
each up to its handover day (Exxon Mobil Corporation's insiders on XOM's page before 2026-07-01). Names are as filed,
surname first.

The committed files (`data/insiders/<year>.json.gz`, 6 MB) hold 139,994 company days of $1 million or more on 4,002
issuers, from 2006-01-03 to 2026-09-30: 11 on the median issuer, 94 on the busiest tenth, 1,658 at most; 13,709 of them
hold a purchase. The minimum leaves 379,761 smaller days out (batch 181 kept all 521,851, Meta's 1,264 among them, often a
few hundred shares a week under a trading plan; Meta keeps 770). Batch 184's rules read 135 prices as the trade's total
and set 887 aside, and left 141,131 days on 4,121 issuers at 139,994 on 4,002: the notes and preferred shares gone, and the
days that cleared $1 million only by a slipped price or a block counted once per filer. From the first prices the fixtures
carry, 35,190 rows on 558 pages. No key; the SEC's own work.

### Mutual funds' and ETFs' N-PORT holdings changes, 2019–2026 (`lib/fundHoldings.ts`, batch 180)

What mutual funds and ETFs bought and sold, from the SEC's Form N-PORT reports: a fund reports its holdings at each
month's end, and its report for each fiscal quarter's last month is public, filed within 60 days. As with 13F, no order or
trade is public, so a change is the difference between two of a fund's public reports, about three months apart, and the
rows say so. Approved by the owner on 2026-11-24 with 13F (batch 179) and insider trades (batch 181).

- **On a fund's page,** a row on each report's filing day where the fund bought or sold a security worth half a percent of
  its net assets or more, naming its three biggest purchases and sales ("ARK Innovation ETF's N-PORT report for July 31, 2026: biggest purchase Space Exploration Technologies Corp (SPCX) (+2,501,617 shares), biggest sale Roku Inc (ROKU) (−2,407,993)"), each with its shares
  before and after and its value at the report's prices. A fund's share classes are one fund: VOO's page and VFIAX's show
  Vanguard 500 Index Fund's reports.
- **On a company's page,** a row for any one fund whose change equals 1% or more of the company's shares (the 13F rule's
  count, data.sec.gov's XBRL frames), on the later report's filing day ("Vanguard 500 Index Fund reported buying 15,194,651 Tesla shares between September 30, 2020 and December 31, 2020 (1.6% of the company)"), linked to the report on
  EDGAR. The quarter's summary of the biggest buyers and sellers stays 13F's: a fund's manager reports its funds' holdings
  there too.

The SEC's Form N-PORT data sets (28 zips, 2019's last quarter on, 240 to 480 MB each) are read once each by `npm
run sync:nport` into its cache (`.cache/nport`, about 5 GB with the months it writes, git-ignored): each public report's series, month, filing day and net
assets, and its long positions in stocks, preferreds and funds by share count (`UNIT` NS), with their stated dollar value;
bonds, options, swaps and short positions are left out. A security is keyed by its page's ticker through the 13F map, else
its CUSIP (a US ISIN's where the fund gives no CUSIP), else its name, and a security that took a new CUSIP between two
reports under the same name is one (a reverse split's). A fund's month is its report filed last, an amendment restating the
whole; two reports are compared when they are two to four months apart and neither holds a quarter of the other's
positions. A position whose stated value gives a price five times off the other funds' median is set aside. A split is the
median ratio of the funds that held the security through the same two months, five or more, where the 13F holders read
it too, or a twenty-fifth of the funds show it exactly, or else their median price moved the other way; none where the
13F holders read no split in every overlapping quarter from 20 managers or more (batch 184: Hawaiian Electric's offering
of September 2024, which grew every index fund by half as the price fell, read before as three for two). Only where fewer
than five funds held it through is the fund's own split read, where its shares moved by a simple ratio and its price the
other way: a first run that read the ratios alone gave Eledon a 14-for-1 split in 2021 (its funds' stakes all grew in a
financing) and read false sales of up to 91% of a company. A position held through is not compared where the 13F holders read a split in an
overlapping quarter, the company's stated counts show one, or the price rose two and a half times or more, that the funds'
shares do not show; a new or closed position then stays on the fund's page in its report's own shares but makes no move.

A 1% move is measured against the stated count of the later report's quarter (the 13F sync's frames) only where the
earlier quarter's agrees with it, or differs by the split the funds show, and the quarter after agrees too where its frame
is read (NRx's blank-check company stated 2,688,242 shares before its merger of 2021, 58,810,338 after): the frames hold counts off by a hundred times
(Holley's 1,093,750 of 2023's third quarter, beside 118 million) and counts stated after a reverse split the funds' reports
precede (Regis's of 2023), which the trial runs read as one fund's sale of 46% of a company and an index fund's of 80%. A
security whose change still exceeds the company's shares reads nothing that month.

The committed files (`data/nport/<year>.json.gz`, 13 MB) hold 151,362 fund reports on 9,671 fund pages and 15,829
moves of 1% or more on 2,332 company pages, from the reports of December 2019 to those of July 2026, naming 9,756 funds. From the first prices the
fixtures carry, 2,789 moves on 379 pages. A quarterly run needs about 5 GB of disk for its cache and 8 GB of
memory, and reads the 13F sync's map and frames, so it runs after it; the first, about two hours. No key; the SEC's own work.

### The EU courts' judgments, 1955–2026 (`lib/euCourts.ts`, batch 183)

What the Court of Justice of the European Union and its General Court ruled in the company's own cases: its appeals of the
Commission's competition, merger and State aid decisions (GE's and Honeywell's against the merger ban, 2005; Akzo Nobel's
against the heat stabiliser decision, annulled in 2015; Intel's, Google's and Qualcomm's), and the references from national
courts naming it (Lufthansa's, Ryanair's and Banco Santander's passengers and borrowers). Approved by the owner on
2026-11-22 (the 2026-11-22c proposal 3) with call (a): every judgment naming the company as a party, but the trade mark and
design cases against the EU's intellectual property office and staff cases.

- **One row a company a day:** "The EU General Court ruled in General Electric Company v Commission (T-210/01): Action for
  annulment - Competition - …", the company's side where one case has two (the applicant, the defendant, an appeal's
  appellant or respondent; a party to the national case in a reference), and the court's operative part where its text
  was read ("1. Annuls the Commission Decision of 30 June 2011 …"). The row never summarises the court's reasons. A
  judgment of two listed companies says "Also on" (Illumina's and Grail's appeal of 2024).

The list is the Publications Office's SPARQL endpoint asked year by year for the English titles holding "judgment of the",
73 lists and 77,858 titles, no year over 4,484. A judgment is two works, its own title and the Official Journal's notice of
it, read in their forms ("Judgment of the Court … of 20 January 2005 in Case C-300/03 (reference …): Honeywell Aerospace
GmbH v Hauptzollamt Gießen (Community transit — …)", and since 2008 "Case T-485/11: Judgment of the General Court of 15 July
2015 — Akzo Nobel and Others v Commission (…)") and joined by their first case and day: 21,274 judgments. A side's names
are split at commas and "and" only where every part is a legal name or a public body, so "Apple and Pear Australia Ltd"
stays one name. A party is the company's by the merger notices' rule, with namesakes read by hand (the old General
Motors's case of 1999, FMC plc the British meat company, IBP Ltd the copper fittings maker, Knoll International's case of
2015 before Herman Miller bought Knoll) and Honeywell Aerospace GmbH Honeywell's own until its spin-off's record began.
The operative part of each judgment a listed company is a party to is read once from CELLAR, the notice's text first, else
the judgment's own: 286 of 326. Under present names, 312 company days on 106 companies; from the first prices the
fixtures carry, 135 on 55 pages, 68 before 2017 (Merck & Co. 11, Banco Santander 11, Akzo Nobel 9). The file is 3 MB.
Credit: "Court of Justice of the European Union", whose copyright page lets the case-law be reproduced with the source
acknowledged; the notices "© European Union, https://eur-lex.europa.eu". No key.

### European Commission competition decisions, 1973–2026 (`lib/euAntitrust.ts`, batch 177)

The Commission's antitrust and cartel decisions addressed to the company, with the fines their texts state, and its State
aid notices and decisions naming the company as the aid's beneficiary: Microsoft's of 2004, 2009 and 2013, Intel's of
2009 and 2023, Google's Shopping (2017), Android (2018) and AdSense (2019) decisions on Alphabet's page, AstraZeneca's of
2005, the switchgear cartel on ABB, Alstom and Hitachi (2007), Teva in Servier's case (2014), the forex and bond cartels on the
banks (JPMorgan, Citigroup, Barclays, UBS, Deutsche Bank, HSBC, Bank of America), the trucks, car-recycling and occupant
safety cartels on PACCAR, Ford, GM, Toyota, Honda, Stellantis and Autoliv, Apple's, Amazon's, Starbucks's, McDonald's and
Nike's tax rulings and Ryanair's airport aid. Approved by the owner on 2026-11-22 (the 2026-11-22c proposal 2) with call
(a): State aid included where the company is the beneficiary. One row a company a day: "The European Commission's
decision in Case AT.40099 (Google Android) was addressed to Google and Alphabet", the line saying among how many
addressees and "Fines: EUR 4,342,865,000 on Google"; a State aid row says the company is the beneficiary and the member
state the addressee. A decision can be appealed to the EU courts, and the row says what the Commission did on its day.

The Publications Office's SPARQL endpoint lists the Official Journal's English titles year by year, two queries a year:
869 decisions "relating to a proceeding" from 1973-01-02, the first year of the English edition (an archive copy, a
summary and the decision printed whole of one case and day are one, 689), and 1,909 State aid titles from 1976; a title
that writes "Commission decision" small, Google Shopping's, is one since batch 178. The
archive's drafts and meeting agendas, the Euratom safeguards decisions and the communications are not decisions and are
not listed; the archive scans' days are read as they write them ("2. VII. 1987", "24.11.1987", "26. 7. 88"). Each
decision's text is read once from CELLAR (its XHTML, else its HTML, else its PDF with pdftotext, a scan left unread where
the same case and day is held as markup), 733 texts, 1.6 s apart; `npm run sync:eu-antitrust` commits the lists and each
text's addressee and fine passages (`data/eu-antitrust.json.gz`, 270 KB), which the module reads at load, so a rule's
change needs no request. It runs monthly; ingest asks nothing. A year the endpoint lists shorter than the file holds fails
the run with the file as it was.

A decision's addressees are its own passages': its article "This Decision is addressed to: …" (or "was addressed", "The
decision is addressed to the Swedish company AstraZeneca AB and the UK company AstraZeneca Plc", "The following companies
were addressees of the Commission's decision: — Servier S.A.S. — …") with their addresses (an item after a bare comma is a
name only with a legal word, "Alstom (Société Anonyme)" one; a postcode, a street, a building never), a summary's groups
("— MAGNA: Magna International Inc., …", "(b) for Dow: The Dow Chemical Company from 1 July 1996 to …"), its fines' list,
the fines imposed and on whom, a finding of who infringed, and the commitments made binding; "made binding the
commitments offered by the four publishers and Apple", which Penguin's decision of 2013 recalls of the 2012 one, names an
addressee only where nothing else does. "The Shell Transport and Trading Company Ltd" is one name, "Les Laboratoires
Servier and Servier Laboratories Limited" two, "Honda Motor Co." and "Honda Motor Co., Ltd." one; the footnotes after a
list are not read. 572 decisions name their addressees. A fine is whole euros (or ecus before 1999), never a float: "EUR
4,65 million" is 4,650,000, a fine owed jointly is one fine with every name liable for it, a parent liable for a part
only ("of which EUR 1 921 666 000 jointly and severally with Alphabet") is given none, an immunity's EUR 0 is no fine, and
a list that writes one fine's names apart ("Servier S.A.S.; Les Laboratoires Servier; … jointly and severally liable: EUR
131 532 600") gives it to them all. 130 decisions state their fines so.

An addressee is the company's by the merger notices' rule on its full name or the short name the decision uses ("Google",
"Intel", "Shell"), under its names of the year and the release map's units; the State aid beneficiary by the same rule on
its title's phrase ("implemented by Ireland to Apple", "Excess profit exemption granted to St. Jude Medical", Abbott's
since 2017). Every company's matched names were read by hand: four namesakes refused (`NOT_THE_COMPANY`: "Dow", The Dow
Chemical Company's short name, off Dow Inc.'s record before 2019-04-01; "Post", the REIMS II decision's postal operators,
off Post Holdings; and since batch 178 "Merck", Merck KGaA's in Lundbeck's case, off Merck & Co., and "IBP Limited", the
British copper fittings maker, off Tyson's) and three units added (`EU_UNITS`: Ford-Werke on Ford, BP Chemicals on BP,
Zoetis Products LLC on Zoetis). The banks' notes records
(UBS AG's, Barclays Bank PLC's) take none: their decisions are their groups' pages'. A decision of several listed
companies says "Also on" (db/061).

Against every company in the index under its present names: 180 company days on 97 companies; from the first prices the
fixtures carry, 89 rows on 48 pages, 55 before 2017 (Akzo Nobel 6, BP 6, Ford 4, Apple 3, Deutsche Bank 3, FMC 3,
Mastercard 3, Microsoft 3, Philips 3, UBS 3). With EDGAR's former names for the bank-like companies: 187 on 100, 92 rows
on 50 pages, 57 before 2017; 161 of the 189 matches antitrust, 28 State aid (batch 177 measured 163, 83 and 172 before
batch 178 read the wordings and titles it had missed). A company's EDGAR former names, which ingest reads and these
counts do not, add more: GlaxoSmithKline's decision of 2001 is GSK's by its former name. "© European Union,
https://eur-lex.europa.eu"; reuse under Decision 2011/833/EU, commercial use allowed. No key.

### Federal Reserve H.2 actions on applications, 1996–2026 (`lib/fedH2.ts`, batch 173)

What the Fed did on each of a bank's deals, week by week, including the decisions its staff and the twelve Reserve Banks
take under delegated authority, which the Board's own orders and press releases never carry: Norwest's residential
mortgage lending of 1997, Wells Fargo's Prime Bancshares of 1999, FBOP's stake in Banner of 2007, BNP Paribas's shares of
Shinhan of 2008, the Vanguard Group's change-in-control notice on Northern Trust of 2021, United Community Banks' deals
from Blairsville, Georgia and then Greenville, South Carolina. Approved by the owner on 2026-11-22 (the 2026-11-22b
proposal 2) with call (a): the Fed's actions on the company's deals, on the action's day; the applications' Federal
Register notices are not read. A row says what the Fed did that day ("approved, under delegated authority", "permitted",
"was withdrawn", "took effect"), never when the deal was announced or closed.

The Board's release "H.2, Actions of the Board, Its Staff, and the Federal Reserve Banks; Applications and Reports
Received" has one PDF a week from 1996-11-02: 1,567 weeks to 2026-11-14, 493 MB, each read once with poppler's
`pdftotext -layout` in one of three layouts (`readH2`: the categories in capitals to 1998, in title case to 2022, an em
dash and "Approved: September 7, 2023" since). The weeks of 1996-11-09 to 1997-10-04 but one are scans with no text, and
the Board serves the file of 2018-05-26 damaged; those 48 weeks are listed as unread. `npm run sync:fed-h2` commits the
20,903 actions filed under the headings a deal is filed under (`data/fed-h2.json.gz`, 1.0 MB) and reads one new week a
week; ingest asks nothing. 18,019 of them are deals (`isDeal`): an acquisition, a merger, a change in control, a new
holding company, a nonbank activity, a financial holding company election; the public welfare investments, interlock
exemptions, notice-period waivers, comment periods and other routine actions under the same headings make no row. (The
161 new holding companies with no other deal word, Goldman Sachs's of 2008-09-21 and Bank of Montreal's of 2000 among
them, made none until batch 175: the pattern's word boundary fell inside "company".) A week whose text gives no action
under any heading is a layout `readH2` does not know, and fails the sync rather than being held (batch 175).

A party is the company's by the merger notices' rule (`partyIsCompany`) on each applicant and each company acquired,
under its names of the year, its EDGAR former names among them (Norwest Corporation is Wells Fargo's record to 1998).
The release gives every party's city, so a namesake is refused by it: the matches of 417 companies were read by hand, 220
of them with a party outside the home city, and 89 companies with namesakes are parties only at their own places
(`HOMES`): Commerce Bancshares of Kansas City, not those of White Castle, Louisiana or Franklin, Tennessee; Citizens
Financial of Providence, not the Citizens Banks of dozens of other towns; United Community Banks at Blairsville and Greenville,
its head office's move. One row a company a day, linked to the week's PDF, its id the day's actions, so a deal of two
listed companies says "Also on" (db/058). A Board action the Board's own release or order of its day names, in its title or
its order's sentence, is a line on that release's row, never a row of its own; since batch 175 the line lists every Board
deal of the day the release names (`releaseH2Line`), whichever company's page reads it, so a release two pages share, the
Board's approval of Goldman Sachs and Morgan Stanley as bank holding companies on 2008-09-21, says the same on both. A Board
action of the day the release does not name keeps its own row.

Against every company in the index under its present names: 2,145 company days on 383 companies; from the first prices
the fixtures carry, 815 on 94 pages, 635 before 2017 (Wells Fargo 63, Fifth Third 36, Regions 34, Bank of America 29,
M&T 26, Zions 24, BMO 23, Popular 20, Old National 19, First Busey 16). With EDGAR's former names, which ingest reads, for
the 857 bank-like companies: 2,489 company days on 402 companies, 969 rows on 101 pages from those first prices, about
three quarters of their actions the Reserve Banks' or the staff's (2,124 on 381, 810, and 2,467 on 400 with 964 rows,
before batch 175's new holding companies). Public domain by the Board's website notice ("Please
cite to the Board as the source of the information"); no key.

### FDA 510(k) clearances and De Novo grants, 1976–2026 (`lib/fdaClearances.ts`, batch 172)

Each device the FDA cleared the company to sell, from the Medical Device Amendments of 1976: Abbott Laboratories'
portable cardiac monitor of 1976-09-16, Stryker's bone cement of 1976, Intuitive Surgical's Monarch laparoscopic
manipulator of 1997, Apple's ECG app, granted as a De Novo request on 2018-09-11. Approved by the owner on 2026-11-22
(the 2026-11-22b proposal 1) with call (a): one row a company a month, on the month's first decision day, naming each
device and its 510(k) number ("FDA cleared 2 of the company's devices in May 2017: da Vinci X Surgical System
(K171294) and …"), and a De Novo grant, a new kind of device, a row of its own. A clearance finds a device
"substantially equivalent" to one already marketed; the row never says the device was launched or sold.

openFDA's `device/510k` file holds all 176,683 decisions (one keyless zip of 250 MB, 1.6 GB of JSON, last updated
2026-11-18). `npm run sync:fda-clearances` streams it a record at a time and commits the 20,368 a company in the index
holds by the rule, 59 of them De Novo grants (`data/fda-clearances.json.gz`, 579 KB); it runs monthly, and ingest asks
nothing. Unlike the PMA file, cut on 2026-11-07, this one keeps the applicant that filed.

A clearance is the company's by the approvals' rule on its day (`approvalIsCompany`): the caption rule under its
names of the year, the recall map's firms and the approvals' names on their days, the table of taken names, its first
price. The recall map's units were dated back to their purchases for it, each day from a filing: Howmedica Stryker's
from 1998-12-04, DePuy J&J's from 1998-11-04 (its Form 15) and Cordis from 1996-02-23, LifeScan from 1987 (bought in
1986, before EDGAR), Physio-Control Medtronic's from 1998-09-30, Linvatec ConMed's from 1997-12-31, Radiometer
Danaher's from 2004-01-27 and KaVo from 2004-06-01 ("in May 2004"); Howmedica's earlier clearances, and Linvatec's,
reach no page, their earlier owners' days unread. J&J's "Ortho" names are its own Ortho companies only, never Ortho
Development, Ortho Organizers and the 32 other names of firms called Ortho, nor Ortho-Clinical Diagnostics after its sale (for the
approvals and the warning letters too). Every company's distinct applicant names were read by hand, 1,316 of them on
276 companies, and 42 refused (`NOT_THE_COMPANY`): namesakes ("Blackstone", the spinal-implant maker, not Blackstone
Inc.; "Boston Scientific, Target", Target Therapeutics, not Target Corporation; Merck KGaA's biomaterials companies
on Merck), and the names the file gives a unit's own records before its owner took it ("Medtronic Minimed" before
2001-08-28, "3M Health Care, Sarns" before 1982, "Meadox Medicals, Div. Boston Scientific" before 1995-11-16).

Against every company in the index under its present names: 18,305 company days on 246 companies before first prices;
from the first prices the fixtures carry, 12,056 on 63 pages, 9,285 before 2017 and 2,734 before 1994, as 5,467 rows
(4,129 before 2017, 25 De Novo grants): Johnson & Johnson 561, Medtronic 522, BD 489, GE 464, Philips 452, Abbott 438,
Stryker 389, Boston Scientific 339, 3M 321, Baxter 257. openFDA's content is public domain under CC0 1.0; its header
warns that results are unvalidated.

### FDA press releases and talk papers, 1962–2014 (`lib/fdaHistory.ts`, batch 169)

The FDA's own announcements in its own words, decades before the held FDA sources begin: Lilly's Ilosone, which the
Bureau of Drugs asked Lilly's Dista Products to take off the market in 1979; GE's 14,000 defective sunlamp kits of
1977; the seizure of Procter & Gamble's Citrus Hill "fresh" orange juice in 1991; and, from the 2000s, the first
generic makers of a drug and the season's flu vaccines. Approved by the owner on 2026-11-22 (the 2026-11-22
proposal 3), with call (a): a release of the day of an approval the page holds adds its sentence to that approval's
row ("The FDA's press release that day: …", Amgen's Epogen of 1989, Pfizer's Diflucan of 1990, Abbott's Humira of
2002) and makes no row of its own. Since batch 170 (the 2026-11-22 audit's finding 5) only a release that names the
approval's drug, by trade name or ingredient, joins it (`releaseFor`): Strattera's row of 2002-11-26 carries the
Strattera paper and the Forteo paper of that day is a row of its own, and Merck's trientine release of 1985-11-26 is
no part of Primaxin's row.

openFDA publishes the agency's historical documents, press releases and talk papers of 1913–2014, as one keyless zip
of OCR text (8,858 documents, last updated 2026-11-18). `npm run sync:fda-history` reads it once into the committed
`data/fda-history.json.gz`; the file ends in 2014, so it is run again only after `npm run sync:tickers`, and ingest
asks nothing. A document's day is the one its head gives in its own year (6,374 of those of 1962 on): the day beside
its release line or its talk paper's number first, the OCR's letters for figures read there ("T89-55 Donald C McLearn
Sept. l8, 1989"), then the first other; never a revision's day ("revised on March 21, 2007") or one closing a note of
what it updates (batch 170, finding 4: Lilly's recall paper of 1989 was 24 days early, the Menu Foods recall four days
late). One whose OCR spoils the day ("N0vember") makes no row. A company is named by the prose rule: its name of the year with a
legal word after it ("Eli Lilly and Company", "Pfizer Inc."), or its whole name of two words or more printed
capitalised ("Procter & Gamble"), never after another capitalised word, which makes it the end of another firm's
name (Marion Merrell Dow Inc. is not Dow, Hoechst Celanese not Celanese, Dow Corning not Corning), unless that word
is one a name follows ("by", "The", a town's "-based", a headline's last word in capitals); then the caption rule's
guards, the table of taken names and the first price. A document naming more than two listed companies (a list of
drug makers, a campaign's pharmacies) names none. Three rows the guard refuses the hand read keeps (`NAMED_BY_HAND`),
each titled by the document's sentence saying what the FDA did: Mylotarg's withdrawal of 2010 on Pfizer, the skin
tests of 1977 whose licences it moved to revoke on Lilly, the toys it banned in 1970 on Hasbro. Each row's title is the
document's own sentence naming the company, a talk paper's heading through its day left off ("…GENERAL ELECTRIC
MICROWAVE OVENS There have been reports …"), its description the document's lead, as the OCR text gives them, the talk paper's note, the letterhead and
the telephone numbers left off; a talk paper is said to be one, written for FDA staff answering questions.

Every kept row was read by hand once, and 65 are refused by document and company (`REFUSED`): a namesake ("First
National Stores", "Innovative Food Defense", Akzo's Organon of the 1970s to the 1990s), a person's employer, a
newspaper quoted, a table or list of firms with no FDA action on the company's own product. A list that reports such
an action is kept for each maker it names: Teva's and Sandoz's generic approvals, Sanofi Pasteur's flu vaccines each
season. In the file: 536 documents naming a listed company, 481 company days on 80 companies before first prices;
from the first prices the fixtures carry, 335 on 32 pages, 90 before 1993 (Lilly 54, Abbott 42, Pfizer 35, Johnson
& Johnson 32, Teva 25, Novartis 24, Merck 19, Procter & Gamble 17, Sanofi 11, GE 9), and 38 approval rows that
carry their day's release. openFDA's content is public domain under CC0 1.0; its header warns that results are
unvalidated, and a row quotes the document, never rewrites it.

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

The API is asked by its `title` filter (batch 121). It ignores `parameters[title]`, the form it once
read: on 2026-11-08 every name asked that way (Walmart, BNSF, "Pacific Gas") came back with the same
488 releases, none naming it, so no company found a release from the API, while `title=Walmart` gave
68. The rule kept those 488 off every page, so nothing wrong was stored; the releases were simply not
found. Each company's next Justice Department run reads them.

The operating units EPA files cases under (`UNITS`, batches 104, 114 and 120) are in the release map
by their own names, on the same days (`OPERATING_UNITS`, batch 121, the owner's approval of
2026-11-08): 288 names on 74 companies, and Honda's two beside its lender. The Department settles
with the unit, and the company's own name followed by words that are not legal ones names no
company: "Pratt & Whitney and PCC Airfoils to Pay More Than $52 Million" (2008) is RTX's,
"Firstenergy Nuclear Operating Company to Pay $28 Million" (2006) FirstEnergy's, "Commonwealth
Edison Agrees to Pay $200 Million" (2020) Exelon's, "PacifiCorp Agrees to Pay $575M" (2026)
Berkshire's. A unit sold to another listed company is that company's from the day: Otis Elevator's
settlement of 2025 is Otis Worldwide's, not RTX's. Measured from first prices: 14 more releases on 9
pages from the archive, and 40 on 19 from the API's years, 54 on 23 pages in all, each read by hand, none fewer. Every
release rule reads the map, so the SEC's 2024 bribery charge against John Deere, SCANA's SEC cases
of 2020 (on Dominion) and the CFTC's propane charge against BP Products North America (2006) and
wash-sale penalty on San Diego Gas & Electric (2010) reach their pages too.

The drug, device and health makers' own companies are in the map too (`HEALTH_UNITS`, batch 128, the
owner's approval of 2026-11-09): 28 names on 13 companies (27 before batch 130), each on the days the FDA map reads it or
its owner's filings give. The Department settles with the company that did the business: "Novartis
Pharmaceuticals Corp. to Pay More Than $420 Million" (2010) is Novartis's, "U.S. Pharmaceutical
Company Merck Sharp & Dohme to Pay Nearly One Billion Dollars" (2011) Merck's, "Janssen
Pharmaceuticals Pleads Guilty" (2013) J&J's. A unit bought counts from the day: Guidant's plea of
2010 is Boston Scientific's (from 2006-04-21), Covidien's of 2019 Medtronic's, Aetna's of 2026 CVS's
(from 2018-11-28), and Caremark's of 2005, before the merger, no page's. "LP" counts as a legal word,
as "L.P." did, so "ASTRAZENECA PHARMACEUTICALS LP PLEADS GUILTY" (2003) is AstraZeneca's. Measured
from first prices: 33 more releases on 10 pages, 20 before 2017 (Novartis 7, CVS 6, Sanofi 5,
Abbott 4, Boston Scientific 3, J&J 2…), each read by hand. Batch 130 added the names their own
releases use, "DePuy Synthes" (from 2012-06-14) and "Teva Pharmaceuticals", for DePuy Synthes's $9.75
million of 2023 and Teva's $425 million of 2024. Every release rule reads the map, so the
SEC's 2017 bribery charge against Biomet, a press release and an administrative proceeding, reaches
Zimmer Biomet's page too.

The API holds nothing before 2009, so the releases of 1996–2008 come from the Department's own
archive, one page a month at `www.justice.gov/archive/opa/pr/YYYY/Month/` (`lib/dojArchive.ts`,
batch 94; 1996–2000 from batch 128). The archive is closed: each of its 152 months is read once for every company and kept
(`doj_archive_releases` and `doj_archive_months`, `lib/ingest/dojArchiveWalk.ts`), at most 24 months
a process, a second apart, a month stored only when its page answered with releases it could read.
Two layouts: 1996–2004 a list, "#807: 12-30-04 HEALTHSOUTH TO PAY…", mostly in capitals from 1998; 2005–2008
day headings over each title, from mid-2005 with its first lines, kept as the teaser. The old pages
write Windows-1252's quotes, read as quotes, and the 2005–2008 pages' possessive "VERIZON&#8216;S"
as one (batch 100). 5,712 releases; the 5 rows a slip leaves without a day
(a "02-30-02") are left unread, not guessed. Each company keeps the kept releases the rule above
makes it a party to, under the names it had that year (Wal-Mart's of 2001–2004 under its own
"Wal-Mart", BB&T's under Truist's former name), from its first price on: against every company in
the index, 125 releases on 78 pages, every year of the eight (AEP's $30 million criminal penalty of
2005, Weyerhaeuser's Kalamazoo River settlement, Akzo Nobel's antitrust plea, Whirlpool's Maytag and
Verizon's MCI cases; Exxon Mobil 7, Walmart 6, Tenet 5; 111 on 73 before batch 121's units). A one-word name that is only an industry's
word for a company, The Bancorp's "Bancorp", names it after "the" but not after another capitalised
word: "Berkshire Hills Bancorp and Legacy Bancorp" are two other banks (batch 100). Same source,
`doj_press`, under the same terms.

The months of May 1996 to December 2000 (batch 128, the 2026-11-09 proposal 3(a)) are read the same
way. Their folders are named as the archive names them: `1996/May96/`, `Jun96/`, `Sept96/`,
`1997/April97/`, then 1998's month alone. The pages of January to April 1996 list their releases with
no day, and 1994 and 1995 answer 404, so the archive starts in May 1996. 2,608 releases; 27 rows a
slip leaves without a day or with another year's ("06-22-98" on June 1999's page) are left unread.
Against every company in the index, from first prices: 67 releases on 40 pages, ADM's record
antitrust fine of 1996, the Microsoft suit of 1998, American Honda's $267 million of 1998 (Honda's
unit), GE's Housatonic River settlements, Alcoa's five (old Alcoa Inc.'s, on AA, whose chart before
2016 is old Alcoa's: the owner's call, decided on 2026-11-12, batch 146). Three titles naming AT&T Corp. stay off AT&T's page, since SBC's record took that name in
2005 (`lib/takenNames.ts`), and 14 fall before their company listed. Eight of Microsoft's are the same
"NOTICE OF UPCOMING DEPOSITIONS IN U.S. v. MICROSOFT", and the page shows them as a row a month
(the owner's call): "Justice Department: 5 notices, …" for May 1999, linking to the newest.

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
2016-07-11 is not on JCI's page since batch 146: Tyco's record, JCI's, took Johnson Controls' name at
their merger that September, and JCI's chart before it is Tyco's (`lib/takenNames.ts`). Lazard Capital Markets was LFCM Holdings', not Lazard's, and Fiserv Securities' case of 2005
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
2021-02-17). Batch 145 (the 2026-11-11b proposal 2, approved by the owner 2026-11-12) added the
companies named after their brokers, banks and managers that the SEC's captions name: Invesco Funds
Group on Invesco, RBC Capital Markets on Royal Bank of Canada, Raymond James Financial Services and its
advisory company on Raymond James, Ford Motor Credit on Ford, HSBC Bank USA on HSBC, Northern Trust
Hedge Fund Services on Northern Trust and U.S. Bancorp Investments on U.S. Bancorp; they add 47 SEC
case days (Invesco Funds Group's market-timing fraud of 2003-12-02 and its 14 proceedings), two press
releases and the CFTC's $5,000,000 supervision order against RBC Capital Markets of 2019. Read against every company
in the index under its current names, 270 of the 6,897 stored releases land on 131 companies, 163 of
them before 2017 (266 on 129 and 161 when first counted; Invesco Funds Group's charge of 2003 and RBC
Capital Markets' of 2011 since batch 145) (Daimler's and Novartis's bribery charges since batch 100 reads "AG" as a legal word) (Bank of America 28, Morgan Stanley 18, Citigroup 14, JPMorgan 13, UBS Group 12,
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
current names, the 30,747 rows give 1,194 company days on 372 companies, 587 of them before 2017
(1,195 on 373 and 588 before batch 165 took old Broadcom's case of 2008 off AVGO; 1,196 on 374 and 589 before batch 146 took old Johnson Controls' order of 2016 off JCI; 1,149 on 370
and 555 before batch 145's brokers', banks' and managers' companies) (Bank of America 73, Morgan Stanley 73, JPMorgan 52, Citigroup 49, Wells Fargo 47, UBS Group 47,
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
(`BRANDED_SITE`), and joint ventures (Chevron Phillips Chemical, Nucor-Yamato) are no one's. A unit
read for the vehicle, rail or product maps is read for EPA's too, on the same days (batch 150, the
audit of batches 143–149, finding 1): Hino Motors on Toyota from 2001-08-31 to 2026-03-31 (its
$532,213,113.70 decree of 2025), Missouri Pacific on Union Pacific from 1982-12-22,
Kelly-Springfield on Goodyear from 1991-10-01, the Delaware and Hudson on Canadian Pacific from
1991-01-18, Fisher-Price on Mattel from 1993-11-30, and Playskool and Milton Bradley on Hasbro from
1984-12-31. Against
every company in the index, on EPA's whole file of 2026-10-31 (the committed slice gives the same
rows since batch 116; 55 more since batch 117's table of taken names), before first prices: 9,561 rows on 705 companies, 8,065 before 2017
(GE 309, ExxonMobil 295, Chevron 278, BP 255, Honeywell 252; 9,545 on 704 and 8,050 before batch 150 read batch 148's units
for EPA too, 16 rows on six pages, Hino Motors' decree of 2025 on Toyota's among them; 9,547 before batch 149 ended Southern
Natural Gas on Kinder Morgan at its joint venture of 2016; 9,584 and 8,089 before batch 146 took old Johnson Controls' 39 rows off JCI and put its battery company's 2 of 2017 on; 9,404 on 693 before batch 145's fifth round of units, 9,386 before batch 142's Amazon unit and Brink's Inc.; on 692 before batch 137 moved Kroger Specialty Pharmacy's
order of 2026 to Elevance Health, which bought it in 2024; 9,155 on 690 before batch 135's fourth round of units; one fewer since batch 124 took a misspelled UT Automotive decree of 2007 off RTX; 8,889 before batch 122's suits filed and settlements on their days; 7,899 on 679 before batch 120; 5,994 on 667 before the units, every one of
whose cases is still there; BP 4 and 3M 68 by their own names). A record that took a bought
company's name does not take that company's past: old Waste Management's cases are not WM's before
1998-07-16, nor AT&T Corp.'s AT&T Inc.'s before 2005-11-18, when SBC Communications, T's record,
bought it and took its name, nor Ingersoll-Rand's 36 Ingersoll Rand Inc.'s, nor Linde AG's Praxair's
(the table of taken names, batch 117). A case of several defendants named for its site or another
party says which of them is the page's: "AMERICAN CYANAMID (FIKE CHEMICAL SITE) … against
SCHERING-PLOUGH CORP. and 63 other defendants".

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
name, not Southern's, and "CONSUMERS POWER, INC.", a Region 10 case of 1993, is not Michigan's Consumers
Power Company (batch 116). On the slice batch 114 replayed, 419 more rows on 31 companies, 261 of them a
court case or a penalty, 218 before 2017; EPA's whole file gives 422, with three cases EPA lists with
no defendant, read by their names (Ohio Edison's of 1988, Wisconsin Power and Light's of 1988, NIPSCO
Bailly's of 1985). Thirteen companies had no EPA row and now do: PSEG 44 (43 from its first price),
Exelon 22, NextEra 19, NiSource 17, DTE 16, WEC 13, Vistra, OGE, Hawaiian Electric, MGE, IDACORP, TXNM
and Evergy.

**28 more companies' operating units, and "&" read as "and"** (batch 120, the owner's approval of
2026-11-08). EPA files a conglomerate's, a pipeline's or a refiner's cases under its operating companies:
BNSF Railway is Berkshire's, Pratt & Whitney and Carrier United Technologies', AlliedSignal's companies
Honeywell's, Valero Refining-Texas Valero's, Enbridge Energy Enbridge's, Kennecott Utah Copper Rio
Tinto's. 112 more `UNITS` entries read them, each between the days its owner held it, every day read
from data.sec.gov's filing lists: BNSF from 2010-02-12, Sikorsky to 2015-11-05, Otis and Carrier to the
separation of 2020-04-02, Premcor from 2005-09-01, El Paso's pipelines from 2012-05-24. A unit sold to
another listed company goes to it on the day: Otis Elevator's 2022 decree is Otis Worldwide's, Keystone's
2026 case South Bow's, Trunkline's 2019 order Energy Transfer's. Two days are the owner's calls:
MidAmerican Energy is Berkshire's from 2006-02-09, and Pharmacia LLC, the old Monsanto Company's legal
entity, is Pfizer's from 2003-04-16. Namesakes are refused by name: Huntsman Springs, Mosaic Life Care,
Valero Terrestrial, El Paso Electric, Westlake Hardware, the old Total Petroleum, McMoRan's
Freeport-McMoRan Energy. A name holding "&" is read with "and" in its place too (`andSpellings`,
lib/edgarName.ts), by the caption rule every regulator source shares: EPA writes "Air Products and
Chemicals, Inc." and "The Goodyear Tire and Rubber Company". "AT AND T", a 1993 order, stays off AT&T
Inc.'s page: the table of taken names reads that spelling too. From first prices, on EPA's whole file:
906 cases and 818 rows more on 41 pages, none fewer, 471 of the cases a court case or a penalty, 345
before 2017; Enbridge's $62,000,000 Marshall spill decree of 2016 and American Honda's $10,100,000 of 1998
among them. Nine pages had no EPA row and now do: Berkshire 57, TotalEnergies 21, TC Energy 8, AB InBev
5, Honda 5, Otis, South Bow, Aimco and Chicago Rivet.

**A fourth round of units** (batch 135, the 2026-11-09b proposal 3, approved by the owner on
2026-11-10). The caption rule refuses a company's name followed by words that are not legal ones, as it
should, so "ASHLAND CHEMICAL COMPANY", "AKZO NOBEL CHEMICALS, INC.", "GERDAU AMERISTEEL" and "SEABOARD
FARMS, INC." were no page's. 22 more `UNITS` entries on 13 companies read them, every defendant each
pattern takes on EPA's whole file read by hand, each sold or bought unit between the days the filings
give: Ashland Petroleum to the Marathon Ashland Petroleum venture of 1998-01-01 and Ashland Distribution
to its sale of 2011-03-31; Novartis Crop Protection to Syngenta's formation of 2000-11-13; GATX Terminals
to its sale of 2001-03-02; Morgan Stanley Capital Group from the Dean Witter merger of 1997-05-31; Akzo
Nobel's chemicals companies to 2018-09-30, before their sale as Nouryon; Ball Aerospace to its sale of
2024-02-16. The Andersons' ethanol plants were a joint venture with Marathon until The Andersons bought
its share on 2025-07-31, so their earlier cases are no one's. From first prices, on EPA's whole file: 144
court or penalty cases more on 13 pages, 123 before 2017, none fewer (Ashland 63, Akzo Nobel 14, Gerdau
11, Lennar 9, GATX, Kroger and Novartis 8, Seaboard 7, Morgan Stanley 6); Gerdau and Seaboard had no EPA
row and now do. Novartis Nutrition, sold to Nestlé in 2007, waits: no filing here gives the day.

**A fifth round: the companies named after their owners** (batch 145, the 2026-11-11b proposal 2,
approved by the owner on 2026-11-12). "NATIONAL FUEL GAS SUPPLY CORPORATION", "KAISER ALUMINUM
FABRICATED PRODUCTS", "COCA-COLA REFRESHMENTS USA, INC." and "GE PLASTICS" are their owners' own
companies, which the caption rule refuses as it should. 40 `UNITS` entries read them, 31 for companies
with none before and six widened (Procter & Gamble's with EPA's "THE", Cleveland-Cliffs Iron, Waste
Management's LampTracker and LNG companies, DTE Energy Resources, Energy Transfer's named companies,
Amazon's "AMAZON.SERVICES"), every defendant each pattern takes on EPA's whole file read by hand. A
company's own name as EPA writes it counts too: "J B HUNT TRANPORT", which J.B. Hunt's inverted EDGAR
title "HUNT J B TRANSPORT SERVICES INC" never matched, and "WALMART STORES" in one word. A unit sold or
bought is its owner's between the days the filings give: Coca-Cola Refreshments from 2010-10-02, the
bottling business Coca-Cola bought from Coca-Cola Enterprises (whose own cases stay off); GE Plastics to
2007-07-30, before its sale to SABIC; FMC Wyoming to 2015-03-31, before its sale to Tronox; Denison Mines
(USA) to 2012-06-28, before its sale to Energy Fuels. The caption rule had read "GE PLASTICS (FORMERLY
GENERAL ELECTRIC)" of 2008 as GE's and would read "DENISON MINES (USA) CORP." as Denison's on any day, so
both are now in `NOT_THE_COMPANY`, which the units, read first, do not touch. Left out: Enterprise
Products' general partner, owned by its controlling family's company; Chevron Phillips, Duke Energy Field
Services and Dow Corning, joint ventures; Johnson Controls Battery Group before the merger of 2016, old Johnson Controls, Inc.'s (batch 146 puts it on JCI from 2016-09-02 to 2019-04-29). On
EPA's whole file, 181 rows more on 37 pages and one off; from first prices where read, 91 on 20 pages, 61
before 2017 (Energy Transfer 11, National Fuel Gas 10, GE 7, Walmart and Owens Corning 7, J.B. Hunt and
Graphic Packaging 6); 89 more on 17 pages whose first price is not read (BAE Systems 23, Enterprise
Products 14).

**EPA's own days: the day a suit was filed, and each settlement on its own day** (batch 122, the
owner's approval of 2026-11-08). EPA's file dates more of a court case than the settlement its row
was dated by: the day the suit was filed ("Complaint Filed With Court"), and each settlement's own
lodging, with its own penalty and work ordered (`CASE_ENFORCEMENT_CONCLUSIONS.csv`). A suit filed more
than 30 days before its first settlement (`SUIT_LEAD_DAYS`) has a row on the filing day, "EPA suit
filed in court (Clean Air Act)", naming the case and the page's defendants and no money, which stays
on the settlement's row: AEP's national New Source Review suit of 1999-11-03, its three case numbers
one row, eight years before the 2007 settlement; Duke Energy's of 2000-12-22, settled in 2015. The
rule's tests run on the filing day, so a unit counts only if its owner held it then (Mobil's suit of
1996 is no ExxonMobil row, Cinergy's of 2000 no Duke row), and the row is kept only where the page's
own that day are every defendant, or at least half of fewer than 10 (Chem-Dyne's Superfund suit of
174 parties is no page's). A court case of settlements on several days has a row for each, on the
page whose own are every defendant that day: Wisconsin Electric's of 2003-07-10 ($3,200,000, and
$620,000,000 of work), whose only row was dated by a 2014 amendment and showed no penalty; GE's
Hudson River decrees of 2005, 2009 and 2010; Muskingum River's first settlement joins AEP's row of
2007-10-09. A unit's settlements before its sale stay its seller's: Murphy Oil USA's of 2010 and 2012
are Murphy Oil's, its of 2019 and 2020 Murphy USA's. A case of several parties keeps one row, as
before, since EPA names no settlement's party. The case's own day is a settlement's in 267 of the
slice's 268 cases of several settlement days, so every stored row keeps its key, and EPA's summary
stays on it alone; where it is not, the stored row moves onto the last settlement's
(`legacyDedupBasis`). Before first prices, on the committed slice: 228 suit rows on 106 pages (254
cases, 214 filed before 2017 and 162 before 2001; a fixed sample of 25 read by hand, each naming the
page's company that day), and 39 settlement rows more on 24 pages, with 7 rows that now give a penalty
and 14 that name the work ordered; every row the rule gave before is still given under its own key.
db/044 keeps the two days and forgets the last read, so the next run reads EPA's file whole.

**EPA's cost recovery on each row** (batch 129, the owner's approval of 2026-11-09). On many Superfund
decrees EPA records no penalty and no work ordered, only a cost recovery: what the parties pay back
for EPA's own cleanup. The same zip holds it, the case table's `TOTAL_COST_RECOVERY_AMT` and each
settlement's `COST_RECOVERY_AWARDED_AMT`, read by the rule the work ordered follows: the case's total,
else its one settlement's, and a case split by settlement gives each settlement day its own. The row
names it beside the penalty and the work: "FORD MOTOR CO. - WDE (case 05-1991-0214): EPA's costs
recovered $55,513,499" (1993), a row that showed no figure; GE's Pittsfield and Housatonic settlement
of 1999-10-07, "work ordered $500,000,000, EPA's estimate; EPA's costs recovered $71,000,000"; the
Hudson River decree of 2005, $26,000,000 beside $150,000,000. On a settlement of several parties the
figure is the whole settlement's, and the row says among how many ("$95,000,000, among 225
parties", the Kramer landfill decree of 1998). A suit's filing row keeps no money. Before first prices,
on the committed slice: 3,037 rows on 387 pages name a cost recovery; 2,103 of them showed no money at
all before, 1,900 before 2017 and 1,045 before 2001 (3,008 on 384 before batch 145's units, 2,942 on 380 before batch 135's). No row's
day, title or key changes, only its description. db/045 keeps the figures and forgets the last read, so
the next run reads EPA's file whole.

**EPA's supplemental environmental projects on each row** (batch 141, the 2026-11-11 proposal 3,
approved by the owner that day). A settlement often commits the defendant to fund a project beside its
penalty: retrofitted buses, emergency equipment for a refinery's neighbours, land given to a state. The
same zip holds each settlement's figure (`SEP_AMT`) and EPA's text of each project
(`CASE_ENFORCEMENT_CONCLUSION_SEP.csv`, a row a project and a category, each project kept once). EPA's
case table gives no total of these, so a case's figure is its one settlement's, or its settlements' of its
own day added, and a case split by settlement gives each settlement day its own; a case of several
settlements that keeps one row never takes another day's (batch 142: BP's Deepwater Horizon row of
2015-11-30 had carried MOEX's $10,000,000 of 2012). The row says it
after the other figures, in EPA's words, quoted: "work ordered $14,000,000, EPA's estimate, among 2
parties; supplemental environmental projects $20,000,000, EPA's figure, among 2 parties: "Toyota will
spend $20 million to retrofit school buses and other heavy duty diesels"" (Toyota, 2003-03-07); PSEG's
$6,000,000 of 2002 on that settlement's row only, not its amendment of 2006; Chevron's two cases of
2018-10-24 each their own, $6,395,744.08 and $3,100,165. EPA's text keeps its capitals and its typing,
and a case's quote is cut at a word after 300 characters and marked. A text EPA gives no figure for is
not shown, a suit's filing row keeps none, and a row never says "no project": EPA's record is not
complete. Before first prices, 232 rows on 115 companies name a project, 187 before 2017,
$187,059,414.96 in all (227 on 112, 184 and $186,798,376.96 before batch 145's units); from the first prices the scout read, 165 rows on 70 pages, 140 before 2017,
$158,014,586.07 (Chevron 12, BP 11, ExxonMobil and Valero 8, Eastman Chemical 7); batch 141 gave 168
and $181,844,220.07 before the 2026-11-11 audit kept other days' projects off four rows. No row's day, title or
key changes. db/050 keeps the figures and texts and forgets the last read, so the next run reads EPA's
file whole.

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
SUMMARY REQUESTED", "TO BE ENTERED"; since batch 116 also "NO CASE SUMMARY SUBMITTED", a pointer to
another case's summary, or a step and its day alone, "CAFO effective 10/28/2022") or a facility's
address, cut at a word after 600; the characters EPA's file lost are read back by the length and place
of each run of marks, as an apostrophe ("Defendants' Nelson Dewey"), a section sign ("§ 9607", "§§
11004(b) and 11004(c)"), a dash or a quotation mark (batch 116). A case that now
has a penalty has its own row, and a month row of "no penalty" its cases all left moves onto the
first of their rows (`legacyDedupBasis`), so no stored row loses its history. Text is stored without
control characters: a NUL in the case "H.O.D. LANDFILL" made Postgres refuse the whole month's read
before batch 113 (db/043 also forgets the last read, so the next run reads the file whole). An acquisition's past is not the
buyer's here either: WM's record was USA Waste Services until it bought the old Waste Management and
took its name on 1998-07-16, so the old company's nine cases before are not WM's (batch 108; since
batch 117 by the table of taken names). The
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
before are no listed company's. 81 more units on 47 companies are read the same way (batch 126, the
2026-11-09 proposal 1, approved by the owner that day): a unit named after its owner, or its own since
before EDGAR, from the owner's first price (American Honda Motor, Home Depot U.S.A., Macy's
Merchandising Group, Sony Electronics, Pottery Barn), and a unit bought or sold between the days the
filings give, each in the list's header with its filing (Kidde on RTX from 2005-04-26 to 2020-04-01 and
on Carrier Global after, Maytag on Whirlpool from 2006-03-31, GE Appliances on GE to its sale to Haier).
Where no 8-K reports a deal, EDGAR's full-text search gives the filings around it, and no recall of
the unit falls between them. On the committed fixture, from first prices, 402 recalls more on 47
pages, 246 before 2017, none fewer; 14 pages gain their first CPSC row (Honda 51 rows, Sony 14,
Philips 14, Disney 11). Fisher-Price on Mattel from 1993-11-30, Hasbro's Playskool and Milton Bradley
from 1984 and Kenner, Parker Brothers and Tonka from 1991, Carrier on RTX from 1994-03-31 to
2020-04-01 (refused on Carrier Global before its separation) and Lawn-Boy on Toro from 1989-11-07,
bought before EDGAR, have their days from the filings' text since batch 148: 75 rows more, 2,810 on
212 companies before first prices. The six recalls the service dates in the wrong year (Tonka's dolls
of 1988 as 1998) carry the day their own notice on cpsc.gov gives (`DAYS_READ`). Batch 145's fifth round (the 2026-11-11b
proposal 2) adds 9 entries on 7 more companies, every firm each pattern takes read by hand: BRP's US,
Mexican and Finnish companies on BRP (37 recalls), RH US on RH (once written "RH, US LLC"; "RH Macy" of
1993 is Macy's), SharkNinja Operating, Hayward Industries, Johnson Outdoors Diving (Scubapro) and Yamaha
Motor Manufacturing on their owners, and A. O. Smith's Water Products and Electrical Products, the
second to 2011-08-21, before its sale to Regal Beloit: 72 rows more, 6 of them from first prices
where read (A. O. Smith's of 2003–2008), the rest on pages whose first price is not read. AT&T Corp.'s phone charger of 1995 is not AT&T
Inc.'s, whose record was SBC's until it took AT&T's name on 2005-11-18 (batch 116), nor Ingersoll-Rand
Company's of 2002 Ingersoll Rand Inc.'s (batch 117). Against every company in the index, before first
prices: 2,810 rows on 212 companies, 1,268 of them as maker, importer or distributor (2,735 and 1,193 before batch 148's
units' days; 2,663 on 209 and 1,121 before batch 145's units) (Mattel's first of
1978, GE's hair dryers of 1979, IBM's ThinkPad batteries of 2006). A work of the U.S. Government, public domain; the Commission's
site refused this session's requests (403), so the basis is the law's and the federal catalog's,
not a page re-read. Since batch 136 (the 2026-11-09b proposal 4, part a) a row also gives the
Commission's injury statement as written, its record of the harm reported, not a finding: Kidde's
extinguishers on RTX, "The firm is aware of a 2014 death involving a car fire following a crash";
GE's dishwashers of 2000, "approximately 90 incidents of fire … No injuries have been reported";
"None reported" said as it is. 952 of the 1,121 rows where the company made, imported or distributed
the product carry one, 9 of them naming a death; most of the rest are of 1973–1999, before the
statements begin. db/047 adds the column and has the next run read the service again. Since batch 137
(the 2026-11-10 audit) a statement keeps its room: where a row runs past its 600 characters the units
text gives way, cut at a word and marked "…", so 943 of the 952 show the statement whole (Polaris's
vehicles of 2021 keep "No injuries have been reported"), and the 9 too long to fit beside the recall's
title are cut at a word and marked, never mid-word.

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
batch 100). Against every company in the index, before first prices: 91 company days on 34
companies, 49 before 2017 (88 on 33 and 47 when first counted; RBC Capital Markets' order of 2019 since batch 145) (JPMorgan 12, Deutsche Bank 7, Morgan Stanley 7, Barclays 6, Goldman Sachs
6; AEP's suit of 2003, NRG's of 2004, Duke Energy's and Xcel's trading units of 2003–2004). Public domain, acknowledged to the CFTC.

### EEOC suits and settlements (`lib/eeoc.ts`, batch 152)

The Equal Employment Opportunity Commission's press releases, from 1994-06-22, the listing's oldest dated
one, most from 1996: the suits it files and the
settlements, decrees and verdicts it wins against employers, approved by the owner on 2026-11-15 (the
2026-11-15 proposal 1). Read from the newsroom's listing (`www.eeoc.gov/newsroom/search`, 24 a page,
318 pages and 7,625 releases on 2026-11-15) for every company at once (`lib/ingest/eeocWalk.ts`,
db/052): the whole listing once a year, and its newest page once a day. A release's day is the
listing's; 1,136, nearly all of 1996–2006, carry none there, and the listing's own excerpt gives the date
line for all but 70 ("PRESS RELEASE 2-21-02"); a release with neither has its own page read once, when a company's rule
keeps it (the owner's call (a)). Three such on 2026-11-15: Lockheed Martin's page gives 2008-01-02, and
two give no day, so they make no row. A company keeps a release whose title makes it the party by the
Justice Department's rule and the Commission's own shapes ("Final Decree Entered With", "Verdict For EEOC
Against Autozone Affirmed", "… Suit For $1 Million Against Optical Cable", "Walmart Refused …, EEOC
Charges in Suit"), under its names of the year, the release map's units and the Commission's own list
(`EEOC_UNITS`: Fred Meyer on Kroger, Sam's Club and Walmart Stores East on Walmart, Red Lobster on
Darden to its sale of 2014-07-28, UPS Freight, Mesaba, Xerox State Healthcare, ManpowerGroup US… 19
companies). Not a franchisee's, a bottler's or a licensee's, by its title or its first lines ("McDonald's
Franchise", "Jack in the Box franchisee Kobra Associates"), nor a mediation pact, nor a namesake read by
hand (`NOT_THE_COMPANY`: the Blood Bank of Hawaii, Banner Health, Murphy Oil USA after 2013…). A release
no rule can place is read by hand (`RELEASES_OF`, batch 155): "Murphy Oil Sued By EEOC" of 2016-05-05 is
Murphy USA's, a suit over the stations it runs, though the release names Murphy Oil. One release posted twice is one row; one title over several suits ("EEOC Sues Walmart for Disability
Discrimination", twelve times) is several. Each row carries the Commission's title, its first lines and
"The EEOC's charges are allegations until a court or a settlement resolves them." Against every company
in the index, before first prices: 552 rows on 179 companies, 277 before 2017; from first prices where
read, 324 on 81 pages, 165 before 2017 (Walmart 73, Dollar General 21, Kroger 14, AT&T 13, Dillard's 10,
United Airlines 9). The site states no licence; the releases are the Commission's own work (17 U.S.C.
§ 105), used under the owner's ruling of 2026-11-12, credited to the EEOC and implying no endorsement.

### OCC enforcement actions (`lib/occActions.ts`, batch 153)

The Office of the Comptroller of the Currency's orders against the national banks themselves, from
1987: the civil money penalties, cease-and-desist orders, restitution, formal agreements and directives
of the banks' own regulator, where the Federal Reserve Board's actions are the holding company's.
Approved by the owner on 2026-11-15 (the 2026-11-15 proposal 2), with an order's termination as a line on
its row. Read from the API the OCC's search page calls (`apps.occ.gov/EASearch/api/WebSearch/Actions`,
`instOnly=true`): every action against an institution in one keyless answer, 2,655 on 2026-11-16, and its
count, read once a process for every company (`lib/ingest/occFor.ts`); an action against a person is
never read. The answer is complete when it holds every action the count gives. A company keeps an
action whose bank is it by the caption rule under its names of the year, a bank the release map gives it
that day, or one the OCC names its own way, by the OCC's charter number and name (`OCC_BANKS`, 51
companies: Citibank, National Association on Citigroup from 1998-10-08, First Niagara Bank on KeyCorp from
2016-07-29, FIA Card Services on Bank of America, MetLife Bank, Dillard National Bank, MetaBank on Pathward, Wachovia Bank on Wells Fargo from
2008-12-31, MUFG Union Bank on MUFG from 2008-11-05 and on U.S. Bancorp from 2022-12-01, City National
Bank on Royal Bank of Canada from 2015-11-02, Sovereign Bank on Santander from 2009-01-30, PNC Bank,
KeyBank, The Huntington National Bank, Zions First National Bank, UBS AG's federal branches…), each day
from the owner's filing; namesakes are refused by charter, or an OTS holding company's by its docket (`NOT_THE_COMPANY`, 6
companies: "National Bank" of Hillsboro, Illinois, not National Bank Holdings; "Metropolitan Bank and Trust
Company", a federal branch, not Metropolitan Bank Holding; the OTS's "United Bancorp, Inc." of Bridgeview,
Illinois, not United Bancorp of Ohio). No "Valley National Bank" of the list is Valley National Bancorp's. The table
of taken names applies: "Bank Of America, Nt & Sa", 1992, stays off BAC. One row a company a day,
JPMorgan's four orders of 2013-09-18 among them: each order's kind and amount (numeric, never a float's),
its subject matters as the OCC gives them, its number and the day it ended; it links the order's PDF
where the OCC holds one, else the OCC's search.

The Office of Thrift Supervision's orders of 1989–2011 join them (batch 154, part (b) of the same
approval, `lib/otsOrders.ts`): the OTS's own archive, which the OCC keeps since it took the thrifts over on
2011-07-21, one workbook read once into the committed `data/ots-orders.json` (`npm run sync:ots-orders`;
3,547 records, 1,497 against institutions; ingest asks nothing). A thrift's OTS docket is its OCC charter
less 700000, so `OCC_BANKS` reads both (American Express Bank, FSB is docket 15648 and charter 715648),
and a thrift holding company, which has no charter, is read by the caption rule (Carver Bancorp,
AmBase, Waterstone Financial, First Bancshares of Mountain Grove). The 105 orders the OCC's list carries on
are the OCC's rows, found by number within a month or by day and kind; the archive's 119 terminations are
each a line on the order it ended ("It ended 2010-08-06 (order WN 10-023)"). Such a row is titled "OTS:", or
"OCC and OTS:" on a day of both, and links the order's file in the archive.

Against every company in the index, before first prices: 207 company days on 63 companies; from first
prices, 202 on 62 pages, 147 before 2017 (Wells Fargo 17, JPMorgan 15, Citigroup 14, Bank of America 13,
U.S. Bancorp 12, Capital One 8), 10 of them the archive's alone on 9 pages (the OCC's list alone: 192 on 56).
An order's own note ends it in two wordings, "Terminated November 12, 2002" and "terminated by NE 01-04 dtd
02/07/01"; 83 notes give an end in other words, none of them on a page today.
The OCC's pages state no licence; the orders are a federal agency's own work (17 U.S.C. § 105), used under
the owner's ruling of 2026-11-12 and credited to the OCC.

### Labor Department trade adjustment certifications (`lib/taaPetitions.ts`, batch 159)

The Labor Department's rulings, under the Trade Act of 1974, that a named plant's or office's job losses
came from foreign trade, which made its workers eligible to apply for trade adjustment assistance. Approved
by the owner on 2026-11-18 (the 2026-11-18 proposal 1), with a denial making no row. Each certification
names the firm, the division, the town, the product or service, the Department's estimate of the workers
and the day separations were covered from. The Federal Register prints them weekly under titles that name no
company, so no other source reaches them.

Read from one keyless zip on the Department's open-data portal
(`data.dol.gov/data-catalog/ETA/otaa_petition/ETA_otaa_petition.zip`, 47,935,779 bytes on 2026-11-18): the
Employment and Training Administration's petition file, 86,334 petitions, 86,306 decided, 1975-05-15 to
2022-06-30. The program's authority lapsed on 2022-07-01 and no petition is decided after 2022-06-30, so the
file is read once (`npm run sync:taa`) into the committed `data/taa-certifications.json.gz`, its 47,628
certifications only, compressed (about 1.7 MB; 6.4 MB as JSON); ingest asks nothing, and `check:live` says
when a later determination appears. The codes were read in the Federal Register's own notices, two petitions
a code, each found by number and read on govinfo.gov: C, C1, C2 and CU are listed under "The following
certifications have been issued", and only those make rows; D is a denial, T a terminated investigation, and
P and CD partial determinations (one P petition was listed under the certifications, another under the
denials: "All workers engaged in the production of bearing caps are denied eligibility").

A certification is a company's by the caption rule on its firm, under the company's names of the year and
the release map's units of the day (RTX's Hamilton Sundstrand, Carrier and Pratt & Whitney; Berkshire's
Johns Manville; PepsiCo's Frito-Lay); by the units EPA's and the CPSC's rules read under their own names, on
the days their filings give (batch 160: Halliburton's services and logging companies, Chevron U.S.A., Verizon
Data Services, Exxon Company USA, AlliedSignal on Honeywell, Sunoco, Inc. on Energy Transfer from 2012); by
the units named after it that the rule does not read (`TAA_UNITS`: VF's apparel companies; Oracle America,
the name Oracle gave Sun Microsystems; and batch 160's scan of every company's certifications whose firm
begins with its name: GE's divisions written as firms, GM's plants, Weyerhaeuser NR Company, Dell's
operating companies, Wells Fargo's bank, State Street's, Amphenol's, Ametek's, Caterpillar's, Hasbro's,
Hubbell's, Visteon's, Accenture LLP; Xerox's units to the separation of Conduent, 2016-12-31 by Xerox's 8-K;
ArcelorMittal's US mills to Cleveland-Cliffs' purchase, 2020-12-09 by its 8-K, and Cleveland-Cliffs' from
then; and batch 164's, which batch 160 had left: GE's businesses written "GE …", GE Transportation to its merger into
Wabtec of 2019-02-25 by Wabtec's 8-K, AT&T's own companies from the day SBC's record took the name, and ADM Milling
and ADM Cocoa, the cocoa business to its sale of October 2015 by ADM's 10-K); never by a namesake (`NOT_THE_COMPANY`: Coupled Products, a business Dana sold, written "Formerly
known as Dana Corporation"), nor by a name its record took from another company before the day (Johnson
Controls, Inc.'s certifications before 2016-09-02 stay off JCI, Tyco's record), and from its first price
(350 of General Motors' 371 fall before GM's first price of 2010-11-18). Hewlett-Packard's reach HP
Inc.'s record under the former name ingest reads from EDGAR, for the years it bore it. A company's
certifications of a day are one row: "Labor Department certified workers at 13 sites of FORD MOTOR CO for
trade adjustment assistance", four sites listed with their towns, products, worker estimates and petition
numbers and the rest named, the estimates never added up. From 1994 the row links the Federal Register's
search for the petition's number, where its notice is; an earlier one gives the number alone. Read by hand:
30 company days drawn at random in batch 159 and 30 of those batch 160 added, every one the company's own
plant, office or unit.

Against every company in the index, before first prices: 3,364 company days on 492 companies; from first
prices, 1,787 on 194 pages, 1,481 before 2017, 3,396 certifications (GE 182, Honeywell 95, IBM 86,
Weyerhaeuser 66, RTX 51, Ford 42, Goodyear 34, International Paper 34, Halliburton 33, Xerox 33). The Department's terms
(read 2026-11-10 for MSHA): "Materials created by the federal government are generally part of the public
domain and may be used, reproduced and distributed without permission"; credited to the U.S. Department of
Labor, implying no affiliation or endorsement.

### NLRB Board decisions (`lib/nlrbDecisions.ts`, `lib/ingest/nlrbWalk.ts`, batch 161)

The National Labor Relations Board's decisions in the company's own cases: every unfair labor practice case
against a private employer, and every contested union election or unit question at one, that reached the
Board. Approved by the owner on 2026-11-18 (the 2026-11-18 proposal 2), with a row from the listing alone: the
listing does not say how the Board ruled, and the row says so and links the decision, which does. No other
source the pages read covers labour relations.

Read from the Board's decision listing (`www.nlrb.gov/cases-decisions/decisions/board-decisions`, every
volume, 100 a page): 66,645 decisions on 667 pages on 2026-11-18, back to 1935-12-07, each with its issue day, its
citation ("375 NLRB No. 68", a slip opinion; "1 NLRB 519", a bound volume), its case name linked to the
decision on apps.nlrb.gov, and its case number. Its whole is read once a year and its newest page once a day,
for every company at once, into db/054's tables. The NLRB's site policies ask that "bulk data extractions be
scheduled for non-peak hours (between 11pm EST – 6am EST)" and no more than 5 concurrent requests or 20 per 200
ms: the whole read is asked only in that window with 45 minutes left in it (`inNightWindow`), one page at a
time 3 s apart; outside it a run reads the newest page instead, or nothing before the first whole read, and
until that read a company's answer is the newest pages' alone and never complete.

The whole read goes across runs and nights (batch 162, db/055). The first night read, 2026-11-21, was refused by
the site's firewall at page 340, after 21 minutes at one page every 3.7 s: it answered "Request Rejected" with
HTTP 200, so a read that had to finish in one go would have been refused at the same page every night. Each
page is now kept as it comes, the progress row holds the next page, and a run reads at most 300; the firewall's
page is read as a refusal (`REJECTED`), which ends the whole reading until the next night; the next run resumes
a page before where the last stopped, as the listing, newest first, only grows at its head, so a page read
again overlaps and none is skipped; a read begun over 14 days ago begins again. Every page but the last holds 100
rows, dated or not (page 336 held 11 the listing gives no day, which make no row), or the listing is cut. The
listing is complete, and a company's answer with it, only when the last page has been read.

Batch 164 made it polite after a failure, the 2026-11-21 audit's finding 1: the walk is asked once a process and
every company after the first takes its answer, a failure included (`walkNlrbOnce`, as the OCC's list is read); any
failure, a refusal or an error, rests the read that failed for 12 hours, the daily read's too; the daily read takes at
most 5 pages, more than a year's decisions; and a page whose rows give no decision is an error, the listing's form
having changed, never a page to read past.

The kind is the case number's: CA, and C before 1948, is a case against the employer; RC, RD, RM, R and RE
before 1948, UA (the union-shop polls of 1947–1951), UC, UD and AC are an election or a unit question at it. A
case against a union (CB, CC, CD, CE, CG, CP), an advisory opinion or a fee application makes no row, whatever
its caption names ("UFCW, Local 700 (Kroger)"). A decision is the company's by EPA's form of the caption rule
(one name joined by "and" is one name, so "Wisconsin Power and Light Co." is Alliant's operating company and
no "Light Co."), its "d/b/a" read as a party, under the company's names of the year, the release map's and the
EEOC's units of the day, EPA's and the CPSC's units on their days (Appalachian Power on AEP, Exxon Pipeline on
Exxon Mobil, Fred Meyer on Kroger, Frito-Lay on PepsiCo) and its own units (`NLRB_UNITS`: Amazon.com
Services, Home Depot U.S.A., Walt Disney Parks and Resorts and Walt Disney World, FedEx's operating companies,
Lockheed Martin's and PPG's companies, CHS Community Health Systems, GE's divisions; batch 162 read 35 more companies' from
the night read's captions that begin with a company's name: T-Mobile USA from the MetroPCS combination of
2013-04-30, McDonald's USA, the joint employer of 2015–2019 and never a franchisee, Fluor Daniel, Exxon's
companies, Caterpillar Tractor, La-Z-Boy's plants, McKesson Drug, Aramark's companies and Aramark Uniform to the
Vestis spin-off of 2023-09-30, Comcast Cablevision, Harley-Davidson, Allstate Insurance, Pepsi-Cola Co., Crown
Cork & Seal, Matson Terminals, RadNet Management, Starbucks Coffee, Macy's East and West, MasTec, Jones Lang
LaSalle Americas, Lamar Advertising, Brink's, Manitowoc Ice to the Welbilt spin-off of 2016-03-04, Waste
Management de Puerto Rico, Cognizant's US company, Snap-on, Brinker's payroll company, Nexstar, Constellium,
Curaleaf, Portillo's, Loomis, U-Haul, Ball's plastics division, Dover's Blackmer pumps, and FedEx Freight on FedEx to its spin-off of 2026-06-01 and on FedEx
Freight Holding from then, each day read from the company's 8-K); never a namesake (`NOT_THE_COMPANY`: National
Steel Corp., the American steelmaker, is not Companhia Siderúrgica Nacional; "Shell Co." of 1994, the Puerto
Rico company, is not Shell plc, whose companies are its own only from 2005-07-20; batch 162's Florida Power &
Light Credit Union, "Team Company d/b/a StaffQuick", a Memphis "Value Line Co.", The Reece Corp., a Papa John's
franchisee and a Nebraska "Commonwealth Electric Company of the Midwest"), nor a name its record took
from another company before the day; from its first price. A day the listing gives before the Act's
(1935-07-05, "02/14/1919") is misdated and makes no row. A company's decisions of a day are one row, each with
its citation, caption, case number and kind ("2 NLRB decisions: Starbucks Corporation"), its id the decisions'
documents, so a joint employers' decision is "Also on" the other's page. The listing writes some older
captions' "&" twice over ("Santa Fe Hotel &amp;amp; Casino"), read as one.

**Measured on the night read,** pages 0 to 339 of 2026-11-21, every decision of 1969-09-16 to 2026-11-19 (33,989
dated, 34,000 rows; 24,602 cases against employers, 4,563 representation cases, 4,824 that make no row):
against every company in the index, with the EDGAR former names ingest reads (Wal-Mart Stores, Inc., Walmart's
to 2018), 1,159 company days on 283 companies before first prices; from the first prices the fixtures carry,
568 on 123 pages, 496 before 2017 (Kroger 33, GE 28, RTX 25, Walmart 22, Exxon 19, Boeing 17, AEP 14, Caterpillar
14). Read by hand: those 568, and the rows since 1985 of the companies whose first price is not read here; six
namesakes found and refused. The scout's 24-page sample of 2026-11-18 gives 96 company days on 60 companies, 41 on
25 from first prices.

**Measured on the whole listing** (batch 168), read on two nights: pages 339 to 666 on 2026-11-22, 04:00 to 04:39 UTC,
one page every 7 s, every page answered, with pages 0 to 339 of the night before. 667 pages, 66,646 rows, 66,635 dated
decisions from 1935-12-07 (four the listing dates before the Act make no row) to 2026-11-19: 35,129 cases against
employers, 24,474 representation cases, 7,032 that make no row. Against every company in the index: 2,169 company
days on 319 companies before first prices; from the first prices the fixtures carry, 596 on 123 pages, 524 before
2017 (Kroger 41, GE 28, RTX 27, Walmart 22, Boeing 21, Goodyear 20, Exxon 19). The decisions of 1935 to 1969 add
about 1,000 company days, most before the first prices the fixtures carry (GM's 219, General Motors Corporation's
before the new company of 2010, among them); the 30 that reach a page were read by hand, and so were the captions of
1962–1969 that begin with a company's name and the rule refuses: the Coca-Cola bottlers, no unit of the brand's;
"Walt Disney Productions", a name older than Disney's EDGAR record, which the owner's default leaves out; Chevron Oil
Co., which no filing read here dates as Chevron's. Two of Kroger's were Fred Meyer, Inc.'s of 1963 and 1986, before the
merger of 1999-05-28: the EEOC's units, which this rule reads, now give Fred Meyer its day.

The NLRB's site policies state no licence or copyright terms; the decisions are a
federal agency's own work (17 U.S.C. § 105), used under the owner's ruling of 2026-11-12 and credited to the
National Labor Relations Board. The site's own disclaimer, "the information available on this web site may not
reflect official positions of the NLRB", is quoted where the source is registered.

### Early terminations of the merger waiting period (`lib/hsrEarly.ts`, batch 166)

The day the Federal Trade Commission and the Justice Department's Antitrust Division ended the Hart-Scott-Rodino
waiting period early on a deal the company is party to, as the acquiring person, the acquired person or an
acquired entity. Approved by the owner on 2026-11-22 (the 2026-11-22 proposal 1), with call (a): every grant naming
the company makes a row, and an individual's filing ("Timothy D. Cook's acquisition involving Apple Inc.", 2014) is
labelled as one, usually a purchase of the company's own shares above the filing threshold. Pages held a deal only
where an 8-K or a tender form announced it, and never the day the antitrust wait ended. The row says the agencies
ended the wait early; it does not say the deal closed, its terms or its value.

Section 7A(b)(2) of the Clayton Act requires that each early termination "be published in the Federal Register".
The notices list a few weeks' grants each, under titles that name no company ("Granting of Request for Early
Termination of the Waiting Period Under the Premerger Notification Rules"), so the company feed never kept one: 441
notices from 1994-11-02 to 2026-11-20; the agencies suspended grants in February 2021, with three in November 2021, and
granted again from June 2025 (April 2026's notice is printed as images). `npm run sync:hsr`
asks the Federal Register API for the list once and govinfo.gov for each notice's text (the Federal Register's own
text pages answered 302 to an unblock page from this container), only the notices the committed
`data/hsr-early-terminations.json.gz` does not hold, so it runs monthly; ingest asks nothing.

The notices print their tables in a dozen variants of four layouts, each read whole and checked against every
transaction number the notice's text holds: 1994–1998, runs of lines ending in a PMN number and the day, the parties
joined by commas, then semicolons, a comma before a legal word keeping a name whole ("Kreher Steel Co., Inc.") and so
a firm named with commas, its lone first words joined to the piece its name ends in ("Clayton, Dubilier & Rice Fund V
Limited Partnership", "Warburg, Pincus Capital Company, L.P.", "Becton, Dickinson and Company", since batch 170, the
2026-11-22 audit's finding 1); 1999–2003 in part, a party a line under "Party name", and in 2003 the party first with its number after;
2000–2009, three wrapped columns (Acquiring, Acquired, Entities) under each day's header; 2009–2026, the parties joined
by semicolons. From 2011 a notice's third name is the acquiring person again in 99% of its transactions, so no
acquired entity is read from it (`thirdIsAcquiring`). 36,892 grants: five notices printed as images (four of 2005,
one of 2026) and one printing its numbers with no parties (02-2114) give none, and 47 grants keep no day and make no
row, never a day guessed: 36 whose day's header the notice lost, and since batch 170 (finding 2) 11 whose day is no
calendar day ("01/00/98", eight of 98-2575, Merck's among them) or falls after the notice's own (a year misprinted,
"12/11/07" in a notice of 1998; `grantDayValid`). A grant two notices print is kept once, the first notice's; a number
the agencies gave two deals (24 of them, "19984717" both Morgan Stanley's Toy Biz and Cogeneration Corporation of
America's purchase from Northern States Power) is two grants, each row's id the number with its day, so "Also on"
never joins the two (`sameDeal`, `sharedNumbers`, finding 3).

A grant is the company's by the caption rule on each party, under the company's names of the year and the release
map's units of the day, EPA's and the CPSC's units on their days, the table of taken names (Broadcom Corporation's
grants before 2016-02-01 are not AVGO's) and its first price; a legal name with ".com" in it is read as EDGAR writes
it ("Amazon.com, Inc." as AMAZON COM's), and a credit union is no company's ("Boeing Employees' Credit Union"). The
namesakes read by hand among the 535 names matched that are not the company's own are refused (`NOT_THE_COMPANY`):
Britain's General Electric Company, p.l.c. (eight grants of 1996–1999) is not GE, Pacific and Southern Company
(Gannett's stations) not Southern Company, JCI Limited not Johnson Controls, "… Power and Light Company" not
Light S.A., EQT AB not EQT, Fortis AG not Fortis Inc., Progressive Incorporated not Progressive, DSS Company not
DSS, Metro Corporation not Metro Inc. A company's grants of a day are one row, each transaction with its number and
its parties as the notice writes them, linked to the notice; a deal of two listed companies (HCA's purchase from
Tenet of 2017, AEP's from Sempra of 2019) is on both pages, each saying "Also on" the other (db/056).

Against every company in the index under its present names: 9,185 company days on 1,523 companies before first
prices; from the first prices the fixtures carry, 4,670 on 400 pages, 4,012 before 2017 (GE 303, IBM 86, Wells Fargo
77, Johnson & Johnson 75, Citigroup 74, JPMorgan 73, Berkshire Hathaway 72, Ford 68, Verizon 63, Williams 57);
a company's EDGAR former names, which ingest reads, add more ("Sempra Energy" for SRE). Read by hand: 100 drawn at
random, every one the company's own deal or stake. The notices are the agencies' own work in the Federal Register,
public domain; govinfo's notice asks that "customary credit should be given to the Government department or
agency which prepared the material", the Federal Trade Commission.

### ITC Section 337 investigations (`lib/itc337.ts`, batch 167)

The International Trade Commission's investigations of imports said to infringe a patent or a trademark, from either
side: the company as a complainant or as a respondent. Approved by the owner on 2026-11-22 (the 2026-11-22 proposal
2), with call (a): a second row on the day of the Commission's final determination, violation or not, with the
exclusion order where it issued one, and a settlement or a withdrawal a line on the institution's row. Qualcomm's
complaint against Apple of 2018 (337-TA-1093) is on both pages, each saying "Also on" the other; Cisco's against
Arista (337-TA-945) has its second row on 2017-05-30, a violation found and a limited exclusion order issued. A
complaint is an allegation: the institution's row says the notice decides nothing.

The notices are the Commission's in the Federal Register, whose titles name no company ("Certain Mobile Electronic
Devices; Institution of Investigation"). `npm run sync:itc` asks the Federal Register API for the Commission's
notices year by year (11,592 since 1994), keeps the 1,140 whose abstract says a complaint was filed under section 337
"on behalf of" its complainant, reads each one's text from govinfo for its parties (seven reissued or corrected
notices merged into their investigations: 1,122), and follows each investigation's number through its later notices
to the last that decides it on the merits (256 with a violation, 137 with none, each dated by the day the Commission
issued it, read from the notice's last lines) or that ends it on a settlement, a consent order or a withdrawal
(503). 226 are open or end in a way no notice title states. A notice the committed `data/itc-337.json.gz` holds is
never asked again, so it runs monthly; ingest asks nothing. The Commission's own database, which reaches 1972,
refused this container, so the record begins in 1995.

Each notice lists its parties a line or a block each ("(a) The complainant is …", "(b) The respondents are …"),
read in their variants (no verb, a misnumbered "(4)", a block with its address beneath, a summary's "on behalf of"
where the list is missing), a party's name its text before its address. A party is the company's by the merger
notices' rule (`partyIsCompany`): the caption rule under its names of the year, the release map's units, EPA's and
the CPSC's units, the table of taken names (old Broadcom Corporation's complaints before 2016-02-01 are not AVGO's),
the ".com" reading ("Amazon.com, Inc."), and its first price. Namesakes read by hand (`NOT_THE_COMPANY`): Amtech
Systems LLC of Albuquerque is not Amtech Systems, Inc., nor Australia's Globaltech GlobalTech Corp. Since batch 170
(the 2026-11-22 audit's finding 6) a country the notice wraps ends its entry whole ("Seoul, Republic / of Korea"), a
postal code left at a name's head comes off ("518100 AutoZone, Inc."), and a scrap of an address is no party
(`isAddressScrap`: "of Korea", "No", "338 Nanjing Road (West)"), a name printed in lower case still one
("lululemon athletica inc."); 45 company days more, Ulta's and Walmart's Lashify case, NOCO's against AutoZone,
DISH's against Peloton among them.

Against every company in the index under its present names: 1,040 company days on 275 companies before first prices;
from the first prices the fixtures carry, 375 on 82 pages, 184 before 2017 (Apple 69, Microsoft 19, Qualcomm 19,
Honeywell 14, AMD 11, HP 10, Intel 10, Philips 10); a company's EDGAR former names, which ingest reads, add more (Research In Motion for
BlackBerry, Sony Corporation for Sony Group). Read by hand: 30 drawn at random, every one the company's own case.
The notices are the Commission's own work in the Federal Register, public domain, credited to the U.S.
International Trade Commission.

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
Schering-Plough's (batch 110); batch 132's 17 pages by their predecessors' (Duke Power, the old
Houston Industries on CenterPoint, First Alabama Bancshares on Regions…), between the days each record
was the company's, so Houston Lighting & Power, a subsidiary until 1997, names none of CenterPoint's. An issue's entries on one
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
company and each mapped predecessor (1,499 records: old Merck's added in batch 108, batch 132's predecessors and batch 118's Stratasys, Inc. in batch 132, batch 133's in batch 133), written by `npm run sync:digest-records`
(sixteen zips a second apart from www.sec.gov, or `-- --dir <path>` for saved ones; run after
`npm run sync:tickers`). On 1985 the source gives 550 rows on 272 companies, 391 events on 201
pages: batch 87's 508, Crane Co.'s registration of 1985-10-11, which batch 87's first pass gave
to no one because today's Crane Company (a 2023 record) seemed to share the name, old Merck's
three 8-K reports (batch 108), batch 132's 14 rows on six pages through their predecessors' names, and
batch 133's 16 on six more (Pacific Gas & Electric, Detroit Edison, Idaho Power, Newmont Mining…). www.sec.gov
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
the Justice Department's archive of 1996–2008, the CFPB's, EPA's, the CPSC's, the CFTC's actions, the
Digest, the FDA's approvals) builds a company's rows from data kept whole, so its answer is
complete: a run takes the company off that source's stored rows its rules no longer give it
(`unlinkGone`, batch 108). Only the link goes, and only for a row no other source attests; the
Justice Department's API answers, capped, and the Federal Reserve Board's live feed are never read
as complete. A batch that refuses a case (the old Waste Management's on WM) takes it off the page at
the company's next run, not only off new ones.

**A record that was another company labels that company's past** (batch 110, the owner's call of
2026-11-07). MRK's SEC record was Schering-Plough's until the 2009 merger, when it took old Merck's
name and ticker. Old Merck's record is Merck's history (`lib/predecessors.ts`, batch 108), matching
the price chart back to 1962, and Schering-Plough's past stays on the page beside it. Stratasys's
and Waste Connections's pages are read the same way since batch 118: old Stratasys's and old Waste
Connections's records are their history, and Objet's and Progressive Waste's past is labelled. Each row of
it says whose: "Schering-Plough: Annual report (10-K)", from "SEC EDGAR · Schering-Plough, before
its 2009 merger with Merck" (`ownPastLabelled`, at read time). Labelled rows are the record's own
filings before 2009-11-04, and the cases, approvals and Digest entries of those years that name
Schering-Plough or its Organon and not Merck. One naming both is old Merck's history too.

**A record that took another company's name never takes that company's past** (batch 117). SBC's
record took AT&T's name in 2005, ACE's Chubb's in 2016, Norwest's Wells Fargo's in 1998, TGC's
Dawson's in 2015: 35 such records are in one table (`lib/takenNames.ts`), each with the day the name
became the record's, read from a filing. Before that day, a row that names the taken name and none of the record's own
names of then is the other company's: "AT&T Corp. cuts 7,000 jobs" of 2004 is not on T's page, while
"SBC to acquire AT&T" is. Every source that finds a company by name reads the table (the caption
rules, the news, the Federal Register, whose earlier years are asked under the record's own name of
then, as are GDELT's months since batch 118), a page and its "Also on" leave stored rows of it off,
and the record's own filings and prices are never read this way. On the saved sources it takes 15 rows off LIN (Linde AG's), SPB, HOS and FUN
that nothing took off before. Batch 146 added JCI's, the owner's call decided on 2026-11-12: Tyco's
record took Johnson Controls' name at their merger of 2016-09-02, and JCI's chart before is Tyco's, so
old Johnson Controls' 39 EPA rows and its SEC order of 2016 left JCI's page. Batch 165 added AVGO's:
Avago bought Broadcom Corporation on 2016-02-01 and its new parent took Broadcom's name that day, and
AVGO's chart from 2009 is Avago's, so old Broadcom's trade certification of 2013 left AVGO's page. A committed scan of 175
renamed records (JCI's and AVGO's read by hand, which the scan's name matching missed), each read
(`scripts/fixtures/taken-names-scan.json`), keeps the table whole (`check:taken-names`).

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

### A focused page (`?focus=`)

A question that names a security and a concern opens its page with `?focus=`: "how did covid affect
Best Buy" is `/company/BBY?focus=covid`. Since batch 156 (NC-003) the server reads it
(`focusFromParam` in `lib/focus.ts`) and the page arrives narrowed, with the focus bar, the best
matches and the chronology of the events the focus keeps, so a shared link, a crawler and a reader
without scripts see what the question asked. Before, the page arrived whole and narrowed once its
script ran. "Show everything" brings the rest back without a request, and a redirect to the page's
one address keeps the focus: `/company/General Motors?focus=tariffs` is GM's page, focused.

The link's preview says what the page shows, "General Motors Company (GM) timeline: 1 event on
“tariffs”", with the best match in its description (`lib/focusMeta.ts`). It names only words the
page's own records hold: a kept event's headline or description, a concern of `lib/concepts.ts`, a
form's name, or a year as its window. It counts the events those words keep, so
`?focus=tariffs%20scandal` previews as one event on “tariffs”, and a focus that narrows nothing keeps
the page's plain preview. A preview carries the site's name, and one built from the address would
repeat whatever anyone typed under it (NC-157). The canonical address stays the page's own, and the
preview image stays the ticker's card.

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
| SEC EDGAR | Filings, earnings (10-K/10-Q/8-K 2.02, and a results release whatever its form), fund filings (a shareholder report on the Earnings chip, a unit investment trust's N-30B-2 among them: QQQ's since 2005) — a fund's own, by the filing list EDGAR keeps for its series (`lib/fundSeries.ts`; the series id is in the committed ticker index), shown on its page under its name, a sibling's left off, and a filing from before the list begins kept with its hedge; an 8-K's or 6-K's press-release headline as its title. Each filing's EDGAR acceptance time (`events.occurred_at`; until 2002 EDGAR kept most filings' day only, stamped midnight Eastern, which is read as no time): its row says "4:30 pm ET, after the close", and Biggest moves never captions a move with a filing that came out after that session closed (`lib/marketTime.ts`). The material forms the owner picked (`MATERIAL_FORMS`, lib/secForms.ts): corrections, mergers and tenders, large stakes, offerings (S-3, S-3ASR, F-1, F-3, F-10), late-filing notices (NT 10-K, NT 10-Q, NT 20-F), proxy fights and exits; no insider trades. The forms of the years before: a smaller company's annual and quarterly reports until 2008 (10KSB, 10QSB, on the Earnings chip as a 10-K and 10-Q are), the tender offers before 2000 (SC 14D1, SC 13E4), 10-K405/A, SB-2 and 10-12B (batch 80; 10-12G left out on the owner's call). A tender offer or proxy fight the company made about another company is named as its own (`DEAL_FORM`), and a busy month of DFAN14As or tender updates is one row. A company whose ticker passed to a new SEC record reads its predecessor's filings up to the handover (`lib/predecessors.ts`, 133 records on 123 pages): batch 132 added 17 pages from their own filing lists, Comcast, Oracle, Duke Energy, Trane, Berkshire Hathaway, Northrop Grumman, Ashland…, 3,277 filings of 1994–2016, and batch 133 30 more from a scan of every listed company's list, Con Edison, PG&E, DTE, T. Rowe Price, Transocean, Accenture, Intercontinental Exchange, Newmont, Valero…, 4,823 filings; and a quarterly report the predecessor filed just after the handover for a quarter before it, which the successor never filed, by its accession (`after`: PPL's of 1995 and IDACORP's of 1998, batch 137); batch 149 the two that waited for a filing's text, Roanoke Gas on RGC Resources and the old Digimarc, to its spin-off of today's company on 2008-08-01, on Digimarc; batch 163, the owner's call of 2026-11-21, two whose old record still lists tickers of its own (`listedAs`), as both charts are the old companies': old Alcoa's on AA to the separation of 2016-11-01 (2,297 filings of every form on its list from 1994; the record is Howmet's now) and old du Pont's on DD to the merger of 2017-08-31 (3,819; EIDP's now), each also on its own record's pages, the one stored row titled on both with the old record's name then ("Alcoa Inc.: Annual report (10-K)"), so neither page's ingest retitles the other's (batch 164) | Requires a `User-Agent` with contact email; headlines read once each and stored (`sec_headlines`) |
| GDELT 2.0 | News headlines | English-filtered; 2017+. A company is searched under its everyday name and its own other names in one query ("Goldman Sachs Group" OR "Goldman Sachs"; `newsNamesFor`), except words printed around every article ("Google"). GDELT refuses a quoted phrase under five characters, so a short name that is no English word and stands for nothing else first goes bare ("IBM", "ETSY"; `unquotable`, with the word list in `data/english-short-words.json`), its articles kept only when the headline names the company; any other short name is asked with its legal form ("VISA Inc", "CGI Inc"; `gdeltEverydayName`) or, as an other name ("UPS"), only scores headlines. GDELT drops a possessive "'s", so a possessive name of more than one word is asked as GDELT holds it ("DOMINO PIZZA"; `gdeltForm`, with the company's own spelling kept in the name index's `possessive`), and a headline naming "McDonald" names McDonald's. A name measured to drown in passing mentions newest first is asked by relevance over the last three days instead, its articles kept only when the headline names the company and not as a person's name ("MCDONALD", "lowe", Uber's "uber"; `GDELT_BY_RELEVANCE`). That hourly ask returns the newest hundred, so each month since 2017 (or since the company's first price) is also asked once, by relevance, keeping only the headlines that name the company: at most 40 months a run, 6 s apart, newest first (`lib/ingest/newsBackfill.ts`, kept in `gdelt_windows`). A company asked under one everyday word ("Target", "Southern"; `data/english-word-names.json`, rebuilt by `npm run sync:word-names` after `sync:tickers`) is held back from that until a month of its own is measured, since "the headline names it" is true of the word; a measured one ("Apple") counts a headline only where the name has its capital. Headline scoring, too, counts a name that is a word only with its capital, and hides a headline that has a company's own one-word name only in lowercase (batch 59), and a word many companies' names share names none of them alone (batch 60; see Relevance scoring). Throttles per IP — see note below |
| Wikipedia | Topic histories and company backstory | "History of ..." + "Timeline of ..." merged; search-index fallback |
| LoC Chronicling America | Historical newspapers ~1770–1963 | Public domain; fills the pre-2017 gap |
| Internet Archive | Catalogued items (reports, catalogues, film) | Relevance-ranked; impossible dates dropped |
| Federal Register | Sector-level rules and notices; documents naming a company | Keyword hits attach to industries; a title naming the company, or one of its own other names ("Google LLC"), attaches to it (no airworthiness directives) |
| Federal Reserve | FOMC policy statements since 1994 | Economy subject; on company pages behind the Economy chip (off by default). `npm run ingest -- --macro` |
| BLS | CPI release dates since 2008 | Same subject and chip; needs a contact `User-Agent` |
| NHTSA (Transportation Department open data) | Vehicle safety recalls since 1966; defect investigations since 1975 | Recalls of 10,000 vehicles or more, and every investigation NHTSA opened, only for the vehicle, tyre, part and child-seat makers `lib/recalls.ts` maps by hand to a listed company, with the day each became that company's (Chrysler counts for Stellantis from 2014; Graco's child seats for Newell from 1999, batch 123). Public domain; no key |
| Federal Reserve Board (enforcement actions) | Cease-and-desist orders, written agreements and civil money penalties against a bank, since 1993 | Only for the 63 banks `lib/fedActions.ts` maps by hand to a listed company — 49 US banks and 14 foreign banks with their US arms; an action against a person is left out. Public domain, cited to the Board; two keyless files |
| FDA (openFDA enforcement reports) | Drug, device and food recalls since 2012 | Class I and II only, for the 73 companies `lib/fdaRecalls.ts` maps by hand, with the days bought firms joined and businesses left. Public domain (CC0); no key, 1,000 requests a day |
| FDA (openFDA device recall file, batch 144) | Device recalls of 2000 to mid-2012, before the reports | The same map's firms and days, less the reports' own events; each recall's class read once from the FDA's recall database and kept, Class I and II only (`lib/fdaDeviceRecalls.ts`), from the company's first price. Public domain (CC0); no key |
| FDA (CDER's new-drug approvals) | New molecular entities and new biologics since 1985, on the page of the company that applied | One committed workbook a year (`npm run sync:fda-approvals`); kept when the applicant is the company by the caption rule, a recall-map firm or a unit it then owned (`lib/fdaApprovals.ts`), from its first price; linked to Drugs@FDA. Public domain; no key |
| FDA (warning letters) | Each warning letter since 2021 addressed to the company, its firm or its unit that day, a day's letters one row (batch 140) | The whole list read both ways once a week for every company and kept (`lib/ingest/fdaWarningWalk.ts`); by the approvals' rule and a hand list (`lib/fdaWarningLetters.ts`), from its first price; linked to the letter. Public domain; no key |
| FDA (Drugs@FDA, via openFDA) | Each approved efficacy supplement to those drugs, on its day | One committed file a month (`npm run sync:fda-supplements`); kept where the drug never left the company and the applicant was the company that day (`lib/fdaSupplements.ts`), from its first price; linked to the letter. Titles from the data alone. CC0; no key |
| U.S. Department of Justice | Press releases since 2001 (the API's from 2009, the archive's month pages before) in which a company is a party — a settlement, a plea, a suit against it, a merger case | Kept only when the title makes the company the one acting or acted against (`lib/doj.ts`); one release a day per company. Public domain; no key |
| SEC newsroom (press releases) | Press releases since 1997 in which a company is the party — the SEC charges, sues or sanctions it, or it settles | The year listing, read once for every company (`lib/ingest/secPressWalk.ts`); kept only when the headline makes the company the party (`lib/secPress.ts`). Public information the SEC lets anyone copy, cited to the SEC; no key |
| SEC litigation releases and administrative proceedings | The SEC's record of each case since 1995 whose caption names the company as a defendant or respondent | Both year listings, read once for every company (`lib/ingest/secCasesWalk.ts`); kept only when a caption entry is the company's name with its legal form (`lib/secCases.ts`). Public information the SEC lets anyone copy, cited to the SEC; no key |
| Federal Reserve Board press releases | The Board's orders on a bank's applications since 1996 (1996–2005 from its yearly pages, committed), and its policy releases that act on a named bank — a rescue, a capital plan | One file of every release, read once for every company (`lib/fedPress.ts`); an order kept when the company is the applicant or what it buys, a policy release when the Board's own phrase names it. Public domain, cited to the Board; no key |
| Consumer Financial Protection Bureau | The Bureau's enforcement actions since 2012 against a bank, card issuer, lender or debt buyer whose respondents are the company or a unit it owned | The action list, read whole once a month and its newest page once a day, for every company (`lib/ingest/cfpbWalk.ts`); kept when a respondent is the company's name with its legal form, or its unit (`lib/cfpb.ts`). Public domain, cited to the Bureau; no key |
| U.S. Environmental Protection Agency | EPA's civil enforcement cases from the 1970s, in court and before its own judges, one of whose defendants is the company | EPA's whole case file, one zip read once a month for every company (`lib/ingest/epaWalk.ts`); kept when a defendant is the company's name with its legal form, or one of the operating units 144 companies held, on the days they held them (`UNITS` in `lib/epaCases.ts`); the orders with no penalty grouped a row a month; a suit's filing day and each settlement of a case all the company's on their own days (batch 122). Public domain under EPA's open data licence; no key |
| U.S. Consumer Product Safety Commission | Consumer-product recalls since 1973 naming the company as the maker, importer or distributor, or as a store that sold the product | The Commission's recall service, every recall in one answer, read once a week for every company (`lib/ingest/cpscWalk.ts`); kept when a named firm is the company by the caption rule or a store in the "Sold at" line is its name (`lib/cpscRecalls.ts`); a store's recalls of other makers' products grouped a row a month. Public domain, a work of the U.S. Government; no key |
| Mine Safety and Health Administration | Accidents since 2000 that killed someone at a mine the company controlled, with MSHA's own finding on each: the violations its investigation cited and the penalties it proposed (batch 139) | MSHA's Accidents and Mines files, one 52 MB zip and one of 7 MB, read once a week for every company and the deaths kept (`lib/ingest/mineWalk.ts`), and its Inspections and Assessed Violations files (74 MB and 110 MB) streamed once a month; kept for the 54 controller IDs `lib/mineAccidents.ts` maps by hand to 52 companies, each between its company's days, from the company's first price. Public domain, credited to the U.S. Department of Labor; no key |
| Federal Railroad Administration | Railroad accidents since 1975 a company's railroad reported, with a death, an evacuation or $5,000,000 of damage | Form 54 on the Transportation Department's open-data host, one request a day for each of the six railroad companies `lib/railAccidents.ts` maps by hand, each railroad between its owner's days, from the company's first price; a highway-rail crossing collision only with an evacuation or that damage. Public domain; no key |
| Office of the Comptroller of the Currency | The national banks' own regulator's orders since 1987 against the company's bank — civil money penalties, cease-and-desist orders, restitution, formal agreements — each with its amount, subject matters and the day it ended; and the Office of Thrift Supervision's orders of 1989–2011 against its thrift or thrift holding company, from the archive the OCC keeps | The search page's own API, every institution action in one keyless answer, read once a process for every company (`lib/ingest/occFor.ts`), and the OTS archive's workbook, read once and committed (`npm run sync:ots-orders`, `lib/otsOrders.ts`); kept by the caption rule, the release map and the OCC's own spellings of the banks by charter (`OCC_BANKS`, `lib/occActions.ts`). The OCC's and the OTS's own work (17 U.S.C. § 105), credited to the OCC; no key |
| U.S. Department of Labor (trade adjustment assistance) | The Department's certifications of 1975–2022 that a named plant's or office's job losses came from foreign trade — Ford's assembly plants of 1980, Boeing's Commercial Airplane Group of 2002, IBM's services moved offshore after 2009 — each site with its town, product and worker estimate, a day's one row | One keyless zip on data.dol.gov, read once and committed (`npm run sync:taa`, `lib/taaPetitions.ts`), no petition being decided after the program lapsed in 2022; kept by the caption rule, the release map and the units named after the company (`TAA_UNITS`), certifications only. The Department's terms: public domain, credited to the U.S. Department of Labor; no key |
| National Labor Relations Board | The Board's decisions since 1935 in the company's own unfair labor practice cases and in elections or unit questions at it — Tesla's of 2026, Kroger's Fred Meyer and Ralphs, Starbucks' elections, McDonald's USA as joint employer — a day's one row, saying the listing gives no ruling and linking the decision | The Board's decision listing, 667 pages, read whole once a year in the NLRB's night window for bulk reads (11 pm to 6 am Eastern, its policy), across runs and nights as the site's firewall allows, and its newest page once a day, for every company at once (`lib/ingest/nlrbWalk.ts`, db/054, db/055); kept by EPA's caption rule, the release map, EPA's and the CPSC's units and `NLRB_UNITS`, cases against unions left off. No licence stated: a federal agency's work, credited to the NLRB; no key |
| U.S. Equal Employment Opportunity Commission | The Commission's suits and settlements since 1994 whose title makes the company the party — a retailer's disability suit, a bank's class settlement | The newsroom listing, read whole once a year and its newest page once a day, for every company (`lib/ingest/eeocWalk.ts`); kept by the Justice Department's title rule, the Commission's own shapes and its units list (`lib/eeoc.ts`); an undated release's page read once for its day. The Commission's own work (17 U.S.C. § 105), credited to the EEOC; no key |
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
