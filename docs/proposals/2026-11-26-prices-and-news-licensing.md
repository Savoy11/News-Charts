# Licensed prices, and a licensed route for news — 2026-11-26

**Items:** NC-130 (prices) and NC-021 (Yahoo's headline feed), from the owner's answers of
2026-11-25 (`docs/decisions/2026-11-25-source-licences.md`) · **Commit:** ae1afdb (main after batch
187) · **Where it ran:** the cloud build container, public pages read through its proxy ·
**Nothing was built, bought or signed up for.**

> The owner asked two things on 2026-11-25:
>
> - **Prices:** "Find a licensed provider". Yahoo's chart endpoint has no licence, and it feeds
>   every chart.
> - **News:** "Can you find out how yahoo is able to host all their news articles and work on a way
>   to mirror their method".
>
> **How to read this.** Every price and licence sentence below was read on 2026-11-25 or
> 2026-11-26 from the provider's own page. *Direct* means the sentence was found in the page's text
> from the build container; *reader* means a fetch tool read the page and reported it (some pages
> are drawn by script and cannot be read directly). Prices marked "by quote" are not published.
> This is a practical reading, not legal advice, and a sales reply in writing is worth more than
> any sentence quoted here.

Mark each option `APPROVED`, `REJECTED` or `DEFERRED`. Each approval is a spending decision or a
sign-up only the owner can make; nothing below can be bought from a session.

---

# Part A — Prices (NC-130)

**What is needed:** daily closes with splits and dividends for the securities the index lists (10,429
stock and ETF tickers and 28,615 mutual fund share classes; a page's prices are read when it is first
visited, not all at once), as far back as they go (Yahoo reaches 1962), stored in our database and
drawn as our own chart on public pages that carry advertising. So the licence must allow commercial use,
storage, and display to the public. A "personal" or "internal use" plan does not qualify.

| Provider | Qualifying plan and price | What its page says about display | Coverage | Open questions |
| --- | --- | --- | --- | --- |
| **Tiingo** | "Display Redistribution": "$250/Month for Start-ups", "$500/Month for Enterprise", "Contact sales to get started" (reader) | Base plans ($0, $30, $50): "you may not display or share the data with another person or organization"; the display tier is the one that lifts it (reader) | "US Equities, ETFs, Mutual Funds"; "Data going back from 1962"; splits and dividends, raw and adjusted; crypto (reader) | Whether we count as a start-up; whether $250 is on top of a base plan; storage terms; "Tiingo must be clearly attributed as the data source" |
| **Intrinio** | Startup: "6 mo at $333, 6 mo at $666, $999 thereafter", billed quarterly (direct) | "Commercial Use and Display Rights"; "No exchange fees or paperwork" (direct) | US end-of-day and historical stock prices; "50+ years" (reader) | Mutual fund NAVs are on Enterprise, "$1,250 /mo+"; ETF coverage and storage terms unstated |
| **Twelve Data** | Venture: "$149/month", "$124/month" billed yearly (direct) | "External display data access: Display the data to end users in external applications, websites, or client-facing products." (direct) | US end-of-day, mutual fund NAVs; history depth unstated (reader) | Its help pages add that external distribution "requires a US Equities Add-On" (from $2,400 a year), that Venture "permits temporary caching", and that data is deleted within 30 days of ending (reader): our stored series may not fit |
| EODHD | Custom, "from $399.00/mo", by quote; Enterprise $2,499/mo (reader) | The $399 internal plan: "Displaying it or sharing it with people outside your company is not permitted." Display needs a written quote | Stocks, ETFs, funds, crypto, "30+ yrs", a one-request-a-day bulk file | Everything about display |
| Massive (formerly Polygon) | Stocks Business, $2,499/mo (reader) | "Massive Business plans include display." | "20+ years"; no mutual funds listed | Price |
| Financial Modeling Prep | Enterprise, by quote | "Displaying or redistributing data sourced from FMP requires a specific Data Display and Licensing Agreement with FMP." | Up to 30 years | Price |

**Do not qualify** (each by its own terms, reader): Alpha Vantage ("for personal, non-commercial
use, unless … agreed otherwise in writing"), Finnhub ("strictly for personal use unless explicitly
stated otherwise"), Alpaca ("you cannot redistribute Alpaca API data"), Marketstack (commercial
use listed, display not addressed; its US data is Tiingo's). **Not readable:** Barchart, Stooq,
Nasdaq Data Link, QuoteMedia and Xignite (quote only).

**A free fallback that does not fit:** TradingView's embeddable chart is "FREE with default
TradingView branding", but it draws their chart, not ours, so it cannot carry the event markers
the product is built on, and their policies also say "we do not permit commercial usage of any of
our services or APIs".

**A year of each:** Tiingo $3,000 (at the start-up price). Intrinio $5,994 in the first year,
$11,988 a year after. Twelve Data $1,488 to $1,788, or about $4,200 if the add-on applies.

## A1. Tiingo's Display Redistribution tier · recommended

**Status:** PROPOSED

- **Why first:** the only option read that pairs a named public-display tier with mutual funds and
  history from 1962, which is what the charts hold today, at the lowest verified price for both.
- **What the owner does:** one email to Tiingo's sales address asking four things, and keeping the
  reply: (1) do we qualify for the $250 start-up price; (2) may we store the daily series in our
  own database and draw our own chart from it for anonymous visitors on pages with advertising;
  (3) is $250 the whole price or added to a base plan; (4) does the history include delisted
  tickers and mutual fund NAVs back to their start.
- **What a session then does** (about one batch): a Tiingo adapter beside `lib/prices.ts`, a new
  `SOURCES` row with the licence sentence and the reply's date, every stored series read again
  from Tiingo, Yahoo's price row flagged `commercialOk: false`, the footer credit changed, and the
  pre-release gate line ticked. The key goes in the environment's secrets, never in the code.
- **Risk:** the tier is "contact sales", so the price and terms are theirs to confirm.

## A2. Intrinio Startup

**Status:** PROPOSED

- **Why:** the clearest self-serve grant read directly ("Commercial Use and Display Rights", "No
  exchange fees or paperwork"), with no sales call.
- **Against:** no mutual fund NAVs below Enterprise, so the mutual funds' pages (28,615 share
  classes in the index) would have no chart, or need a second source; and the price triples within
  a year.

## A3. Twelve Data Venture

**Status:** PROPOSED

- **Why:** the cheapest plan whose own page grants external display, with mutual fund NAVs.
- **Against:** its help pages restrict caching and ask for deletion after the subscription ends,
  and may require a US equities add-on. Only worth it if their support confirms in writing that a
  stored series behind a public chart is allowed.

**One provider or two?** D21 says no single provider may be the only source for a surface. A second
licensed price source doubles the cost, so this proposal treats D21 for prices as the owner's call:
one licensed provider at launch, with the adapter written so a second can be added.

---

# Part B — News (NC-021)

## How Yahoo does it

Yahoo carries other publishers' articles under **contracts it signs with each publisher and wire
service**, whose terms are not public, and it pays for them partly with traffic and partly with a
share of advertising revenue.

- **Hosted in full, under licence.** Yahoo's own help page: "Many of the news articles on Yahoo
  Finance come from publishers like AP and Reuters, while individual press releases are published
  by the issuing companies." (direct). Its Terms of Service: "Our Services display some content
  that we did not create and do not own." Its chief executive, to Nieman Lab in March 2026: "We
  send them traffic and, in many cases, share revenue." (reader)
- **Its own newsroom.** Yahoo Finance also publishes original journalism (reader).
- **A creator programme.** Individual writers can join for "a 50/50 split on earnings from ads run
  against their articles" (Tubefilter, reader). Publishers join by direct deal.

So the method is not a technique that can be copied: it is a set of licences, bought with an
audience a new site does not have yet. What can be mirrored is the **shape** of it: every item on
the page is there under terms that allow it.

## What News Charts already has the right to show

- **A headline, its source, its date and a link out**, from GDELT, whose terms allow "any academic,
  commercial, or governmental use" with a citation and a link. This is what Yahoo's own RSS feed
  gave, and it is what a row shows today. The Copyright Office's Circular 33: "Words and short
  phrases, such as names, titles, and slogans, are uncopyrightable" (reader). The line that
  matters is the excerpt: in *AP v. Meltwater* (2013) a court rejected fair use for a service that
  showed each story's opening lines. News Charts shows no article text, and should keep it so.
- **The company's own press releases**, which US companies file with the SEC as exhibits to Form
  8-K. The 8-K rows are already on every page; the release itself is one click further.

## The options

| Route | What it gives | Cost | What its terms say |
| --- | --- | --- | --- |
| **B1. Drop Yahoo's feed, keep headline-and-link from GDELT** | What rows show now, minus Yahoo's | $0 | GDELT: commercial use with citation and link (reader) |
| **B2. Press releases from 8-K exhibits** | The company's own announcement on its 8-K's row: its headline and a link to the exhibit | $0 | SEC filings are public records, already ingested |
| **B3. Currents, back on the ingest path** | Present-day headlines with a 300-character preview and a link, 250 requests a day | $0; paid from $69/mo for a six-month archive | "Commercial use: every self-service plan, including Free, allows commercial use with attribution and a link to the original article. AI summaries or republication of article text need separate terms." (direct, its pricing page). It was dropped on 2026-10-19 on the July reading that its free tier was non-commercial; its page now says otherwise |
| **B4. Stock News API** | Per-ticker headlines, snippets and links since 2019 | $49.99/mo | "If you intend to display API Data on your website … you need to comply with the terms and conditions of the news source or data owner your are linking to." (direct): the publishers' terms stay our problem |
| **B5. Benzinga** | A finance newsroom's own headlines and teasers, full text on paid plans | A free tier on AWS Marketplace; direct price by quote | "The fee-free tier includes the article's headline, body teaser, and a hyperlink to read the full story on Benzinga.com." (reader). The marketplace's standard agreement bars publishing, so display needs their written yes |
| B6. A wire service directly (AP, Reuters) | What Yahoo has | By sales contact; no price is published | Contact forms only |
| B7. NewsAPI.org Business | Headlines from many outlets, five years back, no full text | $449/mo | "For production and published commercial projects." (reader) |

**Not worth pursuing now:** Tiingo, Finnhub, EODHD and FMP sell news only with display rights by
quote; Alpha Vantage is personal use; Newsdata says it "doesn't have the right to authorise any
user to use the data"; GNews says a subscription "does not grant you any rights in third-party
content".

## B1. Drop Yahoo's headline feed at launch · recommended

**Status:** PROPOSED

- **Why:** Yahoo's terms do not clear it (no advertising beside feed items, no commercial reuse),
  and what it adds over GDELT is the same kind of row: a headline and a link.
- **What a session does:** flag `yahoo_finance` `commercialOk: false`, take it off the ingest path,
  and let the read-path gate hide its stored rows on a public build, as batch 186 did for
  DefiLlama. Small.
- **What is lost:** Yahoo's per-ticker selection. GDELT is searched by company name, so a small
  company's coverage may thin. B2 and B3 are the replacements.

## B2. The company's press release on its 8-K row

**Status:** PROPOSED

- **Why:** free, public, already half built, and the announcement is what moves the price. It is
  the one kind of "full article" every listed company publishes with no licence to buy.
- **What a session does:** read each 8-K's exhibit list for its press release (EX-99.1), put the
  release's headline on the row with a link to the exhibit on sec.gov. No article text is copied.

## B3. Bring Currents back, free tier

**Status:** PROPOSED

- **Why:** the only third-party news feed read whose free plan states commercial use in so many
  words. It would return present-day headlines that GDELT's name search misses.
- **Before building:** the owner (or a session, with the owner's go-ahead) asks Currents to
  confirm in writing that a stored headline with a link on an ad-supported page is within "commercial
  use with attribution", since their terms also ask for a "Powered by Currents News API" credit.
- **Against:** 250 requests a day is about 250 companies a day, so it suits the pages people
  actually visit, not all 11,000; and its results need the relevance floor that was shelved with
  the aggregators (NC-036, NC-076).

## B5. Benzinga, when there is a budget for news

**Status:** PROPOSED (as a later step)

- **Why:** the nearest thing to Yahoo's method that a small site can buy: one newsroom's own
  reporting, licensed by that newsroom, with per-ticker tagging.
- **What the owner does:** ask Benzinga for a display licence quote for headlines and teasers on a
  public ad-supported site. Nothing to build until there is a price.

---

## Requests made

Public pricing, terms and help pages of the providers named, read once each on 2026-11-25 and
2026-11-26; Nieman Lab, Tubefilter, Digiday and Editor & Publisher for the Yahoo account; the
Copyright Office's circular and its summary of *AP v. Meltwater*. No sign-up, no key, no purchase.
