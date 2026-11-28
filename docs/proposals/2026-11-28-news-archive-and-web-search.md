# A news archive for 1963–2017, and a web search engine — 2026-11-28

**Items:** NC-072 (the 1963–2017 news gap) and NC-070 (a web search engine as a discovery layer),
from the owner's answers of 2026-11-28 (`docs/decisions/2026-11-28-product-choices.md`) ·
**Commit:** 3b365fc (main after batch 191) · **Where it ran:** the cloud build container, public
pages read through its proxy · **Nothing was built, bought or signed up for.**

> The owner asked two things on 2026-11-28:
>
> - **The news gap:** "Price a news archive". The site has no news for 1963–2017.
> - **Web search:** "Write the comparison" of search engines as an extra way to find articles.
>
> **How to read this.** Two research passes read each provider's own pages on 2026-11-28. *Direct*
> means the sentence was found in the page's own text; *reader* means a fetch tool read the page and
> reported it; *unread* means the page refused to be fetched, and nothing was done to get round
> that. Every provider's sentence quoted below was then checked a second time against the saved
> text of its page. Prices marked "by quote" are not published. This is a practical reading, not
> legal advice.

Mark each option `APPROVED`, `REJECTED` or `DEFERRED`. Anything that costs money or needs a sign-up
is the owner's to do; nothing below can be bought from a session.

---

# Part A — A news archive for 1963–2017 (NC-072)

**What is needed:** for a listed company, dated news items from 1963 to 2017, each as a headline,
its outlet, its day and a link, under terms that allow commercial use, keeping them in the site's
own database, and showing them to anonymous visitors beside advertising.

## The short answer

**Nothing read offers that for 1963–2013 at a published price.** The archives that hold those
decades are the newspapers' and wire services' own, sold through licensing desks. Their pages could
not be read from here, so their terms and prices are unknown, not unfavourable:

| Archive | Years | What was read | Price |
| --- | --- | --- | --- |
| The New York Times (its Archive API and NYT Licensing) | not read | unread: every developer and licensing page refused the fetch | not read |
| Dow Jones Factiva, LexisNexis, ProQuest, NewsBank | not read | unread (refused, or the page failed) | not read |
| AP, Reuters Connect | not read | unread | not read |
| Reuters, through LSEG's data catalogue | "History: From 1900" (direct) | "Delivery methods: API, Bulk"; no terms and no price on the page | "Talk to us" (direct) |
| The Guardian Open Platform | not read | unread | not read |

Three things were established about the rest of the field:

- **GDELT cannot fill it.** Its older event records hold no headline, and its codebook says the
  link "is not present in event files prior to April 1, 2013" (direct). Its article titles begin in
  2019.
- **The news-data companies start too late.** NewsAPI.org searches "articles up to 5 years old";
  GNews has "historical data since 2020"; NewsCatcher "back to 2019" (all direct).
- **One self-serve licence fits, for 2014–2017 only** (A1 below).

## A1. NewsAPI.ai (Event Registry), for 2014–2017

**Status:** PROPOSED

- **Why:** the only source read whose own terms name this exact use. Its terms ("Last updated:
  October 7, 2026", direct): "This includes displaying article headlines, short excerpts, source
  names, publication dates, thumbnail images, and links to the original articles to your users,
  subject to the rights of the original content owners." "Store the data you retrieve in your own
  systems. These Terms set no retention period." "Attribution to Event Registry is not required."
- **What it covers:** "Historical data since 2014" (direct). GDELT already covers 2017 on, so it
  would add 2014, 2015 and 2016: three years of a 54-year gap.
- **Price (direct):** $90 a month for 5,000 tokens, up to $3,000 for 500,000. "Searching the archive
  costs 5 tokens for every year the search covers", and a search returns up to 100 articles. One
  page of results for one company across the three years is 15 tokens. So $90 buys about 330
  company-pages a month, and one page for each of the 10,429 stock and ETF tickers is about 156,000
  tokens: one month on the $1,300 plan. "Upgrade, downgrade or cancel at any time."
- **To ask in writing before paying:**
  1. Section 9 says retrieved data "may be kept and used internally after termination". May
     headlines stay on public pages after the subscription ends? If not, a one-month backfill buys
     nothing lasting.
  2. Which outlets its 2014–2016 archive holds, and whether their links still open.
  3. "To register, you must use a valid company or academic email address": does the project's
     address qualify?
- **Against:** "Event Registry does not grant or broker publishing rights for third-party content",
  so the display still rests on the same footing as a GDELT headline. And it is three years.

## A2. Ask the two archives that hold the older decades

**Status:** PROPOSED

- **Why:** the Times and Reuters are the two archives identified that hold dated, headline-level
  records for 1963–2013. Neither publishes a price for display.
- **What the owner does:** first reads the Times's developer terms in a browser (already owed, for
  the visitor keys), then sends one enquiry each to NYT Licensing and to LSEG. A session drafts
  both, with the same questions asked of Tiingo and Currents: what is licensed, whether a headline
  and link may be stored and shown beside advertising, for how long, and at what price.
- **Expect:** an enterprise quote. Nothing read gives a figure, and none is guessed here.

## A3. Free fills that need no licence

**Status:** PROPOSED

- **Wikipedia's "Current events" pages, 2002 on.** Monthly pages reach back to January 2002
  (direct), with dated one-line entries under headings that include business, each linking the
  outlets it cites. Wikipedia's text may be used "free of charge for any purpose so long as
  licensing terms are met" (direct): credit and a link, as the site already gives for its Wikipedia
  history. **What a session would do first:** count how many 2002–2017 entries name a held company,
  before building anything. If it is a few hundred across all companies, it is not worth a feature.
- **More government records for those years**, in the same spirit as what is already held: the
  FTC's press releases (its list reaches back to 1970; reader), congressional hearings on govinfo
  (1995 on; reader), federal court opinions in bulk from CourtListener ("free of known copyright
  restrictions"; direct). Each would be its own proposal.
- **Not usable as found:** the Vanderbilt Television News Archive has staff-written abstracts of
  the network evening news from August 5, 1968 (direct), but offers them "for scholarly and research
  purposes", so it would need written permission. The Internet Archive's help page says "Ad
  supported websites that give away materials would be deemed commercial use" (direct).

## A4. Leave the gap to the records already held

**Status:** PROPOSED

- **Why:** the government and regulator records built since October (the SEC's digest from 1956,
  recalls, EPA, the courts, FDA, EDGAR from 1994) are free, permanent and already on the pages.
  This was the recommended answer on 2026-11-28, and after reading the field it still is the only
  route with no cost and no open question.

## What I would do

A3's count first, since it is free and settles itself with a number. A1 only if NewsAPI.ai answers
question 1 with a yes, and then as a single month's backfill. A2's two letters only if older news is
wanted enough to pay an enterprise price for it; otherwise A4.

---

# Part B — A web search engine as a discovery layer (NC-070, NC-071)

**What is needed:** ask a search API for pages about a company, keep the title, day and link of
what comes back as a dated row, stored for good and shown beside advertising.

## The short answer

**One engine's published terms allow it (Mojeek), one sells it by negotiation (Brave), and the two
the old item named are gone.** Storing results is the point most engines forbid.

| Engine | Sold to new customers? | May results be stored? | Shown beside ads? | Price per 1,000 queries | Verdict |
| --- | --- | --- | --- | --- | --- |
| **Mojeek** | Yes, self-serve | Yes, on the Business plan | Yes, stated | £3 (Business) | Fits on a named plan |
| **Brave** | Yes | Not on the self-serve plan; "Yes, with a custom plan" | Not addressed | $5 self-serve; custom by quote | Fits only by negotiation |
| **Google Custom Search JSON API** | **No** | n/a | n/a | n/a | Not available |
| **Bing Search APIs** | **No** | n/a | n/a | n/a | Not available |
| Bing's replacement ("Grounding with Bing Search") | Inside Azure agents only | No | No | $14 | Does not fit |
| SerpApi and its peers | Yes | Not restricted by them | Not addressed | from $10 | Does not fit (see below) |
| Kagi, You.com, Exa | Yes | No | Not addressed, or no | $12, $5, from $4 | Does not fit |
| Tavily, Yandex | Yes | Not granted | Yandex: results unaltered in order | $8, about $4 | Does not fit as published |
| DuckDuckGo | No search API | n/a | No | n/a | Not available |
| Marginalia | Yes | Commercial key only | Commercial key only | unread | Does not fit: no dates |
| SearXNG, Common Crawl | Free software and open data | Upstream terms apply; no dates or search | n/a | free | Does not fit |

Mojeek's and Brave's prices were checked twice; the other prices in the table are as the research
pass read them.

The sentences that decide the "not available" and "does not fit" rows, all direct:

- **Google:** "The Custom Search JSON API is closed to new customers." Existing customers "have
  until January 1, 2027 to transition to an alternative solution". This settles NC-071.
- **Bing:** "Bing Search APIs will be retired on August 11, 2025." Its replacement's terms forbid
  to "Copy, store, cache, archive, or create a database of Output" and "Display advertising that is
  not provided by Microsoft".
- **Kagi:** no "Store, cache, or build a database of Results beyond the transient caching needed
  to operate your application." **You.com:** "Do not copy or store for re-use significant portions
  of Search Content without contractual authorization."
- **SerpApi and its peers** resell Google's results, collected by scraping. SerpApi's legal page
  says it "assumes liability for the lawful collection of public search data (scraping, parsing,
  and related actions), but not for how that data is ultimately used." The research found Google's
  suit against SerpApi, filed in December 2025, still open on 2026-11-28 (SerpApi's own account of
  10 November 2026: dismissed twice with leave to amend; that post was not read a second time). A
  public site with advertising should not stand on that.

## B1. Mojeek, Business plan

**Status:** PROPOSED

- **Why:** the only engine whose published terms allow all of it. Its API terms (undated; direct):
  "You may use Data for commercial purposes, such as subscription services, and display it together
  with advertising from other parties, without attribution to Mojeek." "You may retain Data
  indefinitely only if you subscribe to a plan with storage rights." Its pricing page: "our Business
  Plan and Enterprise Plan have storage rights which permit indefinite data retention".
- **Price (direct):** £3 per 1,000 requests on Business, "no minimum commitment". About 250
  requests a day is £22.50 a month; about 2,500 a day is £225. Before tax.
- **To ask in writing before building:**
  1. "Do not use Data as part of any search index." The site's own search runs over stored titles.
     Does that count?
  2. Retention is tied to subscribing "to a plan with storage rights". May stored rows stay after
     the plan ends?
- **To measure before deciding:** Mojeek is a general web index with no news endpoint, and a
  result's date is often when the page was last changed, not when it was published. A row needs a
  day it can be trusted on. A trial on a handful of companies would show how many correctly dated
  rows come back that GDELT does not already have.
- **Its own caution:** "Mojeek grants no rights in the third-party content contained in or linked
  from the Data." As with every source here, the headline stays the publisher's.

## B2. Brave, a custom plan with storage rights

**Status:** PROPOSED (only if B1's trial shows too little)

- **Why:** the better engine for this job: it has a news index and can filter by a date range.
- **Against:** its terms ("Last updated: 1 Sep, 2026", direct) bar a customer to "store, cache, or
  create a database of Search Results, in whole or in part, other than transient storage", and the
  exception is by sales: "Can I store results or use them to train models? Yes, with a custom plan.
  Contact sales to learn more about search with storage rights." No price is published.

## B3. No discovery layer

**Status:** PROPOSED

- **Why:** GDELT already indexes mainstream news, free, with dates. What a search engine would add
  is company, trade and local pages, which carry the weakest dates. The item was written when topic
  pages were the focus.

## What I would do

B3, unless a small Mojeek trial is wanted first. The trial needs an account with a bank card, which
is the owner's to open; a session can then measure on its free credit and report a number. NC-071
closes either way: Google no longer sells its API to new customers.

---

## Pages a person should open in a browser

Refused to be fetched, so unread: the Times's developer terms, FAQ and Archive API pages and
nytlicensing.com; the Guardian's Open Platform access and terms pages; Dow Jones's Factiva pages;
newsbank.com; the AP's developer and archive pages; Reuters Connect; the FT's developer portal.
Answered with an error: ProQuest's product pages, newspapers.com's terms, LexisNexis's data pages,
the Vanderbilt archive's own site, archive.org's terms page.

## Requests made

Public pricing, terms, documentation and licensing pages of the providers named, read on
2026-11-28 by two research passes and, for the quotes used above, a second time. No sign-up, no
key, no purchase, no form submitted, no email sent.
