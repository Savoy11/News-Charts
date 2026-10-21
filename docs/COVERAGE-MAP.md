# Coverage map — how far back a timeline can actually go

**Last updated:** 2026-10-17 · 19 sources (11 on the ingest path; the 8 keyed ones are held back by their licences)

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
| **1934 – now** | SEC EDGAR | electronic filings from ~1993 | Filings, earnings |
| **1994 – now** | Federal Reserve | February 1994, the first FOMC statement | Fed policy statements — on company pages behind the Economy chip, off by default |
| **2008 – now** | BLS CPI release archive | February 2008, the oldest archived release | Monthly CPI releases — on company pages behind the Economy chip, off by default |
| **1999 – now** | The Guardian Open Platform | 1999 | Articles — only with a visitor's own key, in their browser; never stored |
| **2015 – now** | Federal Register | 2015 (our query floor) | Sector rules; documents whose title names a company |
| **2017 – now** | GDELT | 2017 (our query floor) | Recent news |
| **—** | Newsdata, GNews, Currents, Marketaux, EODHD, Finnhub | not ingested | Free tiers are non-commercial; adapters exist for diagnostics only |
| **since listing** | Yahoo Finance chart | every daily close since the security listed (Ford from 1972, IBM from 1962), read once; ten years on routine refreshes; the whole history again after a split | Prices, corporate actions |
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
1993. Prices reach back ten years (the full history after a split). Internet Archive items dated
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
- **The keyed aggregators are not ingested.** Their free tiers bar commercial use, so the
  adapters exist for diagnostics only. Even licensed, they are days-to-weeks deep: breadth for the
  present, never depth for the past.
- **Our own floors are choices, not limits.** GDELT is queried from 2017 and the Federal Register
  from 2015 because that is what the queries ask for, not because the sources stop there.
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
| Federal Reserve, BLS | No published cap | One page each a day; the FOMC history (~27 year pages, 1 s apart) is read once. bls.gov refuses requests without a contact `User-Agent` |
| Yahoo Finance (RSS and chart) | Undocumented | Unofficial — the licence question is the risk, not the quota |
| Internet Archive, Snapshot, DefiLlama | No published cap | Keyless; asked on 12–24 h windows |
| NYT · Guardian (visitor keys) | 500/day and 5/min · 5,000/day | Counted against the visitor's own key, in their browser |
| Newsdata · GNews · Currents · Marketaux · EODHD · Finnhub | 200 · 100 · 600 · 100 · ~20 per day · 60/min | Not ingested (licences); listed so the cost of wiring one is visible |

## How to check a specific subject

`npm run check:feeds <ticker-or-topic>` reports what each source actually returns for that
subject, with the date range of what came back — which is the per-subject version of this table,
and the only one that accounts for how well-covered that particular subject happens to be.
