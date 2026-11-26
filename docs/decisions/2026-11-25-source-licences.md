# Source licences — the terms reading of 2026-11-25 and the owner's calls

A record of what each outside source's published terms said on 2026-11-25, how each was read, and
what the owner decided that day. It is a practical reading, **not legal advice**: the last section
lists what a lawyer should confirm (NC-023). The registry of record is `SOURCES` in
`lib/ingest/store.ts`; this file is the evidence behind its notes.

How each page was read is stated, because it bounds how far the reading can be trusted:

- **Direct**: the page was fetched and the quoted sentences found in its text.
- **Reader**: a fetch tool read the page and reported the quotes; the page could not be opened
  directly from the build container.
- **Unread**: no terms text could be obtained. Unread is not cleared.

## What the terms say

| Source | Page and date | How read | What it says | Fits a public ad-supported site? |
| --- | --- | --- | --- | --- |
| Yahoo Finance RSS (headlines) | Yahoo Terms of Service, "Last updated: 1 November 2026" | Direct | "you are only permitted to display the content that is provided in the feed, without modification, and you must provide attribution to our source website and link to the full article … You may not incorporate advertising into any Yahoo RSS Feed." "Unless otherwise expressly stated, you may not access or reuse the Services, or any portion thereof, for any commercial purpose." No collecting data "using any automated means … without our express, prior permission"; no "database, archive … or any other aggregated data source that competes with or constitutes a material substitute for the Services". | No |
| Yahoo Finance chart (prices) | the same terms | Direct | The chart endpoint is undocumented and named in no Yahoo terms page; the clauses above apply to it. Yahoo's permissions page says its permission "does not cover content from third parties (e.g. … stock quotes …)" (Reader). | No |
| DefiLlama (incident list) | Terms of Use, "Effective Date: 24 June 2025" | Direct | "we grant you a revocable, non-transferable, non-exclusive licence to access and use the Site for personal, non-commercial purposes." You agree not to "republish the data in any form without permission" or "copy, scrape, harvest or otherwise exploit the Content & Data for commercial purposes without prior written consent". Liquidated damages "up to USD 100,000 per violation" for a breach of that clause (Reader). | No |
| Etherscan API (token supply moves) | API terms, "Last updated: 1 October 2026" | Reader (the page answers a direct request with a challenge) | "The Free, Lite and Standard Plans are licensed for Personal & Research use only." Commercial use is one that "generates revenue, directly or indirectly, including through subscriptions, advertising". "The Advanced Plan and higher-tier Plans include Commercial Application use." Attribution "Powered by Etherscan.io APIs". | No, on the free plan |
| GDELT | gdeltproject.org/about.html, Terms of Use (undated) | Reader | Its datasets are "available for unlimited and unrestricted use for any academic, commercial, or governmental use of any kind without fee"; "any use or redistribution of the data must include a citation to the GDELT Project and a link to this website". Silent on who owns an indexed headline. | Yes, with the citation and link |
| Wikipedia | Wikimedia Terms of Use, in effect 7 June 2023 | Reader (part verbatim, part summarised) | Content is under free licences that allow reuse, commercial included, with attribution (a link to the article suffices) and share-alike for adapted text; automated use must follow the User-Agent policy and not burden the API. | Yes |
| Library of Congress (Chronicling America) | loc.gov/legal, 17 December 2020 | Reader | "we generally do not own the rights to materials in our collections. You should determine for yourself whether or not an item is protected by copyright or in the public domain". Guideline: "no more than 10 requests per minute". The API's own page answered 403. | Yes, as used (a snippet and a link) |
| Snapshot | docs.snapshot.box | Reader | 100 requests a minute without a key. No terms or licence text found; the terms page is an app shell. | Unread |
| Internet Archive | archive.org/about/terms.php | Unread | Only the page title came through. | Unread |
| mempool.space, Blockscout, Blockstream | their sites | Unread | No API terms found on the pages reached. | Unread |
| The Guardian, The New York Times | their developer terms | Unread | Both sites refused the fetch. | Unread (both are already off the ingest path as non-commercial) |
| Currents (read 2026-11-26) | its pricing and documentation pages ("Last updated: 27 October 2026") and its Terms of Service ("Last updated: December 27, 2025") | Direct | Pricing: "Commercial use: every self-service plan, including Free, allows commercial use with attribution and a link to the original article. AI summaries or republication of article text need separate terms." Terms, "Data license": "Unless applicable by law or expressly permitted by the owner of the data, you may not … Create permanent copies of, scrape, build databases of such data". "Use license": the data may be downloaded "for as long as your use case requires", and not mirrored "'as-is' with no-value-added". "Service Attribution": "display an attribution to Currents News API Service beside the display of data", preferably the link "Powered by Currents News API". Free plan: 250 requests a day, 20 results a request, 30 days of history, a 7-day span a search. | Not settled: the two pages pull apart on a stored headline. Held until Currents answers in writing |

## The owner's calls (2026-11-25)

Asked in one dialog, answered as quoted:

1. **Yahoo's news headlines:** "Can you find out how yahoo is able to host all their news articles
   and work on a way to mirror their method". No keep-or-drop call was made. The feed stays on the
   ingest path as a named launch blocker until the news-licensing proposal is decided (NC-021).
2. **Stock prices:** "Find a licensed provider (Recommended)". A licensed end-of-day provider
   replaces Yahoo's chart endpoint before anyone else loads the site; a comparison with costs is
   to follow (NC-130).
3. **DefiLlama and Etherscan:** "Turn both off (Recommended)". Done in batch 186: DefiLlama is
   `commercialOk: false` and off the on-chain feeds, its stored rows withheld from a public page;
   the two Etherscan-keyed feeds are not started.
4. **The Guardian and the NYT:** "Pause visitor keys (Recommended)". Both server keys are dropped
   at launch, as the six aggregators' were on 2026-10-19 (NC-019, NC-020), and the visitor's own
   key is hidden on a public build until the two terms pages are read (NC-136).

## The owner's calls (2026-11-26)

Asked in one dialog on the proposal of that day
(`docs/proposals/2026-11-26-prices-and-news-licensing.md`), answered as quoted:

1. **Prices:** "Tiingo (Recommended)". The owner emails Tiingo's sales contact four questions (the
   start-up price, storing the series and drawing our own chart on pages with advertising, whether
   $250 is the whole price, and the history's coverage). Nothing is bought until the reply. Intrinio
   and Twelve Data are deferred as fallbacks.
2. **News:** "Drop Yahoo's feed (Recommended)", "8-K press releases (Recommended)" and "Bring back
   Currents".
   - **Yahoo's headline feed is dropped** (batch 189): `yahoo_finance` is `commercialOk: false` and
     off the ingest path, and a headline stored from it is withheld on a public build. The dividend
     and split markers that were stored under the same source moved to the price source (db/063), so
     a chart keeps them.
   - **The 8-K's press release** on its row was already there (batches 42–56, October). Batch 190
     measured it on 260 recent filings of 26 companies and read the nine releases it had missed; the
     proposal's B2 says so.
   - **Currents is built and held** (batch 189). Building it meant reading its terms page again, and
     the "Data license" clause in the table above had not been quoted in the proposal the owner
     approved. The proposal already put Currents' written confirmation before building; with this
     clause that confirmation is the whole question, so the source stays `commercialOk: false` until
     the reply. What is built keeps a headline, its day and its link only. The owner sends the email
     in `docs/OWNER-ACTIONS.md` §3.

## What is still to do

- **Read by a person, in a browser:** https://developer.nytimes.com/terms and the Guardian Open
  Platform's terms, for one question: may a key holder use a personal, non-commercial key inside
  another party's ad-supported site? Then set `VISITOR_KEYS_TERMS_READ` in
  `lib/visitorKeysGate.ts`, or remove the feature.
- **Read or ask:** the Internet Archive's terms, and Snapshot's, mempool.space's, Blockscout's and
  Blockstream's API terms. Each is still flagged cleared on the July reading.
- **Send:** the email to Tiingo and the email to Currents (`docs/OWNER-ACTIONS.md` §3). Each reply is
  the licence record for its source: file it here, dated.
- **Review rhythm (NC-024, NC-025), not yet decided:** the checklist suggests quarterly once live.
  `npm run check:commercial-mode` already lists any cleared source last read over 180 days ago.

## For the lawyer (NC-023)

1. Is showing a headline, its source, its date and a link out, stored in our database, defensible
   for GDELT-indexed news on an ad-supported site? GDELT licenses its index, not the headlines.
2. Does Yahoo's RSS clause ("may not incorporate advertising into any Yahoo RSS Feed") reach a page
   that shows feed items beside advertising, or only advertising inserted into the feed itself?
   The general "no commercial purpose" clause may make the question moot.
3. Does a federal agency's work stay usable under 17 U.S.C. § 105 where its site states no licence
   (the owner's ruling of 2026-11-12; 37 of the 46 cleared sources are a US government body's own work)?
4. Do the Library of Congress's "determine for yourself" terms need more than a snippet-and-link use
   for newspaper pages after 1930?
5. Is a visitor's own key, used from their browser on our pages, the visitor's use or ours?
6. Currents' terms bar building "databases of such data" "unless applicable by law or expressly
   permitted by the owner of the data". Is a stored headline, date and link, which copyright does
   not protect as a title or a fact, within "applicable by law", or does the clause bind as contract
   whatever copyright says?
