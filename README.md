# News Charts

Research any topic on a linear timeline. For publicly traded companies, news, SEC filings, and
earnings are pegged to the stock price chart so analysts can spot what sparked a move. For
everything else, get the topic's full history as a timeline.

Built to drive traffic and ad revenue supporting the CAEP desktop app.

## Run

```
npm install
npm run dev        # http://localhost:3000 (or -p 3001)
```

## Homepage suggestions

The "Try:" chips rotate. `lib/suggestions.ts` holds a seed pool of 44 (20 tickers, 24 topics
chosen to show off the long-range timeline — a 19th-century subject demonstrates the product
better than another mega-cap). `/api/suggestions` blends in subjects that already have 10+
events in the database, so the homepage gets richer as the site is used, and falls back to the
seed pool alone if the database is down.

`components/SuggestionChips.tsx` renders a **fixed** set on the server and only shuffles after
mount — shuffling during render would break hydration. One chip swaps every 3.8s, replaced
like-for-like by kind so the 2-company/3-topic balance holds, never re-rolling the slot it just
changed. Rotation pauses when the tab is hidden and is disabled entirely under
`prefers-reduced-motion`; the ↻ button reshuffles on demand.

## Industry graph

Every EDGAR submissions record carries an SIC code, so peer grouping is **authoritative and
free** rather than inferred — NVDA and INTC both return `3674 Semiconductors & Related Devices`.
Ingesting a company creates (or joins) that industry automatically, via both the worker and the
page read-through.

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
npm run explain -- --industry sic-3674 --dry-run
```

The first step that uses a model, and it is handed an anomaly **plus its evidence** — never a
blank page and a pile of headlines. The prompt carries one signal and only the events that
signal cites, and forbids outside knowledge, speculation about causes or prices, and market
commentary. "These events don't explain it" is an accepted answer.

**An explanation with no citations is discarded, not stored.** The model returns indices into
the event list it was shown; anything it invents is dropped, and if nothing valid remains the
generation is thrown away. `synthesis_citations` uses `ON DELETE RESTRICT`, so a cited event
cannot later vanish beneath a published claim. Explanations render under their signal with each
citation as a link to the original document.

Cost is bounded structurally: the cache key is the signal plus a hash of the exact event
content shown, so an unchanged anomaly is never paid for twice, and the run reports its own
token usage and dollar cost. Requires `ANTHROPIC_API_KEY` in `.env.local`; without it the
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
npm run db:verify-restore              # newest dump
npm run db:verify-restore -- --file backups/news-charts-....dump
```

A backup nobody has restored is a guess. This runs the dump's **own SQL — DROP and CREATE
included, exactly what real recovery executes** — inside a transaction that is then rolled
back. The `news_charts` role deliberately lacks `CREATEDB`, so a scratch database isn't
available; this needs no extra privileges and persists nothing. Even an impossible commit
would write the dump of this same database.

It earned its keep on the first run:

> **A dump taken before a schema migration cannot be `--clean` restored over the evolved
> schema.** A dump from before `subject_members` existed failed with *"cannot drop constraint
> subjects_pkey … subject_members_industry_id_fkey depends on it"* — the dump's DROP statements
> can't remove objects that newer, not-in-the-dump tables still reference. **Restore an old dump
> into an empty database, never over a migrated one.** A current dump verifies cleanly (157
> statements).

Contents were separately checked by expanding a dump to SQL and comparing row counts against
the live database — all 12 tables matched exactly.

## Database and ingest worker

News Charts owns a dedicated `news_charts` database and a non-superuser `news_charts` role.
**It shares nothing with any other project on this machine** — no credentials, no schema, no
data. `DATABASE_URL` lives in `.env.local` (gitignored).

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
for retry rather than being silenced. Because a refresh may now cover only some sources, the live
path serves the union from the database and falls back to what it fetched if that read fails.

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

Every Phase 0 event is years finalized, so there is no reorg risk to reason about yet. A
confirmation-lag policy has to land before any live feed is added — an orphaned event that a
synthesis already cites cannot be deleted, by design (`ON DELETE RESTRICT`).

### Seeding without the network

`npm run db:seed-demo` writes a small demo corpus — two companies with a price series, a topic,
an industry — straight to Postgres through the same upserts ingest uses, with no API calls. It
exists because most of the UI can only be checked against data on screen, and a machine with no
keys, no egress, or a rate-limited feed otherwise has nothing to look at.

It seeds *shapes*, not volume: year-only dates (which bucket under the year instead of inventing
a January day), a clean run of filing-only days (which condense into one cyclable card), a
pre-IPO era (the "Before the ticker" run-up), and planted >2% single-day price moves with an
after-close earnings the session before (which is what "Biggest moves" pairs against). It is
idempotent, never deletes, and only touches the four subjects it owns.

Because the price series only runs 18 months, every seeded history event predates the first
trading day, so the "Before the ticker" section is larger than it would be against real prices.

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
npm run score -- --dry-run         # no writes
npm run score -- --strict-headline # see below
```

Two tiers, cheapest first:

1. **Deterministic (free).** Scores only what provenance makes certain: filings and earnings are
   1.0 (indexed under the subject's own CIK), history sentences are 1.0 (extracted from the
   subject's own article), press mentions 0.7. Everything ambiguous is left `NULL`.
2. **Model (paid, batched).** Scores the remainder — in practice, news headlines. Set
   `ANTHROPIC_API_KEY` in `.env.local` to enable it; without a key the pass is skipped cleanly.
   One request scores 25 headlines, so cost tracks new content, not rows or pageviews. Runs
   once per pair, never per pageview.

**Unscored means visible.** The read query is `relevance IS NULL OR relevance >= 0.4`, so
nothing is hidden without evidence and the site behaves identically with scoring switched off.

`--strict-headline` is a product decision, not a fact: it scores company news 0.2 when the
*headline* never names the subject. Against 12 real headlines captured from the live AAPL page
it took visible items from 12/12 to 4/12, removing every market-roundup and rival-company
story — at the cost of demoting oblique headlines like "iPhone maker rebounds". Off by default.

### How pages read

`lib/page-data.ts` is a **read-through cache**. A page tries the database first; on a miss or a
stale subject (6h for topics, 1h for companies) it fetches live, renders, *and* stores what it
fetched — so the database fills from real traffic, not just from manual ingest runs. A small
`stored` / `live` badge on each page shows which path served it.

Measured on this machine: `/topic/bicycle` went from ~11–16s live to **0.6s** from the database,
and a first visit to an un-ingested topic took 45s live, then **0.07s** on the next request.

**The database is optional.** Every read is wrapped so that an unreachable database logs a
warning and falls through to live sources. Verified by pointing `DATABASE_URL` at a dead port:
the page still returned 200 with all 97 cards, badged `live`.

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

## Data sources (all free, no API keys)

| Source | Used for | Notes |
| --- | --- | --- |
| Yahoo Finance chart API | Daily prices (10y) | Unofficial; swap for a paid API before scale |
| SEC EDGAR | Filings, earnings (10-K/10-Q/8-K 2.02) | Requires a `User-Agent` with contact email |
| GDELT 2.0 | News headlines | English-filtered; 2017+. Throttles per IP — see note below |
| Wikipedia | Topic histories | "History of ..." + "Timeline of ..." merged; search-index fallback |
| LoC Chronicling America | Historical newspapers ~1770–1963 | Public domain; fills the pre-2017 gap |

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

Rejected as *event* sources after testing:

- **archive.org item search** — item dates are unreliable. "The Bicycle Girl" exists twice, dated
  1895 (correct) and 1770 (garbage), and a date-sorted bicycle search returns four items from
  1770. Same silent-corruption class as the OCR problem; not worth the cleanup.
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

- `lib/` — data fetchers (`sec.ts`, `prices.ts`, `news.ts`, `wiki.ts`) with Next.js fetch caching
- `app/company/[ticker]` — price chart + merged event timeline (server-rendered, 30 min revalidate)
- `app/topic/[slug]` — Wikipedia history + news, rendered as a horizontal left-to-right timeline
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
makes this viable in production — if traffic grows, move news to a keyed API.

## Monetization TODO

1. Deploy (Vercel free tier works for MVP)
2. Buy domain, apply for Google AdSense, replace `AdSlot` placeholders
3. Point `CaepPromo` at the CAEP product page when it launches
