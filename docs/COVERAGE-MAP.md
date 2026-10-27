# Coverage map — how far back a timeline can actually go

**Last updated:** 2026-10-22 · 23 sources (15 on the ingest path; the 8 keyed ones are held back by their licences)

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
| **1934 – now** | SEC EDGAR | electronic filings from ~1993 | Filings, earnings; an 8-K, or a foreign company's 6-K, titled by the headline of the press release filed with it, from 1994 (`lib/secHeadlines.ts`). A fund's own filings, by the list EDGAR keeps for its series, from February 2006, when the lists begin; its trust's older ones stay, hedged (`lib/fundSeries.ts`, batch 67) |
| **1966 – now** | NHTSA vehicle recalls | 1966, the first campaigns | Safety recalls of 10,000 vehicles or more, for the vehicle and tyre makers `lib/recalls.ts` maps (Ford, GM, Stellantis from 2014, Toyota, Honda, Tesla, Harley-Davidson, PACCAR, the RV makers Thor and Winnebago with the brands they bought, Berkshire Hathaway's Forest River, and others) |
| **1975 – now** | NHTSA defect investigations | 1975, the first opened | Every investigation NHTSA opened into the same makers, shown with their recalls (batch 66): 1,766 for 18 companies, 1,579 before 2017 (Ford 684, GM 651) |
| **1993 – now** | Federal Reserve enforcement actions | 1989 in the Board's files; 1993 the first against a mapped bank | Cease-and-desist orders, written agreements and civil money penalties against the 25 banks `lib/fedActions.ts` maps (batch 69): 72 events on 18 of them, 51 before 2017 (JPMorgan 10, Citigroup 10, Wells Fargo 7, Goldman Sachs 7) |
| **1994 – now** | Federal Reserve | February 1994, the first FOMC statement | Fed policy statements — on company pages behind the Economy chip, off by default |
| **2008 – now** | BLS CPI release archive | February 2008, the oldest archived release | Monthly CPI releases — on company pages behind the Economy chip, off by default |
| **2009 – now** | Justice Department press releases | 2009, the oldest releases the API holds | Settlements, pleas, suits and merger cases whose title makes the company a party (`lib/doj.ts`) — a few to ten per large company, about half before 2017 |
| **2012 – now** | FDA enforcement reports | mid-2012, the first weekly report | Class I and II drug, device and food recalls for the 38 companies `lib/fdaRecalls.ts` maps (Medtronic, Philips, Johnson & Johnson, Stryker, Abbott, Pfizer, Novartis, Teva, PepsiCo, General Mills and others) — tens to hundreds per company |
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
  but few a company, and only the cases the Department announced. FDA recalls add mid-2012 to 2016
  for 38 drug, device and food companies, many of them: Medtronic has 532 recalls, 147 of them
  before 2017 (Philips 232 of 590, Johnson & Johnson 298 of 485). The Federal Reserve's
  enforcement actions add a few material events for large banks, 51 of their 72 before 2017.
- **The keyed aggregators are not ingested.** Their free tiers bar commercial use, so the
  adapters exist for diagnostics only. Even licensed, they are days-to-weeks deep: breadth for the
  present, never depth for the past.
- **Our own floors are choices, not limits.** GDELT is queried from 2017 because that is what the
  queries ask for, not because the source stops there. A company's Federal Register documents
  reached back only to 2015 for the same reason; since batch 63 they reach 1994, where its API
  begins (the sector feed still starts in 2015).
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
