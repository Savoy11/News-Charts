# Chronolens

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
pg_restore --clean --if-exists -d "$DATABASE_URL" backups/chronolens-<timestamp>.dump
```

Verified 2026-07-21 by expanding a dump to SQL and comparing row counts against the live
database — all 12 tables matched exactly (490 events, 490 attestations, 561 links, 2512 prices).
A full restore *rehearsal* into a scratch database still hasn't been done: the `chronolens` role
deliberately lacks `CREATEDB`, so it needs either that grant or a one-off superuser run.

## Database and ingest worker

Chronolens owns a dedicated `chronolens` database and a non-superuser `chronolens` role.
**It shares nothing with any other project on this machine** — no credentials, no schema, no
data. `DATABASE_URL` lives in `.env.local` (gitignored).

```
npm run db:gen      # regenerate db/001_init.sql from docs/EVENTS-SCHEMA.md
npm run db:migrate  # apply pending db/*.sql, tracked in schema_migrations
npm run ingest -- --topic bicycle
npm run ingest -- --ticker AAPL
```

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

**The key never touches a Chronolens server.** `lib/ai/client.ts` and `components/AiPanel.tsx`
are both `"use client"`, and every request goes straight from the browser to the chosen
provider. There is no API route, no server action, and no server module that reads the stored
config — verify with:

```
grep -rn "apiKey" app/ lib/ components/     # only the two client files, plus the
                                            # separate operator-side scorer
grep -rln "chronolens:ai" app/ lib/         # nothing server-side
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
