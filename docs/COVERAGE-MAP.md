# Coverage map — how far back a timeline can actually go

**Last updated:** 2026-11-07 · 36 sources (28 on the ingest path; the 8 keyed ones are held back by their licences)

The single question this answers: *given a subject, what is the earliest event News Charts could
plausibly show, and which source would supply it?*

It exists because "the timeline starts in 2017" is usually a statement about **our sources**, not
about the subject — and those are very different claims to put in front of a reader. A company
founded in 1903 whose page begins in 2017 has not had a quiet century; we simply have not reached
back. Knowing which source owns which era is what makes that distinguishable.

Keep this current when a source is added or dropped. A stale coverage map is worse than none,
because it will be trusted.

---

## Who owns which era

| Era | Source | Reach | Kind of thing |
| --- | --- | --- | --- |
| **1770 – 1963** | Chronicling America (Library of Congress) | ~1770 | Digitised US newspaper pages |
| **1851 – now** | NYT Article Search | 1851 | Articles — only with a visitor's own key, in their browser; never stored |
| **any** | Wikipedia prose | as far as the article goes | History sentences |
| **any** | Wikipedia citations | as far as the references go | Dated external articles |
| **any** | Internet Archive | 1780 for companies (a bound on impossibility); topics effectively none | Catalogued items: reports, catalogues, film — relevance-ranked |
| **1934 – now** | SEC EDGAR | electronic filings from ~1993 | Filings, earnings; an 8-K, or a foreign company's 6-K, titled by the headline of the press release filed with it, from 1994 (`lib/secHeadlines.ts`). A smaller company's annual and quarterly reports until 2008 (10KSB, 10QSB) and the tender offers before 2000 (SC 14D1, SC 13E4), from the older records ingest already reads (batch 80). A fund's own filings, by the list EDGAR keeps for its series, from February 2006, when the lists begin; its trust's older ones stay, hedged (`lib/fundSeries.ts`, batch 67) |
| **1956 – 1993** | SEC News Digest | 1956, the first archive year (rows from each company's first price, Yahoo's from 1962 at the earliest) | The SEC's daily summary: the 8-K reports a company filed, its registrations, the 13D and 14D-1 filings on its shares, the SEC's orders and actions on it, its listing orders, under the name its EDGAR record had that day (`lib/secDigest.ts`, batch 102). On 1985: 509 rows on 259 companies, 358 events on 188 pages; the walk of ~9,500 issues waits on `NEWS_CHARTS_CONTACT` and `pdftotext` on the ingest host |
| **1966 – now** | NHTSA vehicle recalls | 1966, the first campaigns | Safety recalls of 10,000 vehicles or more, for the vehicle and tyre makers `lib/recalls.ts` maps (Ford, GM, Stellantis from 2014, Toyota, Honda, Tesla, Harley-Davidson, PACCAR, the RV makers Thor and Winnebago with the brands they bought, Berkshire Hathaway's Forest River, and others), and the brands Ford and GM sold, while they owned them (batch 77): Volvo, Jaguar and Land Rover on Ford's page, 56 recalls from 1990 to 2010; Saab on GM's, 12 from 2001 to 2008 |
| **1975 – now** | NHTSA defect investigations | 1975, the first opened | Every investigation NHTSA opened into the same makers, shown with their recalls (batch 66): 1,766 for 18 companies, 1,579 before 2017 (Ford 684, GM 651); batch 77 adds the 38 opened into the brands Ford and GM later sold, all before 2011 (Ford 29, GM 9) |
| **1973 – now** | CPSC product recalls | 1973-06-08, the Commission's first | Consumer-product recalls naming the company as maker, importer, distributor or a store that sold it (`lib/cpscRecalls.ts`, batch 96): against every company in the index, before first prices, 2,300 rows on 195 companies, 721 as maker, importer or distributor (Mattel, GE, Whirlpool, Hasbro, Polaris), every firm read by hand (batch 100), Graco Children's Products' on Newell from 1999 (batch 101), a firm's legal form read in either spelling, "The Toro Company" for "TORO CO" (batch 111); a store's recalls of other makers' products grouped a row a month |
| **1975 – now** | EPA civil enforcement cases | the 1970s, the first cases EPA's file holds (735 of them) | Consent decrees, suits and final orders whose defendant is the company by the caption rule, each with its penalty (its one settlement's where EPA gives the case none, batch 113), the work it orders, EPA's own summary and its law (`lib/epaCases.ts`, batch 95): against every company in the index, on EPA's whole file, before first prices, 7,899 rows on 679 companies, 6,754 before 2017 (ExxonMobil 288, GE 284, Chevron 269, BP 248, GM 225), never another company's past under the name a record took from it (old Waste Management's, AT&T Corp.'s before 2005-11-18, Ingersoll-Rand's, Linde AG's: the table of taken names, batch 117), with the operating units 65 companies held on the days they held them (Sunoco, Inc. on Energy Transfer, batch 101; Chevron U.S.A., Atlantic Richfield, Union Pacific Railroad, Occidental Chemical and 48 more, batch 104; the utilities' operating companies, Georgia Power to Public Service Electric and Gas, on 33 companies, batch 114); a month's orders with no penalty grouped into one row |
| **1993 – now** | Federal Reserve enforcement actions | 1989 in the Board's files; 1993 the first against a mapped bank | Cease-and-desist orders, written agreements and civil money penalties against the 63 banks `lib/fedActions.ts` maps (batches 69, 74, 88 and 98; 14 of them foreign, with their US arms): 152 events on 56 of them, 113 before 2017 (JPMorgan 10, Citigroup 10, Wells Fargo 7, Goldman Sachs 7, HSBC 7, Deutsche Bank 7; Crédit Agricole 5 and Customers Bancorp 4 among batch 98's 23) |
| **1994 – now** | Federal Reserve | February 1994, the first FOMC statement | Fed policy statements — on company pages behind the Economy chip, off by default |
| **1995 – now** | CFTC enforcement actions | 1995-07-27, the list's first | Orders and suits whose title makes the company the party (`lib/cftc.ts`, batch 97): against every company in the index, before first prices, 88 company days on 33 companies, 47 before 2017 (JPMorgan 12, Deutsche Bank 7, Morgan Stanley 7, Barclays 6, Goldman Sachs 6; AEP, NRG, Duke Energy and Xcel's energy-trading cases of 2003–2004; batch 100) |
| **1997 – now** | SEC press releases | 1997, the first year the newsroom lists | Charges, suits and settlements whose headline makes the company the party (`lib/secPress.ts`, batch 73): against every company in the index, 266 of the 6,897 stored releases on 129 companies, 161 before 2017 (Bank of America 28, Morgan Stanley 18, Citigroup 14, JPMorgan 13, UBS Group 12; batch 78; Deutsche Bank's 7 from batch 81; the banks' securities units, while they owned them, from batches 82 and 85, `lib/releaseNames.ts`) |
| **1995 – now** | SEC litigation releases and administrative proceedings | 1995, the first year either listing holds | The SEC's record of each case whose caption names the company, by its name and legal form, as a defendant or respondent (`lib/secCases.ts`, batch 83): against every company in the index, 1,148 company days on 369 companies from the 30,747 rows, 557 before 2017 (Bank of America 73, Morgan Stanley 73, JPMorgan 52, Citigroup 49, Wells Fargo 47, UBS Group 47; batch 85 added the banks' own spellings and the 93 rows the year pages never showed); most fall on days no press release names the company |
| **1996 – 2005** | Federal Reserve Board orders, from its yearly pages | 1996, the first yearly page | The Board's orders on a bank's applications before its feed begins, each with its own page's sentence naming every party (`lib/fedOrders.ts`, batch 99; read once into `data/fed-orders-1996-2005.json`, 469 orders): under the committed indexes' names 141 matches on 59 companies (Wells Fargo 10, Royal Bank of Canada 7, JPMorgan and Popular 6), more under a company's EDGAR former names — NationsBank's on Bank of America, BB&T's on Truist |
| **2006 – now** | Federal Reserve Board press releases | January 2006, the first in the Board's feed | The Board's orders on a bank's applications, kept when the company is the applicant or what it buys, and its policy releases that act on a named bank — a rescue, a capital plan (`lib/fedPress.ts`, batch 84): against every company in the index, 252 matches on 112 companies, 138 before 2017, 208 of them orders (Morgan Stanley and Bank of America 11 each, Capital One 8, Wells Fargo, Truist and PNC 7) |
| **2008 – now** | BLS CPI release archive | February 2008, the oldest archived release | Monthly CPI releases — on company pages behind the Economy chip, off by default |
| **2001 – now** | Justice Department press releases | 2001, the archive's first month page (the API holds 2009 on) | Settlements, pleas, suits and merger cases whose title makes the company a party (`lib/doj.ts`) — a few to ten per large company, about half before 2017; 2001–2008 from the Department's archive (`lib/dojArchive.ts`, batch 94): against every company in the index, 111 releases on 73 pages from the 5,712 kept, every year of the eight (Walmart 6, Tenet 5, Exxon Mobil 4; batch 100) |
| **1985 – now** | FDA new-drug approvals | 1985-04-09, the compilation's first (Lupron) | Each new molecular entity and new biologic on the page of the company that applied, by the approval letter's applicant on its day (`lib/fdaApprovals.ts`, batch 105): from the first prices of the 26 drugmakers Yahoo gave, 450 approvals, 314 before 2017, 71 before EDGAR (Merck 58, Johnson & Johnson 47, Novartis 44, Pfizer 42, Bristol-Myers Squibb 39, Lilly 34); an acquisition's past is never the buyer's (Lipitor is no page's, nor old Biogen's Avonex since batch 115) |
| **1986 – now** | FDA efficacy supplements | 1986-09-10, Drugs@FDA's first for a compilation drug | Each approved efficacy supplement to one of those drugs, on its day, where the drug never left the company and the applicant was the company that day (`lib/fdaSupplements.ts`, batch 115): from first prices, 1,191 on 48 pages, 420 before 2017, 131 before 2005 (Bristol-Myers Squibb 172, Merck 171, Novartis 116, Lilly 97, Johnson & Johnson 96); titled from the data alone, never "new indication"; drugs whose holder changed (Humira, Merck's now Organon's) are on no page |
| **2012 – now** | FDA enforcement reports | mid-2012, the first weekly report | Class I and II drug, device and food recalls for the 73 companies `lib/fdaRecalls.ts` maps (Medtronic, Philips, Johnson & Johnson, Stryker, Danaher, BD, Medline, Abbott, Pfizer, Novartis, Teva, GSK, PepsiCo, General Mills and others) — tens to hundreds per company |
| **2012 – now** | CFPB enforcement actions | 2012-07-17, the Bureau's first action | The Bureau's orders and suits whose respondents are the company or a unit it owned — Capital One Bank, American Express Centurion Bank, the mortgage insurers, Toyota's and Honda's lenders, Mastercard International, Conduent's units (`lib/cfpb.ts`, batches 89 and 90): against every company in the index, 95 company days on 52 companies from the 386 actions, 38 before 2017 (Bank of America, Wells Fargo and Citigroup 6, JPMorgan 5, U.S. Bancorp 4); 92 of them on 49 companies reach a page, every company a case names getting it (batch 93) |
| **1999 – now** | The Guardian Open Platform | 1999 | Articles — only with a visitor's own key, in their browser; never stored |
| **2015 – now** | Federal Register | 2015 (our query floor) | Sector rules; documents whose title names a company |
| **2017 – now** | GDELT | 2017 (our query floor) | Recent news, and since batch 57 a company's older news: each month back to 2017, or to its first price, is asked once by relevance and keeps the headlines that name it (`lib/ingest/newsBackfill.ts`), except for a company named by one everyday word ("Target"), held back until measured. On every GDELT headline that word counts only with its capital: "IMF urges retaining 5 % inflation target" is hidden from Target's page (batch 59). GDELT refuses a quoted phrase under five characters, and until 2026-10-22 107 of the 1,500 largest companies got none. Now 59 of them are asked bare ("ETSY"), keeping only headlines that name them, and 48 with their legal form ("VISA Inc") |
| **—** | Newsdata, GNews, Currents, Marketaux, EODHD, Finnhub | not ingested | Free tiers are non-commercial; adapters exist for diagnostics only |
| **Yahoo's whole daily series** | Yahoo Finance chart | every daily close Yahoo holds, to six decimal places — the listing for a younger security, but where Yahoo's daily data begins for an older one (IBM, GE, KO from 1962-01-02; Ford from 1972, though it listed in 1956); read once, ten years on routine refreshes, the whole series again after a split; a session still trading is never stored | Prices, corporate actions |
| **now** | Yahoo Finance RSS | recent headlines | News |

### On-chain, which has a hard floor

| Chain / data | Reaches back to | Notes |
| --- | --- | --- |
| Bitcoin | **2009-01-03** | Genesis. Nothing on-chain predates it. |
| Ethereum | **2015-07-30** | Frontier launch. Milestone dates come from the chain via Blockscout; if the explorer cannot be reached, from each fork's published activation date, labelled as such |
| USDC | 2018-09-26 | Contract deployment |
| DAI | 2019-11-18 | Multi-collateral launch |
| USDT | 2017-11-01 | Ethereum contract |
| PYUSD | 2023-08-07 | Contract deployment |
| Snapshot governance | ~2020 | Protocol-dependent; the hub itself is young |
| DefiLlama hacks | ~2016 | As far as the dataset's own records go |

**Crypto subjects have short timelines on purpose.** Naming the floor is the honest move; padding
it with commentary written later would turn a young record into a fake old one.

---

## What this means per subject type

**A public company founded before 1900.** Wikipedia prose and its citations carry the founding and
the early decades. Chronicling America covers roughly 1770–1963 in US newspapers — the only source
that reaches the stretch between a company's invention and GDELT's 2017 floor. NYT reaches 1851
only for a visitor who adds their own key. SEC filings begin when EDGAR went electronic, around
1993. Prices reach back as far as Yahoo's daily data goes — 1962-01-02 at the earliest, so for
these companies the chart starts there rather than at the listing. Internet Archive items dated
before 1780 are dropped for companies — the oldest US public companies date from that decade.
Everything from 2017 is dense; everything before it depends on how well the subject was covered by
newspapers that happen to have been digitised.

**A public company listed recently.** Effectively no pre-2017 gap to explain — the sources line up
with the company's own life.

**A topic.** Wikipedia is the spine; its citations are usually the deepest dated material. Press
scans reach further for anything that was in US newspapers before 1963. The Internet Archive has
almost no floor for topics (1500, so nothing a topic could legitimately hold is cut) and its
metadata is uneven, so a bare year stays a bare year; results come back in the archive's own
relevance order, since sorting by its uncurated date field promoted mis-catalogued rows.

**A crypto asset or protocol.** Genesis is genesis. See the table above.

---

## The gaps worth knowing about

- **A name a record took from another company is read from the day it took it** (batch 117,
  `lib/takenNames.ts`): before it, every source that finds a company by name leaves the other
  company's rows off, the news and the Federal Register included. 28 records are in the table; three
  namesakes (LTBR, VAI, MRDN) are read but not yet dated, and GDELT's months before a taken name's day
  are still asked under the present name, so the record's own news of then is not sought.
- **1963 – 2017 is the thin stretch** — and the NYT and the Guardian, which cover it, are not
  ingested; they reach only a visitor who brings a key. Chronicling
  America stops around 1963 (copyright, not interest), GDELT starts in 2017, and the keyed
  aggregators only carry recent weeks. A subject whose most interesting decades sit in that
  window will look sparser than it was. **This is the single biggest hole in the corpus.**
  For vehicle makers it is partly filled: NHTSA recalls reach back to 1966 (Ford has 861 of 10,000
  vehicles or more), the one free source found for that stretch that may be used commercially
  (`docs/proposals/2026-10-22-news-sources.md`), and NHTSA's defect investigations to 1975 (1,579
  of the mapped makers' 1,766 opened before 2017). Justice Department releases add 2009–2016 for
  companies in any sector — measured on 81 large companies, 93 of 195 events fell before 2017 —
  but few a company, and only the cases the Department announced. The SEC's own releases reach
  further, to 1997, in the same way: 161 of the 266 that name a company here as the party fall
  before 2017, most of them on the largest banks and brokers. The SEC's litigation releases and
  administrative proceedings reach 1995 and every sector: 557 of the 1,148 company days they give
  fall before 2017 (batches 83 and 85). The Federal Reserve Board's own press releases add 2006–2016 for the
  banks: 138 of their 252 matches fall before 2017, among them the 2008 approvals and rescues
  (batch 84). The CFPB's enforcement actions add 2012–2016 for the card issuers, banks, mortgage
  insurers and debt buyers: 36 of the 92 company days that reach a page fall before 2017, most
  through the units the Bureau charges (batches 89, 90 and 93). FDA recalls add
  mid-2012 to 2016 for 38 drug, device and food companies, many of them: Medtronic has 532
  recalls, 147 of them before 2017 (Philips 232 of 590, Johnson & Johnson 298 of 485). The
  Federal Reserve's enforcement actions add a few material events for large banks, 81 of their 113
  before 2017. Before EDGAR (1993) a company's page holds little but Yahoo's dividends and splits;
  the SEC News Digest covers 1956–1993, a source since batch 102. On 1985 it gives 509 rows on 259
  listed companies under the names they had that year, 362 of them after the first-price floor, as
  358 events on 188 pages. Its walk reads ~9,500 issues once, 60 a run, and starts once the ingest
  host has `NEWS_CHARTS_CONTACT` and poppler's `pdftotext`; until then no page carries a Digest row.
- **The keyed aggregators are not ingested.** Their free tiers bar commercial use, so the
  adapters exist for diagnostics only. Even licensed, they are days-to-weeks deep: breadth for the
  present, never depth for the past.
- **Our own floors are choices, not limits.** GDELT is queried from 2017 because that is what the
  queries ask for, not because the source stops there. A company's Federal Register documents
  reached back only to 2015 for the same reason; since batch 63 they reach 1994, where its API
  begins, or the company's first price if later (batch 71); the sector feed still starts in 2015.
- **Nothing here reaches non-US regulation**, and nothing reaches non-English press except
  incidentally through Wikipedia.

## Rate limits — what each source will tolerate

Reach says how far back a source goes; this says how hard it can be asked. Figures come from
`QUOTAS` in `lib/ingest/quota.ts`, which `npm run cost-report` projects against the refresh
windows — update both together.

| Source | Limit | How it shows up |
| --- | --- | --- |
| GDELT | ~1 request per 5 s per IP | A throttle arrives as HTTP 200 with a text body; one throttle now backs off every subject for the run |
| SEC EDGAR | 10 requests/s | Requires a contact `User-Agent` |
| Etherscan (V2, free tier) | 5 requests/s, 100k/day | HTTP 200 with status "0"; multi-page reads are spaced 250 ms apart and retry after 1 s, then 2 s |
| Chronicling America | No published cap | 503s under load are routine |
| Wikipedia | No hard cap | The User-Agent policy is the real obligation |
| Federal Register | No published cap | Generous in practice; visitor terms are capped per client (15 new terms/hour) |
| NHTSA recalls | No published cap without an app token | One request a day per mapped vehicle maker |
| NHTSA investigations | No published cap without an app token | One request a day per mapped vehicle maker |
| Federal Reserve enforcement actions | No published cap | Two files, read once a process whatever the number of banks |
| FDA (openFDA) | 1,000 requests a day, 240 a minute, without a key | Three to six a day per mapped company: one per product type, a page per 1,000 records |
| Justice Department | No published cap | A page or two a day per company, 0.8 s apart; a common word ("Target") stops at ten pages |
| Federal Reserve, BLS | No published cap | One page each a day; the FOMC history (~27 year pages, 1 s apart) is read once. bls.gov refuses requests without a contact `User-Agent` |
| Yahoo Finance (RSS and chart) | Undocumented | Unofficial — the licence question is the risk, not the quota |
| Internet Archive, Snapshot, DefiLlama | No published cap | Keyless; asked on 12–24 h windows |
| NYT · Guardian (visitor keys) | 500/day and 5/min · 5,000/day | Counted against the visitor's own key, in their browser |
| Newsdata · GNews · Currents · Marketaux · EODHD · Finnhub | 200 · 100 · 600 · 100 · ~20 per day · 60/min | Not ingested (licences); listed so the cost of wiring one is visible |

## How to check a specific subject

`npm run check:feeds <ticker-or-topic>` reports what each source actually returns for that
subject, with the date range of what came back — which is the per-subject version of this table,
and the only one that accounts for how well-covered that particular subject happens to be.
