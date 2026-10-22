# News Charts — Master Checklist

The governing checklist for the **News Charts** project: a single place to track initiatives,
priorities, and progress. Add to it, check things off, re-prioritise. This is a living doc.

**Last updated:** 2026-10-17

## Scope & independence

- **This checklist governs News Charts only.** Crypto-Stuff / CAEP is a **separate project with
  its own master checklist**; the two are developed **independently** — no shared code, no
  runtime coupling. Any future cross-project connection would be a separate, explicit decision,
  not something assumed or tracked here.
  - **Enforced by test since 2026-08-07** (`npm run check:boundary`, part of `npm run check`),
    mirroring Finance-Now-Free's `repoBoundary.test.ts` so the protection is symmetric: no
    submodules, remotes point only at this repo, no cross-repo CI checkout, no import escapes
    the repo or names a sibling project, no `file:`/git dependency on one, and `CLAUDE.md`
    (added the same day) must keep stating the scope rule with no stale path into another
    checkout.
- **Related News Charts docs:** `README.md` (feature notes), `docs/EVENTS-SCHEMA.md` (the events
  schema spec). This checklist tracks *work*; those describe *what exists*.

## NC ledger — batch 2: the pipeline records what happened (2026-10-17)

Eleven more ledger items, mostly about ingest telling the truth: a source that could not answer
is logged as throttled or an error (not "no data"), a request is closed only when a subject
exists behind it, and identity rules stop refusing or duplicating real subjects. Every `npm run
check` suite passes; lint shows only the three known warnings (NC-049); `next build` compiles.
Live checks ran against a seeded Postgres 16 and `next dev`. This session's egress proxy refuses
Wikipedia, the SEC and Yahoo, so the live runs used that: an unreachable Wikipedia is a real
outage case.

- ⚠ **Owner action: run `npm run db:migrate`** wherever the database lives. `db/021_shared_cik.sql`
  (NC-138) must be applied before a second share class can be ingested.
- [x] **NC-142 — Internet Archive, Yahoo RSS and on-chain failures keep their outcome.** Ingest
      calls `fetchArchiveItems` directly. Yahoo RSS gained `fetchYahooFinanceNews`, and on-chain
      gained `fetchOnchainFor` with one result per feed (stablecoin feed and halvings now report
      outages too). `asResult`, which re-derived ok/empty from the event count, is gone. Cases in
      `check:archive` and `check:onchain`.
- [x] **NC-146 — a Wikipedia that cannot answer is not a missing article.** Non-OK statuses and
      refused connections throw `WikipediaUnavailable`. The first pass treats it as a timeout,
      never a strike toward the week-long block. The scheduler logs it, keeps a held topic's
      stored article and still runs LoC, GDELT and the Internet Archive. Companion "Timeline of"
      articles degrade instead of failing the page. Cases in `check:ondemand`. Live: with
      Wikipedia unreachable, a queued new topic stays pending with "Wikipedia unavailable".
- [x] **NC-144 — demand requests are fulfilled only when something was ingested.** Every ingester
      returns `IngestOutcome`; anything else is `markFailed` with the reason and stays pending.
      Failed requests queue behind untried ones, so a popular unresolvable one cannot hold a
      slot every run. Live: a request whose subject was locked was marked ✓ fulfilled on main;
      on this branch it stays pending with "locked by a first-visit gather".
- [x] **NC-148 — every on-chain feed is licence-checked under its own key** (`onchain`,
      `snapshot`, `defillama`), and `check:wiring` covers the paths outside topic/company ingest.
- [x] **NC-151 — backups never prune after an unverified dump.** Live: with a failing
      `pg_restore`, 15 old dumps were all kept; with a working one, pruning ran as before.
- [x] **NC-099 — the scheduler keys a new topic on its Wikipedia article** (`upsertTopicSubject`),
      as the first pass does, so a second phrasing no longer mints a duplicate subject.
- [x] **NC-138 — several securities can share one registrant CIK.** `db/021_shared_cik.sql` drops
      `subjects_cik_uq` for a plain index; the ticker stays unique. The spec and `db/001` are
      regenerated to match. Live: on main's schema GOOG after GOOGL fails on `subjects_cik_uq`;
      on this branch both insert, and a duplicate ticker is still refused. `check:tickers` reads
      the migrations in order and fails if the CIK ends up unique.
- [x] **NC-161 — `/company/<name>` serves the company we hold.** The page path resolves the name
      from the committed index (`resolveTickerLocally`, never a request) and redirects to the
      ticker. Live: `/company/Ford` showed "Not on News Charts yet" on main, claimed a re-fetch
      and queued a request for ticker "Ford"; on this branch it lands on `/company/F` with nothing
      fetched or queued.
- [x] **NC-101 — the cross-peer signal applies the display gate** its two siblings apply.
- [x] **NC-102 — price divergence measures every member over the same dates.** A member listed
      more than a week into the window is left out. Live, on a scratch database: main reported a
      November listing as "outran the sector by 75 points" and an irrelevant shared story as a
      cluster; this branch reports the real outlier (+30 over the full year) and no cluster.
- [x] **NC-116 — `scratch-parse.ts` removed** (a one-off debug script reading `/tmp/s.html`).
- Not in this batch: NC-147 (on-chain ignores refresh windows and back-off). Per-feed outcomes
  are logged now, so that item can build on them.

## NC ledger — first batch of fixes (2026-10-17)

Ten small, high-confidence items from the work ledger
([`docs/audits/nc-task-queue-2026-09-28.json`](audits/nc-task-queue-2026-09-28.json)), each with a
check that fails on the old code. Their ledger entries carry `closure` blocks dated 2026-10-17.
All `npm run check` suites pass; lint shows only the three known warnings (NC-049). Verified live
against a seeded Postgres 16 and `next dev` started with `TZ=Asia/Tokyo`.

- [x] **NC-163 — third-party links are only ever http(s).** `lib/safeUrl.ts` `safeHref()` gates the
      stored URL in `upsertEvent` and every rendered event link (event list, both timelines,
      price-chart popup, compare, signal citations). New `npm run check:links` also scans every
      component and page for an `href` built from a raw `.url`. Live: a `javascript:` URL planted
      in a stored attestation rendered with no link.
- [x] **NC-150 — one malformed Wikipedia citation no longer empties the next article.** The cite
      regex is created per call. Reproduced first (0 citations instead of 2), now in
      `check:parsers`.
- [x] **NC-155 — dividends print as declared** (`$0.2775`, `$0.004`), never fewer than cents.
      `dividendTitle()` in `lib/prices.ts`; a re-ingest heals stored titles, since the title is in
      the content hash. Cases in `check:parsers`.
- [x] **NC-059 — the DefiLlama `amount` comment** now says plain USD, verified live 2026-07-31.
- [x] **NC-158 — topic canonical, `og:url` and breadcrumb come from the stored slug.** They were
      double-encoded (`/topic/electric%2520cars`, a not-found page). Live: canonical is
      `/topic/electric%20cars` and loads 200.
- [x] **NC-100 — Postgres DATE values come back as the string stored.** `PG_TYPES` in `lib/db.ts`,
      used by both pools (the shared one and the first-pass one). `check:dates` simulates a
      Tokyo host: the old parser shifts a day, the new one does not. Live under `TZ=Asia/Tokyo`:
      `/api/group` dates match the database.
- [x] **NC-098 — `/compare` keeps a crypto topic's prices.** Live: `btc` vs `F` draws the
      growth-of-100 overlay.
- [x] **NC-048 — both `/compare` lines are rebased on the first day both have a row**
      (`lib/growth.ts`). The old code put a Saturday-starting BTC at 100 on Saturday and the stock
      on Monday; `check:compare` reproduces that.
- [x] **NC-040 — a fund name that means several funds is not an answer.** The fund-name rung now
      needs one fund, not first hit — for exact names too, since 214 exact series names belong to
      several funds ("Balanced Fund" ×5). Two index rows for one fund still count as one
      ("Vanguard 500" → VOO).
      - ⚠ Observed live: "S&P 500" now falls to head-prefix salvage, where "S&P" uniquely prefixes
        S&P Global → **SPGI**. Closer than an arbitrary fund, but not the index fund a reader
        means. That needs on-screen disambiguation (NC-039) or an owner decision on an alias.
- [x] **NC-170 — `/api/group` and `/api/signals` answer an outage with a generic 503** and log the
      detail server-side (the pg error named the database host and port, with status 200). The
      no-JavaScript `/search` redirects with a relative `Location` instead of the request origin.
      New `npm run check:api` runs both routes against a closed port.
- ⚠ `check:ui` re-run alongside: 100 pass, then the same harness crash as NC-132. One failure,
  "GM is offered before a stand-in", is a timing flake in the check, not a regression: all three
  seeded subjects show at load, and the chip row rotates one every 3.8s before the check reads it
  on a slow dev compile. Recorded on NC-046.

## NC ledger — batch 3: honest data, real names, readable pages (2026-10-17)

Ten items: event data that can correct itself and tells sources apart, explanations attached to
the right signal, pages a screen reader and a phone in sunlight can both read, and a browser
suite that runs to the end. `npm run check` passes and `next lint` now reports **no warnings at
all** (NC-049). `next build` compiles. `check:ui` runs to completion for the first time: 141/148,
with the seven failures noted under NC-132 below.

- [x] **NC-131 — Internet Archive hits are no longer "cited by the subject's own article".**
      `deterministicScore` judges an archive "citation" on whether its title or creator names
      the subject: named 0.7, oblique to the model, otherwise 0.2 (hidden). Wikipedia citations
      keep 0.9. `npm run score` passes the source too, and a re-ingest re-scores links the old
      rule scored, never a model's. Live: a stored 0.9 keycap listing re-scored to 0.2 while a
      model's 0.8 stayed. Cases in `check:relevance`.
- [x] **NC-140 — a Library of Congress page's title no longer carries one subject's search
      term.** It reads "Page in the Detroit Free Press (Michigan)" whichever subject matched it,
      so it stops flipping (and re-billing explanations) between refreshes. Existing rows are
      re-titled on their next ingest. Case in `check:parsers`.
- [x] **NC-141 — a source can correct when and what an event is.** Date, precision and kind
      update from the source that owns the event's primary attestation, and only from it. A
      date-only correction updates even though the content hash is unchanged. Live: a citation
      refined from 1908 (year) to 1908-10-01 (day) was taken; a second source's 1909 date was
      ignored.
- [x] **NC-165 — a stored AI explanation is shown only for its own window.** Explanations are
      matched on kind, start and end (headlines are not stored); the newest run under the
      current prompt wins. Live: of four rows sharing a start date, the panel picked the newest
      one-week explanation and ignored both the two-month window and the old prompt version.
- [x] **NC-167 — inputs and tone dots have names.** The search box, both compare inputs, the
      compare swap button and the AI input carry `aria-label`s. Tone dots are announced, and a
      visible key under the list says what green and red mean.
- [x] **NC-168 — legally important text is readable.** The footer disclaimer, Sources-panel
      licence credits and AI-explanation line moved from slate-600 (2.66:1) to slate-400 (7.87:1
      measured in the browser). Stored explanations now say "AI-generated summary — may be
      wrong" rather than only naming a model id.
- [x] **NC-169 — proximity, not causation.** The homepage and company meta descriptions say
      "see what was happening around each move" instead of "what (actually) moved it".
- [x] **NC-047 — the Wikipedia lede is credited beside it** on topic pages: the article link,
      "by its contributors", and CC BY-SA 4.0. Shown even while the teaser is collapsed.
      Owner: confirm this form meets the attribution requirement.
- [x] **NC-049 — the three exhaustive-deps lint warnings are fixed**, not suppressed: GroupView
      depends on a ticker string, and PriceOverlay lists the events its markers read.
- [x] **NC-132 — `check:ui` runs to the end.** The stalled-request route's late abort is caught.
      Two side issues surfaced once it ran: the chip check read the row mid-rotation (NC-046), so
      it now reads under reduced motion; and the console check counted the suite's own faked 500,
      so deliberately failed URLs are excluded by exact match. New "Readable to everyone" section
      covers NC-047/167/168/169.
      - ⚠ **Seven checks fail, and they were already stale before this batch, hidden by the
        crash.** Six in "Search routing" expect prompt search to route "how did X affect Ford
        stock" with a `focus`. One in "Chrome and routes" expects an unknown ticker to resolve as
        a subject. Both behaviours were switched off on purpose in the 2026-08-08 scope refocus.
        They are left as written for the owner to decide: rewrite them to today's behaviour, or
        keep them as the Prompt search v2 spec (NC-008).
- ⚠ **NC-160 (soft 404s) is not in this batch.** Measured on a production build: with
  `loading.tsx` on a route, Next 14.2 sends 200 even when `notFound()` runs in
  `generateMetadata`. Miss pages already carry `noindex`. A real 404 needs dropping the loading
  skeleton on company/topic/industry pages — a visitor's first search for a new subject would
  then wait up to about 8s with no loading screen — or the Next upgrade (NC-166). Owner decision.

## NC ledger — batch 4: bounded spend, bounded abuse (2026-10-17)

Eight items: the last owed live test, ingest that stops asking a source that has throttled it,
AI calls that are priced first and cannot be steered by a headline, and an anonymous visitor who
can no longer flood the queue, spend the outbound budget, or mint a page under their own words.
`npm run check` passes with two new suites (`check:ai`, `check:abuse`), `next lint` reports no
warnings, `next build` compiles, and `check:ui` is 141/148 — the same seven stale prompt-search
checks as batch 3, nothing new.

- [x] **NC-001 — the advisory lock is proven across two OS processes.** Live against Postgres 16,
      both directions, with the real code: with another process holding the subject's lock,
      `firstPassTopic` returned `already_attempted` and made 0 fetches (control run without the
      lock: 1 fetch); with a real first pass held mid-fetch, a real `npm run refresh` logged
      "locked by a first-visit gather; skipping this cycle" and left the request pending.
- [x] **NC-143 — a throttle backs off the whole source, not one subject.** `shouldBackOff` also
      reads the source's latest row across every subject (new index, db/022), so the next subject
      in the same run skips a source that just throttled. Live: after a throttled GDELT row for
      Ford, ingesting "electric cars" printed "gdelt skipped last attempt throttled, within 10
      min backoff".
- [x] **NC-147 — on-chain ingest honours refresh windows and back-off.** Each feed (`onchain`,
      `snapshot`, `defillama`, `yahoo_finance`) is checked with `dueSources` and `shouldBackOff`,
      and `fetchOnchainFor` runs only the due ones. A crypto price fetch that fails is logged as
      an error instead of ending the asset's run. Live: a fresh `onchain` row → "fresh inside its
      1440 min window"; the failed price was logged and the next run backed off it.
- [x] **NC-149 — AI spend is capped and counted.** `npm run explain` prices the whole run before
      the first call (max_tokens as the ceiling), stops above the same $1 cap as `score`
      (`--max-usd` raises it), and keeps a running guard. A refused reply's tokens are counted and
      the refusal is stored (`synthesis_refusals`, db/023), so the same input is not paid for
      again; `cost-report` includes it. `score --dry-run` no longer calls the model. Live with a
      stand-in API: the cap stopped a $0.0042 run at $0.001; a refused reply was recorded with
      800/60 tokens and the next run made no call.
- [x] **NC-153 — fetched text goes into prompts as data.** Headlines (relevance) and event titles
      and source labels (explain) are sent as one JSON object per line inside a tagged block the
      model is told not to obey; `<`/`>` are escaped so a title cannot close the block. Replies are
      validated: a score must name a headline that was sent and lie in [0, 1]; an explanation
      citing an event it was not shown, carrying a link, or far over length is discarded whole. A
      batch scoring 3+ headlines all 0 is held back unwritten (unscored rows still display).
      Explanations stay labelled "AI-generated summary — may be wrong". `PROMPT_VERSION` is now 2,
      and the "already explained" check reads the prompt version, which it ignored before.
- [x] **NC-145 — the demand queue cannot be flooded by reloads.** A repeat ask counts at most
      once an hour per slug (db/024 `counted_at`); nothing is recorded or re-opened while the first
      pass has the target in failure back-off, and the scheduler skips those too; slugs over 80
      characters are not stored; the refresh deletes unfulfilled requests nobody repeated in 90
      days. Live: 5 reloads → 1 ask, one more an hour later → 2; a dead company slug was not
      recorded and a pending one was held back.
- [x] **NC-162 — rate limits on the API and `/search`.** New `middleware.ts`: 120 requests per
      client per minute, and at most 15 *new* Federal Register terms per client per hour (repeats
      come from the fetch cache, so moving a slider costs nothing). Terms are normalised, and the
      signals route fetches from one fixed date floor and filters afterwards, so a term is one
      cache entry whatever lookback a visitor picks. Live on a production build: request 121 got
      429 with `Retry-After`, another client still got 200, and new term 16 got 429.
      - In memory, per server instance, keyed on the first `X-Forwarded-For` hop — a host or WAF
        rule is the durable version (owner action below).
- [x] **NC-157 — a typed URL no longer mints a topic under its own words.** Minting now needs
      *every* distinctive word of the slug to be in the article's title (`articleCoversSlug`);
      a held subject still refreshes on the looser test. New topics are stored under the article's
      name ("History of the bicycle" → `bicycle`), the typed form is kept as an alias, and the page
      redirects an alias to the stored slug. Topic, company and sector social cards are built from
      the stored name; a subject we do not hold gets a generic card. Live: `zorblax files for
      bankruptcy` was refused and not queued; `zorblax motor` minted `zorblax motors` with the
      alias; two junk `/topic/…` and `/company/…` cards rendered byte-identical generic images.
      - The alias redirect arrives in-page (meta refresh), as the company redirect does, because
        of `loading.tsx` — the same cause as NC-160.

**Owner actions from this batch:**
- Run `npm run db:migrate` — db/022, db/023 and db/024 (plus db/021 if batch 2's is still unapplied).
- Run `npm run explain` once after deploying: explanations written under prompt version 1 stop
  showing until they are regenerated under version 2 (a few cents at the current cap).
- Purge topics minted before NC-157 under wording their article does not contain (for example a
  "History of Tesla, Inc." subject reached by "tesla files for bankruptcy"), and their aliases.
- Add a host or WAF rate limit, and make sure the host overwrites `X-Forwarded-For`; the
  in-app limiter is per instance and trusts that header.
- Decide whether visitor-chosen Federal Register terms stay. NC-162 suggested server-known term
  lists only; this batch kept the feature and bounded it instead.

## NC ledger — batch 5: correct data, cached pages (2026-10-17)

Seven items: two Ethereum supply feeds brought back from a retired API, one story from two news
feeds stored once, price history that is logged and survives a split, fund filings that say who
filed them, and subject pages that stop re-querying the database on every view. `npm run check`
passes, `next lint` reports no warnings, `next build` compiles, and `check:ui` is 141/148 — the
same seven stale prompt-search checks as batches 3 and 4.

- [x] **NC-054 — the stablecoin and USDT feeds use Etherscan V2.** Both built their requests on
      `api.etherscan.io/api`, which answers every call with "deprecated V1 endpoint" (confirmed
      live 2026-09-28), so every supply timeline was empty. Both now use
      `api.etherscan.io/v2/api?chainid=1`, and a refusal is logged as an error rather than an empty
      result (USDT still read it as empty; the transfer reader was fixed in batch 2). Etherscan is
      blocked from this session, so the owner's keyed run is the live confirmation.
- [x] **NC-056 — USDT reads to its newest log.** getLogs returns the oldest 1,000 rows from block 0
      and takes no sort, so recent mints were never read. It now pages forward by block (repeating
      the last block, skipping rows already read), stops at 20 pages and says so, and keeps the
      newest material moves. `check:onchain` has a two-page fixture, a stuck-block fixture and the
      page cap.
- [x] **NC-154 — GDELT keys a story the way the other feeds do.** Its raw-title, compact-date key
      could never meet Yahoo's `storyKey`, so the same story was stored twice. New rows use
      `storyKey`; a row under the old key is re-keyed when GDELT serves it again, or merged into the
      row already holding that story (attestations become secondary sources, subject links and
      citations move across). `npm run rekey:gdelt` does the rest in one transaction (`--dry-run`
      to count first). Live: a GDELT/Yahoo duplicate merged with the explanation's citation carried
      over, a lone row was re-keyed, a second run found nothing, and a re-served row was re-keyed
      in place.
- [x] **NC-103 — prices are logged, windowed and backed off under their own key**
      (`yahoo_prices`, 12-hour window), instead of riding the RSS feed's window unlogged. A
      refused chart fetch is an error with Yahoo's reason, not an empty series. A company page now
      needs events, not prices: one with filings but no closes shows its timeline with "No price
      data for this security yet", and a first visit no longer counts a Yahoo refusal toward
      marking a real company dead. Live on a production build: a company with one filing and no
      prices rendered its timeline and the notice.
- [x] **NC-156 — a split re-reads the whole price history.** When the chart reports a split the
      database has not seen, and older closes are stored than the 10-year window covers, the full
      history (`range=max` — *which Yahoo answers with monthly closes; found and fixed in batch 22,
      which asks by date*) replaces the stored series in one transaction; if that fails, closes
      older than the window are dropped rather than left on the old adjustment. Live (rolled back):
      the check fired only for a new split with older rows, and replace/drop wrote what they say.
- [x] **NC-139 — a fund's filings name who filed them.** EDGAR's submissions list does not say
      which series a filing covers, so filtering per fund would cost a request per filing. Fund
      forms are now titled with the registrant ("VANGUARD INDEX FUNDS: Prospectus update (497)"),
      say they may concern a sibling fund, and score 0.7 ("filed by the fund's registrant") instead
      of 1.0 — still shown. An operating company's own filings keep its name and 1.0.
- [x] **NC-159 — subject pages stop re-querying the database on every view.** The routes were
      dynamic, so `revalidate = 900` did nothing. Sector pages are now cached whole (MISS then HIT,
      `s-maxage=900`). Company and topic pages cannot be: a miss runs a first-visit gather and must
      not be cached, and on Next 14 `noStore()` inside a cached route is a 500 ("Page changed from
      static to dynamic at runtime" — measured). Their held-page reads are cached for 15 minutes
      instead, and a cached "not held" is re-checked live. Live: a held page kept its cached name
      after a database rename; a missing company appeared the moment it was added.
      - Company and topic responses are still `no-store` for the browser and any CDN; the saving
        is database load, not HTML rendering.

**Owner actions from this batch:**
- Run `npm run rekey:gdelt` once after deploying (`--dry-run` first shows the counts).
- Run the stablecoin/USDT ingest with `ETHERSCAN_API_KEY` set, to confirm V2 answers live.
- Decision: company pages with filings but no prices now render with a notice instead of "not on
  News Charts yet". Say if the old gate should come back.

## NC ledger — batch 6: docs that match the code, a safe restore rehearsal (2026-10-17)

Eight items: a restore rehearsal that no longer locks the live database and now checks what it
restored, a dated licence judgement on every source, and five documents brought back in line with
the code. `npm run check` passes and `next lint` reports no warnings. No page code changed, so
`check:ui` was not re-run (141/148 at batch 5).

- [x] **NC-152 — the restore rehearsal runs against a scratch database and checks what came
      back.** It used to replay the dump inside a rolled-back transaction against `DATABASE_URL`,
      holding exclusive locks on every live table for the whole reload. It now needs
      `RESTORE_TARGET_URL` (or `--target`), refuses the live database under any spelling, restores
      for real with `--no-owner --single-transaction`, and compares row counts with the
      `….dump.counts.json` that `npm run db:backup` now writes beside each dump (pruned with it). A
      failed `pg_dump` no longer leaves an empty dump behind for a rehearsal to pick. Live on
      Postgres 16: a real dump restored into a scratch database with every count matching; a
      tampered count reported "RESTORE INCOMPLETE — events: backed up 106, restored 101"; a dump
      with no counts said it was not compared; the live database was refused.
- [x] **NC-026 — every `SOURCES` entry carries `reviewedOn`**, taken from the commit that last
      wrote its licence judgement (2026-07-28 for most; Snapshot and DefiLlama 2026-07-29;
      `yahoo_prices` 2026-10-17). `check:commercial-mode` requires a valid, non-future date and
      lists commercial sources unreviewed for 180 days without failing the build.
- [x] **NC-035 — `licensedKey`'s rationale is corrected.** Its comment and the `COMMERCIAL_MODE`
      checklist entry said pages call the eight keyed adapters; since the scheduler cut-over
      nothing on the page or ingest path does. Both now say what the gate guards: future wiring.
- [x] **NC-073 — `docs/COVERAGE-MAP.md` is current:** the Internet Archive's 1780 company floor
      and relevance ranking, Ethereum's published-date fallback, ten years of prices (full history
      after a split), and the eight keyed aggregators marked as not ingested.
- [x] **NC-097 — `docs/OWNER-ACTIONS.md` is current:** the exploit-units row (fixed 2026-07-31)
      became the Etherscan V2 confirmation; the cost-report claim now matches what it reports;
      the Yahoo chart joins the licensing table; ads, affiliates and the missing disclosure and
      legal pages are noted; and a new section lists the one-time steps and open decisions from
      the October batches.
- [x] **NC-104 — README drift fixed:** the finality gate is described as shipped, the data-sources
      table lists every source on the ingest path (and why the keyed ones are not), and the
      Structure section says pages read the database with cached held-page reads.
- [x] **NC-105 — stale markers fixed:** the project-state paragraph no longer pins a migration
      count (24 today), and both 2026-07-30 proposals are marked SHIPPED with their commits.
- [x] **NC-046 — `check:ui` runs against a seeded database and server.** Done three times this
      week, and in full since NC-132: 141/148 on a production build at batches 3, 4 and 5, the
      seven failures being the stale prompt-search checks already flagged for the owner.

## NC ledger — batch 7: search choices, AI ranking, hardening (2026-10-17)

Four items closed and one advanced: a search that matches two subjects equally now asks instead
of guessing; a visitor's model can no longer hide events by failing; on-chain reads retry
politely and reach further back; the site has a written security review with baseline headers;
and the business decisions made elsewhere are summarised here. `npm run check` passes, `next
lint` reports no warnings, `next build` compiles, and `check:ui` is 141/148 — the same seven
stale prompt-search checks.

- [x] **NC-039 — a tied search offers a choice.** When the top two held subjects score within
      0.03 and the best is not an exact ticker, `/api/resolve` returns `choose` with each option,
      its ticker and how it matched, and the search box lists them. The no-script `/search` still
      lands on the best match. Logged under a new `ambiguous` rung (db/025) and described in
      `npm run search-report`. Live on a production build with a second "Ford" company: the box
      offered "Ford Motor Company · F" and "Ford Motor Credit Co", the choice cleared when the
      query changed, a click went to the chosen page, and `F` alone still went straight to Ford.
- [x] **NC-055 — on-chain reads retry with back-off and reach further.** `getJson` retries a 429,
      a 5xx or a dropped connection after 1 s and then 2 s, instead of once immediately. Pages are
      spaced 250 ms apart (Etherscan allows 5 calls a second). The stablecoin reader pages
      newest-first until it has enough material moves, up to Etherscan's 10-page ceiling, keeping
      what earlier pages read if a later one fails. `docs/COVERAGE-MAP.md` gained a rate-limit
      table.
- [x] **NC-090 — security review written** (`docs/audits/2026-10-17-security-review.md`). Fixed
      in it: baseline headers on every response (frame, base, plugin and form-action CSP, nosniff,
      referrer, permissions, HSTS); JSON-LD escapes `<`, `>` and `&`, so a stored `</script>` in
      an EDGAR, Wikipedia or Wikidata string cannot close the block; and the search query is
      capped at 200 characters before the fuzzy match runs, not only before logging. Left open
      and named: NC-164 (visitor keys versus ad scripts), NC-166 (the Next.js advisories) and host
      controls.
- [x] **NC-134 — business decisions summarised** in
      `docs/decisions/2026-09-28-business-decisions.md`, linked from `CLAUDE.md`: D3, D13, D21,
      D22, the affiliate stance and the working pricing plan. Each is labelled as the ledger's
      summary, not the record, which lives in Finance Now's repo and was not read from here.
      D22 is marked not yet applied here (NC-133). *(Applied 2026-10-19, batch 17.)*
- [ ] **NC-087 — advanced, not closed.** A junk or partial reply from a visitor's own model no
      longer hides its batch. Entries without a valid score are listed after the matches and
      counted in the panel, instead of being read as 0 and filtered out. Replies go through the
      same validator as the operator's scorer, headlines go in as a delimited block, and the 0.35
      cut-off is one constant (`RANK_CUTOFF`). `check:ai` covers junk, partial and out-of-range
      replies. **Still owed:** tuning ranking quality across subject types with a real key.

## NC ledger — batch 8: Next.js 16 (2026-10-17)

One item closed. The framework moves from Next.js 14.2.35 to 16.4.2, with React 19, which takes
the site off the 24 advisories `npm audit` rated critical. `npm run check` passes with a new suite
(`check:framework`), `npm run lint` (now ESLint 9) reports nothing, `next build` compiles, and
`check:ui` is 141/148 — the same seven stale prompt-search checks.

- [x] **NC-166 — upgraded to Next.js 16.4.2 and React 19.**
      - `npm audit --omit=dev` went from 4 findings (critical: `next`, with 24 advisories) to
        none. Next 15.5.28, the newest 15.x, was passed over: audit still flags the PostCSS it
        bundles (high).
      - Route params are Promises in Next 16. The company, topic, industry and group pages, their
        metadata and preview images, and the compare page's search params now await them.
      - `middleware.ts` is now `proxy.ts`, Next 16's name for it, on the Node runtime. It no
        longer reads `req.ip`, which Next 16 removed and self-hosted Next never filled in.
        Measured on both versions: when a request has no `X-Forwarded-For`, Next's own server
        fills it with the socket address, so a direct visitor is still counted by their own
        address.
      - `next lint` is gone. `npm run lint` runs ESLint 9 over the same folders with the same Next
        presets (`eslint.config.mjs`). Three rules new in eslint-plugin-react-hooks 7 are off, to
        keep the lint like-for-like; adopting them is the follow-up below.
      - `engines.node` is `>=20.9.0`, Next 16's floor. The build rewrote two tsconfig values
        (`jsx: react-jsx`, plus the dev types path).
      - `check:framework` fails 10 of its 14 checks on the old code. It covers the version floor;
        an exact pin that the lockfile and the installed copy match; React 19; `proxy.ts` present
        and `middleware.ts` gone; no route reading params without awaiting them; and no
        `next lint`.
      - Measured on production builds of both versions against the same database:
        - every route answers with the same status codes and redirects as before;
        - the security headers are on pages and API responses;
        - the 121st API request in a minute is refused, while another client and pages are not;
        - a held page is served from the 15-minute cache, and a miss is never cached;
        - the preview images render.
- [x] **NC-160 — closed by the owner's decision (2026-10-18, batch 13): keep the loading screen.**
      Miss pages already tell search engines not to index them. Company and topic misses still answer 200,
      for a browser and for Googlebot alike. Calling `notFound()` from `generateMetadata` was
      tried and reverted: it changed nothing. Sector misses now answer 404 (on 14.2 they answered
      200). The fix left is dropping the loading skeleton on those two routes, which is an owner
      decision.
- [x] `P2` **Follow-ups from the upgrade** — both done in batch 10 (2026-10-18), below.
      - Adopt the React Compiler lint rules (`react-hooks/set-state-in-effect`, `refs`,
        `static-components`). They flag 18 existing sites, chiefly code that reads
        `localStorage` after mount.
      - Two dev-only audit findings remain: Tailwind 3's file watcher (`chokidar` → `braces`)
        and the lint plugin's `fast-glob`. Clearing them means Tailwind 4, a breaking change of
        its own. Neither ships to visitors. ↳ Tailwind's half is cleared; the lint plugin's
        `braces` chain has no fixed release upstream yet.

## NC ledger — batch 9: live assertions, a ticker index that says its age (2026-10-17)

Tooling and upkeep, chosen because every outside source is refused from the cloud session, so
work that needs a live answer cannot be verified here. Two items closed (NC-037, NC-038), two
advanced (NC-051, NC-033), and a scheduled-refresh gap the scout found is fixed. `npm run check`
passes with a new suite (`check:live-harness`), and `npm run lint` reports nothing.

- [x] **NC-038 — a live-assertion suite: `npm run check:live`.** It stays out of the offline
      chain. Each keyless source the site may publish from is asked a question with a known
      answer, through the app's own adapter:
      - Apple's filings are recent and resolve to CIK 320193;
      - ten years of AAPL closes are ordered, positive and fresh;
      - every Snapshot space id resolves and holds proposals;
      - the Internet Archive reaches material from the last decade (the 2026-08-12 finding);
      - Library of Congress results stay before 1964;
      - the four halvings land on their dates;
      - every Ethereum milestone's chain date matches its curated date.

      Results are sorted into four outcomes:
      - PASS;
      - FAIL — it answered wrong;
      - UNREACHABLE — no connection, or a throttle;
      - SKIPPED — no key.

      Only FAIL fails a run; `--strict` fails anything but PASS, which is the bar for the
      production host. `check:live-harness` (32 checks, offline) proves the sorting and the
      assertions. It also fails when a commercial source in `SOURCES` has no live case, which is
      the shape of the 2026-08-12 finding that `check:feeds` never asked three gate sources.
      - Run here: 12 unreachable and 1 skipped (no Etherscan key); exit 0, and 1 with `--strict`.
        **The first answering run is owed from the production host** (OWNER-ACTIONS §1); an
        assertion may need tuning against a real answer then.
- [x] **NC-051 — the ticker index says its age, and was re-synced 2026-10-18.** The owner ran
      `npm run sync:tickers` from their machine (after batch 13 paced it): 10,443 companies,
      28,592 fund symbols, 19,540 named fund series, 0 registrants failed. Every offline check
      passes against the new file.
      - `tickerIndexAgeDays` and a 35-day limit live in `lib/sec.ts`.
      - `npm run refresh` warns past the limit. A live run printed "66 days old (synced
        2026-08-12)".
      - `check:live` fails EDGAR on it once sec.gov is shown to answer.
      - `check:tickers` pins the arithmetic and the wiring.
      - The index is imported at build time, so a server-side re-sync would change nothing
        until a rebuild. Re-syncing means `npm run sync:tickers` from a host that reaches
        sec.gov, then commit and redeploy (now in OWNER-ACTIONS). sec.gov answered a cloud
        session on 2026-09-28 but refuses this one.
- [x] **NC-037 — the first uncapped opportunity-scout pass.** It wrote
      [`docs/proposals/2026-10-17-proposals.md`](proposals/2026-10-17-proposals.md): 10
      proposals, ranked securities-first. Each is tied to one of the allowed anchors with
      file:line evidence and says whether a cloud session could build it. The top four, all `P1`:
      1. 8-K item labels, and 20-F/40-F typed as earnings;
      2. the material forms EDGAR already sends;
      3. "did you mean" from the committed index;
      4. Federal Register documents naming the company.

      Spot-checked against the code. **Next: the owner marks each proposal, then a session runs
      the scout in FILE mode.** ✅ Marked 2026-10-18: 1–8 approved and filed, 9 and 10 still
      pending; batch 11 built 1, 3 and 5. It noticed three things in passing:
      - **Fixed here:** `npm run refresh` selected only companies and topics, so a sector's
        Federal Register rules never refreshed after the CLI's first `--industry` run. Industries
        now refresh on the schedule, inside the source's one-day window. A sector is stamped as
        worked either way, because otherwise refresh's oldest-first order would keep it at the
        head of the queue. `check:wiring` pins all three (it fails on the old code). A run against
        Postgres showed skip-when-fresh, fetch-when-due and the stamp.
      - **Fixed here:** the checklist's on-screen disambiguation `P1` was still open, though NC-039
        shipped it in batch 7. The box is now ticked.
      - **Not fixed:** the company page's JSON-LD calls every security a `Corporation`, funds
        included. It's a structured-data nicety, left for a fund-page pass.
- [ ] **NC-033 — wording corrected; the live check is still owed.** The release-gate line said
      "URL dedup". The match is a normalised headline plus its day (`storyKey`), which is what
      lets two outlets' copies of one story collapse.

## NC ledger — batch 10: follow-ups from the Next.js upgrade (2026-10-18)

No ledger item closes here: these are the two `P2` follow-ups batch 8 left in this file. The
scout's ten proposals waited for the owner's marks (given 2026-10-18 — see batch 11), and nothing else open can be built and verified
from a cloud session that every outside source refuses. `npm run check` passes, `npm run lint`
reports nothing with the new rules on, `next build` compiles, and `check:ui` is 141/148 — the
same seven stale prompt-search checks.

- [x] **The React Compiler lint rules are on.** Batch 8 had switched off three rules new in
      eslint-plugin-react-hooks 7, which flagged 18 sites. Nine are restructured:
      - refs written during render — the timeline's zoom and stack override, and the price
        chart's select callback — now update in a layout effect, after render;
      - the price popup carries the chart width with its hover instead of reading a ref during
        render, which went stale after a resize;
      - the compare strip's row is a module-level component, no longer a new component type on
        every render;
      - the settings menu's and suggestion chips' "mounted" flags use `useHydrated`
        (`lib/useHydrated.ts`, on `useSyncExternalStore`);
      - the feed-keys form reads its keys on first render; it only renders inside the
        client-only settings dialog.

      The other nine restore browser-only state after mount on purpose, so the server and the
      first client render agree. Each says why on the line, and a new instance must do the
      same. `check:ui` 141/148 on that build.
- [x] **Tailwind 3 → 4, with nothing a reader can see changed.**
      - The official upgrade tool did the mechanical part: class renames, CSS-first
        configuration, `@tailwindcss/postcss`.
      - Then each v4 default that changes the page was put back to v3's value:
        - **colours** — v4's OKLCH palette renders accents more saturated, so v3's hex values
          are pinned for every family in use (`app/v3-palette.css`, generated from
          tailwindcss@3.4.19);
        - **fonts** — the body's Geist rule had always lost to `font-sans`, so pages render in
          the system stack; v4's layers would have flipped that, and v4.3 also changed the
          default stack;
        - **line heights** — fixed again, not ratios;
        - **gradients** — blended in sRGB;
        - **placeholder colour**, and the **pointer cursor** on buttons;
        - **two settings sections** carried an `mt-6` that v3's `space-y` had silently
          overridden, and v4 would have honoured.
      - Measured with full-page screenshots of nine pages at desktop and phone widths, plus the
        open settings dialog, against the v3 build: every one pixel-identical. The exceptions are
        the homepage's shuffled suggestion chips, which differ between two v3 runs too, and an
        "Xh ago" label the clock had moved.
      - `npm audit` went from 9 findings to 5. Tailwind's file-watcher chain is gone. The 5
        left are one chain under `eslint-config-next` (`fast-glob` → `micromatch` → `braces`),
        and every `braces` release is flagged with no fix yet. It is lint tooling only, and
        `--omit=dev` stays at 0.
- [ ] **Not done: funds in JSON-LD.** The company page calls every security a `Corporation`.
      Telling a fund from a company is not reliable from what is stored: the SEC files SPY and
      GLD as companies, while VOO appears only as a fund. Left for a fund-page pass, as batch 9
      said.

## NC ledger — batch 11: three of the scout's approved proposals (2026-10-18)

The owner marked the scout's proposals on 2026-10-18: 1–8 approved, 9 and 10 still pending. A
FILE pass put the eight approved ones into this checklist, each in the section its proposal named.
This batch builds three of them, all offline. One ledger item closes, by the owner's decision:
**NC-117**, deleting the old remote branches — the owner chose to keep them, so there is nothing
left to do. `npm run check` passes, `npm run lint` is clean, `next build` compiles, and `check:ui`
is 146/153 — the five new checks pass, and the seven failures are the same stale prompt-search
checks as before.

- [x] **Each 8-K is named by what it announces (proposal 1).** The title used to say "8-K
      filing" for everything but an earnings release.
      - A table of the SEC's 8-K item list (`lib/secForms.ts`), in order of how much each item
        tends to matter. The most important item reported names the filing: "Ford Motor Co:
        Officer or director change (8-K 5.02)". Item 9.01 (the exhibit list) never does. An
        8-K with only old, pre-2004 item numbers keeps "8-K filing" rather than a guess.
      - The line under the row now names each item and keeps the codes: "Items 5.02 Officer or
        director change · 9.01 Financial statements and exhibits".
      - 20-F and 40-F (a foreign company's annual report) are titled "Annual report (…)" and
        count as earnings, like a 10-K. 40-F filings are kept now; they were dropped before.
        6-K stays a plain filing, since nothing says which 6-Ks carry results.
      - Stored rows pick up the new titles and types on the next scheduled refresh.
      - New `check:sec-forms` (20 checks, 5 of them fail on the old code). The filing stack's
        form count still reads "8-K" from the new titles.
      - `check:live` gains two cases for the production host: Apple has an 8-K named by its
        item, and TSM's yearly 20-F counts as earnings. No live 40-F case yet — it needs a
        confirmed 40-F filer whose recent filings reach back to one, picked from a host that
        reaches EDGAR.
- [x] **"Did you mean" when a search finds nothing (proposal 3).**
      - Up to three near matches from the built-in list of about 26,500 company and fund names (one per security).
        No request and no database, so it works with both down. Offered, never followed: the
        no-JavaScript `/search` sends the visitor home rather than picking one for them.
      - Matched the same way the database matches names already held — Postgres's
        `word_similarity`, rebuilt in `lib/fuzzy.ts` and pinned to Postgres's own answers. "&"
        counts as "and". Two additions: every distinctive word typed must be in the name
        ("electric cars" no longer offers General Electric). And a company whose everyday name
        sits inside the query is offered when nothing else matched — "tesla motors" → Tesla, but
        "apple hospitalty" still → Apple Hospitality REIT, not Apple Inc.
      - Measured: "nvidea" → NVIDIA, "alibba" → Alibaba, "tesla motors" → Tesla. "Johnson and
        Johnson" and "Procter and Gamble" already reached JNJ and PG through the existing
        first-words rescue, so suggestions mostly catch typos and queries whose first words
        match nothing.
      - A name several funds share is offered as a choice too. "S&P 500" now offers RYSOX, SPFIX
        and QCEQRX (funds whose names start with it) instead of landing on S&P Global — the case
        NC-040 left open. SPY is not among them, because its name doesn't start "S&P 500"; an
        alias for it would be an owner call.
      - Speed: 1–20 ms for typical queries. The slowest seen is about 120 ms, for one common
        word like "fund" that appears in 18,000 names. A word typed many times over is counted
        once, so a padded query costs no more than the word.
      - Logged under a new `suggested` search rung (`db/026_suggested_rung.sql`), which
        `npm run search-report` explains.
      - Checks: 15 new in `check:tickers` (no request made), 7 in `check:search-log` (including
        the whole search run with the database down), 3 in `check:ui`.
- [x] **Company pages show the Wikipedia summary (proposal 5).** Company ingest already fetched
      it with the company's story and threw it away.
      - It is kept only when the article really is about the company (`companyLede`, on
        `articleAnswersSlug`).
      - Shown above the timeline with the same credited summary block topic pages use, and used
        as the company's structured-data `description`.
      - Often the first paragraph of "History of …", since the story prefers that article; the
        credit names the article it came from.
      - Real summaries were not looked at here, since Wikipedia is blocked from this container.
        The first refresh on the owner's host fills them in.
      - Checks: 7 in `check:wiring`, 2 in `check:ui`.
- [x] **NC-117 — closed by the owner's decision.** Asked whether to delete the 22 old remote
      branches, the owner said keep them.

## NC ledger — batch 12: sector standings, fund families, and a count to decide on topic links (2026-10-18)

Three more of the scout's approved proposals. Two are built; the third waits on a count only the
owner's database can give, so this batch builds the count and stops there, as its checklist entry
asks. No ledger item opens or closes. `npm run check` passes, `npm run lint` is clean, `next build`
compiles, and `check:ui` is 154/161 — the eight new checks pass, and the seven failures are the
same stale prompt-search checks as before.

- [x] **A company against its sector (proposal 6).** The code already measured every member's
      return over one shared window, then published only the member furthest from the median.
      - Company pages now say, for example: "F returned -6.2% from 2025-01-02 to 2026-07-24,
        against a median of +34.8% across the 3 members of Motor Vehicles & Passenger Car
        Bodies with prices over those dates — 41.0 points behind the median". Each peer links
        to `/compare` with this company.
      - Sector pages list every member against the median, not just the outlier.
      - Below three members with prices nothing is shown, the same rule the divergence signal
        already used, now one shared constant. The window (the signals' default 30 months) and
        the member count are stated with every figure.
      - Company pages also show their own signals panel (news-volume spikes) for that one
        ticker.
      - The demo data gains Tesla as a third car maker, so a comparison exists to test.
      - Checks: 12 in `check:signals`, 3 in `check:ui`.
- [x] **A fund's family (proposal 8).** A fund page lists the other funds its registrant files,
      from the built-in SEC list — VOO's trust files 11 more, VTI among them.
      - Funds the site already has are plain links, shown first. Ones it doesn't are dashed,
        marked as not on News Charts yet, and `nofollow`, so crawlers don't walk a whole trust
        into first-visit gathers.
      - Ten are shown, then "and N more"; iShares' trust has 533.
      - The registrant is named by its EDGAR number, linked to its SEC listing. The built-in list
        has no trust names to show instead.
      - The demo data gains VOO and VTI, two funds from one Vanguard trust.
      - Checks: 7 in `check:tickers` (no request made), 3 in `check:wiring`, 5 in `check:ui`.
- [x] **`check:ui` no longer stops at the notes test.** Its reload waited for the network to go
      quiet, and after a reload Chromium never reports the header links' background prefetches
      as finished, though the server answers them at once and clicking the links works. The wait
      ran out and the run stopped there, hiding every later check. That was batch 11's first-run
      failure, and it reproduces on the batch 10 build, so it is not new code. The reload now waits
      for the page to load; the test still checks that the note survives it.
- [ ] **Topic ↔ security links (proposal 7) — waiting on the owner's count.** Its checklist
      entry says to count, on the production database, how many stories link both a topic and a
      company before building any page UI. `npm run overlap-report` does that, read-only. It
      uses the same relevance bar the timeline uses, on both links, and lists a pair only at 2+
      shared stories. It was tried against a temporary shared story locally: correct count, and
      a below-bar link left out. The demo data has no shared stories, so locally it reports
      zero. Next step: the owner runs it and decides; the page strips follow if the numbers are
      worth it. Checks: 4 in `check:wiring`.

## NC ledger — batch 13: more SEC filing types, and a count for federal rules (2026-10-18)

The owner made four decisions on 2026-10-18:
- Keep all four groups of extra SEC filing types, and leave insider trades out.
- Count Federal Register documents naming a company before any reach company pages.
- Keep the loading screen on company and topic pages, which closes **NC-160**.
- Keep the old branches (recorded in batch 11).

`npm run check` passes, `npm run lint` is clean, `next build` compiles, and `check:ui` is 154/161:
no new browser checks this batch, and the seven failures are the same stale prompt-search checks.

- [x] **More of what EDGAR already sends (proposal 2).** The filter now also keeps:
      - **Corrections:** 10-K/A, 10-Q/A, 20-F/A, 40-F/A and 8-K/A, plus 10-K405, the annual report's
        form before 2002. An amended 8-K is named by its item, like an 8-K. One that amends a
        results release stays a filing, so a quarter isn't counted twice.
      - **Mergers and buyouts:** S-4, DEFM14A, SC TO-T, SC 14D9.
      - **Large stakes and offerings:** 13D and 13G under both their old (`SC 13D`) and current
        (`SCHEDULE 13D`) names, S-3 and 424B prospectuses.
      - **Exits:** 25, 25-NSE, 15-12B, 15-12G.

      Each gets a plain name, e.g. "Merger vote proxy (DEFM14A)", "Removed from an exchange
      (25-NSE)".
      - Insider-trade forms (3, 4, 5, 144) stay out.
      - **Prospectuses are grouped:** one row per form per day ("Prospectuses ×37 (424B2)"),
        linked to the company's EDGAR list for that day. A bank files dozens of structured-note
        supplements a day, and a row each would bury its page. The grouping happens after every
        block of the record is read, so a day split across two blocks is still one row.
      - The filing stack's form count now reads all the new names.
      - Not run: the live count of which forms the records really carry (needs sec.gov). In
        particular, whether EDGAR lists 13D/G filings under the company itself is unconfirmed;
        if it doesn't, those rows simply never arrive.
      - Checks: 10 more in `check:sec-forms` (8 fail on the old code).
- [x] **Federal rules naming a company — the count first (proposal 4).** `npm run
      fr-company-report` (for every held company, or `-- BA F AAPL`) prints, per company, how
      many Federal Register documents name it in their title, of how many full-text hits. It
      breaks them down by agency and year, shows how many are airworthiness directives, and lists
      the newest few titles. The match is the company's everyday name as a whole phrase, so
      "Ford Motor" doesn't pick up a Gerald R. Ford library notice. Read-only, and it needs a host
      that reaches www.federalregister.gov: from here it reports "could not ask". Nothing is
      ingested until the owner has read the numbers and set the rule. Checks: 6 in `check:wiring`.
- [x] **NC-160 — closed by the owner's decision.** Company and topic misses keep answering 200
      behind the loading screen. They already carry a noindex tag.
- [x] **The owner's live runs, 2026-10-18 (from their machine, after this batch was opened).**
      - `npm run overlap-report`: 0 of 22 topics share a single story with a held company. The
        owner shelved the topic ↔ stock strips (proposal 7); the count stays, to re-run later.
      - `npm run fr-company-report`: Boeing 596 title-naming documents, 539 of them airworthiness
        directives (about 100 a year); GE 248, 190 of them directives. Ford 32 and GM 51 are
        mostly NHTSA petitions; GM also has a 2025 FTC consent order. Intel 13 is mostly
        trade-zone notices. Apple's 34 are mostly fruit ("Light Brown Apple Moth", "Apple
        Juice"), and GE's count includes "Portland General Electric". **The owner chose: build
        it, without airworthiness directives, after tightening the match** — next batch.
      - `npm run check:live`: 10 pass. The new SEC assertions from batch 11 — Apple's 8-Ks
        named by item, TSM's 20-F typed earnings — passed. The one FAIL is the ticker index's
        age, GDELT was unreachable (its usual throttle), and Etherscan was skipped (no key).
- [x] **`npm run sync:tickers` paces itself.** Run on the owner's machine, it went past the SEC's
      10 requests a second. Six workers with no ceiling on how fast they start, on a fast
      connection, did that. The SEC refused the client, and the one retry two seconds later met
      the same block: 889 of 1,159 registrants failed. The script refused to overwrite the index,
      as designed. Now (`lib/pace.ts`):
      - requests start at most 4 a second;
      - a 429 pauses every worker for 30 seconds, doubling up to 10 minutes;
      - up to 5 retries per registrant.
      Checks: 3 in `check:tickers`.
- [x] **The owner's August unit check, kept.** An unsaved local edit from 2026-08-05 had a live
      check that DefiLlama hack amounts are plain USD. The fix itself reached the project on
      2026-07-31 by another route; the live check had not. `check:live`'s DefiLlama case now
      pins the unit on the Ronin Bridge (about 624,000,000). Checks: 3 in `check:live-harness`.
- [x] **NC-051 — the ticker index re-synced (closes it).** The owner reran the paced sync:
      0 failures, and the new `data/edgar-tickers.json` (dated 2026-10-18) is on this branch.

## NC ledger — batch 14: federal documents that name the company, on its page (2026-10-18)

Built the way the owner chose after reading batch 13's counts: Federal Register documents whose
title names the company go on its page, airworthiness directives never do, and the name match is
stricter first. No ledger item closes; this is proposal 4 from the 2026-10-17 scout run.

`npm run check` passes, `npm run lint` is clean, `next build` compiles, and `check:ui` is
154/161: no new browser checks this batch, and the seven failures are the same stale prompt-search
checks. The live Ford case below can't run from this cloud session (www.federalregister.gov
doesn't answer here); **the owner ran `npm run check:live` on their machine the same day: 13 pass,
0 fail, 0 unreachable, 1 skipped** (Etherscan, no key). The new Ford case passed, and so did
EDGAR's, which includes the ticker index's age check that failed in batch 13.

- [x] **The company feed (`lib/frCompany.ts` `fetchCompanyRegulations`).** `npm run ingest --
      --ticker F` now also asks the Federal Register for the company's everyday name as a whole
      phrase, from 2015. It keeps a document only when its **title** names the company, drops
      every airworthiness directive, and stores at most 40 a run (newest first). Each row has
      the same identity as the sector feed's (`fr:<document number>`), so a document both feeds
      find is one stored event linked to both. Checks: 5 in `check:wiring` — 4 against a mocked
      answer, 1 that company ingest calls it.
- [x] **A stricter name match.** Batch 13's count showed two kinds of false hits:
      - **A one-word name** ("Apple") now needs a company word within three words after it —
        Inc., Corp., Company, LLC, Holdings and the like. "Apple Inc.; Analysis of Proposed
        Consent Order" counts; "Light Brown Apple Moth" and "Apple Juice" don't.
      - **A longer listed name owns the mention.** If the title holds a longer company name from
        the committed EDGAR index that contains this one, the document is the other company's:
        "Portland General Electric" isn't GE's.
      - Checks: 3 in `check:wiring`.
- [x] **Scored without the model.** A regulation on a *company* whose title names it scores 0.95
      in the free tier (`lib/enrich/relevance.ts`); the title is the evidence. A sector's
      keyword rule is still left for the model, as `README.md` explains. Checks: 3 in
      `check:relevance` (2 fail on the old code).
- [x] **Listed once on the company page.** The page merges the company's own events with its
      sector's, which name the same stored row differently (`db-<id>` and `sector-<id>`).
      `lib/eventMerge.ts` drops the sector copy of a row the company already holds; the cached
      page's key moved to v4 so no old merge is served. Checks: 2 in `check:wiring`.
- [x] **Fixed on the way: EDGAR's state tags in company names.** `commonName` left "WELLS FARGO &
      COMPANY/MN" as "WELLS FARGO & COMPANY/MN" and "BANK OF AMERICA CORP /DE/" whole, so their
      phrase searches found nothing. It now drops the `/MN`, `/DE/`, `/NEW` tag and a trailing
      "&" before the legal suffix. The same name feeds every news query and alias at ingest, so
      those companies' news searches improve too. Checks: 6 in `check:recall`, 4 failing on the
      old code ("AT&T" and "Johnson & Johnson" were already right and must stay so).
- [x] **A live case.** `check:live` asks for Ford's documents and fails if any title doesn't name
      Ford, any is an airworthiness directive, any predates 2015, the run exceeds 40, or fewer
      than 3 come back (Ford petitions NHTSA several times a year). Its rules have 5 offline
      checks in `check:live-harness`.
- [x] `README.md` and `docs/COVERAGE-MAP.md` now say company pages carry the documents that name
      the company.

## NC ledger — batch 15: companies' old names (2026-10-19)

The owner merged batch 14 and chose proposal 9 next, with renames on the splits-and-dividends
chip, renamed "Corporate actions". No ledger item closes; this is a checklist item.

`npm run check` passes, `npm run lint` is clean, `next build` compiles, and `check:ui` is 155/162:
one new browser check, passing, and the seven failures are the same stale prompt-search checks.
**Not yet done:** pinning the fixture from a real EDGAR record — data.sec.gov doesn't answer from
this cloud session.

- [x] **Renames on the timeline (`lib/sec.ts` `renamesFrom`, `renameEvents`).** EDGAR's company
      record lists every name a filer has used and the day it stopped. The filings reader already
      downloads that record and now reads the field too, so it costs no request:
      - each old name is paired with the one that replaced it, oldest first;
      - a change of case, punctuation, legal suffix or state tag is not a rename ("APPLE INC" →
        "Apple Inc.");
      - an entry with no date, or a date in the future, is dropped;
      - a fund doesn't inherit its trust's old names.

      A rename is a corporate action, e.g. "Renamed from FACEBOOK INC to Meta Platforms, Inc.",
      linked to the company's EDGAR page. It reaches the first pass too.
- [x] **Old names as search aliases.** Company ingest stores each old everyday name ("facebook")
      as an alias. Checked against the local database: "facebook", "Facebook" and "FACEBOOK" all
      find a held Meta by alias, score 1.00.
- [x] **The chip and legend.** The company page's "Splits & dividends" filter is now "Corporate
      actions", and the chart legend says "Corporate action".
      - **Fixed on the way, from batch 14:** the filter "Sector rules" and the legend's "Sector
        rule" now say "Regulation". Company pages carry federal documents naming the company
        itself since batch 14, so "sector" was no longer true.
- [x] **A topic address that finds a company goes to the company page.** Found while checking the
      aliases: `/topic/f` drew Ford's timeline in a topic layout, with no price chart or filings,
      because the topic loader takes any subject by slug or alias. An old name stored as an alias
      would have done the same for `/topic/facebook`. The topic page now redirects to
      `/company/<ticker>`, and `/compare` no longer takes that placeholder as a topic. The redirect
      reaches the browser inside the page (a meta refresh and Next's client redirect), like the
      site's other alias redirects, because the loading screen has already started the response.
      The held-topic cache key moved to v2. Checks: 1 in `check:ui`.
- [x] **`npm run former-names-report`** (`-- META AAPL XYZ` by default) prints what the record says
      and the block to pin as the fixture. Read-only; needs data.sec.gov.
- [x] **Pin the fixture from a real record.** `scripts/fixtures/sec-former-names.json` is written
      from knowledge of the SEC API, and `check:sec-forms` says so while it is. The owner runs the
      report and the printed block replaces it. *Done 2026-10-20 (batch 21), from the cloud
      session once its network allowed data.sec.gov — and the real record found a bug the guessed
      one could not; see batch 21.*
- Checks: 12 in `check:sec-forms` (they crash on the old code). `check:ondemand`'s text check for
  the deep filings call now reads the intent, so an added argument doesn't break it. `check:ui`'s
  legend check now looks for "Corporate action".

## NC ledger — batch 16: keys kept from ad scripts, crypto moves, six feeds dropped (2026-10-19)

The owner made three calls on 2026-10-19:
- A browser holding a visitor's key loads no ads at all, which closes **NC-164**. The other design
  offered was isolating the keys on a second origin.
- Build proposal 10.
- Drop the six non-commercial news aggregators at launch, which closes **NC-013–NC-018**, and
  **NC-064** with them.

Batch 15's PR is still open, waiting on the owner's EDGAR report, so this batch rides the same
branch and PR.

`npm run check` passes, `npm run lint` is clean, `next build` compiles, and `check:ui` is 157/164:
two new browser checks, both passing; no console errors under the new CSP; and the seven failures
are the same stale prompt-search checks.

- [x] **NC-164 — no ads in a browser holding a key.** An ad script on our origin could read the
      AI, NYT and Guardian keys in localStorage. Now:
      - `lib/adGate.ts` is the one gate. It answers no when either feature holds a key, when a
        stored entry won't parse, when "reload without ads" was used in this tab, or when storage
        can't be read. A local model with no key doesn't count as a key.
      - `components/AdScript.tsx` is the only ad loader. It does nothing until
        `NEXT_PUBLIC_AD_SCRIPT_URL` names a network (none is chosen, NC-121), and it injects after
        load, because only the browser can see whether a key is stored.
      - A key typed beside a running ad script could be read as it is typed, so on such a page
        both key forms are replaced by a "Reload without ads" button. It turns ads off for the
        tab before the key is entered.
      - **The CSP now limits scripts** to this site and the configured ad loader; development
        also allows eval. Connections stay open, because a visitor's own model endpoint can be
        any host.
      - The settings copy says a browser holding a key loads no ads, and `docs/OWNER-ACTIONS.md`
        says how to add a network.
      - Checks: 12 in `check:abuse` (the old "CSP leaves scripts alone" check is replaced). On the
        old code, three fail and the gate's tests can't load.
- [x] **Biggest moves on priced topic pages (proposal 10).** BTC and ETH now show the panel below
      their chart. The seeded halving-day move is paired with the halving. Checks: 2 in `check:ui`.
- [x] **The six aggregators — dropped at launch (owner's decision).** Newsdata, GNews, Currents,
      Marketaux, EODHD and Finnhub are ticked in the pre-release feed gate. None was on the ingest
      path and `COMMERCIAL_MODE` already refused them; their keys stay out of production. NYT,
      the Guardian and Yahoo remain open there.

## NC ledger — batch 17: the launch rule, accessibility, two cleanups (2026-10-19)

The owner made four calls on 2026-10-19:
- D22 covers News Charts. The site is commercial from its first outside visitor, which closes
  **NC-133**.
- Delete the unused Wayback snapshot reader, which closes **NC-043**.
- Keep the search log as it is, which closes **NC-042**.
- Aim for WCAG 2.2 AA, which closes **NC-137**.

This batch rides the same branch and PR as 15 and 16.

`npm run check` passes, `npm run lint` is clean, `next build` compiles, and `check:ui` is 168/175:
eleven new accessibility scans, all passing; no console errors; and the seven failures are the
same stale prompt-search checks.

- [x] **The launch rule (NC-133).** `COMMERCIAL_MODE`, the feed gate and the launch set now trip at
      the first page load by anyone other than the owner — a private preview included — instead of
      "the day anything earns money". Rewritten in `CLAUDE.md`, the feed gate and its
      `COMMERCIAL_MODE` `P0` above, `docs/OWNER-ACTIONS.md`, `README.md` (the step now comes
      first), the business-decisions summary and two code comments. Turning the flag on in an
      environment others can reach is still **NC-022**, the owner's.
- [x] **The unused snapshot reader is gone (NC-043).** `fetchSiteSnapshots` and its
      `check:archive` cases are deleted. The "this site on that date" link on events needs no
      lookup and is unaffected.
- [x] **Search-log policy confirmed (NC-042).** Raw query text, nothing else, 90 days — recorded on
      the search-log entry, for the privacy policy to repeat.
- [x] **WCAG 2.2 AA: an automatic scan, and every page brought to zero findings (NC-137).**
      `check:ui` now runs axe-core (a new dev dependency; it was already installed through the
      linter) on ten page types and the open settings dialog. The first scan failed every page:
      - **Muted text was too faint.** Slate-500 measured 3.75–4.24 against the backgrounds it
        sits on; the standard asks 4.5. It is now `#8392a8` (≥ 4.6 everywhere, still darker than
        slate-400), set once in `app/v3-palette.css` because 104 of its 110 uses are text.
        Slate-600 and slate-700 are no longer used for text (2.5 and 1.85); their 29 text uses,
        and five placeholders, moved to slate-500.
      - **White on the blue buttons was 4.09.** The three solid buttons are sky-700 now (5.9),
        hovering darker rather than lighter. A faded count in the topic filter chips is less
        faded.
      - **The compare strip's dots were unnamed 10px links.** Every dot's event is a full-size
        link in the list below, which is 2.5.8's "equivalent control" exception, so the strip is
        hidden from keyboard and screen readers and still works with a mouse. The scan skips it
        for that reason.
      - Checks: 11 in `check:ui`, all failing on the old code.
- [ ] **A manual keyboard and screen-reader pass.** axe measures what it can — contrast, names,
      roles, target sizes — and a clean scan is the floor, not conformance. The price chart and
      the horizontal timeline are the parts least likely to work by keyboard alone; walk them
      with a keyboard and a screen reader (NVDA on Windows is free) and file what fails.
      - ✅ **The keyboard half was done in batch 18** — see that section. Still open: **the
        screen-reader half**, which needs a person listening (the owner, with NVDA).

## NC ledger — batch 18: a keyboard pass, and draft legal pages (2026-10-20)

The owner chose these two while batch 15 waits on the EDGAR report; same branch and PR.

`npm run check` passes (34 suites, with the new `check:legal`), `npm run lint` is clean, `next
build` compiles, and `check:ui` is 179/186: eleven new browser checks and three more pages in the
WCAG scan, all passing; no console errors; and the seven failures are the same stale prompt-search
checks.

- [x] **The site walked by keyboard alone.** Most of it already worked: the header, filters,
      timeline cards, grouped stacks (they open on focus), biggest-moves cards, date buttons and
      list headings are all reachable, with visible focus. Three things were not:
      - **The settings dialog** opened with focus left on the button behind it, and Escape
        dropped focus to the top of the page. Focus now moves into the dialog, Tab and Shift+Tab
        stay inside it, and closing hands focus back to whatever opened it.
      - **The horizontal timeline's scroll area** took focus with its outline switched off. It
        now shows a ring for keyboard focus (not for a mouse drag), and says the arrow keys
        scroll it.
      - **The price chart** is a canvas, which a screen reader can't read. A hidden line before
        it now says what it is — its date range and how many events are marked — and points to
        the list below, which holds the same events. (Labelling the container as an image was
        tried first; the scan caught that it would hide the chart library's attribution link.)
      - Checks: 5 in `check:ui`. The probe on the old build showed all three failures.
- [x] **Draft Terms, Privacy and Not-investment-advice pages (NC-124 — drafted, not closed).**
      `/legal/terms`, `/legal/privacy` and `/legal/disclaimer`, linked from every page's footer.
      - They are written from what the code does: no accounts and no cookies of our own;
        searches kept 200 characters long for 90 days with nothing that identifies anyone;
        page requests kept 90 days; IP addresses counted in memory for rate limiting only;
        settings, follows, notes and keys kept in the browser; keys sent straight to their
        provider; no ads in a browser holding a key; publisher images loaded from the
        publisher; not directed at children; US-only.
      - **Each page says it is a draft** and asks search engines not to index it while
        `LEGAL_DRAFT` (`lib/legal.ts`) is true. Placeholders in brackets are the owner's: the
        operator's name (no entity yet, D13), a contact address, the governing law, the host's
        log retention, the ad network and consent (NC-125), and a liability cap.
      - **`npm run check:legal`** keeps the privacy page honest. Its numbers are imported from
        the code that enforces them — the search-log retention is now one named constant used
        by the purge, the page and the report script. The check fails if the code stores a
        browser key the page doesn't list, or the page lists one nothing writes. Checks: 13 in
        `check:legal` (they cannot run on the old code, which had no pages), and 3 in `check:ui`
        plus the three pages added to the WCAG scan.
      - **Still the owner's:** fill the placeholders, have a lawyer read all three, then set
        `LEGAL_DRAFT` to false. The "How we make money" disclosure stays its own item.
- [x] The footer's source line now says the Federal Register supplies federal rules and notices,
      not only sector rules (batch 14 made company pages carry them).

## NC ledger — batch 32: Justice Department releases on company pages (2026-10-22)

The owner chose this next, approving the second candidate on batch 29's shortlist: the Justice
Department's press releases, 2009 on, in which a listed company is a party. Unlike vehicle
recalls they reach companies in every industry. Batch 31's pull request was still open, so this
batch joins it.

`npm run check` passes (38 suites) and `npm run lint` is clean. `next build` compiles. `check:ui`
is 203/203 on a production build against the demo database, re-seeded with Ford's release. (A
first run failed one check, the explore page, because that page is built ahead of time and the
build had been pointed at the development database; rebuilt against the demo one, all pass.)
`check:live` is 18 pass, 0 fail, 2 unreachable (GDELT and Wikipedia refusing this session), 1 skipped
(needs an Etherscan key); the new Justice Department case passes live. HawkScan could not run: `HAWK_API_KEY` is not set.

- [x] **A company's page carries the releases in which it is a party** (`lib/doj.ts`). They are
      read from justice.gov's keyless JSON API under the company's own names, kept only when the
      title makes the company a party, one a day, as regulation events scored without the model.
      Public domain by the Department's policy page ("Unless otherwise indicated, information on
      Department of Justice websites is in the public domain…"); only the title, date, teaser and
      link are used. Registered as source 23 (`doj_press`), read daily, credited in the footer,
      the terms page, the README and the coverage map.
- [x] **The name rule is stricter than the Federal Register's.** The API matches a name anywhere
      in a title, even inside a word ("Intel" in "Intelligence", "Cisco" in "San Francisco").
      Of the 912 titles naming 41 large companies as whole words, most were about someone else:
      a former employee, a bank robbery, a crime committed on Facebook, an Apple Valley resident.
      A release is kept when its title makes the company:
      - the subject of the verb — it pays, pleads, settles, is charged ("Boeing Pays $18
        Million…", "Drug Maker Pfizer Agrees…", "Wyeth and Pfizer Agree…");
      - the object of an action — a suit against it, a settlement with it, "U.S. v."
        ("Department of Justice Files Nationwide Lawsuit Against Walmart Inc.");
      - or the owner of a deal ("Justice Department Sues to Block UnitedHealth Group's
        Acquisition of Change Healthcare").
      - A title opening with "Former", or naming the company after "who", is about a person. A
        one-word name counts only where a clause starts. A longer listed company's name owns the
        mention, as in the Federal Register rule.
- [x] **Measured.** On the 41 companies the rule was written against: 188 titles kept, 142
      events (one a day) for 34 of them, 71 before 2017. Then on 40 companies not used to write
      it: 53 events for 24 of them, 22 before 2017. That second test found two holes, both fixed:
      "Visa" kept immigration cases ("Israeli National in U.S. on Work VISA Sentenced") and "3M"
      kept dollar amounts ("$5.3M to Settle"). After the fixes, every release either set keeps is
      about the company.
      - Live, the adapter gives Boeing 6 (2009-08-13 to 2023-09-28, the 737 MAX charge among
        them), Visa 5, Ford 1 and Meta 5 (found under "Facebook" too). A real
        `npm run ingest -- --ticker AAPL` stored Apple's 3, each scored 0.95 without the model.
- [x] **One story, one event.** The national office and U.S. Attorneys' offices often post the
      same release; McKesson's 2017 settlement went up eight times. The national office's copy
      wins. A release is identified by its own id, not its address, because the Department moves
      a past administration's releases to an archive address.
- [ ] **Open — what the rule misses:** the Spanish copy of a release (the English one is kept);
      joint ventures ("Chevron Phillips Chemical", "General Electric Hitachi"); a subsidiary named
      without its parent ("Merck Sharp & Dohme"); and companies whose releases use a short name the
      app does not hold, "PNC" or "AIG", since only a company's own names are searched. A common
      word ("Target") is read only to its newest 500 titles.
- [x] The shortlist note marks the Justice Department `APPROVED`. FDA enforcement reports and
      CPSC product recalls still wait there.
- Checks: new `check:doj` (37), on real releases read from justice.gov
  (`scripts/fixtures/doj-releases.json`): parties and passers-by from both sets, McKesson's eight
  copies, the paging, a refusal and a failure. It cannot run on main's code (`lib/doj.ts` does not
  exist). `check:ui` gains 4 (Ford's release on its page, credited, linked, under the Regulation
  chip), and `check:live` a Justice Department case (Boeing, and Visa without visa fraud).

## NC ledger — batch 31: the vehicle makers listed companies bought (2026-10-22)

The owner said to continue. Batch 30 left one item open: makers a mapped company bought, whose
purchase dates needed checking before their recalls could be dated. Every date below comes from
the buyer's own SEC filing, read through EDGAR's full-text search, not from memory. The first one
checked would have been wrong: K.Z. closed on 2014-05-01, not in 2016.

`npm run check` passes (37 suites) and `npm run lint` is clean. `next build` compiles. `check:ui` was
not re-run: no file the site loads changed (`lib/recalls.ts` serves ingest, the demo seed and the
checks only). `check:live` is 17 pass, 0 fail, 2 unreachable, 1 skipped, its NHTSA case passing.
HawkScan could not run: `HAWK_API_KEY` is not set.

- [x] **Nine makers added, each from its closing date:**
      - Thor: Dutchmen from May 1991 (its 1995 10-K: "In May, 1991, the Company acquired the
        business and assets of Dutchmen"), Keystone RV from 2001-11-09, Heartland from 2010-09-16,
        K.Z. from 2014-05-01, Jayco from 2016-06-30, Starcraft RV with Jayco (a Jayco company in
        Thor's 2016 10-K), and Tiffin from 2020-12-18.
      - Winnebago: Grand Design from 2016-11-08.
      - Berkshire Hathaway: Forest River from 2005-08-31 (its 10-Q: "On August 31, 2005, Berkshire
        acquired 100% of Forest River, Inc."). A new company on the map, so 20 now.
      - Each `why` names the filing that gives its date, and `check:vehicle-recalls` requires it.
- [x] **Measured live:** recalls of 10,000 vehicles or more go from 2 to 29 for Thor, from 8 to 16
      for Winnebago and from 0 to 9 for Berkshire Hathaway. A real `npm run ingest -- --ticker THO`
      stored the 29, from 2003-11-12, all scored 1 without the model.
      - Recalls from before a purchase stay off: Jayco's 226,560-vehicle door-lock recall of
        2013-11-22, K.Z.'s of 2013-10-17, Tiffin's of 2017-12-22.
- [x] **Looked at and left out, because nothing would change:** none of these has a recall of
      10,000 vehicles or more since its buyer bought it. REV Group's brands (E-One, Collins Bus,
      Kovatch and the others), Oshkosh's Pierce, Newmar (Winnebago bought it in 2019; its large
      recalls are from 2007 and 2017), and Meritor (all its large recalls are from before Cummins
      bought it in 2022). Shyft Group stays out until its pre-1975 records can be separated.
- [ ] **Open:** smaller brand names inside the mapped companies (Highland Ridge, Entegra Coach,
      DRV Suites, Livin' Lite, CrossRoads, Cruiser RV) need their own dates before they can count.
      Brands a mapped company *sold* (Ford's Volvo, Jaguar and Land Rover; GM's Saab) are not
      mapped either: whether a former subsidiary's recalls belong on the seller's page is a
      question the rule does not settle.
- Checks: `check:vehicle-recalls` 35 → 39, with real rows from both sides of Jayco's, K.Z.'s and
  Tiffin's purchase dates, Keystone's 1.2-million-vehicle recall of 2017, Forest River's and
  Grand Design's. Against main's code the first three new cases fail, and the fourth stops the
  suite (Berkshire Hathaway is not on the map).

## NC ledger — batch 30: vehicle recalls on carmakers' pages (2026-10-22)

The owner chose this next, approving the first candidate on batch 29's shortlist (NC-095): the
safety recalls a carmaker filed with NHTSA, back to 1966. It is the one free source found that
reaches into the 1963–2017 stretch and may be used commercially, though for one industry only.

`npm run check` passes (37 suites) and `npm run lint` is clean. `next build` compiles. `check:ui` is
199/199 on a production build, run against a fresh demo database: the real Ford ingest below had
replaced the demo Ford the browser checks are written against. `check:live` is 17 pass, 0 fail,
2 unreachable (GDELT and Wikipedia refusing this session), 1 skipped (needs an Etherscan key); the
new NHTSA case passes live. HawkScan could not run: `HAWK_API_KEY` is not set.

- [x] **A carmaker's page carries its recalls** (`lib/recalls.ts`). They are read from the
      Transportation Department's open-data copy of NHTSA's recall database: one request per
      company, no key, public domain ("Public Domain U.S. Government" in the dataset's own licence
      field). Each recall is its own event kind, `recall` (`db/028_recall_kind.sql`), with a
      yellow "Recall" badge, a Recalls chip that is on by default and a yellow "R" arrow on the
      chart. The chip shows only on a company that has recalls.
      - Only recalls of **10,000 vehicles or more** are kept. Measured: Ford has 1,754 recalls and
        861 at that size, GM 1,724 and 756, Honda 478 and 247. At 100,000 a smaller maker would
        show almost nothing (Winnebago, Blue Bird and Polaris none at all).
      - Titles read as "Recall of 1,100,000 vehicles: Fuel tank strap corrosion". The subject line
        is tidied by era. The 1960s rows carry NHTSA's part code ("BRAKES:HYDRAULIC:POWER
        ASSIST:BOOSTER" → "Brakes: hydraulic, power assist, booster"), and a code cut at 50
        characters gives way to the part's plain name ("Seat belts"). The middle years are in
        capitals and open with the maker's own name ("FORD/FUEL TANK CRACKS" → "Fuel tank
        cracks"), while safety-standard numbers and acronyms keep their capitals ("FMVSS 301",
        "ABS"). Recent subject lines are left as written, with the summary.
      - Each recall links to NHTSA's page for it and is one event however often it is read (its
        campaign number). It is scored without the model, as a filing is.
- [x] **The map from makers to listed companies is written by hand** (`RECALL_MAKERS`, 19
      companies). The dataset names a maker, never a listed company, and files every recall under
      the maker's *current* name. So "Chrysler (FCA US, LLC)" carries Chrysler's recalls back to
      1966, and "General Motors, LLC" old GM's.
      - It follows the rule news names follow: a company's own history and a predecessor whose
        ticker it carries count, and an acquisition's past never does. GM keeps old GM's recalls
        (it carries old GM's ticker). Chrysler and Maserati count for Stellantis only from
        2014-10-12, when FCA N.V., today's Stellantis N.V., became their parent. Indian counts for
        Polaris from its 2011 purchase.
      - Every recall is checked against the map again after it arrives, so the rule holds whatever
        the dataset answers.
      - Mapped: Ford, GM, Stellantis, Toyota, Honda, Tesla, Harley-Davidson, LiveWire, PACCAR (with
        Peterbilt), Polaris (with Indian), Goodyear, Winnebago, Blue Bird, Ferrari, Cummins, Thor
        (Thor Motor Coach and Airstream), Wabash, Rivian and Lucid.
- [x] **Measured live** on 2026-10-22: Ford 861 recalls from 1966-10-06, GM 756 from 1966-01-19,
      Stellantis 269 from 2014-10-14, Polaris 14, Winnebago 8. A real `npm run ingest -- --ticker
      F` stored Ford's 861, all scored 1 without the model. Apple's ingest made no recall request.
      Ford's cached page entry came to 1.09 MB with them, inside Next's 2 MB limit (audit
      2026-10-21 #4).
- [x] **Open — not mapped yet:** makers bought by a mapped company whose purchase date needs
      checking before their recalls can be dated: Thor's Keystone, Jayco, Heartland and Tiffin;
      Winnebago's Grand Design and Newmar; Oshkosh's Pierce; REV Group's brands. Also Shyft Group:
      its records start in 1973, two years before Spartan Motors was founded, so they mix in a
      company it bought. Carmakers with no SEC listing (Volkswagen, BMW, Mercedes-Benz, Nissan,
      Hyundai) have no page to carry theirs. ✅ **Done in batch 31 (above)** for every maker with a
      large recall since its purchase, each dated from the buyer's own filing; the rest are left
      out there with the reason, and Shyft Group stays out.
- Checks: `check:vehicle-recalls` 35 (new, in the chain, so 37 suites), `check:ui` +4, `check:live`
  +1, and the new kind in `check:relevance`'s list.
  - Real rows from the dataset (`scripts/fixtures/nhtsa-recalls.json`) for every era of subject
    line, both sides of Stellantis's boundary (a Chrysler recall four days before it is refused),
    a recall under the floor, another maker's recall, a tyre and an equipment recall.
  - The map against the committed EDGAR index, one request per company, the dataset's errors
    reported as errors, and the registration, scoring, chip, migration and credits.
  - Against main's code the new suite cannot run at all (`lib/recalls.ts` does not exist), and
    the new `check:ui` cases skip, saying why: there is no Recalls chip.
  - The demo seed carries two real Ford recalls through the same parser, so `check:ui` sees the
    chip without a network. `check:macro`'s schema check no longer assumes `macro` is the last
    kind.

## NC ledger — batch 29: a new news source, researched and measured (2026-10-22)

The owner chose this next (NC-095): find a free news source, test what it returns for a few
companies, and report its licence before building. The full note, with every measurement and
licence quote, is [`docs/proposals/2026-10-22-news-sources.md`](proposals/2026-10-22-news-sources.md).
Nothing was built, so no check changed; `npm run check` passes (36 suites).

- [x] **No free news-article archive for 1963–2017 clears the commercial bar.** That stretch is
      the corpus's biggest hole (`docs/COVERAGE-MAP.md`), and the archives that cover it (NYT, the
      Guardian) are non-commercial on their free tiers. Every candidate found is a primary record —
      a government release or a recall notice — dated, naming the company, and public domain.
- [x] **Shortlist, measured live on 2026-10-22:**
      1. **NHTSA vehicle recalls, 1966 on** (public domain; two files, 22 MB, no key). Recall
         campaigns from 1966 to 2016: Ford 1,118, GM 1,428, Stellantis's predecessors 1,115, Honda
         303, Toyota 267. Ford has 402 campaigns of 100,000 vehicles or more. The only candidate
         that fills the hole, though for one sector. Recommended first.
      2. **Justice Department press releases, 2009 on** (public domain by its own policy page;
         keyless API). Titles naming Wells Fargo 68, Boeing 29, Exxon 18, Pfizer 12, Goldman
         Sachs 12. Every sector, but only the end of the hole, and a title match takes namesakes
         ("Apple Tree Children's Center").
      3. **FDA enforcement reports, mid-2012 on** (CC0; keyless API). Medtronic 1,270 device-recall
         records, Abbott 434 across drug, device and food, Pfizer 161. Depth for health and food
         companies, not the hole.
      4. **CPSC product recalls, 1973 on** (public domain; keyless). Tens per company as the maker:
         Polaris 104, Mattel 33, Stanley Black & Decker 30.
- [x] **Not new sources:** the press release inside each 8-K would give the 8-Ks already on the
      timeline a real headline. About half carry one, but picking the headline out is unreliable.
      Wikipedia's daily "Current events" pages could not be tested: Wikipedia refused this session.
- [x] **Not shortlisted:** SEC enforcement releases (the search ignores its term; the latest page
      named only individuals and small firms) and GDELT's television archive (caption terms not
      found; GDELT refuses this session).
- [x] **Open — the owner's pick:** mark each candidate in the note `APPROVED`, `REJECTED` or
      `DEFERRED`. NC-095 stays open until then. Building the first approved one is its own batch,
      with the usual checks: an adapter, a `SOURCES` entry with its licence, and a checked map from
      each source's company names to listed companies. ✅ **Settled 2026-10-22:** the owner picked
      NHTSA vehicle recalls, built in batch 30 (above), which closes NC-095. The second, Justice
      Department releases, was approved and built in batch 32; the other two wait in the note.

## NC ledger — batch 28: the names audit, fixed (2026-10-22)

The owner chose this next: a code health check of batches 24–27. The `code-auditor` agent's report
is saved as [`docs/audits/2026-10-21-names-audit.md`](audits/2026-10-21-names-audit.md): seven
findings, three of them `P1`, one a regression from batch 26. All seven are dealt with here.

`npm run check` passes (36 suites) and `npm run lint` is clean. `next build` compiles. `check:ui` is
195/195 on a production build. `check:live` is 15 pass, 1 fail, 2 unreachable, 1 skipped: the
fail is the Library of Congress, whose site answered 2 of 3 direct requests with "error 520" (a
failure on its side) at the time, and nothing here touches it. GDELT and Wikipedia refused this
session; the skip needs an Etherscan key. HawkScan could not run: `HAWK_API_KEY` is not set.

- [x] **Finding 1 (`P1`, a batch 26 regression): a one-word company's legal name counts again.**
      Batch 26 cut "EMBRAER S.A." to "EMBRAER", and a one-word name needs a company word after it
      in a Federal Register title. The matcher read "S.A." as the letters "s a" and did not know
      them. It now reads the legal forms the cleanup strips — "S.A.", "N.V.", "S.p.A.", "A/S",
      "ASA", "AB", "Oyj", "Tbk", "SAB" — as company words (`companyWordAt` in `lib/frCompany.ts`).
      - Whole index, a title made from each company's own legal name: 66 were recognised before
        batch 26 and not after. Now 0 are lost and 11 more are recognised.
      - Live: Embraer 2 → 24 documents, its FAA special conditions and exemption petitions back.
- [x] **Finding 2 (`P1`): other names are kept as they are written.** The alias file kept only
      the matching form ("u s bancorp"). That went to the Federal Register, which finds nothing
      for it, and to headline scoring, which did not recognise "U.S. Bancorp". Each entry now
      carries the name as written, `[cik, qid, kind, news, written]`, and `newsNamesFor` returns
      that form: "U.S. Bancorp" finds 108 documents.
      - Headline scoring also compares matching forms for names of two words or more, so "D.R.
        Horton beats…", GDELT's "D . R . Horton beats…" and "Owens Illinois…" count as naming the
        company. A one-word name still needs its own spelling: "Hunt" is not J.B. Hunt.
      - The Federal Register matcher drops apostrophes, as the alias file does: "angies list"
        matches "Angie's List, Inc.".
      - The Federal Register search also asks for spaced initials closed up: "D. R. Horton" |
        "D.R. Horton".
      - GDELT keeps the matching form, which it is measured to take: the audit's
        ("HORTON D R" OR "d r horton") returned 36 articles.
      - On the auditor's 18 punctuated companies, company Federal Register titles scored without
        the model went from 9 to 18. Live: U.S. Bancorp 0 → 2 documents, J.B. Hunt 0 → 2.
- [x] **Finding 3 (`P1`): a leading "the" is never half a name.** "The Hartford" matched "the
      Hartford Core Bond ETF" and "the Hartford Area". A leading "the" is now dropped before
      matching, and a name that is "the" and one word no longer searches news.
      - Live: Hartford's 13 documents → 0. All 13 were fund filings — 12 exchange rule changes to
        list Hartford Funds ETFs and one exemptive order for Hartford Mutual Funds — none the
        insurer's.
      - Its news is now also asked for as "Hartford Financial Services Group".
- [x] **Finding 4: the everyday names the cleanup missed.** 34 everyday names still ended in a
      legal form or tag: spaced letters ("TELEFONICA S A", "HEINEKEN HOLDING N V", "NATUZZI S P
      A"), a tag after the form ("ACUITY INC. (DE)"), a bare "DE" ("US BANCORP DE", which the
      Federal Register finds 0 documents for), and the public company's forms ("CRH PUBLIC LTD CO"
      was "CRH PUBLIC", and 16 more like it, most of them Thai). "Eli Lilly and Company" was "Eli
      Lilly and".
      - The cleanup now handles each of these, and its digits guard works step by step, so a name
        that is only a number keeps its legal form ("111, Inc").
      - 38 everyday names change in all. No two companies share an everyday name that did not
        before.
      - `check:recall`'s whole-index sweep now sees these forms. Run against main's code, it finds
        the 34.
- [x] **Finding 5: an accent no longer changes a search answer.** "Nestlé", "L'Oréal" and
      "Zürich" now get the answer their unaccented spelling gets. Before, "Nestlé" offered a list
      with a NestYield ETF in it where "Nestle" opens Nestlé, "L'Oréal" found nothing, and "Zürich"
      offered Rich Sparkle Holdings. The query is folded where the committed index is searched (its
      names carry no accents), and `lib/fold.ts` now lists which paths fold and which do not.
- [x] **Finding 6: looked at, left as it is.** The auditor suggested filtering page furniture
      before the names are trimmed, so Meta's GDELT query would carry "facebook inc" and
      Alphabet's "google llc". Not done. "Google LLC" is the name privacy and cookie notices use,
      so it may be furniture too, and GDELT refused this session, so the change could not be
      measured. Scoring is unaffected: "Google" and "Facebook" still score headlines. Added to the
      open GDELT item in batch 25.
- [x] **Finding 7: README.** The Wikidata row no longer says the other names are "for search
      only". The line saying a company's Federal Register documents are scored without the model
      is now true (18 of 18 above).
- [x] **Found while fixing: a one-word name keeps a longer name that adds a word.** The cleanup
      made "ACUITY INC. (DE)" the one word "ACUITY". Batch 25's rule then dropped "Acuity Brands"
      for containing it, and "acuity" alone (as in visual acuity) crowded Acuity's documents out of
      the Federal Register results: 2 → 1 live. So when the name asked for is one word, a longer
      name that adds a real word stays. A name that only adds a legal form is still dropped (no
      "Oracle Corporation" beside "Oracle").
      - 27 more companies get a name this way, among them "Apple Computer", "Tesla Motors", "Royal
        Dutch Shell", "Corning Glass Works" and "Newmont Mining".
      - GDELT results do not change: every page with "apple computer" already has "apple". Live,
        Apple and Tesla kept their 14 and 33 Federal Register documents.
      - Heineken Holding is now "HEINEKEN", and "Heineken Holding" is dropped as the same name.
        Its news query now also finds the brewer's news, which is the holding company's one asset.
- What else moved, measured against main:
  - Search: of 27,972 name queries, 42 answers change: 24 gain, 18 lose, none moves to another
    company. The gains are a subsidiary's name finding its parent ("Hartford Fire Insurance" →
    HIG, "FedEx Corporate Services" → FDX). The 18 lost are half-names the old cleanup made, in
    both cases ("eli lilly and", "medtronic public"). The full names and the short ones still find
    their companies.
  - The alias file, rebuilt offline from batch 25's saved Wikidata read: 1,528 → 1,530 names, 546
    → 537 for news. 174 → 200 companies have names for news, and 68 GDELT queries change.
  - Live Federal Register, 17 companies: 105 → 118 documents (Embraer, U.S. Bancorp and J.B. Hunt
    up, Hartford's fund filings out, the other 13 unchanged).
- [ ] **Open:** GDELT appears to drop apostrophes and a possessive "'s" with them. In the audit's
      saved results, "Buffett's Berkshire … Here's Why I'm" came back as "Buffett Berkshire … Here
      Why Im". If so, "Angie's List", "Papa John's" and "Dave & Buster's" are asked for in a form
      GDELT never prints, and their GDELT headlines do not match. One headline is too little to
      build on; measure it when GDELT answers.
- Checks: `check:wiring` 182 → 186, `check:aliases` 81 → 89, `check:recall` 34 → 49.
  - Each audit finding has its case: Embraer's and Ferrari's legal names, the Hartford's ETF
    filings, the apostrophe, closed-up initials, the written form in the file, D.R. Horton's
    headlines, Acuity Brands, the accented searches, and 15 more everyday names.
  - Run against main's code, all 4 new `check:wiring` cases fail, 7 of the 8 new `check:aliases`
    cases fail (plus 3 batch 25 checks now written as "Google", "Facebook" and "Estee Lauder"), and
    13 of the 15 new `check:recall` cases fail with its sweep. The ones that pass on main are guards
    for what must not change: "Hunt" is not J.B. Hunt, and "Public Storage" and "Banco Santander
    (Brasil)" keep their names.

## NC ledger — batch 27: federal documents found by a company's other names (2026-10-21)

The owner chose this next: what batch 25 left undone. A company's page carries the Federal
Register documents whose title names it (batch 14). They were searched, and their titles
matched, under the everyday name alone, so Alphabet's page could never carry Google LLC's FTC
orders.

`npm run check` passes (36 suites) and `npm run lint` is clean. `check:live` is 16 pass, 0 fail,
2 unreachable (GDELT and the Internet Archive refusing this cloud session), 1 skipped (needs an
Etherscan key); its live Federal Register company search passes. `check:ui` was not re-run: no file
the site loads changed (`lib/frCompany.ts` serves ingest and the count report only). HawkScan
could not run: `HAWK_API_KEY` is not set.

- [x] **Searched and matched under the company's own other names, in one request.** These are the
      same names news uses (`newsNamesFor`), so an acquired company's and the Motorola brand stay
      out. Batch 25 thought this took a request per name. It doesn't: the API ORs quoted phrases
      joined by "|" (measured: "Alphabet" 98 documents, "Google LLC" 111, both 197), while a written
      "OR" is just another word (12). `frSearchTerm` builds it; ingest and `npm run
      fr-company-report` both pass the names.
- [x] **A one-word other name needs its company word straight after it.** The everyday name keeps
      the owner's three-word window ("Apple Inc."). For other names it let in "Amazon Produce
      Network, LLC", a produce firm, and "Toyota Material Handling, Inc.", a Toyota Industries unit.
      Amazon's and Toyota's own documents still match under their everyday names ("Amazon.com
      Services LLC" carries "AMAZON COM").
- [x] **Measured live on 15 companies:** documents whose title names the company went from 50 to
      87, every one read and the right company's:
      - Alphabet 0 → 4 (Google LLC's FTC orders and ITC interventions).
      - Amazon 0 → 3. Goldman Sachs 5 → 17. Charles Schwab 0 → 2.
      - American Airlines Group 0 → 16 (petitions and pipeline complaints by "American Airlines,
        Inc.").
      - Unchanged: Meta, Cisco, Toyota, Verizon, RTX, Block, Elevance, Strategy, TSMC, and
        Motorola Solutions (no other names).
      - The stricter rule costs three that the looser one found correctly: two "TSMC Arizona
        Corporation" notices and a "Verizon Connect" exemption. That is the trade for no
        produce firms.
- Checks: `check:wiring` 177 → 182.
  - A "Google LLC" title counts for Alphabet only with its other names.
  - The produce firm and the sister company stay out.
  - One search for all the names, both as built and as sent, and Google Maps stays out.
  - The ingest and report wiring.
  - Against main's code, the first fails and the suite then stops: `frSearchTerm` does not exist.
    With the three-word window for other names, the produce-firm check fails; with ingest's old
    call, the wiring check fails.

## NC ledger — batch 26: company names cleaned up for news, federal documents and search (2026-10-21)

The owner chose this next: batch 25's first open follow-up. A company's news and Federal
Register searches ask for its everyday name, which `commonName` in `lib/sec.ts` makes from the
SEC title. Measured across the whole index, 302 of those names still ended in a mark or a legal
form, and an accented name was stored split at its accent.

`npm run check` passes (36 suites) and `npm run lint` is clean. `next build` compiles. `check:ui` is
195/195 on a production build. `check:live` was not re-run: nothing here calls a service, and the
name list was rebuilt from batch 25's saved Wikidata read. HawkScan could not run: `HAWK_API_KEY`
is not set.

- [x] **Everyday names lose the marks and legal forms the SEC title carries.** 313 of the 8,028
      titles get a cleaner name, and 315 companies' GDELT queries change with it. Examples:
      - A stray mark: "TOYOTA MOTOR CORP/" is now "TOYOTA MOTOR", "RUSH ENTERPRISES INC \TX\" is
        "RUSH ENTERPRISES", "Blue Acquisition Corp/Cayman" is "Blue Acquisition", and "Alight,
        Inc. / Delaware" is "Alight".
      - A legal form the list missed: "GENMAB A/S", "EQUINOR ASA", "Energy Transfer LP", "AMERICA
        MOVIL SAB DE CV/", "Embracer Group AB".
      - A legal form the list could no longer see: the cleanup removed the final full stop first,
        so "S.A." arrived as "S.A" and never matched. "Spotify Technology S.A" is now "Spotify
        Technology", "Ferrari N.V" is "Ferrari", "Banco Santander, S.A" is "Banco Santander", and
        "ASML HOLDING NV" is "ASML".
      - A slash inside a name stays: "CULLEN/FROST BANKERS", "M/I HOMES", "DATA I/O".
      - Two cases the cleanup used to get wrong are fixed: "ASSOCIATED BANC-CORP" was cut to
        "ASSOCIATED BANC-", and a name is never cut down to digits ("1847 Holdings" stays, since
        "1847" finds the year).
      - Some names are now everyday words ("Light", "Vale", "Orion"). Their page titles already made
        those words count when headlines are scored, so only the news request changes.
- [x] **Accents are folded, not treated as word breaks.** "Estée Lauder" was stored as "est e
      lauder", which neither a search nor a headline could match. `foldAccents` (`lib/fold.ts`) now
      runs in the stored-name key (`nameKey`), the Federal Register title matcher and the headline
      matcher. So "estee lauder" names an "Estée Lauder" headline, and "Mondelēz International",
      "Bǎidù" and "Jumià" now open their companies; they found nothing before.
- [x] **Sapiens no longer opens Formula Systems.** Wikidata still lists Formula Systems as
      Sapiens' parent. Advent International's purchase of Sapiens closed on 2025-12-17, its shares
      left Nasdaq, and Formula kept a minority stake. It joins WarnerMedia in `KNOWN_WRONG`.
- [x] **The name list rebuilt offline** from the same Wikidata read as batch 25 (no new download):
      1,533 → 1,528 names, 558 → 546 for news.
      - 12 news names left the list because the cleaned everyday name now is that name: "nxp
        semiconductors" beside "NXP Semiconductors", "asml holding" beside "ASML".
      - 4 stay in the list but are no longer sent with the news query, because they only extend
        the cleaned name: "energy transfer equity" beside "Energy Transfer", "amarin
        corporation" beside "AMARIN".
      - The accent-split keys became whole ones: "estee lauder", "petroleo brasileiro".
- [x] **Search, compared in full:** 27,992 queries against main. 41 now find a company and 24 find
      nothing, and none moved to a different company. The 24 are the split spellings nobody types
      ("est e lauder", "toyota jid sha") and Sapiens.
- Checks:
  - `check:recall` 14 → 34: 20 legal titles with their everyday names, and a sweep of every
    company the index lists.
  - `check:wiring` 176 → 177: the Federal Register matcher finds "Toyota Motor Corporation" and
    "Estée Lauder Companies".
  - `check:aliases` 72 → 81: the accent fold, accented searches, accented headlines, and Sapiens.
  - Run against main's code, 16 + 1 + 6 of them fail. The rest guard what must not change (real
    slashes, "Estée Lauder" still opening Estée Lauder). Each fold was also removed in turn, and
    its check failed.

## NC ledger — batch 25: a company's news found by its other names (2026-10-21)

The owner chose this next. Batch 24 taught search that "Google" means Alphabet. News gathering
still asked GDELT only for the everyday form of the company's SEC title ("GOLDMAN SACHS GROUP",
"SCHWAB CHARLES", "CISCO SYSTEMS"). It also scored a headline as being about the company only when
the headline used that name. So most of what is written about these companies never reached
their pages.

`npm run check` passes (36 suites) and `npm run lint` is clean. `next build` compiles. `check:ui` is
195/195 on a production build. `check:live` was not re-run: GDELT was measured directly instead,
between its refusals (below). HawkScan could not run: `HAWK_API_KEY` is not set.

- [x] **GDELT is searched, and headlines are scored, by the company's own other names.** The
      everyday name is still the query. Up to three other names are OR'd into the same request,
      so GDELT's one-request-every-five-seconds limit is not spent twice. Re-scoring
      (`npm run score`) uses the same names. 190 companies have such names, and for 188 of them
      the GDELT query is wider. Examples:
      - Goldman Sachs Group: "goldman sachs". Charles Schwab: "charles schwab". Cisco: "cisco".
        Toyota: "toyota". Verizon: "verizon".
      - RTX: "raytheon technologies". Strategy: "microstrategy". TSMC: "tsmc".
      - Block: "square inc". Elevance: "anthem inc". American Airlines Group: "american airlines".
      - Measured on 2026-10-21, once GDELT answered: "GOLDMAN SACHS GROUP" returned 100 pages,
        5 with Goldman Sachs in the headline. With "goldman sachs" OR'd in, 12 of 100 did.
      - If GDELT refuses the wider query, the company is asked again under its everyday name
        alone, and the fetch log says the other names were refused. A refused name never costs
        a company the news it found before. GDELT took a two-letter word in a phrase:
        "GENERAL ELECTRIC" OR "ge aerospace" returned 100 pages, 17 with GE in the headline.
        One-letter words ("d r horton") could not be tried: GDELT dropped every such request.
        (Answered by the batch 28 audit: ("HORTON D R" OR "d r horton") returned 36 articles.)
- [x] **Words printed around every article only score headlines.** GDELT matches a word anywhere
      on a page and returns the newest 100 pages. Measured on 2026-10-21:
      - "Alphabet" returned 100 pages. One had the company in its headline: "OpenAI to sell its top
        models on Google Cloud", which only the name "Google" recognises.
      - "Alphabet" OR "google" returned 97 pages from the last few minutes, and none had the
        company in its headline. "Google" is on nearly every news page, most likely in lines like
        "Follow us on Google News".
      - So "google", "facebook", "amazon" and other web-platform words (`gdeltNames` in
        `lib/news.ts`) stay out of the query. They still score headlines. Alphabet and Amazon are
        asked for as before, and their stories that say "Google" or "Amazon" now count.
- [x] **Only names that are the same company's.** News is dated, so a name may claim it only when
      the company behind the name *is* this one. These rules are in `lib/companyAliases.ts`,
      and each entry in `data/company-aliases.json` now records its kind and whether news may
      use it.
      - **Its own names, current and former.** Meta's "Facebook, Inc." until 2021 is Meta's own
        history.
      - **A predecessor whose ticker carried on.** Google Inc.'s GOOG and GOOGL became Alphabet's
        in 2015, so Google's news from 2004 is Alphabet's. Measured: the former registrants whose
        tickers carried on are Google, the American, United and Alaska airlines and US Foods,
        plus three subsidiaries filed under their parent's ticker.
      - **Never an acquired company's.** Every acquisition fails the ticker test: Sun
        Microsystems' 1990s news is not Oracle's, nor Red Hat's IBM's, nor Whole Foods'
        Amazon's. These names stay search-only, and so do the looser Wikidata aliases ("P&G").
        Wikidata's start dates could not tell the two cases apart: they make Cisco younger than
        AppDynamics, and would count Fox buying Credible as a predecessor.
      - **Never a brand that went to another company.** Motorola, Inc. became Motorola Solutions
        in 2011, and its phones became Motorola Mobility (Lenovo's since 2014). A "Motorola"
        headline since then is nearly always a phone. So the old Motorola item's names stay
        search-only (`KNOWN_NOT_NEWS`), and "Motorola" still opens Motorola Solutions.
      - **A one-word name** finds news only when the company is very well known (Wikipedia
        articles in 50+ languages: "google", "cisco") or the word is coined, with a capital inside
        it ("MicroStrategy"). "Square" and "Anthem" are words first. Block's "square inc" and
        Elevance's "anthem inc" are used instead.
      - **No name that only extends the one already asked for.** "oracle corporation" adds
        nothing beside "Oracle". A name search already resolves is kept for news only when it is
        not that form: "american airlines" beside "American Airlines Group".
      - 558 of the 1,533 names may be used for news. Search answers are unchanged: a comparison
        of 23,741 name queries found 0 differences against batch 24.
      - [x] **Done in batch 26** (above), which found 302 such names, most of them legal forms.
        Some everyday names keep a stray mark from the SEC title, so their news and
        Federal Register searches ask for the wrong thing. "TOYOTA MOTOR CORP/", "AMETEK INC/",
        "RUSH ENTERPRISES INC \TX\" and "Blue Acquisition Corp/Cayman" are among about 30
        (`commonName` in `lib/sec.ts`). Separately, an accented letter splits a stored name:
        "Estée Lauder" is kept as "est e lauder", which no headline matches (`nameKey` in
        `lib/companyAliases.ts`). Both clean-ups change search answers too, so they need their
        own whole-index comparison.
      - [ ] **Open:** GDELT returns the newest 100 matching pages, so a company whose name is also
        a common word gets mostly unrelated pages: 1 in 100 for "Alphabet", 5 in 100 for "GOLDMAN
        SACHS GROUP". Scoring keeps the unrelated pages off the page, but they still use up the
        100 places. One lead, measured once: GDELT's `repeat3:` operator (the word at least three
        times on the page) works, and "Alphabet" OR `repeat3:"google"` returned 5 in 100 against
        "Alphabet" alone's 1. It, and GDELT's relevance sort, are worth measuring on more companies
        before the platform words go back into queries this way. The same measurement settles the
        batch 28 audit's suggestion to send the longer forms instead ("facebook inc", "google
        llc"): "Google LLC" is the name privacy and cookie notices use, so it may be furniture too.
- Not done here: the Federal Register's documents naming a company are still searched under one
  name. It takes a request per name, and Google's FTC orders say "Google LLC". The historical
  sources are untouched too. (Done in batch 27, above, in one request after all: the API ORs
  phrases joined by "|".)
- Checks: `check:aliases` 44 → 72.
  - The news rules, run on Wikidata-shaped items, Motorola included.
  - The committed file: news only from own or predecessor names, and never from
    `KNOWN_NOT_NEWS`.
  - `newsNamesFor` for GOOGL, META, AMZN, MSI and ORCL.
  - The GDELT query, both as built and as sent: OR'd for Goldman Sachs and RTX, and never with
    "google" in it. A refused wider query falls back to the everyday name.
  - Headline scoring: a "Google" headline counts for Alphabet, while Times Square does not count
    for Block.
  - The ingest and re-score wiring. `check:recall`'s GDELT wiring assert follows `gdeltNames`.
  - Each fix was removed in turn: the platform-word list, the Motorola rule, the rebuilt name
    file, the fallback, and the ingest label. Each time, its checks failed.

## NC ledger — batch 24: other names for companies, from Wikidata (2026-10-21)

The owner chose this next. It closes **NC-004**. It also corrects batch 23's note on "Google":
Alphabet's EDGAR record has no former names, so holding Alphabet would not have fixed it.

`npm run check` passes (36 suites, with the new `check:aliases`) and `npm run lint` is clean.
`next build` compiles. `check:ui` is 195/195 on a production build. `check:live` is 16 pass, 0 fail,
2 unreachable (Wikipedia and GDELT throttling this cloud session), 1 skipped (needs an Etherscan
key). HawkScan could not run: `HAWK_API_KEY` is not set.

- [x] **Search finds a company by the names people use, before the site holds it (NC-004).**
      With nothing held, a search is answered from the committed EDGAR index, which knows only
      legal titles. "Google" opened a Google-themed ETF, "Facebook" matched nothing, "Red Hat"
      opened a company called RRR with a "Hat" filter, and "Sun Microsystems" went to Sunoco.
      Now `npm run sync:aliases` reads Wikidata (CC0) and writes **1,465 names** to
      `data/company-aliases.json`, and the company rungs read them:
      - **Whose names.** A listed company's own label and official names, current and former
        ("Facebook, Inc." is Meta's, ended 2021). Its Wikidata aliases too, but only when they
        share a word with those names or are their initials ("IBM", "P&G"). Also the names of a
        **former SEC registrant whose parent is now listed**: Google Inc. → Alphabet, Sun
        Microsystems → Oracle, Red Hat → IBM, Whole Foods Market → Amazon, Aetna → CVS.
      - **Not read:** Wikidata's "owned by" and "manufacturer" links. Measured, they map zinc to
        Pfizer, the Titanic to Carnival and Suzuki to JPMorgan.
      - **Rules, each from a name the sync actually met** (all in `lib/companyAliases.ts`):
        - No nicknames ("Big G"), misspellings ("Wallmart") or a shampoo filed as P&G's alias
          ("Rejoice"). No web addresses, bracketed places or stray digits.
        - A one-word name needs a company with Wikipedia articles in 10+ languages, so not
          "English" for a bank. A two-letter ampersand name needs 30+, so not "D&B" for Dave &
          Buster's.
        - An item must be the company: one carrying Snowflake's CIK was named only "Castor
          Maritime".
        - Another listed company's name stays its own. Trane's former name "Ingersoll-Rand" is
          today's Ingersoll Rand. Wikidata still has SeaWorld under Blackstone, which sold it
          in 2017.
        - A name two companies claim is nobody's, and one known-wrong statement (WarnerMedia
          under AT&T) is not read.
      - **Ranking.** An exact EDGAR title still wins, an alias comes next, and a title prefix
        after that. So "Apple" is Apple Inc. and "Google" no longer reaches a fund through the
        fund-name rung. An alias beats a prefix only for the larger company: "J&J" is Johnson &
        Johnson, while "United" stays UPS.
      - **Measured.** Of 23,422 name queries built from the index, **4 answers changed**: "J&J",
        "BNY Mellon" (twice) and "T. Rowe Price", each from a fund or a smaller namesake to the
        company. No query lost its answer.
      - Search only. These names do not feed the relevance scoring that decides whether a story
        is about a company: a loose name there would pull unrelated stories onto a page.
- Checks: `check:aliases` is new and in the chain, with 44 checks.
  - The rules, run on names Wikidata really holds.
  - The committed file against the ticker index beside it.
  - The resolver: every exact EDGAR title still finds its own company.
  - Search end to end with the database down.
  - The sync's own queries.
  - Against the old resolver, every alias search failed (shown above). The builder is new.
  - `check:live` +1: Wikidata still has Google Inc. under Alphabet, and "Facebook, Inc." among
    Meta's official names.
- **For the owner:** pull, no migration. Run `npm run sync:aliases` after each `npm run
  sync:tickers` (now in `docs/OWNER-ACTIONS.md`), and read the overrides it prints before
  committing.
- Ledger housekeeping: batch 23 repointed the ledger's line references into this file before
  its results paragraph went in above them, so every later reference pointed 3 lines early. They are
  repointed by content now, and each lands on the text it named before batch 23.

## NC ledger — batch 23: the 2026-10-21 code audit, fixed (2026-10-21)

The owner chose a full code audit next. The `code-auditor` agent ran on `d36636d` (main after
PR #53) and wrote [`docs/audits/2026-10-21-audit.md`](audits/2026-10-21-audit.md): six findings,
one `P0`, one `P1` and four `P2`. All six are fixed here, with two more defects found while
fixing them.

`npm run check` passes (35 suites) and `npm run lint` is clean. `next build` compiles. `check:ui` is
195/195 on a production build. `check:live` is 15 pass, 0 fail, 2 unreachable (Wikipedia and GDELT
throttling this cloud session), 1 skipped (needs an Etherscan key). HawkScan could not run:
`HAWK_API_KEY` is not set.

- [x] **Audit #1 (`P0`): old prices were rounded to the cent, which invented huge moves. They are
      now stored exactly, and every full history is read once more.** `lib/prices.ts` rounded every
      close to cents, while the column holds six places.
      - Split-adjusted closes from the 1970s–90s are fractions of a cent to a few cents, so one
        rounded cent is a 25–100% "move". Walmart's "Biggest moves" showed six +100% days in 1973–75
        that never happened (its largest real move then was −16.8%). NVIDIA showed three +33.3%
        days in 1999; one was really +2.6%. MNST stored 110 closes as $0.00.
      - Closes are now stored to six places (`exactClose`). Cents are chosen only for display, by
        `formatPrice`: $0.0344, not $0.03, on the chart and in the page header. The moving
        averages are no longer rounded either.
      - Batch 22 reads a full history only once, so its rounded histories would never have healed.
        The fetch-log marker is now `<ticker> full history (exact)`. A read logged under the old
        marker no longer counts, so each held company and crypto asset re-reads its whole history
        once, at full precision, on its next refresh. No hand-editing of the database.
      - Live: WMT 13,650 closes from 1972-08-25, none zero, largest daily move 16.8%.
- [x] **End of day only: a trading session still in progress is no longer stored.** The audit
      could not test this, because the US market was closed. Measured instead on markets that were
      open (London, Mumbai, bitcoin): while a session trades, Yahoo's daily series already carries
      today's bar, priced at the latest trade. An hourly refresh during US hours would have stored
      a mid-day price as that day's close. A bar whose session has not closed (and settled for half
      an hour) is now left out; the next refresh after the bell stores the real close.
- [x] **Audit #2 (`P1`): search sent household names to the wrong security.** The committed
      ticker index compared raw titles, so punctuation decided the answer:
      - "Coca-Cola" went to CCEP (KO's title is `COCA COLA CO`), and "BlackRock" to a closed-end
        trust (BLK's is `BlackRock, Inc.`).
      - "Home Depot" was salvaged as "Home" plus an unrequested "Depot" filter, and a bare "Lowe's"
        offered three Fidelity funds.
      - Names are now compared twice. First with punctuation folded and spaces kept, so "Pure
        Cycle" stays Pure Cycle Corp and "Black Stone" stays Black Stone Minerals. Only if that
        finds nothing, with spaces folded too, so "U.S. Bancorp" finds `US BANCORP DE` and "Exxon
        Mobil" finds `ExxonMobil Holdings Corp`.
      - Of the index's 2,794 "Name, Inc."-shaped titles, **2,789** now find their own company by
        name, against **36** before. The other five are names shared with a larger filer
        ("Citizens", "First Bancorp"), which now win.
      - A whole-index comparison of 23,422 name queries changed 42 answers: 36 moved (nearly all
        to the company over a fund or trust of the same name) and 6 one- or two-letter fragments
        ("C.", "La") became ambiguous, so they now offer choices.
      - Not fixed: with nothing held, "Google" still opens a Google-themed ETF (DEPW). EDGAR's index
        does not know Alphabet was Google. Once Alphabet is held, its EDGAR former name makes
        "Google" an alias (batch 15). Wikidata aliases (NC-004) would cover it before that.
        *(Corrected 2026-10-21, batch 24: the middle sentence was wrong. Alphabet's EDGAR record
        has no former names; Google Inc. is a separate registrant now under Alphabet. Batch 24's
        Wikidata alias index fixes "Google" whether or not Alphabet is held.)*
- [x] **Audit #3 (`P2`): "Before the ticker" called the start of Yahoo's data the first trading
      day.** IBM, GE, KO, BA and DIS all showed 1962-01-02, and Ford 1972, though it listed in
      1956. The section is now "Before the chart": events before *our earliest daily price*,
      described as the run-up to listing or years before our price data begins. The docs no longer
      say "since listing".
- [x] **Audit #4 (`P2`): the biggest banks' pages were too large to cache.** Their page data came
      to 3.9–5.4 MB, but Next caches nothing over 2 MB, so NC-159's cache never applied to them.
      Batch 22's "well under 2 MB" was measured on the demo data. Three changes:
      - **A company's own stakes in other issuers are left out (a defect found while measuring).**
        A company's EDGAR record lists the filings it made as well as those about it. 190 of
        JPMorgan's 192 recent stake filings were its own stakes in 3M, DigitalOcean and the rest,
        each labelled "Passive investor stake over 5%" as if it were a stake in JPM. Coca-Cola's
        page did the same with its stakes in Coca-Cola Consolidated and CCEP.
      - How they are told apart: in a company's record, a stake filing about the company carries
        the company's own file number (Ford's: 005-30156), and one it made about another issuer
        carries none. All 15 filing headers sampled agreed. Ingest now skips those, and unlinks the
        ones earlier runs stored, from this company only: the same filing is correctly a stake in
        the issuer it names.
      - **A bank's note programme is one row a month.** Some prospectus form was filed on most
        business days: JPMorgan had 5,022 days of 424B2s. A month with one form on five or more
        days becomes one row ("Prospectuses ×2,931 on 21 days (424B2)"). A company raising money
        files on a day or two, and keeps its dated rows. This happens when the page is read, so
        stored rows are covered and the database keeps every day.
      - **Prices are their own cache entry.** A company listed since the 1970s carries
        11,000–16,000 closes, about 0.7 MB.
      - Measured with live SEC and Yahoo data, filings plus prices plus the 470 economy rows:
        JPM 4.20 → 1.89 MB, C 3.54 → 1.66, BAC 3.03 → 1.70, WFC 2.48 → 1.79, MS 3.01 → 1.16 and
        GS 3.19 → 1.17. Each is split into a timeline entry and a prices entry, both now well
        under the limit.
      - [ ] **Open:** the timeline entry still grows with stored news, and nothing bounds it.
            JPMorgan's is about 1.2 MB before any news row. Cap or page what a company page
            carries before a heavy page's timeline approaches 2 MB.
- [x] **Audit #5 (`P2`): the privacy draft said per-IP counts "disappear within an hour"; they
      stayed until 10,000 clients piled up.** On a quiet site an IP address, and in the Federal
      Register limiter the search terms it sent, stayed in memory until a restart.
      - Both limiters now clear expired windows every minute.
      - The page states the real windows, imported from `lib/rateLimit.ts`: a minute for page
        requests, an hour for Federal Register searches, cleared within a minute of ending.
      - `check:legal` now holds the sentence to the code.
- [x] **Audit #6 (`P2`): prose that contradicted the code or live services, corrected:**
      - `check-feeds.ts` said DefiLlama reports exploit amounts in millions. That was the belief
        behind the 10⁶ bug; they are plain dollars.
      - `COVERAGE-MAP.md` still said prices reach back ten years.
      - The README counted 55 `check:archive` cases; there are 48.
      - `verify-addresses.ts` said egress is blocked; today only the RPC hosts are.
      - Five places said `range=max` comes back monthly. Yahoo reports `"3mo"`: quarterly.
      - The Facebook rename date was given as 10-28; the record says 10-27.
      - Batch 22's own record below is annotated where it was wrong, as is NC-077's closure.
- Checks: 50 new.
  - `check:parsers` +12: exact closes, display format, the re-read marker, unfinished sessions.
    Nine fail on the old code; the other three pin what must stay true.
  - `check:tickers` +18: 14 fail on the old code. It scores the whole index: 36 → 2,789 of 2,794.
  - `check:search-log` +4, all failing on the old code.
  - `check:sec-forms` +10: own stakes, month bundling, a heavy filer's page under 2 MB as two
    entries.
  - `check:legal` +5: the limiter sweep and the privacy wording.
  - `check:live` +1: Walmart's 1970s closes keep their fractions of a cent.
  - `check:ui`, `check:wiring` and `check:macro` updated for the new heading and the split cache.
- **For the owner:** after pulling there is no migration. The next refresh re-reads each held
  company's price history once (logged as `<ticker> full history (exact)`), and each company's
  next filings refresh unlinks its own stakes in other issuers.

## NC ledger — batch 22: every daily close since listing, and a monthly-chart bug (2026-10-21)

The owner chose this next. Batches 15–21 were merged first (PR #52); this batch starts a new PR.

`npm run check` passes (35 suites), `npm run lint` is clean, `next build` compiles, `check:ui` is
195/195 with no console errors, and `check:live` is 14 pass, 0 fail, 2 unreachable (Wikipedia and GDELT throttling this
cloud session), 1 skipped (needs an Etherscan key).

- [x] **Charts carry the whole daily history, not the last ten years (NC-077).** Ingest asked Yahoo
      for ten years, so a chart began ten years before the company's first ingest and never
      earlier: a 2001 filing, a 1994 Fed decision or an old topic on /compare had no price under
      it. Now a company's (and a crypto asset's) **every daily close since listing is read once** —
      Ford 13,709 closes from June 1972, IBM 16,309 from 1962, Apple from its December 1980
      listing — and routine refreshes go back to ten years, which is all a new close needs. A
      successful full read is logged as `<ticker> full history` and that is how the next run knows;
      a company listed under ten years ago simply reads its whole short history each time, which
      costs the same.
      - Read whole, the history replaces what was stored, so every close carries one split
        adjustment. It also brings the older dividends and splits: Ford's page gained 193.
      - **Measured cost**: Ford's page carries about 830 KB more price data, ~104 KB after the
        compression every browser asks for. The cached page stays well under the 2 MB cache limit.
        *(Corrected 2026-10-21, batch 23: true for Ford, but measured on the demo data. The largest
        banks came to 3.9–5.4 MB and were never cached; audit #4. "Since listing" is also where
        Yahoo's daily data begins, 1962 at the earliest, and these first full reads stored closes
        rounded to cents; audit #1 and #3.)*
- [x] **Fixed: a stock split turned a company's daily chart into a monthly one.** The NC-156 split
      re-read asked Yahoo for `range=max`, which Yahoo answers with **one close a month** whatever
      interval is requested (Ford's "max": 169 points from 1984 — *a quarter, in fact: Yahoo
      reports `"3mo"`, corrected 2026-10-21*), and replaced the stored daily
      series with it. Full history is now asked for by date, which returns every daily close, and
      an answer that is not daily is refused rather than stored. Nothing asks for `range=max`.
- [x] **Two live checks corrected** now that the session reaches the SEC and Wikipedia:
      - The EDGAR case required every link under `/Archives/`; batch 15's rename events link the
        company's EDGAR record instead — Apple's 2007 rename was the first live one it saw. It now
        holds renames to that record and filings to `/Archives/`.
      - A Wikipedia 429 was reported as FAIL, because the adapter throws its throttle instead of
        returning it; it is UNREACHABLE now, like every other source's throttle.
- Checks: 7 new in `check:parsers`, replacing the one that asked for `range=max` (the date-asked
  full history, the monthly answer refused, no `range=max` anywhere, the backfill rule for
  companies and crypto, the fetch-log marker — all fail on the old code), 1 more `check:live` case
  (AAPL's whole daily history, passing live).
- Live, in the local database: Ford backfilled 13,709 daily closes from 1972-06-01 and logged the
  full read; the sample data was then restored for the browser checks.

## NC ledger — batch 21: Fed decisions and inflation reports on the charts; real EDGAR names (2026-10-20)

The owner chose this next, and opened the network for it: the Fed, BLS, SEC and Yahoo hosts were
blocked from the cloud session until the owner added them to its allowed domains. Same branch and PR.

`npm run check` passes (35 suites, with the new `check:macro`), `npm run lint` is clean, `next
build` compiles, `check:ui` is 195/195 with no console errors, and the two new `check:live` cases pass against the live
sites.

- [x] **Fed policy decisions and CPI releases on every stock page (NC-080).** A curated subject,
      `us-economy` (`lib/macro.ts`), holds every FOMC policy statement since February 1994, when
      the Fed began announcing its decisions (246 to date), and every CPI release in the BLS
      archive since February 2008 (224). Imported into the local database from the live sites.
      - **On a stock page they sit behind an "Economy" chip that starts off** — about twenty a
        year would bury the company's own story. They are kept in a field of their own, not
        mixed into the company's events, so they never count as something two companies share on
        /compare, never mark a followed page as changed, and never appear in "Before the ticker".
      - **A search about them turns the chip on**: "how did rate hikes affect Apple" opens Apple
        with the Fed's statements showing (the interest-rate and inflation words from batch 20
        match "Fed", "FOMC", "CPI" and "consumer prices"). A reader's own chip choice wins.
      - **The dates are read from the Fed's and BLS's own document addresses, and the decisions by
        their label.** The Fed's addresses change by era (four formats since 1994) and the suffix
        is not always "a" — the January 2008 emergency cut is "b". What holds across every year
        is that a decision is the link labelled "Statement". That rule keeps out the Fed's other
        releases on the same pages: the August 2025 strategy statement (which a first,
        address-only version counted as a ninth 2025 meeting), the March 2020 swap-line and
        repo-facility releases, minutes and press conferences. Checked against all 33 years.
      - **CPI months come from the release's own link text**, so a delayed release keeps its
        month (the September 2025 CPI, out on 24 October after the shutdown), and the October
        2025 release that never came is not invented.
      - Titles say what the address can prove: "Fed policy statement (FOMC)", never "rate cut" or
        "hike". The emerald marker sits below the bar with the other scheduled dates, and loses
        the day's glyph to anything the company itself did (the hover still lists it).
      - **Kept current**: the hourly refresh sends the subject to its own ingester (never to
        Wikipedia), reads the calendar and the CPI archive once a day, creates the subject on a
        database that lacks it, and backfills the FOMC history on the first run by itself.
        `npm run ingest -- --macro` does it by hand; `--macro history` re-reads every year.
      - `/topic/us-economy` is the subject's own page, with every date on it. It is kept out of
        the homepage suggestions: with ~470 dates it took the one topic slot on the first run.
      - Public domain (U.S. government works); credited in the footer and the terms.
      - **`npm run macro-report`** prints what the live pages hold and, with `--pin`, re-captures
        the trimmed pages the checks run on — for the day the Fed or BLS redesigns them.
      - Checks: 51 in the new `check:macro` (on pages captured from the live sites, and a stubbed
        network), 2 cases in `check:live` (both pass live), 7 in `check:ui`. The kind is registered
        everywhere `check-wiring`, `check-relevance` and the compiler require.
- [x] **Batch 15's EDGAR fixture is real now, and it found a bug.** With data.sec.gov reachable, the
      former-names report ran here (META, AAPL, XYZ, GE, F, GOOGL) and its output replaced the
      provisional fixture. Apple's real record lists "APPLE COMPUTER INC/ FA" — an EDGAR filer
      annotation in use for no days at all — and the site read it as a 1997 rename and offered
      "apple computer inc/ fa" as a search alias. The name cleaner already stripped "/DE/"-style
      tags but not one with a space after the slash; it does now. That also tidies the names used
      to search news and the Federal Register. Checks: 2 more in `check:sec-forms` (the
      annotation one fails on the old code).
- [x] **`check:ui`'s feed-key check expects the provider's refusal.** It saves a made-up NYT key to
      prove keys never reach our server; with the network open, NYT now answers that key with a
      401, which the console-error check counted as the app failing. It is the visitor's browser
      being told no by the publisher — the design working — so those requests are marked as
      expected, the way blocked hosts already were.
- Note for this cloud session only: Node's built-in fetch needs `NODE_USE_ENV_PROXY=1` to use
  its network gateway. The owner's PC and a normal host do not.

## NC ledger — batch 20: question search knows other words for a concern (2026-10-20)

The owner chose this next; same branch and PR.

`npm run check` passes (34 suites), `npm run lint` is clean, `next build` compiles, and `check:ui`
is 188/188, with no console errors.

- [x] **"covid" also finds "pandemic", "lockdown" and "coronavirus".** A committed list of 15
      common concerns (`lib/concepts.ts`): covid, tariffs, recession, inflation, interest rates
      and the Fed, layoffs, strikes, supply chain, lawsuits, mergers, recalls, bankruptcy, AI,
      electric vehicles, elections. A focus that names any word in a group also matches the
      others.
      - **The typed word still ranks first.** A related word counts three quarters as much as
        the typed word in the same place. A related word in the headline still beats the typed
        word only in the description.
      - **Phrases stay phrases.** "interest rates" is one term, matched only as those two words
        together — not "interest" in one place and "rate" in another. "AI" and "EV" are kept
        even though focus words are normally three letters or more, so "how did AI affect
        Nvidia" now narrows on something.
      - **The page says which words counted.** The focus bar reads "… that mention “covid” or a
        related word (coronavirus, pandemic, lockdown, quarantine)". The best-matches strip names
        the related word when that is what matched ("“pandemic” in the headline").
      - **The list has rules, written at its top and enforced in `check:focus`:** only words a
        headline uses for the same concern ("vaccine" is not another word for covid); no names;
        no word in two groups; no word that commonly means something else in market news
        ("deal", "duty", "settlement", "rule").
- [x] **The search box says you can ask.** Its hint now reads "AAPL, SPY, a company or fund — or
      ask: how did covid affect Best Buy?", and its screen-reader label says the same.
- Checks: 18 new in `check:focus`, 1 in `check:search-log`, 1 in `check:ui`. On the old code
  `check:focus` crashes on the missing list and `check:search-log` fails the hint check.

## NC ledger — batch 19: prompt search v2 (2026-10-20)

The owner chose this next; same branch and PR.

`npm run check` passes (34 suites), `npm run lint` is clean, `next build` compiles, and `check:ui`
is 187/187 — every check green for the first time since the seven went stale, with no console errors.

- [x] **A question opens the security's page, narrowed to what it asked about (NC-008).** "how
      did covid affect Best Buy's stock price" now lands on BBY with `?focus=covid`: the page
      shows the BBY events that mention covid, best matches first, with a bar that says so and a
      button to show everything. The owner's goal from 2026-08-08, built on the parts kept for it.
      - `lib/resolveSearch.ts` runs the parser (`parseSearchPrompt`) before the ladder. The
        security goes through the same ladder as before; the concern rides on the answer as
        `focus`. The search box, the no-script `/search` redirect, and the "did you mean" and
        choice links all put it on the URL, through one helper (`focusHref`).
      - **Names are not sentences.** The parse is believed only when it changed something and
        the whole query is not already a name. "Jack in the Box" (the parser reads "Jack" plus
        "in the Box") and fund names ending in a stock word ("Transamerica Global Equity",
        "Selected American Shares") are tried as typed against the committed index first
        (`namesSecurity` in `lib/sec.ts`), and so are held subjects' exact names, tickers and
        aliases. Measured: 10 company names and 136 fund names in the index would otherwise be
        split.
      - **Possessives.** "Best Buy's" is tried as typed, then without the apostrophe
        ("McDonalds" — how EDGAR spells McDonald's), then without the 's ("Best Buy").
      - **Misses stay honest.** A question whose security isn't found ("how did covid affect
        <nothing>") answers for that security — near names or "didn't match" — rather than
        salvaging a junk head out of the sentence. A qualifier split that finds nothing ("<name>
        in 2020") falls back to the query as typed.
      - **Salvage keeps its tail.** "Best Buy earnings" → BBY narrowed to earnings; "Tesla
        battery fires" → TSLA, "battery fires". It used to drop the tail.
      - **The search log records both halves**: what was typed (`query`) and what it was read as
        (`subject`, `focus`, `influence`). The columns existed and were always empty.
      - The parser learned "what happened to/with <security> …".
- [x] **Years narrow by date.** A focus such as "in 2020" was matched as a word in headlines, which
      found whatever happened to print "2020". `lib/focus.ts` now reads years as a date window:
      one year is that year, two span between them, and "since", "after" or "before" a year opens
      one end. Words and a year together are the intersection — "tariffs in 2025" is 2025's tariff
      events. Qualifier words ("after", "during", "since" …) no longer count as search words:
      "after" alone matched every "shares fall after earnings" headline. The focus bar says
      "dated in 2020" when that is what it did, and offers "… on its own timeline" only for
      something that has one (an influence, not "in 2020").
- [x] **The seven stale browser checks are gone.** The six prompt-search checks pass as written,
      through the real search box. The seventh expected search to send an unknown ticker (ZZQQ)
      to a page — what the 2026-08-08 refocus switched off. It now checks what matters: opening
      `/company/ZZQQ` really queues the request, and search answers honestly instead of minting a
      page.
- Checks: 15 new in `check:search-log` (the resolver end to end with the database off and the
  network refused, plus where the focus goes on the URL), 13 in `check:focus`, 3 parser cases in
  `check:prompt`, 1 more in `check:ui`. On the old code `check:search-log` and `check:focus`
  crash on the missing pieces and `check:prompt` fails 2 of its cases.
- Not done, split out as its own `P2` line under the v2 entry: synonyms. "covid" doesn't find
  headlines that say "pandemic" or "lockdown" — the focus is keywords only.

## Search engine — first-visit ingest, recall, relevance (2026-08-07)

- [x] **A first search yields a result the first time.** `lib/ingest/firstPass.ts`: a miss on
      `/topic/*` or `/company/*` runs a bounded keyless gather while the visitor waits —
      Wikipedia for topics, EDGAR + the Yahoo chart for companies (exactly what flips each
      page's render gate) — then renders the real timeline. Verified live: Adobe 2.4s,
      telegraph 1.9s, penicillin 3.5s, each from a cold corpus through the real search box.
      - The bounds, chosen not emergent: attempt ledger claimed in one statement BEFORE any
        fetch (db/017), 360-min cooldown, 30m→2h→8h→week backoff for unresolvable slugs, a
        dedicated `max: 2` pool with 250ms connect timeout (third simultaneous miss sheds to
        the notice), advisory lock shared with `scripts/refresh.ts`, 8s deadline, and a DB
        outage produces zero fetches. `npm run check:ondemand` asserts all of it offline.
      - ✓ Verified 2026-10-17 (NC-001, batch 4): the advisory lock excludes two OS processes
        in both directions — first pass vs `npm run refresh` — against a live Postgres 16. The
        offline check still cannot prove it and does not claim to.
      - Observed, bounded, and kept: homepage chip prefetch triggers first passes for
        suggested topics, so the seed pool self-fulfils (≤44 subjects, ledger-deduped).
- [x] **Head-prefix salvage** (`salvaged_prefix` rung, db/018): "Netflix password sharing"
      lands on NFLX with the tail as focus instead of minting a junk subject — the hard cost
      gate in front of first-visit ingest. Verified live through the search box.
- [x] **Relevance engine hardened** (`lib/enrich/relevance.ts`): weak tokens can no longer
      carry a 0.9 ("Motor racing…" for Ford), person-name collisions go to the model
      ("Harrison Ford…"), short names (3M, GE, single-letter tickers) and accented names
      (Nestlé) now match, stored `subject_aliases` join as whole phrases, and every ingest
      path scores links deterministically at insert (746 rows scored inline in live testing).
      `check:relevance` grew from 24 to 34 checks.
- [x] **Recall quick wins**: GDELT queried under the common name (the legal title matched no
      headline — a silent, total recall loss on the highest-volume source); dedupe before
      capping with the cap widened 30→75; `check:recall` locks both in.
- [x] **`check:types` added to the chain, first**: the whole suite runs via tsx, which strips
      types unchecked — the exhaustive-switch guard on `deterministicScore` never actually
      fired, and check-relevance's own ALL list was missing two kinds.
- [ ] `P2` Remaining from the recall/relevance design (judge-approved). **Corrected 2026-08-12:
      EDGAR older-history shards are now BUILT** (Ford 209 → 937 filings, back to 1994); this
      entry listed them as unbuilt for a few hours after they shipped. Still open: SSR focus via a
      dynamic sub-route; GDELT year-window backfill (⚠ answers but throttles hard, 429/503);
      richer paid-tier evidence with an aggregate spend cap (needs a paid key). *(Corrected
      2026-10-21: graded focus scoring and the "Best matches" strip shipped in batch 19, and alias
      harvesting from Wikidata in batch 24, once `query.wikidata.org` answered.)*
- [x] `P2` **EDGAR's own former names — dated renames and search aliases.** Built 2026-10-19
      (batch 15; see that section): renames from the submissions record's `formerNames` go on
      the timeline as corporate actions, and the old everyday names become search aliases, so
      "facebook" finds a held Meta. Free, and needs no Wikidata.
      - ~~Open until the fixture is pinned from a real record.~~ Pinned 2026-10-20 (batch 21)
        from data.sec.gov for META, AAPL, XYZ, GE, F and GOOGL; Apple's real record carried an
        EDGAR annotation ("APPLE COMPUTER INC/ FA") that made a false 1997 rename, now fixed.
      - *Derived from [`docs/proposals/2026-10-17-proposals.md`](proposals/2026-10-17-proposals.md)
        #9, approved 2026-10-19 with `corporate_action` as the event kind. Importance
        low-medium · Efficiency high · Practicality medium (an unverified field).*
- [ ] `P2` **LoC decade walk — measured 2026-08-12, and it is a real trade-off rather than a
      clear win. Do not build it without deciding the two questions below.**
      - **It does reach material relevance ranking never returns.** An unfiltered `"bicycle"`
        query returns 40 results spanning 1895–1962; adding `dates=1870/1879` and `dates=1860/1869`
        returns 20 apiece from decades the unfiltered query never touched.
      - ⚠ **But that is precisely where the OCR noise lives**, and the current design chose
        relevance ordering *specifically* to avoid it — `lib/loc.ts` says so: *"sorting by date
        instead surfaces the oldest OCR misreads first (a 'bicycle' hit in 1837)"*. A decade walk
        deliberately reaches into the decades that warning is about.
      - ⚠ **And the gain would be discarded anyway.** `dropImplausiblePress(evts, floor, limit)`
        caps at **25**. Fetching ten times more candidates and then slicing to 25 changes almost
        nothing unless the *selection* changes too — keep-N-per-decade, or a cap that scales.
        That redesign is the actual work here, not the extra queries.
      - **Cost, measured:** LoC throttles aggressively (the adapter already sleeps 4s between
        retries), and one probe in this session died with an HTTP/2 `INTERNAL_ERROR` under only
        three sequential requests. A seventeen-decade walk per subject is a different load profile
        from one query, and belongs on the production host rather than designed blind.
      - **Two questions to answer first:** (1) does the timeline want breadth-per-decade or the
        best 25 mentions overall? (2) what replaces the flat cap? Until those are decided, more
        fetching is not more coverage.

- [x] **Remove the CAEP cross-promotion.** Done 2026-08-08. `components/CaepPromo.tsx` is
      deleted and its eight placements — home, explore, following, compare, topic, company,
      industry, group — now hold blank `AdSlot` placeholders. Nothing in the UI references a
      sibling product.
      - `AdSlot` gained IAB formats (`leaderboard` 728×90, `billboard` 970×250, `rectangle`
        300×250) so each replacement reserves the space its slot actually had: billboard in the
        wide positions the promo card filled, rectangle in the sidebars. A placeholder shorter
        than the unit that replaces it is how a live ad shoves the paragraph a reader is
        mid-sentence in. Verified rendered: 736×250 and 280×250 respectively.
      - The scope rule in `CLAUDE.md` cited this component as the worked example of permitted
        cross-project *marketing* (as distinct from coupling); it now records that no
        cross-promotion exists and that re-introducing any is an owner decision.
      - ⚠ Unchanged by this: ads still make the site commercial. The `COMMERCIAL_MODE` `P0`
        above governs the day any of these slots carries a real ad.

## Scope refocus — exchange-traded securities (2026-08-08)

**The build scope: post as many reports and articles as the sources honestly allow for
publicly traded companies, mutual funds, ETFs, and other exchange-traded securities.**
Enhancement work is prioritised against that goal; topic infrastructure remains for subjects
already held, but new investment goes to securities coverage first.

- [x] **Funds resolve like companies.** `lib/sec.ts` now consults EDGAR's fund ticker file
      (`company_tickers_mf.json`) after the company file, so SPY, QQQ, VTSAX and every other
      registered fund symbol resolves to a CIK — filings and price history follow through the
      existing company pipeline unchanged. Fund names come from the registrant's submissions
      record (the fund file carries none). Known limit: funds resolve by SYMBOL only —
      "Vanguard 500" has no free keyless name index yet; candidate enhancement below.
- [x] **Search resolves securities; unmatched queries stop minting topics.** The
      `assumed_topic` fallthrough retired (rung kept for history, db/019 adds `unresolved`):
      an off-scope query now gets "that didn't match a listed security" instead of a guessed
      topic page and a Wikipedia gather spent on a random string. Corpus subjects of any kind
      stay searchable — a page we hold is a page worth finding. Head-prefix salvage stays
      ("Best Buy earnings" → BBY) with the tail dropped for now and logged. *(2026-10-20, batch
      19: the tail is carried as the focus now — "Best Buy earnings" → BBY narrowed to earnings.)*
- [x] **Prompt search removed from the search path** — `parseSearchPrompt` no longer runs on
      queries; no focus/influence is derived or carried. Homepage, placeholder, SEO and OG
      copy are securities-first; the suggestion mix is 4 securities + 1 market-adjacent topic.
      *(Superseded 2026-10-20 by Prompt search v2, below — the parser runs again, ahead of the
      ladder.)*
- [x] `P1` **Prompt search v2 — peg topics to exchange-traded securities.** *Done 2026-10-20
      (batch 19, NC-008): a question opens the security's page narrowed and ranked by its
      concern; the synonym idea at the end is split out as its own line below.* The owner's stated
      goal (2026-08-08, recorded verbatim): *"revisit a prompt search that will peg specific
      topics to exchange traded securities (ex. I want to see how covid affected Best Buy's
      stock price)."* The shape: a prompt names a security and a concern; the answer is the
      security's page with its timeline narrowed and ranked by the concern — the intersection,
      not two pages. **The substrate is dormant, tested, and must not be deleted:**
      `lib/prompt.ts` (subject/focus/influence parsing + head-prefix helper, `check:prompt`),
      `lib/focus.ts` (graded focusScore + ranked, `check:focus`), `FocusBar`, `BestMatches`,
      and `?focus=` URL handling in both explorers — all still live behind links, only search
      stopped producing them. v2 wiring is approximately: resolve the security (existing
      ladder) → carry the concern as focus (restore two lines in SearchBox//search) → grade
      with focusScore → consider the paid tier for concepts keywords can't reach ("covid" vs
      "pandemic" vs "lockdown" in headlines).
- [x] `P2` **Prompt search: concerns keywords can't reach.** "how did covid affect Best Buy" finds
      the BBY events whose words include "covid", and not the ones that say "pandemic" or
      "lockdown". Two ways in, both open: a small committed synonym list for the commonest
      concerns (free, coarse), or the visitor's own AI model doing the matching where they have
      connected one (the BYO ranking already exists). Owner's call which, if either; nothing is
      lost meanwhile — the focus bar says how many events matched and offers everything.
      *Done 2026-10-20 (batch 20): the owner chose the committed list — `lib/concepts.ts`, 15
      concerns. The AI route is not built; the BYO ranking panel already re-ranks by meaning for
      a visitor who connects a model.*
- [x] ~~`P2` Fund NAME resolution ("Vanguard 500" → VFINX/VOO)~~ — done 2026-08-12. **"Vanguard
      500" now resolves to VOO, named "Vanguard 500 Index Fund", with no request at all.**
      - **Neither candidate this entry guessed was the source.** Registrant names are the wrong
        level: `data.sec.gov/submissions/CIK0000036405.json` says `VANGUARD INDEX FUNDS`, which
        nobody searches for. **Series names are the right level**, and EDGAR serves the whole join
        keylessly — `browse-edgar?action=getcompany&CIK=<cik>&scd=series` returns
        `S000002839 · Vanguard 500 Index Fund` with every share class and its ticker
        (`C000007773 Investor Shares VFINX`, `C000092055 ETF Shares VOO`) in one response.
      - **One request per registrant, not per fund:** 1,164 rather than 11,970 series or 28,419
        symbols, and the largest registrant in the file (145 series, 1,094 classes) comes back
        complete and unpaginated, so there is no page-walking to get wrong. It runs in
        `npm run sync:tickers`, never on a read path.
      - **The share-class ambiguity is answered, not dodged.** "Vanguard 500" is honestly VFINX,
        VFIAX, VIFSX, VOO and VFFSX. The ETF class wins, for the reason the scope refocus gives:
        this product is about exchange-traded securities, and the ETF class is the one with a
        price chart a reader can act on. A person who wants a specific class still types its
        symbol, which the exact-symbol rung answers. Stated in `preferredClass` and asserted, so
        it cannot drift into a silent pick.
      - **It also removed a request the site was making on every fund page.** Resolving a fund by
        symbol used to fetch the registrant record just to have something to call it; the index
        now carries the fund's own name, so VFIAX answers "Vanguard 500 Index Fund" offline.
      - Parsing HTML is the cost, and the parser is the part worth checking: a class belongs to
        the series *above* it, so two independent regex sweeps would still "work" while attaching
        every symbol to whichever fund sorted first. `check:tickers` pins that association, the
        entity decoding, and both preference branches.
- [x] ~~**EDGAR older-history shards**~~ — done 2026-08-12, and it was the largest single
      coverage win available. EDGAR splits a filer's record at roughly a thousand filings:
      `filings.recent`, then **separate shard files** under `filings.files` that this code never
      asked for. Measured live:

      | | recent only | with shards |
      |---|---|---|
      | Ford | 209 filings, from **2019-05-28** | **937 filings, from 1994-02-10** |
      | Apple | 161 filings, from **2015-06-10** | **393 filings, from 1994-01-26** |

      Twenty-five years of a company's own primary documents, one request away and never fetched.
      Every id is unique across the merged set (937/937, 393/393), so dedup identity holds.
      - **Depth is the scheduler's job, not the first pass's.** `getFilingsDeep(company, true)`
        runs in `scripts/ingest.ts`, which has no deadline and refreshes on a window; the first
        pass keeps the shallow `getFilings` because it runs with a visitor waiting on an 8s
        budget and its job is to flip the render gate, not to be complete. `check:ondemand`
        asserts both halves of that split, and that the shallow path makes exactly one request.
      - A shard that fails to load costs its own years and nothing else — the recent block is
        already in hand, and half a history beats none.
- [x] `P1` **Name each 8-K by its item, and count foreign issuers' annual reports as earnings.**
      ✅ **Done 2026-10-18 (batch 11)** — see that section for what shipped.
      Every 8-K except item 2.02 is titled "`<form>` filing" (`lib/sec.ts:406`), while its item
      codes are stored and printed raw under the row (`Items: 5.02,9.01` — `lib/sec.ts:425`,
      `components/EventList.tsx:76`). An officer change, a material contract, a restatement
      warning (4.02) and a bankruptcy (1.03) all read "8-K filing", and a run of them collapses
      into "8-K ×4". And `earnings` means 10-K, 10-Q or 8-K 2.02 (`lib/sec.ts:397`), so a 20-F
      filer — BABA, TSM, ASML, SAP, TM, SONY, SHOP — can never carry an earnings event, and 40-F
      is not in `wanted` at all (`lib/sec.ts:365-370`) though `EventList`'s `FORM_RE` parses it.
      - Map the current Form 8-K item list (1.01–9.01) to plain labels in `filingsFromBlock`:
        the most material item leads the title ("Ford Motor Co: Officer or director change
        (8-K 5.02)"), 9.01 never does, and the raw codes stay in the description. A code outside
        the table (pre-2004 numbering) keeps today's "8-K filing" rather than a guess.
      - 20-F and 40-F become "Annual report (…)" typed `earnings`, as a 10-K is; admit 40-F.
        **6-K stays a `filing`** — the submissions list does not say which 6-Ks carry results.
      - Cases in `check:parsers` (or a new `check:sec-forms`). The title is in the content hash,
        so the next scheduled refresh re-titles stored rows, as NC-155 did for dividends;
        explanations citing a re-titled 8-K regenerate on the next `npm run explain`.
      - No key, licence or recurring cost. Offline, about half a session: the `items` field is
        already proven live by the 2.02 rule. A `check:live` case for a real 40-F can follow on
        the production host.
      - *Derived from [`docs/proposals/2026-10-17-proposals.md`](proposals/2026-10-17-proposals.md)
        #1, approved 2026-10-18. Importance high · Efficiency very high · Practicality high.*
- [x] `P1` **Keep the material forms EDGAR already sends — amendments, M&A, ownership stakes,
      offerings, delistings.** ✅ **Done 2026-10-18 (batch 13)** — the owner picked the list
      without waiting for the live count; see that section. The deep ingest downloads a filer's whole record — for Ford, the
      recent block plus two shards of 3,431 more (`lib/sec.ts:446-448`) — and keeps 937 filings:
      the 17-form `wanted` filter (`lib/sec.ts:365-370`) drops roughly three rows in four.
      `EventList`'s `FORM_RE` already parses 13D/G, 424B, 40-F and S-/F- registrations, and of
      those only S-1 can arrive. These are the company's own primary documents, from a cleared
      public-domain source, at zero extra requests.
      - Candidates, to be tested against the count below: 10-K/A, 10-Q/A, 8-K/A (a 10-K/A is
        often a restatement); 10-K405 (the pre-2002 annual report the shards reach); S-4,
        DEFM14A, SC TO-T, SC 14D9; SC 13D(/A), if EDGAR lists it under the issuer; 424B*, S-3;
        25-NSE (delisting) and 15-12B (deregistration).
      - ⚠ **Before building — a live count of which forms the records actually carry.** Tally
        `form` across a handful of real records (F, AAPL, BABA, SHOP, VOO, SPY; recent block
        plus shards). Needs a host that reaches data.sec.gov: the owner's, or a cloud session
        whose proxy allows sec.gov.
      - ⚠ **Before building — the owner picks the list, and decides the insider-trade forms.**
        Forms 3, 4, 5 and 144 are probably the bulk of what is discarded and genuinely
        informative, but would swamp a timeline: exclude them, or admit them under their own chip
        or aggregated by week. A separate call from the rest of the list.
      - Then offline: labels, `earnings`/`filing` typing and `check:parsers` cases; the existing
        filing-stack condensation absorbs the extra rows. Land it after the 8-K item labels
        above, so new 8-K/A rows inherit them. No key, licence or recurring cost.
      - *Derived from [`docs/proposals/2026-10-17-proposals.md`](proposals/2026-10-17-proposals.md)
        #2, approved 2026-10-18. Importance high · Efficiency high · Practicality medium (one
        live count and one owner choice first).*
- [x] `P1` **Federal Register documents that name the company, on the company's page.**
      ✅ **Done 2026-10-18 (batch 14)** — without airworthiness directives and with the stricter
      match, as the owner chose; see that section. The live check passed on the owner's machine
      (2026-10-18). The original entry follows. The
      adapter runs only from `ingestIndustry` (`scripts/ingest.ts:585`; the single call site
      `check:wiring` records), and `COMPANY_SOURCES` (`scripts/ingest.ts:62`) omits it. Add it
      for companies: query the common name and keep a document only when its **title** names the
      company — an ITC investigation naming it as respondent, an FTC or SEC order, an
      export-control listing, a FERC or NRC order on a utility, an airworthiness directive on a
      manufacturer's aircraft. A full-text-only hit is dropped, not stored unscored. This does
      not reopen `README.md:56-58`: a sector keyword hit stays the industry's, but a document
      whose title names Nvidia *is* an Nvidia event, and the relevance layer's existing mention
      rules can score it deterministically.
      - Work: a per-company query, the title filter and a per-run cap; read company and sector
        events by event id, so a document linked to both is listed once (`lib/page-data.ts`
        merges `loadEvents` and `loadSectorEvents`, which key the same row differently); an
        updated `check:wiring` reason and a `check:live` case. The adapter, its 24-hour window
        and its quota note already exist. No key, licence or recurring cost; ingest only, never
        the visitor path.
      - ⚠ **Before it ships — measure noise and volume live.** Fixtures cannot size it: aircraft
        makers, utilities and frequent ITC respondents will have many documents, most companies
        few. Needs live Federal Register access (the owner's host); a cloud session can build
        and check it against fixtures in the existing adapter's shape meanwhile.
      - ⚠ **Before it ships — the owner sets the materiality rule.** Airworthiness directives
        alone could run to hundreds a year on one manufacturer: cap them, give them their own
        chip, or exclude the agency. **The owner chose numbers first (2026-10-18):** batch 13
        built `npm run fr-company-report`, which prints, per company, the title-naming documents
        by agency and year and how many are airworthiness directives. Nothing is ingested yet.
        **Counted and decided (2026-10-18):** Boeing gets about 100 directives a year (539 of 596);
        the owner chose to build it without airworthiness directives, after tightening the match
        so "Light Brown Apple Moth" isn't Apple's and "Portland General Electric" isn't GE's.
      - *Derived from [`docs/proposals/2026-10-17-proposals.md`](proposals/2026-10-17-proposals.md)
        #4, approved 2026-10-18. Importance high · Efficiency medium-high · Practicality medium
        (a live measurement and a materiality rule first).*
- [ ] `P2` The rest of the securities-coverage depth set: **GDELT year-window backfill** (GDELT
      answers from this container but throttles hard — 429/503 — so this needs the production
      host to develop against) and **richer paid-tier evidence** (needs a paid key). The LoC
      decade walk serves companies too and keeps its place; Wikidata alias harvesting shipped in
      batch 24 once `query.wikidata.org` answered from the cloud session. Topic-only recall items
      rank behind all of these until the scope changes again.
- [x] `P2` **Company pages show the Wikipedia lede their ingest already fetches.**
      ✅ **Done 2026-10-18 (batch 11)** — see that section for what shipped.
      `ingestCompany` calls `getTopicTimeline(name)` (`scripts/ingest.ts:442`), which returns a
      `summary` and `title` (`lib/wiki.ts:121-128`), and uses only `found.events`; the company
      upsert (`scripts/ingest.ts:369-377`) receives neither. Topics, sectors and crypto assets
      all store one, `loadSubject` already reads it (`lib/store/read.ts:232`), and only topic
      pages render it, credited (NC-047). Store it for companies, render it above the timeline
      with the existing `TopicSummary`, and add it to the page's JSON-LD `description`: one
      paragraph of "what is this company" before forty filings, and the only unique prose on the
      site's most numerous page type.
      - Store it only when the title passes `articleAnswersSlug(commonName, title)`
        (`lib/wiki.ts:451`). The company path applies no such check today, and a prominent lede
        makes a wrong match far more visible than a buried history row.
      - `getTopicTimeline` prefers a "History of …" article, so the lede will often be that
        article's first paragraph. The credit names the article it came from, which keeps it
        truthful; the owner may want it framed as history.
      - No key, licence or recurring cost; the CC BY-SA credit comes with the component.
        Offline with the seed, `check:ui` (credit present, as for topics) and `check:index`;
        looking at a few real ledes needs Wikipedia, so the owner's host.
      - *Derived from [`docs/proposals/2026-10-17-proposals.md`](proposals/2026-10-17-proposals.md)
        #5, approved 2026-10-18. Importance medium · Efficiency very high · Practicality high.*
- [x] `P2` **Sector-relative performance on company and sector pages.** ✅ **Done 2026-10-18
      (batch 12)** — see that section for what shipped. `priceDivergence` returns
      every member's return over a common window and `computeSignals` publishes only the worst
      (`lib/signals.ts:284-301`), so "INTC lagged the sector by 172.3 points" (`README.md:176`)
      appears on `/industry/sic-3674` and never on `/company/INTC`. `SignalPanel` is mounted on
      the industry page and on custom groups but not on the company page, though `/api/signals`
      already takes `tickers=`.
      - Company page: its return against the sector median over a stated window, with the member
        count beside it and each peer linked to `/compare?a=<ticker>&b=<peer>` (the company
        page's first route into `/compare`), plus `SignalPanel tickers={[ticker]}` for its own
        news-volume spikes.
      - Sector page: every member's return against the median, not only the single outlier.
      - Data honesty: the existing three-member rule withholds the figure below three members,
        and the member count and window travel with every number, so "the sector" never silently
        means two companies. The seed needs a third `sic-3711` member to exercise it. Offline
        against a seeded Postgres (`check:signals`, `check:ui`); no key, licence or recurring
        cost.
      - *Derived from [`docs/proposals/2026-10-17-proposals.md`](proposals/2026-10-17-proposals.md)
        #6, approved 2026-10-18. Importance medium · Efficiency high · Practicality high.*
- [ ] `P2` **Route topic pages to the securities they share events with.** Cross-subject links
      live in `event_subjects` and are counted — "280 events carry 351 subject links"
      (`README.md:480-482`) — but no page reads an event's *other* subjects, and the topic page
      offers no route to any security (`app/topic/[slug]/page.tsx`: summary, explorer, sources,
      ads). Add a "Securities in these stories" line built from the topic's events that are also
      linked to a held company, relevance-gated on both links; each entry goes to the company page
      and to the existing topic-over-price compose, `/compare?a=<topic>&b=<ticker>`. Mirror it on
      company pages as "Topics that share events". **Related to Prompt search v2 (NC-008) above,
      not part of it:** that makes *search* produce a security narrowed by a concern; this is a
      navigational entry to the same intersection, from stored links, with no parsing.
      - **Shelved by the owner, 2026-10-18:** `npm run overlap-report` on their database found 0
        of 22 topics sharing a story with a held company. Re-run it when the corpus has grown.
      - ⚠ **Before building any UI — a production count, as the go/no-go.** The overlap depends on
        how many relevance-passing events carry both a topic and a company link; one SQL count on
        the production database answers it. Needs the owner's database. Worth building, but
        unsized until counted. **The count is built (batch 12): `npm run overlap-report`** on the
        production host prints how many topics and securities would show a strip. No UI until
        the owner has run it and decided.
      - Then one grouped query, one strip per page and a shared event in the seed; a cloud session
        builds and verifies it offline. No key, licence or recurring cost.
      - *Derived from [`docs/proposals/2026-10-17-proposals.md`](proposals/2026-10-17-proposals.md)
        #7, approved 2026-10-18. Importance medium, uncertain until counted · Efficiency high ·
        Practicality high.*
- [x] `P2` **Fund pages name their sibling funds.** ✅ **Done 2026-10-18 (batch 12)** — see that
      section for what shipped. The committed index's `seriesCiks` gives every
      fund series' registrant and is read only for resolution (`lib/sec.ts:208-228`): 829 of
      1,163 registrants have more than one series, and VOO's (CIK 36405) has eleven — VTV, VXF,
      VUG, VV, VO, VB, VBK, VBR, VTI, VOT, VOE. Every fund filing tells the reader it "may concern
      a sibling fund" (NC-139) and never says which. List the registrant's other series on the
      fund page — "Other funds from Vanguard Index Funds: VTI, VTV, VUG, …" — the one honest
      "related" relationship the data supports (same registrant, per EDGAR), not "similar funds".
      - Held siblings are plain links. Unheld ones are marked as not yet held and carry
        `rel="nofollow"`: a suggestion is a promise about what is here, and crawlers should not
        walk the index into first-visit gathers (which the attempt ledger bounds anyway).
      - Small and fully offline (committed index, a seeded fund); no key, licence or recurring
        cost.
      - *Derived from [`docs/proposals/2026-10-17-proposals.md`](proposals/2026-10-17-proposals.md)
        #8, approved 2026-10-18. Importance low-medium · Efficiency high · Practicality high.*

## Planned initiatives — free planner & referral board (2026-08-12)

**Two planned additions, neither built and neither started: a free retirement planner and a
professional referral board.** Both widen News Charts from a funnel into a destination product —
something a visitor comes back to rather than passes through. Both also carry regulatory
constraints that are **build requirements, not footnotes**: in each case the constraint decides
what the software is allowed to compute, store and display, and crossing it changes what the
business legally *is* — a publisher becomes an investment adviser, a directory becomes a
referral-fee arrangement. Recorded now so the constraints exist before any code does.

- [ ] `P2` **Free retirement planner — a public, no-account calculator.** The user supplies
      current age, current savings, contribution rate, target retirement age and a return
      assumption; the tool projects balances forward, the shortfall against the target, and the
      savings rate required to close it. Nothing built.
      - **HARD LINE — it never recommends securities or an allocation.** It may do math on the
        user's own numbers. It may **not** take risk tolerance — or any other profile input —
        and change which securities or allocations a user is shown. This is the same
        publisher's-exclusion boundary that governs Finance Now's Portfolio Builder: a
        calculator the user drives is fine, a tool that outputs what to buy is investment
        advice. (Cited as precedent only — no shared code, per **Scope & independence** above.)
      - **Planner state stays isolated from every securities-facing surface.** Its own storage
        namespace under the `news-charts:` prefix, never joined to follows, prefs, notes, or
        any research/timeline personalisation. If the profile ever feeds *which securities a
        user sees*, the boundary is gone regardless of what the UI says.
      - **Prefer client-side computation with nothing persisted server-side** unless the user
        explicitly opts in. Holding no retirement PII sidesteps most privacy obligations
        outright; make that the default and say so on the page, not only here.
      - **Any "next steps" content is population-level, never personal.** "People with estates
        above $X often consult an estate attorney" — never "you should hire an attorney."
      - **SEO note:** free interactive tools are the content type that still earns search
        traffic and links after AI Overviews, unlike articles. Indexable, fast, and ideally
        shareable via URL-encoded scenarios — which also serves the no-persistence default,
        since the scenario then lives in the link rather than in a row.
- [ ] `P2` **Professional referral board — finance-adjacent, NOT investment advisers.** A
      searchable local directory of the professionals a financial planner cannot substitute
      for: estate and elder-law attorneys, CPAs and tax preparers, and insurance producers.
      Nothing built.
      - **Scope exclusion, and the reason it is structural.** Investment advisers are
        deliberately out of scope: North Carolina requires a solicitor for an investment adviser
        to register as an investment adviser representative *of each adviser solicited for* (NC
        Secretary of State, Securities Division) — impossible for a multi-advisor platform, and
        it would pull the business under the SEC Marketing Rule that the publisher posture
        exists to avoid.
      - **Fee model — flat, cost-justified listing fees only. No per-referral, no per-lead, no
        percentage of the professional's fees.** NC Rule of Professional Conduct 7.4
        ("Intermediary Organizations", which names "online marketing platform" explicitly) bars
        requiring a lawyer to pay more than "a reasonable sum representing a proportional share
        of the organization's administrative and advertising costs." The fee schedule must be
        defensible against real costs, and **that calculation has to be written down** — owner
        action, mirrored in `docs/OWNER-ACTIONS.md`.
      - **Disclosure is a component requirement, not a footer link.** Rule 7.4 requires the
        criteria for inclusion, and any payment made by the professional, to be disclosed at the
        outset of the user's interaction — so it renders with the listing itself, not behind a
        link a user may never follow.
      - **No recommendation, no matching.** The user filters and chooses. No "best match"
        ranking, no algorithmic pairing, no "recommended for you" — a matched list is an
        endorsement, and endorsement is what the rules restrict. Note this cuts directly against
        the instinct the rest of this codebase is built on: `lib/enrich/relevance.ts` and
        `lib/focus.ts` exist to rank, and the directory must not reuse either.
      - **Insurance listings must not discuss specific policy terms or conditions.** N.C.G.S.
        § 58-33-82 bars paying unlicensed persons for selling, soliciting or negotiating
        insurance; NCDOI's referral-fee FAQ permits referral fees where the referral avoids
        policy specifics. Hand off, never describe coverage. ⚠ The anti-rebating statutes
        (§§ 58-33-85, 58-63-15) still need a separate look — not done.
      - **No unauthorized practice of law.** Never tell a user which kind of professional they
        need; generic education only.
      - **Licence verification from day one.** Verify and display current licence status against
        the public NC State Bar, NC CPA Board and NCDOI lookups; re-verify on a schedule; lapsed
        or unverifiable means delisted. This satisfies Rule 7.4's inclusion-criteria disclosure
        and matches the data-honesty posture already in the repo — a listing is shown as what it
        verifiably is, or not at all.
      - **Ship a public "How we comply with NC RPC 7.4" page.** Under 7.4 the compliance burden
        falls on the *participating lawyer*, so answering it up front removes the objection
        before a prospective listee has to raise it.
      - **Local SEO is a separate surface** — per-city, per-specialty pages. A different, and far
        less contested, keyword game than the national timeline product.
      - **Owner action, blocking launch:** review by a North Carolina attorney covering RPC 7.4,
        § 58-33-82 plus the rebating statutes, and NC CPA Board referral-fee rules. Mirrored in
        `docs/OWNER-ACTIONS.md`.

**Both items are `P2` deliberately.** Neither may jump ahead of the launch-critical work already
queued: the ⛔ pre-release feed gate (`P0` — every free news tier is non-commercial today),
`COMMERCIAL_MODE=true` in production, the hourly scheduler that nothing runs yet, and the
beta-launch mechanics in `docs/OWNER-ACTIONS.md`. **A paid listing fee is revenue**, so the
referral board trips the same commercial trigger the affiliate initiative below records: the feed
gate first, or not the board.

## ⚠ Correction: egress is no longer blocked from the build container (2026-08-12)

**Several entries below state as fact that this container cannot reach the internet. That was
true when they were written and is now mostly false**, which matters because a standing "cannot
verify from here" is the reason a dozen adapters were only ever pinned against canned payloads.
Measured 2026-08-12, from this container:

| Reachable | Blocked |
|---|---|
| `sec.gov`, `data.sec.gov` · `en.wikipedia.org` · `query1.finance.yahoo.com` (prices) · `www.federalregister.gov` · `archive.org` · `www.loc.gov` · Snapshot · DefiLlama | `feeds.finance.yahoo.com` (Yahoo RSS **news**) · `web.archive.org` (Wayback CDX) · `query.wikidata.org` |
| `api.gdeltproject.org` answers but sheds hard — 429/503 on repeat calls, consistent with its ~1-req/5s throttle | |

What this run already produced, on the "does it work" axis of the ⛔ gate above: **Yahoo prices
✓** (2,512 daily closes for F, 2016-08-12 → 2026-08-11, 34 corporate actions parsing correctly —
dividends of $0.15 and $0.20 per share), **Wikipedia ✓** (26 history + 160 cited articles),
**Internet Archive ✓** (49 items — and a real precision defect, fixed below), **Snapshot ✓** (40
proposals), **DefiLlama exploits ✓** (20 rows, all figures verified — see the `P1` item below),
**SEC EDGAR ✓** (both ticker files and submissions).

- ⚠ **This does not close the ⛔ gate.** That gate is two axes and this is only the first one:
  every *licensing* decision is untouched, and the keyed feeds still cannot be tested without
  keys. `npm run check:feeds` should still be run from the production host, because several
  sources behave differently from datacenter IPs — GDELT's throttling here may be exactly that.
  Since 2026-10-17 (NC-038) the same host should also pass `npm run check:live -- --strict`, the
  pass/fail half: each keyless source is asked a question with a known answer.
- The entries below keep their original "unverified live" wording rather than being rewritten,
  because each records what was true when the work shipped. Read them against this table.

## Legend

- **Priority:** `P0` = do first / unblocks others · `P1` = core value · `P2` = later / nice-to-have
- Each backlog item is rated on three lenses: **Importance** (impact / business value),
  **Efficiency** (ROI — value ÷ effort), **Practicality** (readiness — dependencies, risk, is it
  already built). Priority is the net of the three.
- Check a box when done; add sub-bullets for notes/links as we go.
- **Check the box in the same change that ships the work.** A 2026-07-28 audit against the code
  found seven items sitting open that were already built — including this initiative's own
  headline `P0` (Wikipedia citation mining, shipped in PR #9) — plus one item duplicated across
  two sections. A checklist that overstates what is left is as misleading as one that overstates
  what is done: it hides the real remaining work behind noise.

---

## Project state & prioritized backlog (opened 2026-07-25 · cleared 2026-07-28)

**Where News Charts stands.** The data layer is real — SQL migrations in `db/` (14 when this was
written; 24 as of 2026-10-17, `db/001`–`024` — count the folder rather than this line) plus a
full script suite (`ingest`, `score`, `signals`, `explain`, `plan`). The feature backlog that
opened this section is **done**: PRs #1–#7 all merged 2026-07-25, #9 (citation mining, NL
prompts, pre-IPO story, chart interaction, eight news repositories) merged 2026-07-27, and #11
(the News Charts rename) merged 2026-07-28. The verification each of those PRs deferred —
*"not yet eyeballed in a live browser against a seeded DB"* — has now happened; see below.

- [x] ~~`P0` Merge #4 (SEO) · #6 (follow) · #7 (settings copy) · #1 (grouping) · #5 (compare) ·
      #2 (stacking) · #3 (biggest moves), and coordinate the #4/#5/#6 nav conflicts~~ — **all
      merged 2026-07-25**; the nav/header conflicts were resolved keeping every link and control.
- [x] **`P0` Stand up a seeded environment and verify the merged work in a live browser.**
      Done 2026-07-28. `npm run db:seed-demo` (new) writes a network-free demo corpus through the
      same upserts ingest uses — two companies with a price series carrying planted >2% moves, a
      crowded topic, an industry, plus the *shapes* features depend on (year-only dates, a clean
      run of filing-only days, a pre-IPO era). All 7 migrations applied to a fresh `news_charts`
      database; every route rendered from the database; 22 browser checks passed with **no console
      errors**; no horizontal overflow at 390px or 1440px. What this **cannot** cover: live feed
      behaviour against real API keys — egress to GDELT/Wikipedia/SEC/Yahoo is blocked from the
      build container, so that half stays in the ⛔ feed gate below and needs the owner's machine.

**Three real defects the browser pass found, all fixed** (none were visible to `tsc`, `next
build`, or the offline parser tests — they only appear with data on screen):

- [x] **`/compare` silently dropped its price overlay.** `loadCompareSubject` asked the network
      (`resolveCompany` → EDGAR ticker file) whether a query was a company *before* asking the
      database. With EDGAR throttled or unreachable, a real ticker fell through to the topic
      branch — which still found the company by slug and rendered it as a topic with no prices —
      so the page lost the growth-of-100 overlay that is the entire point of `/compare`, while
      `/company/<ticker>` beside it rendered fine from the same rows. Now database-first, like
      every other loader.
- [x] **Company pages scrolled sideways on a phone (2102px in a 390px viewport).** The price
      chart is created without an explicit width and sizes itself from its container, then writes
      that width back as inline px. Inside a grid item — which defaults to `min-width:auto` and so
      cannot shrink below its content — the two fed each other until the column settled ~2000px.
      Fixed with `min-w-0` on the column; also wrapped the company type-filter row (`TopicExplorer`
      already wrapped its equivalent) and let the subject header row and search input shrink.
- [x] **Subject header rows overflowed ~15px on a phone** — `flex-wrap` on the company/topic/
      industry header rows and `min-w-0` on the search input.

> The **On-chain events** initiative below is the next P1 build; with this backlog cleared it is
> no longer competing with already-sunk work.

---

## ⛔ Pre-release gate: check ALL feeds before the website ships · `P0 · release blocker`

**"Release" means the first page load by anyone other than the owner, a private preview included
(D22, applied 2026-10-19).** **Do not release until every data feed has been checked on two axes — does it work, and are we
allowed to use it commercially.** The source registry (`lib/ingest/store.ts` `SOURCES`) carries a
`commercialOk` flag + license note per source and is the single place to verify against.

### Licensing / keys (monetization turns several free tiers non-compliant)

- [x] **The six news aggregators below — dropped at launch, by the owner's decision
      (2026-10-19).** None is on the ingest path, `COMMERCIAL_MODE` already refuses all six, and
      none has a visitor-key route, so paying would buy nothing the live site shows until one was
      also wired into ingest. Their adapters stay, for `check:feeds` diagnostics only, and their
      keys stay out of the production environment. Closes NC-013–NC-018, and NC-064 (their
      free-tier capacity) with them.
- [x] **Newsdata.io** — free tier is personal/testing. ✅ **Decided 2026-10-19 (owner): drop at launch** — no key in production.
- [x] **GNews** — free tier is non-commercial. ✅ **Decided 2026-10-19 (owner): drop at launch** — no key in production.
- [x] **Currents API** — free developer tier is non-commercial. ✅ **Decided 2026-10-19 (owner): drop at launch** — no key in production.
- [x] **Marketaux** — free tier is non-commercial. ✅ **Decided 2026-10-19 (owner): drop at launch** — no key in production.
- [x] **EODHD** — free tier is personal/evaluation. ✅ **Decided 2026-10-19 (owner): drop at launch** — no key in production.
- [x] **Finnhub** — free tier is personal/non-commercial. ✅ **Decided 2026-10-19 (owner): drop at launch** — no key in production.
- [ ] **Guardian** — free developer key is non-commercial. Request a commercial license/key from
      Guardian Open Platform; swap key.
- [ ] **NYT Article Search** — public API terms are non-commercial and there is **no self-serve
      commercial tier**. Either negotiate a license with NYT or **remove `NYT_API_KEY` at launch**
      (adapter degrades gracefully to off).
- [ ] **Yahoo Finance RSS** — gray zone (headline+link+date with click-through). Review the ToS at
      ship time; if uncomfortable, disable the adapter.
- [x] Keyless public-domain / open sources — SEC EDGAR, Federal Register, Chronicling America,
      Wikipedia (CC BY-SA), GDELT — nothing to license. **Attribution confirmed rendering**
      2026-07-28 against the seeded corpus: every event row carries its source label and an
      outward link (84 on one company page — "Wikipedia: History of Ford Motor Company",
      "Chronicling America: Detroit Free Press", "SEC EDGAR", "Federal Register", outlet names
      for news), and the footer credits Yahoo, SEC EDGAR, GDELT, the Library of Congress and
      Wikipedia's CC BY-SA. The rendering path is the same whatever a row was fetched from, so
      this holds for live data too — what it does *not* prove is that each live adapter labels
      its rows the way the seed does, which is the inconsistency the owner-backlog
      source-labelling item is about.
- [x] ~~Optional hardening:~~ **`COMMERCIAL_MODE=true` is built** (2026-07-28) — and it was not
      optional, because it turned out to be the *only* thing guarding the path that matters.
      `assertCommercialOk` refuses non-commercial sources in `scripts/ingest.ts`, but **the site
      does not ingest to render**: `lib/page-data.ts` calls all eight keyed adapters directly on
      the page-render path, where nothing checked a licence. So every page view already fetches
      from eight non-commercially-licensed APIs, and the day ads go live that becomes a
      compliance problem with no code change to blame.
      Now every keyed adapter takes its key from `licensedKey()` rather than `process.env`, and
      with the flag on the key is withheld — the same signal as "no key", which every adapter
      already degrades from cleanly, so switching it on can empty a feed but never break a page.
      - Verify with `npm run check:commercial-mode`: it gives all eight adapters a valid-looking
        key, turns the flag on, and asserts **no request is attempted at all** — then turns it
        off and asserts they do fetch, so a gate that is simply broken-on cannot pass. Offline
        (fetch is mocked), so it needs no keys and no network. 16/16 passing.
      - **Correction (2026-10-17, NC-035):** the paragraph above describes the site as it was on
        2026-07-28. Since the scheduler cut-over, `lib/page-data.ts` reads only the database, and
        none of the eight keyed adapters is called on the page or ingest path — only by the feed
        diagnostics. `COMMERCIAL_MODE` therefore guards nothing a visitor triggers today; it is
        the gate any future wiring of those feeds must pass, and the release-gate item to switch
        it on stands for that reason.
      - `scripts/check-feeds.ts` now reports *why* a feed sat out ("blocked by COMMERCIAL_MODE"
        vs "no KEY set") instead of showing an indistinguishable empty result.
      - ⚠ The flag enforces the `commercialOk` flags; it does not judge them. Yahoo Finance RSS
        is flagged `true` today (the "gray zone" item above), so it keeps fetching — settle that
        call rather than assuming the flag covers it.
- [ ] `P0` **Turn `COMMERCIAL_MODE=true` on before anyone other than the owner loads the site** —
      a private preview included, not only the production launch. **The trigger changed on
      2026-10-19 (D22, NC-133):** it used to be "the day anything earns money". The site is
      ad-supported by design, so it is commercial in intent from its first outside visitor, and
      the feed gate above has to be settled by then, not by the first ad. The flag is built and
      tested but is **off by default**, which is right for development and wrong for any
      environment someone else can reach. The affiliate item's "recognise what this triggers"
      note is this switch too.
- [ ] Get a real legal review of the above before revenue flows — the flags encode a practical
      reading of published terms, not legal advice.

### 🔁 Recurring: re-check source licensing (this is not a one-time gate)

**Why this needs its own standing item:** a licence change is *silent*. When a feed breaks you
find out immediately — the page is empty and `check-feeds` says so. When a provider changes its
terms, nothing breaks: every adapter keeps fetching happily while the site quietly becomes
non-compliant. The `commercialOk` flags in `SOURCES` are a practical reading of published terms
**on the day they were written** (2026-07), and they rot from that moment.

- [ ] **Set a review cadence** — quarterly is a reasonable default once live; monthly while
      terms are actively changing under a new provider.
- [ ] **Re-check on every trigger, not just on the calendar:**
      - a new feed is added (it must be added to the gate list above, with its own flag)
      - ads, affiliate links or any paid tier goes live — i.e. the site becomes commercial
      - beta → public launch, or a jurisdiction is opened up
      - a provider emails about terms/pricing changes, or a free tier is restructured
      - a key is upgraded or downgraded between plans
- [x] **Record when each source was last verified.** Add a reviewed-on date to each `SOURCES`
      entry so staleness is visible in the registry itself rather than remembered — an
      un-dated flag is indistinguishable from a flag nobody has looked at in a year.
      Done 2026-10-17 (NC-026): `reviewedOn` on every entry, set from the commit that last wrote
      its licence judgement; `check:commercial-mode` requires one and lists commercial sources
      unreviewed for over 180 days. Re-reading the terms is what moves it.
- [ ] **Re-read the actual terms, not the notes.** The notes in `SOURCES` are a summary written
      by whoever added the feed; the binding text is the provider's.
- [ ] **When a source turns non-compliant, the removal path must already work** — every adapter
      is failure-isolated and skips without its key, so pulling a source is a one-line
      `.env.local` change today. Keep it that way: never let a feed become load-bearing enough
      that dropping it breaks pages.

### Scheduled refresh (needs a scheduler on the host)

- [ ] `P0` **Run `npm run refresh` on a schedule — hourly.** Nothing runs it automatically, so
      until something does, **the corpus only changes when it is run by hand**. Cron, a GitHub
      Actions workflow, or the host's own scheduler all work; the tightest per-source window is
      an hour and anything shorter only re-asks sources that would decline to answer.
      This is now the *only* thing that refreshes a chart: pages read the database and never
      fetch. A scheduler that is not running looks exactly like a quiet news week.
- [ ] `P1` **Watch the first few runs.** `npm run refresh -- --dry-run` lists what it would touch
      without spending anything, and `npm run cost-report` shows what the real runs actually
      spent against each free tier. The projection is a floor, so the first live numbers are the
      ones that matter. Since 2026-07-30 the projection covers only sources the ingest path
      actually asks — the keyed aggregators it used to price (EODHD at 100% of its tier at five
      subjects, among them) are not on that path and spend nothing.
- [x] ~~`P1` **Report on the demand queue — make `subject_requests` readable.**~~ — done
      2026-08-12. `npm run demand` (optionally `npm run demand 50`): most-wanted unfulfilled
      subjects with counts and how long each has been waiting, then a **second block for requests
      that failed rather than waited**, then totals. Read-only — no new table, no new page, no
      writes, asserted in `check:index`.
      - The second block is the point. `last_error` has been written by `markFailed()` and read by
        nobody since db/014, so a request that was tried and broke looked exactly like one the
        runner had not reached yet — and it breaks again on every run until someone looks. The
        report separates the two and says so in as many words.
      - **Verified against a real database**, not reasoned about: Postgres 16 is installed in this
        container, so a scratch cluster was stood up, all 19 migrations applied cleanly, and the
        report was run against seeded requests covering the cases that matter — a fulfilled row
        excluded, two failing rows flagged in both blocks, and the `requests DESC, last_asked DESC`
        ordering. First DB-backed verification in this environment.
      - It also names the reason a pending list would never shrink: nothing runs `npm run refresh`
        yet (the `P0` scheduler item), and a report that did not say so would look like a bug in
        the queue rather than the absence of a scheduler.
- [ ] `P2` **Decide how far the request queue is worked per run.** `--requests` defaults to 10
      most-wanted per run. Too low and demand backs up; too high and new subjects crowd out
      refreshing the ones already on the site. The right number depends on real demand, which
      does not exist yet. ⚠ Blocked on the demand report above — once the hourly scheduler runs,
      demand exists but is unreadable.

### Feed health (each source, against production keys)

- [ ] Every adapter returns real data for a fresh company AND a fresh topic (not silently `[]`):
      GDELT, Yahoo RSS, NYT, Guardian, Newsdata, GNews, Currents, Marketaux, EODHD, Finnhub,
      Wikipedia (prose + citations), LoC press (topics AND company pre-IPO),
      SEC filings, Federal Register, prices.
- [ ] Keys valid under production quotas (Newsdata 200/day, GNews 100/day, NYT/Guardian limits)
      with the 6h/1h cache windows doing the rate-limiting.
- [ ] Dedup sanity: the same story from two repositories collapses to one event. Wording
      corrected 2026-10-17 (NC-033): the match is a normalised headline plus its day
      (`storyKey` in `lib/newsQuality.ts`, stored as `dedupBasis`), not the URL — the same
      story from two outlets arrives under two URLs. GDELT joined that key in batch 5 (NC-154),
      with fixtures and a live merge on Postgres; the live check a busy ticker would give is
      still owed from a host that reaches GDELT and Yahoo.
- [x] Attribution renders on every surface — **all three verified 2026-07-28** against the
      seeded corpus. List rows and cards: 84 outward links on one company page, each with its
      source label. Chart crosshair popup: sweeping the price line pops the day's events, each
      showing its source ("SEC EDGAR") and wrapped in an outward link. Footer credits every
      source family including Wikipedia's CC BY-SA. What this does **not** prove is that each
      *live* adapter labels its rows the way the seed does — that inconsistency (GDELT reports
      bare domains, NYT/Guardian report publication names) is the owner-backlog
      source-labelling item, and it stays open.
- [ ] Run from the production host, not a dev box — several sources behave differently from
      datacenter IPs.

---

## Initiative: Wiring, reachability and the licence gate (2026-07-30) — **shipped**

The scheduler cut-over (`813d505`, "Refresh on a schedule; pages read the database and nothing
else") moved fetching off the page path without moving everything that fetching depended on.
What was left behind all had one shape: a working, registered, tested piece of code that no
entry point called. `tsc` cannot see an unused export and the nineteen behaviour suites cannot
either, because each orphaned piece *worked* — what was missing was the wire.

Sources: `docs/audits/2026-07-30-audit.md` (findings 1 and 2) and the *Independently verified*
section of `docs/PRELIMINARY-FINDINGS-2026-07-30.md`.

- [x] ~~`P1` **The commercial licence gate failed open on the scheduled path.**~~ —
      `assertCommercialOk` read `if (rows[0] && !rows[0].commercial_ok)`, so a source with no
      `sources` row passed. No migration seeds that table and `scripts/refresh.ts` never called
      `ensureSources` — so "no row" was the normal state of a fresh production database, and the
      scheduled refresh ingested with every licence check silently permitting. A missing row is
      now a refusal, and `refresh.ts` establishes the registry before it ingests anything.
- [x] ~~`P1` **The refresh windows were consulted by nothing.**~~ — `selectStaleSources` and
      `ttlFor` had one real caller, `check-refresh.ts`, which is their own test. An hourly run
      re-asked Wikipedia (24h window) and Chronicling America (weekly) every hour.
      `scripts/ingest.ts` now computes the due set per subject from `source_fetches` and prints
      what it skipped and why; the Wikipedia fetch itself is inside the window, so a fresh
      subject costs no round trip at all.
- [x] ~~`P1` **On-chain subjects never refreshed on schedule.**~~ — `refresh.ts` imported
      `ingestCompany` and `ingestTopic` only. Crypto assets are `topic` subjects by design, so
      every one of them took the Wikipedia path: no halving, supply move, governance vote or
      exploit had refreshed since seed time, and a bare slug like "dai" was being resolved
      against an encyclopedia. Crypto slugs now route to `ingestOnchain`.
- [x] ~~`P1` **Ten adapters were orphaned; two of them belonged on the path.**~~ — the archive
      adapter was recorded in this checklist as "wired into both the topic and company ingest
      paths" and was not; Yahoo Finance RSS and the company's Wikipedia story (the source of the
      "Before the ticker" section, and the plausibility floor for the newspaper scans) went with
      the page path. All three are on the ingest path now.
      **The other eight are not, by decision rather than by omission.** NYT, Guardian, Newsdata,
      GNews, Currents, Marketaux, EODHD and Finnhub all bar commercial use, and ingesting is
      republishing — `assertCommercialOk` refuses them outright, so wiring them in would breach
      the ⛔ gate above, not satisfy it. Their home is the visitor's own key
      (`lib/feeds/browser.ts`), which renders under the visitor's licence and persists nothing.
      What was wrong was the *reporting*: `check:feeds` called the adapters directly and showed
      them green, and `cost-report` priced their quotas, so the licence gate was costing out
      feeds contributing zero rows. Both now say which sources reach the corpus and which do not.
- [x] ~~`P1` **`governance` and `exploit` events were filtered out of every topic page.**~~ —
      `db/011` and `db/012` added the kinds; `TopicExplorer`'s `FILTERS` never did, and both the
      default active set and the chip row derive from it, so the rows were discarded with no
      control to bring them back. `/topic/uni` and `/topic/aave` are governance-only subjects
      and rendered empty timelines while the Sources panel reported Snapshot contributing events.
- [x] ~~`P2` **`/api/group` emitted a removed field.**~~ — `yearOnly: r.date_precision === "year"`
      where the type carries `precision`, so month-precision events in a custom group rendered on
      an invented day. The query had no row generic, so `rows` was `any[]` and `tsc` saw nothing;
      it is typed now.
- [x] ~~`P2` **`servedFrom: "live"` was unreachable while the badge still promised it.**~~ — the
      cut-over left a two-valued type with one reachable value, a component branch nothing could
      render, and a README paragraph describing the deleted read-through cache. The badge now
      carries the date the stored copy was refreshed, which is what a reader of a database-only
      site actually needs from it.
- [x] ~~`P0` **A wiring/reachability check, so the next one is caught on the day it lands.**~~ —
      `npm run check:wiring` (93 checks, offline, in `npm run check`). Every `SourceKey` must
      have an ingest call site or a written-down reason not to; nothing barred from commercial
      use may sit on the ingest path and nothing on it may be unlicensed; every source must have
      a window and a quota entry; `refresh.ts` must reach every subject kind an ingester exists
      for; and every `EventType` must have a filter chip that can show it. It would have caught
      all six items above.
- [x] ~~One source of run-ending fragility, found while wiring.~~ — a fetcher that threw took the
      whole subject with it, so one unreachable host cost a company its filings too. A source
      that throws now costs its own events, logs an `error` row, and the run continues.
- [ ] `P2` **The aggregator relevance floor is inert.** `applyRelevanceFloor`, `titleNamesSubject`
      and `LOOSE_SOURCES` act on `newsdata`, `gnews` and `currents` — exactly the sources the
      licence bars from ingest — so nothing calls them outside `check:news-quality`. Left in
      place rather than deleted or given a no-op call site: it is the filter those feeds would
      need if a paid tier is ever bought. Decide it with the ⛔ gate, not before.

---

## Improvement agents (`code-auditor`, `opportunity-scout`)

Installed on PR #14. What has run so far is **not a baseline** — items carried over from the
closed PR #15, whose findings are otherwise all shipped.

- [x] `P1` **Re-run both agents properly.** ✅ **Auditor half done 2026-08-12** — the first
      uncapped pass, reported in [`docs/audits/2026-08-12-audit.md`](audits/2026-08-12-audit.md):
      **10 findings, 4 of them `P1`**, filed as their own items below. ✅ **Scout half done
      2026-10-17** (NC-037, batch 9): the first uncapped `opportunity-scout` pass, in
      [`docs/proposals/2026-10-17-proposals.md`](proposals/2026-10-17-proposals.md) — 10
      proposals, 4 `P1`. The owner marked them 2026-10-18: 1–8 approved and filed into this
      checklist, 9 and 10 still pending. The 2026-07-30 run had been capped at 2 by instruction.
      - What the pass confirms about method, not just about defects: **every finding came from
        pointing an adapter at a live service.** The offline suites (25, all passing) could not
        have produced one of them. Findings 1, 2 and 7 share a shape — a live source whose real
        behaviour nothing asserts against — and the auditor's closing note proposes a live
        assertion suite distinct from the offline ones. That proposal belongs to the scout.
        ↳ Built directly instead, as NC-038 in batch 9: `npm run check:live`.

### Findings from the 2026-08-12 audit

- [x] ~~`P1` **The Internet Archive query sorts date-ascending on a false premise.**~~ — fixed
      2026-08-12. The `sort[]` parameter is gone; archive.org's default is relevance, which is
      what the Chronicling America call already asks for and for the same reason. **Verified live
      against the same three queries that found it:**

      | query | before | after |
      |---|---|---|
      | Nvidia (founded 1993) | 1898 → 1999 | **2011 → 2025**, 0 pre-1900 |
      | Ford Motor | 1770 → 1916, 12 pre-1900 | **1921 → 2025**, 0 pre-1900 |
      | Apple Inc | 1976 → 1980 | **2000 → 2025** |

      The source reaches modern material for the first time, and stops spending half its rows on
      items the floor discards. Historical reach is not lost — Ford still starts 1921.
      - `check:archive` gained a **"what the request asks for"** section (55 cases). It had none:
        every case tested how a payload was *parsed*, which is precisely why a bad query parameter
        could sit there producing perfectly parseable garbage. It now asserts that no date sort is
        requested, so this cannot be reintroduced silently.
      - The original finding is preserved in
        [`docs/audits/2026-08-12-audit.md`](audits/2026-08-12-audit.md) §1.
- [x] ~~`P1` **Aave's Snapshot space id is not a Snapshot space.**~~ — fixed 2026-08-12.
      `aavedao.eth`, with the provenance taken from Snapshot's own space record rather than a
      portal link. **Verified live: `/topic/aave` goes from 0 events to 40**, and both configured
      spaces resolve (Uniswap 197 proposals, Aave DAO 970).
      - **The warning that failed is the more useful lesson.** That file already said a wrong id
        would look like a quiet month, and `check:feeds` already printed the per-space zero on
        every run — for a fortnight, unread, because the annotation beside it ("closed proposals
        only") supplied a plausible reason to skip past it. **A visible zero is not a read zero.**
        `check:feeds` now verifies the id *before* the count and prints **`✖ NOT A SNAPSHOT
        SPACE`** in its own words, because "this id does not exist" and "nothing closed recently"
        are different facts and only one of them is our bug.
      - New `assertSpacesResolve` lives in `lib/onchain/governance.ts`, not in a `check:*` script,
        because it needs the network and the whole `npm run check` chain is offline by
        construction. It distinguishes all three answers: resolves, does not exist, could not ask.
      - `check:governance` had hardcoded `aave.eth` in a URL assertion, so it pinned the typo and
        had to be edited when the id was corrected. **A check that must change when a config value
        is corrected is a check protecting the mistake** — it now derives the space from config.
      - Original finding: audit §2.
- [x] ~~`P1` **Two ingest branches apply no plausibility floor to archive items.**~~ — fixed
      2026-08-12. Both now share `dropImplausiblePress` against a new `ABSOLUTE_FLOOR`
      (`lib/loc.ts`) when the subject offers no floor of its own; the company branch stops passing
      items through on nothing but a cap.
      - **The floors bound impossibility, not likelihood — and one is deliberately a no-op.**
        `company: 1780`, because the oldest surviving US public companies date from that decade
        (Bank of New York, 1784), so nothing a registrant's archive holds can honestly predate it;
        this is the value that catches the 1770 sheet-music covers. `topic: 1500`, the archive's
        own minimum and therefore no filtering at all — the honest answer for a subject that can
        legitimately be ancient. A tighter topic bound would drop real history to tidy up someone
        else's cataloguing.
      - The comment that justified the gap (*"a wrong date is a rarity there"*) is replaced by
        what was measured: 12 of 48 `"Ford Motor"` items pre-1900, for a company founded in 1903.
      - ⚠ **This is the backstop, not the fix.** Asking the archive for relevance rather than the
        oldest rows is what actually repaired it; with that in place the same three queries return
        zero pre-1900 items. The floor is for the mis-catalogued row that still comes back.
      - Original finding: audit §3.
- [x] ~~`P1` **"Site that day" links promise a capture that does not exist.**~~ — fixed
      2026-08-12. **Two changes, because there were two different wrongs.**
      - **Before 1996 there is no link at all.** Nothing was archived before the Internet Archive
        began crawling, so for an earlier event there is no capture to be *near* — the link was
        not imprecise, it was a claim about a page that never existed. It rendered on every
        pre-web row, which on a company like Ford is the entire "Before the ticker" section.
      - **After 1996 the label stops overclaiming.** Wayback redirects to its nearest capture with
        no bound on distance, so "site that day" promised a precision the mechanism never had. It
        now reads **"nearest capture"**, and the title says it is the closest archived capture to
        that date. A 1926 Ford event resolved to a December 1998 page; that is the gap the old
        label hid.
      - `waybackCouldHave` is a local constant, not a lookup, on purpose: this half can be decided
        without asking anyone, and the render path must not acquire a network call.
        `fetchSiteSnapshots` answers the sharper question (*does this domain have a capture near
        this date*) and is the upgrade if the snapshot strip is ever built — which also settles
        the note above about that function having no production caller: **one surface does ship**,
        it simply never consulted it.
      - Original finding: audit §4.
- [x] ~~`P2` **"3M" resolves to nothing.**~~ — fixed 2026-08-12. The name-prefix rung is gated on
      **ambiguity, not length**: one match is an answer whatever its length, several still need
      three characters to be meant. `3M` → `MMM` / "3M CO"; ALIBABA, APPLE, Ford, AAPL and
      "Vanguard 500" all unchanged. The old guard called itself a defence against junk prefixes,
      but length is a poor proxy for ambiguity — `"3M "` matches exactly one row in 10,387, and 94
      of the index's 140 two-character title prefixes are unique. Audit §5.
- [x] ~~`P2` **Ethereum milestone rows credit an explorer that answered nothing.**~~ — fixed
      2026-08-12. The credit follows whichever branch produced the date; a fallback row now reads
      **"Published activation date · verify on Etherscan"**, which is perfectly good provenance
      and simply is not Blockscout. The link still points at Etherscan either way, because that is
      the page a reader checks. `check:onchain`'s existing fixture was already the exact split
      needed — The Merge answers, three fall back — so the assertion cost nothing to add and would
      have caught this from the start. Audit §6.
- [x] ~~`P2` **`check:feeds` does not exercise three sources the ⛔ gate names.**~~ — fixed
      2026-08-12. SEC filings, Federal Register and prices are in the report, plus the two keyless
      on-chain adapters. Run live against NVDA: **filings 92 rows 2020→2026, prices 2,514 closes
      with 42 corporate actions, Federal Register 60 rows**, four halvings, four Ethereum
      milestones — the gap was in the instrument, not the feeds. The report already warned against
      over-reading a green line; it said nothing about absent ones, and absence is harder to
      notice. Audit §7.
- [x] ~~`P2` **Five files still say egress is blocked.**~~ — fixed 2026-08-12. **Zero occurrences
      of "egress is blocked" remain** in `lib/`, `scripts/`, `app/` or `components/`.
      - Each is replaced by what is actually true of that file, which is more useful than the
        blanket claim in both directions: `archive.org` and Snapshot were **exercised live** and
        say so (both found defects); `usdt.ts` and `feeds/browser.ts` are still unverified but
        because they need **keys**, not network; `verify.ts` still cannot run because those
        specific hosts are blocked (`eth.blockscout.com` → 403) while egress generally is not.
      - `lib/archive.ts` had contradicted itself 37 lines apart. Its header now records the live
        verification and keeps exactly one caveat — the Wayback **CDX** half, still
        documentation-derived because `web.archive.org` is unreachable even though `archive.org`
        is not.
      - `README.md` corrected: `check:archive` is 55 cases, not 39. Audit §8.
- [x] ~~`P2` **Five exported functions have no caller.**~~ — fixed 2026-08-12. `dedupByUrl`,
      `wikipediaHasSubject`, `isStale`, `isFollowing` and `clearAnnotations` are deleted, and the
      **"Dedup basis = article URL" entry is corrected** to name `collapseNearDuplicates` — the
      mechanism that actually does the work, keyed on `storyKey`. A done log naming a dead
      function as the live mechanism is the drift this file's own rule exists to prevent, and it
      survived because nobody re-read the entry against the code. Audit §9.
- [x] ~~`P2` **`lib/signals.ts` computes displayed figures with no check of any kind.**~~ — fixed
      2026-08-12. `median`, `mad`, `isSpike` and `weekEnd` are exported and `npm run check:signals`
      is in the chain (23 cases, suite count 25 → 26). It covers the spike floor and the
      zero-spread arm, numeric-vs-lexicographic sorting, and week boundaries across month, year
      and leap-day rollovers.
      - **The two-member divergence case is fixed, not just tested.** With exactly two members the
        median is the midpoint of the pair, so both are equidistant and a stable sort returned
        whichever the database listed first — the page said "A outran the sector by X" or "B
        lagged by X" interchangeably, decided by row order. A two-member "sector median" is just
        the midpoint, so there is no sector to diverge *from*; the signal now requires three
        members and is withheld below that, which is the correct answer rather than a cautious
        one. Audit §10.
- [x] ~~`P3` `npm run cost-report` throws a raw stack trace where `refresh` prints a clean
      message for the same missing `DATABASE_URL`.~~ — fixed 2026-08-12, and fixed as **one rule
      rather than one script**.
      - `configProblem` (`lib/db.ts`) returns the message *plus the remedy* for conditions an
        operator is expected to hit — a missing `DATABASE_URL`, or a database configured but not
        answering — and **`null` for everything else, meaning print the stack**. Hiding an
        unexpected fault to look tidy is how it becomes hard to diagnose, so the tidying is
        deliberately scoped to the two failures that are settings rather than bugs.
      - Applied to all **eleven** DB-backed operator scripts, not just the one the audit named.
        Seven already printed `err.message`, which was the inconsistency the finding pointed at;
        they now give the remedy line too. The `check:*` suites are deliberately untouched — a
        crashing check should show its stack.
      - `check:signals` covers it (23 → 28 cases), including the assertion that matters most:
        an unexpected error is **not** swallowed into a tidy sentence.- [x] ~~`P2` **Fix the auditor's script name.**~~ — done 2026-07-31. `.claude/agents/code-auditor.md`
      named `npm run check-feeds`; this repo's script is `check:feeds`, so the check errored as
      "Missing script" rather than running. The definition now also runs `npm run check` and is
      explicit that a report must say **where** it ran: egress is blocked from the build
      container, so an unqualified skip turns "no internet here" into "these feeds are broken".
- [x] ~~`P2` **Give the auditor the two lessons this month taught.**~~ — done 2026-08-12.
      `.claude/agents/code-auditor.md` step 3 gains **"A green check is not evidence the thing
      works"**, naming both failures so the next pass looks for them by name: *the check calls the
      unit, nothing calls the unit* (`check:wiring`'s reason for existing; `fetchSiteSnapshots` is
      the fresh example — fully checked, no caller anywhere), and *a fixture written from an
      assumption can only confirm that assumption* (the exploit amounts, 10^6 too high through 24
      passing checks; the Internet Archive's Jan-1 precision bug, wrong through 40, because the
      fixture used a field the live service does not send). It also tells the auditor to treat
      "these payload shapes have never met the live server" — which several adapters here say
      about themselves in comments — as an open finding rather than a caveat.

---

## ⛔ Exploit amounts were published 10^6 too high · **fixed 2026-07-31**

- [x] ~~`P0` **DefiLlama's `amount` is plain USD, not millions.**~~ — `toUsd` multiplied by 10^6 on
      the strength of the documented unit. The **first live `npm run check:feeds` run** printed
      `Aave V3 exploited — $862.00bn` and `Unizen exploited — $2100.00bn`, against real incidents
      of roughly $862k and $2.1m. `lib/onchain/exploits.ts` predicted this exact failure in its own
      header — *"If that is wrong every figure is off by 10^6 — obvious on a real run, invisible
      offline"* — which is what it turned out to be.
      This was the most serious defect the project has had: a specific, false, public claim about
      named organisations, on the one event kind whose whole design is about attribution being
      honest.
      - **Why 24 passing checks missed it.** `scripts/check-exploits.ts` built its fixtures in
        millions, so the test and the code agreed with each other and neither agreed with the API.
        A unit is a claim about the *outside world*; a fixture written from the same assumption as
        the code can only ever confirm the assumption. The fixtures are in dollars now, and two
        cases assert the live 2026-07-31 values specifically.
      - **The materiality filters were also inert.** `MATERIAL_USD` ($10m) and `CHAIN_FLOOR_USD`
        ($100m) were applied to inflated figures, so a $100 incident cleared a $100m floor — which
        is why `Exploits (eth)` returned 265 rows. They now do what they were written to do.
      - **`MAX_CREDIBLE_USD` ($10bn) is the new guard**: past that, disbelieve the number rather
        than print it. The largest real incident on record is under $2bn, so the ceiling is
        generous by five times and still an order of magnitude below what a unit error produces.
        The lesson is that the previous error was *renderable* — it passed every filter because
        nothing asked whether the figure was believable, only whether it was large.
- [x] ~~`P1` **A corrected title never reached the database.**~~ — `upsertEvent` updated `body`,
      `image_url` and `content_hash` on conflict but not `title`, while `contentHash` has always
      included the title. So a corrected headline bumped the hash, wrote the new body, and left
      the old title in place for ever. Found because this fix corrects figures that live *in the
      title*. A source that corrects itself must be able to correct us.
- [x] ~~`P1` **Clean up the rows already published.**~~ — `npm run fix:exploit-amounts`, dry run by
      default. Correcting the adapter does not heal them: most of these incidents fall below the
      materiality bar once the unit is right, so a re-ingest never revisits the row — it stops
      producing it and the wrong one stays on the timeline.
      Rows past the ceiling are deleted and re-ingested correctly on the next refresh. A row cited
      by a synthesis cannot be deleted (`ON DELETE RESTRICT`, and rightly — a citation that loses
      its referent is a claim with no evidence), so its figure is **corrected in place** instead.
      Verified against a real database: `$862.00bn → $862k` on a cited row, an uncited `$2100.00bn`
      deleted, and legitimate figures ($600m Ronin, $1.50bn Bybit) untouched.
- [x] ~~`P1` **Check the remaining live figures once.**~~ — done 2026-08-12, from a real
      `npm run check:feeds` run plus a direct `fetchExploits` call. **All 20 surviving eth rows
      are right.** Spot-checked against what actually happened: Ronin $624m, Poly Network $611m,
      Bybit $1.40bn, Nomad $190m, Euler $197m, WazirX $235m, Beanstalk $181m, Wintermute $160m,
      Poloniex $126m, Harmony $100m — each matches the real incident in date and order of
      magnitude. Nothing reads `$600` where `$600m` belongs, the range runs $100m–$1.40bn, and
      the bn/m formatting switches where it should. The 10^6 correction holds in live data, which
      is the thing only a run could tell us.

---

## Initiative: Search accuracy · `P1`

Search is the front door and the place a wrong answer does the most damage, and until now every
accuracy change has been judged by typing a phrase and looking at where it landed. That finds the
bug you thought of and nothing else. This initiative starts with the instrument, because none of
the items under it can be argued for or against without one.

- [x] ~~`P0` **Log what search resolves to.**~~ — done 2026-07-31. `db/015`, `lib/searchLog.ts`,
      `npm run search-report`, `npm run check:search-log` (34 offline checks). Every resolution
      records the query, what the parser made of it, which rung answered, whether the subject it
      routed to had events, and how long the ladder took.
      The headline number is **landed**: the share of searches that reached a subject with
      something on it. Rows whose outcome could not be determined are excluded rather than
      counted as successes — a metric that quietly scores its own failures as wins is worse than
      no metric.
      Privacy: query text only, no IP, user agent, session or join key to anything; capped at 200
      characters; no page or API reads the table; 90-day retention applied by the scheduled
      refresh rather than by whoever remembers. **Confirm this is the trade you want** — measuring
      accuracy needs the raw query, and hashing it would make the miss list useless.
      ✅ **Confirmed 2026-10-19 (owner, NC-042): keep it as is** — raw query text, 90 days, nothing
      else. The privacy policy, when written (NC-124), should say exactly this.
- [x] ~~`P1` **Invert parse and resolve.**~~ — done 2026-08-12, and **the premise was already
      half-stale when it was written down.**
      - **The regex stripping this item describes is not on the search path at all.**
        `parseSearchPrompt` is defined in `lib/prompt.ts` and called by nothing in `app/`, `lib/`
        or `components/` — the 2026-08-08 scope refocus took it off the path and the entry was
        never updated. The failure it names (`/topic/how-donald-trumps-presidency-affected`)
        cannot happen through search today.
      - **What is on the path is already the design this item asks for.** `headPrefixes` generates
        candidate spans longest-first and the resolver tests each against the corpus — "the corpus
        decides what is a subject name, rather than a list of English patterns" was built; what
        was missing is that each span was tested with *exact-ish* lookups, so a misspelt span
        still fell through.
      - Spans now go through the same scored `findCandidates` the whole query does. Verified
        against a real Postgres: `Ford earnings` → F via span "Ford"; **`forde motor earnings` →
        F via span "forde motor"**; `electirc cars history` → Electric car via span "electirc";
        `zzqqxx nothing here` → nothing. The middle two are new — an exact-only span test dropped
        both.
      - This completes the search-accuracy trio, and the third stale item found this session by
        checking a claim against the code before acting on it.
- [x] ~~`P1` **Score candidates instead of laddering.**~~ — the scoring half done 2026-08-12;
      **on-screen disambiguation is the remaining half and is recorded below.**
      - `findCandidates` (`lib/store/read.ts`, db/020 adds `pg_trgm` + GIN indexes) puts exact
        ticker, exact name, alias, name prefix and resemblance on **one 0–1 scale**, and
        `resolveSearch` uses it as its corpus rung. Identifiers are pinned above resemblance
        (ticker 1.00, name 0.97, alias 0.93, prefix 0.90) because an exact ticker is not "very
        similar", it is the thing itself.
      - **`word_similarity`, not `similarity` — measured, not guessed.** Plain trigram overlap
        dilutes against a long legal name: `"forde"` scores **0.19** against "Ford Motor Company"
        and **0.67** by word. That difference is the whole item. Verified on a real corpus:
        `forde` → Ford, `alibba` → Alibaba, `telegrafy` → Telegraphy, `electirc cars` → Electric
        car — every one of which previously matched nothing and fell through to the live rungs.
      - **Two false-positive classes found by measuring, and closed.** `"co"` scored 0.67 against
        "Ford Motor Company" (a partial hit on *Company*); `"company"`, `"motor"`, `"inc"` and
        `"group"` each scored a perfect 1.00, being genuinely words in the name. `worthFuzzyMatching`
        gates the fuzzy arms on length and on `WEAK_TOKENS` — **the same list the headline layer
        already uses**, reused rather than restated so the two cannot drift.
      - **Verified against a real Postgres**: cluster stood up in this container, db/020 applied,
        and the whole matrix above run against seeded subjects including two Fords and two Apples.
- [x] ~~`P1` **Disambiguate on screen when the top two candidates are close.**~~ — shipped
      2026-10-17 as NC-039 (batch 7): within 0.03 and not an exact ticker, the search box lists
      the choices and the search log records an `ambiguous` rung. Box ticked 2026-10-17, when the
      opportunity scout found it still open. The other half of the
      item above, and the half that needs a UI. `"Ford"` scores **1.00 against both Ford Motor
      Company and Ford Motor Credit Company**; `"APPLE"` likewise ties Apple Inc. with Apple
      Hospitality REIT. Today the shorter name wins silently, which is a better rule than rung
      order and still a coin toss presented as an answer.
      - The substrate is in place and wired: `findCandidates` already returns the ranked list with
        each candidate's score and *how* it was found (`ticker` / `name` / `alias` / `prefix` /
        `fuzzy`), which is exactly what a chooser needs to explain itself.
      - Deliberately not shipped as dead logic: an `ambiguous` flag computed and unused would be
        the same unwired-code smell five instances of which were deleted from this repo today.
- [x] ~~`P1` **Stop the last rung inventing.**~~ — fixed 2026-08-12. **The item was half shipped
      and I nearly closed it on that basis; measuring is what caught the other half.**
      - **The search half was already done** by the 2026-08-08 scope refocus: `lib/resolveSearch.ts`
        has no `assumed_topic` rung, so an unresolved query yields `kind: null` and mints nothing.
      - **The URL half was not.** A slug typed straight into the address bar still reached
        `firstPassTopic` → `getTopicTimeline`, and Wikipedia's search always answers. Measured
        live: **`best buy earnings q3` returns "TaxAct", with 21 events.** A visitor landing on
        `/topic/best-buy-earnings-q3` got a complete, confident timeline for a company they never
        asked about — worse than a miss, because a page that is honestly empty says so.
      - `articleAnswersSlug` (`lib/wiki.ts`) now gates both mint paths — the first pass *and*
        `ingestTopic`, since a junk slug reaching the request queue would otherwise be minted on a
        timer instead of by a visitor. A rejection records a real failure, not a timeout: the slug
        names nothing we can chart and the retry ladder should treat it so.
      - **Stem-tolerant on purpose, because the corpus depends on it.** `telegraph` legitimately
        resolves to *"Telegraphy"* and `electric cars` to *"Electric car"*; the relevance layer's
        `mentions()` does exact word-boundary matching, which is right for headlines and would
        have silently deleted both subjects here. A strong token must prefix-match in either
        direction instead. `check:ondemand` pins the live failure and both regression cases (29).
      - Conservative where it cannot judge: a slug of nothing but filler ("q3 earnings") is
        accepted, because being wrong that way costs a thin page while the other way deletes a
        real subject.
- [x] `P1` **"Did you mean": offer near matches from the committed EDGAR index when a search
      finds nothing.** ✅ **Done 2026-10-18 (batch 11)** — see that section for what shipped. Fuzzy matching exists only for subjects already held — `findCandidates`
      (`lib/store/read.ts:169`, `word_similarity`, db/020) recovers "forde" → Ford only when Ford
      is in the corpus — while the committed index, where every not-yet-ingested security is
      found, is matched exactly or by prefix (`lib/sec.ts:156-177`, `:208-228`). 352 of 10,387
      company titles contain "&" ("JOHNSON & JOHNSON", "PROCTER & GAMBLE Co", "AT&T INC."), so
      "Johnson and Johnson" matches nothing unless JNJ is held, and nor does any misspelling of a
      company not yet ingested. Those queries end at `unresolved` and "That didn't match a listed
      security" — a dead end at the front door, for a security the site could have answered.
      - Offer up to three near matches — companies and fund series — through the chooser NC-039
        built, which today lists only held candidates. **Never route on resemblance alone**, and
        treat "&" and "and" as the same. When the fund-name rung finds several funds
        (`lib/sec.ts:218`), offer them rather than falling through to prefix salvage — the case
        NC-040 left open, where "S&P 500" lands on S&P Global (SPGI).
      - Trigram or word similarity in-process over about 29,500 names (10,387 company titles,
        19,141 series names), milliseconds per unresolved query, so the index still answers with
        the database down. A `suggested` search rung (one migration shaped like db/025); cases in
        `check:tickers` (still no request made) and `check:search-log`, plus a `check:ui` case for
        the offered list. `npm run search-report` already counts these misses, so the effect is
        measurable after launch.
      - Offline, one session; no key, licence or recurring cost. Improves as NC-051 keeps the
        index fresh.
      - *Derived from [`docs/proposals/2026-10-17-proposals.md`](proposals/2026-10-17-proposals.md)
        #3, approved 2026-10-18. Importance high · Efficiency high · Practicality high.*
- [ ] `P2` **Feed every real bad query into `check:prompt`.** The report's "rewrites that then
      landed on nothing" block exists to produce these. Cheapest accuracy work in the repo.
- [x] ~~`P1` **Bound the network on the search path, and say so when it runs out.**~~ — done
      2026-08-05, after a report that searches on a local instance were not working.
      `/api/resolve` awaited the SEC ticker index with no deadline, and `SearchBox` awaited the
      route with no deadline and no failure branch — so a throttled EDGAR (which is what a few
      `npm run refresh` runs produce, since it rate-limits by User-Agent) left the button reading
      "…" for ever with nothing on screen. The site's front door looked dead, and the cause was
      somebody else's server being slow.
      - Server: both network rungs get `NETWORK_BUDGET_MS` (3s). Verified with a deliberately
        stalled EDGAR — the route answered in **3.07s** instead of hanging, while an in-corpus
        company stayed at 26ms because it never leaves the machine.
      - Client: a 10s backstop, an amber message that says which kind of failure it was, a button
        that becomes usable again, and the message cleared as soon as the query is edited — a
        failure describing a query the visitor has since changed is its own small lie.
      - `network_timeout` (`db/016`) is a **sixth rung**, kept apart from `assumed_topic` on
        purpose: one says our parser could not identify the query, the other says a source was
        slow, and only the second is fixed by not asking it. A rejection is not a timeout either —
        EDGAR answering "no such ticker" quickly is knowledge, and it still logs as `edgar` or
        `assumed_topic`.
      - `check:ui` covers all four behaviours through route interception, because "EDGAR happens
        to be throttled today" is not a test.
- [x] ~~`P1` **The homepage advertised subjects it did not have.**~~ — done 2026-08-05, reported as
      *"if I click any of these examples it doesn't have a response"*.
      The chips were drawn from `CURATED` — 44 hardcoded subjects — with real ones merely
      *appended* by `/api/suggestions`, and `pickMix` then shuffled the whole pool uniformly. On a
      corpus holding three of them, the row still offered GME, quantum computing and nuclear
      power, and every example a first-time visitor clicked landed on "Not on News Charts yet".
      A suggestion is a promise about what is here.
      - The corpus comes first (`loadSuggestibleSubjects`), the seed pool only tops up what the
        corpus cannot fill, and stand-ins carry `padded: true` so `pickMix` offers every real
        subject before any of them. Blending alone was not enough — the pool was right and the
        *pick* was still wrong.
      - Picked on the **server** so the first paint offers real subjects rather than flashing
        curated ones and swapping them out on mount.
      - Fixed alongside: the old query filtered on no `kind`, so an industry row fell through its
        company test into a `/topic/sic-3711` link, which is not where industries live.
      - **Rotation now pauses while a chip is hovered or focused.** A swap takes 260ms and fires
        every 3.8s, so a click landing during one opened a subject the reader never chose — found
        while testing this, when a click went somewhere the test had not asked for.
      - Covered by `check:index` (the blend and pick rules, offline) and `check:ui` (the chips
        lead somewhere, and the hover pause).
- [x] ~~`P2` **Resolve without the network at all.**~~ — done 2026-08-12. `npm run sync:tickers`
      builds `data/edgar-tickers.json` (854KB, committed: 10,387 companies and 28,419 fund
      symbols), and `resolveCompany` reads it before it reads anyone. **Every security EDGAR knew
      at sync time now resolves with zero requests**; bounding that fetch was the previous fix,
      this is the removal.
      - **Local first, network still second.** A company that listed since the last sync is not in
        the snapshot and falls through to the live files exactly as before — local-first is not
        local-only, and `check:tickers` asserts that path with a fixture EDGAR "knows" and the
        index does not.
      - The check that matters is not "the index parses" but **"no request was made"**, so
        `check:tickers` replaces `fetch` with a recorder that throws: a resolver quietly reaching
        the network shows up as a failure rather than as latency. 19 checks.
      - **Both ticker files are genuinely needed** and the split is not what the names suggest:
        SPY resolves out of the *company* file (it is a unit investment trust), while VOO and VTI
        exist only in the fund file. Verified against both live files while building the index.
      - The SEC's own ordering is preserved on rebuild and asserted, because the name-prefix rung
        depends on it: "APPLE" reaches Apple Inc at row 1 rather than Apple Hospitality REIT at
        row 1,587 only because the file is ordered roughly by size. Sorting the index at any point
        would silently invert that.
      - The sync refuses to overwrite with fewer than 5,000 rows of either kind: a truncated
        upstream response would otherwise replace a good index with a broken one, and every
        dropped ticker would then resolve as "not a listed security" rather than as an error.
        The file records `syncedOn` so staleness is visible in the data rather than remembered.
        ↳ 2026-10-17 (NC-051): recorded was not visible — nothing read the date but a format
        check, and the file sat 66 days old. `npm run refresh` now warns past 35 days, and
        `check:live` fails EDGAR on it once sec.gov is shown to answer. The re-sync itself still
        needs a host that reaches sec.gov, plus a rebuild, because the index is built into the site.
      - ⚠ Fund *names* still cost one request (`data.sec.gov/submissions/CIK….json`) because the
        fund file carries no names — the open fund-NAME-resolution item. It is an enrichment and
        degrades to the symbol, which `check:tickers` pins.

---

## Initiative: On-chain events in the timeline engine · `P1`

**North star.** Give users a free, visual way to see on-chain history on a linear timeline —
network milestones, governance, stablecoin supply moves, exploits — pegged to the price chart so
they can see *what sparked a move*. Crypto assets have a continuous price series, so the existing
"peg events to the chart" feature works out of the box (e.g. Bitcoin halvings on the BTC price
chart).

**Fit.** An on-chain adapter drops into the existing ingest contract exactly like
`federal_register` / `sec_edgar`: a fetcher returns `TimelineEvent[]` (`sourceKey`,
`externalId`, `dedupBasis`, date, url), registered in `SOURCES` with a license + `commercialOk`
gate. Tx hash / `(contract, logIndex, blockHash)` is a natural `dedupBasis`, so ingest stays
idempotent for free.

### Open decisions

- [x] ~~`P0` **Subject model for coins/protocols**~~ — **decided 2026-07-28: reuse `topic`**, as
      the leaning suggested, but for a firmer reason than "no migration". The schema bars
      `kind='company'` without a CIK *and* a ticker, neither of which a crypto asset has and
      neither of which it would be honest to invent; a new `subject_kind` would mean a migration
      plus a fourth page type inheriting none of the timeline, scoring, SEO or follow behaviour
      topics already have.
      - ⚠ **The north star's "works out of the box" was not true.** Pegging events to a price
        chart was a *company-page* feature — `TopicExplorer` had no chart at all — so modelling
        crypto as a topic would have silently lost the one thing that makes a halving worth
        plotting. `TopicExplorer` now renders the price chart when a subject has price rows.
        Ordinary topics have none and are untouched, and Yahoo quotes crypto on the same chart
        endpoint (`BTC-USD`), so the series and its overlays came free.
- [x] ~~`P0` **New `event_kind`**~~ — **decided: dedicated `'onchain'`** (`db/009`). A news event
      is someone's *report* of a thing; an on-chain event *is* the thing, and its attestation is
      a block or transaction anyone can re-verify without trusting us or a publisher. Worth
      showing a reader, and worth filtering on.
- [x] ~~`P1` **Confirmation lag / finality policy**~~ — decided and built 2026-07-28,
      `lib/onchain/finality.ts`. **Ethereum: 1 hour. Bitcoin: 6 hours.**
      Expressed as *age*, not confirmation depth, because every adapter already holds a block
      timestamp — it is what dates the event — and none holds a chain tip to count back from
      without an extra request per event. Age is the same guarantee in the units we already have.
      Ethereum's hour is ~4.7× the two-epoch (~12.8 min) finality window, which absorbs missed
      slots and a lagging explorer. Bitcoin has no finality gadget, so depth is a probability:
      six hours is ~36 blocks, far past the deepest mainnet reorg outside a consensus bug, and
      it costs nothing because nothing here is time-sensitive to the hour.
      **Enforced at construction, not by convention.** `onchainEvent` now *requires* `blockTime`
      and returns `null` for a block that has not settled, so a future adapter cannot skip the
      check by not knowing it exists — the type system asks every time. It caught all three
      existing call sites the moment the signature changed.
      **Fails closed** on an unknown chain, a missing or nonsensical timestamp, or a block dated
      in the future. Each means "we cannot show this is settled", and when the mistake is
      permanent that has to behave like "it is not settled".
      This was the gate on the live stablecoin feed, which reads transfers newest-first and would
      otherwise have published a mint minutes old. `npm run check:onchain` asserts exactly that.
- [x] ~~`P1` **Address label source**~~ — **decided for Phase 0: hand-maintained only**
      (`lib/onchain/addresses.ts`), each entry carrying *why* we believe it. Etherscan's labels
      were rejected for now: republishing an explorer's tag without being able to show our work
      turns someone else's guess into a factual claim on our timeline about who moved money.
      Rule for adding one: identifiable from the issuer's own documentation or an on-chain role,
      never from an explorer tag alone. Revisit if hand-maintenance stops scaling in Phase 1.

### Phase 0 — Foundations & spike (free, zero reorg risk) · `P0` — **built 2026-07-28**

Prove the chart-overlay value on long-finalized events with no spend. Built; **live explorer
calls are unverified** — egress to mempool.space, Blockscout and Etherscan is blocked from this
container, so the adapters are verified against canned responses (`npm run check:onchain`, 22
checks) and the UI against seeded rows. One `npm run ingest -- --onchain all` on a networked
machine closes that gap.

- [x] ~~`P0` Add `'onchain'` to the `event_kind` enum + migration~~ — spec + `db/009`.
- [x] ~~`P0` Register an `onchain` entry in `SOURCES`~~ — id 15, `commercialOk: true`,
      "public domain (on-chain facts)", attribution naming each explorer.
- [x] ~~`P0` Seed 3–4 crypto subjects as `topic` subjects with slugs + aliases~~ — `btc`, `eth`,
      `usdc` in `lib/onchain/index.ts`, ingested by `npm run ingest -- --onchain <slug|all>`.
- [x] ~~`P0` **BTC halvings** adapter (keyless)~~ — heights are protocol constants (every 210,000
      blocks) but the **dates come from the chain**, because a halving happens when the block is
      mined. mempool.space first, Blockstream Esplora as fallback (same Esplora API, so the
      fallback is a base-URL swap). A height above the tip has no block, so a *future* halving
      drops out on its own — no date arithmetic to get wrong, and nothing scheduled is ever
      published as though it had happened.
- [x] ~~`P0` **ETH network milestones** adapter~~ — Frontier, The Merge, Shanghai/Capella, Dencun.
      *Which* blocks matter is curated (an upgrade happens when the network agrees it does); the
      **date is read from the chain** via Blockscout, keyless, with the published date as a
      fallback only when the explorer is unreachable. A settled historical fact should not vanish
      because an explorer is down.
- [x] ~~`P0` **One stablecoin's mints/burns** via Etherscan free key~~ — USDC `Transfer` to/from
      the null address, floored at $100m. The floor is load-bearing: USDC mints hundreds of times
      a month and an un-floored feed would bury a timeline in treasury housekeeping. The only
      Phase 0 adapter needing a key; without `ETHERSCAN_API_KEY` it returns nothing and the rest
      of the on-chain timeline is unaffected.
- [x] ~~`P0` Verify events render **pegged to the price chart**~~ — the demo works: `/topic/btc`
      shows the April 2024 halving marked on the BTC price series. **This is what forced the
      subject-model decision above** — topics had no chart, so "works out of the box" was untrue
      until `TopicExplorer` learned to render one for subjects that have prices.
- [x] ~~`P0` Confirm dedup/idempotency~~ — identity is the *chain* fact, never our wording: a
      halving keys on `btc-block-840000`, a supply move on its transaction hash. Re-running the
      seed reports `0 new`, and the fixture tests assert the dedup basis never contains a title we
      might later reword.

### Phase 1 — Curated on-chain adapter (breadth) · `P1`

- [x] ~~`P1` Generalise Phase-0 fetchers into a reusable module~~ — done 2026-07-28, and
      generalised *by adding tokens* rather than by inventing an abstraction first. The only
      things that actually differ between stablecoins are the contract, the decimals and the
      materiality bar, so those are the only things `Stablecoin` carries.
- [x] ~~`P1` Extend stablecoin coverage: **DAI and PYUSD**~~ — done 2026-07-28, each a
      `/topic/` subject of its own with its own supply timeline.
      **Thresholds are per token.** A bar is a claim about what mattered, and $100m is routine
      for USDC and most of a month for PYUSD; one number would either bury the small tokens or
      hide the big one's housekeeping. USDC $100m, DAI $10m, PYUSD $5m.
      **Decimals are per token**, and that is the trap the checks aim at: DAI is 18-decimal and
      USDC is 6, so reading DAI with USDC's decimals reports $50m as $50,000,000,000,000 — wrong
      enough to look like a bug, but it would render as a confident headline.
      ⚠ **USDT is deliberately excluded, not forgotten.** Tether's contract does not mint or burn
      through the null address: `issue()` credits the treasury directly and emits its own `Issue`
      event, `redeem()` emits `Redeem`. Reading null-address transfers would return *nothing* for
      USDT — indistinguishable on a page from "no material mints this month", which is exactly
      the silent-empty failure the Sources panel exists to expose. Covering it needs a second
      code path against those events; that is its own item, below.
- [x] ~~`P1` **USDT supply moves via `Issue`/`Redeem`**~~ — done 2026-07-28, `lib/onchain/usdt.ts`,
      as `/topic/usdt`. Reads Tether's own log events rather than null-address transfers, which is
      why it could never have been a row in the token table.
      **The topics are derived, not copied**, and that decision needed its own implementation.
      Filtering logs means matching `topic0`, the Keccak-256 hash of the event signature, and
      writing those 32 bytes from memory is the worst guess available here: a wrong topic matches
      *nothing*, and a feed returning nothing looks exactly like a token having a quiet month —
      the silent-empty failure, self-inflicted. Node's `crypto` cannot help, because its
      `sha3-256` differs from Ethereum's Keccak-256 in the padding byte and yields an entirely
      different digest. So `lib/onchain/keccak.ts` implements the permutation and is pinned
      against two published digests: the empty string, and the ERC-20 `Transfer` topic present in
      every token log ever emitted. If those match, every topic derived here is right.
      Amounts decode through `BigInt` before dividing: a billion-dollar mint in base units is
      past exact float range, and converting first would silently misreport the largest moves —
      which are the ones that matter most. The finality gate applies here as everywhere else.
- [x] ~~`P1` **Reorg safety:** ingest only finalized blocks~~ — done 2026-07-28 by the finality
      policy above; every on-chain event now passes the gate at construction.
- [x] ~~`P1` **Address labeling** map — provenance-tracked~~ — built 2026-07-28, and the result
      is **deliberately almost empty**, which is the finding rather than a shortfall.
      `ADDRESS_BOOK` holds the burn address and the three token contracts. `labelFor` names a
      counterparty when we can stand behind the name, and `describeCounterparty` says *"an
      address we haven't identified"* when we cannot — omitting the clause instead would imply
      the money went nowhere in particular, which is a claim we have not earned.
      **The exchange hot wallets and treasuries the item names are not in it, on purpose.** Those
      labels are community attributions carried by explorers, and this file's own rule bars
      adding an address on an explorer's tag alone: republishing one turns someone else's guess
      into our factual claim about who moved money. Every entry that *is* here can be checked by
      asking the contract what it is.
      **`npm run verify:addresses`** does exactly that — `symbol()` and `decimals()` over keyless
      public RPC — turning each provenance note from a written claim into one a machine re-checks.
      A wrong address fails silently in both directions (never matches, so a counterparty goes
      unnamed; or matches the wrong contract, so events are filed under the wrong token), and
      neither shows up on a page. The decoder handles both `string` and `bytes32` symbols, because
      assuming the ERC-20 standard form on a `bytes32` token reads the length slot as text and
      would fail a perfectly correct address.
      ⚠ **Run it on a networked machine** — every entry reports "unreachable" from this container,
      and the script says so rather than reporting a clean bill of health. Verified counts are
      kept separate from skipped ones for the same reason.
      **To add an exchange or bridge:** cite the operator's own documentation or an on-chain role
      in `provenance`, and prefer an entry `verify:addresses` can re-check.
- [x] ~~`P1` Deterministic relevance floor~~ — done 2026-07-28, and it found a live cost leak.
      `deterministicScore` used to end in a bare `return null`, so **every event kind it had not
      been taught about was sent to the paid model tier by default** — silently, and forever.
      On-chain was exactly that case: a USDC mint read off the USDC contract is as certain as a
      filing under a CIK, and it was queued for a model to assess its aboutness. Paying to
      re-judge the one kind of event whose whole value is that it is certain.
      Now **exhaustive over `EventType` with no default arm**, so adding a kind stops compiling
      until someone decides which side of the line it belongs on. Verified by adding a fake kind
      and watching the build break.
      Scored from provenance (never reaches a model): `onchain` and `corporate_action` at 1,
      alongside the existing `filing`/`earnings`/`history`; `annotation` at 1 so a reader's own
      note is never paid for; `citation` at 0.9 — structural link to the subject, but the cited
      *work* can be broader than the subject it supports.
      **Only `news` with an oblique headline and `regulation` still reach the paid tier**, both
      deliberately. A Federal Register rule arrives via a keyword query built from the industry's
      name, so whether it bears on that sector is precisely the judgement provenance cannot make
      — scoring it here would be inventing certainty. That is the pattern this item names, and it
      is now the *only* thing left to the model besides ambiguous headlines.
      Materiality for on-chain is settled upstream: a supply move below its token's bar is never
      ingested, so every on-chain row that exists is one already judged worth showing.
- [ ] `P2` Backfill throughput: paginated `eth_getLogs` with back-off; document each source's
      reach (genesis) and rate limits.

### Phase 2 — Governance & protocol events · `P1`/`P2`

- [x] ~~`P1` **Snapshot GraphQL** adapter (keyless)~~ — done 2026-07-28 for **Uniswap and Aave**
      as `/topic/uni` and `/topic/aave`. Compound and Maker are left off deliberately: both run
      governance largely on their own on-chain systems rather than Snapshot, so a space id for
      them would be a guess, and a wrong space id returns an empty list that reads as "a quiet
      month" rather than "we asked the wrong place". `npm run check:feeds` now reports per space
      so that zero is visible.
      **A new `governance` event kind (`db/011`), not `onchain`** — and this is the decision that
      matters. A Snapshot vote is signed messages tallied by a hub: there is no transaction
      behind it, and the change it authorises executes later, elsewhere, or never. Filing it
      under `onchain` would claim exactly the re-verifiable proof that kind exists to mean. The
      copy on every row says the vote is off-chain and records the decision, not its execution.
      **The real trap was reading the tally.** Snapshot choices are free text in no fixed order,
      so `scores[0] > scores[1]` is wrong for any space listing "Against" first. The winner is
      decided by score and then classified by wording, and where the wording is neither plainly
      affirmative nor negative — a multi-option proposal, an abstain winning — the outcome is
      reported as **"decided: <option>"** rather than forced into pass/fail. Ties and unvoted
      proposals produce no event at all. Saying a proposal passed when it was rejected is worse
      than missing every one of them, and `npm run check:governance` (33 cases) is mostly aimed
      there.
      Protocol subjects carry **no price series on purpose**: pairing a governance timeline with
      a token chart invites reading a vote as a trade signal, which is a chart we would have to
      defend.
      ⚠ Payload shape is from Snapshot's published GraphQL schema; unverified live from here.
- [x] ~~`P1` **Exploits/hacks** feed~~ — done 2026-07-28, **sourced rather than curated, and
      attributed rather than confirmed.** Both departures from the item as written, both
      deliberate.
      *Sourced, not curated:* a hand-written incident list would have been me writing dates and
      dollar figures for real security failures at real organisations from memory, with no way to
      check any of them from this environment. `lib/onchain/exploits.ts` reads DefiLlama's public
      keyless hacks dataset instead, so nothing here is my recollection.
      *Attributed, not confirmed:* the item asks for on-chain confirmation before ingest. This
      does not do that, and does not imply it — every row names DefiLlama, links to the record,
      and its own copy says *"not confirmed on-chain by News Charts."* A new `exploit` kind
      (`db/012`) keeps the distinction visible: an `onchain` event is one we read from a block and
      a reader can re-verify; an exploit is someone else's finding that we are repeating. Adding
      true on-chain confirmation stays open below.
      **Attachment rules matter as much as the data.** A protocol takes incidents naming it, by
      word boundary — a prefix match would put another project's loss on Uniswap's page. A
      *chain* takes only incidents above $100m: a bridge hack is a real event in Ethereum's
      history, every small exploit on it is not, and an unfiltered feed would bury the chain's
      timeline in other people's failures. Missing date, name or amount → not published at all.
      ⚠ **The amount unit is the one thing to check first on a live run.** DefiLlama reports
      *millions* of USD; if that is wrong every figure is off by 10⁶ — glaring on screen
      ("$600" where "$600m" belongs), invisible offline. `npm run check:feeds` reports each
      target so it is visible immediately.
- [ ] `P2` **Confirm exploits on-chain before ingest** — the stronger guarantee the item above
      originally asked for. Needs a transaction reference per incident and a check against the
      chain, on the pattern of `npm run verify:addresses`. Until then the `exploit` kind and its
      copy carry the weaker claim honestly rather than overstating it.
- [ ] `P2` **Tally / on-chain governance** for executed proposals (parameter changes).
- [ ] `P2` **DefiLlama** protocol launches / TVL inflection events.
- [x] ~~`P2` **Industry/sector grouping** for crypto~~ — done 2026-07-28, `lib/onchain/sectors.ts`:
      `/industry/sector-stablecoins`, `sector-layer-1`, `sector-defi-governance`.
      **Reuses `kind = 'industry'` rather than adding a fourth subject kind.** A new kind would
      need a migration, a fourth page type, and would inherit none of the timeline, SEO or follow
      behaviour industries already have — for a distinction that is ours, not the reader's. No
      migration was needed at all: `sic` is nullable and only companies are constrained.
      Membership rows record `source = 'curated'` rather than `'sic'`, which is the honest
      provenance — nobody assigned these categories, we did, and that is a different kind of
      claim from a SIC code an issuer filed.
      The point is aggregation: a stablecoin sector page puts every issuer's supply moves on one
      axis, which is where a redemption wave is legible. On any single issuer's page it looks
      like an ordinary week.

### Cross-cutting for this initiative

- [x] `P2` **"Biggest moves" on priced topic pages.** ✅ **Done 2026-10-19 (batch 16).** A topic
      with a price series (BTC, ETH) now shows the panel a company page has, below its chart. Its
      catalyst table already weighted exploits, halvings and governance votes, kinds that never
      occur on a company page, so that logic was unreachable until now. Check: 2 in `check:ui`, on
      the seeded halving-day move.
      - *Derived from [`docs/proposals/2026-10-17-proposals.md`](proposals/2026-10-17-proposals.md)
        #10, approved 2026-10-19. Importance low (outside the current scope) · Efficiency very
        high · Practicality high.*
- [ ] `P0` **Licensing gate:** keep all sources `commercialOk: true` — raw chain facts + public
      explorers only. **No Dune/Nansen aggregations in the ad-supported path** (TOS), same
      discipline as the Google-News-RSS bar.
- [x] ~~`P1` **Cost monitoring**~~ — done 2026-07-28. `npm run cost-report [days]`.
      Two halves. **Observed** reads `source_fetches`, which has logged every request since the
      start, and separates throttles from empties — only a throttle means "we asked too often",
      and burying it among the outcomes that mean "the source had nothing" is how the signal gets
      lost. **Projected** works out what the current refresh windows cost per tracked subject and
      compares it against each free tier, in `lib/ingest/quota.ts`.
      The number worth having is **subject capacity** — it turns an abstract quota into "this
      tier covers ~25 subjects", which is the form the buy-or-drop decision in the release gate
      actually takes.
      The projection is deliberately a **floor**: one request per source per window per subject,
      counting no retries, no second pages, no manual runs. Where it says "tight" the real answer
      is probably "over". Flattering the budget would be worse than not reporting it.
      **First run already found one:** EODHD sits at **100% of its free tier at five subjects**
      (~20 calls/day, and the free plan may exclude news entirely). GNews covers ~25 subjects,
      Marketaux ~16. Everything else has room. Those are the numbers behind the licensing
      decisions above.
- [x] ~~`P1` **AI-cost discipline**~~ — done 2026-07-28, in three parts.
      **Filter before enrichment** — already shipped as the deterministic relevance floor above:
      on-chain, governance, exploits, filings and corporate actions are all scored from
      provenance and never reach a model. Only oblique news headlines and regulations do.
      **Content-hash keying verified, not assumed.** Both paid tiers already had it and it holds:
      `event_enrichments` is unique on `(event, task, model, prompt_version, input_hash)`, and a
      synthesis keys on the hash of every cited event's own content hash — change the text and it
      regenerates, otherwise it is never bought twice. Scoring skips anything already scored.
      **Estimate before spending, which was the real gap.** Both scripts reported an accurate
      cost that arrived too late to act on. `lib/enrich/cost.ts` now prices a pass *before* it
      runs and stops above a **$1 cap** (`--max-usd` to raise it). Not a budget — a tripwire: any
      single run costing more than about a dollar means something changed, and that is worth one
      human glance. The estimate is deliberately pessimistic (3 chars/token, per-batch overhead
      counted) because an estimate that undershoots defeats its own purpose, and an unknown model
      is priced at the *dearest* known rate, since an unknown model is usually a newer one.
      **Spend is now recorded, not just printed.** `db/013` adds token columns to `syntheses` —
      `event_enrichments` always had them, syntheses never did, so every explanation run's cost
      went to a terminal and was lost. `npm run cost-report` totals both, shows deterministic
      (free) against model (paid) scoring side by side, and refuses to count the pre-`013` rows
      that genuinely have no figure rather than treating them as zero.
- [x] ~~`P2` **Attribution UI:** render chain/explorer attribution on event cards + footer.~~ —
      done 2026-07-28. An on-chain row now reads `Bitcoin · block 840,000 · via mempool.space`,
      and the footer credits the explorers separately from the other sources.
      The ordering is the argument. The chain is where the fact comes from; the explorer only
      read it for us, and any other explorer would answer the same. Leading with the explorer's
      name credited it with the claim and quietly made the row only as good as one company's
      uptime. The adapters' source labels were carrying the block height themselves
      (`Bitcoin block 840,000 (mempool.space)`), which is why they now name the explorer alone.
      Two things had to be fixed to make this possible at all: `loadEvents` was dropping the
      attestation's `external_id`, so a stored on-chain row could not say which block it came
      from even though the value was sitting in the database; and the chart legend check read
      the whole page for "On-chain", so it started failing the moment the footer mentioned the
      phrase — it now reads the legend element. The condensed stack card is deliberately left
      without the reference: it is one truncated line wide, and a block height would push the
      explorer off it.

### Reference — historical depth (how far back)

On-chain data has a hard floor at genesis, and it's young. Name it; don't fake depth.

| Chain / data | Reaches back to | Notes |
| --- | --- | --- |
| Bitcoin (genesis) | **2009-01-03** | Absolute floor — nothing on-chain predates this |
| Ethereum (genesis) | **2015-07-30** | Frontier launch |
| Most DeFi / governance | **~2020+** | Protocol-dependent |

Within these bounds data is complete and gap-free (immutable chain); the only constraint is
backfill throughput, handled by back-off + idempotency. Contrast News Charts' other sources
(Chronicling America → 1800s, Wikipedia → further): **crypto subjects have short timelines, on
purpose.**

### Reference — cost (target: $0 recurring for v1)

| Source | Depth | Cost | Key |
| --- | --- | --- | --- |
| mempool.space / Blockstream Esplora (BTC) | 2009 | free | keyless |
| Etherscan API family (ETH + L2s) | 2015 | free tier 5/s, 100k/day | free key |
| Blockscout | per-chain genesis | free/open | keyless |
| Snapshot GraphQL (governance) | ~2020+ | free | keyless |
| DefiLlama | protocol-dependent | free | keyless |
| Dune / Nansen / Alchemy paid | genesis, decoded | **$$** | paid — later only |

---

## Backlog / later ideas

- [ ] NFT collection launch/mint milestones as timeline events.
- [ ] Whale / large-transfer events (needs strong relevance filtering to avoid noise).
- [ ] Staking milestones (ETH beacon deposits, validator counts).
- [ ] Multi-chain expansion (L2s, Solana) once the EVM adapter pattern is proven.

## Initiative: Historical article resurfacing — expand beyond Wikipedia · `P1`

**North star.** Resurface the *actual articles/sources from a period*, not just narrate it.
Today Wikipedia does double duty badly: `getTopicTimeline` slices one or two *History of X* /
*Timeline of X* articles into ~60 dated sentences, and **every event deep-links back to the same
article** — dense on screen, redundant as sourcing. Reframe Wikipedia as **skeleton + source
index**, and add real archives to close the **1963–2017 gap** (Chronicling America covers
pre-1963, GDELT covers 2017+; the modern era has no real-article source today).

### Coverage map (which source owns which era)

| Source | Reaches back to | Cost / key |
| --- | --- | --- |
| Chronicling America (LoC) — *have it* | ~pre-1963 (public domain) | keyless |
| NYT Article Search | **1851** | free BYO key |
| The Guardian Open Platform | **1999** | free BYO key |
| GDELT — *have it* | 2017 | keyless |
| Wikipedia citations | mixed (per article) | keyless |
| Google / alt discovery engine | present-day web | keyed, quota-capped |

### Backlog

- [x] ~~`P0` **Mine Wikipedia *citations***~~ — **shipped in PR #9** (merged 2026-07-27).
      `lib/wiki.ts` parses each article's `{{cite …}}` templates into a `citation` event kind
      (migration `007`), deduped by URL and spread-capped at 160; prose is demoted to connective
      narrative (1 sentence/year, 40/page). This was the item the initiative was named for.
- [x] ~~`P1` **Internet Archive adapter** (advancedsearch + Wayback CDX)~~ — done 2026-07-28.
      `lib/archive.ts`, keyless, wired into both the topic and company ingest paths under source
      key `internet_archive` (id 16, `commercialOk: true`) with a 24h window. Items land as
      `citation` events, so no new event kind and no migration.
      What is used is the *index* — an item's title, date and identifier, plus a link to
      archive.org. Item content is never copied or served from here, which is what keeps the
      ad-supported path clear; republishing the content itself would be a different question and
      this adapter does not ask it.
      The archive's metadata is uneven by design, so the parsing is where the risk sits and
      `npm run check:archive` (39 cases) is aimed there: **a bare year stays year-precision**
      (normalising "1922" to a specific day would put a March pamphlet in January), a
      `collection` is not an event (its date says when someone made a folder), a multi-valued
      title takes one value rather than rendering "a,b", and the Wayback CDX **header row is not
      a capture** — treating it as one produced a snapshot dated "timestamp".
      ⚠ **Both payload shapes come from archive.org's published API docs and are unverified
      live** — egress is blocked here, the same standing caveat as every other adapter in this
      repo. The checks prove the parsing, not the endpoint.
- [x] ~~`P1` **NYT Article Search adapter** (archive to 1851)~~ — **shipped in PR #9**
      (`getNytNews`). ⚠ Plumbed as a **server** env key, not the browser-side BYO pattern the
      item asked for — see the BYO-key item under Cross-cutting, which is still open.
- [x] ~~`P1` **Guardian Open Platform adapter** (to 1999)~~ — **shipped in PR #9**
      (`getGuardianNews`), same server-env caveat as NYT above.
- [ ] `P2` **Google Programmable Search** (Custom Search JSON API) as a **present-day discovery
      layer only** — accept the 100/day free cap and weak historical date-filtering; it searches
      the live web, not archives, so it is *not* a time machine.
- [ ] `P1` **Evaluate an alternative search engine to Google** — Bing Web Search, Brave Search
      API, SerpAPI, Marginalia, DuckDuckGo (and similar). Compare historical reach, date-filter
      quality, quota, cost, and ToS for an ad-supported product; pick the best discovery engine,
      which may replace Google rather than supplement it.

### Cross-cutting

- [x] ~~`P1` **Licensing gate**~~ — done 2026-07-28. Every source carries `commercialOk` + a
      licence note in `SOURCES`, and `COMMERCIAL_MODE=true` now enforces the second half — only
      commercial-safe sources can feed the ad-supported path. See the feed gate above for how it
      works and `npm run check:commercial-mode` for the proof.
- [x] ~~`P1` **BYO-key plumbing** for the keyed sources~~ — done 2026-07-28 for NYT and the
      Guardian, mirroring the AI-model-key pattern. `lib/feedKeys.ts` stores the keys in
      localStorage, `lib/feeds/browser.ts` fetches browser → publisher with no proxy of ours,
      and `useVisitorFeeds` merges the results into the rendered timeline.
      **Nothing fetched this way is persisted**, and that absence is the whole feature. Writing
      those articles into the shared database would make this site the redistributor and undo the
      licensing argument entirely — so they live for the life of the page and are gone on reload.
      Parsing is deliberately identical to the server adapters (same fields, same `storyKey`
      identity, same source key), so an article dedups the same whichever way it arrived.
      This is now a **real option against the feed gate above**: NYT has no self-serve commercial
      tier and the Guardian's free key is non-commercial, so under a server key the operator is
      the licensee — which an ad-supported product cannot be. Under the visitor's key, they are.
      It does not remove the decision, it prices it: BYO reaches only visitors willing to get a
      key, so the choice is now "buy licences" versus "deep archive for the motivated few".
      ⚠ **Unverified live on two counts**, and the second is new: egress is blocked here, and
      browser-side use additionally depends on each publisher sending permissive CORS headers,
      which nothing offline can test. **A CORS rejection looks exactly like a wrong key — no
      articles, no error** — so this needs one run on a real machine with a real key before it is
      claimed to work. `npm run check:feed-keys` (29 cases) pins the parsing and the failure
      modes; `check:ui` asserts the key reaches localStorage, never reaches a News Charts origin,
      and is genuinely forgotten.
      **Not done:** the discovery engine, which has no adapter yet — it belongs with whichever
      engine the evaluation item picks.
- [x] ~~`P1` **Dedup basis = article URL**~~ — shipped in PR #9. One wire story surfaced by three
      outlets collapses to one event.
      - **Corrected 2026-08-12** (audit §9): this entry credited `dedupByUrl` in `lib/newsExtra.ts`
        by name. That function was superseded by the `storyKey` work and had **no caller at all** —
        the mechanism doing this today is `collapseNearDuplicates`, called from three sites in
        `scripts/ingest.ts`, which keys on `storyKey` rather than on the URL. `dedupByUrl` is now
        deleted. A done log naming a dead function as the live mechanism is exactly the drift this
        file's own rule is meant to prevent, and it survived because nobody re-read the entry
        against the code.
- [x] ~~`P2` **Coverage-map doc**~~ — done 2026-07-28, `docs/COVERAGE-MAP.md`: who owns which
      era, what it means per subject type, and where the holes are.
      The reason it is worth having written down: *"the timeline starts in 2017"* is almost always
      a statement about **our sources**, not about the subject, and those are very different
      claims to put in front of a reader. A company founded in 1903 whose page begins in 2017 has
      not had a quiet century.
      **The biggest hole is 1963–2017** for anything outside the NYT and the Guardian —
      Chronicling America stops around 1963 on copyright grounds, GDELT is queried from 2017, and
      the keyed aggregators are days-to-weeks deep. A subject whose most interesting decades sit
      in that window looks sparser than it was. Worth knowing before deciding which licences to
      buy: the aggregators add breadth to the present, never depth to the past.

## Initiative: Hardening & follow-ups from the feed/UX build-out (2026-07 session)

Consequences of what shipped on PR #9 (citation mining, NL prompts, pre-IPO story, crosshair
popup, filing stacks, collapsible list, 8 new news repositories), ranked by value-per-effort.

- [x] ~~`P2` **Give industry pages their own OpenGraph card.**~~ — done 2026-08-12.
      `app/industry/[slug]/opengraph-image.tsx` renders "*&lt;Industry name&gt; · sector timeline*"
      where the generic site card used to be, so the `summary_large_image` these pages already
      promised is now kept.
      - **It reads the database, unlike the company and topic cards, because an industry slug is
        an opaque identifier rather than a name.** Ingest writes `sic-3711` and
        `sector-stablecoins`, so building a title from params alone — the rule the other two
        cards follow — would render "Sic 3711", worse than the card it replaces. Not a new
        dependency: the page itself cannot render without the same `loadIndustry` call.
      - Degradation, not failure: an unreachable database falls back to `industryTitleFromSlug`
        (`sic-3711` → "SIC 3711", `sector-stablecoins` → "Stablecoins") instead of throwing
        mid-card, per the schema doc's rule that enrichments degrade pages rather than break them.
      - `check:index` now asserts **every publicly indexed kind has an `opengraph-image` route** —
        the gap existed because nothing named the set — plus the fallback titles and the fact that
        the route guards its database read. 17 → 26 checks.
      - **The proposal, kept because it called the design problem correctly**
        *(opportunity-scout, 2026-07-30 — approved; carried over from the closed PR #15)*: these
        pages are publicly indexed — `lib/seo.ts`'s `subjectPath()` maps `kind === "industry"` to
        `/industry/${slug}` and `app/sitemap.ts` emits every indexed subject through it — while
        `app/industry/[slug]/` held only `loading.tsx` and `page.tsx`, so it fell through to
        `ogCard("Timelines for analysts", …)`. *"The sector timeline is the most distinctive thing
        the product makes, and it is the one page type whose preview says nothing about what is on
        it."* It also flagged the wrinkle in advance — the other cards are deliberately fetch-free,
        but a card reading "sic-3674" would be worse than the generic one — and proposed falling
        back to the generic card on a failed lookup. The build improved on that last part: a
        slug-derived title says *which* sector even with the database down, where the generic card
        says nothing at all.

- [x] ~~`P0` **Commit the browser smoke pass**~~ — done 2026-07-28. `npm run check:ui`,
      **64 checks**, committed with Playwright as a devDependency. It is what caught every defect
      in this branch that `tsc` and `next build` could not see: a price overlay silently replaced
      by a notice, a chart sizing itself to 2102px on a phone, a filter chip rendering inactive so
      its rows never appeared, a legend advertising event kinds the page did not have.
      Runs against the seeded corpus, so it needs `npm run db:seed-demo` and a dev server; pass
      `-- --base <url>` for a server on another port. It falls back to any Chromium on the machine
      when Playwright's pinned build is absent, because a suite only has value if it gets run.
      Asserts behaviour rather than presence where it matters — that the chart *repaints* when an
      overlay is toggled (every series shares one canvas, so counting canvases proves nothing),
      and that Biggest moves pairs a move with the *prior* day's after-close earnings.
- [x] ~~`P0` **Commit the parser assertions from the PR #9 session**~~ — done 2026-07-28.
      `npm run check:parsers` (31) covers year extraction with its ticker and domain false
      positives, the company prehistory guard, and the implausible-press floor; `check:dates`
      (20) covers cite-date parsing. **Seven offline suites now run together as `npm run check`**
      — parsers, dates, news quality, refresh windows, prompts, on-chain, licence gate.
      These parsers decide *where an event lands in time*, and being wrong doesn't throw: it
      plants an event in the Middle Ages, drags the timeline's range with it, and leaves a page
      that looks fine to anyone not reading the axis.
      - ⚠ **Writing them found a live bug.** `in` was in the measurement unit list (inches) with
        a space allowed, so `\d+\s*in\b` masked the year in *"founded in 1903 in Detroit"* —
        the commonest preposition in English. `extractYear` returned null and the sentence was
        **silently dropped from the timeline** with nothing to show it had been. Inches now has
        to be attached (`27in`) or punctuated (`27 in.`), which is how a measurement is written.
        Every Wikipedia history sentence of the form "…in YYYY in PLACE" was affected.
- [x] ~~`P1` **Noise control for the aggregators**~~ — done 2026-07-28 (`lib/newsQuality.ts`,
      `npm run check:news-quality`, 23 cases). Both halves are pure functions, because each can
      fail silently in opposite directions: too loose and a timeline carries three copies of one
      wire story plus a listicle, too tight and a real story vanishes with nothing to show it
      ever arrived.
      - **Near-duplicate collapsing.** ⚠ This was not just a merge-time gap.
        `docs/EVENTS-SCHEMA.md` has always specified that a news event keys on **headline +
        publication date** — *"an AP story syndicated to 50 papers → one row, 50 attestations"* —
        and GDELT did exactly that, but **every other adapter keyed on its own URL**, so one wire
        story reaching us through three aggregators became three rows in the database, not just
        three rows on a page. All nine now use `storyKey`, which restores the documented contract
        and makes the attestation count the corroboration signal the schema intends.
        Normalisation strips a trailing *capitalised* masthead ("… — Reuters", "… | CNBC") and
        leading tags ("Exclusive:"), and the collapse keeps the **richest** copy rather than the
        first, since aggregators differ in whether they return a description or an image.
      - **Relevance floor.** A headline must name the subject by a *distinctive* token — matching
        on "motor" or "company" would let anything through. Applied **only** to the three
        keyword-searched general aggregators; the finance-native feeds query by ticker and their
        own entity tagging is better evidence than anything we could infer from a title, and
        GDELT has its own handling.
      - ⚠ **Thresholds are unverified against live data.** The tests fix the *behaviour*; whether
        the floor is too aggressive on real headlines ("Automaker recalls SUVs" names no subject
        and would be dropped) needs a run against live aggregators. Worth watching the Sources
        panel counts after `npm run ingest -- --ticker F`.
- [x] ~~`P1` **Per-source refresh windows + quota safety**~~ — done 2026-07-28.
      Freshness was all-or-nothing on `subjects.refreshed_at`: once a subject aged past its TTL,
      **every** source was refetched together. Worse, the page path never wrote `source_fetches`
      at all — only the CLI did — so it had no per-source memory to reason with.
      Each source now carries its own window (`lib/ingest/refresh.ts`), set by how fast it
      actually changes *and* how much quota headroom it has, **with quota winning where they
      disagree**: a feed silent because we burned its budget is worse than one six hours stale.
      Wikipedia daily, Chronicling America weekly (1800s scans will never change), GNews 6h.
      - `npm run check:refresh` asserts the arithmetic rather than the intent: GNews at 4
        requests/day/subject fits 25 subjects inside its 100/day cap, where the old shared
        60-minute window cost 24/day — a quarter of the cap for one company.
      - Fails open. If the freshness lookup errors, every source is treated as stale, which is
        exactly the previous behaviour; a page must never lose a feed to a bookkeeping query.
      - A `throttled` or `error` attempt does **not** count as "asked", so a rate-limited feed
        stays due for retry instead of being silenced for hours.
      - Because a partial refresh only holds part of the picture, the live path now serves the
        **union from the database** and falls back to what it fetched if that read fails.
- [x] ~~`P1` **Feed visibility in the UI**~~ — done 2026-07-28. `components/SourcesPanel.tsx`
      on every company and topic page: each source with what it contributed, how long ago it was
      asked, and its attribution + licence. Four states, colour-coded, and the middle two are the
      point — **"nothing returned" and "rate limited" used to look identical on a page**, which
      is precisely how a half-broken page misdirects debugging.
      It doubles as the per-source attribution the licences ask for, rendered next to the count
      of what each source actually gave us. Diagnostics only: it returns `null` on any error
      rather than letting a panel take down a page.
      The CLI half was completed earlier — `scripts/check-feeds.ts` distinguishes *withheld*
      ("blocked by COMMERCIAL_MODE", "no KEY set") from *genuinely empty*.
      - ⚠ Adding it reintroduced the grid `min-width:auto` overflow on a phone (727px in a
        390px viewport) — the third time that pattern has bitten. Caught by the browser suite,
        fixed with `min-w-0`. Worth remembering when adding any sidebar content.
- [x] ~~`P1` **Finish the approved "Both views" condense**~~ — done 2026-07-28. The horizontal
      timeline now has a **Condense / Expand all** control beside the zoom group, the counterpart
      to the list view's "Collapse all". Stacking was previously reachable only through settings,
      which is a long way to go to quieten a sprawling timeline.
      It is a per-view override of the preference (`null` means follow it), persisted per path
      alongside zoom and scroll position, so the choice survives following a source link and
      coming back. Any open stack closes on toggle rather than being left hanging over a track
      that has moved underneath it.
      - The `check:ui` assertion is that the track actually **restructures**, not that a label
        flipped — a control that toggled its own text while the layout stayed put would sail
        through a presence check.
      - Adding it pushed the toolbar past a phone viewport (454px in 390px). Same grid/flex
        shrink family as the three before it; fixed by letting the button row wrap.
- [x] ~~`P2` **Auto-expand on jump**~~ — done 2026-07-28. Collapsed sections keep zero-height
      anchors so a jump *lands*, but landing is not arriving: the reader was dropped on the closed
      header of the very thing they had just clicked. The chart now asks the list to open whatever
      contains the target date, and scrolls a tick later so the anchor is at its final position.
      Carried as `{ date, n }` rather than a bare date, so jumping to the same date twice re-opens
      it after a manual collapse. Covered in `check:ui`: collapse everything, jump, assert rows
      appear (0 → 15).
- [ ] `P2` **NYT Keyword facet → event tags.** Needs a tags field on events; would feed the
      focus/AI relevance filtering.
- [x] ~~`P2` **Month-level date precision**~~ — done 2026-07-28. `date_precision` has had a
      `'month'` value since `db/001` and nothing ever wrote it: "January 2015" was stored as
      `2015-01-01` at **day** precision, so the page printed "Jan 1" for a day the source never
      gave. An over-precise date is worse than a vague one — it reads as a fact.
      `TimelineEvent.yearOnly` (two states) is replaced by `precision: 'day' | 'month' | 'year'`,
      which made the type checker enumerate every site that had to change. `date` stays a full
      day so events still sort and plot; precision governs display only. Month-precision events
      group under their month as a **"Day not given"** node, the month-level counterpart of the
      existing "Year only" bucket.
      - ⚠ **Found a pre-existing bug while testing it:** the ISO pattern was unanchored, so a
        date *range* (`2015-01-05/2015-02-01`) matched its own prefix and was stored as a
        specific day — the one shape the parser's own doc comment promises to reject, reported
        as a fact. Anchored, and covered.
      - `npm run check:dates` (20 cases) covers every form the style guide allows, the rejects
        (ranges, seasons, `n.d.`, impossible days), and that all three precisions still sort
        correctly against each other. Part of the outstanding PR #9 parser-assertion `P0`.
- [x] ~~`P1` **Internet Archive adapter (keyless).**~~ → **duplicate**; shipped 2026-07-28 under
      the Historical article resurfacing backlog above. Left as a pointer so it isn't picked up
      twice.
- [x] ~~`P1` **Merge PR #9 to main**~~ — merged 2026-07-27. `.env.example` now also documents
      all eight news keys and `COMMERCIAL_MODE` (it was committed but listed only
      `DATABASE_URL` and `ANTHROPIC_API_KEY` until 2026-07-28).

### External audit findings (2026-07-26) — verified against the code

A second model audited the repo; each claim was checked against the actual implementation
rather than accepted. Verdicts recorded so nobody re-litigates them:

- [x] ~~Image thumbnails need next/image remotePatterns~~ — **refuted**: no `next/image`
      anywhere; `EventThumb` is a deliberate plain `<img>` with `loading="lazy"` and an
      `onError` that hides broken images (hosts are arbitrary and off-domain). Exactly the
      mitigation the audit asked for.
- [x] ~~`new Date("YYYY-MM-DD")` timezone day-shift~~ — **refuted**: every calendar-label path
      parses via string-split + `Date.UTC` (EventList, BiggestMoves, HorizontalTimeline period
      labels) or pure string slicing (PriceTimeline); chart time keys are date strings. Feed
      timestamps go through `toDay()` → UTC day, consistently. No bare `new Date("date")`
      grouping exists.
- [x] ~~`?focus=` injection into SQL/LLM~~ — **refuted**: focus never touches SQL (all pg
      queries are parameterized `$1`); it only rides the URL and pre-fills the visitor's own
      client-side AI instruction box, run against their own key. No server-side LLM ever sees
      it.
- [x] ~~`P2` **Virtualize very large event lists**~~ — **measured, not needed** 2026-07-28.
      The item's own trigger was "if profiling shows scroll jank", so it was profiled rather
      than assumed: `npm run db:seed-demo -- --stress` seeds a 600-event subject (all
      `citation`, the kind with no cap on it — Wikipedia history is already sampled to 60 by
      `capHistory`, so seeding history would have measured the cap instead of the list), and
      `npm run profile:list` drives it against a production build. At 600 rows — 10,362 DOM
      nodes, 96,480px of page, 13.3MB heap — scrolling holds 60fps: frame p50 16.6ms, p95
      18.0ms, worst 22.0ms, **zero frames over 50ms**, indistinguishable from the 36-row
      baseline (p50 16.6 / p95 18.8). There is no scroll jank to fix.
      The only cost that scales is mounting: remounting all rows after a filter toggle takes
      335ms vs 83ms at 36 rows. That is the part windowing would speed up, and it is not worth
      what it would break — rows must stay in the DOM for browser find-in-page and for the
      `dateAnchorId` targets that the price chart and Biggest-moves cards scroll to. The
      codebase already carries `CollapsedAnchors` as zero-height stand-ins precisely because
      one collapsed section removing rows broke those jumps; windowing would mean that
      workaround everywhere, permanently. Re-run the profiler if the caps ever rise.

## Initiative: Product ideas from external model review · vetted 2026-07-26

Each idea checked against the codebase before listing — several were cheaper than they look
(the data already arrives) and two were partly built already.

- [x] ~~`P1` **Volume bars + moving averages on the price chart**~~ — done 2026-07-28. The
      `volume` column existed in `db/001` from the start and nothing had ever populated it;
      it is now read from the Yahoo payload, persisted, and plumbed through `PricePoint`.
      Three toggles above the chart (**Volume · 50d avg · 200d avg**), all **off by default** —
      the price line and its event markers are what the page is for, and three more series is a
      busier chart than most readers want. Volume sits on its own overlay scale pinned to the
      bottom fifth so it never squashes the price line, and is coloured by the day's direction.
      An average whose window is longer than the available history draws **nothing** rather than
      a partial-window stub that would look like data.
- [x] ~~`P1` **Corporate actions on the timeline (splits, dividends)**~~ — done 2026-07-28.
      `events=div,splits` rides the *same* Yahoo chart request, so this costs no extra fetch,
      key, or rate-limit budget. New `corporate_action` event kind (spec + `db/008`) with its
      own fuchsia marker, badge, legend entry and "Splits & dividends" filter chip, so a
      mechanical change is never read as a reaction. Prices are split-adjusted and the line does
      not step, so the marker is the only thing that says a split happened — labelling, not
      correction, exactly as the item anticipated.
      - ⚠ **This surfaced a latent trap worth knowing about.** Both explorers seeded their
        default type filter from a *hand-written literal* duplicating `ALL_TYPES`. Adding an
        eighth kind left it filtered out by default — the chip rendered, inactive, and the rows
        never appeared — and `Set<EventType>` cannot be checked for exhaustiveness, so `tsc` was
        silent. Both now derive from `FILTERS`. **Any future event kind would have hit this.**
- [x] ~~`P2` **Sentiment coloring on event nodes**~~ — done 2026-07-28, keyless as the item asked
      (`lib/sentiment.ts`, `npm run check:sentiment`, 24 cases). A small green/red dot beside a
      headline, so **perceived** tone can be read against the **actual** price move — which is
      interesting precisely when the two disagree.
      Deliberately shy, because a colour on a financial timeline reads as a judgement *we* made
      and a confident wrong label is worse than none:
      - **Any opposing evidence means neutral**, not "whichever side has more". *"Profit rises but
        deliveries miss expectations"* is two positive words to one negative and is plainly mixed
        to a reader; calling it positive on a 2–1 count would be inventing a signal from
        arithmetic.
      - **Neutral renders nothing at all** rather than a grey dot. Absence is the honest form of
        "no opinion"; a third colour implies we looked and decided.
      - **Only news, press and citations are scored.** A filing, a halving or a reader's own note
        is a fact, not good or bad news.
      - Negation is checked across a three-token window, because English rarely puts them
        adjacent: *"not **a** miss"*, *"avoids **a** strike"*, *"denies **any** breach"*. A
        one-word lookback (the obvious implementation, and the first one written here) missed
        every realistic phrasing and inverted them all.
      - The lexicon is market-specific: "beat", "miss" and "cut" are near-meaningless in general
        English and unambiguous here. BYO-model rescoring can refine it later at no server cost.
- [ ] `P2` **AI primary-event summary nodes.** Overlaps the planned cross-feed near-duplicate
      collapsing (hardening list) — do the heuristic clustering there first; the DB's existing
      syntheses layer (synthesis + synthesis_citations tables) is the natural home for an
      AI-written summary node over a cluster. Sequence: cluster → then summarize.
- [x] `P2` **Macro-event overlay (Fed decisions, CPI prints).** Architecture already supports
      it: sector events merge into company timelines via subject membership — a curated "macro"
      subject whose events overlay any company page is the same pattern. FOMC/CPI calendars are
      public and keyless. Toggle off by default. *Done 2026-10-20 (batch 21, NC-080): a curated
      `us-economy` subject holds every FOMC statement since 1994 and every archived CPI release
      since 2008; company pages show them behind an Economy chip that starts off.*
- [x] ~~`P2` **Compare: per-side event markers on the price overlay**~~ — done 2026-07-28.
      Each subject's events now hang off its own line in its own colour: A's above the line,
      B's below, shaped by kind so a filing still looks like a filing. Side deciding position
      overrides the above/below convention used on single-subject charts, deliberately — there
      that convention separates scheduled facts from reactions, but here two lines cross, and a
      marker floating between them that could belong to either subject says nothing.
      Hovering names what is under the cursor, which is the part that makes the markers worth
      drawing: a dot you cannot identify tells a reader something happened and refuses to say
      what. The snapping, priority and nearest-day rules moved out of PriceTimeline into
      `lib/markers.ts` so the two charts cannot drift — a new event kind added to one glyph
      table and not the other would render as a marker on one page and nothing on the next,
      which reads as missing data rather than as a bug. `npm run check:markers` covers the
      edge cases that are invisible on screen (weekend snapping, busy days, pre-window drops).
- [x] ~~`P2` **Compare: industry-news intersection**~~ — done 2026-07-28. An event that landed on
      both subjects now reads as one happening: a single diamond on the strip's axis rather than
      a dot on each side, one row in the combined timeline chipped to both, and a count. Two
      companies under one regulation is a different fact from two companies that each had
      something happen on a Tuesday, and drawing it twice stated the weaker one.
      Identity is deliberately narrow. Sector events match on their database id, because both
      members genuinely read the same row; news, press and cited articles match on headline and
      day through the same normalisation that collapses syndicated copies. Everything else is
      unshared by construction — the first build merged Ford's and GM's identically-titled 10-K
      and called a filing calendar a shared event. `npm run check:compare` pins both directions:
      missing an intersection understates, inventing one misleads.
      Two fixture bugs surfaced and are fixed: the demo seed hung the Federal Register rule on
      Ford instead of on the industry, where `scripts/ingest.ts` puts it and `loadSectorEvents`
      looks for it — so GM never saw a rule that hit its whole sector; and seeded events keyed
      their dedup basis without the subject, so two companies' boilerplate filings collapsed into
      one database row. Every real adapter scopes its own basis (EDGAR keys on the accession
      number); the fixture now does too.
- [x] ~~`P2` **Private annotations on the timeline**~~ — done 2026-07-28. Note / Entry / Exit
      pinned to a date on any company or topic timeline, rendered as a cyan marker through the
      same machinery as everything else, and stored per subject path in this browser only.
      The privacy is the feature, not a limitation to apologise for: a thesis or an entry price
      is exactly what nobody should hand to a server they don't run, and because it never leaves
      there is no account to create, nothing to leak, and nothing to delete on request.
      `check:ui` asserts that directly — it writes a note containing a unique token and fails if
      that token appears in **any** outbound request.
      - Notes are merged in *after* the type filters and are never filtered out by them: the
        chips select **sources**, and a note the reader put there deliberately vanishing behind
        a source filter would be surprising.
      - `'annotation'` was added to the database enum (`db/010`) as well as `EventType` even
        though nothing writes it, so the two cannot drift apart. Ingest skips it for free —
        an annotation carries no source key.
      - Bounded (500 chars, 200 per subject) so a runaway paste cannot fill the origin's storage
        and take prefs and follows down with it. Malformed stored JSON is filtered, not thrown on.
- [ ] `P3` **Saved-focus alerts (email/push on new matches).** Real retention value, and the only
      idea in this file that needs infrastructure which does not exist.
      - **Blocked on, in order:** (1) the `P2` **accounts** decision below — this needs a user
        identity to alert, and taking one makes the project a **data controller**, with a user
        table, session security and a privacy-policy surface; (2) **an email or push provider**,
        a paid dependency and a deliverability problem rather than a library; (3) **background
        jobs**, which do not exist either — the only scheduled thing is `npm run refresh`, and
        that is the `P0` nothing runs yet.
      - **And on the premise:** *"defer until there are users to retain"* — the site has not
        launched, so the retention this buys is currently zero by definition. Re-checked
        2026-08-12: still true.
      - The keyless cousin already ships (Follow + "new since last visit"). The intermediate the
        earlier wording floated — highlighting saved-focus matches on return — is **deliberately
        not queued**: focus is part of the *shelved* prompt-search substrate, so it would be
        speculative work on dormant machinery for a product with no users. It becomes sensible
        after **Prompt search v2** lands, not before. *(v2 landed 2026-10-20, batch 19; the "no users"
        half of the reason still holds.)*
      - ⚠ Nothing here is a coding problem. Not buildable until (1) is decided.

## Initiative: Affiliate links on relevant surfaces · `P2`

Companion to CAEP's affiliate item (`docs/ROADMAP.md` in Crypto-Stuff — staking pages first,
across both its free web and desktop distributions). News Charts' own affiliate opportunities
are thinner but real, and the same integrity rules apply. **The two projects stay independent;
this is a shared revenue *pattern*, not shared code.**

- [ ] `P0` **Recognise what this triggers: affiliate revenue makes News Charts commercial.** That
      activates every item in the ⛔ pre-release feed gate above — NYT, Guardian, Newsdata,
      GNews, Currents, Marketaux, EODHD and Finnhub are all on non-commercial free tiers today.
      Adding a single paid link is the moment those licences must be resolved. **Do the feed
      gate first, or not the links.**
- [ ] `P1` **Neutrality rule.** News Charts' product *is* an unbiased historical record. An
      affiliate relationship must never influence which events, articles or sources surface,
      nor their ordering. Structurally: the ingest/ranking layers must not be able to read
      affiliate state, exactly as CAEP keeps it out of the risk engine.
- [ ] `P1` **Disclosure.** Per-link marking (FTC "clear and conspicuous"), `rel="sponsored
      noopener"` on paid links, and a "How we make money" page covering ads + affiliates
      together. The existing `AdSlot` placement is the natural place to establish the pattern.
- [ ] `P2` **Candidate surfaces** — only where an outbound link genuinely helps the reader:
      brokerage/data referrals on company pages; book or archive-subscription links on topic
      pages (a period-history reader is a plausible book buyer). The `AdSlot` placements are the
      slot pattern to follow — `CaepPromo` used to be the worked example of an in-page promo and
      was removed 2026-08-08, so a first affiliate unit starts from the ad slots, not from it.
- [ ] `P2` **Never paywall-launder.** Linking a reader to a paywalled cited article is fine and
      honest; taking a commission for it must not change which citations get mined or shown.
- [ ] `P3` **Measure click-through per surface before expanding, without shipping
      user-identifying analytics.** Doubly blocked, and the second block is the hard one.
      - **Blocked on, in order:** (1) the ⛔ **pre-release feed gate**, because the `P0` above says
        it plainly — *"do the feed gate first, or not the links"*; (2) **a first affiliate link
        existing at all**. There are none: verified 2026-08-12 by audit, `AdSlot` is a static div
        with no network call and no ranking input, and a repo-wide grep for `utm_`, `affiliate`,
        `[?&]ref=`, `partner`, `clickid` and `tag=` across `app/`, `components/` and `lib/`
        returns **only two prose mentions**.
      - So there is nothing to measure. Building the measurement first would be analytics for
        links that do not exist, designed against a privacy constraint with no real traffic shape
        to design against.
      - **What it will need when it is time:** per-surface counts that are aggregate *at the point
        of collection* rather than aggregated afterwards — a per-placement counter, not a session
        or visitor trail. "We anonymised it later" is a different and weaker claim than "we never
        held it", and that is a decision to take before the first counter, not after.

- [x] ~~`P1` **Relational search: answer the intersection, not the overlay.**~~ — done 2026-07-28,
      from a live prompt-testing pass. *"I want to see how Donald Trumps presidency affected IBM
      stock"* is asking for IBM's price with the IBM events that **also** concern Trump. Two
      things stopped that working.
      **The parser missed the shape entirely.** A *how* question with no auxiliary verb — "how
      Donald Trumps presidency affected IBM" rather than "how did X affect Y" — matched no
      relation pattern and fell through to a Wikipedia search for the whole sentence, producing
      `/topic/how donald trumps presidency affected ford`. The same pass found three more:
      "I'd like to **know** how…" left a "to know" behind (only "know about" was stripped), "what
      did X **do to** Y" had no pattern, and the perfect tense captured "AI **has**" as the
      influence. Plural "stocks" was not stripped either. `npm run check:prompt` covers all of it.
      **`focus` did nothing without an AI key.** It only pre-filled the BYO-model panel, so a
      keyless visitor asked the question and got an unfiltered timeline with their phrase sitting
      in a text box. `lib/focus.ts` now narrows the subject's own events to those that mention the
      influence — which *is* the intersection, since everything on the page already concerns the
      subject, sector regulations included.
      **A focus matching nothing shows everything and says so.** An empty timeline reads as "we
      have no data on this company" rather than "no overlap", so the zero is reported instead of
      rendered. `npm run check:focus` (20 cases) pins that rule hardest.
      ⚠ **This reverses the morning's routing.** Relational prompts went to `/compare`; the
      compose there draws the influence's *own* timeline, which answers "what was Trump doing"
      rather than "what did Trump do to IBM" — most of it never touches the company. The compose
      is still one click away from the focus bar, and `/compare` still handles an explicit
      "X vs Y".

- [x] ~~`P1` **`/explore` and `sitemap.xml` cached a database failure as "no subjects".**~~ —
      found and fixed 2026-07-28, after it produced a false test failure three times in one
      session and I finally stopped treating it as an environment quirk.
      `listIndexedSubjects` swallowed a failed read and returned `[]`, which is indistinguishable
      from an empty database — the same empty-versus-failed confusion the Sources panel exists to
      expose, except both callers are **cached** pages (`revalidate = 3600`, prerendered at
      build). A build that could not reach Postgres baked an empty listing *and an empty sitemap*
      into the output and served them for an hour.
      That is not a local annoyance: a build machine that cannot reach the production database is
      the normal case, not an edge one, so the shipped sitemap would have told search engines the
      site was the curated seed pool.
      The loader now returns **`null` for "could not ask"**, distinct from `[]` for "nothing
      indexed", and both callers respond with `unstable_noStore()` — which opts *that render*
      out of the cache, shows the curated fallback once, and lets the next request try again.
      Verified both ways: with Postgres up the routes build **static** with real data; with it
      down they build **dynamic**, so nothing wrong is cached. `npm run check:index` points the
      pool at a dead port and asserts the null, because a distinction like this is exactly what a
      later simplification quietly removes.

- [x] ~~`P1` **Refresh on a schedule, not on a page view.**~~ — done 2026-07-28, owner's call.
      Refresh used to be a side effect of traffic: a visitor arriving after a TTL expired waited
      on eleven feeds inline, several arriving together each triggered their own fetch, and a
      **database outage turned every page view into a live fetch** — burning the free tiers
      exactly when they could least be spared.
      **`npm run refresh` owns fetching now** (run it hourly; the tightest window is an hour, and
      anything shorter only re-asks sources that would decline). Per-source windows still apply
      inside each subject, so "due" does not mean eleven requests. Oldest subject first, so a run
      that cannot finish still makes progress on the stalest.
      **Pages read the database and nothing else.** `lib/page-data.ts` went from 449 lines to 122
      — every live-fetch path, TTL constant and persistence helper deleted, because live fetching
      belongs in `scripts/ingest.ts` and now lives only there. Cost is a function of how many
      subjects exist, a number we choose, rather than of how much traffic arrives, which is not.
      **Which needed a queue, or nothing new would ever enter the corpus** — a page view was the
      only thing that ever added a subject. `db/014 subject_requests` records what visitors asked
      for and the runner works it **most-wanted first**, which is the only fair way to spend a
      quota that cannot cover every request in one pass. A failed request stays pending: a source
      down this hour may answer the next, and a request quietly marked done is a subject nobody
      ever gets. Deliberately a table in the Postgres already running rather than a second store.
      **The 404 copy was a casualty worth catching.** "Nothing found" was true when only a bad
      URL reached it; now the likelier reader is someone who typed a real ticker nobody has
      ingested. It says so, and says the request was noted.

## Owner backlog (2026-07-26 brain dump)

News Charts-side items only. CAEP items went to that project's `docs/ROADMAP.md`; company-level
items (entity filing, federal regulation research, disclosure documents, "what does sellable
look like") went to a **separate business checklist** worked independently of both products —
`docs/BUSINESS-CHECKLIST.md` in the Crypto-Stuff repo.

- [x] ~~`P1` **Search-prompt coverage beyond the shapes it was built for.**~~ — reported and
      closed 2026-07-28, both halves. Original report:
      *"Barak Obamas effect on Ford stock"* returned junk twice. The parser only understood
      *"the history of X in Y"*; anything else went to `resolveCompany` verbatim, missed, and was
      handed to Wikipedia, which fuzzy-matched something unrelated — a confidently wrong page
      rather than an error. **Fixed** (`npm run check:prompt`, now 34 cases, was 10/24):
      - Relational questions — *"X's effect on Y"*, *"effect of X on Y"*, *"how did X affect Y"*,
        *"did X affect Y"*. **The subject is the thing affected**, because that is the side with
        a timeline and a price series; the influence becomes the focus and seeds the AI panel.
      - *"<name> stock"* — plain "Ford" resolves against the EDGAR index, "Ford stock" resolved
        against nothing. Trailing `stock`/`shares`/`share price`/`ticker` is now stripped, with a
        short compound denylist so "rolling stock" survives.
      - `/api/resolve` is now **database-first**, the same fix `/compare` needed: a throttled
        EDGAR ticker file used to turn every company search into a Wikipedia guess, from the
        app's main entry point. It also resolves aliases the live path cannot see
        ("bitcoin" → `btc`), which is what makes the Phase 0 crypto aliases reachable.
      - **The compose now happens** (2026-07-28). A relational prompt whose other side we can
        actually draw routes to `/compare?a=<influence>&b=<ticker>` — the influence supplies the
        events, the company supplies the price axis, which is the compose the item below built.
        `parseSearchPrompt` keeps the influence as its own field rather than only folding it into
        `focus`, and the focus still rides along so the AI panel sees the angle either way.
        The routing only fires when the influence is **known to be drawable** — a subject in the
        database, a company in the EDGAR index, or a Wikipedia page (one search request, not the
        dozen a real fetch costs). Otherwise it keeps the old behaviour. Trading a page that works
        for a compare with one empty half would answer the question with a warning, and a question
        answered partly beats that. The probe answers *false* on a network failure for the same
        reason: not knowing is not a yes.
        ⚠ **The Wikipedia branch is unverified live** — egress is blocked here, so "Barak Obamas"
        still falls back to Ford's timeline in this environment, which is the fallback working as
        designed. Verified end-to-end against seeded subjects instead: *"electric cars effect on
        Ford stock"* and *"how did GM affect Ford"* both land on the compose, *"zzqqxx effect on
        Ford stock"* falls back, and a plain "Ford" is untouched.
- [x] ~~`P1` **Topic timeline pegged to a company's stock price**~~ — done 2026-07-28, and the
      design question settled the way the item predicted: **a two-subject compose, not a new page
      type.** `/compare?a=<topic>&b=<ticker>` now plots the priced subject's series with the other
      subject's events on it. The pieces really did exist — `PriceTimeline` already takes a price
      series plus an arbitrary event list, so this was mostly deciding what *not* to draw.
      - **Only the other subject's events are plotted, deliberately.** Markers are coloured by
        event *kind*, not by which subject they came from, so merging both sides would give a
        chart where a Ford filing and a Trump speech are indistinguishable — the reader could not
        tell which claim they were looking at. The priced subject's own timeline is one click
        away on its own page.
      - The framing is inline and explicit: *"X supplies the events; Y supplies the price. Lining
        two subjects up in time shows coincidence, not cause — the same rule as Biggest moves."*
      - The chart legend derives from the plotted events, so a topic-over-company view advertises
        only the kinds that topic actually has.
      - ⚠ Events outside the price window cannot be plotted, so the value depends on price
        history reaching back as far as the events. Against the seed's 18-month series most of a
        topic's history falls off the left edge; against a real decades-long series it would not.
        Worth checking with `npm run ingest -- --ticker F` before judging the feature.
        *(2026-10-21, batch 22, NC-077: ingest now reads every daily close since listing — Ford's
        13,709 since June 1972 — where it read ten years, so a decades-old event has a price.)*
- [ ] `P1` **Test and fine-tune the AI tools.** The BYO-key ranking panel is the only AI surface
      here: check ranking quality across subject types, the 0.35 relevance cut-off, batch size,
      and behaviour when a model returns junk. (CAEP's 11 agents are tracked separately.)
- [ ] `P1` **Beta launch.** ⚠ Blocked by the ⛔ pre-release feed gate above — a public beta is a
      release, so licences and feed health must be settled first, not after.
- [ ] `P2` **Security deep-dive + what an account looks like (Google login?).** ⚠ Note the
      architectural shift: News Charts is deliberately accounts-free today — follows, prefs and
      view state are localStorage, and "your key never leaves your machine" is currently
      literally true. Accounts add a user table, session security, and a privacy-policy surface.
      They are also the prerequisite for the `P3` saved-focus alerts already parked above.
      Decide whether the retention gain is worth becoming a data controller.
- [ ] `P2` **Translation / i18n for the site.** Note what actually needs translating: the UI
      chrome can be localised, but the *events* are English-language sources — be explicit
      rather than shipping a half-translated page.
- [ ] `P2` **Which countries can access the site** (implementation side: geo-detection,
      blocking, or per-region content). The *decision* — which jurisdictions are worth the
      compliance cost — lives in the business checklist.
- [x] ~~**Rename the software to News Charts.**~~ Done 2026-07-28 (PR #11, merged) — **and
      reversed 2026-08-08, then reversed again 2026-08-12; the product is News Charts once
      more — see the two entries below.** Left here rather than rewritten: a done log that
      edits its own history to match the present is worth less than one that shows the
      decision was taken twice (now three times).
- [x] **Rename the software back to Chronolens.** Done 2026-08-08. Display name, header
      wordmark, OG images, SEO metadata and docs say **Chronolens**; the `chronolens` slug
      covers the npm package, the localStorage/event namespace, backup filenames and log tags.
      The GitHub repo is `Savoy11/chronolens` (old `News-Charts` URLs redirect), and
      `scripts/check-boundary.ts` accepts both names so a rename never reads as a scope breach.
      - The `app/layout.tsx` pre-hydration shim now migrates `news-charts:*` keys **back** to
        `chronolens:*`. One hop reaches everybody: visitors from the original Chronolens were
        moved to `news-charts:` by the shim this replaces. Getting the prefix lengths wrong here
        silently empties follows, prefs, notes, AI settings and feed keys — the naive
        search-and-replace produced exactly that (a loop that copied each key to itself and then
        deleted it), which is why the lengths are now written out in the comment.
      - **Closes a loose end rather than repeating it:** the live Postgres role/database was
        never renamed away from `chronolens`, so the docs and `.env.example` now match the
        database that actually exists. Nothing to migrate.
      - **Closes the other one too:** `scripts/backup.ts` retention now matches both
        `chronolens-*` and `news-charts-*` dumps, sorted by timestamp rather than filename
        (alphabetically every `chronolens-` dump sorts before every `news-charts-` one
        regardless of date, which would have pruned the wrong end). No dump from either era is
        orphaned, and the hand-deletion this entry used to ask for is unnecessary.
      - ⚠ The domain question below reopens: it pointed at Newscharts.ai on the strength of the
        old name.
- [x] **Rename the product back to News Charts.** Done 2026-08-12 (owner decision — the third
      naming decision; the entry above records the second). Display name, header/OG/SEO copy,
      UI text, the localStorage/event namespace (`news-charts:*`), the npm package name, the
      backup filename prefix, the EDGAR/Wikipedia User-Agent strings, log tags and docs all say
      **News Charts** again. The GitHub repo is `Savoy11/News-Charts` (both names resolve), and
      `scripts/check-boundary.ts` keeps accepting both, per its own rule.
      - The `app/layout.tsx` pre-hydration shim migrates `chronolens:*` keys **back** to
        `news-charts:*` — direction reversed, same existing-key-wins semantics, prefix lengths
        (11 → 12) written out again rather than trusted to a search-and-replace. One hop still
        reaches everybody: both Chronolens eras left keys under `chronolens:`, and a visitor
        who last came during the News Charts era already holds `news-charts:` keys, which the
        shim leaves untouched.
      - **Deliberately unchanged:** the live Postgres role/database keeps its original
        `chronolens` name — renaming running infrastructure is owner work, not a code change,
        and `.env.example`, `README.md` and `lib/db.ts` now say so explicitly while continuing
        to match the database that actually exists. `scripts/backup.ts` still writes
        `news-charts-*` dumps and prunes across both prefixes, so no dump from any era is
        orphaned — and `scripts/verify-restore.ts` now picks its default "newest dump" by
        timestamp across both prefixes too, the same rule retention already used (a plain
        filename sort would have rehearsed a stale dump of whichever prefix sorts later until
        the first post-rename backup ran).
      - Fixes two latent leftovers of the 2026-08-08 rename found on the way: `check:ui`'s
        "no legacy chronolens: keys" assertion and `check:feed-keys`' `/news-?charts/i` origin
        regex were both written for the News Charts namespace and were silently wrong for the
        Chronolens one — with this rename both are correct again exactly as written.
      - The two entries above keep their wording, per this section's own rule about done logs
        that edit their own history.
      - **Owner confirmation, 2026-08-12: the name is final.** Everything from here forward
        uses **News Charts**, and the owner plans to take the site live under it. Recorded so
        the next naming question is answered by this line instead of reopened — this section
        has said "the name is settled" twice before without an owner statement behind it, and
        it flipped both times. The actionable follow-ups are the domain purchase and the
        "News Charts" trademark check (the `P2` domain item below), and the go-live blockers
        already queued: the ⛔ pre-release feed gate, `COMMERCIAL_MODE=true`, and the
        scheduler — see `docs/OWNER-ACTIONS.md`.
- [ ] `P2` **Domain for the site.** The name is settled once more (**News Charts**, above),
      which points back at **Newscharts.ai / newscharts.com** rather than the Chronolens.ai
      this entry named while the 2026-08-08 name stood — the candidate has now followed the
      product name in both directions, which is itself the argument for buying only when the
      name stops moving. The original alternatives (Timelines.ai · Timecharts.ai ·
      Thetimeline.ai · Timeline.ai) are still open if the preferred one is taken. ⚠ Still to
      do: check domain availability and trademark conflicts — **including that "News Charts"
      itself is clear**, which was never checked while the name first stood — then set
      `SITE_URL`: canonical URLs, the sitemap, OG images and JSON-LD all carry it, and
      redirects would be needed to keep any indexed pages. Cheapest before launch, expensive
      after.
- [x] ~~`P1` **Label every source on screen, and the compliance around it.**~~ — done 2026-07-28.
      **The house form is "who published it · how we found it"** (`lib/sourceLabel.ts`), the same
      shape the on-chain attribution work settled on: `Reuters · via GNews` says two true things.
      ⚠ **This was not only a consistency problem — it was a false statement.** When an
      aggregator handed over an article without naming the outlet, the label fell back to the
      aggregator's own name, so a page said *GNews* published a story GNews had merely found.
      Five feeds did this. It now reads `Unattributed · via GNews`, and a feed reporting itself
      as the outlet is caught too.
      **Currents was worse:** it used the article's *author* as the source, so a byline rendered
      as a masthead. The author now rides in the description, where a person belongs, and the
      outlet is reported honestly as unknown.
      GDELT's bare domains are tidied (`https://www.reuters.com/` → `reuters.com`) but **never
      embellished** — inferring "The New York Times" from a domain is a guess dressed as a fact,
      and "Nytimes" is worse than the domain it replaced. A domain is a real, checkable publisher
      identity; it just is not a pretty one.
      **Licence credit is now distinguished from courtesy credit.** The Sources panel already
      rendered `attribution · licence` per source, but as a *truncated* line — and a CC BY-SA
      obligation that disappears at a narrow viewport is not met. Wikipedia's credit no longer
      truncates; public-domain and open-data credit still does, because there it is accuracy
      rather than a condition. `check:ui` asserts both.
- [x] `P2` **Research more news repositories.** Feeds the article-resurfacing initiative. ✅ **Done 2026-10-22:** shortlisted in batch 29; the owner's picks built, NHTSA vehicle recalls in batch 30 and Justice Department releases in batch 32.
      - **Correction 2026-08-12: the Internet Archive adapter this entry called "the top unbuilt
        candidate" has been built for some time.** `lib/archive.ts` holds both halves
        (advancedsearch items, Wayback CDX snapshots), `internet_archive` is in `SOURCES`,
        `scripts/ingest.ts` calls it from three sites on the topic and company paths, and
        `check:archive` is in the chain. The entry described work already done; a fresh
        candidate has to be picked before this item means anything.
      - **Shortlist written 2026-10-22 (batch 29, NC-095):** NHTSA vehicle recalls (1966 on),
        Justice Department press releases (2009 on), FDA enforcement reports (2012 on) and CPSC
        product recalls (1973 on), all public domain and measured live, in
        [`docs/proposals/2026-10-22-news-sources.md`](proposals/2026-10-22-news-sources.md).
        The owner picked NHTSA vehicle recalls; built in batch 30 (`lib/recalls.ts`). Then the
        Justice Department releases; built in batch 32 (`lib/doj.ts`). The other two wait in the
        note.
- [x] **The Internet Archive adapter, exercised against the live service for the first time.**
      Done 2026-08-12. Its header warned that every payload shape came from documentation and had
      never met the real server; egress reaches `archive.org` from the build container now, so it
      was asked. **It returned a real defect on the first call.**
      - **Every year-only archive item was being drawn on a specific 1 January.** The live
        service returns a year-only item as `{"date":"1936-01-01T00:00:00Z","year":1936}` — a
        midnight timestamp, not the bare `year` the API docs show — so `parseArchiveDate` matched
        its day branch and reported day precision. This is the exact harm the function's own
        comment warns about ("a March pamphlet in January"), arriving in a shape the guard did
        not cover. Three consecutive Jan-1 "day" hits in a ten-row sample is the tell.
      - **The check could not have caught it:** the canned fixture for a year-only item carried
        `year: 1908` and *no* `date` field — a payload archive.org does not send. Written from
        the documentation, it proved a code path the live service never takes. Both shapes are
        pinned now, along with the cases the new rule must not swallow (a real day at midnight,
        a real 1 January carrying a time, a bare `1965-01-01`). `check:archive` 40 → 46.
      - The trade, recorded deliberately: a genuine 1 January event is now reported as year
        precision. A year band that could have been a day is imprecise; a day that was only ever
        a year is wrong.
- [x] **`fetchSiteSnapshots` can no longer report an outage as an empty archive.** Done
      2026-08-12, from the finding above. It returned a bare `SiteSnapshot[]`, so "the Wayback
      Machine has never captured this domain" and "we could not reach the Wayback Machine" were
      both `[]` — and it demonstrated the harm live, reporting **zero captures for ford.com** from
      a container where `web.archive.org` is blocked. It now returns a `SnapshotResult` carrying
      `FetchResult`'s own outcome vocabulary (`ok` / `empty` / `error` / `throttled`), so a 503 is
      "come back", a shape we do not recognise is an error, and only a genuinely empty CDX answer
      is `empty`. `check:archive` 46 → 52.
      - ⚠ Still true, and worth its own line: **this function has no production caller.** Only
        `check:archive` imports it — an instance of the wiring lesson, and the reason the bug
        could sit fully checked and entirely unexercised. Either the snapshot strip gets built or
        the function goes; a third state where it is maintained but unreachable is the worst one.
      - ✅ **Settled 2026-10-19 (owner, NC-043): the function went** — deleted with its
        `check:archive` cases in batch 17, since the strip is outside the securities focus. The
        "this site on that date" link on events is unaffected; it needs no lookup.

## Other initiatives

_Add new News Charts initiatives here as they come up — this doc is meant to govern the whole
project, not just the on-chain work._
