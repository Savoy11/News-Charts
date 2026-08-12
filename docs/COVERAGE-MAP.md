# Coverage map — how far back a timeline can actually go

**Last updated:** 2026-07-28 · 18 sources

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
| **1851 – now** | NYT Article Search | 1851 | Articles, keyed |
| **any** | Wikipedia prose | as far as the article goes | History sentences |
| **any** | Wikipedia citations | as far as the references go | Dated external articles |
| **any** | Internet Archive | no floor | Catalogued items: reports, catalogues, film |
| **1934 – now** | SEC EDGAR | electronic filings from ~1993 | Filings, earnings |
| **1999 – now** | The Guardian Open Platform | 1999 | Articles, keyed |
| **2015 – now** | Federal Register | 2015 (our query floor) | Sector rules |
| **2017 – now** | GDELT | 2017 (our query floor) | Recent news |
| **now** | Newsdata, GNews, Currents, Marketaux, EODHD, Finnhub | days to weeks | Recent news, keyed |
| **now** | Yahoo Finance | prices go back decades; news is recent | Prices, corporate actions, news |

### On-chain, which has a hard floor

| Chain / data | Reaches back to | Notes |
| --- | --- | --- |
| Bitcoin | **2009-01-03** | Genesis. Nothing on-chain predates it. |
| Ethereum | **2015-07-30** | Frontier launch |
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
that reaches the stretch between a company's invention and GDELT's 2017 floor. NYT reaches 1851 if
a key is set. SEC filings begin when EDGAR went electronic, around 1993. Prices begin at listing.
Everything from 2017 is dense; everything before it depends on how well the subject was covered by
newspapers that happen to have been digitised.

**A public company listed recently.** Effectively no pre-2017 gap to explain — the sources line up
with the company's own life.

**A topic.** Wikipedia is the spine; its citations are usually the deepest dated material. Press
scans reach further for anything that was in US newspapers before 1963. The Internet Archive has
no floor at all but its metadata is uneven, so a bare year stays a bare year.

**A crypto asset or protocol.** Genesis is genesis. See the table above.

---

## The gaps worth knowing about

- **1963 – 2017 is the thin stretch** for anything not in the NYT or the Guardian. Chronicling
  America stops around 1963 (copyright, not interest), GDELT starts in 2017, and the keyed
  aggregators only carry recent weeks. A subject whose most interesting decades sit in that
  window will look sparser than it was. **This is the single biggest hole in the corpus.**
- **The keyed aggregators are days-to-weeks deep.** They add breadth to the present, never depth
  to the past. Losing one costs recency, not history.
- **Our own floors are choices, not limits.** GDELT is queried from 2017 and the Federal Register
  from 2015 because that is what the queries ask for, not because the sources stop there.
- **Nothing here reaches non-US regulation**, and nothing reaches non-English press except
  incidentally through Wikipedia.

## How to check a specific subject

`npm run check:feeds <ticker-or-topic>` reports what each source actually returns for that
subject, with the date range of what came back — which is the per-subject version of this table,
and the only one that accounts for how well-covered that particular subject happens to be.
