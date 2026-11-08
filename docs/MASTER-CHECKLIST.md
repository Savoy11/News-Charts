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
      *Batch 67: telling them apart costs a request per hundred filings, from the series' own
      EDGAR list. A fund's own filings are now certain and under its name, and a sibling's are not
      on its page.*
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
        included. It's a structured-data nicety, left for a fund-page pass. Fixed in batch 46.
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
- [x] **Not done: funds in JSON-LD.** The company page calls every security a `Corporation`.
      Telling a fund from a company is not reliable from what is stored: the SEC files SPY and
      GLD as companies, while VOO appears only as a fund. Left for a fund-page pass, as batch 9
      said. **Done in batch 46:** SPY by its name, GLD by its industry code and name, VOO by the
      fund index.

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

## NC ledger — batch 123: the NHTSA recalls under makers listed companies own (2026-11-08)

The 2026-11-08 proposal 3, approved by the owner that day ("All three"). The owner's word, 2026-11-08:
"Continue". No new source: 16 more names in the recall map (`RECALL_MAKERS`, lib/recalls.ts), which
the defect investigations read too. It closes the 2026-11-08 proposals, with six makers left open for a
filing's text.

- [x] **The makers mapped**, at the same floor (10,000) and by the same rules, each day from an SEC
      filing list (data.sec.gov):
      - **Bought, from the day the buyer's 8-K reports the purchase completed:**
        - Graco's child seats on Newell from 1999-03-24 (Newell's 8-K filed 1999-03-25, item 2), the
          day the CPSC's map gives it (batch 101). Its 1986 seat recall is no listed company's.
        - Supreme on Wabash from 2017-09-27 (Wabash's 8-K filed that day, item 2.01). Its recalls of
          2016 and 2017 are no listed company's.
      - **Spun off, on the day:** Carrier Corporation is RTX's to 2020-04-01, its titles naming the
        brand ("Recall of 29,180 Carrier units"), and Carrier Global's from 2020-04-02 (RTX's 8-K filed
        2020-04-08, items 1.01 and 2.01, reporting 2020-04-02; the day batch 120 gave EPA).
      - **The record's own:**
        - Dana Corporation's recalls of 1978–1990 are Dana's (EDGAR's DANA CORP to 2007, Dana Holding
          Corporation from 2008-01-31), and Dana Incorporated is the company itself.
        - Skyline Corporation is Champion Homes' record's own (SKYLINE CORP to 2018).
        - Eaton Corporation is ETN's predecessor record and its subsidiary since. Its 2018 clutch recall,
          which the proposal flagged, is filed under Eaton Corporation itself, not the transmissions
          venture with Cummins.
      - **The company itself, or its operating company:** Lippert on LCI (the recalls name "Lippert
        Components, Inc. (LCI)"), Autoliv, Caterpillar's engines, GE's lamps, Honeywell's Fram filters
        and Prestone, Dorman, Polestar's U.S. company, Winnebago Towable, and "THOR INDUSTRIES", Thor's
        own name on a recall of 2002, found in the makers list and not in the proposal.
      - **Rules kept:** one name may be on two pages, never on the same day; that is the check that
        replaces "no maker belongs to two companies". Old subject lines lose their maker's prefix for
        GE, Graco, Honeywell and Caterpillar ("GE/FMVSS 108/HEADLAMP BULBS" reads "FMVSS 108/headlamp
        bulbs").
- [ ] `P2` **Six makers wait for a filing's text.** www.sec.gov serves a filing's text only to a request
      naming a contact, and none is set (`NEWS_CHARTS_CONTACT`, OWNER-ACTIONS §2). The filing lists
      give no day for these:
      - Hino on Toyota: Toyota's control from 2001 and its end in 2026.
      - Kelly-Springfield on Goodyear: its unit in the three recalls' years.
      - Buell on Harley-Davidson: the 1998 purchase, which no 8-K reports.
      - Fisher-Price on Mattel: the 1993 merger, before Mattel's first filing here, of 1994.
      - Thor California and Thor America on Thor.
      - **Their rows:** 31 recalls and 13 investigations in the committed fixture. The check holds each
        off every page until a day is read.
- **Measured** on the rows read from data.transportation.gov on 2026-11-08, committed as
  `scripts/fixtures/nhtsa-owned-makers.json` (100 recalls at the floor and 37 investigations under
  the 22 makers):
  - **Recalls:** 69 on 16 pages, 45 before 2017. Newell 12 (Graco's 4,176,601 seats of 2014 the
    largest), Dana 10, LCI 9, Autoliv 6, Caterpillar 5, RTX 4, Skyline 4, GE, Honeywell, Dorman and
    Polestar 3 each, Eaton 2, Winnebago 2, Carrier Global, Thor and Wabash 1 each.
  - **Investigations:** 24 with them. Caterpillar 10, Dana 4, Graco 3 on Newell, Carrier 3 on RTX, Lippert
    2, Autoliv and Polestar 1 each. Carrier's 1996 steering-hose evaluation is kept: NHTSA files it under
    Carrier Corporation, and nothing readable shows it is another company's.
  - **The scout's count was 84 on 20 pages;** the difference is the six makers left open.
- **Requests:** 16, logged in the session scratchpad (`b123/requests.log`), each with User-Agent `News
  Charts Research` and no email address, at least 1.1 s apart: data.transportation.gov 3 (the recalls,
  the investigations, one investigation's row), data.sec.gov 12 (the filing lists and former names of
  nine companies), and one to www.sec.gov, refused (403) for want of a contact.
- **Checks:** check:vehicle-recalls gains 14 (88). Two existing ones change: one maker on two pages but
  never on the same day, and RTX's end day cites its filing. A company the map lacks now fails its checks
  instead of stopping the run. On main's code, 15 of the 88 fail: 13 of the 14 new ones (the 14th, the
  six left open, holds there too) and the 2 changed.

## NC ledger — batch 122: EPA's own days — the day a suit was filed, and each settlement on its own day (2026-11-08)

The 2026-11-08 proposal 2, approved by the owner that day ("All three"). The owner's word, 2026-11-08:
"Continue". No new source: two more columns of a table the monthly read already takes, and a milestone
it already read and set aside. #3 (batch 123) is next.

- [x] **(a) The day a suit was filed** (`epaEvents`, lib/epaCases.ts). A court case keeps its
      "Complaint Filed With Court" day (`suitFiled`). A suit filed more than 30 days before its first
      settlement (`SUIT_LEAD_DAYS`) has its own row that day: "EPA suit filed in court (Clean Air Act)",
      the case, the page's defendants and the first settlement's day, and no money, which stays on
      the settlement's row. A day's suits are one row (`…@day:filed`).
      - **The rule's tests run on the filing day:** a unit counts only if its owner held it then.
        Mobil's suit of 1996 is no ExxonMobil row (Mobil is its from 1999-11-30), Cinergy's of 2000 no
        Duke row, Texaco's of 1993 no Chevron row; 10 such filings are refused.
      - **The threshold, as drafted:** kept only where the page's own that day are every defendant, or
        at least half of fewer than 10. Chem-Dyne's Superfund suit of 174 parties and JPMorgan's BKK
        decree (one of three) have none; CSX's of 1992 (one of two) has one. Counting any of the page's
        among fewer than 10 would give 380 cases on 144 pages; the owner may widen it (OWNER-ACTIONS).
      - **Examples:** AEP's national New Source Review suit, three case numbers filed 1999-11-03, one
        row, eight years before the 2007 decree; Duke Energy's of 2000-12-22, settled 2015-09-10;
        Wisconsin Electric's of 2003-04-29.
- [x] **(b) Each settlement on its own day** (`bySettlement`). The settlements table's lodged day,
      else its entered day, is kept with each settlement's own penalty and work (`settlements`). A
      court case of settlements on two days or more has a row for each day, on the page whose own are
      every defendant that day; settlements of one day are one row, their figures added in whole cents.
      - **Fixes what batch 112 set aside:** Wisconsin Electric's 05-2003-0333 sat on 2014-07-08 with no
        penalty; its 2003-07-10 settlement now has its row, $3,200,000 ($3,100,000 federal and $100,000
        state) and $620,000,000 of work. GE's Hudson River decrees have rows on 2005-10-06 ($150,000,000),
        2009-03-23 and 2010-12-31 ($2,100,000,000); Pittsfield and the Housatonic six from 1999-10-07.
        Muskingum River's first settlement, $8,025,000, joins AEP's 2007-10-09 row.
      - **One change from the draft, by the rule's own test:** a unit's settlements before its sale stay
        its seller's. Murphy Oil USA's of 2010 ($367,187.50) and 2012 are Murphy Oil's; its of 2019 and
        2020 Murphy USA's. Texaco's of 1993 is no Chevron row; its 2013 one stays.
      - **A case of several parties keeps one row,** as before: EPA names no settlement's party
        (Deepwater Horizon's four).
      - **No stored row moves:** the case's own day is a settlement's in 267 of the slice's 268 cases of
        several settlement days, so each row keeps its key. Where it is not, the stored row moves onto
        the last settlement's (`legacyDedupBasis`), and a month's orders of that day never take it.
        EPA's summary of the case stays on that one row.
- [x] **Stored** (db/044): `suit_filed` and four settlement arrays in step, money as `numeric(16, 2)[]`,
      and the last read forgotten, so the next run reads EPA's file whole (`npm run db:migrate`;
      OWNER-ACTIONS). `storedEpaCases` reads them back; a company's ingest gives the same rows from the
      store as from the file.
- **Measured** on the committed slice, before first prices, against main's rule:
  - **(a):** 228 rows on 106 pages, 254 cases (259 a page's), 214 filed before 2017 and 162 before
    2001; 189 rows on 95 pages from first prices where they are known (150 on 65) and unfloored on the
    rest. A fixed sample of 25 read by hand: each names the page's company among the defendants on the
    filing day.
  - **(b):** 31 cases a page's (28 cases on 27 pages) on 75 settlement rows. 39 rows are new (on 24
    pages, 14 with a penalty, 27 naming the work ordered, 29 before 2017), and of the rows before, 7
    now give a penalty and 14 name the work ordered.
  - **Totals:** 9,156 rows on 690 companies, 7,769 before 2017 (8,889 and 7,526 before). Every row the
    rule gave before is still given under its own key; none moved, none lost.
- **Requests:** none. The two columns came from the copy of EPA's file the slice was cut from (Last-
  Modified 2026-10-31), kept in the session scratchpad.
- **Checks:** check:epa-cases gains 17 (126). Its slice gains the settlements table's two day columns,
  for the same 8,280 rows. Ten totals are re-pinned with their reasons. On main's code, 26 of the 126
  fail: 16 of the new 17 (the 17th reads an older file as before) and the 10 totals; for the count, main
  was given the two new exports as stubs and its fake database both forms of the insert.
  - The check's Olin loop read the page once per case, which made it the suite's slowest. It now reads
    the page once (68 s, from several minutes).

## NC ledger — batch 121: the operating units' own names for the release rules, and the Justice API's filter (2026-11-08)

The 2026-11-08 proposal 1's part (c), approved by the owner that day ("All three"). The owner's word,
2026-11-08: "Lets continue". It closes proposal 1; #2 (batch 122) and #3 (batch 123) are next.

- [x] **The units' own names in the release map** (`OPERATING_UNITS`, lib/releaseNames.ts): 288 names
      on 74 companies, plus Honda's two beside its lender in `BANK_UNITS`, since a company is in one map
      only. Each name is an EPA unit of batches 104, 114 and 120 as the Justice Department's titles
      write it, on the same days as `UNITS`, whose header names each day's filing.
      - **Why:** the Department settles with the unit, and the caption rule refuses a company's name
        followed by words that are not legal ones. So "Pratt & Whitney and PCC Airfoils to Pay More Than
        $52 Million" (2008) and "Firstenergy Nuclear Operating Company to Pay $28 Million" (2006) sat on
        no page.
      - **The days hold:** Sikorsky is RTX's to its sale of 2015-11-05, Otis Elevator Otis Worldwide's
        from 2020-04-02, Gulf Power NextEra's from 2019, and Raytheon Company RTX's only from the merger.
      - **Left out:** Sunoco, Inc. Its name is Sunoco LP's own, and the release rules have no
        counterpart yet to EPA's refusal of it on SUN's page.
- [x] **The Justice API's filter, found broken and fixed** (`fetchJusticeReleases`, lib/doj.ts).
      - **The fault:** the API ignores `parameters[title]`, the form the code sent. On 2026-11-08 every
        name asked that way (Walmart, Pratt, BNSF, "Pacific Gas") came back with the same 488 releases,
        none naming it. Asked with no sort, it gave all 275,584. So no company's page found a release
        from 2009 on.
      - **The fix:** the API reads `title`. `title=Walmart` gave 68 releases, newest first, Walmart's
        $50 million opioid settlement of 2026-08-28 among them.
      - **Nothing wrong was stored:** the rule kept the 488 off every page. Each company's next Justice
        Department run reads its releases.
- **Measured** from first prices, main's names against this branch's:
  - **the 2001–2008 archive** (committed): 14 more releases on 9 pages. Pratt & Whitney's $52 million
    (RTX), Warner-Lambert's $430 million Neurontin plea of 2004 (Pfizer), Atlantic Richfield's $187
    million Montana settlement (BP), Davis-Besse's $28 million and two Ohio Edison releases
    (FirstEnergy), PSEG Fossil's two, Wisconsin Electric's, Dominion Exploration & Production's,
    MidAmerican Energy's (Berkshire), and Mobil's two and ExxonMobil Oil's (ExxonMobil).
  - **the API's years**, asked through `title` for each of the 278 names, up to three pages of 50: 40
    more on 19 pages. BP Exploration's record $4 billion Deepwater Horizon plea of 2013, PacifiCorp's
    $575 million wildfire settlement of 2026 (Berkshire), Raytheon Company's $950 million of 2024 (RTX),
    Commonwealth Edison's $200 million bribery case of 2020 (Exelon), Southern California Edison's three
    fire cases, CVS Pharmacy's seven.
  - Each of the 54 read by hand; none comes off any page.
  - **The other release rules read the map too:** the SEC's 2024 bribery charge against John Deere,
    SCANA's two SEC cases of 2020 (on Dominion, its owner from 2019), and the CFTC's propane charge
    against BP Products North America (2006) and wash-sale penalty on San Diego Gas & Electric (2010).
    The Board's releases and the CFPB's actions gain none.
- **Requests:** 291, all to www.justice.gov's API, logged in the session scratchpad
  (`b121/requests.log`), each with User-Agent `News Charts Research` and no email address, at least
  1.1 s apart: 11 to find the fault and the filter that works, 280 for the 278 names (Mobil took three
  pages).
- **Checks:**
  - check:doj gains 5 checks (99). The API's filter is asked as `title`, with no `parameters[title]`.
    The archive releases each unit brings, the API-era examples and each unit's days are checked, as
    is the map's shape.
  - The archive's totals are now 145 releases on 92 companies, 125 on 78 pages from first prices (131,
    87, 111 and 73 before). Five first trading days are added to its table: Berkshire, RTX, Dominion,
    WEC and FirstEnergy.
  - check:sec-press (the map's 150 companies; 267 entries on 130), check:sec-cases (1,148 on 369) and
    check:cftc (90 on 34) are re-pinned with their reasons; check:short-names reads `title`.
  - On main's code, 9 of check:doj's 99 fail: the 5 new ones, the two that ask the API by `title`, and
    2 totals.

## NC ledger — batch 120: EPA's cases under 28 more companies' operating units, and "&" read as "and" (2026-11-08)

The owner's calls of 2026-11-08 on the 2026-11-08 proposals: "All three", and on #1's two calls, "Yes,
both as drafted". This batch files all three into Scope refocus and builds #1's parts (a) and (b). No
new source: more entries in a list EPA's rule already reads, and one spelling in the caption rule every
regulator source shares. #1's part (c), the release map for the Justice Department's rule, is next
(batch 121), then #2 (batch 122) and #3 (batch 123).

- [x] **The units** (`UNITS`, lib/epaCases.ts): 112 more entries on 30 companies, 95 in all. Each is
      between the days its owner held it, and every day is read from data.sec.gov's filing lists by the
      batch 114 rule: the earliest report day the deal's filings give (the buyer's 8-K reporting the
      completed merger, else the bought company's change in control, else its Form 15). Each day and
      filing is in the `UNITS` header. Among them:
      - **Berkshire Hathaway:** BNSF Railway from 2010-02-12 (BNSF's 8-K, items 2.01 and 5.01),
        PacifiCorp, Lubrizol, Shaw, Johns Manville, Precision Castparts, Fruit of the Loom, NV Energy's
        utilities; MidAmerican Energy and its pipelines from 2006-02-09, the owner's call.
      - **RTX**, United Technologies' record: Pratt & Whitney, Hamilton Sundstrand and the divisions;
        Sikorsky to 2015-11-05; Otis and Carrier to 2020-04-01; Goodrich, Rockwell Collins and
        Raytheon Company from their days.
      - **Pfizer:** Warner-Lambert, Pharmacia and Upjohn, Wyeth; Pharmacia LLC, the old Monsanto
        Company's legal entity, from 2003-04-16, the owner's call.
      - **The pipelines:** El Paso's on Kinder Morgan from 2012-05-24, Transco on Williams from
        1995-01-18, Spectra's on Enbridge from 2017-02-27, ANR and Columbia on TC Energy.
      - **Refiners, chemical makers, miners, food and drink companies:** Valero (Ultramar Diamond
        Shamrock, Premcor), Honeywell (AlliedSignal's own, old Honeywell's from 1999-12-01), Freeport
        (Phelps Dodge's from 2007-03-19), Mosaic, Westlake, LyondellBasell, Huntsman, TotalEnergies,
        Rio Tinto (Kennecott, U.S. Borax), Republic Services (Allied Waste, Browning-Ferris), Sysco,
        Tyson (IBP, Hillshire), PepsiCo, Molson Coors, AB InBev, CVS, Honda, Deere, Textron,
        Cleveland-Cliffs.
- [x] **A unit sold to another listed company goes to it on the day.** The scout's draft gave some
      units to the seller for too long. The filings say otherwise:
      - Panhandle Eastern and Trunkline were Duke's only to 1999-03-28 (CMS Energy bought them), not
        to 2007; Trunkline's 2019 order is Energy Transfer's, from Southern Union's merger of
        2012-03-23;
      - Keystone Pipeline is South Bow's from the spin-off of 2024-10-01: its 2026 case leaves TC
        Energy;
      - Otis Elevator's 2022 Diamond Alkali decree is Otis Worldwide's, not RTX's. Carrier Global's own
        rule already reads "Carrier Corporation", so it needs no entry;
      - Williams's production companies end at the WPX spin-off (2011-12-29), and El Paso's
        exploration companies, sold with the merger, are never Kinder Morgan's.
- [x] **Namesakes refused by name,** each read by hand among every name a pattern takes on EPA's whole
      file: Huntsman Springs, Mosaic Life Care (a hospital), Valero Terrestrial (a landfill), El Paso
      Electric and the City of El Paso, Westlake Hardware, Westlake Energy and Westlake Refining, the
      old Total Petroleum (Ultramar Diamond Shamrock's from 1997), McMoRan's Freeport-McMoRan Energy,
      Millennium Inorganic Chemicals (Cristal's from 2007), the Lyondell Environmental Custodial Trust,
      ANR Production and Freight, IMC Magnetics, Tyson's Dump.
- [x] **"&" read as "and"** (`andSpellings`, lib/edgarName.ts):
      - The caption rule (`captionParty`) every regulator source shares reads a name holding "&" in
        both spellings, as batch 111 reads a legal form. So do the letters EPA's, the CPSC's, the
        CFPB's and the Board's sources ask by.
      - The guards were already right: the listed-name count reads "&" as "and" (`phrase`, lib/sec.ts),
        so a shared name stays shared in both spellings.
      - T's taken name reads "AT AND T" too, so a 1993 order of AT&T Corp.'s stays off AT&T Inc.'s
        page.
- **Measured** on EPA's whole file of 2026-10-31, each page from its first price and under its EDGAR
  former names, main against this branch, on the 30 companies and the 249 records whose EDGAR names hold
  "&":
  - 906 cases and 818 rows more on 41 pages, none fewer. Of the 839 distinct cases, 471 are a court
    case or a penalty, 345 of them before 2017; 304 carry a penalty, 17 of them $1 million or more.
  - The largest: Enbridge Energy's $62,000,000 Marshall and Romeoville decree of 2016, American Honda's
    $10,100,000 of 1998, IMC Phosphates' $4,100,000 and Mosaic Phosphates' $3,900,000 of 2015, Valero
    Refining's $3,592,308 national decree of 2005, Equistar and Lyondell's $3,400,000 of 2021.
  - By page: Honeywell 168→246, RTX 45→121, Berkshire 0→57, Air Products 13→66, Pfizer 59→105,
    Valero 11→53, Rio Tinto 1→38, Westlake 3→38, Williams 6→34, Republic Services 3→33, Goodyear
    76→103.
  - Nine pages had no EPA row and now do: Berkshire, TotalEnergies 21, TC Energy 8, AB InBev 5, Honda
    5, Otis, South Bow, Aimco and Chicago Rivet.
  - No day is near a case: no case falls within a few days of any of them. Where an 8-K's report day
    is a day or two before its filing (Kinder Morgan's, Cleveland-Cliffs', RTX's), the report day is
    used.
- **Left out:** Benjamin Moore, Marmon, McLane and Clayton Homes on Berkshire (no filing here gives
  their days; EPA files no case under Clayton), Fina and Atofina on TotalEnergies (likewise), Kern
  River's years as Williams's (1996–2002), and Cessna's cases as General Dynamics's (1985–1992).
- **Requests:** 59, logged in the session scratchpad (`b120/requests.log`), each with User-Agent `News
  Charts Research` and no email address, at least 1.1 s apart: data.sec.gov 55 (the filing lists) and
  Yahoo's chart 4 (first trading days). No www.sec.gov page was asked.
- **Checks:** check:epa-cases gains 13 (109). Its committed slice gains every row of the five tables
  for the 1,119 cases the units name on any day, the "and" spelling puts on a page, or that name "AT
  AND T". On it, before first prices: 8,889 rows on 690 companies, 7,526 before 2017 (7,899 on 679
  before). On main's code, 19 of the 109 fail: the 13 new ones and 6 totals. check:cpsc's totals gain
  the four recalls the spelling adds (2,304 rows on 196 companies): Stanley Black and Decker's DeWALT
  mowers of 2024, Bath and Body Works' candles of 2004, John Wiley and Sons' book of 2003, and Academy
  Sports and Outdoors' heaters of 2003, before its listing. check:digest-walk's 1985 count gains 8 SEC
  orders under the Holding Company Act, all Connecticut Light and Power Company's (CNTHP's issuer), 520
  rows on 260 companies; none is on its page, which trades from later.

## NC ledger — batch 119: a new opportunity-scout run, three proposals for the owner (2026-11-08)

Every proposal of 2026-11-07 is approved and built (batches 113–115). Batches 116–118 fixed what the
2026-11-07 audit found and built the table of taken names. So the `opportunity-scout` read the
repository again at `5dc9b26` and wrote `docs/proposals/2026-11-08-proposals.md`: three proposals, all
**PENDING**, ranked with securities depth first. The owner's word, 2026-11-07: "Lets continue".
Nothing is built in this batch.

- [x] **Owner: mark each proposal `APPROVED`, `REJECTED` or `DEFERRED`** (with a reason for a
      rejection). The scout's second pass then files the approved ones into this checklist.
      ✅ **Marked 2026-11-08: all three approved** ("All three"; on #1's two calls, "Yes, both as
      drafted"), filed under Scope refocus by batch 120.
      1. `P1` **EPA's cases under 28 more companies' own operating units.** No new source; three
         parts, each approvable alone.
         - **(a) The units list** (`UNITS`, lib/epaCases.ts): about 100 patterns on 28 companies.
           Examples: BNSF on Berkshire, Pratt & Whitney and Carrier on RTX, AlliedSignal's on
           Honeywell, Valero's refining companies, Kennecott on Rio Tinto. Measured: 847 cases, 481
           of them a court case or a penalty, 350 of those before 2017. Seven pages go from no EPA
           row to some (Berkshire 0→80, TotalEnergies 0→34).
         - **(b) A name with "&" read with "and" too:** 63 more court or penalty cases, mostly Air
           Products and Goodyear. It needs the taken-names table to know "AT AND T" as well as
           "AT&T".
         - **(c) The same units' names in the release map:** 12 Justice Department releases of
           2001–2008 on 8 pages. Davis-Besse's $28 million and Pratt & Whitney's $52 million are
           among them.
         - **Not yet read:** the ownership days are the scout's estimates, each to be read from
           EDGAR at build time.
         - **Two owner calls inside:** Pharmacia LLC (Monsanto's legacy company) on Pfizer, and the
           day MidAmerican Energy becomes Berkshire's.
      2. `P2` **EPA's own days on the cases pages already hold.**
         - **(a) The day the suit was filed:** 178 cases on 85 pages, 128 before 2001. AEP's suit
           of 1999-11-03 and Duke's of 2000-12-22 are among them.
         - **(b) Each settlement of a case whose defendants are all the company's, on its own
           day:** 26 cases, 46 settlements, GE's Hudson River decree of 2005 among them. This
           reopens "split a case by settlement", which the 2026-11-07 run cut.
         - It also fixes what the batch 112 ledger set aside for the audit: Wisconsin Electric's
           05-2003-0333 sits on 2014-07-08 with no penalty, though EPA records a 2003 settlement
           with $3.2 million in penalties and $620 million of work.
      3. `P2` **NHTSA recalls under makers listed companies own that the map lacks.** About 20 more
         makers in `RECALL_MAKERS` (lib/recalls.ts): 84 recalls on 20 pages, 57 before 2017.
         Graco's child seats on Newell (4.2 million seats in 2014), Dana, Lippert on LCI, Hino on
         Toyota and Kelly-Springfield on Goodyear are among them. Six days are estimates, to be read
         from filings.
- **Cut, with reasons in the file:**
  - FDA recalls matched by name against every company: small and full of namesakes;
  - PHMSA, FERC and the NRC: not reachable from this container (403, or nothing without a script);
  - four more EPA unit sets, not drafted: ArcelorMittal, Baker Hughes, Hess on Chevron, Columbia Gas
    Transmission.
- **For the next audit, found by the scout and not fixed:**
  - 26 EPA cases on 27 rows are dated by a later amendment and show no penalty, because `readCases`
    takes the day from milestones that hold only one lodging (#2(b) would fix them);
  - 38 of JCI's 45 EPA rows predate 2016-09-02 and are old Johnson Controls, Inc.'s, on a record
    that was Tyco's: the owner's open JCI call now covers them too;
  - "Encore Medical, LP", DJO's unit, would give a different listed company 61 FDA recalls under a
    name-only rule. The hand-built FDA map avoids it today.
- **Requests:** 44, logged in the session scratchpad (`b119/requests.log`), each with User-Agent
  `News Charts Research` and no email address, at least 1.1 s apart:
  - data.sec.gov 17 and query1.finance.yahoo.com 15;
  - data.transportation.gov 2;
  - download.open.fda.gov 3 and api.fda.gov 1;
  - www.nrc.gov 3, api.us.socrata.com 1;
  - www.phmsa.dot.gov 1 and www.ferc.gov 1, both refused.

  No www.sec.gov page was asked. Postgres was not used. `npm run check` and `npm run lint` pass.

## NC ledger — batch 118: what batch 117's scan left open (2026-11-07)

The `P3` batch 117 raised. The owner's word, 2026-11-07: "Lets continue".

- [x] **Four more names in the table** (`TAKEN_NAMES`, now 32), each day read from the record's
      filing list on data.sec.gov:
      - **Lightbridge** on LTBR from 2009-09-21: Thorium Power's record took the name (8-K, item
        5.03). Lightbridge, Inc., another record, had held it until 2007.
      - **Valor Energy** on VAI from 2026-08-25: Senmiao Technology's record (item 5.03).
      - **Meridian Holdings** on MRDN from 2026-02-26: Golden Matrix Group's record (items 3.03 and
        5.03).
      - **Dawson Geophysical** on DWSN from 2015-02-11: TGC Industries' record merged with Dawson
        and took its name and ticker (items 2.01 and 5.03). Batch 117 read it as the ticker's own
        history, as Merck's is. Yahoo's split record says otherwise: DWSN's prices before 2015 hold
        TGC's 5% stock dividends and its 1-for-3 reverse split of February 2015, so the chart is TGC's
        and old Dawson's past is another company's.
- [x] **Two histories mapped, as Merck's is** (lib/predecessors.ts):
      - **SSYS:** old Stratasys, Inc.'s record is the page's history to 2012-12-04. Objet's record
        took its name and ticker at the merger of 2012-12-01 (6-K filed 2012-12-04). Yahoo's SSYS
        prices from 1994 hold Stratasys's splits of 2003 and 2007.
      - **WCN:** old Waste Connections, Inc.'s record is the page's history to 2016-06-07.
        Progressive Waste Solutions' record took its name and ticker at the merger of 2016-06-01
        (8-K filed 2016-06-07, items 2.01 and 5.03). WCN's prices from 1998 hold Waste Connections's
        3:2 splits of 2004, 2007 and 2010.
      - Their filings before then reach the pages at the next ingest. Old Stratasys's list holds 13
        annual reports, 42 quarterly and 76 current reports from 1998; old Waste Connections's recent
        list holds 9, 25 and 111 from 2008, and an older file the rest.
      - **The record's own past before stays, labelled** (`OWN_RECORD_FROM`), as Schering-Plough's is
        on Merck's page by the owner's call of 2026-11-07: "Objet, before its 2012 merger with
        Stratasys"; "Progressive Waste Solutions, before its 2016 merger with Waste Connections", its
        IESI and BFI Canada units included.
- [x] **GDELT's months before the day asked under the record's own name of then**
      (`thenNameIn`, lib/ingest/newsBackfill.ts):
      - Eldorado's months to June 2020 are asked as "Eldorado Resorts", Gardner Denver's as "Gardner
        Denver", Era's as "Era Group", II-VI's as "II-VI", Hudson Global's, Helix's, Golden Matrix's,
        Senmiao's and Complete Solaria's likewise.
      - A story is kept when its headline names either name and not only the taken one, and it is
        scored with both.
      - A then-name that is a one-word name not yet measured keeps today's names. CenturyLink is the
        one: its months stay "Lumen Technologies", and the table leaves the namesake's off.
- [x] **A flaw in batch 117's Federal Register years, fixed.** Linde plc's and Six Flags' records
      were new companies two others merged into, and their only earlier EDGAR names are the merger
      shells' ("ZAMALIGHT PLC", "CopperSteel HoldCo"). Batch 117 would have asked their years before
      the day under those. Now a record marked `noOwnNameBefore` keeps the present name for them, and
      the rule reads the answers.
      - The same reading keeps SCP Pool's "SCP POOL CORP" as its own name for 1996–2005. Batch 117
        dropped it because it holds "Pool Corp".
- **Measured on the saved sources:** from first prices, the four new names take nothing off; their
  risk is in the news, the Federal Register and the Justice Department's API. Without the floor, as
  the checks count, the SEC's case days become 1,146 on 368 companies: the other Meridian Holdings,
  Inc.'s cases of 2007 and 2009 (Anthony C. Dike's) come off MRDN. No case row on the saved sources
  is labelled as Objet's or Progressive Waste's.
- **Requests:** 6, logged in the session scratchpad (`b118/requests.log`), with User-Agent `News
  Charts Research` and no email address: data.sec.gov 3 (the old records' filing lists), Yahoo's
  chart 3 (the split histories).
- **Checks:**
  - check:taken-names gains 9 checks (40): the four entries, the then-name rule, the two histories
    and their labels, and GDELT's walk against a stand-in database;
  - check:predecessors passes with the two new entries; check:sec-cases re-pins its count.

  On main the new checks fail. `npm run check` and `npm run lint` pass. HawkScan cannot run here
  (`HAWK_API_KEY` unset).

## NC ledger — batch 117: one table of the names a record took from another company (2026-11-07)

The checklist's `P2` raised by batch 116 and proposed by the 2026-11-07 audit. The owner's word,
2026-11-07: "Lets continue". A company's present EDGAR name was read in every year, so where its
record took another company's name, that company's past reached the page: AT&T Corp.'s cases on
T's page, whose prices before 2005 are SBC's.

- [x] **One table** (`TAKEN_NAMES`, lib/takenNames.ts): 28 records, each with the day the name
      became the record's, the filing that gives it (an 8-K's event day, or the day it names), the
      record's own names of before, and why. Read by hand from each record's filing list on
      data.sec.gov.
      - **Bought or merged, 21:** T (SBC's, 2005-11-18), WM (USA Waste's, 1998-07-16), BIIB
        (IDEC's, 2003-11-12), WFC (Norwest's, 1998-10-21), BAC (NationsBank's, 1998-09-30), CB (ACE's,
        2016-01-14), USB (First Bank System's, 1997-08-01), KEY (Society's, 1994-03-01), COHR (II-VI's,
        2022-07-01), CZR (Eldorado's, 2020-07-17), IR (Gardner Denver's, 2020-02-28), HOS (Helix's,
        2026-08-28), VTOL (Era's, 2020-06-11), LIN (Praxair's chart, 2018-10-31), FUN (Cedar Fair's
        chart, 2024-07-01), PLD (AMB's, 2011-06-02), OPY (Fahnestock's, 2003-01-02), SPB (Harbinger's,
        2011-01-07), SPWR (Complete Solaria's, 2024-09-30), STRR (Hudson Global's, 2025-08-22), ZD (j2's,
        2012-11-09) and IWSH (National Patent's, 2012-12-19).
      - **A namesake's name, 6:** KMPR (Kemper, 2011-08-25), SUN (Sunoco, 2014-10-27), SR (Spire,
        2016-04-28), POOL (Pool Company, 2006-05-16), RRC (Range Resources Ltd., 1998-08-25) and LUMN
        (Lumen Technologies, Inc., 2020-09-11).
      - **The rule:** before the day, a row that names the taken name and none of the record's own
        names of then is the other company's. "SBC to acquire AT&T" stays on T; "AT&T Corp. cuts
        7,000 jobs" of 2004 does not. "Ace to Buy Chubb" stays on CB, as headlines write ACE.
- [x] **Read by every source that finds a company by its name:**
      - **every caption rule** (SEC cases, the Board's releases, CFPB, EPA, CPSC, CFTC and the FDA's
        approvals, `takenBefore`). The three one-source entries of batches 108, 115 and 116 are
        gone into the table, and with them the lists' `before` fields;
      - **ingest,** on every source's answer before it is stored, as part of the answer, so a
        complete answer still takes a stored row off; and on the Federal Register's and GDELT's
        walks, which store their own (`withoutTakenNames`). The news, the Justice Department's API,
        the SEC's press releases and the Digest are read so too;
      - **a page,** which leaves off a stored row of it, stored before this batch or by a source no
        run takes off; and **"Also on"**, which no longer names the record under the other company's
        case (`hiddenAsTaken`);
      - **the Federal Register's yearly search:** a year that ends before the day is asked under
        the record's own EDGAR name of that year, not the taken one (`yearSearchNames`). T's
        1994–2004 are asked under Southwestern Bell's and SBC's names. Those years are asked once
        more, since their query changes.
      - **Never** the record's own sources: its EDGAR filings, its prices, the macro and on-chain
        feeds, its Wikipedia article (`OWN_RECORD_SOURCES`). SBC's own 8-K titled "AT&T Shareholders
        Approve Merger" is SBC's.
- [x] **The scan that keeps it whole** (`scripts/fixtures/taken-names-scan.json`). Every listed
      company whose present EDGAR name an older record had held (EDGAR's list of every name each
      record has filed under; the other record older than CIK 1,100,000, not listed, not a mapped
      predecessor and no depositary): 173, each read.
      - 28 took it from another company (the table);
      - 25 had it by their first price, so nothing before is read;
      - 86 are the same company's other record: a new parent (Disney's of 2019, Duke's of 2006), a
        redomicile, its own unit, its own fund's trust;
      - 34 for the other reasons: a name that was new (AstraZeneca, ConocoPhillips), its own brand
        (AutoNation, Orange), a blank-check company's business, the ticker's own history (MRK, SSYS,
        WCN, DWSN), days of when-issued trading, a shared name, three namesakes not yet dated, and
        five with no price or no start.
      - **What it cannot see:** a name EDGAR writes another way. DowDuPont's "DuPont de Nemours"
        took E. I. du Pont's, and old DuPont's past on DD stays the owner's open call (OWNER-ACTIONS).
- **Measured on the saved sources** (EPA's whole file, the CPSC's, the SEC's cases and press
  releases, the Justice archive, the Board's releases, CFPB, CFTC and the FDA's approvals), from each
  company's first price:
  - 15 rows come off 4 pages that nothing took off before: LIN 9 (Linde AG's, its US units'
    included), SPB 4 (Spectrum Brands' of 2006–2009), HOS 1 (Hornbeck's of 2024), FUN 1 (Six
    Flags' of 2005);
  - T's 14, WM's 6 and BIIB's 2 stay off, now by the table;
  - the other 21 lose nothing on these sources. Their risk is in the news, the Federal Register and
    the Justice Department's API, which need the network: the rule is in place for each.
  - **One may be the record's own:** of LIN's nine, a 2018 notice to "LINDE INC" could be Praxair's,
    under its later name; EPA's file does not say.
  - With no first-price floor, as the checks count: EPA 7,954 rows on 683 companies become 7,899 on
    679 (IR's 36 old Ingersoll-Rand cases, Sunoco, Inc.'s 3 and Bristow's 1 among them), the CPSC's
    2,301 become 2,300 (Ingersoll-Rand Company's 2002 recall), and the SEC's 1,150 case days on 371
    companies become 1,148 on 369 (Ingersoll-Rand's and the old Bristow's of 2007).
- **Requests:** 313, logged in the session scratchpad (`b117/requests.log`), with User-Agent `News
  Charts Research` and no email address: data.sec.gov 187 (the 173 scanned records' filing lists and
  14 older pages of them), Yahoo's chart 126 (first trading days for the scan).
- **Checks:**
  - check:taken-names is new, with 31 checks: the table, the rule, each place that reads it, the
    Federal Register's walk against a stand-in database, and the scan;
  - check:epa-cases, check:cpsc and check:fda-approvals read the table for the entries it replaces,
    and re-pin their counts, as does check:sec-cases; check:sec-forms reads the page code's new form.

  On main the new check fails. `npm run check` and `npm run lint` pass. HawkScan cannot run here
  (`HAWK_API_KEY` unset).

## NC ledger — batch 116: the audit of batches 108–115, and its seven findings fixed (2026-11-07)

The `code-auditor` read batches 108–115 (`92d7a59..126af0c`); its report is
`docs/audits/2026-11-07-code-audit-b108-115.md`. The owner's word, 2026-11-07: "go ahead with the
audit". It found the batches' mechanics sound on the saved real data:
- 40 of batch 114's unit days match their filings;
- batch 113's figures agree with an independent reading of EPA's raw tables on all 137,103 cases;
- batch 115's reader and measurement reproduce exactly, and no accepted holder pair is false;
- `unlinkGone` takes off only what it should.

It found seven defects. Each was reproduced here on EPA's whole file and fixed, and each has checks
that fail on main.

- [x] **1. Old AT&T Corp.'s 13 EPA rows of 1986–2002 on AT&T Inc.'s page** (`P2`).
      - **The cause.** T's EDGAR record was SBC Communications' until it bought AT&T Corp. and took its
        name. The record's former name SBC COMMUNICATIONS INC runs to 2005-11-18, and its 8-K filed
        2005-11-21 reports the merger completed that day (items 2.01 and 5.03; data.sec.gov, read
        here). T's prices from 1983 are SBC's.
      - **Fixed** as old Waste Management was in batch 108: `NOT_THE_COMPANY` takes "AT&T…" off T before
        that day. Among the 13 is AT&T Corp.'s $90,469 EPCRA penalty of 2001. T keeps its 5 rows from 2009
        on.
      - **The same in the CPSC's recalls**, found checking the other sources: AT&T Corp.'s phone
        charger of 1995 (recall 96043). The CPSC's list gains a `before` day for it. The Justice archive,
        the SEC's cases and its press releases give T no such row.
      - **The class is not closed:** the Federal Register's yearly search asks the present name in every
        year, so a new checklist item (`P2`, Scope refocus) asks for one table that every source reads.
- [x] **2. "CONSUMERS POWER, INC." on CMS** (`P3`). It is a Region 10 case of 1993, with an $8,500 PCB
      penalty, at an Illinois facility, not Michigan's Consumers Power Company. Batch 114's pattern now
      takes "CONSUMERS POWER CO(MPANY)" and "Consumers Energy" only. CMS has 17 rows.
- [x] **3. Two of Schering-Plough's four EPA rows on Merck's page carried no label** (`P3`). The label
      reads a row's text, and a Superfund row names its site.
      - **Fixed:** a case of several defendants, named for its site or another party and not the
        company, now names the page's own defendants, up to three: "AMERICAN CYANAMID (FIKE CHEMICAL
        SITE) (case 03-1990-0627), against SCHERING-PLOUGH CORP. and 63 other defendants". With
        MRK's former name, all four are labelled.
      - **4,145 rows' descriptions change** the same way. A case of one defendant, or one whose name
        names the company (AEP's national case), reads as before.
- [x] **4. Retevmo's 2025 supplement linked a 404** (`P3`). Drugs@FDA lists 3 letters already
      encoded ("s015,%20s016"), and `letterUrl` encoded them again ("%2520"). Each part is now encoded
      once, from its plain form, and keeps what a path may hold as it is. A comma or semicolon stays, as
      Drugs@FDA lists it. Both forms were asked of www.accessdata.fda.gov: Retevmo's (by the audit)
      and a semicolon letter of 2019 (here) answer their PDFs.
- [x] **5. EPA's placeholders shown as its summary, and lost characters misread** (`P3`).
      - **Dropped:** "NO CASE SUMMARY SUBMITTED", "WILL PROVIDE AT A LATER DATE.", "AWAITING CASE
        SUMMARY FROM ATTORNEY.", a pointer to another case's summary ("SEE CASE SUMMARY OF
        08-97-0150"), and a step and its day alone ("CAFO effective 10/28/2022", "On 8/11/26 a NOW was
        issued."): 24 page cases. A step that says what was done stays ("4/8/16 - PESTICIDE DENIED
        ENTRY INTO U.S.").
      - **Read by length and place** (`repairLost`), on the 39 page cases of the whole file that hold a
        lost character. One mark is a Windows character, two a two-byte one ("§"), three a curly quote
        or apostrophe, and four are "§§". So:
        - two marks before a number are one "§" (13 cases), unless a list follows ("§§ 9606, 9607 AND
          9622"); batch 113 made them "§§";
        - a word's "s" before a mark is a plural's apostrophe ("Defendants' Nelson Dewey", "the United
          States' claims");
        - a lone mark between spaces is a dash ("Denver, CO – April 20");
        - an opened quotation is closed ("REFERRED TO AS "RESPONDENTS"").
- [x] **6. EPA's "THE TORO CORPORATION" of 2001 read as Toro Corp.'s** (`P3`). Batch 111's spelling
      rule did it; only the first-price floor kept it off. It is The Toro Company's Superfund order,
      and its summary calls the respondent "TORO". `NOT_THE_COMPANY` refuses that one spelling on Toro
      Corp., the shipping company formed in 2022. Toro Corp.'s own "Toro Corp." is untouched.
- [x] **7. The EPA slice lacked 5 of the whole file's page cases** (`P3`). These were the cases EPA
      lists with no defendant, which a page reads by the case's name, and the two Toro cases batch 111's
      spellings read.
      - **Fixed:** the slice gains every row of the five tables for those 5 cases, from the same copy.
        It now gives exactly the whole file's rows: 7,954 on 683 companies, row for row.
      - **The counts the ledger and README quoted were the slice's.** The whole file gave 7,969 on 684
        before this batch, and batch 114 added 422 rows, not 419 (FirstEnergy 26, NiSource 17, Alliant 12).
        The README now gives the file's counts.
- **On the whole file, after the fixes:** 7,954 rows on 683 companies, 6,806 before 2017; 15 rows
  fewer (T 13, CMS 1, TORO 1); no other row lost. Penalties on 2,271 rows; summaries on 6,750.
- **Left for the owner:** DuPont's past on DD's page, the audit's open question (OWNER-ACTIONS).
  Old E. I. du Pont's 29 EPA rows before 2017 are on DD, whose record is DowDuPont's.
- **Requests:** 3, logged in the session scratchpad (`b116/requests.log`), with User-Agent `News
  Charts Research` and no email address: data.sec.gov 2 (AT&T's older filing pages), and
  www.accessdata.fda.gov 1 (a letter). The audit's 93 are in its report.
- **Checks:**
  - check:epa-cases 96 (+9): each finding, and every count re-pinned on the fuller slice;
  - check:cpsc 37 (+1): AT&T Corp.'s charger;
  - check:fda-supplements 58 (+1): Retevmo's letter.

  On main the new cases fail. `npm run check` and `npm run lint` pass. HawkScan cannot run here
  (`HAWK_API_KEY` unset).

## NC ledger — batch 115: the FDA's efficacy supplements, for drugs whose holder never changed (2026-11-07)

The 2026-11-07 proposal 2, approved by the owner that day ("Approve all three, titles from the FDA's
data"). A new source, `fda_supplements` (id 36): Drugs@FDA as openFDA publishes it, public domain
under CC0, no key and no request at ingest.

- [x] **The file.** `npm run sync:fda-supplements` reads openFDA's Drugs@FDA zip (about 9 MB) and
      writes `data/fda-supplements.json` (418 KB). It keeps the approved efficacy supplements of the
      compilation's applications: class "EFFICACY", status "AP", on that status's day.
      - 3,132 supplements on 861 applications, from openFDA's copy of 2026-11-06;
      - each keeps its number, day, review, orphan mark and the letter Drugs@FDA lists;
      - 2,743 have a letter: 2,721 PDFs and 22 pages of the 1990s.

      A letter is kept only as a path on the FDA's own document host, and is always asked at
      https://. About three in four are linked at http:// in the file.
- [x] **Whose a supplement is.** A supplement is a company's only where the drug's holder never left
      it, and then by batch 105's rule unchanged, on the supplement's own day, from the first price.
      The holder never left when one of these is true:
      - today's sponsor is the applicant by name. Legal, kind and place words and Drugs@FDA's
        shortenings are left out, so "NOVARTIS PHARMS CORP" is "Novartis Pharmaceuticals
        Corporation" (`sameName`);
      - or today's sponsor is one of the company's own names of any year. So Celgene's Revlimid
        (BRISTOL MYERS SQUIBB today) is BMS's from 2019-11-20, and Loxo's Retevmo is Lilly's;
      - or it is one of three short forms Drugs@FDA writes, read by hand: "LILLY", "BRISTOL"
        and "NOVO" (`SPONSOR_SPELLINGS`).

      The scout's looser test, a shared word, was not taken: it passes "Aventis → SANOFI AVENTIS
      US", "Upjohn → PHARMACIA AND UPJOHN" and "LG Life Sciences → LG CHEM", where the holder
      changed.
- [x] **Titles from the data alone,** the owner's call. A row reads "FDA approves an efficacy
      supplement to Keytruda (pembrolizumab)". It gives the supplement's number, the applicant's
      application, the day, the review and the orphan mark, and links the letter, or Drugs@FDA's
      page where none is listed. No row says "new indication", which only a letter can.
- [x] **Read by hand:** all 135 page, applicant and sponsor pairs the rule makes. Each is one of:
      - the company's own name;
      - a unit on its days: Centocor, Genzyme, Alexion, Human Genome Sciences, Anacor, Millennium,
        Ariad;
      - Sandoz on Novartis from the merger;
      - Schering and Organon on Merck under batch 110's label (14 rows);
      - Organon on Akzo Nobel to 2007;
      - GE HealthCare on GE, then on GEHC.

      One was wrong, and it was batch 105's: old Biogen, Inc.'s past was on Biogen's page.
- [x] **A fix to batch 105:** IDEC Pharmaceuticals, Biogen's record (CIK 875045), bought Biogen, Inc.
      on 2003-11-12 and took its name. The record's 8-K of that day reports it (items 2, 5 and 7), and
      its name changes that day (data.sec.gov). So "Biogen" before that day is no page's
      (`NOT_THE_APPLICANT` gains a `before` day). Avonex (1996) and Amevive (2003-01-30) come off
      BIIB; batch 105's counts become 581 and 450 (from 583 and 452).
- [x] **Measured** with the committed index's names and Yahoo's first trading days (batch 105's 26,
      Akzo Nobel's, and 28 read now):
      - before first prices: 1,212 supplements on 51 companies, 441 before 2017;
      - from first prices: 1,191 on 48 companies, 420 before 2017 and 131 before 2005. By decade:
        1990s 56, 2000s 162, 2010s 408, 2020s 565;
      - most on Bristol-Myers Squibb 172, Merck 171, Novartis 116, Lilly 97, Johnson & Johnson 96,
        AstraZeneca 71, Gilead 71, Amgen 58, AbbVie 45, Regeneron 38, Pfizer 33 and Novo Nordisk 28.
        The scout's strict test gave 973 on 27 pages.
- **Left off, as the proposal said:** 553 supplements (374 before 2017) whose applicant was the
  company that day but whose holder changed and no field says when. Among them:
  - GSK's oncology drugs now Novartis's (40);
  - Abbott's now AbbVie's (43);
  - Merck's and Schering's now Organon's (48);
  - BMS's diabetes drugs now AstraZeneca's (15);
  - Pfizer's now Viatris's and Upjohn's (26).

  Also left off are moves inside one company that no name shows:
  - Pfizer's held by PF Prism and CPPI, Wyeth's among them (54);
  - J&J's by Janssen, Tibotec's and R.W. Johnson's among them (53);
  - Merck's by "MSD SUB MERCK", "MSD" and "MSD MERCK CO" (42);
  - old Merck's and Schering's under "MERCK SHARP DOHME" (16).

  A hand list could date the sales or join the moves; that is a question for the owner
  (OWNER-ACTIONS).
- **Requests:** 37, all logged in the session scratchpad (`b115/requests.log`). Each was sent with
  User-Agent `News Charts Research` and no email address, at least 1.1 s apart:
  - query1.finance.yahoo.com 30: 28 first trading days and 2 retries after a 429;
  - data.sec.gov 2: Biogen's filing list and its older page;
  - open.fda.gov 2: the licence and the download page;
  - www.fda.gov 1: the Drugs@FDA glossary, which defines no "efficacy supplement";
  - www.sec.gov 1: Biogen's 8-K, refused (403) without a contact;
  - download.open.fda.gov 1: the new live case, which passes.

  The file itself is the scout's saved copy of 2026-11-06.
- **Checks:** check:fda-supplements is new, with 57 checks on a committed slice of the raw file (17
  applications and an ANDA). They cover:
  - the reader;
  - the committed file;
  - the name test;
  - the proposal's eight cases: Keytruda's S-016 on MRK; Remicade's of 2006 on JNJ through
    Centocor; no Humira supplement on any page; Schering's of 2008 labelled on MRK; Organon's of
    2002 and 2005 on AKZOY; Celgene's before 2019-11-20 on no page; the http letter asked at
    https; and no "new indication";
  - the totals, the company step and the wiring.

  check:fda-approvals is 50 (+1, old Biogen); check:contact counts 34 readers. The live case is
  check:live's `fda_supplements`. On main the new check cannot run, since the reader does not
  exist. `npm run check` and `npm run lint` pass. HawkScan cannot run here (`HAWK_API_KEY` unset).

## NC ledger — batch 114: EPA's cases under the utilities' operating companies (2026-11-07)

The 2026-11-07 proposal 3, approved by the owner that day ("Approve all three, titles from the FDA's
data"). No new source: 140 more entries in `UNITS` (`lib/epaCases.ts`) on 33 utility holding
companies, each between the days its owner held the operating company, as batch 104's are.

- [x] **The days, each read from a filing** (data.sec.gov, 63 filing lists and older pages). Each
      date comes from the first of these that exists:
      - the buyer's 8-K reporting the completed merger (its report day; item 2.01, or item 2 before
        2004);
      - else the bought company's 8-K reporting the change in control (item 5.01, or 1);
      - else its deregistration that day (Form 15).

      The list is in the comment above `UNITS`. Among them:
      - Gulf Power is Southern's to 2018-12-31 and NextEra's from 2019-01-01 (Gulf Power's 8-K, item
        5.01);
      - Central and South West's companies are AEP's from 2000-06-15;
      - GPU's are FirstEnergy's from 2001-11-07, and Allegheny's from 2011-02-25;
      - Consolidated Natural Gas's are Dominion's from 2000-01-28, and SCANA's from 2019-01-01;
      - ComEd and PECO are Exelon's from 2000-10-20, BGE from 2012-03-12, Pepco's from 2016-03-23;
      - Integrys's are WEC's from 2015-06-29, and Wisconsin Gas from 2000-04-26 (WICOR's 8-K, the
        scout's draft having no day);
      - Narragansett Electric is National Grid's to 2022-05-24 and PPL's from 2022-05-25 (a sale the
        draft did not have);
      - Columbia Gas of Massachusetts is NiSource's to its sale of 2020-10-09.
- [x] **Corrections to the scout's draft**, found reading the filings and the names:
      - Illinois Power is still Ameren's (now Ameren Illinois): no end day;
      - Bay State Gas, Yankee Gas, Holyoke Water Power and Edison Mission are left out, adding
        nothing: no case names the first three after their purchase, nor Edison Mission while
        Edison International held it;
      - FirstEnergy Solutions and its generation and nuclear companies end on 2018-03-30, the day
        before FirstEnergy's 8-K reports them gone in bankruptcy;
      - Vistra's Luminant and TXU Energy count from its first price (2016-10-05, read from Yahoo),
        and "TXU ELECTRIC DELIVERY", now Oncor, is not Vistra's;
      - names that are no utility's are kept off: "SOUTHERN POWER DISTRICT" (Nebraska's),
        "INTERSTATE POWER SYSTEMS" (an engine dealer), "MISSISSIPPI POWER & LIGHT" (Entergy
        Mississippi's old name);
      - each unit is asked by a key of its own, never one inside unrelated words ("dte" sits
        inside "unitedtechnologies", "generation" in thousands of names).
- [x] **Two purchases older than EDGAR.** Southern bought Savannah Electric in 1988, and Northeast
      Utilities bought PSNH in 1992. EDGAR's 1993 indexes hold no filing of either, so each unit counts
      from its first filing in the buyer's system:
      - Savannah Electric from 1994-03-28: its 10-K for 1993 is one filing with Southern's;
      - PSNH from 1994-02-09: its holding-company certificate, its 10-K for 1993 filed by Northeast
        Utilities.

      Four of their cases (1990, 1992, 1993 ×2) wait for those days, which www.sec.gov's documents
      give once `NEWS_CHARTS_CONTACT` is set.
- [x] **Read by hand:** all 253 distinct defendant names the patterns take on EPA's whole file, each
      inside its days. None is another company's.
- [x] **Measured on the replay** (before first prices):
      - 7,964 rows on 683 companies (7,545 on 670), 6,817 before 2017, and no row of before lost;
      - 419 more rows on 31 companies, 261 of them a court case or a penalty, 218 before 2017;
      - 13 companies had no EPA row and now do: PSEG 44, Exelon 22, NextEra 19, NiSource and DTE 16,
        WEC 13, Vistra 11 (4 from its first price), OGE 6, Hawaiian Electric 5, MGE, IDACORP and TXNM
        4, Evergy 1;
      - among the larger pages: AEP 5→40, Southern 3→37, Dominion 2→34, National Grid 5→27,
        FirstEnergy 3→25.
      - Ohio Edison's New Source Review decree of 2005 is now on FirstEnergy's page, NIPSCO's of 2011
        on NiSource's, Consumers Energy's of 2014 on CMS's. Batch 113's figures come with them.
- [x] **The slice** gains every row of the five tables for the 1,133 cases the new units' keys name,
      from the same copy of 2026-10-31: 7,161 cases, 2.32 MB. Its old rows are untouched.
- **Left as it is:** the Justice Department archive's titles naming these companies (PSEG Fossil,
  Ohio Edison, Alabama Power, FirstEnergy Nuclear) are not in the release map. Whether today's rule
  gives them to the parent was not replayed.
- **Requests:** 64, all logged in the session scratchpad (`b114/requests.log`), each with User-Agent
  `News Charts Research` and no email address, at least 1.1 s apart:
  - data.sec.gov 63: 52 companies' filing lists and 11 older pages;
  - query1.finance.yahoo.com 1: Vistra's first trading day.
- **Checks:** check:epa-cases 87 (+11):
  - NIPSCO's, Consumers Energy's and Ohio Edison's decrees, and Ohio Edison's past off FirstEnergy
    before its first price;
  - Gulf Power and Narragansett on each side of their sales, Columbia Gas of Massachusetts to its
    sale, and Progress Energy and PECO only from their purchases;
  - the guards, and the Georgia Power cases on Southern and GPJA;
  - the utilities' counts, every key inside every name it serves, and PSEG's ingest by its units'
    keys alone;
  - the totals and batch 113's figures re-pinned on the larger slice.

  On main the new cases fail. `npm run check` and `npm run lint` pass. HawkScan cannot run here
  (`HAWK_API_KEY` unset).

## NC ledger — batch 113: EPA's own figures on its rows, and the 2026-11-07 approvals filed (2026-11-07)

The owner's call of 2026-11-07, "Approve all three, titles from the FDA's data", on the 2026-11-07
proposals. This batch files all three into Scope refocus and builds #1, both its parts. No new
source: one more table and three more columns of the zip the monthly walk already reads. #3 (the
utilities' operating companies) and #2 (the drug supplements, titles from the data alone) are next.

- [x] **The settlement's penalty where EPA gives the case none** (`readCases`, `addAmounts`).
      - A case of one settlement and no case total takes the settlement's federal and state
        penalty, added in whole cents, never through a float, and is marked as the settlement's
        (`settled`). A case of several settlements keeps none: a sum would put other parties'
        settlements of other years on one row. Deepwater Horizon's four (MOEX 2012, Transocean
        2013, BP and Anadarko 2015) stay unsummed.
      - EPA's case totals stop in the 2010s, so before this no row from 2017 on gave a penalty.
        Now 2,125 rows do, 1,250 more, 890 of them before 2017:
        - AEP's 2007 decree: $6,225,000 and $750,000 on its two case numbers;
        - Cummins's diesel decree of 2024: $1,675,000,000, of which $1,478,000,000 federal and
          $197,000,000 state;
        - BP's Texas City refinery, 2009: $12,000,000.
      - A case that now has a penalty has its own row, so no month row of "orders or complaints
        with no penalty" holds one (402 month rows become 277).
- [x] **The work ordered, EPA's estimate.** It is named on 2,805 rows, 2,363 of them before 2017:
      AEP's $1,923,940,000 and $231,800,000, the Tennessee Valley Authority's $5,000,000,000 (2011).
      A settlement of several parties says it is the whole settlement's: "among 271 parties"
      (Omega Chemical's Superfund site). A day of several cases names each one's penalty in the
      description, since the title gives only the largest.
- [x] **EPA's own summary as the row's description** (`summaryOf`), on 6,417 rows, 5,395 before
      2017.
      - **Shown only when it says something.** It must be at least 25 characters, and not a
        placeholder ("CASE SUMMARY REQUESTED", "TO BE ENTERED", "X"), a step and a day
        ("CONSENT DECREE ENTERED ON 12/10/07") or a facility's address.
      - **Read by hand:** every kind of dropped text on the 5,318 cases the replay's pages hold
        (170 dropped of the 4,838 with any text), and a fixed sample of 30 shown before 2017. Of
        the 30, 28 or 29 say what was wrong or what was ordered; the one facility record found
        ("* FACILITY NAME: TEXAS INSTRUMENTS INC 34 FOREST ST…") is now dropped too.
      - **Cleaned:** spaces collapsed; a word broken across a line joined; cut at a word after 600
        characters, so a page of hundreds of cases still carries its news. ExxonMobil's EPA rows
        weigh 230 KB of the page's 1,800 KB, against 112 KB before.
      - **Lost characters.** EPA's file holds the replacement character where its text lost one
        (36 page cases). It reads as an apostrophe between a letter and an "s" ("EPA'S"), as a
        section sign before a number ("42 U.S.C. §§ 9607"), and otherwise as a quotation mark
        ("AOC" in quotes).
      - **Left as written:** a word EPA broke with a space, "ENVIRONMEN- TAL" (172 page cases),
        stays as written. In capitals nothing but a dictionary tells it from "OZONE- DEPLETING".
- [x] **A moved row keeps its history** (`legacyDedupBasis`, batch 100's mechanics). A month row of
      "no penalty" whose cases all have a penalty now moves onto the first of their own rows.
      - On the replay, all 950 such month rows are taken up and none is lost; check:epa-cases holds
        this by replaying the rule before.
      - **On the local Postgres 16** (seeded, in a rolled-back transaction): ExxonMobil's 273 stored
        rows became 288 with 16 new events written. 272 kept their identity, and one merged into the
        day row its case already had. GE's 284 kept all theirs. Nothing was left unlinked.
- [x] **Found storing the slice in a real database: a NUL made every month's read fail.**
      - EPA's file holds 15 NULs (2026-10-31), one in the case name "H.O.D. LANDFILL", and Postgres
        refuses any text holding one. So since batch 95, the whole month's read would have rolled
        back and kept nothing.
      - Text is now stored without control characters (`plain`).
      - No page was ever affected, since the scheduler has not run outside this container.
      - **On the local Postgres:** all 6,028 slice cases were stored through the walk, and every
        penalty, flag, work figure and summary read back as read from the file.
- [x] **db/043** adds `penalty_settled`, `work_ordered` and `summary` to `epa_cases`, and forgets
      the last read, so the next run reads the file whole and the kept cases gain them. A file
      without the settlements table gives the case totals alone, as before: degraded, not broken.
- [x] **The slice** (`scripts/fixtures/epa-cases-slice.json.gz`) gains, for its own 6,028 cases and
      from the same copy of 2026-10-31:
      - the settlements table (6,135 rows on 5,553 cases);
      - the case table's work-ordered and summary columns.

      Its old columns are byte for byte the file's, decoded as UTF-8. Read as Latin-1, one case name
      differed, and that misreading is why the scout saw "ï¿½" where EPA's text holds "�". The slice
      grows from 0.84 MB to 2.05 MB.
- **Totals on the replay, before first prices:** 7,545 rows on 670 companies (7,428), 6,463 before
  2017, 7,268 of them a case's own row. ExxonMobil 288, GE 284, Chevron 269, BP 248, GM 225.
- **Requests:** none.
- **Checks:** check:epa-cases 76 (+16): AEP, Cummins, Deepwater Horizon, Omega's 271 parties, the
  month rows, the totals, every moved row kept, money in cents, the summary's cleaning and floor and
  cap, a file without the table, the zip's table, db/043, and the NUL.

  On main the new cases fail. `npm run check` and `npm run lint` pass. HawkScan cannot run here
  (`HAWK_API_KEY` unset).

## NC ledger — batch 112: a new opportunity-scout run, three proposals for the owner (2026-11-07)

Every proposal of 2026-11-06 is approved and built (batches 104–106), and batches 107–111 fixed what
the 2026-11-07 audit found. So the `opportunity-scout` read the repository again at `d349d4b` and
wrote `docs/proposals/2026-11-07-proposals.md`: three proposals, all **PENDING**, ranked with
securities depth first. Nothing is built in this batch.

- [x] **Owner: mark each proposal `APPROVED`, `REJECTED` or `DEFERRED`** (with a reason for a
      rejection). The scout's second pass then files the approved ones into this checklist.
      ✅ **Marked 2026-11-07: all three approved** ("Approve all three, titles from the FDA's
      data"), filed under Scope refocus by batch 113.
      1. `P1` **EPA's own figures on the case rows pages already hold.** No new source: one more
         table (`CASE_ENFORCEMENT_CONCLUSIONS`) and three more columns of the zip the monthly walk
         already reads.
         - **The gap:** on the replay's 7,026 own rows, 1,122 show no penalty though EPA's
           settlement record has one (779 before 2017). AEP's 2007 decree reads as a bare "consent
           decree"; EPA records $6,225,000 and $750,000 federal penalties on its two case numbers
           that day, and $2.16 billion of work ordered.
         - **The rule:** a case with one settlement takes that settlement's penalty: 1,079 rows (755
           before 2017). Where both figures exist they agree: 797 of 810 on the replay's cases to the
           dollar, 12 on the federal share, 1 apart. 44 cases with several settlements and no total
           stay as they are (Deepwater Horizon among them).
         - **Also:** EPA's estimate of the work ordered on 2,523 rows (2,120 before 2017), written
           "among N parties" on a multi-party row; and 246 cases now grouped as "no penalty" though
           EPA records one. Optionally EPA's summary text (4,203 of 4,630 cases; 20 of a sample of 30
           informative).
      2. `P2` **New indications and other efficacy supplements, for drugs whose holder never
         changed.** A dataset for the owner to decide: Drugs@FDA through openFDA, CC0, no key.
         - **Why it is back:** the 2026-10-26 run cut Drugs@FDA because its sponsor is today's
           holder. Batch 105's compilation gives the applicant at approval; where today's sponsor is
           the same applicant, the holder never changed (523 applications).
         - **Measured** through batch 105's rule from first prices: 973 supplements on 27 pages, 352
           before 2017, 121 before 2005. Merck 179, BMS 160, J&J 79, Lilly 72, Novartis 69. In a
           sample of 25 rows and all 58 page–sponsor pairs, no false match.
         - **What one is:** of 12 approval letters read, 7 add an indication, 1 widens a population,
           3 change labelling or dosing, 1 is a correction. "About 60% new indications" is an
           estimate. One owner call inside it: titles from the data alone, or each letter read once
           (about 900 PDFs, then 60–85 a year).
      3. `P2` **EPA's cases against the utilities' operating companies.** No new source: about 60
         more `UNITS` patterns on 31 utility holding companies (Georgia Power on Southern, Ohio
         Edison on FirstEnergy, PSE&G on PSEG).
         - **Measured:** 442 cases, 213 a court case or a penalty, 186 of those before 2017. 13
           pages with no EPA row gain some: PSEG 0→44, Exelon 0→22, NextEra, NiSource, DTE, WEC.
           NIPSCO's 2011 decree ($609.5M of work) and Consumers Energy's of 2014 ($1B) reach their
           owners' pages.
         - **Read by hand:** all 257 names the patterns take and 25 sampled cases. One false match:
           "Mississippi Power & Light" is Entergy's, which needs a guard.
         - **Not yet read:** the ownership days are the scout's estimates; each is to be read from
           EDGAR filings at build time, as batch 104's were.
- **Cut, with reasons in the file:**
  - device approvals (PMA): the applicant field is today's holder (St. Jude's 1982 heart valve reads
    "ABBOTT MEDICAL"), with no compilation that fixes it;
  - supplements whose holder changed (Humira, GSK's oncology drugs, Viatris), and renames inside one
    company ("PF Prism", "MSD SUB MERCK"): a possible later hand list;
  - pipeline and conglomerate units in EPA's file (BNSF, Pratt & Whitney, Otis, Carrier, El Paso):
    not measured, a follow-on if #3 is approved;
  - EPA's facility table: cosmetic beside #1.
- **Checked by this session:** the zip holds `CASE_ENFORCEMENT_CONCLUSIONS.csv` and the three
  columns, and `lib/epaCases.ts` reads none of them; AEP's two 2007 case numbers carry $6,225,000 and
  $750,000 in EPA's settlement table and nothing in the case total; across the whole file, 22,152 of
  the 22,199 cases with one settlement and both figures agree to the dollar, and 39,494 have a
  settlement penalty and no case total.
- **Requests:** 44, logged in the session scratchpad (`b112/requests.log`):
  - query1.finance.yahoo.com 22: the utilities' first trading days;
  - www.accessdata.fda.gov 18: approval letters (6 `http://` addresses would not resolve and were
    asked again at `https://`);
  - download.open.fda.gov 2: the Drugs@FDA and PMA files;
  - api.fda.gov 1 and open.fda.gov 1, its licence page.

  Each carried the User-Agent `News Charts Research`, with no email address, at least 1.2 s apart.
  No SEC host was asked. Postgres was not used.
- **For the next audit:** 246 EPA cases sit in "no penalty" month rows though EPA records a penalty
  (`ownRow` reads only the case total); two utility cases (05-2003-0333, 03-2000-0138) are dated by
  orders lodged in 2014 and 2016, though their complaints were filed in 2003.

  `npm run check` and `npm run lint` pass.

## NC ledger — batch 111: a legal form in either spelling (Toro's recalls), and two page-speed fixes (2026-11-07)

From the 2026-11-07 audit's set-asides and batch 109's leftover, under the owner's "Merge and
continue".

- [x] **A legal form in either spelling** (`legalSpellings` and `shortForms` in `lib/edgarName.ts`).
      EDGAR keeps one spelling of a legal name's form ("TORO CO"); a recall, a caption or a title
      writes either ("The Toro Company").
      - The forms: Co and Company, Corp and Corporation, Inc and Incorporated, Ltd and Limited. A form
        is a whole word at the end, so "PepsiCo" and "Bancorp" end in none.
      - Read where a company is named by its legal name: `companyNames` for a company whose everyday
        name is shared, the SEC's caption rule (`captionParty`, which EPA's, the CPSC's, the CFPB's,
        the Board's, the FDA's and the Digest's rules share), and headline scoring (`aliasesFor`).
      - `listedCompaniesNamed` counts the two spellings as one name, so "Independent Bank
        Corporation" is still both banks' legal name and neither's.
- [x] **Batch 109's Toro leftover was this, not the title.** Batch 109 said the CPSC rule reads no
      maker from a recall's title, so Toro's riding-mower recall of 2001-07-20 was on no page. Its
      maker line does name it, "The Toro Company, of Bloomington, Minn."; the rule missed it because
      "Company" was not "CO".
      - Toro's page (TTC) held 5 of the recalls naming it and now holds 19: 16 as maker, from 2000 to
        the Power Max snowthrowers of 2021, and 3 mowers it imported or distributed (2013, 2015).
      - Toro Corp. (TORO), the shipping company, gets none, and "Toro and Exmark commercial dealers"
        is still no store line.
      - The 9 recalls of 1985–1999 naming plain "Toro" as maker (the Lawn-Boy recalls among them)
        stay on no page: "Toro" is both companies' name.
- [x] **Measured on the saved data**, every replay against main's:
      - CPSC: 2,302 rows on 196 companies (2,288), all 14 new rows Toro's own;
      - SEC cases: 1,150 company days on 371 companies (1,148 on 370). Rio Tinto Limited's two cases
        with Rio Tinto plc, LR-24085 (2018-03-27) and LR-25898 (2023-11-21), are now also on RTNTF,
        whose record writes "RIO TINTO LTD"; the 2023 proceeding naming only the plc is not;
      - EPA: 7,428 rows on 670 companies (7,427). "OLIN-CORPORATION", Olin's legal name spelled
        out, is among the 55 defendants of the Distler Brickyard settlement of 1995-10-26;
      - the Justice Department's, the SEC's releases, the Board's, the CFPB's, the CFTC's, the
        Digest's and the FDA's: unchanged.
- [x] **A recall's count in the Commission's own words.** "about Approximately 39,000 units" now
      reads "approximately 39,000"; 74 recalls qualify their count this way ("Approximately" 56,
      "More than" 15, "Up to" 3).
- [x] **A page's links found by its subject** (db/042, the audit's set-aside). `event_subjects`'
      key begins with the event, and only the unscored backlog's partial index began with the
      subject. On a local Postgres 16 with 337,034 links and a 409-row page, the page's events took
      24–33 ms and take 2.7–3.0 ms.
- [x] **"Also on" without a queue to read** (db/042). Measuring the index found the larger cost.
      db/041's case-number index is a GIN index, which queues new entries in a pending list until a
      vacuum merges them, and every lookup reads the whole list meanwhile.
      - After 30,000 case rows were written, each of the page's lookups took 2–4 ms and "Also on"
        434–754 ms; with the list merged, 32–51 ms.
      - db/042 turns the queue off (`fastupdate = off`) and merges the list the index had. Writing
        30,000 rows straight into the index took 516 ms, against 506 ms queued.
      - What is left of the 51 ms is a read of the links table, which Postgres picks while it is
        cheaper than the 7,000 key lookups it estimates; on a larger table it picks the lookups.
      - Applied through `npm run db:migrate` on the local database. Every probe row was written in a
        transaction rolled back after.
- **Requests:** none.
- **Checks:**
  - check:shared-names 19 (+5): both spellings, a form as a whole word, the count of one name,
    captions and headlines;
  - check:cpsc 36 (+2): Toro's 19 and the qualified counts, with its totals;
  - check:sec-cases 76 (+1): Rio Tinto Limited's two cases, with its totals;
  - check:epa-cases 60: its totals, Olin's settlement among them;
  - check:also-on 23 (+3): db/042's index, both of a page's queries starting from it, and the queue
    turned off.

  On main the new cases fail. `npm run check` and `npm run lint` pass. HawkScan cannot run here
  (`HAWK_API_KEY` unset).

## NC ledger — batch 110: Schering-Plough's past on Merck's page, labelled (2026-11-07)

The owner's call of 2026-11-07, asked when they said "Lets update mercks history": **"Add
Schering-Plough, labelled"**, the audit's option (c). Batch 108 had built option (a): old Merck's
record as MRK's history, and the record's own past, Schering-Plough's, on no page.

- [x] **Old Merck stays Merck's history** (`lib/predecessors.ts`, batch 108), matching the price
      chart back to 1962. Its rows carry no label.
- [x] **Schering-Plough's past comes back, labelled.** It covers MRK's record's own filings before
      2009-11-04, its rename into Merck's name, the cases its former name gives, and its Digest
      entries.
      - **The label** is set at read time (`ownPastLabelled`, in `loadEvents`): the source reads
        "… · Schering-Plough, before its 2009 merger with Merck".
      - **Filing titles** carry its name: "Schering-Plough: Annual report (10-K)", where EDGAR's
        record now says Merck's.
      - **What gets the label:** a case, approval or Digest row before the merger that names
        Schering-Plough or its Organon, and not Merck. One naming both is old Merck's history too,
        and stays unlabelled.
      - **What changed in code.** `OWN_RECORD_FROM` now labels the record's past instead of dropping
        it. The filings reader and the Digest book keep it, and batch 108's `unlinkOwnRecordBefore`
        is gone: rows that step took off any database come back at the next run.
      - **What stays.** Batch 108's other fix stands: a predecessor's last rename before the handover
        (old Merck into Merck Sharp & Dohme) is no rename of the company's.
- [x] **Schering-Plough's drug approvals on Merck's page** (`APPLICANT_NAMES` for MRK).
      - **"Schering"**: eleven approvals before the merger are labelled, Dormalin (1985) to Noxafil
        (2006), Claritin, Zetia and Cedax among them. Victrelis (2011) comes after it and is Merck's
        own.
      - **Organon**: from 2007-11-19 to 2021-06-02. Its start is Schering-Plough's 8-K reporting the
        purchase; its end is Organon & Co.'s 8-K of 2021-06-03, reporting the spin-off completed the
        day before (item 2.01). That brings Saphris (2009), labelled as Schering-Plough's.
      - **Totals:** 583 approvals on 88 companies before first prices (570); from the 26 drugmakers'
        first prices 452, 316 before 2017, 71 before 1994 (439, 303, 66). Merck now has the most: 58.
- [x] **On a real database** (the local Postgres 16, seeded rows, deleted after). Through
      `loadEvents`:
      - Schering-Plough's 2005 annual report reads "Schering-Plough: Annual report (10-K)", with the
        label;
      - its 2004 Justice Department settlement is labelled;
      - old Merck's 2008 annual report and MRK's own 2012 one are as filed.
- **Requests:** 1, to data.sec.gov: Organon & Co.'s filing list (1821825), for its spin-off day.
  User-Agent `News Charts Research`, no email address.
- **Checks:**
  - check:predecessors 36 (+1): Schering-Plough's filings and rename kept, the labels and titles on
    the page, and the read's wiring;
  - check:digest-walk 55: MRK read by both records' names;
  - check:fda-approvals 49 (+1), with its totals;
  - check:unlink 12 (−2, the removed step);
  - check:sec-forms 134, its wiring pattern following the read's new line.

  `npm run check` and `npm run lint` pass. HawkScan cannot run here (`HAWK_API_KEY` unset).

## NC ledger — batch 109: a whole name two listed companies hold names neither (2026-11-07)

The 2026-11-07 audit's question 2, under the owner's "go ahead and fix what it finds". The audit
found "INDEPENDENT BANK CORP" was the EDGAR name of both INDB (Rockland, Massachusetts) and IBCP
(Michigan), and "FIRST BANCORP" of both FBP and FBNC. Every case, release, notice or headline naming
either name landed on both pages, and both asked the news the same query. This batch looked further
and found twelve everyday names held by more than one listed record.

- [x] **The twelve, read by hand** (`check:shared-names`, from the committed index):
      - **one group's two records, which keep the name** (`ONE_GROUP`, `lib/sharedNames.ts`):
        - Rio Tinto plc and Rio Tinto Ltd, the two halves of one dual-listed group;
        - Resolution Minerals and its depositary's ADR record, which files only Form F-6;
        - WISeQey Corp. and the WISeKey record it succeeded by an 8-K12B of 2026;
      - **nine names held by different companies:**
        - Independent Bank (INDB, IBCP);
        - First Bancorp (FBP, FBNC, FNLC);
        - Toro (TTC, the mower maker; TORO, a shipping company);
        - Graham (GHC, GHM);
        - Citizens (CIA, CIZN);
        - Blue Owl Capital (OWL, OBDC);
        - Farmers & Merchants Bancorp (FMCB, FMAO);
        - Meridian (MRBK, MRDN);
        - Fluent (FLNT, CNTMF).
- [x] **The rule.** For the nine, the shared name names neither:
      - **`listedCompaniesNamed`** counts a legal name as well as an everyday one. "INDEPENDENT BANK
        CORP" is two records' once the "/MI/" tag is off, so the caption rules of the SEC, the Board
        and every source that reads them refuse it. Before, they refused only an everyday name two
        companies hold (batch 73).
      - **`companyNames`** gives such a company its own legal name instead, where no other listed
        company's is the same: "TORO CO", "First Bancorp, Inc" for Maine's. Otherwise it gives none,
        so the two Independent Bank banks and FBP and FBNC are asked nothing by name: the Federal
        Register and the Justice Department's search ask nothing.
      - **The Justice Department's rule** (and the CFTC's, which reads it) skips a shared name, as
        the SEC's rules did.
      - **Headline scoring** (`aliasesFor`) drops the name and its words, and keeps the company's own
        legal name and its ticker. "Independent Bank Group to pay penalty" is neither bank's news;
        "Independent Bank Corp. (NASDAQ: INDB) reports…" is INDB's.
- [x] **Measured on the saved data.** Every case source's replay but one is unchanged. The CPSC's
      loses one recall on two pages: Toro's riding-mower recall of 2001-07-20 was TTC's and Toro
      Corp.'s "sold in its stores" only by the line "Toro and Exmark commercial dealers". The slice
      gives 2,288 rows on 196 companies (2,290 on 197).
- **The price, and what is left:**
  - "Toro beats estimates" no longer names the mower maker, as it names the shipping company as
    much; TTC keeps "Toro Co" and its ticker.
  - [x] **The CPSC rule reads no maker from a recall's title** ✅ **Done in batch 111**, so that Toro recall, "CPSC, The Toro
    Company Announce Recall of Riding Mowers", is now on no page. Its right page is TTC's, by its
    maker; left for the next audit. (Batch 111: its maker line names "The Toro Company", which the
    rule did not read as "TORO CO"; it is TTC's again, with 13 more.)
  - FBP's own litigation release of 2007 ("First BanCorp") stays missed: its name is FBNC's too.
- **Requests:** 3, all to data.sec.gov: the filing lists of the WISeQey records (2107968, 1738699)
  and of the Resolution Minerals ADR record (2086869), to read whether each is one company's. Each
  carried the User-Agent `News Charts Research`, with no email address, at least 1.1 s apart.
- **Checks:**
  - new `check:shared-names` (14): the twelve, the counts, the names, the rules, headlines, and that
    a company with no name of its own asks nothing;
  - `check:cpsc` 34 (+1, the Toro store line), with its totals.

  On main the new check fails. `npm run check` and `npm run lint` pass. HawkScan cannot run here
  (`HAWK_API_KEY` unset).

## NC ledger — batch 108: Merck's history, the old Waste Management's cases, and stale rows taken off (2026-11-07)

The 2026-11-07 audit's questions 1, 3 and 4 and its set-aside, under the owner's word of 2026-11-07:
"go ahead and fix what it finds". For Merck the audit gave three options and recommended (a); this
batch builds (a), which the project's written rules point to. The owner can still choose (b) or (c)
(`docs/OWNER-ACTIONS.md`).

- [x] **A rule change reaches the stored pages** (the set-aside).
      - **The problem.** Only filings and the Federal Register ever took a stored row off a page. A
        refusal a later batch added — Sunoco, Inc.'s cases off Sunoco LP, Graco Children's strollers
        off Graco Inc. (batch 100), and this batch's two — reached new runs and never the stored pages.
      - **Fixed.** A case source whose company step builds its rows from data kept whole marks its
        answer complete (`FetchResult.complete`). That covers the SEC's cases and press releases, the
        CFPB's, EPA's, the CPSC's and the CFTC's actions, the Digest and the FDA's approvals, plus the
        Justice Department's archive years, before 2009. Ingest then takes the company off that
        source's stored rows the answer no longer holds (`unlinkGone`, in the run's own transaction).
      - **What it never does.** It takes off only links, never events, and only from rows no other
        source attests. It never acts on an answer that stopped short: no first price yet, a fund's
        series, a failure with no rows, a transform that dropped rows. The Justice Department's API,
        whose answers are capped, and the Federal Reserve Board's live feed, never kept, are never
        read as complete.
      - **On a real database** (the local Postgres 16, seeded rows, all deleted after): of four
        stored EPA rows, the one the answer no longer held came off the company's page, and stayed on
        another company's that holds it. A row another source also attests stayed, and so did one
        after the answer's window.
- [x] **Merck** (question 1, option (a)).
      - **The predecessor.** `lib/predecessors.ts` maps old Merck's record (64978) as MRK's to
        2009-11-04. There is no notice of succession: the entry rests on the merger's 8-K on MRK's
        record (0001193125-09-223917, items 2.01 and 5.03), and old Merck's own 8-K that day reports
        its delisting.
      - **Its own record's past.** `OWN_RECORD_FROM` (new) keeps MRK's own record's past before that
        day off the page: its filings, its former name SCHERING PLOUGH CORP (so its cases by that
        name), and its Digest names. Stored ones come off at the next run (`unlinkOwnRecordBefore`).
      - **A predecessor's rename at the handover.** Its last rename before the handover, not the
        record's last, is the one tested. Old Merck became Merck Sharp & Dohme Corp. two days before
        the merger, and an LLC thirteen years after; neither is a rename of MRK's.
      - **The Digest.** `data/digest-records.json` gains old Merck's record (1,456 records, rebuilt
        offline from the sixteen saved EDGAR indexes of 1993–1996; no other record changed). Merck is
        read in 1985 by "MERCK & CO INC": three 8-K reports of 1985, and no Schering-Plough name.
      - **Measured** (the audit's counts): MRK's page loses Schering-Plough's 864 filings of 1994–2009
        and gains old Merck's 1,342. Of its case rows, 4 EPA rows, 2 SEC cases, 1 SEC press release,
        2 Justice releases and Cedax were Schering-Plough's alone, by its name, and come off. Old
        Merck's cases and approvals, by "Merck", stay.
      - **On a real database:** Schering-Plough's annual report and its rename came off the test
        page, and with them the former name the case sources read it by. Old Merck's annual report,
        MRK's own later filings and a news story stayed.
- [x] **The old Waste Management** (question 3). EPA's `NOT_THE_COMPANY` takes a day (`before`):
      "Waste Management" names WM only from 1998-07-16, when USA Waste Services, WM's record, bought
      the old company and took its name (its 8-K that day, items 2, 5 and 7). Nine rows come off WM:
      the audit's six of 1994–1998 and three earlier the first price already kept off. No other
      company changes, and WM keeps 97 rows from 1998-07-16. The slice gives 7,427 rows on 670
      companies (7,436), 6,367 before 2017.
- [x] **Organon** (question 4, option (a)). Organon was Akzo Nobel's until Schering-Plough bought it
      on 2007-11-19, by Schering-Plough's 8-K of 2007-11-26 (item 2.01). Its eight approvals of
      1990–2001, from Arduan to NuvaRing, are now on Akzo Nobel's page (AKZOY, first price
      1989-05-09). Saphris (2009) was Schering-Plough's and stays on no page. The approvals give 570
      on 88 companies before first prices (562 on 87); the 26 drugmakers' totals are unchanged.
- **Requests:** none. The merger's filings come from the audit's saved filing lists of both
  records, and the Digest names from batch 87's saved EDGAR indexes.
- **Checks:**
  - new `check:unlink` (14): which answers are complete, what a run does with one, and the two
    queries;
  - check:predecessors 33 (+5): MRK's filings across both records, and the renames;
  - check:digest-walk 55 (+1, and its 1985 counts);
  - check:epa-cases 60 (+2);
  - check:fda-approvals 48 (+1);
  - check:doj 94, its wiring pattern following the Justice step's new form.

  On main the new cases fail. `npm run check` and `npm run lint` pass. HawkScan cannot run here
  (`HAWK_API_KEY` unset).

## NC ledger — batch 107: the audit of batches 101–106, and its five findings fixed (2026-11-07)

The `code-auditor` read batches 101–106 (`9c580cf..013ecc8`); its report is
`docs/audits/2026-11-07-code-audit-b101-106.md`. The owner's word, 2026-11-07: "go ahead and fix what
it finds". It found the batches' mechanics sound on the saved real data:
- each of the 24 dated unit days matches its EDGAR filing;
- the 53 EPA unit patterns take only their owners' companies, inside their days;
- the FDA reader agrees with an independent reading on all 1,387 approvals;
- "Also on" uses its index unforced at 330,000 attestations, about 0.3 s for a 409-row page.

It found five defects, each reproduced here and fixed, each with cases that fail on main. It also
answered the four questions batches 104–106 left open. Two of them, Merck and old Waste Management,
put wrong rows on pages; they are batch 108's. The shared bank names are batch 109's.

- [x] **1. "· 2 sources" (up to 5) on a row one agency attests** (`P2`).
      - **The cause.** A row of the six sources that join several cases' numbers into one row is
        stored again when its list grows, as a second attestation of the same event. The page counted
        attestations as sources. Batch 106 brought this to SEC and CFPB day rows; CPSC months already
        showed it ("CPSC: 14 recalls of products sold in its stores, January 2025 · 4 sources" on
        Amazon's page).
      - **The audit's one-word fix, not taken.** Counting distinct sources would make a story twelve
        papers carried read as one: the news feeds attest each paper under one source id.
      - **Fixed** (`lib/corroboration.ts`, `loadEvents`). The page reads its rows' attestations'
        sources and counts each attestation once, but a grouped source's versions once
        (`GROUPED_ROW_SOURCES`: SEC cases, CFPB, EPA, CPSC, CFTC, the Digest). "Also on" still reads
        every version's numbers.
      - **On a real database** (the local Postgres 16, the audit's own re-ingest of RF's 2009-09-21,
        and JPMorgan's and Wells Fargo's 2015-01-22): the three rows no longer say "· 2 sources", and
        JPMorgan's and Wells Fargo's still name each other. The database returns the sources as a
        list of numbers: three news attestations and two versions of one SEC row count 4.
- [x] **2. Six FDA approvals of listed companies' own or bought units on no page** (`P3`). **Fixed**
      in `APPLICANT_NAMES`, each day read from the bought company's filing list:
      - Alexion on AstraZeneca from 2021-07-21 (its Form 25 that day, and its 8-K of the merger):
        Voydeya (2024);
      - Anacor on Pfizer from 2016-06-24 (its 8-K, items 2.01 and 5.01): Eucrisa (2016);
      - Bioverativ on Sanofi from 2018-03-08 (its 8-K, items 2.01 and 5.01): Enjaymo (2022);
      - Ablynx on Sanofi from 2018-06-12, its Form 25, a day surely after control passed (Sanofi's
        13D of 2018-05-25): Cablivi (2019);
      - Jazz's Irish company, "Jazz Pharmaceuticals Ireland Limited", as Jazz's own name: Rylaze
        (2021) and Ziihera (2024).

      Each bought company's earlier approvals stay its own: Soliris and Ultomiris are not
      AstraZeneca's, Kerydin is not Pfizer's. **Measured:** 562 approvals on 87 companies before first
      prices (556); from the 26 drugmakers' first prices 439, 303 before 2017 (435, 302). Left out:
      AstraZeneca's Calquence (2017), filed by Acerta Pharma, a private company of which AstraZeneca
      bought a majority in 2016; no filing gives the day.
- [x] **3. One unreadable year page of the Digest's archive stopped every walk before any issue**
      (`P3`). **Fixed** (`walkDigest`): a year page that fails or lists no issue is passed over for
      the run, reported as an error, and asked again on the next run; the other years' issues are
      read. A refusal still stops the run and the process's asking.
- [x] **4. "Texaco Inc;" refused as a branded station, keeping the Star Lake Canal Superfund order
      of 2016-09-26 (06-2016-2953) off Chevron's page** (`P3`). **Fixed:** the guard's semicolon
      now needs a second name after it ("BP AMOCO; PARTY PLACE" is still refused). The order joins
      Chevron's other no-penalty order of September 2016 in one month row. The slice's rows stay
      7,436, of which 7,034 are a case's own day (7,035).
- [x] **5. The coverage map counted 33 sources** (`P3`). **Fixed:** 35, 27 on the ingest path, now
      pinned against `SOURCES` by check:wiring.
- **The four questions** (the audit's answers, with counts):
  - [x] **Merck.** ✅ **Done in batch 108.** MRK's EDGAR record, CIK 310158, is Schering-Plough's; old Merck's is 64978, and no
        notice of succession links them. MRK's page holds Schering-Plough's 864 filings of 1994–2009,
        its Digest names and, by its former name, its cases (4 EPA rows, 2 SEC cases, 1 SEC press, 2
        Justice releases, Cedax), beside old Merck's cases and approvals by the name "Merck". Old
        Merck's 1,342 filings are missing. Batch 108 takes the audit's option (a): old Merck is MRK's
        history to 2009-11-03, under the project's rules that a predecessor whose ticker a company
        carries counts and an acquisition's past is never the buyer's.
  - [x] **Old Waste Management.** ✅ **Done in batch 108.** Six EPA rows of 1994–1998 on WM's page are the old Waste
        Management's, before USA Waste Services (WM's record) took its name on 1998-07-16. Batch 108
        reads WM's present name only from that day, as the Digest already does.
  - [x] **"Independent Bank Corp."** ✅ **Done in batch 109.** INDB and IBCP are read by the same names, so a case or headline
        naming it lands on both, and both ask GDELT the same query. No saved case row is affected
        yet. First Bancorp (FBP, FBNC) shares a name the same way, and FBP's own litigation release
        of 2007 is missed. Batch 109.
  - **Organon:** nothing is wrongly on OGN's page. Nine approvals and one EPA case before its 2021
    spin-off are on no page; Saphris (2009) hangs on the Merck answer.
- **Set aside:**
  - [x] **A rule change that takes a case off a company leaves the stored link** ✅ **Done in batch 108.** (only filings and
        the Federal Register unlink). Batch 108 needs one for Merck and Waste Management.
  - [x] **`event_subjects` has no full index on `subject_id`** ✅ **Done in batch 111** (db/042, which also turns off the case-number index's pending list): 256–319 ms for a 409-row page at 337,000
    links, inside a page cached 15 minutes. Older than these batches.
  - BP Amoco Chemical's rows of 2022 and 2024 on BP's page, after BP sold its aromatics and acetyls
    business to INEOS at the end of 2020: whether the named company went with it was not read.
- **Requests:** 7, all to data.sec.gov.
  - 3 XBRL frames, the companies' assets at the end of 2015 and 2017, to find the bought companies'
    records: Alexion 899866, Anacor 1411158, Bioverativ 1681689, Ablynx 1617582.
  - 4 of their filing lists.

  Each carried the User-Agent `News Charts Research`, with no email address, at least 1.1 s apart.
- **Checks:**
  - check:also-on 20 (+5: the six sources by id, every builder that joins numbers writes one of them,
    the count, and the page's read);
  - check:fda-approvals 47 (+7);
  - check:digest-walk 54 (+3);
  - check:epa-cases 58 (+2);
  - check:wiring 248 (+1).

  On main the new cases fail. `npm run check` and `npm run lint` pass. HawkScan cannot run here
  (`HAWK_API_KEY` unset).

## NC ledger — batch 106: "Also on" — a case's other listed companies, linked from its row (2026-11-06)

The owner's approval of 2026-11-06 of the 2026-11-06 proposal 3, the last of the three. No new data
and no request: a read beside `loadEvents` and one line in `EventList`.

- [x] **The read** (`lib/alsoOn.ts`, `loadAlsoOn` in `lib/store/read.ts`). For each of a page's
      events attested by one of the eight multi-party sources, the other held company pages with an
      event attested by the same source under an overlapping number:
      - **two ways a case is held.** An EPA case, a CPSC recall, a CFTC order, an SEC litigation
        release or a CFPB action is one event a company. A Justice Department, SEC or Board press
        release is one event, linked to every page it names. The read counts the row's own event
        too, so the second way is found as well as the first.
      - **a grouped row's numbers as a set.** A day's or a month's row carries its cases' numbers
        joined by commas, so the numbers are compared as arrays. The new `db/041_also_on.sql` is a
        GIN index on them, partial on the eight sources. The query writes the same eight ids as
        literals, so the planner can use it.
      - **never the page itself.** Not the page's own company, nor another ticker of its own SEC
        record (GOOG on GOOGL's page), nor a page the case sits below the relevance floor on, nor a
        topic.
      - One company once a row, by name; the first three named, then "and N more".
      - A failed read logs and leaves the rows without the line; the page still renders.
- [x] **Every case's number on a grouped row.** An SEC litigation or CFPB row of several cases on
      one day carried only its first case's number, so another page sharing a later one could not
      find it. It now carries all of them, as EPA's, the CPSC's and the CFTC's rows did; a day of
      one case keeps the number it had, so stored rows change only where they held several.
      - On the saved data, 14 SEC cases and 5 CFPB actions are on two or more pages. One was
        missed before: the CFPB's Genuine Title action of 2015-01-22, second on both JPMorgan's day
        and Wells Fargo's.
      - Ingest keeps the old number's attestation and adds the new one, so the set only grows.
- [x] **The line** (`AlsoOnLine` in `components/EventList.tsx`): "Also on Ford Motor, General Motors,
      Caterpillar and 24 more", each name a link to its page, on its own line under the row in both
      list layouts. The row is itself one link, and links do not nest.
- [x] **Run against a real database** (the local Postgres 16, db/041 applied). Six seeded pages and
      seven events gave, on the first company's page:
      - its EPA case: the second company only. Its own other share class, a page below the floor,
        and a CPSC recall with the same number were left out.
      - its Justice Department release shared with the second company and a topic: the second
        company only.

      On the second company's page, its grouped row named both share classes of the first. A row
      whose numbers only its own page holds said nothing. With sequential scans off, the plan reads
      the overlap from `event_attestations_case_numbers`. The seeded rows were deleted after.
- [x] **Measured** on batch 104's replay of EPA's cases: 672 of 5,322 cases are on two or more
      companies' pages; 3,366 of 7,436 rows hold a case another page holds; two cases are on 36
      pages (02-2009-2006, 04-2013-3751). The scout counted 543, 2,659 of 5,996 and 30 before
      batch 104's units.
- **Checks:**
  - new `check:also-on` (15): the sources against `SOURCES` and db/041, the query's shape, the
    grouping, the line's render (three names and "and 24 more", two names, none), and the wiring;
  - `check:sec-cases` 75 (+1, RF's 2009-09-21 row carries both its keys) and `check:cfpb` 51 (+1,
    Genuine Title on both JPMorgan's and Wells Fargo's rows).

  On main the new check fails (the module does not exist), and so do the two new cases. `npm run check` and `npm run lint` pass. HawkScan
  cannot run here (`HAWK_API_KEY` unset).
- With this batch every 2026-11-06 proposal is built.

## NC ledger — batch 105: the FDA's new-drug approvals since 1985 (2026-11-06)

The owner's approval of 2026-11-06 of the 2026-11-06 proposal 1. A new source, `fda_approvals`
(id 35): CDER's compilation of new molecular entities and new biologics, in the public domain by the
FDA's website policies (quoted in `lib/fdaApprovals.ts`). No key, and no request at ingest.

- [x] **The file.** The FDA's workbook (`www.fda.gov/media/177921/download`), read once a year into
      the committed `data/fda-nme-approvals.json` (new `npm run sync:fda-approvals`).
      - The sheet is read by the new `lib/xlsx.ts` with the repository's own zip reader, no
        dependency.
      - 1,387 approvals, from Lupron (1985-04-09) to Nereus (2025-12-30): 943 before 2017, 279
        biologics.
      - The 14 rows of late 2025 whose day the sheet writes as text are read too.
      - The reading agrees with an independent reading (Python's openpyxl, by the scout) on every
        row's day and applicant.
- [x] **The rule** (`approvalIsCompany`). An approval is the company's when its applicant, on its
      day, is any of:
      - the company's name by the caption rule;
      - one of the FDA recall map's firms on its days (`FDA_FIRMS`);
      - a name only approvals use (`APPLICANT_NAMES`):
        - the companies' own other names: AstraZeneca and Zeneca, "Lilly", Bristol-Myers, Ortho,
          R.W. Johnson, McNeil, Takeda, Biogen;
        - the units they bought, each from the day the deal closed by the bought company's own
          EDGAR filing list: Celgene on BMS from 2019-11-20, Wyeth on Pfizer from 2009-10-15, Loxo
          Oncology on Lilly from 2019-02-15, Millennium (2008-05-14) and Ariad (2017-02-16) on
          Takeda, Human Genome Sciences on GSK from 2012-08-02, Advanced Accelerator Applications on
          Novartis from 2018-01-22, Centocor on J&J from its Form 15 of 1999-10-13;
        - two undated deals given a safe bound: Squibb on BMS from 1990, after the 1989 merger;
          Tibotec on J&J from 2003, after its 2002 purchase.

      An acquisition's past is never the buyer's: Parke-Davis's Lipitor and Searle's Celebrex are
      no page's.
- [x] **The fixes the proposal asked for.**
      - The recall map's Alcon counts on Novartis from 2010-08-26: Alcon's 6-K that day, and
        Novartis's 13D amendment of 2010-08-30, follow the purchase of Nestlé's majority.
      - Its Genzyme counts on Sanofi from 2011-04-08 (Genzyme's Form 25). Neither date changes a
        recall, since the reports begin in 2012.
      - Joint ventures are no owner's: DuPont Merck, Astra Merck, Lilly ICOS (Cialis), TAP.
      - `NOT_THE_APPLICANT` refuses DuPont's pharmaceuticals of 1986–2001 on DuPont de Nemours,
        whose record is DowDuPont's of 2015, and Block Drug's Actinex on Block, Inc.
- [x] **Measured.**
      - **From the 26 drugmakers' first prices** (Yahoo's, as the scout read them): 435 approvals,
        302 before 2017, 66 before EDGAR (1994).
      - **Largest pages:** Johnson & Johnson 47, Merck 45, Novartis 44, Pfizer 41, Bristol-Myers
        Squibb 39, Lilly 34, AstraZeneca 24 (Zeneca's of 1995–1997 among them), GSK 23.
      - **Before any first price:** 556 on 87 companies. The floor then keeps off each company's
        years before it listed: Alcon's before 2019, Sandoz's before Novartis's listing,
        Organon's before 2021.
      - **Read by hand:** every row of the eleven largest pages, and the rest by applicant. Every
        one is the applicant's company on its day.
- **Left out, read but undecided:**
  - "Schering" (12 approvals, 1985–2011): Schering-Plough's US company. MRK's EDGAR record, CIK
    310158, is Schering-Plough's own; old Merck's was 64978, and `lib/predecessors.ts` maps
    neither. Whether Schering-Plough's past is Merck's page's is for the next audit, here and in
    every other source.
  - Organon before its 2021 spin-off: Akzo Nobel's to 2007, then Schering-Plough's.
- **Requests:** 14 in all.
  - data.sec.gov 13: the filing lists of the bought companies: Alcon, Genzyme, Centocor,
    Millennium, Ariad, Wyeth, Pharmacia, AAA, HGS, Loxo, Aventis, Celgene, Merck.
  - www.accessdata.fda.gov 1: Prozac's Drugs@FDA page, to prove the link pattern.

  Each carried the User-Agent `News Charts Research`, with no email address, at least 1.1 s apart.
- **Checks:**
  - new `check:fda-approvals` (40): the workbook reader, the committed file against the committed
    workbook (`scripts/fixtures/fda-nme-2026-11-06.xlsx`), each proposal case and unit, the
    replay, the company step and the wiring;
  - `check:fda-recalls` 61, unchanged;
  - `check:contact` now counts 33 files that read the contact;
  - `check:live` has a new case reading the workbook from www.fda.gov.

  On main the new check fails: the module does not exist. `npm run check` and `npm run lint`
  pass. HawkScan cannot run here (`HAWK_API_KEY` unset).

## NC ledger — batch 104: EPA's cases under the companies' own operating units (2026-11-06)

The owner's call of 2026-11-06, "Approve all three, Shell from 2005-07-20", on the 2026-11-06
proposals. This batch files all three into Scope refocus and builds #2. No new source: batch 101's
hand-checked `UNITS` list in `lib/epaCases.ts` grows from one entry (Sunoco, Inc.) to 53, adding 52 on
34 companies, each between the days its owner held it. #1 (the FDA's new-drug approvals) and #3 ("Also on" links) are next.

- [x] **The units, each day read from an EDGAR filing list** (data.sec.gov):
      - **Chevron:** its operating companies (Chevron U.S.A., products, pipeline, environmental
        management, mining…) its own; Chevron Chemical to 2000-06-30, the day before Phillips
        Petroleum's 8-K reports the joint venture formed (item 2, 2000-07-01); Texaco from 2001-10-09
        (Chevron's 8-K, item 2); Unocal and Union Oil Company of California from 2005-08-10
        (Chevron's 8-K, item 2.01).
      - **Shell:** Shell Oil Company and its US companies from 2005-07-20, the owner's call: that
        day Royal Dutch Shell plc, Shell plc's record, filed its listing and S-8.
      - **BP:** its US companies its own; Amoco from 1998-12-31 (Amoco's 8-K, items 1 and 4);
        Atlantic Richfield and its units from 2000-04-18 (ARCO's 8-K, items 1 and 4); ARCO
        Products and BP West Coast Products to 2013-05-31 (Tesoro's 8-K of their purchase, item
        2.01). ARCO Chemical (Lyondell's from 1998) and ARCO Alaska (Phillips's) are not BP's, and a
        bare "ARCO" is left out: in EPA's file it is also Arco, Idaho's airport.
      - **ExxonMobil:** its companies its own; Mobil's from 1999-11-30, when EXXON CORP became EXXON
        MOBIL CORP (its record).
      - **Union Pacific Railroad** its owner's; Union Pacific Resources to 1996-10-14 (UNP's 8-K of
        its distribution, item 2). **CSX Transportation**, **Norfolk Southern Railway** and **Con
        Edison of New York** their owners'.
      - **Waste Management's state companies** from 1998-07-16, the merger with USA Waste Services
        (its 8-K, item 2).
      - **Murphy Oil USA:** Murphy Oil's to 2013-08-29, Murphy USA's from 2013-08-30 (Murphy USA's
        8-K, items 2.01 and 5.01).
      - **Northrop Grumman's shipbuilders** to 2011-03-30, then Huntington Ingalls's (HII's 8-K of
        the spin-off, item 2.01): Northrop Grumman Ship Systems' decree of 2016 is on HII's page.
      - **Dow Inc.:** The Dow Chemical Company and Union Carbide from 2019-04-01 (its 8-K).
      - **PPL:** PPL Montana and the other generation companies to 2015-05-31 (Talen Energy's 8-K of
        the spin-off, item 2.01).
      - **Verizon:** Information Services to 2006-11-16 (Idearc's 8-K, item 2.01); California,
        Florida, Texas and Southwest to 2016-03-31, and Northwest, North and West Virginia to
        2010-06-30 (Frontier's 8-Ks, item 2.01). Hawaii and Micronesia/Pacifica are left out: no
        filing here gives their sale.
      - **Akzo Nobel's coatings companies.** Its chemicals companies (now Nouryon) are left out:
        AkzoNobel files nothing with the SEC, and Wikipedia answered 429, so the 2018 sale's day was
        not read.
      - **Each company's own operating companies** under its name: Clean Harbors, Halliburton, Nucor
        (not Nucor-Yamato, a joint venture), Occidental, Lockheed Martin, General Dynamics, Boeing,
        Entergy, Duke Energy's utilities, Toyota Motor, Home Depot U.S.A., Lowe's Home Centers,
        Procter & Gamble, Kimberly-Clark (not "Kimberly Clark Printing", 2001), Bunge, CEMEX, Silgan.
- [x] **The guards:**
      - a station, store, dealer, numbered site or "AM/PM" under an oil brand is not the brand's unit
        (`BRANDED_SITE`). It refuses 15 defendant entries in the slice: "AMOCO OIL CO. (#0234)", "MOBIL OIL
        R/S #12634", "UNOCAL (SERVICE STATIONS)"; and so does a brand listed with its dealer ("BP
        AMOCO; PARTY PLACE");
      - joint ventures are no owner's unit: Chevron Phillips Chemical, Motiva, Equilon,
        Nucor-Yamato.
- [x] **Measured** on the slice, rebuilt from batch 95's saved copy of EPA's file with every case a
      unit names on any day (4,289 → 6,028 cases). The old rule on the new slice gives exactly the old
      5,994 rows on 667 companies, so the rebuild changes nothing by itself.
      - **Before first prices:** 7,436 rows on 670 companies, 6,376 before 2017. Of the earlier 5,994
        rows, every case is still on its page; the rows that changed took another case of the same
        day.
      - **From first prices,** the largest gains: Chevron 20→258, BP 4→230, Occidental 10→152,
        Union Pacific 6→98, ExxonMobil 163→273, Waste Management 29→103, CSX 5→77, Shell 15→79
        (from 2005-07-20), Clean Harbors 18→70, Akzo Nobel 8→40 (coatings only), Norfolk
        Southern 0→30, Dow 0→22.
      - **Read by hand:** a fixed random sample of 40 of the 674 added court or penalty cases.
        Every one names the company or its unit inside the owner's days: Mobil Oil's Superfund
        decree of 2000 on ExxonMobil, Union Carbide's of 2019 on Dow, Glidden's of 2010 on Akzo
        Nobel (before the PPG sale), Murphy Oil USA's of 1997 on Murphy Oil. The doubtful names were
        read by their days too: General Dynamics' Fort Worth division (1991, before the 1993 sale)
        and Mobil Oil Guam (2000–2010).
- **Left for later:** Akzo Nobel's chemicals companies, Verizon Hawaii and Micronesia (their sale
  days); the other ~630 companies with EPA rows, whose units no one has read; former names, which
  ingest adds.
- **Requests:** 33 in all.
  - data.sec.gov 29: the filing lists of 21 companies, several in two parts. One, asked at a mistyped
    address, answered 404 and was asked again.
  - en.wikipedia.org 4: three answered 429, and one returned AkzoNobel's summary without the date.

  Each carried the User-Agent `News Charts Research`, with no email address, at least 1.1 s apart.
- **Checks:** `check:epa-cases` 56 (12 new):
  - each proposal case: Chevron U.S.A.'s decree of 1995, Shell Oil's of 1996 on no page and its
    decree of 2005 on Shell's, Atlantic Richfield's of 2011 on BP and of 1997 on none, Amoco's of
    1984 on none, Murphy Oil USA's of 2002 on Murphy Oil;
  - Mobil before and after the merger, Union Carbide before and after 2019, Northrop's shipbuilder
    on HII, Verizon's directories, the station guard, bare ARCO, the joint ventures;
  - the company step asking stored cases by the units' names (Atlantic Richfield's 2000 order on
    BP's page);
  - the replay re-pinned.

  On main the new cases fail: neither the units nor `BRANDED_SITE` exist. `npm run check` and `npm
  run lint` pass. HawkScan cannot run here (`HAWK_API_KEY` unset).

## NC ledger — batch 103: a new opportunity-scout run, three proposals for the owner (2026-11-06)

Every proposal of 2026-11-02 and 2026-11-05 is approved and built (batches 87–102). So the
`opportunity-scout` read the repository again at `9718f0e` and wrote
`docs/proposals/2026-11-06-proposals.md`: three proposals, all **PENDING**, ranked with securities
depth first. Nothing is built in this batch.

- [x] **Owner: mark each proposal `APPROVED`, `REJECTED` or `DEFERRED`** (with a reason for a
      rejection). The scout's second pass then files the approved ones into this checklist.
      ✅ **Marked 2026-11-06: all three approved** ("Approve all three, Shell from 2005-07-20"),
      filed under Scope refocus by batch 104.
      1. `P1` **The FDA's new-drug approvals since 1985, on the page of the company that applied.**
         A new source for the owner to decide.
         - **Why it is back:** the 2026-10-26 run cut drug approvals because Drugs@FDA's sponsor
           field names today's holder. The FDA's compilation of new-drug approvals records the
           applicant from the approval letter: Lipitor (1996) is Parke-Davis's, Celebrex Searle's,
           Humira (2002) Abbott's, not AbbVie's.
         - **The file:** one 294 KB Excel file, read once a year into a committed file. It holds
           1,387 approvals from 1985-04-09 to 2025-12-30: 943 before 2017, 208 before 1993.
         - **Measured** through the caption rule and the recall map's firms, from first prices:
           461 approvals on 82 companies, 279 of them before 2017 on 38 companies, 53 before 1993.
           Most: Merck 47, Novartis 45, Pfizer 39, J&J 32, BMS 30, Lilly 27.
         - **Read by hand:** 12 need fixing (Alcon's five on Novartis before Novartis owned it,
           Genzyme's five on Sanofi, the DuPont Merck and Astra Merck ventures on Merck), because
           the recall map's units have no start day. A hand list of older names (Zeneca, Ortho,
           Tibotec, "Lilly", Squibb) would add about 57 more: an estimate.
         - **Licence:** the FDA's website policies put its content in the public domain (quoted in
           the file). No key, no recurring cost.
      2. `P1` **EPA's cases against the companies' own operating units.** No new source: more
         hand-checked entries in batch 101's `UNITS`.
         - **The gap:** ExxonMobil's page has 163 EPA rows, Chevron's 20, Shell's 15, Union
           Pacific's 6 and Norfolk Southern's none. EPA files the cases under the subsidiaries'
           names (Chevron U.S.A., Shell Oil Company, Union Pacific Railroad), which the caption
           rule rightly refuses.
         - **The proposal:** about 70 unit patterns on 33 companies, each with the days its owner
           held it, a guard against branded stations ("SHELL SERVICE STATION #000329"), and joint
           ventures left out.
         - **Measured** on batch 95's saved case file, from first prices: 1,607 rows added, 1,382
           before 2017, 715 of them a court case or a penalty. Chevron 20→258, BP 4→238, Shell
           15→208, Occidental 10→152, Union Pacific 6→98, CSX 5→77. In a fixed random sample of 40
           cases, every one names the company or its unit; six fall outside the ownership days,
           which drop them.
         - **One new owner call:** whether Shell's units count from Shell's first price (100
           court-or-penalty days from 1984) or from 2005-07-20, when Royal Dutch Shell plc became
           the group's single parent (22 days).
      3. `P2` **A case's other listed companies, linked from its row** ("Also on Ford, General
         Motors and 25 more").
         - **Why it is back:** cut on 2026-10-26 with "nothing to show". The owner's rule that a
           case goes on every company it involves (batch 93), and four sources built since (EPA,
           the CPSC, the CFTC, the Board's 1996–2005 orders), change that.
         - **Measured** on batch 95's saved replay: 543 EPA cases are on two or more companies'
           pages; 2,659 of 5,996 rows (44%) hold a case another page also holds; one case is on
           30 companies.
         - **Build:** one read beside `loadEvents` and one line in `EventList`; no new data. It
           can only name companies whose pages are held, so those counts are a ceiling.
- **Cut, with reasons in the file:**
  - the Treasury's TARP capital purchases: 707 institutions, 109 matches on 108 companies, at least
    7 of them namesakes; in a sample of five banks, 9 of 11 investment and exit days already carry
    the bank's own 8-K within four days;
  - OFAC's civil penalties: 11 matches on 3 of its 23 yearly pages, the large penalties on
    companies with no SEC record here;
  - not retried: the FTC, the OCC and USDA FSIS (unreachable on 2026-11-05); the FDIC's failed-bank
    list (still no licence stated);
  - not measured: a drug's later indications, device approvals, the NTSB, PHMSA.
- **Not raised again:** the open owner calls (JCI's 2016 case on Tyco's record, GE Capital Retail
  Bank on GE, PayPal's 2015 action on eBay, the Digest's first-price floor and its names older
  than EDGAR's).
- **Two things the scout noticed in passing, for the next audit** (not checked or fixed here):
  - "Independent Bank Corp." is the EDGAR name of two listed companies (INDB, Rockland,
    Massachusetts, and IBCP, Michigan). In the scout's TARP replay the caption rule gave the
    Rockland bank's investment to both, and a source read by that rule could do the same.
  - The old Waste Management, Inc.'s Superfund consent decree of 1998-05-11 (case 04-1996-0208),
    from before its 1998 merger with USA Waste Services, is on WM's page under WM's present name.
    The saved replay confirms the row is there, with three more of 1997–1998. Whether a
    predecessor's cases belong on WM's page is for the audit to settle.
- **Requests** (the scout's, listed in the file's header): 63, every one answered 200, none
  redirected, each at least 1.1 s apart, with the User-Agent `News Charts Research` and no email
  address.
  - query1.finance.yahoo.com 38 (first trading days), data.sec.gov 12, home.treasury.gov 5,
    www.fda.gov 4, ofac.treasury.gov 4.
  - No www.sec.gov page was asked, and Postgres was not used. This batch made none of its own.
- **Checks:** `npm run check` and `npm run lint` pass. The batch changes docs only.

## NC ledger — batch 102: the SEC News Digest, step 2 — every issue of 1956–1993 kept, each company's own on its page (2026-11-06)

The owner's call of 2026-11-06, "Go ahead with the Digest step 2", on the count batch 87 made
(the 2026-11-02 proposal 1). A new source, `sec_digest` (id 34), under the licence the SEC cases
quote ("Information presented on sec.gov is considered public information…"). No key.

- [x] **The walk** (`lib/ingest/secDigestWalk.ts`, `db/040_sec_digest.sql`). Each year's archive
      page, 1993 back to 1956, is read once for its list of issues. Then each issue's PDF is read
      once, newest first, and its entries are kept: party, section, the line as printed, and the
      keys a company is asked by. The PDFs are not kept.
      - 60 requests a process, a second apart: the ~9,500 issues take about a week of hourly runs.
      - Only an answer is stored, or an issue www.sec.gov answers 404 for, kept as missing and not
        asked again. A refusal (403, 429, 503), or a page that is no PDF (a block page), ends the
        process's asking. A PDF whose text cannot be read is passed over until the next run and
        reported as an error, so one bad scan cannot hold back the issues behind it. A host without
        `pdftotext` asks nothing at all.
- [x] **The dated names** (`DigestBook` in `lib/secDigest.ts`, `data/digest-records.json`). The new
      `npm run sync:digest-records` writes what EDGAR's sixteen company indexes of 1993–1996 called
      each listed company and each predecessor `lib/predecessors.ts` maps: the first filing, the
      first quarter's names, and each name's first and last day.
      - Built from batch 87's saved zips: 1,455 records of 8,098 companies and predecessors. 3M is
        MINNESOTA MINING & MANUFACTURING CO from 1993-08-13. JPMorgan's record is CHEMICAL BANKING
        CORP, then CHASE MANHATTAN CORP /DE/ from 1996-04-02.
      - A company whose record EDGAR opened after 1996 has no name in the Digest's years, and gets
        no row.
- [x] **The company step** (`digestFor`). The kept entries are asked by the keys of the company's
      names, a superset the book then decides by batch 87's rule: under the names its record had
      on the issue's day, and no other company's name that day.
      - Rows count from the company's first price.
      - A month's 8-K reports are one row, keyed by the month from the first (batch 100's lesson).
      - An order, an enforcement action or a listing order is the SEC acting (a regulation event),
        titled by its heading as printed. A registration or a stake is a filing.
      - Each row links to its issue's PDF. Relevance trusts the rule (0.95); the site's credit line
        and the terms name the Digest.
- [x] **Measured on 1985** (the 250 issues batch 87 saved, 23,922 entries): 509 rows on 259
      companies.
      - That is one more than batch 87's 508 on 258: Crane Co.'s registration declared effective on
        1985-10-11 (25445, now Crane NXT). Batch 87's undated first pass counted today's Crane
        Company (1944013, a record of 2023) as a second claimant of the name; the book holds only
        records EDGAR had by 1996.
      - From first prices: 362 rows on 188 pages, as 358 events.
      - Through the stored-entry lookup, each of the 259 companies gets exactly the replay's events.
      - **On a real Postgres 16** (local, db/040 applied by `npm run db:migrate`): the walk read the
        250 saved PDFs through `pdftotext` into the tables in 8.1 s, 23,922 entries. A second walk
        asked nothing. `digestFor` gave all 259 companies the replay's events, 358 in all, about
        7 ms a company, the party-key index in use. The rows were deleted afterwards.
- **Defaults kept, each the owner's to change:**
  - The first-price floor, as for every source. In 1985 it removes 147 of 509 rows, Georgia
    Power's 14 among them (its notes trade from 2018).
  - Names older than EDGAR's (Caterpillar Tractor, Middle South Utilities) stay out of reach
    without a hand map.
  - 1994–2013 is not read: EDGAR and the SEC's own listings cover those years.
- **Not yet run: the walk itself.** www.sec.gov answers 403 to a client without a contact address
  (batch 101). The walk starts once three things are done on the host that runs ingest:
  `NEWS_CHARTS_CONTACT` is set, poppler's `pdftotext` is installed, and `npm run db:migrate` has
  applied db/040. `check:live`'s new case needs the same.
- **Requests:** none. Everything was built from batch 87's saved files.
- **Checks:**
  - New `check:digest-walk` (51 cases):
    - the names file;
    - the book's replay of all of 1985, Crane Co. included;
    - the floor;
    - the events: month rows, titles, keys, links;
    - the walk on fake fetchers and a fake database: the order, the run's share, no read twice,
      every refusal and failure, a missing issue kept as missing, an unreadable one passed over;
    - the company step through the stored-entry lookup, for all 259 companies;
    - the wiring.
  - On main it fails: `data/digest-records.json` and the walk do not exist.
  - `check:contact` now counts 32 files that read the contact (the sync script).
  - `check:live-harness` passes with the new live case.
  - `npm run check` and `npm run lint` pass. HawkScan cannot run here (`HAWK_API_KEY` unset).

## NC ledger — batch 101: Sunoco, Inc. on Energy Transfer, Graco on Newell (2026-11-06)

The owner's call of 2026-11-06, "Put Sunoco on Energy Transfer and Graco on Newell", on the
question batch 100 left open. No new source: each of the two sources keeps a short hand-checked
list of units filed under their own names (`UNITS`), read on the owner's page from the day it owned
the unit, and its company step asks the stored rows by the unit's name too (`unitKeysOf`). The
release map (`lib/releaseNames.ts`) is not used: its stems would read "Sunoco" in "Sunoco LP".

- [x] **Sunoco, Inc. on Energy Transfer from 2012-10-05** (`lib/epaCases.ts`, `lib/ingest/epaWalk.ts`).
      Sunoco, Inc.'s own 8-K of 2012-10-11 reports the completed acquisition and the change of
      control that day (items 2.01 and 5.01, its EDGAR record). Ten cases, 2012-10-16 to 2020-01-13,
      the Superfund order of 2013-04-18 among them; the order of 2012-09-27, before the purchase, is
      on no page, and Sunoco LP keeps only its own.
- [x] **Graco Children's Products on Newell from 1999-03-24** (`lib/cpscRecalls.ts`,
      `lib/ingest/cpscWalk.ts`). Newell came to own Graco by merging with Rubbermaid, Graco's owner:
      Newell's EDGAR record ends its name "NEWELL CO" on 1999-03-23, and its 8-K of 1999-03-25
      reports an acquisition completed on 1999-03-24 (item 2); Graco's Wikipedia article gives the chain
      (Rubbermaid, then Newell in 1999). Batch 100 wrote "1998" for Newell's purchase: wrong, and
      corrected in its section and in `docs/OWNER-ACTIONS.md`. 22 recalls, 1999-08-27 to 2020-12-16,
      each as maker or importer as the recall names Graco; the two of 1998 are no listed company's,
      and none is Graco Inc.'s.
- [x] **Measured:** EPA 5,994 rows on 667 companies before first prices (5,984), CPSC 2,290 on 197
      (2,268), 709 as maker, importer or distributor (687). No other company's count moves.
- **Requests:** data.sec.gov 2 (Newell's two filing lists), www.sec.gov 1 (Sunoco's 8-K, refused
  403 without a contact address, so its event day was read from data.sec.gov's record instead),
  www.federalregister.gov 1 (no clearance notice for the Graco deal), en.wikipedia.org 2 (the first
  answered 429). Sunoco's record was the audit's saved copy.
- **Checks:** `check:epa-cases` 44 (1 new), `check:cpsc` 33 (1 new): each unit through the company
  step's stored-row lookup, the day it begins, the rows before it on no page, the namesakes still
  refused; the replays re-pinned, EPA's now asking by unit names as ingest does. On main the new
  cases fail: `UNITS` does not exist. `npm run check` and `npm run lint` pass. HawkScan cannot run
  here (`HAWK_API_KEY` unset).

## NC ledger — batch 100: the audit of batches 94–99, and its seven findings fixed (2026-11-05)

The `code-auditor` read batches 94–99 (`b3ce7e5..bf78d3b`). Its report is
`docs/audits/2026-11-05-code-audit-b94-99.md`. It found the parsers and walks sound on the saved real
data: the Justice archive's 5,712 releases, EPA's 137,103 cases, the CPSC's 10,070 recalls, the
CFTC's 2,610 rows and the Board's 469 orders; every walk stores a read only when it is whole. It
found seven defects, all reproduced here and fixed, each with cases that fail on main.

- [x] **1. Other firms' recalls on 17 companies' pages** (`P2`). The CPSC rule had no namesake
      list, and batch 96 read no firm match by hand.
      - **Read here:** all 269 company-and-firm pairs the 10,070 recalls give the index, and every
        doubtful store line.
      - **Fixed** (`lib/cpscRecalls.ts`):
        - a place whose name holds "of" is a place: "Asweets Global Inc., City of Industry,
          California" no longer leaves "City" for City Holding (5 recalls);
        - the EPA rule's "and" guard on firms: "Allied Tube and Conduit Corporation", "Adam and Eve";
        - a store is a proper name ("coffee and home goods stores" names no Coffee Holding), and a
          name's closing "s" drops only against a possessive ("A&E stores" is not AES);
        - `NOT_THE_COMPANY` by CIK, each read by hand: Graco Children's Products (10, not Graco
          Inc.), SLM International (2), Spire LLC, HSN after IAC's spin-off of 2008-08-20, Woodward &
          Lothrop, a 1970s "Eaton" bat maker, Innovative Designs LLC; eight companies that are no
          retailers take no store line (Noble, Winners, Outdoor Holding, BJ's Restaurants, Oshkosh,
          Quantum, Oculus, Popular); "Pool and Spa" lines are not Pool Corporation's; Shop LC's
          channel on Comcast and Roku is no store of theirs.
      - **Measured:** 69 recall matches removed, every one intended, none added. 2,268 rows on 197
        companies before first prices (2,331 on 218), 687 as maker, importer or distributor (713).
      - Left to the floor, read but not listed: STIHL's VIKING GmbH (Viking Holdings, 2024),
        Innovage LLC (InnovAge, 2021), the go-kart "Fox" (Fox Corp, 2019), Ingersoll-Rand Company
        (Ingersoll Rand Inc., 2017).
- [x] **2. A month's lone store recall or no-penalty order stayed twice** (`P2`). Its row was keyed
      by its day; when the month gained a second, the month's row took a new key and nothing removed
      the first. Weekly reads of 2025–2026 left Target 11, Walmart 10, Home Depot 6, Amazon 3.
      - **Fixed** (`cpscEvents`, `epaEvents`): a month's sold recalls and no-penalty orders keep the
        month's key from the first; a lone one keeps its own day and title. A row stored under the
        old day key moves onto the month's (`legacyDedupBasis`) when the company has no row of its
        own that day.
      - A lone one no longer merges into a same-day row of the company's own, so 14 EPA companies
        and Target show one more row (no case is lost or added).
- [x] **3. Sunoco LP took Sunoco, Inc.'s EPA cases** (`P2`): 52 cases before the floor, 11 from its
      first price. Sunoco, Inc. (CIK 95304) is the refiner Energy Transfer bought in 2012; Sunoco LP
      was Susser Petroleum Partners until 2014-10-27. **Fixed:** EPA's `NOT_THE_COMPANY` for SUN.
      Sunoco LP keeps its own five.
- [x] **4. The Bancorp took two other banks' Justice releases** (`P2`): "Agreement with Berkshire
      Hills Bancorp and Legacy Bancorp" (2011-05-18, from the API) and FleetBoston's and Summit
      Bancorp's of 2001-01-25, which `check:doj` had pinned as kept off by the first price.
      **Fixed** (`releaseNamesParty`): a one-word name that is only an industry word ("Bancorp")
      names the company after "the", not after another capitalised word, and in capitals with its
      legal word. Of the index's names, The Bancorp's alone is such a word.
- [x] **5. Five merger cases missed** (`P3`): the archive's 2005–2008 pages write the possessive as
      `&#8216;` ("VERIZON‘S ACQUISITION OF MCI"). **Fixed:** an opening quote between a letter and
      its "s" is an apostrophe, in the parser and in the rule (stored titles too). Now on their
      pages: Verizon 2005-10-27, Whirlpool 2006-03-29, AT&T 2006-10-11 and 2007-10-30, CEMEX
      2007-04-04. The archive gives 131 releases on 87 companies, 111 on 73 pages from first prices
      (127, 86, 106, 71).
- [x] **6. The CFTC missed Deutsche Bank AG and Barclays after its place** (`P3`). **Fixed:** "AG"
      is a legal word (`DESIGNATOR_WORD`), and the Commission's object may follow "X-Based"; a name
      joined on by a hyphen is not the company ("Florida-Based Inter-Global Currency" is not Inter's,
      found in the replay of this fix). Added: Deutsche Bank's two, Barclays's two, NRG's suit of
      2004 ("MINNEAPOLIS-BASED NRG ENERGY, INC."). 88 company days on 33 companies (83 on 33).
      The shared legal word also gives the SEC's releases two of their own, read and right:
      Daimler AG's bribery charges of 2010 (Mercedes-Benz Group's page) and Novartis AG's of 2020;
      266 entries on 129 companies (264 on 127). The Justice API's and the Board's replays are
      unchanged.
- [x] **7. A count and a claim the code did not give** (`P3`).
      - EPA's slice was cut with three-letter names, ingest asks two: rebuilt with two (4,289 cases,
        BP's and 3M's own among them). The full file and the slice now give the same 5,984 rows on 667
        companies (README, COVERAGE-MAP corrected from 6,001 on 665).
      - Batch 98's "reach a page only from the company's first price" was false for the Board's
        actions, which take no floor: struck through and corrected in its section.
- Set aside, as the audit did: the CFTC's whole-list read trusts page 0's pager (`check:live`
  watches it); Valero's only name "VALERO ENERGY" misses "Clean Air Agreements With Valero and
  Sunoco" (2005-06-16); "Huntington National Bank" is not in `BANK_UNITS`; a company ingested before
  the archive is fully read heals the next day.
- **For the owner** (not decided here): whether Sunoco, Inc.'s cases from 2012-10-05 belong on
  Energy Transfer's page as its unit's, and Graco Children's Products' recalls ~~from 1998~~ on Newell's.
  Each would need a unit map EPA and the CPSC do not read today. ✅ **Decided 2026-11-06 ("Put
  Sunoco on Energy Transfer and Graco on Newell") and done in batch 101**; Graco became Newell's on
  1999-03-24, not in 1998.
- **Requests:** the audit's 25 (query1/query2.finance.yahoo.com 21, data.sec.gov 3,
  www.justice.gov 1); none here: every fix was measured on the saved data.
- **Checks:** `check:cpsc` 32 (9 new), `check:epa-cases` 43 (4 new), `check:doj` 94 (2 new),
  `check:cftc` 29 (2 new), `check:sec-press` 76 (its replay re-pinned): the namesakes each refused and shown to match without the guard, the
  weekly and two-read replays leaving no row behind, Sunoco, The Bancorp, the five mergers, the
  four orders, the rebuilt slice. On main the new cases fail. `npm run check` and `npm run lint`
  pass. HawkScan cannot run here (`HAWK_API_KEY` unset).

## NC ledger — batch 99: the Board's orders of 1996–2005 (2026-11-05)

The 2026-11-02 proposal 3, approved by the owner on 2026-11-05. The same source (`fed_press`): the
Board's feed begins in January 2006, and the decade before it, the decade of the mergers that made
today's largest banks, was on its yearly pages only.

- [x] **Read once, committed** (`lib/fedOrders.ts`, `npm run sync:fed-orders`,
      `data/fed-orders-1996-2005.json`, 231 KB):
      - the ten yearly pages, 1996all.htm to 2005all.htm, give 469 orders (filed under `bhc` to
        2002, `orders` after), each with its day, title and link; the pages' general releases, the
        Board's own actions and its enforcement releases are left out;
      - each order's own page gives its first sentence telling of the Board's approval, which names
        every party and its city; 467 of the 469 have one (FirstMerit's page of 1998-12-07 states no
        approval; the release of 2003-09-08 is a guide, not an order);
      - the sentence runs past "U.S.", "N.A." and "Inc." to its own end, named entities and the old
        pages' Windows-1252 letters are read as letters, and the section signs SierraCities.com's
        page of 2000-04-12 lost on the Board's side ("12 U.S.C. � 1842") are read as §.
- [x] **Every company the sentence names is a party** (the owner's rule of 2026-11-05):
      - the sentence is kept whole: 49 run past 400 characters, the longest 1,084, and one order
        can name fifteen banks (Barnett's and fourteen others', 1997-10-06); the page shows it cut at
        400 characters (`shortened`);
      - `fedPressEvents` reads the title's parties and the sentence's, and `orderParties` reads the
        older titles' "of" ("Approval of proposal of Norwest Corporation");
      - a company's EDGAR former names count in the years it had them: NationsBank's orders are
        Bank of America's, Norwest's Wells Fargo's, BB&T's and Southern National's Truist's, the
        Royal Bank of Scotland's NatWest's; its first price bounds them, so Citizens, listed in
        2014, takes none of its own or the Royal Bank of Scotland's.
- [x] **Read by hand, every match:** 179 in a replay that gives each company every name it has
      filed under (the Digest's name list), before first prices. Five namesakes, told apart by the
      city each sentence gives, are kept off by CIK (`NOT_THE_COMPANY` now reads the sentence too):
      - the First Financial Corporation of Stevens Point, Wisconsin, bought by Associated Banc-Corp
        in 1997 (not Terre Haute's, whose own order of 1998-02-23 stays);
      - the Horizon Bancorp of Beckley, West Virginia, bought by City Holding in 1998;
      - the Republic Bancorp of Munden, Kansas, of 2005;
      - the Northwest Bancshares of Vancouver, Washington, bought by U.S. Bancorp in 1998;
      - the IBT Bancorp of Irwin, Pennsylvania, of S&T Bancorp's stake of 2003 (not Isabella Bank's
        IBT Bancorp of Mount Pleasant, Michigan).
      What an applicant acquires is a party too: Glen Burnie Bancorp, sought by First Mariner
      (1998-09-28). Matches before a company's first price (Citizens', First Hawaiian's as BancWest,
      Piper Sandler's as Piper Jaffray, Merchants Bancorp's namesake) are left to the floor.
- [x] **Measured:** under the committed indexes' names, the 469 give 141 matches on 59 companies
      (Wells Fargo 10, Royal Bank of Canada 7, JPMorgan and Popular 6, Citigroup, CIBC, U.S. Bancorp,
      Truist and Citizens 5), 138 orders, 3 of them on two pages or more; a company's stored former
      names add more at ingest. Truist's page now holds 11 BB&T orders, 5 of them from the archive.
- Not done here: the Board's other releases of 1996–2005 (policy, enforcement): enforcement comes
  from its own files (batch 69), and the old policy releases name no bank as the feed's do.
- **Requests:** www.federalreserve.gov 479 (the ten yearly pages and 469 order pages, a second
  apart), data.sec.gov 4 (former names for Bank of America, Wells Fargo, JPMorgan and Citigroup).
- **Checks:** `check:fed-press` 66 (19 new): the file rebuilt from the saved pages
  (`scripts/fixtures/fed-orders-pages.json.gz`, 890 KB) and compared whole, the two orders without
  a sentence, the abbreviations, entities and section signs, the whole sentence and its page cut,
  the multi-bank orders on every named company's page, the first-price floor, the five namesakes
  by city (and each one shown to match without its guard), the former names through the ingest
  path, the archive replay pinned (141 on 59) with every fund series still taking none, and the
  sync's wiring. Truist's pins move from 6 and 7 to 11 and 12. `check:contact` counts 31 files.
  On main the new cases fail: `lib/fedOrders.ts` and the data file do not exist. `npm run check`
  and `npm run lint` pass.

## NC ledger — batch 98: the Board's actions for 23 more banks (2026-11-05)

The 2026-11-05 proposal 3, approved by the owner that day. No new source: rows in `FED_BANKS`.

- [x] **23 banks mapped** (`lib/fedActions.ts`), each by its own legal name and home city, read by
      hand against every row of both of the Board's files on 2026-11-05:
      - Arrow Financial, CSB Bancorp, Crédit Agricole, Banco de Chile, East West Bancorp, First
        Interstate, Hanmi, Broadway Financial, Central Pacific, New Peoples Bankshares,
        OptimumBank, Old Second, Plumas, Orrstown, Patriot National, MetLife, Jack Henry,
        Riverview, Fulton, Wintrust, Green Dot, Customers Bancorp and Bank of Hawaii;
      - a bank named after the company counts as batch 69's rule has it (East West Bank of Pasadena,
        Hanmi Bank, Customers Bank, Orrstown Bank, New Peoples Bank), and Crédit Agricole's
        predecessor before 2001, Caisse Nationale de Crédit Agricole;
      - a namesake elsewhere stays off: TCSB Bancorp of Traverse City is not CSB Bancorp, and
        Commerce Bancshares of Catoosa, Centennial Bank of Lubbock and Community West Bancshares of
        Goleta are no mapped company's.
- [x] **Measured:** 39 events on the 23, 32 before 2017 (the proposal's present-name replay found
      29 days; the banks named after the companies add the rest). Crédit Agricole 5, Customers
      Bancorp 4, East West and Hanmi 3. In all, 152 events on 56 of the 63 mapped banks, 113 before
      2017; the 40 banks mapped before keep every count.
- Not done here: first trading days for the 23. ~~Hanmi's agreement of 1994 and other early rows
  reach a page only from the company's first price, as every rule reads.~~ *Corrected in batch 100
  (the audit's finding 7): the Board's actions take no first-price floor. Every row the
  hand-checked map gives a bank on its days reaches its page, Hanmi's agreement of 1994-12-09
  among them; the map's own day bounds are the limit.*
- **Requests:** www.federalreserve.gov 2 (the two action files).
- **Checks:** `check:fed-actions` 49 (5 new): Arrow Financial's of 1992 and Hanmi's of 2009, MetLife's
  order and penalty and Jack Henry's agreement, the banks named after the companies, the namesakes
  by city, and every mapped bank's count re-pinned. The saved rows add the 23 banks' and the
  namesakes'. On main the new cases fail: none of the 23 is in `FED_BANKS`. `npm run check` and
  `npm run lint` pass.

## NC ledger — batch 97: the CFTC's enforcement actions, from 1995 (2026-11-05)

The 2026-11-05 proposal 2, approved by the owner that day. The banks' and energy traders' cases
before the derivatives regulator had no source.

- [x] **A new source, `cftc`.** The Commission's enforcement list, ten a page, 261 pages:
      - read whole once a year and its newest page once a day, for every company
        (`lib/ingest/cftcWalk.ts`, db/039), as the CFPB's list is;
      - 2,610 rows, 2,607 actions (three listed twice), from 1995-07-27 to 2026-11-03;
      - a page without the list is an error, not an empty page.
- [x] **The company is the party** (`lib/cftc.ts`): the Justice Department's rule with the release
      map's units, from the company's first price, one event a company a day, plus the two forms
      the proposal measured:
      - the company as the Commission's object, a one-word name too: "CFTC Orders UBS to Pay $700
        Million" (2012-12-20);
      - a registrant's name with its comma: "Goldman, Sachs & Co., a Commission Registrant"
        (2012-12-08).
- [x] **Four guards, read from the matches by hand:**
      - a count before a name: "CFTC Orders Six Financial Institutions to Pay" is not Financial
        Institutions, Inc.'s (4 actions);
      - a name only ever after "Former": Citigroup's traders of 2017-06-30 are not Citigroup's;
      - another company's unit owns its whole name: Prudential Securities (2002) is Prudential
        Financial's, not Prudential plc's;
      - an everyday word as the object takes no possessive: "People’s Alternative" is not People
        Inc.'s. Other names keep the Justice rule's: "CME Group’s New York Mercantile Exchange" is
        CME's case, "CHS Hedging, LLC" CHS's.

      And one namesake by CIK (`NOT_THE_COMPANY`): CTS Financial Publishing is not CTS Corporation.
- [x] **Measured,** against every company in the index, before first prices: 83 company days on 33
      companies, 42 before 2017. JPMorgan 12, Morgan Stanley 7, Goldman Sachs 6, Citigroup 5,
      Deutsche Bank 5; AEP's suit of 2003 and its settlement of 2005, Duke Energy's and Xcel's
      trading units of 2003–2004, Black Hills' Enserco, BP's $303 million of 2007. Every case the
      proposal named lands, and Hartford Financial Group's of 1999 and the Avista officer's stay off.
- [x] **Licence,** quoted in `lib/cftc.ts` and `SOURCES`: "Government information at the CFTC
      website is in the public domain…" Acknowledged to the CFTC in the footer, the terms page and
      the README.
- Not done here:
      - first trading days for the 33 companies;
      - Avista Energy (2001), Avista's trading unit, needs a release-map entry to reach AVA;
        "Avista Energy" is not "Avista" with a legal word;
      - the proposal estimated 100–120 releases before 2017; the rule finds 42. The rest name units
        the map does not hold, or people.
- **Requests:** www.cftc.gov 263 (every list page, a second apart, and one past the last that held
  no list).
- **Checks:** `check:cftc` (27, new, in `npm run check`): the list on every saved page
  (scripts/fixtures/cftc-list.json.gz, each page's table), the cases the proposal named, the guards,
  the replay of every company, the walk, and the wiring. On main it cannot run: `lib/cftc.ts` does
  not exist. `check:contact` counts 30 readers of the shared User-Agent; `check:live` has a case
  for the real list. `npm run check` and `npm run lint` pass.

## NC ledger — batch 96: product safety recalls (2026-11-05)

The 2026-10-22 shortlist's #4, approved by the owner on 2026-11-05: "Yes I would like to add
product safety recalls."

- [x] **A new source, `cpsc_recalls`.** The Consumer Product Safety Commission's keyless recall
      service answers every recall at once (28 MB, 10,070 recalls from 1973-06-08).
      - Read once a week for every company (`lib/ingest/cpscWalk.ts`, db/038). A whole answer
        replaces the kept recalls; an answer of fewer than 9,000 is refused as broken.
- [x] **Every listed company a recall names gets it** (the owner's rule), by its role
      (`lib/cpscRecalls.ts`):
      - a maker, importer or distributor by the caption rule, its place cut off ("Office Depot,
        Inc., of Boca Raton, Fla."), or as the owner a firm names ("…, a division of Office Depot");
      - a store as a whole item of the recall's "Sold at" line: Bodum's French presses of
        2026-10-29 go on Target, Walmart and Amazon, but not on Home Depot for "home goods
        stores", nor on Target for "Target Marketplace".

      A recall the company made, imported or distributed has its own row. A store's recalls of
      other makers' products are grouped a row a month, since Target, Walmart and Amazon each sold
      the products of hundreds (the proposal's worry that they would fill a retailer's page).
- [x] **Measured,** against every company in the index, before first prices: 2,331 rows on 218
      companies; 713 as maker, importer or distributor. Target 292, Walmart 236, Amazon 206, Home
      Depot 196 as stores; Mattel's first of 1978, GE's hair dryers of 1979, Dollar Tree's of 1996,
      IBM's ThinkPad batteries of 2006, Mohawk's rugs of 2014 as their makers or importers.
- [x] **Licence.** A work of the U.S. Government, outside copyright by 17 U.S.C. § 105. The federal
      data catalog lists the Recalls API under the usa.gov public-domain label (the shortlist).
      From this session cpsc.gov and saferproducts.gov's pages answered 403 and the catalog's
      search 404, so neither was re-read; the service itself answered. No image is used. Credited
      in the footer, the terms page and the README.
- Not done here:
      - first trading days for the 218 companies;
      - former names: the replay read the companies' present names only. Polaris's recalls under
        "Polaris Industries", its EDGAR name until 2019, reach it at ingest, where its former names
        are read.
- **Requests:** www.saferproducts.gov 2 (the whole answer, and its home page, which answered 403);
  www.cpsc.gov 1 (403); catalog.data.gov 3 (404).
- **Checks:** `check:cpsc` (23, new, in `npm run check`): the service's answer, the roles, the "Sold
  at" line, the monthly grouping, the replay of every company over every recall (committed as
  scripts/fixtures/cpsc-recalls.json.gz, the fields the adapter reads), the weekly read and the
  wiring. On main it cannot run: `lib/cpscRecalls.ts` does not exist. `check:contact` counts 29
  readers of the shared User-Agent; `check:live` has a case for the real service (outside the
  offline chain, not run here). `npm run check` and `npm run lint` pass.

## NC ledger — batch 95: the EPA's civil enforcement cases, from the 1970s (2026-11-05)

The 2026-11-05 proposal 1, approved by the owner that day, with the owner's multi-company rule:
industrial, chemical, energy, paper and utility pages had no regulator's record before 2009.

- [x] **A new source, `epa_cases`.** EPA's whole case file, one 82 MB zip
      (`echo.epa.gov/files/echodownloads/case_downloads.zip`, 137,108 cases):
      - read once a month for every company (`lib/ingest/epaWalk.ts`, db/037), and not again while
        EPA has not changed it (its Last-Modified);
      - a new copy replaces the kept cases whole, and only when it reads as a whole file (100,000
        cases or more);
      - four of its tables read by a small zip reader and CSV reader of our own (`lib/zip.ts`, no
        new dependency): 137,103 cases in 4 seconds, 5 left out for having no public day.
- [x] **Each case's public day and title** (`lib/epaCases.ts`):
      - a court case is dated by the day its settlement was lodged (Caterpillar's of 1998-10-22,
        entered 1999-07-01), else entered, else filed; an administrative case by its final order,
        else its complaint;
      - the title says what EPA did, the penalty and the law: "EPA consent decree: $11,000,000 civil
        penalty (Clean Air Act)". A Superfund settlement says how many parties it has;
      - linked to EPA's own case report. Money is kept as digits, never a float.
- [x] **On company pages.** A case is kept when one of its defendants is the company by the
      caption rule, under its names that year, from its first price:
      - every listed defendant gets the case (the owner's rule), so the proposal's three-defendant
        limit is dropped;
      - a court case or a case with a penalty has its own row; a company's cases of one day make
        one row; a month's orders and complaints with no penalty are grouped into one row when
        there are two or more.

      Against every company in the index, before first prices: 6,001 rows on 665 companies, 5,169
      before 2017, 5,743 of them a case's own day. Most: GE 284, GM 221, ExxonMobil 163, Ford 163,
      FMC 133.
- [x] **The guards the proposal named:**
      - one name joined by "and" is one name: no "… Power and Light Company" is Light S.A.'s (it took
        56 utilities' cases without the guard);
      - a person written surname first is no company ("RETHERFORD, DANA", "FAYE, BALL");
      - National Steel's cases are not Companhia Siderúrgica Nacional's (SID), by name.
- [x] **The first price does its job here too.** GM's $11 million decree of 1995 names General
      Motors, but today's GM listed in 2010, so the old GM's cases stay off it. Today's Kodak stock
      dates from 2013, so Kodak's of 1995 is off KODK. Southland Corporation's of 1985 is off SLND.
- [x] **Licence.** EPA's Standard Open Data License ("all data produced by the U.S EPA is by default
      in the public domain") and the disclaimers page's note on documents are both quoted in
      `lib/epaCases.ts` and `SOURCES`. Only the file's fields and a link are kept; no document is
      copied. Credited in the footer, the terms page and the README.
- Not done here:
      - first trading days for all 665 companies, so how many rows reach pages is counted at each
        company's ingest, not here;
      - a map of the units EPA charges under their own names (BP Products North America, Motiva):
        the replay read the companies' own names only;
      - JCI's 45 rows, most of them Johnson Controls, Inc.'s before the 2016 merger, follow the
        owner's earlier JCI call.
- **Requests:** echo.epa.gov 1 (the 82 MB file); query1 and query2.finance.yahoo.com 9 (first
  trading days for GM, Southland, Kodak and Caterpillar, with retries after refusals).
- **Checks:** `check:epa-cases` (39, new, in `npm run check`): the zip and CSV readers, the cases the
  proposal named, the guards, the first price, the grouping, the replay of every company over a
  committed slice of the file (scripts/fixtures/epa-cases-slice.json.gz: 4,280 cases, every row of
  the four tables they need), the monthly read, and the wiring. On main it cannot run:
  `lib/epaCases.ts` does not exist. `check:contact` counts EPA's reader of the shared User-Agent, 28
  files, and `check:live` has a case that reads the real file (outside the offline chain, not run
  here). `npm run check` and `npm run lint` pass.

## NC ledger — batch 94: the Justice Department's releases of 2001–2008, from its archive (2026-11-05)

The 2026-11-02 proposal 2, approved by the owner 2026-11-05. Justice releases stopped at 2009, the
oldest the Department's API holds; the Department keeps the earlier ones on month pages.

- [x] **The archive, read once.**
      - `lib/dojArchive.ts` reads the 96 month pages of 2001–2008 in their two layouts: a list,
        2001–2004, and day headings with a teaser, 2005–2008. It reads a title with no number
        (Kinder Morgan's of 2007), a link typed with spaces, and the old pages' Windows-1252 quotes.
      - 5,712 releases. 5 rows a typing slip leaves without a usable day are left unread, not
        guessed.
      - `lib/ingest/dojArchiveWalk.ts` and `db/036_doj_archive.sql` keep them. A month is stored
        once, only when its page answered with releases it could read, and never asked again.
        At most 24 months a process, a second apart, so four runs read it all.
      - A page that lists nothing readable is an error, not a quiet month: a bot check answers 200.
- [x] **On company pages.** Each company's ingest keeps the stored releases that the Justice rule
      makes it a party to, beside the API's, under the same source (`doj_press`):
      - under the names it had that year, its legal names among them;
      - from its first price on, plus the units marked to count before listing (the owner's
        multi-company rule; the Justice rule now reads them too).

      Against every company in the index: 127 releases name 86 companies, and 106 reach 71 pages,
      in every year of the eight. Among them: AEP's $30 million criminal penalty of 2005,
      Weyerhaeuser's Kalamazoo River settlement, Akzo Nobel's antitrust plea, Verizon's Alltel case.
      Walmart gets 6, Tenet 5, Exxon Mobil 4. The 21 kept off came before the company listed (News
      Corp's of 2001, Norwegian Cruise Line's).
- [x] **Two names, read from the companies' own filings:**
      - "Wal-Mart", Walmart's own short name until 2018 (its 10-K filed 2001-04-10): five releases of
        2001–2008 write it alone;
      - "American Express Bank International", American Express's until it sold American Express
        Bank Ltd. on 2008-02-29 (its 8-K of that day): its deferred prosecution of 2007-08-06.
- [x] **An everyday word as a name** (`isEverydayWord`):
      - In a title written in capitals, it needs a legal word after it: "TARGET CORPORATION" is
        Target's, "CITY AGREES TO PAY" is not City Holding's.
      - In any title, as an object, it is the word when "the" or another word comes before it or
        "of" after: "Lawsuit Against the City of Marion", "Newport News Shipbuilding".

      Without the rule, City Holding would have taken 46 of the archive's releases about cities.
      The API's "Sues Visa for Monopolizing" and "Sues Apple for Monopolizing" stay theirs. One loss,
      accepted: "U.S. V. ORACLE" (2004), in capitals, is no longer Oracle's.
- [x] **The text cleaner reads "&#146;" as "’"** (and the other Windows-1252 codes), shared with the
      API's titles. It found seven more merger cases written with a possessive ("Verizon’s
      Acquisition of Alltel").
- Not done here:
      - the optional read of each matched release's own page for a first paragraph (2001–2005
        releases carry no teaser);
      - a pre-2001 archive: the proposal measured 404s for 1994–1995;
      - a two-word name built of everyday words ("National Bank" for National Bank Holdings) can
        still take another bank's release in the API's years. In the archive every such row falls
        before the company listed. Left for the audit batch.
- **Requests:** www.justice.gov 98 (the 96 month pages, and two API asks for the Visa and Apple
  suits' titles); data.sec.gov 2 (Walmart's and Truist's former names); efts.sec.gov 9 (filing
  phrases); query1 and query2.finance.yahoo.com 104 (first trading days for 86 companies, with
  retries after refusals).
- **Checks:** `check:doj` 92 (34 new): the parser on every saved page, the cases the proposal named,
  the everyday-word rule, the replay of every company, the walk, and the wiring. On main they cannot
  run: `lib/dojArchive.ts` does not exist. `check:sec-press` now pins the map's 76 entries, and that
  the Justice rule no longer keeps the City of Miami; `check:contact` counts the archive's reader
  of the shared User-Agent, 27 files. `npm run check` and `npm run lint` pass.

## NC ledger — batch 93: a case goes on every company it involves (2026-11-05)

The owner's rule of 2026-11-05: "for any instance that multiple companies are involved in a case
add the story to all relevant companies pages". The release rules already give each listed company
a case names its own event. This batch applies the rule to the three ownership calls it settles.

- [x] **GE Capital Retail Bank's CFPB actions on GE's page.**
      - GE owned the bank, later named Synchrony Bank, until the split-off of Synchrony ("On
        November 17, 2015", its 8-K filed 2015-11-23, and "completed the split-off", its 8-K
        filed 2015-11-30).
      - `BANK_UNITS` gives GE "GE Capital Retail Bank" and "Synchrony Bank" to 2015-11-16. The
        orders of 2013-12-10 and 2014-06-19 are on GE's page.
- [x] **PayPal's CFPB action of 2015-05-19 on eBay's page.**
      - eBay owned PayPal from its purchase ("On October 3, 2002", its 8-K filed that day) until
        the spin-off ("On July 17, 2015", its 8-K filed 2015-07-20).
      - `BANK_UNITS` gives eBay "PayPal" between those days.
- [x] **The same actions on the companies the units are now.** Synchrony Bank's order fell six
      weeks before Synchrony listed (2014-07-31), and PayPal's seven weeks before PayPal Holdings
      did (2015-07-06). The first-price floor kept both off, so each unit is now marked
      `beforeListing`:
      - SYF's "Synchrony Bank", a name first given in 2014;
      - PYPL's "PayPal" from its own record's registration (the Form 10 filed 2015-02-25), so
        eBay-era rows stay eBay's.

      The Bureau's rule now reads marked units before a first price, as the SEC's two do; the
      company's own names still wait for it.
- [x] **JCI's case of 2016 stays on JCI's page.** Johnson Controls, Inc.'s order of 2016-07-11 came
      two months before the business merged into Tyco's record, which took its name. The rule keeps
      it, as the code already did; `check:sec-cases` pins it.
- [x] **Measured, the Bureau's 386 actions:**
      - 95 company days on 52 companies, 38 before 2017 (92 on 50 before);
      - 92 of them reach a page, on 49 companies, 36 before 2017;
      - three still fall before their company's first price and stay off: Ally's of 2013-12-20,
        Chime's of 2024-05-07 and Santander Holdings USA's of 2016-07-14. Each names one company
        alone.

      The SEC's cases and releases, the Board's and the Justice Department's counts are unchanged.
- **Requests:** efts.sec.gov 8 (the phrases above and the two records' first filings);
  query1.finance.yahoo.com 1 (eBay's first trading day).
- **Checks:**
      - `check:cfpb` 50: GE's, eBay's, Synchrony's and PayPal Holdings' days, each unit's bounds,
        and both counts with 52 first trading days;
      - `check:sec-cases` 74: JCI's case, and the four marked units;
      - `check:sec-press` 76;
      - `check:contact` 11, which now reads itself too, since batch 92 committed it: its test
        addresses are on example.org, the domains reserved for examples, and it leaves itself out
        of the count of the shared header's 26 readers;
      - the rest of `npm run check` (56 suites) and `npm run lint` pass.

      On main the GE, eBay and PayPal cases fail.

## NC ledger — batch 92: no personal email in the build, and the owner's decisions filed (2026-11-05)

The owner, 2026-11-05: "Lets move forward with all of the proposals. Yes I would like to add product
safety recalls. Also for any instance that multiple companies are involved in a case add the story
to all relevant companies pages. Dont use my personal email, I will make a new one for the purpose
of this build."

- [x] **The personal email is out of the code, the docs and the reports.**
      - Until now 24 modules each wrote the owner's personal address into their own User-Agent:
        the SEC, Wikipedia, Wikidata, the Library of Congress, the Federal Reserve, the Justice
        Department, FDA, NHTSA and the rest.
      - Every request now sends one User-Agent from `lib/contact.ts`: "News Charts Research" and
        the build's contact address from `NEWS_CHARTS_CONTACT` in `.env.local`. The owner will
        make that address for this build. 26 files read it.
      - The headers are read when a request is built, not when a module loads. A script loads
        `.env.local` in its own body, after the modules it imports have run, so an address read at
        load time would always be missing.
      - Without the setting the name goes alone. sec.gov refuses EDGAR requests without a contact,
        so ingest needs it set before the scheduler runs: `.env.example`, README and
        `docs/OWNER-ACTIONS.md` say so.
      - Five reports that quoted the address as the User-Agent their requests carried now describe
        it instead. The git history still holds the old commits; nothing here rewrites history.
      - **Check:** `check:contact` (11, new, in `npm run check`). It holds that:
        - the User-Agent is the name alone, or the name and one address;
        - the headers are read at request time;
        - no module defines its own;
        - no email address is written in the code, the stand-in on example.org aside;
        - no personal mailbox's domain appears in the docs, the work log or the reports;
        - the setting is documented.

        `check:sec-press`, `check:sec-cases`, `check:doj`, `check:fed-press` and `check:macro`
        each set a stand-in address on example.org for their stubbed requests, and assert it is
        the one sent. `check:sec-headlines` pins the shared header. On main `check:contact`
        cannot run: `lib/contact.ts` does not exist.
- [x] **The owner's decisions, filed under Scope refocus:**
      - all five open proposals approved: the 2026-11-05 #1 (the EPA's cases), #2 (the CFTC's
        actions) and #3 (the Board's actions for 23 more banks), and the 2026-11-02 #2 (the
        Justice Department's 2001–2008 archive) and #3 (the Board's 1996–2005 orders);
      - CPSC product recalls (the 2026-10-22 shortlist #4) approved;
      - the multi-company rule: a case naming several listed companies goes on each of their pages.
        It settles the three ownership calls left open (GE Capital Retail Bank on GE, PayPal's 2015
        action on eBay, JCI's Tyco-record case), and the EPA proposal's three-defendant limit gives
        way to it.

      Each proposal file carries the owner's words in its Status line. The two "Owner: mark each
      proposal" items (batches 86 and 91) are ticked.
- Not done here: the builds themselves, one batch each, from batch 93. The Digest's step 2 was not
  among the proposals and stays the owner's call.
- **Requests:** none.
- **Checks:** `npm run check` (56 suites) and `npm run lint` pass.

## NC ledger — batch 91: a new opportunity-scout run, three proposals for the owner (2026-11-05)

The approved 2026-11-02 proposals are built (batches 87–89), and batch 90 fixed the audit of
batches 85–89. So the `opportunity-scout` read the repository again at `73a88f7` and wrote
`docs/proposals/2026-11-05-proposals.md`: three proposals, all **PENDING**, ranked with securities
depth first. Nothing is built in this batch.

- [x] **Owner: mark each proposal `APPROVED`, `REJECTED` or `DEFERRED`** (with a reason for a
      rejection). The scout's second pass then files the approved ones into this checklist.
      ✅ **Marked 2026-11-05: all three approved** ("Lets move forward with all of the proposals."),
      filed under Scope refocus by batch 92.
      1. `P1` **The EPA's civil enforcement cases, from the 1970s.** The regulator's own record
         for chemical, oil, paper, industrial and utility companies, which today have only the
         Justice Department's releases from 2009.
         - **Measured:** EPA's case file (82 MB, 137,108 cases) gives 6,406 cases on 663 companies
           under their present names, 5,505 before 2017.
         - **With a materiality rule** (its own row for a court case or an order with a penalty,
           naming three defendants or fewer): 1,662 company days on 418 companies, 1,348 before
           2017.
         - **Read by hand:** 31 of 40 sampled rows are right. Six of the nine wrong ones fall
           before the company listed, so the first-price floor drops them. The other three need
           two guards the caption rule lacks.
         - **The owner's call:** yes or no on the source, after reading two of EPA's own texts.
           Its data licence says EPA's data is public domain. Its disclaimers page says the site's
           documents are for non-commercial use. The file quotes both.
         - Most of JCI's rows follow the open JCI call.
      2. `P2` **The CFTC's enforcement actions, from 1995**, on banks', brokers' and energy
         traders' pages.
         - The CFTC states its site is public domain.
         - The list holds 2,610 actions. Of 100 titles before 2017 read by hand, 6 make a listed
           company the party (AEP 2003, Goldman 2012 and 2016, UBS 2012, RBC 2014, Deutsche Bank
           Securities 2014). The existing rules find 4 of them.
         - About 100–120 such releases before 2017: an estimate.
         - **The owner's call:** yes or no on the source.
      3. `P2` **The Board's enforcement actions against the 23 listed banks its map leaves out.**
         The same files and source, with rows added to `FED_BANKS`.
         - Matched against every listed company, the two files give 54 days on banks the map
           does not hold.
         - Read city by city: 29 days on 23 banks are their own, 23 of them before 2017. Ten fall
           before the bank listed, and 15 are namesakes or another company's past.
- **Cut, with reasons in the file:**
      - the FTC's cases (404 from here) and the OCC's search (redirected);
      - USDA FSIS recalls (403);
      - the FDIC's failed-bank list (still no licence stated);
      - the FDA and vehicle maps' units in the release rules (1 new day on the saved rows);
      - EPA's informal actions and inspections;
      - the SEC cases' accounting-release labels.
- **Still waiting, not raised again:** the 2026-11-02 #2 (the Justice Department's 2001–2008
  archive) and #3 (the Board's 1996–2005 orders); CPSC recalls; JCI's 2016 case; GE Capital Retail
  Bank on GE and PayPal's 2015 action on eBay; the Digest's step 2.
- **The scout's closing note on `captionParty`, checked here.** It flagged two shapes:
  "Pennsylvania Power and Light Company" read as a party "Light Company", and a person written
  surname first ("Retherford, Dana") read as a one-word company.
      - Neither reaches a page today. The saved 30,747 SEC case rows hold neither shape: a replay
        of every company found 0 one-word parties after a surname, and the 4 parties after an "and"
        were all right (KBR, MCD, MDLZ, SEIC).
      - The Bureau's 92 days and the Board's 252 matches were each read by hand when built.
      - Both shapes are in EPA's file, which is why proposal 1 lists the two guards.
- **Requests** (the scout's, listed in the file's header): 26, about 31 with redirects.
      - www.cftc.gov 12, echo.epa.gov 3, www.epa.gov 1, edg.epa.gov 1, www.federalreserve.gov 2;
      - www.ftc.gov 2, www.occ.gov 1, apps.occ.gov 2, api.fdic.gov 1, www.fsis.usda.gov 1;
      - each with the User-Agent `News Charts Research`, with no email address.

      This batch made none of its own.
- **Checks:** `npm run check` and `npm run lint` pass. The batch changes docs only.

## NC ledger — batch 90: the audit of batches 85–89, and its four findings fixed (2026-11-05)

The `code-auditor` read batches 85–89 (`960c3be..d22927c`). Its report is
`docs/audits/2026-11-05-code-audit.md`. It found the mechanics sound:
- batch 85's five fixes;
- the CFPB parser and walk on the Bureau's real pages;
- every unit day the saved rows exercise;
- every replay count README gives;
- batch 87's 1985 count.

It found four defects. All four were reproduced here and are fixed, each with cases that fail on
main.

- [x] **1. Citizens Financial Group took another bank's 2011 Justice Department settlement**
      (`P2`).
      - **The defect:** batch 89 gave CFG the unit "Citizens Bank" and relied on the company's
        first price to bound it. But the Justice step read no first price.
      - Asked "Citizens Bank" on 2026-11-05, the API returns 25 titles. Among them is "Justice
        Department Reaches Settlement with Citizens Republic Bancorp Inc. and Citizens Bank…"
        (2011-05-05): another holding company's own bank, three years before CFG listed. It was
        kept for CFG and scored 0.95.
      - **The fix:** the Justice step reads a company from its first price on, as the SEC's two
        rules, the Board's and the Bureau's already do. `fetchJusticeReleases` takes `from`, and
        ingest passes the first price (`firstPriceDay`). A company with no prices yet is asked
        again on the next run (`NO_PRICES`), and a notes record is still asked nothing.
      - **Check:** `check:doj` holds the API's real answer (`fixture.CFG`, all 25 releases). The
        settlement is read as a party, and from 2014-09-24 it is refused, through `dojEvents` and
        through the fetch. The ingest wiring is pinned. On main the fixture entry, the `from` and
        the wiring are missing.
- [x] **2. The first-price floor overrode the owner's calls (b) and (c)** (`P3`).
      - **The defect:** batch 88 recorded American Express Financial Advisors' case of
        2004-02-12 as on Ameriprise's page, and all 19 of Prudential Securities' days as on
        Prudential's. Ingest reads a company from its first price on: AMP's is 2005-09-15 and
        PRU's 2001-12-13 (Yahoo's own first trading days). So the AEFA case and three Prudential
        cases (2000-04-06, 2001-01-29, 2001-01-30) never reached the page. The checks set the
        floor aside, so they asserted pages production never built.
      - **The fix:** a unit can be marked `beforeListing` in `lib/releaseNames.ts`. Before the
        company's first price, the SEC's two rules read only the marked units valid that day,
        never the company's own names (`releaseNamesBefore`).
        - Exactly two are marked, the owner's calls: AMP's American Express Financial Advisors and
          PRU's Prudential Securities.
        - The Board's feed (2006), the Justice Department's (2009) and the Bureau's (2012) begin
          after both companies listed.
      - **Check:** `check:sec-cases` runs both calls with the real first prices.
        - The 2004 case reaches AMP only through the mark.
        - All 19 Prudential days reach PRU (16 without the mark).
        - Ameriprise Financial Services' case moved before AMP listed is refused.
        - `secCasesFor`, given AMP's first price, keeps the 2004 case.
        - `check:sec-press` holds the same for a release in the SEC's own wording, since the
          saved listing has no pre-listing release for either unit.
      - **The Bureau's counts after the floor.** The 87 days batch 89 pinned were before the
        floor. Five fall before their company's first price:
        - Ally's of 2013-12-20;
        - Chime's of 2024-05-07;
        - PayPal's of 2015-05-19;
        - Santander Holdings USA's of 2016-07-14 (its preferred shares first traded on
          2026-08-28);
        - Synchrony Bank's of 2014-06-19.

        README named only two of them. `check:cfpb` now pins each of the 50 companies' first
        trading days and both counts.
- [x] **3. The Bureau's rule missed 7 actions on 5 listed companies' own units** (`P3`).
      - **The defect:** their titles name units the companies' own filings list, and none was in
        the map.
      - **The fix, four companies in `BANK_UNITS` (60 in all):**
        - Mastercard International, on MA (its 10-K filed 2016-02-12, exhibit 21);
        - Conduent Business Services and Conduent Education Services, on CNDT (its 8-K filed
          2017-04-11, and its 10-K filed 2018-03-01, exhibit 21.1);
        - Sterling Jewelers, on SIG, from Signet's first filing that names it (its 20-F filed
          2003-04-24, exhibit 8.1), batch 88's rule for a unit with no purchase day in EDGAR;
        - Acima Holdings and Acima Digital, on UPBD, from Rent-A-Center's purchase ("On February
          17, 2021" and "completed the acquisition of Acima", its 8-K filed 2021-02-17).
      - **Left to the owner:** GE Capital Retail Bank's two actions (2013-12-10, and 2014-06-19 as
        "Synchrony Bank, f/k/a GE Capital Retail Bank") are not put on GE. The proposal named GE's
        ownership of the bank an ownership call, beside PayPal's of 2015 on eBay. Both stay off
        every page until the owner decides.
      - **Measured:** the 386 actions now give 92 company days on 50 companies, 35 before 2017. Of
        those, 87 reach a page, on 45 companies, 31 before 2017. The SEC's cases and releases, the
        Board's releases and actions, and the Justice fixture are unchanged by the new units.
- [x] **4. Stale figures in the docs** (`P3`).
      - The coverage map's header now says 30 sources, 22 on the ingest path.
      - Its Board row says 208 orders, as `check:fed-press` and README give.
      - Batch 89's "seven more names" were ten names on six banks. The ledger, its entry and
        README are corrected.
- [x] **Set aside by the audit, one done here.** `lib/ingest/refresh.ts` no longer says the
      Bureau's daily read finds every action within a day. An action posted with a day older than
      one already kept waits for the monthly read; 0 of the 386 were out of filed order.
- **Requests:**
      - the auditor's 15: query1.finance.yahoo.com 5 (one a retry after a 429), efts.sec.gov 5,
        www.justice.gov 5;
      - this batch's 40: query1.finance.yahoo.com 36 (33 first trading days and 3 retries after a
        429), efts.sec.gov 4.
- **Checks:**
      - `check:doj` 58;
      - `check:sec-cases` 73;
      - `check:sec-press` 76;
      - `check:cfpb` 48;
      - the rest of `npm run check` and `npm run lint` pass.
- Not done:
      - `fetchDigestArchive` and `fetchDigestIssue` (`lib/secDigest.ts`) still have no caller.
        `digest-report` fetches through its own cached reader. They wait for the Digest's step 2,
        which is the owner's call.
      - The owner's ownership calls on GE Capital Retail Bank (GE) and PayPal's 2015 action (eBay).

## NC ledger — batch 89: the CFPB's enforcement actions, a new source (2026-11-05)

The 2026-11-02 proposal 5, approved by the owner on 2026-11-02. The Consumer Financial Protection
Bureau charges the banks, card issuers, lenders and debt buyers whose consumer business it
regulates. Neither the Board's actions (holding companies) nor the SEC's cases (broker-dealers)
reach those orders, so a card bank's or a national bank's consumer case was on no page.

- [x] **`lib/cfpb.ts`: the Bureau's list, read and matched.**
      - Its list is `www.consumerfinance.gov/enforcement/actions/?page=N`: 25 a page, newest
        first, 386 actions on 16 pages on 2026-11-05.
      - Each action gives its day filed, its page, its respondents and a one-sentence summary.
      - A company keeps an action when the title names it as a case caption names a party
        (`captionParty`): its name, its legal name with legal words after it, or a unit the
        release rules' map gives it.
      - One event a company a day: American Express's three actions of 2012-10-01 are one.
      - The Bureau's "dba" and its one "d/ba/" (Verizon Wireless, 2015) are read as "d/b/a".
      - Licence, read again on 2026-11-05: "Information created by the CFPB is in the public
        domain…". Source 30 in `SOURCES`, credited on every page and in the terms, scored 0.95
        without the model.
- [x] **`lib/ingest/cfpbWalk.ts` and `db/035_cfpb_actions.sql`: read once for every company.**
      - The whole list once a month, which also picks up a summary the Bureau corrects.
      - Its first page once a day, and the next only while every action on a page is new.
      - It stops at the list's own count, since past the last page the Bureau serves the last
        page again.
      - Stored only when every page asked answered; at most 40 pages a process, a second apart.
- [x] **Not the feed the proposal named.** The feed dates an item by when its page last changed.
      On 2026-11-05, 2 of its 25 items were dated so: Apple's order of 2024-10-23 as 2025-09-22,
      and Capital One's suit of 2025-01-14 as 2025-01-07. The list gives the day filed, the day each
      summary itself states. The daily read is the list's first page instead: still one request a
      day.
- [x] **The units the Bureau charges, in `lib/releaseNames.ts`.**
      - 22 more companies in `BANK_UNITS` (56 in all), among them:
        - Capital One Bank, Synchrony Bank, TD Bank, Trustmark National Bank and Atlantic Union
          Bank;
        - the mortgage insurers: MGIC's, Genworth's, Radian's and Old Republic's, and AIG's United
          Guaranty until its sale at the end of 2016;
        - Toyota's and Honda's US lenders, Verizon Wireless, Santander's bank (on Santander and on
          Santander Holdings USA, its owner) and Santander Consumer USA;
        - PRA Group's debt buyer, TransUnion's Trans Union LLC, and Rocket's real-estate brokerage.
      - Ten more names for six banks already mapped (counted as "seven" until batch 90 corrected
        it): American Express's three units, U.S. Bank National Association, Fifth Third Bank,
        Chase Bank USA and Chase BankCard Services, CitiMortgage and CitiFinancial Servicing, and
        Goldman Sachs Bank USA.
      - **Bought units, from the day bought, read in the filings through EDGAR's full-text search:**
        - National City Bank on PNC's page from 2008-12-31;
        - OneMain's units from 2015-11-15;
        - United Guaranty on AIG's until 2016-12-30.
      - CitiFinancial Servicing is Citigroup's by its 10-K subsidiary lists of 2015 and 2016 and the
        Bureau's own release of 2017-01-23, "Citi Subsidiaries".
- [x] **What it adds: 87 company days on 46 companies from the 386 actions, 35 before 2017.**
      Without this batch's units the list gave 44 on 21. Among them:
      - Bank of America, Wells Fargo and Citigroup have 6 each, JPMorgan 5 and U.S. Bancorp 4;
      - the four mortgage insurers of 2013-04-04, and National City Bank's of 2013 on PNC.

      Every day was read by hand. No fund series takes one.
- [x] **Not their own, and on no page:**
      - Discover Bank's, Hudson City Savings Bank's and Sprint's actions, each an acquisition's
        past.
      - Flagstar Bank, F.S.B.'s of 2014. FLG's record took the Flagstar name after buying the bank,
        and its name in the index carries "National Association", which the rule reads as part of
        the name, so the order needs no row. The check holds it there.
      - The tax-refund lender "formerly d/b/a H&R Block" (2015-04-14), kept off H&R Block by CIK
        (`NOT_THE_COMPANY`).
      - Synchrony Bank's of 2014-06-19 and PayPal's of 2015-05-19, each before its company's first
        price.
- [x] **The units reach the other rules too:**
      - TD Bank's SEC case and press release of 2013-09-23, for its part in the Rothstein Ponzi
        scheme;
      - U.S. Bank's own SEC order of 2005-09-02 (IC-27057), which the Piper Jaffray check now tells
        apart from the Piper caption of that day.

      The SEC cases' replay is now 1,148 days on 370 companies, and the SEC releases' 264 on 127.
      The Board's releases and actions and the Justice Department's are unchanged.
- [x] **Checks:**
      - `check:cfpb` (45, new, in `npm run check`) runs on the saved list
        (`scripts/fixtures/cfpb-actions.json.gz`: all 386 actions, and the first and last pages as
        served). It holds the proposal's seven cases, the units' days, the full replay and the
        walk.
      - `check:sec-cases` and `check:sec-press` are re-pinned.
      - `check:live` reads the list's count and its last page; `check:feeds` asks its newest page.
      - On main `check:cfpb` cannot run: `lib/cfpb.ts` does not exist.
- Requests this batch: www.consumerfinance.gov 20 (the 17 list pages, the feed, the licence page,
  one action's page); efts.sec.gov 32, two of them retries after a server error.
- Not done:
      - The Bureau's actions against companies the index no longer lists (Discover, Comerica,
        Hyundai Capital, Nissan, Experian) reach no page.
      - Santander Consumer USA's actions stay off Santander Holdings USA's page: its share of the
        lender was not read in its filings.

## NC ledger — batch 88: the listed banks', brokers' and managers' own units (2026-11-05)

The 2026-11-02 proposal 4, approved by the owner with three calls. The SEC's cases name a firm's
broker-dealer or adviser by its own name, and the Board's orders name its bank. The release rules
knew a company only by its own names, so those rows were on no page.

- [x] **`BANK_UNITS` in `lib/releaseNames.ts`: 34 companies' units, read by every rule that reads
      the map** (the SEC's cases and press releases, the Justice Department's releases, the Board's
      press releases), and never by news scoring.
      - **Their banks:** Regions Bank, Frost Bank, Origin Bank, Centennial Bank, PlainsCapital Bank,
        Simmons Bank, Green Dot Bank, Five Star Bank, Equity Bank, Banco de Crédito del Perú,
        National Westminster Bank, ING Bank, Lloyds Bank Corporate Markets, and Popular's Banco
        Popular de Puerto Rico and Banco Popular North America.
      - **Their broker-dealers and advisers:** Ameriprise Financial Services, Fifth Third
        Securities, KeyBanc Capital Markets, Franklin Advisers, Hilltop Securities, BB&T
        Securities, FTN Financial Securities, BlackRock Advisors, Nasdaq's exchange and routing
        broker, and others.
      - **Read by hand, each by its city:** the Board's six orders whose bank name another bank has
        or could have (Centennial Bank of Conway, Five Star Bank of Warsaw, Equity Bank of Andover,
        Origin Bank, Green Dot Bank, Simmons Bank).
- [x] **Each bought or sold unit counts between the days its company's filings give.** The days were
      read through EDGAR's full-text search, which says which filing holds a sentence; the SEC's
      document server would have needed a contact email, and the search does not:
      - U.S. Bancorp Piper Jaffray until the spin-off of 2003-12-31;
      - Hilltop's PlainsCapital Bank from 2012-11-30;
      - Home BancShares' Centennial Bank from 2008-01-01;
      - NatWest's bank from RBS's purchase of 2000-03-06;
      - Oppenheimer Asset Management from 2003-01-03;
      - Financial Institutions' Five Star Bank from the first filing that names it (2005-11-04).
- [x] **The owner's calls.**
      - (b) American Express Financial Advisors' case of 2004-02-12 is on both American Express's
        page (until the spin-off of 2005-09-30) and Ameriprise's.
      - (c) Prudential Securities' cases are Prudential Financial's, not Prudential plc's. The firm
        stayed Prudential's as Prudential Equity Group after its retail brokerage went into
        Wachovia Securities on 2003-07-01.
- [x] **Two of the proposal's rows refused, as the companies' filings say:**
      - Lazard Capital Markets was "a subsidiary of LFCM Holdings" (Lazard's proxy filed
        2008-03-24), so its case of 2008 is not Lazard's;
      - Fiserv sold Fiserv Securities in the first quarter of 2005, before its case of 2005-04-21.
- [x] **Popular in `FED_BANKS`:** its three enforcement actions (1999, 2000, 2023) reach its page;
      Banco Popular de Ecuador and Banco Popular Español stay off.
- [x] **The Board's verb names an applicant where no "by" does.** "Federal Reserve Board approves
      Banco Popular de Puerto Rico to acquire…" (2010-04-30) is the one such title of the 463 orders.
- [x] **What it adds, replayed on all the saved rows: 133 company events.**
      - SEC cases: 99 days on 23 companies, 62 before 2017 (Prudential 19, Franklin 17, Ameriprise
        15). The full replay is now 1,146 days on 369 companies.
      - Board releases: 27 on 13 companies (now 252 on 112).
      - SEC press releases: 4 (now 263 on 126).
      - Fed enforcement actions: Popular's 3 (now 113 on 33 banks).
      - The scout's measure was 62 days on 24 companies. The difference is Franklin Advisers'
        market-timing cases of 2004–2011 and Prudential's.
- [x] **Checks:** `check:sec-cases` 69, `check:fed-press` 47, `check:sec-press` 75,
      `check:fed-actions` 45. The proposal's cases are all in, with the two refusals. On main the
      unit cases fail and `check:sec-cases` cannot load `BANK_UNITS`.
- Not done, outside this map:
      - The press rule misses two releases that name a unit: "SEC Alleges …, Sanctions Prudential
        Securities, Incorporated" (2003), whose verb comes after a comma, and "American Express
        Financial Advisors (now known as …) to Pay" (2005). Each is the press rule's own wording,
        pinned in `check:sec-press`.
      - "Centennial Bank" and "Equity Bank" are names other banks have had. A future order by a
        namesake would need a `NOT_THE_COMPANY` row.
- Requests: efts.sec.gov 89 (85 searches, 4 asked again after a 500), www.federalreserve.gov 7 (the
  orders read by hand), www.sec.gov 2 (both refused for want of a contact address, and not asked
  again). `npm run check` and `npm run lint` pass. HawkScan cannot run here (`HAWK_API_KEY` is
  unset).

## NC ledger — batch 87: the SEC News Digest, one year counted (2026-11-03)

The owner approved the Digest on 2026-11-02 with a count first (proposal 1, step 1). This batch
builds the reader and the count, and runs it on 1985. Nothing is stored and no page changes.

- [x] **The reader** (`lib/secDigest.ts`). It reads a year's archive page, turns each issue's PDF
      into text with poppler's `pdftotext`, and splits the issue into entries. An entry is one name as
      printed: an 8-K row, the company bought in a 13D row, a registration's registrant, a heading cut
      to its parties, or an item of a listing order. It never takes a name from an entry's body, so an
      underwriter of someone else's offering lands on no page.
      - Sections are found through the scans' OCR ("RECENT 81( FILINGS"), by their opening sentence
        where the heading was a graphic (1990), and with headings spaced wide (1975).
      - The 1960s run-in paragraphs are read by their capitals lead-in. The 1960s two-column 8-K
        lists, in mixed case, are not read yet (Curtiss-Wright and Wiley, 1965).
- [x] **The name rule.**
      - A table row must be one of the company's conformed names: two words or more, the same
        registration tag, "&" dropped, "COMPANY" read as "CO".
      - Failing that, a row may be that name read back letter by letter through the scans'
        misreadings. "AIERICAI EIPRESS CO" is American Express; "MITEL CORP" is not Intel.
      - A heading names a company as a case caption names a party. A one-word name needs its legal
        words and must lead the heading, so "ARKANSAS POWER AND LIGHT COMPANY" is not Light S.A.'s.
      - A name another listed company has today names neither, and an entry two companies' names
        both claim that day is neither's.
- [x] **The names are dated.**
      - A former name counts only while the company's EDGAR record had it.
      - Before EDGAR, a record counts only under the name it filed under in its first quarter of
        EDGAR's 1993–1996 company indexes, and only if EDGAR opened it by 1996.
      - `lib/predecessors.ts` adds a predecessor's names before its handover.
      - This is what keeps 1985's Chase Manhattan off JPMorgan (whose record was Chemical Banking
        then), BankAmerica off Bank of America (NationsBank), Wells Fargo off Wells Fargo (Norwest),
        Chubb off Chubb (ACE), and 1990's McGraw-Hill off McGraw Hill (MH, a 2022 record).
      - The first run had none of this. Read by hand, it gave 607 rows on 307 companies with these
        errors in them. The rules above came from that reading.
- [x] **`npm run digest-report -- <year>`.** Pass 1 finds every entry's candidates under every name
      EDGAR lists (`cik-lookup-data.txt`, one request). Pass 2 reads each candidate's EDGAR record and
      the 16 company indexes, and keeps an entry only under a name the company had that day. It prints
      the rows per company and section, why each dropped row was dropped, and the rows before each
      company's first price (Yahoo).
- [x] **The count of 1985** (250 issues):
      - 23,922 entries read; 517 name a listed company, in **508 rows on 258 companies**:
        184 8-K reports, 129 registrations, 109 registrations made effective, 30 13D or 14D-1
        filings, 53 orders (most on utilities, under the Holding Company Act), 2 enforcement
        actions, 1 other.
      - Grouped a row a month, the 8-K reports are 177 rows.
      - 199 rows are under a name other than today's (Minnesota Mining & Manufacturing, FPL Group,
        New Orleans Public Service).
      - **50 of 50 rows sampled by hand were the company's own record.**
      - Every name, undated, gave 594 rows. The dates took away 86: 58 on 37 records EDGAR opened
        after 1996 (Deutsche Bank's, 2002), and 28 under a name that was another company's then.
      - **The first-price floor keeps 361 of the 508** (147 rows on 71 companies fall before the
        first price, many of them utility subsidiaries whose listed security is a preferred or a
        note: Georgia Power, Entergy Arkansas).
      - The scout's estimate was about 750 a year. Under dated names it is about 500 for 1985, or
        360 with the floor.
- [x] **`check:digest`** (48 checks), on six issues (1965–1990), every listed company's EDGAR names,
      and the dated records of every company the issues' entries could be:
      - Abbott's May 1975 8-K lands on ABT;
      - 3M lands under Minnesota Mining & Manufacturing;
      - Humana's S-16 lands on HUM;
      - Hasbro's five 13D rows are one row;
      - the 1980 underwriter is on no page;
      - McGraw-Hill's 1990 delisting is S&P Global's, not MH's.
      - Deutsche Bank AG's 1985 order is named by its heading but kept off DB, whose record began in
        2002. The filed plan expected it on DB; the dates say no, as the floor would.
      - On main it cannot run: `lib/secDigest.ts` does not exist.
- [ ] **Owner: is the count enough to build step 2, the walk?** And three calls with it:
      - **The first-price floor.** Keep it (361 rows in 1985) or not (508)?
      - **Records EDGAR opened after 1996.** Keep them off their earlier years, or map them one by
        one in `lib/predecessors.ts`? The floor alone would have kept 8 of their 58 rows in 1985:
        ONEOK, Newmont, TDS, Comcast, Toyota, ASA.
      - **The 1960s two-column 8-K lists.** Read them as part of step 2, or leave them?
      - Step 2 also needs, at ingest, each company's dated names and first-quarter names. Today only
        the day each former name stopped is stored.
- Requests, all runs: www.sec.gov 280 (the archive page was saved by the scout; 245 issue PDFs,
  ~173 MB; 1 retry; 7 answers of 503 in a first run that was stopped and resumed with retries; the
  name list; 16 company indexes; 4 size checks), data.sec.gov 319 (EDGAR records), Yahoo 321 (first
  trading days). `npm run check` and `npm run lint` pass. HawkScan cannot run here (`HAWK_API_KEY`
  is unset).

## NC ledger — batch 86: a new opportunity-scout run, five proposals for the owner (2026-11-02)

The 2026-11-01 proposals are all built (batches 80–84), and batch 85's audit findings are fixed. So
the `opportunity-scout` read the repository again at `5defee6` and wrote
`docs/proposals/2026-11-02-proposals.md`: five proposals, all **PENDING**, ranked with securities
depth first. Nothing is built in this batch.

- [x] **Owner: mark each proposal `APPROVED`, `REJECTED` or `DEFERRED`** (with a reason for a
      rejection). The scout's second pass then files the approved ones into this checklist.
      ✅ Marked 2026-11-02 for #1, #4 and #5, each filed under Scope refocus; #2 and #3 on 2026-11-05:
      - #1 approved: yes to the source, with the count first (`P1`);
      - #4 approved with the calls: (a) yes, widen the maps; (b) yes, American Express Financial
        Advisors' cases before the 2005 spin-off go on both American Express's and Ameriprise's
        pages; (c) Prudential Securities goes on Prudential Financial (PRU), not Prudential plc
        (`P2`);
      - #5 approved: yes to the source (`P2`);
      - #2 and #3 approved 2026-11-05 ("Lets move forward with all of the proposals."), filed by
        batch 92.
      1. `P1` **The SEC News Digest, 1956 to the mid-1990s:** the SEC's daily summary of companies'
         filings and cases before EDGAR (8-K reports with their items, registrations, 13D and
         14D-1 filings, enforcement and delisting orders), on sec.gov under the press releases'
         licence.
         - Six issues read by hand (1965–1990, one every five years) named 0 to 10 index
           companies each. The scout estimates about 750 entries a year, 25,000–30,000 over
           1956–1993: an estimate, not a count.
         - The largest one-off build here: about 9,500 PDFs, 5.4 GB read once, and a PDF text
           reader on the ingest path. It is gated on a count step that reads one year first.
         - **The owner's call:** yes or no on the source, and on the count first.
      2. `P1` **The Justice Department's releases of 2001–2008, from its archive.** Today's adapter
         stops at 2009, where the API begins. Same releases, same licence.
         - In two archive months, the party rule found 5 of 93 titles (AEP, Weyerhaeuser, Akzo
           Nobel, Wal-Mart, BB&T; 2 of them under former names). The scout estimates 200–250
           events in every sector.
         - 96 month pages, read once. The archive's index page answered the scout with a bot
           check, so how the month pages are reached is part of the build.
         - No source call; the owner may want to say yes to the walk first.
      3. `P2` **The Federal Reserve Board's orders of 1996–2005, from its yearly pages.** Same
         source and licence as batch 84.
         - All ten pages read: 469 orders. Replayed under current names they give 117 matches on
           55 companies, all before 2006; former names (NationsBank, Norwest, Travelers, Chase
           Manhattan) add about 22.
         - That roughly doubles the Board's releases before 2017. No owner call.
      4. `P2` **The listed banks' and brokers' own units: their banks in the Board's orders, and
         their broker-dealers and advisers in the SEC's cases.** Batch 84's open call, with
         Popular, Inc. folded in.
         - New, measured on the saved case rows: 62 company days on 24 companies, 25 before 2017,
           on no page today. That is on top of batch 84's ~25 orders and Popular's 3.
         - About 35 map rows, each dated from a filing (~70 EDGAR requests once).
         - **The owner's calls:** (a) widen the maps at all; (b) American Express Financial
           Advisors before the 2005 spin-off — American Express's page, Ameriprise's (it is that
           record's own former name), or both; (c) Prudential Securities (2000–2003) on
           Prudential Financial (PRU), not Prudential plc (PUK).
      5. `P2` **The CFPB's enforcement actions, from 2012.** A new source, public domain by its
         own website policy, no key.
         - 2012–2016 read whole: 164 actions, which the scout read by hand as 34 company days on
           27 listed companies. About 20 of the 34 need #4's unit names.
         - **The owner's call:** yes or no on the source.
- **Owner calls carried, not ranked:** CPSC recalls (the 2026-10-22 shortlist), with nothing new
  measured; JCI's 2016 case on Tyco's record (batch 85's set-aside), a note at the end of the file.
  Insider-trade forms stay out (2026-10-18).
- **Requests the scout made:** 42 in all, each with the project's User-Agent, sec.gov hosts paced
  about one a second: www.federalreserve.gov 14, www.consumerfinance.gov 9, www.sec.gov 8,
  www.justice.gov 5 (two 404s and a bot check), www.fdic.gov 3, data.sec.gov 3. The local database
  was only read (`chronolens_b73`).
- `npm run check` passes and `npm run lint` is clean; nothing but documents changed.

## NC ledger — batch 85: the audit of batches 78–84, and its five findings fixed (2026-11-02)

The `code-auditor` read batches 78–84 (`1353574..960c3be`). Its report is
`docs/audits/2026-11-01-code-audit.md`. It found the mechanics sound: the previous audit's fixes,
the bank map's days, the Fed feed's parser, times and cache, and every count the docs give, replayed
on the full saved data. It found five defects. All five were reproduced here and are fixed, each
with cases that fail on main.

- [x] **1. Mutual funds named only "Growth Fund", "Income Fund" or "Total Return Fund" took other
      firms' fraud cases, scored 0.95** (`P2`).
      - **The defect:** a fund's page knows only its series name ("GROWTH FUND" for TWCGX), and the
        caption rule read "Growth Fund, Ltd." (LR-18525, 2003, James P. Lewis's Ponzi scheme) as
        its. Replayed against all 19,540 series names, the captions gave 10 cases on 9 fund pages
        (TWCGX, VCULX, HNASX, MNRGX, CFGRX, FOINX, TWCIX, NOTEX, JHTRX), every one another firm's.
        No check had ever replayed a fund.
      - **The fix:** a fund's series is never a party to the release rules (`FUND_SERIES` in
        `lib/ingest/secPressWalk.ts`). Ingest passes `fundSeries` to the SEC press releases, the
        SEC's cases and the Board's releases, and a fund asks the Justice Department nothing.
      - **Measured:** the press releases and the Board's releases give the 19,540 series nothing
        either way; the Justice Department was not measured (no request was made), and the same rule
        keeps it off a series name.
- [x] **2. The caption rule missed the biggest banks' own spellings and units** (`P3`).
      - **The defect:** "JP Morgan Chase & Co." (the 2016 FCPA order, the London Whale orders of
        2017 and 2019) and "J. P. Morgan Securities LLC" (2023) matched no name, since initials
        were read only one letter a word. Morgan Stanley DW, Citibank, Salomon Smith Barney, BofA
        Securities and Goldman Sachs's clearing firm and fund adviser were not in the map.
      - **The fix:** `pressName` reads initials written together, spaced or run into a name ("J.P.",
        "J. P.", "JP Morgan" and "JPMorgan" are one pattern). The map adds "JPMorgan Chase" (from
        2000-12-31), Morgan Stanley DW, "Citibank, N.A." from 1998-10-08, Salomon Smith Barney, BofA
        Securities, and a Goldman Sachs entry (Execution & Clearing, Asset Management).
        - Citibank's day is Citigroup's 8-K of 1998-10-08: "At 12:01 a.m., Eastern time, on October
          8, 1998 … Citicorp merged with and into Citi Merger Sub Inc." (2 requests to EDGAR).
        - It is named with its legal form, because the index lists "Citibank,N.A./ADR" (JTGEY), its
          ADR depositary record, whose longer name would own a bare "Citibank".
        - A party now ends before its other name as it already began after one ("…, L.P. f/k/a
          Spear, Leeds & Kellogg, L.P."), which gives Goldman its 2007 order and Grown Rogue its own
          of 2022 under its former name Novicius.
        - **Read by hand on the way:** "Quantum Corp. a/k/a Quantum Trading" (LR-15555, 1997) is a
          fraud's shell, now kept off Quantum Corporation by CIK. Smith Barney Fund Management's
          order of 2007 stays off Citigroup: Legg Mason had bought it in 2005.
      - **Measured:** cases 1,022 → 1,044 company days (+22: every one the audit listed but Smith
        Barney Fund Management's and the two the SEC's typo "Goldman and Sachs & Co." names, plus
        J.P. Morgan Chase's own case of 2003-07-28 and Grown Rogue's of 2022); press releases 255
        → 259 (Citibank's 2001 settlement, J.P. Morgan Chase's of 2003, J. P. Morgan Securities' 2011
        charge, Goldman Sachs Asset Management's 2022 ESG charge); the Board's releases unchanged
        at 225. The Justice Department is asked BofA Securities with Bank of America's names, and
        Goldman Sachs's two units with its.
- [x] **3. The SEC's listings lost rows where their pages overlapped, and marked those years read
      for good** (`P3`).
      - **The defect:** the listings sort a year by day alone. Where rows tie on a day across a page
        boundary, the next page shows some of them again and never shows others. The pages state
        their own count ("1 to 100 of 439 items"): 40 of the 66 case listing-years were short by 96
        rows, and 4 press years by one each (2006-200, beside the repeated 2006-198).
      - **The fix** (`lib/listingGaps.ts`, both walks, `db/034`): a past year whose pages show fewer
        distinct rows than its count reads again, alone, the months its repeated rows fall in. The
        count is kept in a new `listed` column. A year stored before this batch has none, so its
        first page is asked once: where the rows kept reach the count only the count is recorded,
        otherwise the year is read again with its months. Nothing is deleted or reset. Rows a
        month's own pages still never show are counted and reported in the run's log line.
      - **Measured,** with the 79 months read once from sec.gov (91 requests, 1 s apart): 93 of the 96
        case rows and 3 of the 4 releases came back. Three of the rows name a listed company
        (J.P. Morgan Securities' 2009 order, UBS Securities' of 2011, Citigroup Global Markets' of
        2017). 4 stay unshown (two proceedings of 2007, one of 2019, a release of 2024).
      - **Real Postgres** (`chronolens_b85`, every migration applied, pages served from the saved
        files): a first walk stored all 30,747 rows in 430 pages and reported 3 short; a second asked
        nothing; years made to look read before this batch were recounted from one page each, and
        the one short by a row was read again and restored to its 839.
      - **Docs:** the "344 pages" for 1995–2026 counted 1994's two empty pages; the walk reads 342.
- [x] **4. `check:sec-cases` and `check:fed-press` replayed only their own samples, and never a
      fund** (`P3`).
      - **The fix:** both now replay the full saved data, committed gzipped: every case row both
        listings hold (`scripts/fixtures/sec-cases-all.json.gz`, 30,747 rows, 874 KB) and the
        Board's whole feed (`scripts/fixtures/fed-press-feed.json.gz`, 4,650 rows, 138 KB). They
        replace the two samples. Each replays every company and every fund series in the index,
        through an index of the text's four-letter pieces (about 8 s and 11 s).
      - **Pinned:** cases 1,047 company days on 353 companies, 495 before 2017 (Bank of America 73,
        Morgan Stanley 73, JPMorgan 52, Citigroup 49, Wells Fargo 47, UBS Group 47, Goldman Sachs
        20), the 10 cases fund series names would take, and the Board's 225 on 103 with 0 for the
        series. The press-release listing gains the 3 recovered releases (6,897).
- [x] **5. A company with no prices yet logged its SEC releases, cases and Board releases as
      "empty", which counts as asked for a day** (`P3`, the rest of the 2026-10-30 audit's finding
      4).
      - **The fix:** that outcome is now an error (`NO_PRICES`), so the next run asks again.
- **Set aside, as the audit did:** a year closes on the UTC date; former legal names have no start
  day (no caption found that it matters for); IMPP, MRDN, LASE, BKR and JCI left to the first price
  (JCI's Tyco-record case of 2016 is an ownership call for the owner); `companyPrices` is not wrapped
  like `runSource`.
- **Checks:**
  - `check:sec-cases` 63, `check:sec-press` 75, `check:fed-press` 43, `check:doj` 54.
  - On main, `check:sec-cases` cannot load (no `lib/listingGaps.ts`); `check:sec-press` fails 7,
    `check:fed-press` 3 and `check:doj` 2.
- **Docs:** README (the press releases, the cases and the Board's sections), COVERAGE-MAP (three
  rows and the gaps paragraph), CLAUDE.md (a fund's series is no party), and the walks' comments.
- **Requests made:** www.sec.gov 93 here (79 months in 91 pages, and Citigroup's 8-K list and filing
  of 1998); the audit made 2 (www.sec.gov 1, query1.finance.yahoo.com 1).
- `npm run check` passes (53 suites) and `npm run lint` is clean. HawkScan was not run:
  `HAWK_API_KEY` is not set.

## NC ledger — batch 84: the Federal Reserve Board's press releases (2026-11-01)

The last of the five proposals the owner approved on 2026-11-01 (#5), with the owner's yes to the
source. All five are now built.

- [x] **A new source, `fed_press`** (`lib/fedPress.ts`, `lib/ingest/fedPressFor.ts`).
      - **What it reads:** one file, `www.federalreserve.gov/json/ne-press.json`, about 1 MB, every
        Board release since 2006-01-10 (4,650 on 2026-11-01). Three of its five types are read:
        Orders on Banking Applications, Banking and Consumer Regulatory Policy, and Other
        Announcements. 19 rows of the last link off the Board's site (Reserve Banks naming their
        presidents) and are skipped, which leaves 2,219. Enforcement Actions are not read here,
        since batch 69 reads them from the Board's own files; nor is Monetary Policy.
      - **Licence:** re-read on 2026-11-01 (`federalreserve.gov/disclaimer.htm`), the same words
        the enforcement files carry: public domain, cite the Board. No key. Registered as source
        29, credited in the footer, the Terms page and README, and scored without the model.
      - **How it is read:** once a process for every company; a failed read is not kept, so the
        next company asks again.
      - **The names a company is read by:** the same list the SEC's cases use, now one shared
        function (`partyNamesFor` in `lib/ingest/secCasesWalk.ts`). That is its everyday names that
        year, its possessive, its legal name and the former legal names it had that year, plus the
        units the release rules' map gives it. Nothing from before its first price.
      - **Times:** 1,929 of the 2,219 carry a Washington clock time, read to an exact instant, so
        batch 68's mark applies ("4:30 pm ET, after the close" on Scotiabank's approval of
        2026-10-29). The rest, all before 2017, give a day only.
      - **Accented names:** the feed writes them as HTML codes (`Soci&eacute;t&eacute;
        G&eacute;n&eacute;rale`). They are decoded with the SEC headline reader's decoder, now
        exported as `decodeEntities`.
- [x] **Who an order names** (`orderParties`).
      - **The parties:** the applicant after "by" (or "approval for"), and what it acquires, merges
        with, buys, retains or controls. Each is read as a case caption is: the name, or the legal
        name, with only legal words after it. "Approval of proposal by Mitsubishi UFJ Financial
        Group to acquire voting shares of Morgan Stanley" (2008-10-06) goes on both pages.
      - **Batch 69's hand-checked map counts too:** an order filed under a bank the map gives the
        company on that day. That adds "Goldman Sachs Bank USA" (2015-10-05, 2016-03-21), Morgan
        Stanley's E*TRADE notice (2020-04-30) and its bank's request of 2026-03-26, and BB&T's six
        orders on Truist's page.
- [x] **Who a policy release acts on** (`boardActsOn`). The Board's own phrase must come just
      before the name:
      - a capital plan from or of; a stress capital buffer for; assistance, support or lending to;
        a statement or joint release on; an agreement with; "requiring"; approve or permit;
        applications of; an acquisition by or of; a transition period for; efforts of;
        participation in; subsidiaries of; rescinding the designation of;
      - or the company's own plan ("Morgan Stanley's stress capital buffer requirement", "Wells
        Fargo's second resolution plan"), "has remediated", or "proposed U.S. Bancorp Acquisition
        of MUFG Union Bank";
      - under the press releases' guards: a longer listed name owns the mention, a name more than
        one listed company has names none, and a short name a bigger company's begins with counts
        only with a legal word of its own.
- [x] **Every match read by hand** (225).
      - **Namesakes:** "Approval of proposal by Fortis" (2007-12-04) is the Belgian bank, kept off
        Fortis Inc. by CIK (`NOT_THE_COMPANY`). The rule itself refuses "Banco Popular Español"
        (2006-02-08) for Popular, and Michigan's "Citizens Banking Corporation" (2006-12-12) for
        Citizens, Inc. and Citizens Financial.
      - **Near misses refused:** seven releases whose letters hold a large bank's name but make it
        no party: a vice chairman's recusal from Wells Fargo matters, payments to Goldman's and
        Morgan Stanley's borrowers, and capital rules on banks' holdings of Fannie Mae and Freddie
        Mac preferred stock.
      - **Caught on the way and added:** Fannie Mae's and Freddie Mac's joint release of 2008-09-07,
        the day of their conservatorship; Freddie Mac in the Board's lending authority of
        2008-07-13 (Fannie Mae's was already kept); and the statement of 2017-10-02 on rescinding
        AIG's designation.
      - **The feed's own type is kept:** Old National's approval of 2018-10-17 is typed "Banking and
        Consumer Regulatory Policy" by the Board. The policy rule keeps it, described by that type.
- **Measured** on the 2,219 releases against the committed index, under current names (former names
  aside), in the shape ingest reads them:
  - **The totals:** 225 matches (213 releases) on 103 companies, 126 before 2017, 181 of them orders.
    The proposal counted 157 orders on 89 companies by exact everyday names, and 34 policy releases
    by a list of names.
  - **The most:** Morgan Stanley and Bank of America 11 each, Capital One 8, Wells Fargo, Truist and
    PNC 7.
- **Not given yet (open):**
  - **Orders filed under a listed company's own bank** whose name is not its holding company's, and
    that no map row gives: about two dozen (25 by a reading of the titles, not each checked against
    the banks' filings). Regions Bank 4, Frost Bank 3 (Cullen/Frost), Origin Bank 3, Centennial
    Bank 2 (Home BancShares), PlainsCapital Bank 2 (Hilltop), and one each for Simmons Bank, Green
    Dot Bank, Five Star Bank (Financial Institutions), Equity Bank, Banco de Credito del Peru
    (Credicorp), National Westminster Bank (NatWest), ING Bank and Lloyds Bank Corporate Markets. A
    map row per bank would give them; that widens batch 69's map, so it is left for a decision.
  - **Popular, Inc.:** its order of 2010-04-30 and two of 2015-02-27 are filed under Banco Popular de
    Puerto Rico and Banco Popular North America. Popular's row in `FED_BANKS` is still the owner's
    (raised in batch 74); one row would serve both sources.
  - "Board announces that Goldman Sachs and Morgan Stanley transactions may be consummated
    immediately" (2008-09-22) has no party phrase. The approval of the day before is on both pages.
  - The Board's orders before 2006, on its yearly pages, are not read.
- **Found on the way and fixed:** batch 83 put README's section on the SEC's cases in the middle of
  the SEC press releases' section, cutting its "What is refused" paragraph off from the rest. The
  section now follows it.
- **Real Postgres** (`chronolens_b84`, every migration applied, from the saved feed): four banks
  stored through the ingest's own functions with one request between them. Mitsubishi UFJ's stake
  in Morgan Stanley of 2008-10-06 is one event on both pages, at "5:30 pm ET, after the close"; the
  Wachovia approval reads "4:45 pm ET, markets closed" (a Sunday); Live Oak, listed 2015-07-23,
  gets nothing from 2013.
- **Checks:**
  - **`check:fed-press`, new in the chain, 40 checks** on 234 real rows (`scripts/fixtures/
    fed-press.json`, 52 KB): every release the rules keep, the near misses, the namesakes, rows of
    the types not read, one row linking off the Board's site, and the feed's closing row. It
    covers the parser and its times, the parties, the policy phrases, the map, the first price,
    the full replay pinned at 225 on 103, one read for every company, the ingest step with a former
    name, and the registration, wiring and credits. On main it cannot run: the adapter does not
    exist.
  - **`check:live`:** a case on the real file (at least 2,219 releases, the first day, Wells
    Fargo's Wachovia approval, Bank of America's capital plan), run once on its own today and
    passing. **`check:feeds`:** the company's releases from the file.
- **Docs:** README (a section and a sources row), COVERAGE-MAP (a row, the gaps paragraph, 29
  sources, 21 on the ingest path), CLAUDE.md and `lib/releaseNames.ts` (who reads the release map).
- **Requests made:** www.federalreserve.gov 3 (the feed twice, the licence page once).
- `npm run check` passes (53 suites) and `npm run lint` is clean. HawkScan was not run:
  `HAWK_API_KEY` is not set.

## NC ledger — batch 83: the SEC's litigation releases and administrative proceedings (2026-11-01)

The second of the five proposals the owner approved on 2026-11-01 (#2), with the owner's yes to the
source.

- [x] **A new source, `sec_cases`** (`lib/secCases.ts`, `lib/ingest/secCasesWalk.ts`, `db/033`).
      - **What it reads:** the SEC's two case listings, `www.sec.gov/enforcement-litigation/
        litigation-releases` and `…/administrative-proceedings`, by year, 100 rows a page.
      - **Licence:** the press releases' own ("public information … may be copied or further
        distributed"), on the same host; no key. Registered as source 28, credited in the footer,
        the Terms page and README, and scored without the model.
      - **How it walks:** in the shape of batch 73's press-release walk. Each closed year of each
        listing is read once, every page, and never asked again. The current year is read again a
        day later, down to a row already kept. The budget is 120 pages a process, 1 s apart.
      - **Measured:** 1995 is the first year either listing holds. 1995–2026 is 344 pages (139
        litigation, 205 proceedings) and 30,654 rows; the most pages one year takes is 11.
- [x] **Who a caption names** (`captionParty`). A row lists its defendants or respondents. A company
      is a party when one entry of the caption is its name, or its legal name, followed only by legal
      words (Inc., Corp., LLC, plc, N.A., S.A., AG…).
      - **Why legal words only:** the press releases' `DESIGNATOR` also lets "Holdings", "Financial",
        "Securities" or "Technologies" follow a name. On litigation releases alone it gave 231 rows
        to 127 companies, many of them namesakes: "Southern Financial Group" on Southern Company,
        "Reliance Holdings" on Reliance, "Lucent Technologies" on Lucent, Inc. Legal words only gave
        170 rows on 112 companies.
      - **The legal name counts too,** with its own legal form left for the caption to write:
        "RenaissanceRe Holdings Ltd.", and "Dana Holding Corporation" under Dana's former name. Where
        the shortened name is shared, the legal name as filed still counts: "Rio Tinto plc" is RIO's.
      - **A one-word name with no legal word** counts only standing alone, as "Sanofi" and
        "TransUnion" are their captions. "Dow, Mitchell B." is a person; "Fox, Reusch & Co." and
        "City (U.K.), Ltd." are other firms.
      - **Legal words are taken whole:** "Appian, Inc. Bulk Storage Software, Inc." names no
        "Appian".
      - **Refused, as the proposal asked:**
        - a stock ("Unknown Purchasers of Securities of Martek");
        - relief defendants, cut off at "Defendants";
        - an amicus brief in someone else's suit;
        - a name more than one listed company has, and a longer listed company's name.
- [x] **Namesakes read by hand** (`NOT_THE_COMPANY`, by CIK; 28 rows on 10 companies):
      - another Acorn Energy (2010);
      - "McDonalds Ltd." (2000, 2003);
      - the American National Steel of 2001 on CSN, whose EDGAR name is NATIONAL STEEL CO;
      - a 2001 "Spectrum Brands Corp." (that record was Zapata's then);
      - Trinity Capital Corporation of Los Alamos (2015–2021);
      - lists of revoked registrations naming "Telos, Inc.", "TSS Ltd.", "First Community, Inc.",
        "Valor Energy Corp." and "Carlin Resources Corp. (n/k/a Carlin Gold Corp.)". Carlin Gold
        Corp's record holds only private-placement notices (data.sec.gov, 1 request).
      - **Left to the first price**, which keeps a company off the years before it listed (not
        measured here): old Broadcom Corp. (2008), General Motors Corporation (2009-01), Dell
        Inc. (2010), Ingersoll-Rand Company Ltd. (2007), The Cronos Group (1999), Bausch & Lomb
        (1997), Agora, Inc. (2003), Centuri (1996), Loomis Ltd. (1997).
- [x] **The bank units the captions name in full join the release rules' map** (`lib/releaseNames.ts`):
      - JPMorgan: J.P. Morgan Securities, J.P. Morgan Investment Management (both from 2000-12-31),
        JPMorgan Chase Bank;
      - Citigroup Alternative Investments; Morgan Stanley Investment Management;
      - Wells Fargo: Wachovia Securities (from 2008-12-31), Wells Fargo Bank, Advisors, Advisors
        Financial Network, Brokerage Services, Clearing Services, Securities;
      - UBS Group: UBS Securities, UBS Financial Services and its Puerto Rico firm;
      - new banks: Deutsche Bank Securities, and Deutsche Bank Trust Company Americas from
        1999-06-04; State Street Bank and Trust; BNY Mellon Securities; Barclays Bank and Barclays
        Capital;
      - **a third notes record, ATMP (Barclays Bank PLC):** the owner's call (c) applied to a record
        of the same kind. It had taken 11 SEC cases and three Justice Department releases that are
        Barclays'. This is my extension of the call, flagged for the owner.
      - **Effect on the press releases:** 252 → 255 (UBS's 2008 auction-rate settlement, Morgan
        Stanley Investment Management's 2011 charge, Barclays Capital's 2014 charge), 153 before
        2017.
      - **Effect on the Justice Department, measured live:**
        - Barclays 1 → 4: Barclays Bank PLC's $298 million forfeiture of 2010, its 2012 LIBOR
          admission and the 2016 mortgage-securities suit, all three off ATMP;
        - UBS Group 0 → 2: the $1.435 billion settlement of 2023 and the 2018 suit;
        - **the cost:** UBS Group is asked two more names a run.
- [x] **One event a company a day,** titled by its own party ("SEC litigation release:
      Transocean Inc."). The description carries the whole caption, each release number and a
      proceeding's file number. The company's CIK is in the event's identity, so two banks one
      caption names each get their own.
- **Measured** on the 30,654 rows against the committed index, under current names (former names
  and first prices aside):
  - **The totals:** 1,056 rows matched, 1,022 company days on 352 companies, 478 before 2017.
  - **Most have no press release:** 813 of the 1,022 fall on a day no SEC press release names the
    company.
  - **The biggest:** Bank of America 72, Morgan Stanley 66, Wells Fargo 47, UBS Group 46, JPMorgan
    46, Citigroup 44, Deutsche Bank 19, Barclays 18.
  - **2010:** 55 company days on 24 companies, against the scout's 25 on 16 by exact names. They
    include Transocean, Noble (through its predecessor's name) and Tidewater on 2010-11-04, and
    Huntington on 2010-11-09.
  - **Per year:** from 1 to 22 a year before 2005, 23 to 55 from 2005 to 2022, and 99 in 2023.
- **Real Postgres** (`chronolens_b83`, every migration applied): the walk stored 2010's two
  listing-years from the saved pages, 438 and 738 rows, each listing's one duplicate kept once. A
  second walk asked nothing, and Huntington's 2010 proceeding came back as its event.
- **Checks:**
  - **`check:sec-cases`, new in the chain, 47 checks:** on real rows (`scripts/fixtures/
    sec-cases.json`: every matched row and the refusals, 1,421 rows, 237 KB) and three real page
    samples. It covers the parser, the party rule and each refusal, the namesakes, the units by
    day, the events, the full replay pinned at 1,022 on 352, the walk, the company step, and the
    registration and wiring. On main it cannot run: the adapter does not exist.
  - **`check:sec-press`:** the map now holds eleven banks and three notes records, and the replay
    is pinned at 255.
  - **`check:doj`:** UBS Group's query names updated.
  - **`check:live`:** a case on 2010's first pages (Transocean, Huntington) and its last litigation
    page. **`check:feeds`:** each listing's newest page.
- **Docs:** README (a section and a sources row; the press-release counts), COVERAGE-MAP (a row, the
  gaps paragraph, 28 sources), CLAUDE.md (the caption rule and the map).
- **Requests made:** www.sec.gov 344 (every page of both listings, once, 1 s apart), data.sec.gov 1,
  www.justice.gov 10.
- `npm run check` passes and `npm run lint` is clean. HawkScan was not run: `HAWK_API_KEY` is not
  set.

## NC ledger — batch 82: the banks as the SEC names them (2026-11-01)

The fourth of the five proposals the owner approved on 2026-11-01 (#4), with the three calls:
(a) "J.P. Morgan" and "JPMorgan" are JPMorgan Chase's; (b) a bare "UBS" is UBS Group's, and Credit
Suisse is its own from the day UBS bought it; (c) the banks' notes records take no release. All
three apply in the release rules' own map only, never to the names headlines are scored by.

- [x] **A map the release rules alone read** (`lib/releaseNames.ts`). Each unit counts while the
      company owned it, each day from the company's own filings, as the Fed, FDA and NHTSA maps do:
      - Bank of America: Banc of America Securities, Investment Services and Capital Management, and
        Merrill Lynch from 2009-01-01 (its 10-K filed 2009-02-27);
      - Wells Fargo: Wachovia from 2008-12-31 (its 8-K filed 2009-01-28);
      - JPMorgan Chase: "J.P. Morgan" and "JPMorgan" from 2000-12-31, the day J.P. Morgan & Co.
        merged into Chase's record (its 8-K of that day). "J.P. Morgan" with its legal word covers
        J.P. Morgan Securities. Bear Stearns from 2008-05-31: the purchase closed at 11:59 p.m. on
        2008-05-30 (its 8-K filed 2008-06-02);
      - Citigroup: Citigroup Global Markets, and Smith Barney until 2009-05-30;
      - Morgan Stanley: Morgan Stanley Smith Barney from 2009-05-31, 51 percent its own from the
        start. Both 8-Ks say the venture closed "On May 31, 2009", not on June 1 as the proposal had
        it;
      - Regions: Morgan Keegan from 2001-03-30 to 2012-04-01. That Regions' 8-K gives 2001-03-30,
        not the proposal's 2001-06-29. The company's own 8-K gives the sale to Raymond James as
        2012-04-02;
      - UBS Group: a bare "UBS" (call b), and Credit Suisse from 2023-06-12, as the Fed map has it.
      - **Not a scoring list:** `companyScoringAliases` is unchanged, and CLAUDE.md now says the map
        must stay out of scoring.
- [x] **The notes records take none** (call c, `NOTES_RECORDS`): UBS AG's AMUB and Credit Suisse
      AG's GLDI. Their SEC release step returns empty with a reason, and the Justice Department is
      asked nothing for them.
- [x] **UBS Group's "UBS" is not outranked by a smaller UBS company** (`outrankingNameFor`,
      `lib/sec.ts`).
      - **What was wrong:** "UBS" is UBS AG's everyday name, 8,368th in the index. "UBS Asset
        Management High Yield Credit Fund" ranks above it (4,038th), so on UBS Group's page the bare
        name counted only with a legal word after it, though UBS Group ranks 111th.
      - **The rule now:** the bigger company must rank above the company asking as well, and is
        never one of its own names.
      - **Nothing else changes:** the replay without the new names gives the same 208 entries before
        and after.
- [x] **The Justice Department reads the map too** (`justiceQueryNames`, `dojEvents`):
      - the units are asked for whatever their days, and a release counts only inside them;
      - a name under five characters no longer stands in for a longer one when the API is asked
        (`dojQueryNames`), since its search stops after one page when it matches too many titles.
        Without this, UBS Group's new "UBS" would have replaced its "UBS Group" search;
      - ten other companies had a longer name dropped for a short one this way: Dell Technologies
        for Dell, TSMC for TSM, and Uber, CGI, DiDi, Snap, Gogo, Angi, H&M and DCC. Each now asks
        both. Measured live, none of their pages changes, at one more request each per run.
- [x] **Faster name lookups** (`lib/sec.ts`): the index's everyday names are made once, not once per
      name looked up. The full replay went from 78 seconds to 11, and ingest's lookups speed up too.
- **Measured, SEC:** all 6,894 stored releases replayed against the committed index, under current
  names (former names and first prices aside).
  - **The totals:** 208 page entries become 252, on 124 companies instead of 123, 150 of them before
    2017 instead of 124.
  - **Added, 51:**
    - Bank of America 20 (8 → 28): "Banc of America Capital Management, BACAP Distributors and
      Banc of America Securities to Pay $375 Million" (2005-16), "Merrill Lynch to Pay $415
      Million" (2016-128);
    - UBS Group 11 (0 → 11): "UBS Agrees to Pay $200 Million" (2009-29), and its charges of 2011
      to 2022;
    - JPMorgan 10 (1 → 11 in the replay; its page has 2 today, with its former name): "J.P. Morgan
      to Pay $153.6 Million" (2011-131), "J.P. Morgan Securities Admits to Manipulative Trading in
      U.S. Treasuries" (2020-233);
    - Citigroup 3, including Smith Barney's 1997 settlement; Morgan Stanley 3; Regions 3 (Morgan
      Keegan's of 2009 to 2011); Wells Fargo 1 (Wachovia's bid rigging, 2011-257).
  - **Removed, 7:** Credit Suisse's on GLDI, 2012-11-16 to 2021-10-19. One, "SEC Charges J.P.
    Morgan and Credit Suisse" (2012-233), is now JPMorgan's. The other six sit on no page, since
    Credit Suisse Group is not in the index.
  - **Against the proposal's estimates:**
    - the units add 30 beside JPMorgan's, as estimated;
    - JPMorgan gains 10, the scout counted 11;
    - UBS Group gains 11, not "about 18". The other 8 stay out on the rule's existing limits: a
      former adviser, "UBS Puerto Rico" (twice), "UBS Global Asset Management", "UBS PaineWebber",
      "UBS Subsidiary", "Two UBS Advisory Firms", and the 2008 "UBS Securities LLC and UBS
      Financial Services, Inc. Agree".
  - **Still out, as proposed:** Merrill Lynch's Enron charge of 2003 and its auction-rate settlement
    of 2008, Wachovia's of 2004 and 2008, Bear Stearns' of 1999 and 2006, "SEC Charges Two J.P.
    Morgan Traders" (2013-154), and the former Countrywide executives (2009-129).
- **Measured, Justice Department** (live, 2026-11-01, each bank with and without the map):
  - **Wells Fargo 9 → 10:** "Wachovia Bank N.A. Admits to Anticompetitive Conduct…" (2011-12-08);
  - **JPMorgan 6 → 7:** the record $13 billion settlement "with JPMorgan" (2013-11-19);
  - **GLDI 6 → 0:** Credit Suisse's go to no page;
  - **the rest are unchanged.** UBS Group gains none: "UBS" turns up 2,358 titles, inside words like
    "subsidiary", so its search reads only the newest 50, and "UBS Group" turns up 5 titles, none a
    party.
- **Left for the next audit:**
  - "AG", "Commodities" and "Entities" are not words the rules let follow a name, so three releases
    stay out: Merrill Lynch Commodities' 2019 resolution, Credit Suisse Services AG's 2025 plea
    (both the Justice Department's), and "Credit Suisse Entities to Pay $10 Million" (SEC
    2023-249);
  - UBS's units by their own names ("UBS Puerto Rico", "UBS Global Asset Management");
  - Morgan Keegan for Raymond James after 2012-04-02, which the proposal did not list;
  - Barclays Bank PLC (ATMP), a third notes record. It takes no SEC release today; whether it takes
    a Justice Department release that should be Barclays' was not measured.
- **Checks:**
  - **`check:sec-press`, 73 in all (17 new),** on the whole stored listing, now committed
    (`scripts/fixtures/sec-press-listing.json`, 6,894 releases, 766 KB):
    - each bank's cases, and the releases that must stay out;
    - the ranking change, the notes records, and ingest reading the map by CIK;
    - the full replay, pinned at 252 entries on 124 companies, with each bank's count.
    - **On the code before this batch** the check cannot load, since the map did not exist. With
      the map file but the old rules, 14 of the 17 fail, as does the updated wiring check, and the
      replay gives 201 entries.
  - **`check:doj`, 54 in all (9 new),** on three real releases added to its test data:
    Wachovia's, JPMorgan's, and Credit Suisse's of 2017. They cover the dated units, the notes
    records (asked nothing), and the short-name rule. On the code before this batch the unit cases
    fail, and the check then stops with an error, since `justiceQueryNames` did not exist.
  - **`check:feeds`** (live, outside the chain) asks as ingest now does.
- **Docs:** README (both release sections), COVERAGE-MAP, CLAUDE.md, and batch 73's note on units.
- **Requests made:** data.sec.gov 7 (filing lists), efts.sec.gov 9 (full-text search), www.sec.gov
  10 (the filings read for the days) and www.justice.gov 60. The Justice Department pages covered
  the nine banks with and without the map, and the ten short-name companies with and without their
  longer names.
- `npm run check` passes and `npm run lint` is clean. HawkScan was not run: `HAWK_API_KEY` is not
  set.

## NC ledger — batch 81: a legal form left in the everyday name (2026-11-01)

The third of the five proposals the owner approved on 2026-11-01 (#3), as proposed, with no call.

- [x] **The long legal forms go as the short ones do** (`LEGAL_SUFFIX`, `lib/edgarName.ts`):
      - Aktiengesellschaft (the word "AG" abbreviates), KGaA, Sociedad Anónima, S.A.A., B.V., PCL
        and Societas;
      - the Danish and Turkish A/S, written "A S" or "A.S".
      - **The result:** "DEUTSCHE BANK AKTIENGESELLSCHAFT" is "DEUTSCHE BANK", "Fresenius SE & Co.
        KGaA" is "Fresenius", "YPF SOCIEDAD ANONIMA" is "YPF" and "NOVO NORDISK A S" is "NOVO NORDISK".
      - **Every name-based source asks by the new name:** GDELT, the Justice Department's title
        search, the SEC's and the Federal Register's title rules, and headline scoring.
- **Measured** on the committed index (10,429 rows): **17 everyday names change, and no other.**
  The scout counted 14; the spaced "A S" left three more, Novo Nordisk, Turkcell and Anadolu Efes.
  - The 17: Novo Nordisk, Deutsche Bank, Fresenius SE, YPF, Turkcell, Ottobock, Turk Altin
    Isletmeleri, SCHOTT Pharma, Springer Nature, InoBat, LuxExperience, Loma Negra, Cementos
    Pacasmayo, Meridian Mining UK, Com7, Anadolu Efes and TKMS.
  - **SEC releases:** replayed on all 6,894 stored, Deutsche Bank becomes the party in 7, 4 before
    2017, and nothing else changes: 208 matches on 123 companies, 124 before 2017.
    - The 7: its research-conflicts settlement of 2004, the auction-rate settlement of 2009 beside
      Bank of America's and RBC's, its 2015 charge for misstating financial reports, and those of
      2016, 2018, 2021 and 2023.
  - **No name collides:** none of the 17 new names is shared by another listed company, and none is
    the start of a bigger company's name (`outrankingNameFor`). "Fresenius Medical Care" in a title
    stays FMC's, by the longer-name rule.
- **The word lists rebuilt** (`npm run sync:word-names`, one request for the ENABLE list):
  - Six new one-word names (Fresenius, InoBat, LuxExperience, Ottobock, TKMS, YPF) join the
    non-words, so GDELT's month walk no longer holds them back.
  - "KGAA", "BV", "SOCIEDAD" and "ANONIMA" leave the shared-word counts.
  - Nothing else in either file changed but the date the list was read.
- **Nothing to re-read by hand:** the GDELT months and Federal Register years are kept by the names
  they were asked under, so a corrected name is asked afresh on its own.
- **YPF in GDELT:** under five letters and no English word, so it is asked bare, as IBM is, its
  articles kept only when the headline names it. The filed entry expected its legal form.
  `check:short-names`' count of the 1,500 largest companies' short names moves from 104 to 105 (57
  bare, 48 with a legal form).
- **Left for the next audit, as batch 79 noted:** whether "deutsche" alone should stay among Deutsche
  Bank's scoring names.
- **Checks:**
  - 10 new cases in `check:recall` (59 in all), and its index-wide check now knows the long forms.
    On main the cases fail and that check finds 17.
  - 1 case in `check:sec-press` (56 in all), on two more real releases added to its fixture: 2015-99
    lands on Deutsche Bank, and 2009-127 on it, Bank of America and RBC. It fails on main.
- **Docs:** README and COVERAGE-MAP give the new counts.
- **Requests made:** raw.githubusercontent.com 1, the ENABLE word list for `sync:word-names`.
- `npm run check` passes and `npm run lint` is clean. HawkScan was not run: `HAWK_API_KEY` is not
  set.

## NC ledger — batch 80: the small-business reports and the 1990s tender offers (2026-11-01)

The first of the five proposals the owner approved on 2026-11-01 (#1), with the pick: groups (a),
(b) and (c), and SB-2 and 10-12B. This batch also carries the scout's FILE pass, which filed all
five approved proposals into "Scope refocus — exchange-traded securities"; it ran after batch 79's
pull request was merged.

- [x] **A smaller company's annual and quarterly reports are kept** (`MATERIAL_FORMS`,
      `lib/secForms.ts`).
      - **Kept:** 10KSB, 10KSB40 and 10QSB, the forms a small company reported on until 2008, written
        without a hyphen, titled "Annual report (10KSB)" and "Quarterly report (10QSB)". They go on
        the Earnings chip, as a 10-K and a 10-Q do.
      - **Their amendments** (10KSB/A, 10KSB40/A, 10QSB/A) are kept as corrections, as a 10-K/A is.
      - **Search:** "10-K" finds a 10KSB, and "10-Q" a 10QSB (`lib/focus.ts`).
      - **The filing list:** a stack's form summary names the new forms (`components/EventList.tsx`).
- [x] **The tender offers before Schedule TO, the amended 10-K405, SB-2 and 10-12B are kept:**
      - SC 14D1 and its amendments, an outside bidder's offer, follow batch 65's file-number rule.
        One the company made about another company carries no file number on its record, and is
        named as its own offer (`DEAL_FORM`, `FOR_ANOTHER_COMPANY`); its amendments make a row a
        month (`MONTHLY_FORM`).
      - SC 13E4, the company's offer for its own shares, reads as SC TO-I does.
      - 10-K405/A is an amended annual report.
      - SB-2 is a small company's registration to sell shares.
      - 10-12B is a registration of shares for an exchange listing.
      - 10-12G stays out, on the owner's call.
- **Measured** on two real records, pinned from the scout's run (no new request):
  - **Eagle Bancorp**'s 1998–2002 go from one report, the 10-Q of 1999-05-14, to 19: 14 10QSB and
    4 10KSB beside it. Its SB-2 of 1997-12-12, the offering its record begins with, is kept as a
    filing.
  - **Dillard's** 1998 offer for Mercantile Stores (SC 14D1, 1998-05-21) reads "Its tender offer for
    another company's shares". Its nine amendments to 1998-08-19 make three rows, one a month.
  - **Dillard's** 10-K405/A of 1995-04-28 is kept as a correction.
  - Across EDGAR the scout estimated 10,000–15,000 small-business rows over 1996–2008 on at least
    464 index companies. They reach a page on its next full read of the older shards, which ingest
    already downloads.
- **Known limit, from the proposal:** a few of these records were shells or blank-check companies
  then (QXO's 2007 10KSB is Trey Resources'). Their reports read under today's name, as those
  records' 8-Ks of the same years already do.
- **Checks:**
  - 10 new cases in `check:sec-forms` (134 in all) on the two records
    (`scripts/fixtures/small-business-records.json`): Eagle Bancorp's 1997–2003 and Dillard's
    1995–1999, every row of each window;
  - 1 in `check:focus` (78 in all);
  - on main, 10 of the 11 fail. The one that passes there checks that the forms still left out
    (S-2, S-8, Form 4…) stay out.
- **Docs:** README's data-sources table and COVERAGE-MAP name the newly kept forms.
- **Fixed on the way:** batch 79's box called Deutsche Bank's legal form "raised before (batch
  74)"; it was batch 73's "Found on the way". The scout's FILE pass noticed it.
- **The scout's FILE pass, for the owner to confirm:**
  - **(4b):** the filed entry also counts "Credit Suisse" as UBS Group's from the day UBS bought it,
    as the proposal did; the owner's words named only the bare "UBS".
  - **(4c):** the entry also keeps the banks' releases off AMUB, UBS AG's notes record, beside GLDI.
  - **(5):** the entry marks Popular, Inc.'s rows in `FED_BANKS` as open, raised before, not approved
    with the source.
- **Requests made:** none.
- `npm run check` passes and `npm run lint` is clean. HawkScan was not run: `HAWK_API_KEY` is not
  set.

## NC ledger — batch 79: a new opportunity-scout run, five proposals for the owner (2026-11-01)

The 2026-10-28 proposals are all built (batches 73–77), and batch 78's audit findings are fixed. So
the `opportunity-scout` read the repository again at `5dc6cb2` and wrote
`docs/proposals/2026-11-01-proposals.md`: five proposals, all **PENDING**, ranked with securities
depth first. Nothing is built in this batch.

- [x] **Owner: mark each proposal `APPROVED`, `REJECTED` or `DEFERRED`** (with a reason for a
      rejection). The scout's second pass then files the approved ones into this checklist.
      ✅ Marked 2026-11-01: all five approved, both new sources (2, 5) included; none rejected or
      deferred. The calls:
      - (1) groups (a), (b) and (c), and of the options SB-2 and 10-12B; 10-12G stays out, a
        registration under section 12(g) rather than for an exchange listing;
      - (4a) "J.P. Morgan" and "JPMorgan" are JPMorgan's names in the release rules' map;
      - (4b) a bare "UBS" is UBS Group's there;
      - (4c) Credit Suisse's releases come off GLDI;
      - all three of (4) apply in the release rules' own map only, never to the names headlines
        are scored by.
      1. `P1` **The small-business reports and the 1990s tender offers.** Ingest already downloads
         these forms, and the form filter drops them: 10-KSB, 10-QSB and 10-KSB40 with their
         amendments; SC 14D1 and SC 13E4, the tender forms Schedule TO replaced in 2000; and
         10-K405/A. SB-2 and 10-12B are optional.
         - In three of EDGAR's quarterly indexes the scout found 1,192 such reports on 464 index
           companies, Take-Two, Axon, XPO and Halozyme among them. Over 1996–2008 it estimates
           10,000–15,000 rows, an estimate, not a count.
         - No new request. **The owner's call:** which groups, as on 2026-10-26.
      2. `P1` **The SEC's litigation releases and administrative proceedings, by the parties their
         captions name.** A new dataset on the same host and under the same licence as the press
         releases, so it is a source decision.
         - In all of 2010 (1,178 rows) the scout counted 25 events on 16 companies; for 21 of them
           no press release names the company that day.
         - It reopens a source the 2026-10-22 note did not shortlist, and says what changed since.
         - **The owner's call:** yes or no on the source.
      3. `P1` **A legal form left in a company's everyday name**, on 14 companies including
         Deutsche Bank, Fresenius SE and YPF. Every lookup asks for "DEUTSCHE BANK
         AKTIENGESELLSCHAFT"; with the fix its SEC releases go from 0 to 7, and about 8 Justice
         Department release days become its own. Raised before (batch 73). Proposed with no owner
         call, since "AG" is already stripped and "Aktiengesellschaft" is the word it shortens.
      4. `P2` **The banks' securities units while they owned them**, under the ownership rule the
         other maps use: Banc of America Securities, Merrill Lynch after 2009, Wachovia, J.P. Morgan
         Securities, Citigroup Global Markets, Morgan Stanley Smith Barney and Morgan Keegan. They
         add 33 SEC releases, 20 of them before 2017; Bank of America goes from 8 to 28.
         - **Three owner calls, all raised before:**
           - (a) "J.P. Morgan" and "JPMorgan" as JPMorgan's names, 8 more releases;
           - (b) a bare "UBS" for UBS Group, about 18 releases;
           - (c) Credit Suisse's 7 releases taken off GLDI, its notes record, which would leave them
             on no page.
      5. `P2` **The Federal Reserve Board's press-release feed, as a source decision.** One file a
         day for every bank: 157 of its 463 approvals of bank applications name an index company as
         the applicant, on 89 companies (83 before 2017), and 34 policy releases name a large bank.
         Every match needs reading by hand; one namesake is known (Fortis). It also covers Popular,
         Inc., missing from the Fed map. **The owner's call:** yes or no on the source.
- **Checked here:**
  - `lib/sec.ts`'s form filter (`wanted`, line 869) has no 10-KSB, 10-QSB, SC 14D1 or SC 13E4.
  - `commonName("DEUTSCHE BANK AKTIENGESELLSCHAFT")` returns the name unchanged.
- **Not ranked, in the file's "Considered and cut":**
  - Fresenius Vial's one recall;
  - the Form 25 / 25-NSE labels, which belong to the code-auditor;
  - the CFPB's 386 enforcement actions, suggested for the next run.
- **Found on the way, for the next audit:** Deutsche Bank's headline-scoring names include
  "deutsche" and "aktiengesellschaft".
- **Requests made by the scout:** 28 in all, sec.gov hosts paced at about one a second:
  - www.sec.gov 18 (three quarterly form indexes, 13 enforcement-listing pages for 2010, 2 for 2004);
  - data.sec.gov 4;
  - www.justice.gov 4;
  - www.federalreserve.gov 1;
  - www.consumerfinance.gov 1.

  All with the project's User-Agent, which carries the owner's contact address.
- `npm run check` passes and `npm run lint` is clean. Nothing in the code changed.

## NC ledger — batch 78: the audit of batches 72–77, and its four findings fixed (2026-10-30)

The `code-auditor` read batches 72–77 (`3243d71..1353574`). Its report is
`docs/audits/2026-10-30-code-audit.md`. It found the mechanics sound: the SEC year walk and its
tables, the 14 foreign banks, the sold vehicle brands, N-30B-2 and the counts in the docs all held
on real data. It also found four defects in which company a release or action belongs to. All four
were reproduced here and are fixed, each with cases that fail on main.

- [x] **1. Prudential Financial's $600 million settlement landed on Prudential plc** (`lib/sec.ts`,
      `lib/doj.ts`, `lib/secPress.ts`), `P2`:
      - **The defect:** SEC release 2006-145, "Prudential to Pay $600 Million in Global Settlement of
        Fraud Charges…", went on PUK's page scored 0.95. Its text names "a … subsidiary of Prudential
        Financial, Inc." PUK's everyday name is "PRUDENTIAL", which only Prudential plc has, so the
        shared-name guard let it through. The Justice Department rule ran the same test.
      - **The fix:** a short name that begins a bigger listed company's everyday name
        (`outrankingNameFor`) counts only with a legal word of its own after it (`outrankedName`).
        "Bigger" means ranked above it in the committed index, which keeps the SEC's order, roughly by
        size, as the search's name-prefix rung already relies on. "Prudential" begins "Prudential
        Financial", ranked above it, so "Prudential to Pay" is neither company's. "Prudential plc" or
        "Crown Holdings to Pay" (beneath Crown Castle) still is. "Apple" stays Apple's, above Apple
        Hospitality REIT. Both the SEC and the Justice Department rules apply it.
      - **Measured:** replayed on all 6,894 stored releases against every company in the index, it
        removes exactly 12 matches and no other:
        - Prudential's;
        - 11 that said only "UBS" and sat on UBS AG's record, which issues UBS's exchange-traded notes
          (AMUB). Batch 74 had already said the bank's actions belong to UBS's page, not the notes'.
          UBS Group's page still knows only "UBS Group", so they land on no page (known since
          batch 74).
        - 55 companies in the index have such a name. None of them has a stored Justice Department
          release in the local databases.
      - **Already stored:** the SEC step adds links and never removes them, so a database that had
        linked one of the 12 would keep it. No database here holds PUK or AMUB.
- [x] **2. A headline joining two parties with a comma landed only on the second** (`lib/doj.ts`
      `namedAsSubject`), `P3`:
      - **The defect:** "Morgan Stanley, Citigroup Charged With Misleading Investors About Forex
        Trading Program" (2017-30) reached Citigroup only. Barclays (2016-16), BOK Financial (2016-182)
        and Freddie Mac (2007-205) missed their own charges the same way.
      - **The fix:** the subject test now accepts a comma where it already accepted "and": the name,
        a comma, up to four more words, then the verb. The guards on "Former" and "who" are
        unchanged. Replayed on all stored releases, it adds exactly those four and nothing else.
        Morgan Stanley's page now has 14.
- [x] **3. BBVA's map left out Compass Bank, the US bank it bought** (`lib/fedActions.ts`), `P3`:
      - **The defect:** the Board's row 1224, a civil money penalty against "Compass Bank, Birmingham,
        Alabama" of 2009-09-21, landed on no page. Batch 74's own rule is "a US bank it bought from the
        day it did".
      - **The fix:** Compass Bank, Birmingham, counts for BBVA from 2007-09-07 to 2021-05-31.
        - "BBVA announces that it has completed today its acquisition of Compass Bancshares Inc."
          (its 6-K filed 2007-09-07).
        - "BBVA has completed the sale to The PNC Financial Services Group, Inc. of 100% of the capital
          stock of its subsidiary BBVA USA Bancshares, Inc." (its 6-K filed 2021-06-01).
        - The city keeps out a namesake elsewhere.
        - The Board's other Compass rows are against people, which the map leaves out.
      - **Measured:** BBVA 3 actions, not 2; 110 events on the 39 banks, 79 before 2017.
- [x] **4. A company's first ingest asked for SEC releases before it had prices** (`scripts/ingest.ts`),
      `P3`:
      - **The defect:** prices were read last, so the SEC step found no first price, stored nothing,
        and logged "empty". That counts as read for a day. The Federal Register years and GDELT's
        months, which also begin at the first price, found none on that run too.
      - **The fix:** the price step is now its own helper, `companyPrices`, called before any of them.
        It works as before, under its own window, back-off and log.
- **Not done, and why:**
  - **Credit Suisse's 7 releases on GLDI.** They sit on Credit Suisse AG's record, the issuer of its
    exchange-traded notes. Batch 74's convention keeps a bank's actions off its notes' page. But no
    name rule here tells a notes record from the bank, and the record is the same legal entity. So
    it is left for the owner's call, as UBS Group's missing "UBS" and JPMorgan's "J.P. Morgan" are.
  - **The other known items the audit confirmed:** Deutsche Bank's "Deutsche Bank" headlines, and
    Popular, Inc. (BPOP) missing from the Fed map.
- **Set aside, as the audit did:**
  - **Namesakes held off only by the first-price gate:** ITG, Trinity Capital, Lucent, Broadcom, Alcoa,
    Bristow. Each listed after the release; not measured against real prices.
  - **A short parsed page ends a year's walk.** No instance today: the stored years add up to all
    293 pages.
  - **Rio Tinto's 2023 charge reaches neither listing.** It is pinned on purpose.
  - **The current year's stored release count is overwritten daily.** Cosmetic.
- **Checks:**
  - 9 new cases in `check:sec-press` (55 in all) on seven more real releases from the listing (its
    fixture);
  - 2 in `check:fed-actions` (44 in all) on the Board's real row 1224, with its counts moved to
    BBVA 3 and 110;
  - on main, the SEC suite stops at its first new case, and the comma and order cases each fail there
    when run alone.
  - The README and COVERAGE-MAP now say 201 SEC releases on 122 companies (120 before 2017, 53 before
    2009) and 110 Fed events.
- **Requests made:**
  - by the audit, 6: www.federalreserve.gov 2, www.sec.gov 2, data.transportation.gov 2;
  - here, 4: efts.sec.gov 2 and www.sec.gov 2, for BBVA's two 6-Ks.

  All with the project's User-Agent, which carries the owner's contact address.
- `npm run check` passes and `npm run lint` is clean. HawkScan was not run: `HAWK_API_KEY` is not
  set.

## NC ledger — batch 77: the brands Ford and GM sold, on their pages while they owned them (2026-10-30)

The last of the five proposals the owner approved on 2026-10-29 (#5), with its call: a brand Ford
or GM owned counts for it until the day it sold the brand.

- [x] **A vehicle maker can end** (`RecallMaker.to`, `lib/recalls.ts`): a brand a company sold
      stops counting the day it left, as a sold business does in the FDA and Federal Reserve maps.
      Both adapters ask for a dated maker only between its days, through one shared condition
      (`makersWhere`), and check every row against the same days whatever the dataset answers
      (`heldOn`), recalls by the day the report arrived and investigations by the day they opened.
- [x] **Ford's page carries Volvo, Jaguar and Land Rover while Ford owned them**, every day from
      Ford's own filings:
      - Volvo Car USA, from the purchase of AB Volvo's car business on 1999-03-31 (Ford's 10-K filed
        2001-03-22) to 2010-08-01; on 2010-08-02 Geely bought Volvo Car Corporation and Volvo Cars
        of North America (Ford's 8-K filed 2010-08-02).
      - Land Rover, from the purchase from BMW on 2000-06-30 (the same 10-K) to 2008-06-01; "The sale
        was completed on June 2, 2008" (Ford's 8-K filed 2008-06-02). The dataset files Rover's and
        BMW's earlier Land Rover recalls and Tata's later ones under the same name; they stay out.
      - Jaguar Cars, Ltd., from 1990 — Ford's figures "include Jaguar sales since 1990" (its 10-K filed
        1994-03-21, the oldest on EDGAR, which gives no closer day) — to the same sale. Its two 1990
        recalls under the importer's older name, "Redundant JAGUAR ROVER TRIUMPH INC.", count too:
        NHTSA's own campaign records list them as Jaguar XJS and XJ12 cars.
- [x] **GM's page carries Saab from 2000-01-28 to 2010-02-22.** "On January 28, 2000, GM completed
      the acquisition of the remaining 50% of Saab Automobile AB from Investor AB" (old GM's 10-Q filed
      2000-05-15); "Spyker Cars Finalizes Purchase of Saab Automobile from GM", 2010-02-23 (GM's 8-K
      filed 2010-03-05).
      - Before 2000 GM held half of Saab, a joint venture it carried at equity ("lower equity losses
        from Saab Automobile AB", old GM's 10-K filed 2000-03-13), so Saab's earlier recalls stay
        out, as joint ventures do in the other maps.
      - Saab's Swedish reorganization kept it off GM's books from 2009-02-20 to August 2009 (GM's 10-K
        for 2009) while GM still owned it. The owner's rule counts a brand until it was sold, so the
        months count; nothing in either dataset falls in them.
- [x] **A sold brand's title names it**: "Recall of 220,407 Volvo vehicles: ISOFIX guide", "NHTSA
      opened an engineering analysis (Saab): Engine stall". Today's Ford page would otherwise show
      a Volvo recall as a Ford one. The brand's own name in the subject (`VOLVO/`, `GM/SAAB/`,
      `SAAB\`) is dropped, as the maker's own name already was. Makers a company still owns are
      unchanged; the check holds that a maker names a brand exactly when it has an end day. "ISOFIX"
      keeps its capitals.
- **Measured** on the two datasets 2026-10-30, through the map: Ford's page gains 56 recalls at the
  10,000-vehicle floor (Volvo 30 from 1999-08-30 to 2009-12-18, Jaguar 11 and 2 under the older name
  from 1990-02-08, Land Rover 13 from 2000-10-16 to 2008-02-05) and 29 investigations (Volvo 17,
  Jaguar 6, Land Rover 6), beside its own 861 recalls. GM's gains 12 recalls (2001-05-18 to
  2008-04-09) and 9 investigations. All fall before 2011, in the years before GDELT reaches.
  - Not mapped: Jaguar Land Rover North America (41 large recalls, all after the sale); Aston
    Martin, Ford's until 2007, which has no recall at the floor and no investigation; Mazda, of which
    Ford owned 33.4% and accounted for "on an equity basis" (its 10-K filed 2001-03-22); and Isuzu
    and Fuji Heavy Industries (Subaru), which old GM carried at equity, 20% of Fuji (its 10-K filed
    2001-03-07). None was most of the company.
- 21 new cases in `check:vehicle-recalls` (74 in all) on real rows pinned 2026-10-30
  (`scripts/fixtures/nhtsa-sold-brands.json`), on both sides of every purchase and sale day and
  under the brands' later owners' names: a Volvo recall of 2003 lands on Ford and those of 1998,
  2011 and 2016 do not; a Land Rover recall of 2004 lands on Ford and BMW's of 1999, one two days
  after the sale and Jaguar Land Rover North America's of 2015 do not; a 2004 Saab recall lands on
  GM and one of 1999 does not; and likewise for an investigation of each. 15 fail on main; the six
  that check a row stays out pass there too, as nothing is added there. A `check:live` assertion:
  Ford's live Volvo recalls are about 30 and none outside its days.
- **Requests made:** data.transportation.gov 8 (the makers' names, their recalls at the floor, their
  investigations and the 1990 importer rows; then Ford's and GM's recalls and investigations live
  through the map); api.nhtsa.gov 2 (the makes of those two recalls);
  EDGAR 27 (efts.sec.gov 11, www.sec.gov 12, one a wrong path, data.sec.gov 4). All with the
  project's User-Agent,
  which carries the owner's contact address. No new source, key, licence or recurring cost: the
  brands join each company's one daily query.
- `npm run check` passes and `npm run lint` is clean. HawkScan was not run: `HAWK_API_KEY` is not
  set.

## NC ledger — batch 76: FDA recalls for Siemens Healthineers and Fresenius SE (2026-10-30)

The fourth of the five proposals the owner approved on 2026-10-29 (#4), with both of its calls.

- [x] **Siemens Healthineers' page carries its FDA recalls from its listing** (`FDA_FIRMS`,
      `lib/fdaRecalls.ts`): Siemens Medical Solutions USA and Siemens Healthcare Diagnostics (with
      Siemens Healthcare GmbH) from 2018-03-16, and Varian Medical Systems from its purchase on
      2021-04-15 (Varian's 8-K filed that day). The owner's call (option a): before the listing the
      business was Siemens AG's, which has no page here, so those recalls are on no page.
      - The day is the one the map takes from somewhere other than an SEC filing, since the
        company's record holds only the depositary's F-6EF filings. Its Annual Report 2018, read
        from its own site: "On March 16, 2018, Siemens Healthineers AG successfully performed its
        stock market debut by trading its shares for the first time on the Regulated Market (Prime
        Standard) of the Frankfurt Stock Exchange." The check holds this as the one exception.
      - Siemens Hearing Instruments, which Siemens AG sold in 2015, is not the company's.
- [x] **Fresenius SE's page carries Fresenius Kabi's recalls, and FMC's while it controlled FMC**:
      Fresenius Kabi (USA and Compounding) as its own, and Fresenius Medical Care, NxStage among it
      from FMC's purchase on 2019-02-26, until 2023-11-29. The owner's call: on 2023-11-30 FMC
      converted to an AG "and Fresenius KGaA completed the deconsolidation of Fresenius Medical
      Care AG" (its 13D/A filed 2023-12-07); before, it "owned 100% of the equity of the General
      Partner" and held 32% of the shares. So here the rule for a listed unit, both companies'
      while the parent holds most of it, reads "while the parent controls it". FMC's own entry is
      unchanged and still refuses Kabi.
      - NxStage's recalls are FMC's from 2019-02-26 under the map, so they count for Fresenius SE
        too until 2023-11-29, as FMC's own; the proposal had left that reading open.
- **Measured** live on openFDA 2026-10-30, through the map: Siemens Healthineers 298 recalls, the
  first 2018-03-21, 2 with a Class I product, Varian's 2022-03-21 recall among them (its only one
  since the purchase); Fresenius SE 125, 103 before 2023-11-30 and 45 before 2017, 29 with a Class
  I product: Kabi's 58 and FMC's 67 from before 2023-11-30. FMC keeps its 91.
  - Not mapped: Fresenius Vial (one recall, 2017), which no filing here ties to either company.
- 6 new cases in `check:fda-recalls` (61 in all) on real records pinned 2026-10-30, each on both
  sides of its day; on main they cannot run, the two companies being unmapped. The citation case
  now reads a 13D/A as an SEC filing and holds Siemens Healthineers' listing as the owner's one
  exception. A `check:live` assertion for both companies.
- **Requests made:** api.fda.gov 38 (firm names, the boundary records, and the three companies
  through the map; two answered with a server error and were asked once more); EDGAR 6 (efts.sec.gov
  3, www.sec.gov 3); www.siemens-healthineers.com 4 and its asset host 1, the 2018 annual report.
  All with the project's User-Agent, which carries the owner's contact address.
- `npm run check` passes and `npm run lint` is clean. HawkScan was not run: `HAWK_API_KEY` is not
  set.

## NC ledger — batch 75: QQQ's annual reports on its page (2026-10-30)

The third of the five proposals the owner approved on 2026-10-29 (#3).

- [x] **A unit investment trust's annual report is kept** (`lib/sec.ts`, the fund form list and
      its labels; `REGISTRANT_FORM`, `lib/secForms.ts`). QQQ files its annual report as N-30B-2,
      which the list left out, so none of its 22 reached its page while SPY's, DIA's and MDY's N-30D
      did. Each is now "Shareholder report (N-30B-2)", typed earnings as the N-30D is, so it sits
      on the Earnings chip, and is read as a fund form, so batch 67's series rule sees it.
      - Measured on QQQ's whole EDGAR record, read 2026-10-30 (259 filings): 22 N-30B-2, filed
        2005-05-16 to 2025-10-24, one for each year to 30 September from 2004 to 2025. All 22 are
        kept; its NSAR-U (19), proxy material (DEFA14A, 35) and 24F-2NT notices (27) stay out, as
        before.
      - The optional older forms the proposal listed (N-Q, NSAR-A, NSAR-B, NSAR-U) are not added:
        the approval did not pick them.
- 5 new `check:sec-forms` cases on QQQ's real record, pinned (`scripts/fixtures/qqq-record.json`);
  3 fail on main, where the form is dropped. `check:relevance`'s fund forms now include N-30B-2,
  scored as a registrant's filing.
- **Requests made:** data.sec.gov 1, QQQ's record, with the project's User-Agent, which carries the
  owner's contact address.
- `npm run check` passes and `npm run lint` is clean. HawkScan was not run: `HAWK_API_KEY` is not
  set.

## NC ledger — batch 74: the Federal Reserve's actions against the foreign banks with pages here (2026-10-30)

The second of the five proposals the owner approved on 2026-10-29 (#2).

- [x] **A foreign bank's page carries the Federal Reserve Board's actions against it and its US
      arms** (`FED_BANKS`, `lib/fedActions.ts`): HSBC, Deutsche Bank, Santander, UBS, NatWest,
      Barclays, SMFG, MUFG, BBVA and the five Canadian banks (RBC, TD, BMO, Scotiabank, CIBC).
      - Each maps the bank, its US holding company and branches, and a US bank it bought from the
        day it did, under batch 69's rule: its own history counts, an acquisition's past never
        does, a unit sold stops the day it left. Every day is read from the bank's own SEC filing:
        - HSBC: Household International (HSBC Finance) from 2003-03-28 (its 6-K of 2009-08-03).
        - Deutsche Bank: Bankers Trust (Deutsche Bank Trust) from 1999-06-04 (its 20-F filed
          2003-03-27).
        - Santander: Sovereign (Santander Holdings USA) from 2009-01-30 (its 6-K of that day).
        - UBS: UBS AG, the listed company until the exchange offer of November 2014 (its 20-F filed
          2015-03-13); Credit Suisse from 2023-06-12 (Credit Suisse AG's 6-K of 2023-09-29).
        - MUFG: Union Bank of California while it held most of it, 62.1% on 2004-06-30 (its 20-F
          filed 2004-09-28), to its sale on 2022-12-01 (its 6-K of 2022-12-02).
        - RBC: Centura from 2001-06-05 (its 40-F filed 2002-12-27) to its sale to PNC on 2012-03-02
          (its 40-F filed 2012-11-29); City National of Los Angeles from 2015-11-02 (its 40-F filed
          2023-11-30).
        - SMFG: its bank, whose holding company it became on 2002-12-02 (its 20-F filed 2011-07-29);
          NatWest: The Royal Bank of Scotland Group plc until 2020-07-22 (its 6-K of that day).
- **Measured** on the Board's two files read 2026-10-30 (2,899 rows, the same as on 2026-10-28):
  37 events on the 14 banks, 27 before 2017, exactly the scout's count bank by bank (HSBC 7,
  Deutsche Bank 7, Santander 4, UBS 3, NatWest 3, Barclays, SMFG, MUFG and BBVA 2, the Canadian
  banks 1 each). Eight carry a penalty of $100 million or more. The 25 US banks keep their 72, so
  the map carries 109 on 32 of its 39 banks, 78 before 2017; no row lands on two banks.
  - Refused, all in the files: Bankers Trust's agreement of 1994, before Deutsche Bank bought it;
    the Des Moines Bankers Trust of 1991 and Community Bankers Trust of Glen Allen; Newark's City
    National Bancshares; the Capital and Tennessee Commerce Bancorps; the Irwin, Highlands and
    Bowling Green Union Banks; Credit Suisse's actions of 2009, 2014 and 2020, before UBS bought
    it.
- 12 new cases in `check:fed-actions` (42 in all) on rows pinned from both files; 11 fail on main,
  where the banks are unmapped. A `check:live` assertion for HSBC's 2012 penalty and for no Bankers
  Trust action before 1999 on Deutsche Bank's page, run here.
- **Found on the way:**
  - Popular, Inc. (BPOP), a US bank holding company with a page here, has three actions in the
    files (Banco Popular de Puerto Rico's of 1999 and 2000, Popular Bank's of 2023) and is not in
    the map; batch 69 mapped 25 others.
  - Credit Suisse AG and UBS AG have records of their own here, as issuers of exchange-traded
    notes (GLDI, AMUB); their actions go to UBS's page, not to those notes'.
  - Batch 73's migration (db/032) had one comment line run past the others' width; re-wrapped.
- **Requests made:** www.federalreserve.gov 4 (the two files, then both again for the live
  assertion); EDGAR 25 (efts.sec.gov 13 full-text searches, www.sec.gov 12 for the filings that
  date the purchases).
  All with the project's User-Agent, which carries the owner's contact address.
- `npm run check` passes and `npm run lint` is clean. HawkScan was not run: `HAWK_API_KEY` is not
  set.

## NC ledger — batch 73: the SEC's own press releases on company pages (2026-10-29)

The first of the five proposals the owner approved on 2026-10-29 (#1, with its new source). The
owner's calls for #4 and #5 are written into their entries for when they are built.

- [x] **A company's page carries the SEC's press releases in which it is the party, back to 1997**
      (`lib/secPress.ts`, `lib/ingest/secPressWalk.ts`, db/032). "SEC Charges Goldman Sachs With
      Fraud in Structuring and Marketing of CDO Tied to Subprime Mortgages" is on Goldman's page;
      "SEC Settles Enforcement Proceedings against J.P. Morgan Chase and Citigroup" (2003) on both.
      - The newsroom lists releases by year, 25 a page, for every company at once, so the listing
        is read once for all of them and kept (`sec_press_releases`, `sec_press_years`). Each past
        year is read once, every page; the current year again a day after its last read, from its
        newest page down to the first release already kept. At most 120 pages a process, 1 s apart,
        a year begun only while 20 pages are left, so none is cut in half; the walk stops at the
        first refusal, and a year is stored only when every page it asked answered.
      - Each company keeps the kept releases whose headline makes it the party, under the names it
        had that year (EDGAR former names count until the day they stopped, `namesForYear`, as in
        the Federal Register walk) and its possessive, from its first price on.
      - The party rule (`secReleaseNamesParty`): the company pays, settles, agrees or is charged —
        the Justice Department rule's subject test, split out of `releaseNamesParty` unchanged as
        `namedAsSubject` (`check:doj` still 45/45) — or the SEC, or its Division of Enforcement,
        charges, sues or sanctions it, or brings proceedings, an action or an order against it.
      - A release's day is the day in Washington: the listing gives a UTC instant, and an evening
        release is the next day in UTC. Its identity is its number and its day: the SEC gave
        2022-123 twice, and the listing shows four releases twice (2006-198 and 2024-3 among them).
      - Registered (SOURCES 27, public information the SEC lets anyone copy, cited to it),
        refreshed daily, scored without the model as a Justice Department release is (0.95),
        credited in the footer and the Terms page; a `check:feeds` line and a `check:live` case.
      - A new `check:sec-press` (46 cases on real rows and a stand-in SEC and database). It cannot
        run on main: the module it tests does not exist there.
- **Measured** 2026-10-29: 293 pages, 6,898 releases, 1997–2026 (95 in 1997, 344 in 2020). Read
  against every company in the index under its current names, 209 land on 122 companies, 125 of
  them before 2017 and 54 before 2009: Morgan Stanley 13, Citigroup 10, Wells Fargo 9, Goldman
  Sachs 8, Bank of America 8. Every match was read by hand, and 22 wrong ones are refused:
  - 6 cities taken for City Holding ("SEC Charges City of Miami"): no "of" after the name;
  - 2 for The Crypto Company ("Crypto Trading Platform Beaxy", "Crypto-Focused Advisory Firm"):
    no hyphen or "-ing" word after it;
  - 6 for Strategy Inc., the SEC's own "Division of Risk, Strategy, and Financial Innovation",
    which the Justice Department rule's "Division of" took for a parent;
  - 1 for Procter & Gamble, "Board Member of Goldman Sachs and Procter & Gamble Charged": a
    release about a company's people;
  - 1 for Take-Two ("Settlement With Former Take-Two Interactive Software, Inc. CEO") and 1 for
    Universal Corp ("Action Against Vivendi Universal, S.A."): no lone word before the name;
  - 5 for names more than one listed company has: "First Bancorp" (the Puerto Rico, North
    Carolina and Maine banks) and Rio Tinto plc's 2023 charge, which Rio Tinto Ltd shares and so
    reaches neither.
  - Before 2000 nothing matches: those years' cases name firms that no longer trade (Smith Barney,
    Livent, Bear Stearns, Informix).
- **On a scratch database** (`chronolens_b73`, a copy of b69), the walk run from the saved pages
  stored 6,894 releases (the four repeats once) in under a second, and a second walk asked nothing.
  Of its 17 companies, Boeing, IBM, Pfizer and UPS got 1 each and JPMorgan 2, the 2003 one by its
  former name J P MORGAN CHASE & CO; GM's and Tesla's prices there begin in 2025, so their older
  releases wait for their full price history, and the two funds have no prices. Each is stored as
  a regulation event scored 0.95 without the model, and JPMorgan's page loads both.
- **Found on the way, for the owner or the next audit:**
  - JPMorgan's releases mostly say "J.P. Morgan" or "JPMorgan" (about 16 since 2003), names its
    record does not carry: Wikidata gives "Chase", which news does not use. Two reach its page. A
    hand-added name would change its news and scoring too, so it is the owner's call.
  - UBS Group's page knows only "UBS Group". The releases' "UBS" (11) reaches UBS AG's record,
    the issuer of its exchange-traded notes (AMUB), which `lib/predecessors.ts` leaves out of UBS
    Group's history on purpose.
  - Deutsche Bank's everyday name keeps its legal form, "DEUTSCHE BANK AKTIENGESELLSCHAFT"
    (`commonName`), so a headline saying "Deutsche Bank" names it nowhere: here, in GDELT or in the
    Justice Department feed.
  - Still open from batch 72: Form 25 and 25-NSE labels.
- **Requests made:** www.sec.gov 297, all with the project's User-Agent, which carries the owner's
  contact address, about one a second: 294 for the year listings (every page of 1997–2026, and
  2010's past its last) and 3 for the live case. The local Postgres was started for the scratch
  database and stopped again.
- `npm run check` passes (52 suites with the new `check:sec-press`) and `npm run lint` is clean.
  HawkScan was not run: `HAWK_API_KEY` is not set.

## NC ledger — batch 72: a new opportunity-scout run, five proposals for the owner (2026-10-28)

The 2026-10-26 proposals are all built (batches 63–70), and batch 71's audit findings are fixed. So
the `opportunity-scout` read the repository again at `3243d71` and wrote
`docs/proposals/2026-10-28-proposals.md`: five proposals, all **PENDING**, ranked with securities
depth first. Nothing is built in this batch.

- [x] **Owner: mark each proposal `APPROVED`, `REJECTED` or `DEFERRED`** (with a reason for a
      rejection). The scout's second pass then files the approved ones into this checklist.
      ✅ Marked 2026-10-29: all five approved, the new source (1) included; none rejected or
      deferred. The calls: Siemens Healthineers' recalls count from its 2018 listing (4, option a);
      Fresenius SE's control of FMC counts until 2023-11-30 (4); a brand Ford or GM owned counts
      until the day it was sold (5). The scout's FILE pass put each into "Scope refocus —
      exchange-traded securities", the `P1` after the last `P1` there and the four `P2`s at the
      section's end.
      1. `P1` **The SEC's own press releases naming a company as the party, from 1998.** A new
         source, so the owner's yes first; the licence is quoted in the file. In 2010 and 2003 the
         scout counted 8 and 10 releases whose party has a page here. The Justice Department
         adapter's party rule would keep only 4 of them without the SEC's own wording ("SEC
         Charges X").
      2. `P2` **The Federal Reserve's actions against the foreign banks with pages here:** 37 action
         days on 14 banks (HSBC, Deutsche Bank, UBS, Barclays, NatWest…), 27 of them before 2017.
         No new request: the same two files. BNP Paribas, Standard Chartered and Société Générale
         are not in the company index, so they stay out.
      3. `P2` **QQQ's 22 annual reports.** They are filed on form N-30B-2, which the fund form list
         leaves out. SPY, DIA and MDY file theirs as N-30D, which is kept. One form.
      4. `P2` **FDA recalls for Siemens Healthineers and Fresenius SE, with two calls for the owner:**
         from when Siemens Healthineers' 726 recalls count (413 before its 2018 listing), and
         whether Fresenius SE's control of FMC until 2023-11-30 makes FMC's recalls also its own.
         Fresenius Kabi's 58 can be mapped either way.
      5. `P2` **The vehicle brands Ford and GM owned, while they owned them, with one call for the
         owner:** Ford's Volvo, Jaguar and Land Rover, about 56 recalls and 28 investigations; GM's
         Saab, about 12 and 9. The FDA and Fed maps already count a sold business until it left.
- **Checked here:**
  - The fund form list in `lib/sec.ts` has no N-30B-2. EDGAR's record for INVESCO QQQ TRUST,
    SERIES 1 lists 22 of them, from 2005-05-16 to 2025-10-24.
  - HSBC, Deutsche Bank, UBS, Barclays and NatWest are in `data/edgar-tickers.json`; BNP Paribas,
    Standard Chartered and Société Générale are not.
- **Found on the way, for the next audit:**
  - `lib/secForms.ts` labels every Form 25 "Delisting notice" and every 25-NSE "Removed from an
    exchange", whatever they remove.
  - The scout's examples: Apple's 25-NSE of 2025-05-22 removed only a note issue; Walmart's
    2025-12-08 Form 25 was a voluntary move off the NYSE.
- **Requests made:**
  - **By the scout:** www.sec.gov 28, data.sec.gov 17, api.fda.gov 8, data.transportation.gov 3,
    www.federalreserve.gov 2, apps.occ.gov 2 (both a "Security Redirect"), www.consumerfinance.gov
    1, www.fsis.usda.gov 1 (refused by the container's proxy).
  - **Here:** data.sec.gov 1, the QQQ count.
  - All carried the project's User-Agent with the owner's contact address. The scout started
    Postgres for read-only queries and stopped it again.
- `npm run check` passes (51 suites) and `npm run lint` is clean; no code changed.

## NC ledger — batch 71: the audit of batches 62–70, and its three findings fixed (2026-10-28)

The `code-auditor` read batches 62–70 (`5e2a1f7..0da40a1`). Its report is
`docs/audits/2026-10-28-code-audit.md`. It found the mechanics sound (the bank map, the fund series
split, acceptance times, the deal-form rule, and the counts in the docs all held on real data) and
three defects in the rules that decide what a document is. All three were reproduced here and are
fixed.

- [x] **1. The Federal Register year walk read every company back to 1994** (`lib/ingest/frBackfill.ts`):
      - **The defect:** under today's name, and years before the company existed. Dow Inc., listed
        2019, kept 2010's "Dow Jones & Company, Sharon Pennsylvania Print Plant…" notice and three
        "Dow Corning Corporation" zone notices, scored 0.95 as its own. News Corp, whose EDGAR record
        begins 2012, kept the old News Corporation's 2001 TV-stations antitrust case. Carrier kept
        eight 1994–2011 notices from when Carrier Corporation belonged to United Technologies. A year
        once read is never read again.
      - **The fix:** years now start no earlier than the company's first price, as the GDELT month
        walk's do, and a company with no prices is not asked.
      - **Already stored:** what an earlier walk kept from before the first price comes off the
        company on its next walk ("unlinked N documents from before its first price"). The rows stay;
        none of the local databases holds such a row.
      - **Not done:** the audit's second suggestion, refusing a one-word name followed by another
        proper noun. Measured live, Dow Inc.'s 2019–2025 years keep no Dow Jones notice. They keep one
        "Dow Corning Corporation" notice, of 2021-12-14, and that one is Dow's: Dow Chemical has owned
        all of Dow Corning since 2016. The rule would have dropped it, and "The Dow Chemical Company"
        too. The batch 63 known limit (a former unit's name, as Union Pacific Resources) stands.
- [x] **2. Ford's preliminary special-items notice was typed as earnings** (`lib/secHeadlines.ts`):
      - **The defect:** "Ford Provides Update on Certain Special Items for FY2021 Results" (8-K 7.01,
        2022-01-18) passed batch 64's results rule on "FY2021 Results". Ford's page carried two FY2021
        earnings events, and a −7.92% day's caption named the notice as earnings.
      - **The fix:** "special items" and "update on" now join the owner's not-results words, beside
        "preliminary" and "expects".
      - **Already stored:** a filing's type is rebuilt from EDGAR on every refresh and its owning
        source updates the stored row, so Ford's row reads as a filing again on its next refresh.
- [x] **3. The routine-notice rule grouped CSX's Conrail control case** (`lib/frCompany.ts`):
      - **The defect:** the Federal Register gives 1990s titles with their words run together where
        a dash was ("…Norfolk Southern Railway CompanyControl and Operating Leases/Agreements Conrail
        Inc."), so `control` had no word boundary. 8 of the 19 Conrail notices of 1997–98 were
        folded into "Surface Transportation Board: N routine notices" rows. So was the board's 2017
        listening session on CSX's rail service, a "Joint Petition of…", since only "petition for"
        was kept.
      - **The fix:** a title is read with its run-together words apart before the not-routine test,
        and any petition keeps its row.
      - **Replayed on CSX's 572 stored rows:** its page goes from 330 rows to 339, the 9 regained
        exactly the 8 Conrail notices and the hearing.
- **Set aside by the audit, not defects:**
  - two exports with no production reader (`MONTHLY_FORM`, `isInvestigation`);
  - 4 of 1,325 acceptance stamps that fall well after the filing's date;
  - "$61.93 million" rounding;
  - made-up "Schedules … Earnings Release" headlines that pass the rule, with no real instance;
  - a company first held late in a busy year waiting until January for that year's older documents.
- **Checks:**
  - `check:fr-backfill` 39 → 44:
    - Dow Inc., listed 2019, is asked only 2025–2019, never 2010;
    - a company with no prices is not asked;
    - an earlier walk's pre-listing rows come off it, and none come off Ford, listed 1972;
    - the run-together 1997 Conrail titles keep their rows;
    - so does the 2017 joint petition.
  - `check:sec-headlines` 266 → 267: Ford's special-items headline is not results.
  - On main, all five new cases fail.
  - `npm run check` passes (51 suites) and `npm run lint` is clean.
- **Requests made:** 7 to the Federal Register (Dow Inc.'s 2019–2025 years, for the measurement
  above). The audit itself made 9: 4 to the Federal Register, 1 to federalreserve.gov and 4 to SEC
  EDGAR. All carried the project's User-Agent with the owner's contact address. Postgres was
  started for read-only queries on the scratch databases.

## NC ledger — batch 70: FDA recalls for the next health-care makers (2026-10-27)

The last of the eight proposals the owner approved on 2026-10-26 (#8). A scan of openFDA's biggest
recalling firms found, before any new company, that the map missed whole units of companies it
already covered. Both are fixed here.

- [x] **Units the map missed, on companies already mapped** (same live records, old map against new):
      - **Teleflex +95:** "Arrow International" files under its own name. The map asked for
        "Teleflex" alone, while its note said Arrow was included. 108 → 203.
      - **Stryker +137:** Howmedica Osteonics 48, Mako 21, Physio-Control 21, Wright Medical 16,
        Tornier 15, K2M 10, Sage 5, Inari 1. Each bought firm counts from the day its deal closed
        (Stryker's 8-Ks of 2013-12-17, 2016-04-01, 2016-04-05, 2018-11-09, 2020-11-16 and
        2025-02-19). Wright's and Inari's earlier recalls were their own. 330 → 467.
      - **BD +108:** CareFusion from 2015-03-17 (8-K). Its respiratory units (CareFusion 203, 207
        and 211) count only until BD sold control of them on 2016-10-03 (10-K for 2016). 268 → 376.
      - **GE +60, GE HealthCare +58:** the healthcare business also files as GE Medical Systems,
        OEC, Vingmed, Datex-Ohmeda and "General Electric Med Systems". Each name is in GE
        HealthCare's 10-K for 2022 (Exhibit 21) and splits at the spin-off as "GE Healthcare" does.
        GE HealthCare 22 → 80.
      - **J&J +25:** The Anspach Effort, Synthes's since 2010 (J&J's S-4 of 2011), J&J's with
        Synthes from 2012-06-14.
      - **Baxter +2:** Hillrom and Welch Allyn from 2021-12-13 (8-K).
      - **Zimmer Biomet +2 −1:** Paragon 28 from 2025-04-21 (8-K). Its spine and dental units are
        no longer its after the ZimVie spin-off on 2022-03-01 (8-K), which moves one 2023 recall off
        its page.
      - **BD's biosciences and diagnostics units** ("BD Biosciences", "BD Kiestra"…) stop counting
        for BD on 2026-02-09, when they were spun off and combined with Waters (BD's 8-K of that
        day). No recall under those names has been filed since.
- [x] **33 more companies** (`FDA_FIRMS`, now 71), 1,424 recalls:
      - **The counts:** Danaher 377, Medline 254, ICU Medical 106, Fresenius Medical Care 91,
        Cooper 68, Merit Medical 61, Steris 58, Dr. Reddy's 50, AngioDynamics 45, ConMed 35, Bausch
        Health 33, 3M 28, Amneal 24, Perrigo 20, GSK 19, Sanofi 16, Insulet 15, Integer 14, Church &
        Dwight 13, Envista 13, Tandem 12, Dexcom 11, Kimberly-Clark 11, Unilever 11, Haemonetics 8,
        Globus 7, Dole 6, Haleon 5, Penumbra 4, Enovis 3, Solventum 3, Embecta 2, Bausch + Lomb 1.
      - **Every join or leave date comes from a filing,** an 8-K, 10-Q, 10-K, 20-F or 6-K:
        - **Danaher:** Beckman Coulter from 2011-06-30, HemoCue from 2013-04-09 (Quest's 10-Q),
          Cepheid from 2016-11-04, Nobel Biocare from 2014-12-11. Its dental companies are Danaher's
          until the Envista split-off completed 2019-12-18.
        - **Smaller purchases:** Smiths Medical for ICU Medical from 2022-01-06; NxStage for FMC
          from 2019-02-26; Navilyst for AngioDynamics from 2012-05-22; NuVasive for Globus from
          2023-09-01; DJO for Enovis from 2019-02-22; Paragon Vision for Cooper from 2017-12-01;
          Solta for Bausch Health from 2014-01-23.
        - **Sanofi:** Chattem counts until Sanofi sold control of Opella on 2025-04-30 (20-F for
          2025).
        - **Dole:** Dole Fresh Vegetables is Dole plc's only from the Legacy Dole merger, closed
          2021-08-03, to its sale on 2025-08-05.
      - **A majority-held listed unit is both companies' while the parent holds most of it,** as
        Kenvue was J&J's:
        - **Envista:** from its IPO close on 2019-09-20 to Danaher's split-off.
        - **Bausch + Lomb:** from its IPO on 2022-05-10, still. Bausch Health held about 87% on
          2026-06-30 (its 10-Q).
        - Bausch & Lomb before Valeant bought it on 2013-08-05 is neither's.
      - **Spin-offs split where the names allow it:**
        - **GSK's consumer names** ("…Consumer Healthcare") are GSK's until Haleon's demerger on
          2022-07-18 and Haleon's after.
        - **3M's health care names** are 3M's until the Solventum spin-off on 2024-04-01 and
          Solventum's after. A recall filed as plain "3M Company" since then could be either
          company's and is counted for neither.
      - **Own history before a listing counts:**
        - Medline was private until its IPO.
        - Amneal Pharmaceuticals LLC is Amneal's accounting predecessor (its 10-K for 2018), so its
          pre-2018 recalls are Amneal's. Impax's are not, and none has been filed since 2018.
      - **Look-alikes refused:**
        - Fresenius Kabi (Fresenius SE's) is not Fresenius Medical Care's.
        - Otsuka ICU Medical, a joint venture, is not ICU Medical's.
        - Dole Packaged Foods (Itochu's) is not Dole's.
        - Other firms called Kerr, Leica or Paragon are not the mapped companies'.
- **Now about 6,600 recalls on 71 companies, every one answering live on 2026-10-27:**
  - 4,696 → 6,606 on the same records; before 2017, 1,883 → 2,413.
  - Three are on two pages: Envista's during the overlap, Bausch + Lomb's since its IPO.
  - The map needs 213 requests a day at least (three per company), plus a page per further
    1,000 records, inside openFDA's keyless 1,000.
- [ ] **Not mapped, and why:**
  - **Siemens Healthineers** (726 recalls as Siemens Medical Solutions USA and Siemens Healthcare
    Diagnostics, the most of any unmapped firm): it files nothing with the SEC, so its
    2018 listing has no filing to date it.
  - **Fresenius SE** (Fresenius Kabi): it controlled FMC until 2023, which needs its own dated rule.
  - **Not in the company index:** Olympus, Avanos (Halyard), TreeHouse, Owens & Minor, ZimVie,
    Hologic.
  - **Distributors and others:** McKesson's own-label recalls, Cencora's PharMEDium, Linde's
    Lincare and IBM's Merge Healthcare are other kinds of business, each a next step if wanted.
    Retailers stay out.
  - **Medline's Centurion Medical Products:** its prospectus gives only "2017 to 2020" for the
    purchase, not a day.
  - **No recall since the purchase:** Conagra's Pinnacle Foods, Baxter's Claris, Steris's
    Medivators (Cantel), Danaher's Pall. "Coca-Cola" is mostly independent bottlers.
- **Known limits:**
  - A BD unit filed as "Becton, Dickinson and Company, BD Biosciences" after 2026-02-09 cannot be
    told from BD's own by name.
  - Teleflex sold its OEM business on 2026-08-03 (8-K); none of its recalls is known to file under a
    name of its own.
- **Checks:**
  - `check:fda-recalls` 37 → 55, on 63 more real openFDA records (93 cases):
    - Teleflex's Arrow; Stryker's units on both sides of each date; CareFusion and its
      respiratory units; GE's other names on both sides of the spin-off; Hillrom; ZimVie; Anspach;
    - Danaher, Envista and the dental overlap; FMC against Kabi; ICU against Smiths and Otsuka;
      both Bausch companies; GSK against Haleon; 3M against Solventum; Chattem; Dole; NuVasive;
      DJO; Medline; Amneal;
    - every mapped company is in the company index under its CIK.
  - On main, six of the new cases fail and the run then stops at Danaher, which is not mapped.
  - A new `check:live` case (Teleflex's Arrow event, no Danaher recall before Beckman, none for
    Envista before its IPO) passed against openFDA.
- **Requests made:** about 265 to openFDA, for the scans, every company's live count and the live
  case, and 143 to SEC EDGAR for the dates (full-text search, filing lists, documents). All carried
  the project's User-Agent with the owner's contact address.

## NC ledger — batch 69: Federal Reserve enforcement actions on bank pages (2026-10-27)

The seventh of the eight proposals the owner approved on 2026-10-26 (#7), with its new source. It
needed the hand-checked bank map, built here.

- [x] **A bank's page carries the Federal Reserve Board's actions against it** (`lib/fedActions.ts`):
      cease-and-desist orders, written agreements, civil money penalties, from 1993.
      - **The source:** two keyless files behind the Board's enforcement-action search: 2,514
        actions from 1989-09-25 to 2018-12-26, and 385 since 2019-01-18. Public domain, cited to
        the Board ("Please cite to the Board as the source of the information",
        federalreserve.gov/disclaimer.htm). Both are read once per ingest process, whatever the
        number of banks.
      - **A day's actions against a bank are one row**, titled with what the Board did:
        "Federal Reserve: Cease-and-desist order and $342 million civil money penalty"
        (JPMorgan, 2015-05-20). Two orders on one day are "Two cease-and-desist orders", and an
        amendment names the order it amends by its date. Beneath it: the organisation the Board
        named, and the day each order ended. A link the Board left as "DNE" gives no link.
      - **Only actions against the firm.** One against a person who worked at a bank is not the
        bank's: 29 such actions name JPMorgan, Wells Fargo or Goldman Sachs.
      - **Wiring:** the source is registered as public domain (`fed_enforcement`, SOURCES 26) and
        refreshed daily. It is asked only for mapped banks, scored without the model, and credited
        in the footer and the Terms page.
- [x] **The bank map** (`FED_BANKS`) covers 25 listed bank holding companies, by CIK. Every row of
      both files that matches a pattern, or a broad search for the banks, their predecessors and
      their namesakes, was checked by eye.
      - **The rule is the one recalls and news names follow:** a company's own history counts, and
        an acquisition's past never does. So SunTrust's actions of 2011 to 2019 are not Truist's,
        AmSouth's of 2004 are not Regions', and The Bank of New York's before the 2007 merger are
        not BNY's, as its filings are not. American Express's international bank counts only until
        its sale closed on 2008-02-29 (the company's 8-K of that day).
      - **A namesake needs its city checked.** "Huntington Bancshares, Inc., Huntington, Texas" is
        not Huntington, and no "Citizens" bank in the files is Citizens Financial.
      - **Seven banks with no action yet** (Citizens Financial, KeyCorp, Schwab, Synchrony, Northern
        Trust, Zions, First Horizon) are mapped by their own legal name and home city.
      - **Discover and Comerica** are no longer listed, so they are not mapped. BNY trades as BNY
        now.
- **Measured from the Board's files, 2026-10-27:** 72 events on 18 of the 25 banks, 51 of them before
  2017. The biggest: JPMorgan 10, Citigroup 10, Wells Fargo 7, Goldman Sachs 7, Bank of America 6,
  American Express 5. 25 of the events carry a penalty of a million dollars or more.
- **Live, on a scratch copy of the local database:**
  - JPMorgan's 10 actions were stored once, and a second run added nothing. Each was scored 1
    without the model.
  - All 10 reach its page through the filing and regulation shaping and the 2 MB page bound: 4,092
    of its 11,728 stored events are shown, the 10 among them.
- **Left as is:**
  - **Foreign banks' US arms** (HSBC, Deutsche Bank, Barclays, BNP Paribas, UBS and others), whose
    penalties are among the largest, are not mapped. Each needs its own row-by-row check: a next
    step if wanted.
  - A penalty the recent file gives without an amount reads "civil money penalty"; the amount is in
    its press release.
- **Checks:**
  - A new `check:fed-actions` (30 cases), in the chain, runs on real rows pinned in
    `scripts/fixtures/fed-actions.json`. It covers:
    - Wells Fargo's 2018 order lands on WFC, and JPMorgan's $200 million penalty on JPM;
    - an order and a penalty on one day are one event;
    - the three namesakes, SunTrust, AmSouth and the pre-merger Bank of New York are refused;
    - a person's action is refused;
    - every mapped bank's count is pinned;
    - the source is registered, scored and credited.
  - On main it cannot run: the module does not exist.
  - A `check:live` case (Wells Fargo's asset-cap order, no Huntington, Texas action on HBAN) passed
    against the Board's site, and `check:feeds` reports the source.
  - `npm run check` passes (51 suites) and `npm run lint` is clean.
- **Requests made:**
  - about 10 to federalreserve.gov: the two files, read for the measurements, the live case, the
    feeds report and the two scratch ingests;
  - two to EDGAR, to confirm American Express's sale date;
  - two to Wikidata's API from the ingests.
  All carried the project's User-Agent, which holds the owner's email.

## NC ledger — batch 68: when a filing came out — before the open, or after the close (2026-10-27)

The sixth of the eight proposals the owner approved on 2026-10-26 (#6). It needed no decision.

- [x] **Each SEC filing keeps the instant EDGAR accepted it** (`acceptedAt`, `lib/sec.ts`). The
      submissions record already carried it, and nothing read it. It is stored in
      `events.occurred_at`, a column built for this and never written until now.
      - **The stamp is UTC.** Apple's results 8-K of 2026-07-30 reads "2026-07-30T20:30:28.000Z", and
        its filing page says "Accepted 2026-07-30 16:30:28". January's reads 21:30 UTC, also 4:30
        pm in New York, so daylight saving is the time zone database's, through `Intl`.
      - **Before 2002 most stamps are only a day**, written as exactly midnight New York time: all of
        Ford's 366 filings of 1994 to 2001, and 22 of its 64 in 2002. A midnight-Eastern stamp is
        read as no time. One of Apple's 1994 filings does have a real time, and keeps it.
      - **Rows already stored gain the time on their next ingest.** The time is one of the things
        the owning source may correct, as the date already was (NC-141).
- [x] **The row says when it came out** (`lib/marketTime.ts`): "4:30 pm ET, after the close", "9:16
      am ET, before the open", "9:52 am ET, during trading". The session is 9:30 am to 4 pm,
      Monday to Friday. EDGAR dates a filing accepted after 5:30 pm on the next business day, so
      a time on another day names it: Ford's 10-Q dated 2026-07-29 came out "Jul 28, 7:29 pm ET,
      after the close".
- [x] **Biggest moves never pairs a move with something published after that session closed**
      (`publishedAfterClose`, in `nearestCatalyst`). An event with no time is judged by its date,
      as before.
- [x] **The cached company page moved to v8**, so no cached page from before lacks the times.
- **Measured from EDGAR and the price series, 2026-10-27:**
  - **Apple:** all 45 of its results 8-Ks since 2015 came out after the close. The release day's
    median move is 1.0%; the next session's is 3.5%. On 10 of those 45 release days the stock had
    already moved 2% or more, before the release came out. The proposal gave 0.7% and 3.7%; these
    are this batch's own figures.
  - **Ford:** 29 of its 30 results releases in its recent record (since 2019) came out after the
    close, and one, April 2020's, mid-morning.
- **Live, on a scratch copy of the local database (Apple and Ford ingested with the new code):**
  - 413 of Apple's stored filings and 912 of Ford's now carry a time.
  - **Apple:** 11 of its release days since 2015 moved 2% or more. All 11 were captioned with
    that day's release before; none are now. 10 have no caption, and one has an earlier filing.
  - **Ford:** of 18 such days, 17 were captioned with that day's release before. 5 still are, and
    rightly: until 2017 Ford released before the open (7:19 to 8:16 am). Its after-close releases
    from late 2018 on no longer caption the day before them.
  - Apple's page, served by the dev server, shows the times. 45 rows read "4:30 pm ET, after the
    close".
- **Left as is:**
  - Exchange holidays and early closes are not known: a time on one is read by the clock.
  - Other sources' times (GDELT's `seendate`, Yahoo's `pubDate`) are not read, as the proposal set
    out.
  - A day's prospectus groups carry no time.
  - Chart markers still sit on the filing's own date.
- **Checks:**
  - `check:sec-forms` (now 119) runs on real rows of Apple's and Ford's records: the two Apple
    releases, Ford's next-day 10-Q, a before-open and a during-trading 8-K, April 2020's results
    and the 2001 10-K's midnight stamp. Plus the session edges and the wiring.
  - `check:markers` (now 30): the release day's move is not captioned with that evening's release;
    the next session's is; a filing dated the day after it came out still captions that day.
  - On main both fail: the module does not exist, and the release takes the release day's caption.
  - `check:live`'s Apple case now asks that its newest results 8-K read "after the close". It
    passed against EDGAR.
  - Pinned text in `check:wiring` and `check:page-news` was widened for the new column and the
    cache version.
  - `npm run check` passes (50 suites) and `npm run lint` is clean.
- **Requests made:**
  - about 320 to EDGAR: Apple's and Ford's records, two filing pages, and the two scratch
    ingests, whose headline reader asked 150 each;
  - two to Yahoo's chart for the price series;
  - two to Wikidata's API from the ingests.
  The EDGAR and Wikidata requests carried the project's User-Agent, which holds the owner's email.

## NC ledger — batch 67: a fund's page carries its own fund's filings (2026-10-27)

The fifth of the eight proposals the owner approved on 2026-10-26 (#5). It needed no decision.

- [x] **Each fund series keeps its EDGAR id** ("S000002839" for VOO), in the committed ticker
      index. The sync already read it with the fund's name and dropped it. `npm run sync:tickers`
      ran here: 19,558 series, each with its id. The first run lost one registrant (T. Rowe
      Price's institutional funds, 11 series) to a network error, so it ran again, with no losses.
- [x] **A fund's page carries its own filings, and not its siblings'** (`lib/fundSeries.ts`). A
      fund's CIK is its trust's, and the trust files for every fund it sells. At ingest, the
      fund's own filing list from EDGAR (`browse-edgar?CIK=S…`, a hundred a request) says which
      filings are its own.
      - **Its own** are linked as certain (1.0). They are scored `deterministic-series`, so
        neither ingest's re-score nor `npm run score --rescore` puts the 0.7 back.
      - **A sibling's** is unlinked from the fund alone; the same row stays on the sibling's page.
      - **Measured on the window the proposal used** (2022-12-05 to 2026-08-28): VOO keeps 76 of
        the trust's 432 fund filings (NPORT-P 15 of 181, 497K 16 of 191, 497 29 of 39).
- [x] **The fund's name goes on at read time.** A 497 or a shareholder report often covers several
      funds at once, and one stored row serves every page it is linked to. Titled with VOO's
      name, the row would read as VOO's on VTI's page. So the stored row keeps the trust's name
      and a description that names no fund. The fund's own page shows "Vanguard 500 Index Fund:
      Prospectus update (497)", with "Filed by VANGUARD INDEX FUNDS; EDGAR lists it among this
      fund's own filings" (`asOwnSeriesFiling`, in `loadEvents`). Views that mix several
      companies keep the trust's name.
- [x] **Where the list cannot say, today's hedged row stays:**
      - **Before the list begins.** EDGAR's series lists begin in February 2006: VOO's on
        2006-02-16, Fidelity Contrafund's on the 27th and Vanguard Wellington's on the 24th, though
        their trusts filed from 1994 and 1995. So a trust's older filings are on no fund's list,
        and they keep the trust's title and the hedge. This was found in the live run below:
        without the rule, VOO lost 154 of its trust's pre-2006 filings as "siblings'".
      - **A list read in part.** If a page fails, or the 40-page cap is reached, only the days the
        list reached are sorted. A 503 is asked again twice, 2 and 4 seconds later. `browse-edgar`
        is slow and gave up with a 503 on VTI's first page, minutes after the same request
        answered. A 429 (slow down) is not asked again.
      - **No list at all.** If the first page cannot be read, nothing is sorted. An empty first
        page counts as unread too, so it can never take every filing off a page.
- [x] **A later run whose list fails keeps an earlier run's word.** Between a fund's oldest and
      newest own filing, an earlier read covered every day. So a fund filing of such a day that is
      not linked to the fund now was a sibling's, and it is not linked again
      (`withoutJudgedSiblings`). This uses the links already stored, so it needs no new table.
      - **What it leaves:** a sibling's filing newer than the fund's newest own one is linked
        again, with its hedge, until the list next answers.
- [x] **The ticker sync's two followers ran too, as `CLAUDE.md` says:** `sync:aliases` and
      `sync:word-names`.
      - The new SEC ticker file no longer lists WBD or ABIT, so 6 names went from the alias file:
        "Discovery" ×3, GamePlan, Criteo Technology Services and Westport Innovations.
      - The word-name files changed to match.
      - `check:short-names` pinned 107 short names among the 1,500 largest companies. It now pins
        104, because GDS Holdings, DPC Holdings and VSE moved below the SEC's 1,500th row.
- **Live, 2026-10-27, on a scratch copy of the local database** (VOO and its sibling VTI, both
  held). Main's code first put all 1,753 of the trust's fund filings on each page, hedged. Then
  the new code ran:
  - **VOO:** 1,808 links became 503. 294 are its own, certain and under its name. 1,305 siblings'
    were unlinked, and 154 from before 2006-02-16 kept their hedge.
  - **VTI:** 259 own, and 1,134 siblings' unlinked. Its list read back to 2011-08-25 before a page
    failed three times, so its older filings stayed hedged.
  - **A 2026-06-30 prospectus update tagged to both funds** shows as each fund's own on each page,
    from one stored row.
  - **Then VOO again, with the list forced to fail:** 1,304 siblings' filings stayed off. One newer
    than its newest own filing (2026-09-16) came back hedged, as described above.
- Checks:
  - `check:sec-forms` (now 105) runs against EDGAR's own answers, pinned in
    `scripts/fixtures/voo-series-filings.json`: the trust's record over the window, its 2005 annual
    report, and VOO's whole list served in the feed's own markup. The cases cover:
    - VOO keeps 76 of 432;
    - VB's NPORT-P of 2026-08-28 is not on VOO's page (read from its EDGAR header);
    - the stored row is the same whichever fund writes it;
    - the 2005 report keeps its hedge;
    - a read in part, a 429, a 503 twice, an unreadable list and an empty first page;
    - the earlier read's word on a failed run;
    - the wiring.
  - `check:tickers` (now 108): the index carries one id per series, VOO's is S000002839, and no
    request is made.
  - On main both checks fail: neither the id nor the module exists.
  - `check:live` gained a VOO case and `check:feeds` reports the split; both passed against EDGAR.
  - `npm run check` passes (50 suites) and `npm run lint` is clean.
- Requests made:
  - the two ticker syncs, about 2,330 to sec.gov;
  - about 120 to EDGAR for the measurements, the fixtures and eleven scratch ingests, each of which
    also asked Wikidata's API for the fund's website;
  - one Wikidata alias sync;
  - the ENABLE word list, from GitHub.
  All but the word list carried the project's User-Agent, which holds the owner's email.

## NC ledger — batch 66: NHTSA's defect investigations on carmakers' pages (2026-10-27)

The fourth of the eight proposals the owner approved on 2026-10-26 (#4), with its new source. The
owner made its two calls on 2026-10-27: investigations go under the Recalls tag, and only the
opening is an event.

- [x] **A carmaker's page carries the defect investigations NHTSA opened into it, back to 1975**
      (`lib/investigations.ts`). They come from the same open-data portal as the recalls, the
      dataset "Investigations Data" (`b3rp-be92`). Its licence field reads "Public Domain U.S.
      Government", credited to NHTSA, and it needs no key.
      - They go through the same hand-checked maker map and its dates (`RECALL_MAKERS`), so
        Chrysler's investigations count for Stellantis only from 2014-10-12.
      - Titles say what was opened, never a finding: "NHTSA opened a recall query: Unintended and
        Uncontrolled Acceleration" (Toyota's RQ10003, 2010-02-16).
      - **The owner's calls:** each investigation is one row under the Recalls tag, on the day it
        opened. Its closing goes in the row, with the recall NHTSA links to it: "Closed 2011-03-01;
        NHTSA links it to recall 11V115." An open one says it is still open.
      - **On the chart:** each is a small dot ranked like news, never the R a recall gets. An
        investigation opened is no recall, and Ford alone has 684 (`isMinorRecall`,
        `lib/markers.ts`).
      - **Wiring:** the source is registered and licence-checked (`nhtsa_investigations`, in
        `SOURCES`, the refresh windows and the quota notes). It is asked once a day per mapped
        maker, beside the recalls. Scoring needs no model and gives its own reason. NHTSA is
        credited for its investigations in the footer and the Terms page.
- **Live, 2026-10-27:**
  - 1,766 investigations for 18 mapped companies, 1,579 of them opened before 2017: Ford 684,
    GM 651, Toyota 114, Honda 113, Stellantis 50 (from 2014-10-20), Blue Bird 39, Tesla 28, and
    others.
  - Stored into a scratch database: Ford's 684 went in once, a second run added nothing, and
    each was scored 1 without the model. Ford's Recalls tab now holds 1,545 rows.
- Checks:
  - 14 new cases in `check:vehicle-recalls` (53 in all), on real rows pinned from the dataset
    (`scripts/fixtures/nhtsa-investigations.json`). On main they cannot run: the adapter does not
    exist.
  - A `check:live` case: Toyota's RQ10003, and no Stellantis investigation before 2014-10-12.
  - `check:feeds` reports the source.
  - `npm run check` passes (50 suites) and `npm run lint` is clean.
- Requests made: about 30 to data.transportation.gov (the counts, the fixture rows, and one
  request per mapped maker for the live run), with the project's User-Agent, which carries the
  owner's email.

## NC ledger — batch 65: the SEC forms the 2026-10-18 list missed (2026-10-27)

The third of the eight proposals the owner approved on 2026-10-26 (#3). The owner picked all four
groups on the same day.

- [x] **The forms are kept and named** (`MATERIAL_FORMS`, `lib/secForms.ts`). They were already in
      every submissions record ingest downloads, and the form filter dropped them.
      - **Offerings:** S-3ASR, F-3 and F-3ASR read as shelf registrations, as S-3 does. F-10 is a
        Canadian company's registration. F-1 is a foreign company's registration to sell shares:
        ARM's 2023 listing, NIO's of 2018.
      - **Mergers and tenders:** F-4 is a merger registration, as S-4 is. SC TO-I is the
        company's own tender or exchange offer, and SC TO-T/A an update to a tender offer.
      - **Late-filing notices:** NT 10-K, NT 10-Q and NT 20-F, such as Apple's of 2006 (its
        options review) and NIO's of 2020.
      - **Proxy fights:** PREC14A and DEFC14A, such as Disney's of 2023 and 2024, and DFAN14A,
        the material filed by others in a vote.
- [x] **A busy month is one row.** Disney's DFAN14As (58 in March 2024) and tender-offer updates
      (Pfizer's 8 for Array in July 2019) group a row a month, as busy prospectus months do
      (`pageFilings`). A month with one keeps its dated row.
- [x] **Found on the way and fixed: a company's own bids read as bids for it.** A company's record
      lists the tender offers and proxy fights it made about other companies, as well as those
      about itself. All 46 of Pfizer's SC TO-T and SC TO-T/A filings have no file number in its
      record; the three checked on EDGAR are its offers for Array (2019), Medivation (2016) and
      King (2010), Pfizer the filer and the other company the subject. Disney's 134 DFAN14As carry
      its own file number, 001-38842. Since batch 13, Pfizer's own bids showed on its page as "Tender offer by
      an outside bidder". Now a deal form with no file number is named as the company's own
      (`DEAL_FORM`, `FOR_ANOTHER_COMPANY`): "Its tender offer for another company's shares", and
      for Pfizer's 1999 fight for Warner-Lambert, "Its proxy fight at another company". Large
      stakes follow the same rule (batch 23).
- [x] **Search and the filing stacks read the new forms right.** "Apple 10-K" no longer finds a
      notice that the 10-K will be late, "S-3" finds an automatic shelf too, and "Arm F-1" finds
      ARM's listing, which before this batch was never kept (`lib/focus.ts`). The timeline's
      filing stacks name "NT 10-K" and "SC TO-T/A" as they are, not as "10-K" and "SC TO-T"
      (`components/EventList.tsx`).
- **Live,** on the scratch copy of the batch 42 database:
  - Pfizer's record gave 47 new rows: 6 S-3ASR shelves, 2 SC TO-I offers, 37 SC TO-T/A updates
    (9 monthly rows on its page), a DFAN14A and its 1999 PREC14A. Its 9 stored SC TO-T bids were
    retitled as its own.
  - Apple's gave 10: 5 S-3ASR, 2 SC TO-I buyback offers, its NT 10-K and NT 10-Q of 2006, and a
    DFAN14A.
- Checks:
  - 12 new cases in `check:sec-forms` (66 in all), built on real rows pinned from EDGAR, with
    Disney's and Pfizer's busy months in `scripts/fixtures/sec-form-rows.json`. On main the forms
    are dropped, so these cases fail.
  - 3 in `check:focus`; on main the late notice matches "10-K" and the S-3ASR misses "S-3".
  - "Arm F-1" in `check:prompt`.
  - `npm run check` passes (50 suites) and `npm run lint` is clean.
- Requests made: about 30 to SEC EDGAR (the submission records of ARM, Apple, Disney, NIO, Pfizer
  and UBS, some read twice, Pfizer's and Apple's again for the live run, and three filing index
  pages), with the project's User-Agent, which carries the owner's email.

## NC ledger — batch 64: a results release is earnings, whatever form carried it (2026-10-27)

The second of the eight proposals the owner approved on 2026-10-26 (#2). The owner's call, made
the same day: only reported results count as earnings.

- [x] **A filing whose press release reports a period's results is typed as earnings.** An 8-K's
      item 2.02 already does this. A 6-K says nothing of what it carries, and an 8-K before August
      2004 had no 2.02, so NIO's quarterly results, Novartis's and GSK's, and Boeing's 1997–2004
      results 8-Ks were plain filings: no Earnings chip, no earnings marker, and ranked below
      earnings when Biggest moves picks a move's cause.
      - The rule is `announcesResults` in `lib/secHeadlines.ts`. A headline counts when it names a
        period and a figure and says the company reports them: "NIO Inc. Reports Unaudited Third
        Quarter 2019 Financial Results", "Boeing Reports 1997 2nd Quarter Results". It also counts
        when the figure follows the period directly ("Fourth-Quarter EPS Doubles"), and for
        Novartis's "Financial Results" cover. `asResultsRelease` types the filing where the stored
        headline is put on it (`applyHeadlines`), so the ingest and the first visit agree. The
        description says why: "A results release, counted as earnings."
      - **The owner's call:** a profit alert, a preliminary figure, an expectation, a guidance
        update and a revised forecast all stay filings, shown with their headlines. So do a
        trial's "topline results", a tender's results, a capital-ratio notice, supplementary data,
        a charge, the date of a coming release, and an amended 8-K.
      - **Measured** on every headline stored in the batch 42 and 48 databases (960 filings, ten
        companies), now committed as `scripts/fixtures/results-headlines.json`. Of the 830 on
        filings, it marks 47 and nothing else: NIO 32, Novartis 8, Boeing 4, GSK 2 and Lloyds 1,
        each a results release. It agrees with item 2.02 on 117 of the 130 releases filed under
        it. The other 13 are four charges, a settlement, an acquisition, a guidance update, a
        preliminary figure, a 10-K statement, a table's heading, and three results releases whose
        headlines name a charge or no figure; item 2.02 types those anyway. On the older fixture's
        144 releases it marks 30, every one a results release, including Exxon's "Estimated" style
        and Tesla's quarterly "Update".
      - **Live,** on a copy of the batch 42 database: re-running NIO's filings moved 32 stored rows
        to earnings (8 earnings became 40), and Boeing gained its 4 pre-2004 releases (224 became
        228). Stored rows re-type on their next ingest, as their titles do, because the filings'
        own source owns the row.
- Not covered: a results release whose headline names no period ("Intel Reports First $11 Billion
  Revenue Quarter", "P&G Delivers Strong Sales and EPS Results") stays a filing unless item 2.02
  types it.
- Checks: 11 new cases in `check:sec-headlines`, built on the stored headlines (266 in all now).
  They cannot run on main, which has no `announcesResults`. `npm run check` passes (50 suites) and
  `npm run lint` is clean.
- Requests made: for the live run, SEC EDGAR's submission records for NIO and Boeing, and
  Boeing's older record files, with the project's User-Agent, which carries the owner's email.

## NC ledger — batch 63: a company's Federal Register documents back to 1994 (2026-10-27)

The first of the eight proposals the owner approved on 2026-10-26 (#1). The owner also made the
three smaller calls on 2026-10-26: routine rail-board and utility notices are grouped a row a month
(built here); only reported results count as earnings (#2); and all four groups of SEC forms are
kept (#3). Those two are recorded in their entries for when they are built.

- [x] **A company's Federal Register documents reach 1994, every one a year holds.** Before this,
      the daily ask read from 2015 and kept the newest 40, so every run read the same forty: GM's
      51 since 2015 reached its page as 40, and nothing before 2015 at all.
      - The daily ask now reads the current year, up to 40 (`frDailySince`). Each year from 1994 to
        last year is read once by a new year walk (`lib/ingest/frBackfill.ts`), every page of it,
        and every document whose title names the company is kept. A year that is over is not
        asked again: `fr_windows` (db/031) keeps what was asked. At most 40 years a process,
        1 s apart, newest first, stopping at the first refusal, as the GDELT month walk does.
      - A year is searched under the names the company had then: its EDGAR former names count
        until the day they stopped, read from the rename events the filings step stores.
        Walmart's 1999 and 2002 FTC orders and two 1990s trade-zone notices now arrive under
        "Wal-Mart Stores"; under "Walmart" the feed found none of them.
      - **Measured live 2026-10-27** into a scratch database: CSX's 32 years were read in 38 s and
        565 documents were kept (154 from the 1990s, 206 from the 2000s); a second run asked
        nothing. Across five companies, 1994–2025, the same search and match keep Union Pacific
        775, Duke 614, CSX 565, Ford 130 and Exxon 70, where the old feed kept at most 40 each.
- [x] **Routine notices are grouped, one row a month** (the owner's call). A month with two or more
      routine notices from one of these four agencies becomes one row: the Surface
      Transportation Board, the ICC before it, FERC, or the NRC. The row names how many there are,
      lists the first few, and links to the newest (`pageRegulations`, run when the page is read,
      so the database keeps every notice). A lone notice, and any merger, control case,
      complaint, order, penalty, petition or settlement, keeps its own dated row. CSX, re-read
      live: its 572 stored rows show as 330, with 135 month rows holding 377 notices; the
      1996–97 Conrail merger notices stay dated.
      - The NRC is included by my reading of the question, which named railroads and power
        companies: 231 of Duke's 250 NRC documents pass the routine rule (licence amendments,
        exemptions, environmental assessments). If the
        owner meant only the rail boards and FERC, it is one line in `ROUTINE_AGENCIES`.
      - The label now names the issuing board, not its department. The Federal Register listed a
        rail-board notice under "Transportation Department" first. It also lists the board with
        no parent department (measured), so the rule takes the agency listed after a department
        (`issuingAgency`). A year the walk re-reads corrects a stored row's label; re-read live,
        346 of CSX's rows moved to the board's label (471 now carry it). A current-year row
        stored before this batch keeps the department's label, so it is not grouped until its
        year is over and read.
      - The search link the Federal Register's site uses could not be checked from here (the site
        sends this container to a bot check), so a grouped row links to its newest notice.
- Known limits, not fixed here:
  - "Union Pacific Resources Company", spun off in 1996 and gone by 2000, matches Union
    Pacific's name. A title naming it after the spin-off is not UNP's. This is the existing
    match rule; the older years only make it visible.
  - The sector feed still starts in 2015 (left open in the proposal's entry).
  - A year with more than 10,000 hits would be read only to its tenth page. The busiest year
    measured had 224.
- Checks:
  - A new `check:fr-backfill` (39 checks). It cannot run on main, which has no year walk and no
    grouping.
  - `check:wiring` now asks for the year walk, and checks that the daily ask starts on the current
    year's first day.
  - `check:live`'s Ford case reads 2008 through the year walk (live: 6 documents) and holds the
    daily ask to its window.
  - `check-live-harness` cases are pinned to their dates, so they don't age out with the calendar.
  - `check:macro` and `check:page-news` follow the page's new line.
  - `npm run check` passes (50 suites) and `npm run lint` is clean. Owner: `npm run db:migrate`
    applies db/031 (noted in OWNER-ACTIONS).
- Requests made: about 270 to the Federal Register, for the measurement and the live runs. One to
  SEC EDGAR (Walmart's record), with the project's User-Agent, which carries the owner's email.

## NC ledger — batch 62: a new opportunity-scout run, eight proposals for the owner (2026-10-26)

The work the previous scout run proposed (2026-10-17, proposals 1–10) is all built, and nearly
everything else open waits on the owner. So the `opportunity-scout` read the repository again at
`5e2a1f7` and wrote `docs/proposals/2026-10-26-proposals.md`: eight proposals, all **PENDING**,
ranked with securities depth first. Nothing is built in this batch.

- [x] **Owner: mark each proposal `APPROVED`, `REJECTED` or `DEFERRED`** (with a reason for a
      rejection). The scout's second pass then files the approved ones into this checklist.
      ✅ Marked 2026-10-26: all eight approved, the two new sources (4 and 7) included; none
      rejected or deferred. The scout's FILE pass put each into "Scope refocus — exchange-traded
      securities", the four `P1`s after the last `P1` there and the four `P2`s at the section's
      end. The smaller decisions inside 1, 2 and 3, and the event kind for 4, are asked when each
      is built.
      1. `P1` The company Federal Register feed back to 1994, and past the newest forty.
      2. `P1` A results release counts as earnings whatever form carried it (a 6-K results release,
         Boeing's 1997–2004 results 8-Ks).
      3. `P1` The SEC forms the 2026-10-18 list missed: S-3ASR shelves, F-1 foreign listings,
         late-filing notices, proxy-fight forms, tender-offer results.
      4. `P1` NHTSA defect investigations: a new source, so the owner's yes first.
      5. `P2` A fund's page carries only its own fund's filings, by EDGAR's series tag (it revisits
         NC-139).
      6. `P2` A filing's time: before the open or after the close, from EDGAR's acceptance time.
      7. `P2` Federal Reserve enforcement actions on bank pages: a new source, so the owner's yes first.
      8. `P2` FDA recalls for the next health-care makers (Beckman Coulter, Fresenius, ICU Medical…).
      Several carry a smaller decision inside: which routine rail-board and FERC notices count (1),
      whether profit alerts are earnings (2), which forms (3).
- Found on the way and confirmed here in the code: the company Federal Register feed keeps the
  newest 40 title-naming documents a run and never pages (`FR_COMPANY_CAP`, `lib/frCompany.ts`), so
  a company's 41st-newest document never reaches its page however many runs go by. The scout
  counts GM's 51 since 2015 against 40 kept, Duke Energy's 184. Proposal 1 covers it.
- The scout made about 110 requests to SEC EDGAR with the project's User-Agent, which carries the
  owner's email (EDGAR refuses a request without a contact), and some to the Federal Register,
  openFDA, data.transportation.gov, federalreserve.gov, Wikidata and Wikipedia. Its document says so
  at the top. It started the local Postgres for read-only queries and stopped it again.
- `npm run check` passes (49 suites) and `npm run lint` is clean; no code changed.

## NC ledger — batch 61: the scoring audit's five findings fixed (2026-10-26)

The `code-auditor` read batches 58–60 (`1ac7cdd..10f163a`). Its report is
`docs/audits/2026-10-26-scoring-audit.md`. It found the mechanics sound: across every company in
the index, other feeds' headlines scored 0.9 fell from 83,847 on batch 59 to 10,395. All five of its
findings were reproduced here and are fixed, with the one it found worse than recorded.

`npm run check` passes (49 suites), `npm run lint` and `tsc --noEmit` are clean. `check:ui` was not
run: no page or component changed. HawkScan could not run: `HAWK_API_KEY` is not set.

- [x] **Finding 1 (`P2`): `shortName` put back the generic names batch 60 removed.**
      - "u s" for U S Global Investors named every "U.S." headline.
      - "new york" named New York Times news, "united states" United States Oil Fund's, and
        "morgan stanley" six Morgan Stanley funds'. Lowercase "top clean energy stocks" named Clean
        Energy Fuels.
      - Now a short name names a company only when no other listed company's common name holds it,
        and only written with its capitals, every word's: "American Water", never "american water
        polo". The list is `shortNames` in `data/shared-name-words.json`, written by `npm run
        sync:word-names`: 1,694 of 1,839 short names. Initials make no short name.
      - A name with capitals still has its punctuation folded, over the title's capitalised words
        only: "D.R. Horton" is "D. R. Horton".
- [x] **Finding 2 (`P2`): 70 companies whose ticker is their name escaped the capital rule.** The
      sync skipped the name word along with the ticker. Gap, Ally, Ball, Bill, Dell, Snap and the
      others now keep their capital: "Gender pay gap widens" is no Gap news.
- [x] **Finding 3 (`P2`): `npm run score` and `--rescore` scored with names ingest does not use.**
      - They used the stored search aliases, among them former names news does not keep. Great Elm's
        "Unwired Planet" scored 0.9 there and nothing at ingest.
      - Now every path takes a company's names from `companyScoringAliases`, in the new pure module
        `lib/scoringNames.ts`: ingest, a first visit (which used only the common name), `npm run
        score`, the backfill (through ingest) and `check:feeds`. A first visit still reaches no slow
        source (`check:ondemand`).
      - Tried on a scratch database: the Unwired Planet headline stays unscored.
- [x] **Finding 4 (`P3`): a plain `--rescore` cleared every `--strict-headline` 0.2.**
      - A strict score is now written as `deterministic-strict`. A rescore takes it back only with the
        flag, and ingest's own re-score never: before, a story fetched again also lost its strict 0.2.
      - `scripts/cost-report.ts` counts it free. The README's example gains `--limit`, without which
        a rescore reaches only a subject's newest 500 rows.
      - Tried on a scratch database: the strict 0.2 was left alone by a plain rescore and kept by a
        strict one.
- [x] **Finding 5 (`P3`): "It's" was read as Southern ITS's "Its".** The apostrophe retry leaves a
      contraction alone ("it's", "that's", "here's", …).
- [x] **Worse than recorded: a number named a company alone.** "10" named Bitwise 10 Crypto Index
      ETF in 51 saved headlines, and "40" WD-40 in 13 ("Dow tops 40,000"). A name word with no
      letter is no name now. "Q2" stays: it is Q2 Holdings' name.
- From the audit's set-asides: the Barrick Gold comment (Kinross Gold now) and the "0.8999999762"
  comment are corrected. Left as it left them: "Form 10 Q Apple" opening Qnity Electronics, and the
  re-score check matching source text by design.
- Measured on the saved Yahoo Finance headlines, main against this branch:
  - the 235 companies' own feeds: 2,009 namings either way;
  - other feeds' namings: 1,236 → 1,235;
  - across all 10,443 index companies, other feeds' 0.9s: 10,393 → 9,888, none gained.
- The auditor sent one request straight to EDGAR (Motorola Solutions' record) with the project's
  User-Agent, which carries the owner's email; it says so in its report.
- [ ] **Open:**
      - Batch 60's and 59's: a capitalised word still names; words fewer than five names share still
        name alone; two-letter tickers; and now "Q2".
      - The auditor's suggestion, a `check:relevance` that replays a saved headline set across the
        whole index, is not done: committing some 3,000 third-party headlines needs a licensing look
        first.
- Checks, main → now. On main's code the new ones fail, except the one guarding what main already
  does, and those calling the new functions cannot run:
  - `check:relevance` 76 → 85:
    - findings 1, 2 and 5 and the numbers, on real and audit headlines (fail on main); "Gap raises
      full-year outlook" still names Gap;
    - every path using `companyScoringAliases`, and the strict label (fail on main);
    - the short-name list and Great Elm's scoring names (new functions);
    - batch 59's re-score wiring check follows the new SQL.
  - `check:aliases` (99) and `check:possessive` (15): their wiring checks follow
    `companyScoringAliases`.

## NC ledger — batch 60: a word many companies' names share names none of them alone (2026-10-26)

Batch 59 left open that a word many listed companies share in their names named each of them
alone. This batch measured it on real headlines: 4,165 Yahoo Finance headlines from the feeds of
235 companies (the 200 largest in the ticker index and 38 picked for shared words), read
2026-10-26. A company's own feed is mostly its news and the other feeds mostly not, so the first
measures what a rule costs and the second what it saves. On main, headlines from other companies'
feeds named one of the 235 3,098 times:
- "European Equities Traded in the US as American Depositary Receipts Track Higher" named American
  Airlines, American Tower, American Electric Power and British American Tobacco;
- "AI Chip Demand Gives Linde a New Growth Catalyst" named Bank of New York Mellon, whose name gave
  it "new";
- "…as Gold Slides Back Toward $4,000" named Kinross Gold, and "Investing.com's stocks of the
  week" Amazon ("AMAZON COM INC").

In the ticker index, 406 words are shared by five or more companies' names ("fund" 305, "gold"
130, "american" 52, "new" 36, "companies" 24).

`npm run check` passes (49 suites), `npm run lint` and `tsc --noEmit` are clean. `check:ui` was not
run: no page or component changed. HawkScan could not run: `HAWK_API_KEY` is not set.

- [x] **A word five or more listed companies' names share names none of them alone**, unless it is
      the company's whole name (`SHARED_ALONE` in `lib/enrich/relevance.ts`). Target's "target",
      which five names share, still names Target.
      - The counts are in the new `data/shared-name-words.json`, which `npm run sync:word-names`
        now also writes.
      - A web address's "com" is no word of a name (`nameWords`). It stays a word for search, which
        shares `WEAK_TOKENS`: made weak there, "electric cars" offered Cars.com (`check:tickers`).
- [x] **A company is still named by its common name whole and by its short name.** The whole
      common name is "Southern Copper"; the short name drops its trailing generic words, two words
      at least (`shortName`): "American Water" for American Water Works, "First Citizens",
      "Interactive Brokers".
      - The common name used to be a name only where ingest passed it in; `npm run score` did not.
      - *(Batch 61, the scoring audit: a short name now names the company only when no other
        listed company's name holds it, and only written with its capitals. "U S", "New York" and
        "Morgan Stanley" named every "U.S.", New York and Morgan Stanley headline.)*
- [x] **A name of two words or more names its possessive.** "Is Parker Hannifin's Premium
      Valuation a Warning Sign" is Parker-Hannifin's, and "Franco-Nevada's 2026 Guidance" Franco
      Nevada's.
- Measured with the code, main against this branch on the same headlines:
  - Other feeds' namings: 3,098 → 1,236. Sixty of those removed, picked at random, were all wrong.
  - The companies' own feeds: 2,029 → 2,009. Of the 21 lost, 17 were not about the company ("3
    Canadian Dividend Stocks" on CIBC's feed, "Sector Update: Financial Stocks Rise" on Mitsubishi
    UFJ's). Four were: "Goldman's Equities Revenues Jump" (five names share "goldman"), "Santander
    Stock…", "United Leads Airline Rebound", and "America's Second-Biggest Bank" for Bank of
    America. One was gained, Parker Hannifin's.
  - At a bound of three, own namings fell to 1,992; at ten, 1,347 wrong namings stayed.
- Corrected: batch 59's open item named Barrick Gold for "Gold prices hit record high". Barrick is
  "BARRICK MINING CORP" in the index; the example was a made-up name. Kinross Gold is a real case,
  and this batch fixes it.
- [ ] **Open:**
      - A word fewer than five names share still names each of them alone. Royal Bank of Canada is
        named in 23 other feeds' headlines ("Canada", four share it). "GE" names GE Aerospace, GE
        Vernova and GE HealthCare alike.
      - "Goldman", "Santander" and "United" alone no longer name their companies.
      - Batch 59's capitalised-word and two-letter-ticker items stay open.
- Checks, main → now. On main's code the new ones fail, except those guarding what main already
  does, and those calling the new functions cannot run:
  - `check:relevance` 70 → 76:
    - ten real headlines that named a company wrongly on main (fails on main, all ten);
    - eight companies' own real headlines still named, by the whole or the short name;
    - Parker Hannifin's possessive (fails on main);
    - Target keeps its whole name, `shortName`, and the shared counts come from the ticker index
      in use.
    - Embracer's expected names gain its common name, "embracer group".

## NC ledger — batch 59: an everyday word names a company only with its capital (2026-10-26)

Batch 58 left the hourly GDELT ask keeping an everyday word's stories: Target's "inflation target"
still scored 0.9 when it arrived that way. The cause was wider than Target. Headline scoring counted
every name of a company in any case, so a company's ticker and the English words in its name named
a headline that used them as words. On main, "All eyes on the Fed as markets wait" scored 0.9 for
Allstate (ticker ALL), "Stocks hit a new low on rate fears" for Lowe's (LOW) and "Cat cafe opens in
Brooklyn" for Caterpillar (CAT). In the committed ticker index (8,029 companies), 589 tickers of
three to five letters are English words in ENABLE, and so are 2,277 other one-word names that
headlines are scored by.

`npm run check` passes (49 suites), `npm run lint` and `tsc --noEmit` are clean. `check:ui` was not
run: no page or component changed. HawkScan could not run: `HAWK_API_KEY` is not set.

- [x] **A ticker names a headline only in capitals.** `aliasesFor` keeps a ticker of three to five
      letters as it is, and `mentions` matches it as it matches initials. "COST shares jump" names
      Costco; "Cost of living rises again" no longer does.
- [x] **A name that is an English word names a headline only with its capital** (`withCapital` in
      the new `lib/wordNames.ts`, matched in `mentions`). "Visa beats estimates" names Visa. "New
      rules tighten student visa approvals" no longer does, nor does "Fire closes bus depot
      downtown" name Home Depot.
      - The words are in `data/english-word-names.json`. `npm run sync:word-names` now also writes
        them there (`pieces`, 2,277), from the names ingest scores headlines by.
      - A headline in lowercase throughout says nothing by its case, and is read as before.
- [x] **A headline with a company's own one-word name only in lowercase is hidden.** For the 205
      companies whose name is one everyday word, such a headline scores 0.2 ("headline uses the
      company's name only as an everyday word"), in either scoring mode. "IMF urges retaining 5 %
      inflation target" and two more of the audit's real Target headlines leave Target's page.
      - With its capital the name still scores 0.9, as on main.
      - Holding the capitalised name back as well was tried and dropped. The 205 include Alphabet,
        Adobe, Caterpillar, Chevron, Oracle and Shell, and it took the 0.9 from nearly every real
        headline about them.
- [x] **A corrected rule now reaches stored scores: `npm run score -- --rescore`.** Before,
      `npm run score` took only unscored rows, and a stored score changed only when its story was
      fetched again.
      - It works out again the scores the free tier gave, and writes the ones that change. A row
        the rules no longer settle goes back to NULL, for the model. A model's score is never
        touched (`freePass` in `lib/enrich/relevance.ts`).
      - Tried on a scratch database with five real headlines: "inflation target" 0.9 → 0.2;
        Target's own news kept at 0.9; a model's 0.7 kept; Costco's "Cost of living rises again"
        0.9 → NULL. A plain `npm run score` left the 0.9 alone, as before.
      - `docs/OWNER-ACTIONS.md` asks for one run after deploying.
- [x] The word helpers moved from `lib/ingest/newsBackfill.ts` to `lib/wordNames.ts`, and batch
      58's `BACKFILL_WORD_NAMES` is now `MEASURED_WORD_NAMES`. The backfill behaves as before. With
      the capital in the scorer's names, `namesCompany` itself now passes 7 of the real Target
      month's 15, as the backfill's own capital test does.
- Corrected: batch 58's note on the open GDELT item said scoring keeps off a page whose headline
  does not name the company. In ingest's scoring mode such a headline is left unscored, and shown,
  until the paid model scores it, or `--strict-headline` does. The item now says so.
- [ ] **Open:**
      - A capitalised word still names the company: "Southern California wildfires spread" scores
        0.9 for Southern Company and for Southern Copper, "Target Date Funds Draw Record Inflows"
        for Target.
      - A name piece many listed companies share still names each of them alone. "fund" is a piece
        of 305 companies' names, "trust" of 246, "energy" 194, "gold" 130, "first" 59 and
        "american" 52; 1,294 pieces are shared by two or more. "Gold prices hit record high"
        scores 0.9 for Barrick Gold, and "Companies cut hiring as rates bite" for Lowe's.
        "American" is not in ENABLE, which leaves out capitalised words, so it is not even held to
        its capital. Fixing this needs care: "ford" is a word, and Ford's own name. *(Batch 60: a
        word five or more names share names none alone now, and Lowe's is no longer named by
        "Companies". Barrick was a made-up name, "BARRICK GOLD CORP"; Kinross Gold was a real case.)*
      - A two-letter ticker is matched in capitals, as before, so "IT spending to rise 8% next
        year" scores 0.9 for Gartner.
- Checks, main → now. On main's code the new ones fail, except those guarding what main already
  does, and those calling the new functions cannot run:
  - `check:relevance` 58 → 70:
    - tickers: Allstate's "All eyes on the Fed", Costco's "Cost of living rises", Lowe's "new
      low" (fails on main); "Allstate (ALL)" and "COST shares jump" still named;
    - word names: Visa's student visa and Home Depot's bus depot (fails on main); "Visa beats
      estimates" still named while strict mode demotes the student visa (fails on main);
      `withCapital`;
    - a company's own word: three real Target headlines hidden in both modes, and Shell's "shell
      shock" (both fail on main); Target's own news and "TGT shares jump" still named; a
      lowercase-throughout headline read as before;
    - `--rescore`: `freePass` writes what changed, leaves what did not, scores what was unscored,
      and clears Costco's row; `npm run score` takes back only the free tier's own scores.
    - Embracer's names are compared in lowercase: "embracer" is an English word.
  - `check:news-backfill` 38 → 38: the real Target month's check now asks that `namesCompany`
    pass 7 of 15 (main passed all 15) and agree with the backfill's capital test.

## NC ledger — batch 58: the 2026-10-26 audit's four findings fixed (2026-10-26)

The `code-auditor` read the changes since the last audit (batches 53–57, `7ba8cb6..1ac7cdd`). Its
report is `docs/audits/2026-10-26-code-audit.md`. All four findings were reproduced here and are
fixed; its five set-asides stay as it left them.

`npm run check` passes (49 suites), `npm run lint` and `tsc --noEmit` are clean. `check:ui` was not
run: no page or component changed. HawkScan could not run: `HAWK_API_KEY` is not set.

- [x] **Finding 1 (`P1`): the GDELT backfill kept an everyday word's stories as the company's.**
      One live month of Target (September 2026) gave 33 stories whose headline "names" Target.
      10 were about inflation targets, price targets and a moving target, each scored 0.9.
      - A company asked under one everyday English word is now held back from the backfill until
        a month of its own has been measured (`BACKFILL_WORD_NAMES` in
        `lib/ingest/newsBackfill.ts`). 205 of the index's 1,949 one-word GDELT names are words in
        ENABLE, the public-domain list `data/english-short-words.json` already came from: Target,
        Southern, Crown, Progressive, Shell, Tesla, Apple and others. Pfizer, Nvidia and Boeing are
        not. A one-word name the list does not hold counts as a word, so it is held back.
      - A measured name counts a headline only where the name has its capital ("Apple", "APPLE",
        never "apple"). Two are measured, from live GDELT months:
        - Apple, May 2023: 60 headlines, every one with its capital, and one (a cranberry brie
          recipe) not about Apple.
        - Tesla, April 2022: 31 headlines with its capital, every one about Tesla or its cars; the
          one without it was a tag page.
        - Target is not on the list: with capitals, 8 of its 10 wrong stories go, but 2 stock tips
          ("… | Target , stop - loss") stay.
      - The list is `data/english-word-names.json`, written by the new `npm run sync:word-names`
        from the committed ticker index. `check:news-backfill` fails until it is rerun after a
        ticker sync. `docs/OWNER-ACTIONS.md`, `CLAUDE.md` and the README say so.
      - `check:feeds` now reports what the backfill would keep from a past month, or that the
        company is held back. It used to report GDELT's count before the filter.
      - The open GDELT item said scoring keeps unrelated pages off a page. It is corrected: a page
        that uses the company's name as a word is not kept off.
- [x] **Finding 2 (`P2`): Great Elm Group's news was asked and scored under two brands it sold.**
      "Openwave" went to Openwave Mobility in 2012 (8-K 0001193125-12-212068). "Unwired Planet",
      with all the patents, went to Optis in 2016 (8-K 0001193125-16-532468). Both filings were
      read on EDGAR this batch.
      - Both names are dropped. The rule is now written beside `news` in `lib/predecessors.ts`: a
        name whose brand left with a business sold or spun off does not carry, as Motorola's did
        not (`KNOWN_NOT_NEWS`).
      - The reason recorded for withholding "Aaron's" is corrected in batch 55's entry and its
        check: the brand went with the spin-off, which is no longer listed.
- [x] **Finding 3 (`P3`): the apostrophe retry read "she'll" as Shell.** It now drops an
      apostrophe only before a final "s" ("Kohl's" → "kohls"). "Taylor Swift says she'll retire
      next year" no longer scores 0.9 for Shell, and "Kohl's names new CEO" still names Kohl's.
- [x] **Finding 4 (`P3`): "Form 4 Tesla", "Form 13F Berkshire" and "Form D" still opened
      FormFactor.** Now any form called a form is read as a form (`lib/prompt.ts`): "Form 4 Tesla"
      opens Tesla, "Form 13F Berkshire" Berkshire Hathaway, and "Form D" nothing. There is no
      filter, since the page carries none of those forms. The rule cuts none of the index's 29,983
      company and fund names. Batch 56's line about it is corrected.
- Set aside, as the audit left them: DOJ releases naming another party ("Ten Employers" for
  Employers Holdings), common-word aliases older than these batches (Welltower's "well"), three
  window-edge stories dated a day late, `dojPossessive`'s extra queries, and one contrived query.
- [ ] **Open:**
      - The hourly GDELT ask still keeps an everyday word's stories for those companies: Target's
        "inflation target" is still scored 0.9 when it arrives that way. *(Batch 59: a headline
        with the word only in lowercase is now hidden; one with its capital still names it.)*
      - The other 203 everyday-word names wait for a measured month from the production host.
        GDELT refused nearly every request from this container again.
- Checks, main → now. On main's code the new ones fail, except those guarding what main already
  does, and the backfill's cannot run (its functions are new):
  - `check:news-backfill` 30 → 38:
    - a real Target month: all fifteen headlines pass "names it", and the capital rule drops
      eight of the ten wrong;
    - Target held back and saying why; Southern, Crown and Progressive words, Pfizer, Nvidia and
      "Ford Motor" not; an unlisted name held back;
    - Apple asked and kept only with its capital;
    - every one-word name in the ticker index listed.
  - `check:relevance` 56 → 58: "she'll" and "She'll" are not Shell (fails on main); Shell and
    Kohl's still named.
  - `check:predecessors` 27 → 28: no "Openwave" or "Unwired Planet" for Great Elm.
  - `check:prompt` 52 → 58: "Form 4 Tesla", "Tesla Form 4", "Berkshire Form 13F filings" and
    "Form 144 for Apple" (4 fail on main), "Form D" and "Form Energy".
  - `check:aliases` 98 → 99: "Form 4 Tesla", "Form 13F Berkshire" and "Form D", searched.

## NC ledger — batch 57: a company's older news from GDELT, a month at a time (2026-10-26)

The hourly GDELT ask returns its newest hundred pages, which for a busy company is the last few
days. So a company page's GDELT news began about when the company was first ingested. The
backlog's "GDELT year-window backfill" (`P2`, securities-coverage depth) was waiting on a host
GDELT would answer. From this container it answered 5 requests in the batch and refused the rest
(429, and for a few minutes no connection at all), which was enough to choose the window and see
what a window gives.

`npm run check` passes (49 suites), `npm run lint` and `tsc --noEmit` are clean. `check:ui` was not
run: no page or component changed. HawkScan could not run: `HAWK_API_KEY` is not set.

- [x] **Each month since 2017 is asked once more, by relevance** (`lib/ingest/newsBackfill.ts`),
      in company ingest right after the hourly ask, with the same query and names. A story is
      kept only when its headline names the company the way headline scoring counts naming, so
      it is stored scored as named.
      - **A month, not a year.** The hundred pages a span gives are spread thinner the longer it
        is. Asked for all of 2021, Ford's hundred all came from October (45), November (25) and
        December (30), and 49 stories were kept. The first quarter of 2021 gave 55; February 2021
        alone gave 52, from the 1st to the 28th. (Kept: the headline names Ford, near-duplicates
        collapsed.)
      - Measured, one month each, stories kept: Ford (February 2021) 52 of 100, Apple (May 2023)
        58, McDonald's (June 2022, asked by relevance) 63. What is left out is pages whose headline
        names someone else ("Harrison Ford", "Dr. McDonald", "Steve Jobs signed check") or nobody.
      - Months start at the company's first price, and never before 2017, the hourly ask's floor.
        So a common word's years before the company listed ("Snowflake" before 2020) are not
        asked. A company with no prices is not asked at all.
      - A month that is over is asked once. The asking is kept in a new table, `gdelt_windows`
        (migration 030), with the query asked; a month asked under an older query is asked again.
- [x] **Paced for GDELT.** Requests are 6 s apart, at most 40 months per process (about four
      minutes of an hourly refresh), each company newest first. A company's 117 months fill in
      over three of its runs.
      - It stops at the first refusal or failure and logs it in `source_fetches`, as any GDELT
        failure is. A refusal then keeps every other subject off GDELT for ten minutes (the
        run-wide back-off, NC-143). A refused month is not stored, so it is asked again later.
      - Months answered are not written to the fetch log, so they never make the hourly ask look
        fresh and skip it.
      - An enrichment: if it fails, the company keeps everything the hourly ask found.
- [x] **Run against a real Postgres** (a fresh database, the migrations applied, GDELT a stand-in): a
      company priced from May 2018 asked 101 months over two runs and stored one story a month,
      scored as named (0.9). The stand-in's "Harrison Ford's film" was left out every month, and a
      third run asked nothing.
- [x] `check:feeds` (live, outside the chain) also asks the newest past month, as the backfill
      does.
- [x] README and `docs/COVERAGE-MAP.md` describe it, with the advice to measure it from the
      production host. The backlog item's GDELT half is marked built; its paid-tier half stays open.
- [ ] **Open: watch it in production.** From a shared address GDELT refused about four requests in
      five. The production host should show how fast histories fill in, how many stories a month
      gives across companies, and how large pages grow (batch 35's budget keeps the stories beside
      the biggest moves).
- Checks: new `check:news-backfill` (30), wired after `check:gdelt-relevance`:
  - the months asked: every month since 2017 that is over, newest first; whole months, February
    included; a company's listing month as the start;
  - the request: by relevance between the month's first and last second, with the hourly ask's
    query;
  - what is kept: headlines that name the company, not another person by the same word;
  - a run: newest first, the budget shared by every company in the process, nothing asked twice,
    a changed query asked again, a whole history in three runs;
  - a refusal: it stops, logs the month as a GDELT failure, and stores only what was answered;
    nothing is asked inside a back-off; a failed store rolls the month back;
  - pacing and wiring: 6 s apart, a run's months within five minutes, ingest calls it after the
    hourly ask with the same query, names and scoring.

  On main the check cannot run: `lib/ingest/newsBackfill.ts` does not exist.

## NC ledger — batch 56: the 2026-10-25 audit's set-asides (2026-10-26)

The 2026-10-25 code audit set six things aside (batch 53's entry lists them). This batch fixes
five. The sixth, the Federal Register asked under the SEC spelling, needs nothing: the audit found
no document lost (7 companies, 0 either way).

`npm run check` passes (48 suites), `npm run lint` and `tsc --noEmit` are clean, and `check:ui`
passes 198/198 against a fresh demo database. HawkScan could not run: `HAWK_API_KEY` is not set.

- [x] **"Citi", "Citibank", "Chase" and "Chase Bank" open Citigroup and JPMorgan.** Before, "Citi"
      opened Citi Trends, "Citibank" an ADR named "Citibank,N.A.", "Chase" Chase Packaging, "Chase
      Bank" Chase Packaging with a "Bank" filter, and "Pepsi" a chooser of three. Two causes:
      - The alias builder kept a Wikidata alias only when it shared a whole word with the
        company's names (`lib/companyAliases.ts`). "Citi" is the start of "Citigroup" and "JP
        Morgan" is "JPMorgan" written apart, so both were dropped as unrelated, and Citigroup and
        JPMorgan lost every alias. Now the start of a name word counts when it is four letters or
        more, and so does a word written apart.
      - Wikidata does not list "Chase" or "Citibank" on the companies at all. A short brand list
        (`BRAND_NAMES`, three entries, each with its reason) adds them for search only. They never
        search news: "Chase" is also every car chase.
      - Citi Trends and Chase Packaging still open themselves; Citigroup and JPMorgan are bigger, so
        they win the short name, by the rule that already gives "J&J" to Johnson & Johnson.
- [x] **The alias index was rebuilt** from the Wikidata answers read today: 1,555 → 1,586 names.
      The new rules add 30 and remove or change none. Among them: "Pepsi", "Citi", "Citi Bank",
      "CN Rail", "STmicro", "United Healthcare", "Pulte Homes", "Campbell Soup" and "McDonald". All
      are search only, except JinkoSolar's "Jinko Solar" and The RealReal's own name, which are
      the companies' official names.
      - Wikidata itself changed since the last sync (+3 names, −2). "Cimpress NV" and "Philip Morris
        and Company" now open their companies without a stray filter.
      - "Kraft Foods" now opens Kraft Heinz with a "Foods" filter. Wikidata relabelled the 2012
        Kraft Foods Group's alias as "Kraft Foods, 2012 company", since Mondelez was also called
        Kraft Foods until 2012, and a name with a qualifier is not read. "Kraft Foods Group" still
        opens Kraft Heinz with no filter.
- [x] **"Form 10-K" opens no company.** Before, it opened FormFactor (ticker FORM) with a 10-K filter,
      "Form 10-K for Apple" opened FormFactor too, and "Apple Form 10-K" filtered by "Form · 10-K".
      Now "Form" and "SEC Form" are read as part of the form's name (`lib/prompt.ts`). "Form 10-K"
      alone finds nothing, as a bare "10-K" does; "Form 10-K for Apple" opens Apple's annual
      reports; "FormFactor" and "FormFactor 10-K" still open FormFactor. *(Batch 58: that held only
      for the forms the page carries; "Form 4 Tesla" still opened FormFactor until then.)*
- [x] **Biggest moves rank an FDA Class II recall as news** (`components/BiggestMoves.tsx`). Every
      recall used to rank as a filing when picking the event that labels a big move. So a Class II
      recall that day beat the news, a Fed decision or an inflation report, and Medtronic alone has
      470. The chart already ranks Class II as news (batch 40), and the panel now does too.
      - Class I and vehicle recalls keep their rank. The audit's example, Ford's +23.4% day
        labelled by a 288,110-vehicle recall, stays as it is: a vehicle recall is the carmaker's own
        act, on the chart as here, and the panel says proximity isn't proof.
- [x] **Moody's is scored by "moodys", not "/de/".** The names the relevance scorer looks for came
      from the words of the SEC title, registration tag included. "MOODYS CORP /DE/" gave "/de/",
      "PULTEGROUP INC/MI/" gave "inc/mi/", and an ADR's "…AB/ADR" gave "ab/adr".
      - Now the tag is taken off, by the same rules the everyday name already used. Those rules
        moved to `lib/edgarName.ts`, so the scorer need not load the ticker index. The single
        words now come from the everyday name, so a legal form (LP, LLC, AB, SpA, A/S) is not a
        name either.
      - Across all 8,028 company titles, 719 change. What goes is only tags and legal forms (55
        "/de/", 100 "ltd/adr", 48 "lp", 25 "llc"…). What comes is words a tag was stuck to:
        "CaixaBank/ADR" now gives "caixabank".
      - The everyday name itself is the same as before on every title. Stored scores change as
        events are next scored.
- [x] **Three headlines cut short now read whole** (`lib/secHeadlines.ts`):
      - Stellantis's "…to Announce Third Quarter 2026" / "Financial Results on October 28": a
        reporting period whose results are named on the next line carries on.
      - TotalEnergies's "…Divests its Minority Non-Operated" / "Interest in Marjoram Gas Field": a
        "Non-" word cannot end a line of a headline.
      - Toyota's results deck was titled "FY2027 First Quarter Financial Results Land Cruiser FJ
        Toyota Motor Corporation", its cover's caption and company name included. It is now
        "FY2027 First Quarter Financial Results".
      - `HEADLINE_VERSION` is 8, so stored titles are read again.
      - Over 2,190 saved documents (earlier batches' and this one's), 6 read differently, all for the
        better: these three, Toyota's same deck saved twice, Stellantis's Q2 notice, and Nomura's
        "…to Announce Second Quarter" (now "…Operating Results on October 28").
      - Seen and left open: a TotalEnergies meeting notice runs into its subheadline ("…Meeting on
        May 29, 2026 Conditions of availability of the preparatory documents"). It belongs with
        batch 44's open item on headlines run into a subheadline.
- [x] Batch 53's note on the six set-asides now says which batch fixed them.
- Checks, main → now, each new one failing on main's code unless it guards what main already does:
  - `check:aliases` 89 → 98: the start of a word ("Citi") and a word written apart ("JP Morgan");
    the brands, search only and ahead of Chase Packaging and the Citibank ADR; the committed
    index; and search end to end with the database down ("Citi", "Citibank", "Chase", "Chase
    Bank", "Pepsi", Citi Trends and Chase Packaging, "Form 10-K", "Form 10-K for Apple"). On main
    four fail, then the check stops at the missing brand list.
  - `check:prompt` 46 → 52: "Form 10-K", "SEC Form 8-K filings", "Form 10-K for Apple", "Apple Form
    10-K", "Form 8-K Tesla" (5 fail on main) and "FormFactor 10-K".
  - `check:relevance` 52 → 56: Moody's, Pulte and an ADR's names, a partnership's "lp" (3 fail on
    main), and a slash inside a name or a topic kept.
  - `check:fda-recalls` 37 → 38: a Fed decision labels a big move before a Class II recall, never
    before a Class I or a vehicle recall.
  - `check:sec-headlines` 250 → 255: the three documents, added to the fixture (141 → 144
    documents); the period rule beside a headline that already names its results; the version.
    All 5 fail on main.

## NC ledger — batch 55: the rest of the companies with an earlier SEC record (2026-10-26)

Batch 53 mapped 15 of the 115 listed companies whose SEC record starts with a notice of
succession, and left the other 100 open. Four of those (Linde, Nutrien, Restaurant Brands, UBS AG)
were already ruled out. This batch read the other 96: **55 are now mapped and 41 left out**, each
for a reason below. `lib/predecessors.ts` holds 70 companies.

`npm run check` passes (48 suites), `npm run lint` and `tsc --noEmit` are clean. `check:ui` was
not run: no page or component changed. HawkScan could not run: `HAWK_API_KEY` is not set.

- [x] **How each was checked.** A scan read each company's notice of succession, took the old
      company's name from it, found that company's record by full-text search of the filings that
      name it, and checked the record: no ticker of its own now, a name that matches, and filings
      from before the handover. Then every result was read by hand, notice sentence and record
      together. The scan's guesses were wrong often enough to need that: it matched Crown Holdings
      to NeighborCare and Ferrari to United Therapeutics, and read "Inc." as a name.
- [x] **The rule, stated as it is applied** (`lib/predecessors.ts`). The page carries an old
      record when it is one company's history carrying on:
      - a holding-company reorganisation, a move of legal home, a partnership converting to a
        corporation, or a savings bank's second step, whether or not the ticker changed with it.
        Encana became Ovintiv and ECA became OVV; it is the same company.
      - an acquisition made through a new parent, when the buyer's ticker carried on: Uniti with
        Windstream, QuidelOrtho with Ortho, AB InBev with SABMiller, Liberty Global with Virgin
        Media, DraftKings with Golden Nugget.
      Batch 53's "only a ticker that carried on" was too strict for the first kind and is replaced.
- [x] **A record that began as a shell starts at the business** (a new `since`). DraftKings' old
      record was a SPAC, Diamond Eagle, until April 2020; China BAK's was Medina Coffee, Terra
      Tech's a shell called Private Secretary, Taoping's Irish Mag, Arcturus's Alcobra and
      SharpLink's MER Telemanagement. Their filings before the business arrived, and the rename
      that day, stay off the page.
- [x] **Chains.** Weatherford reads three records back (Switzerland 2009–2014, Bermuda 2002–2009,
      Delaware before) and Noble two: its Swiss and UK parent from 2009, through the 2021
      restructuring, and its Cayman parent from 2002. Noble's step before 2002 (Noble Drilling)
      has no notice of succession on file, so it is not linked.
- [x] **News names** where the old name is not the present one: "Encana", "Bancolombia",
      "CompuCredit", "Quidel", "FREYR", "Openwave", "Unwired Planet" and "Crown Cork". Not
      "Aaron's" for PROG Holdings: The Aaron's Company it spun off is another listed company now.
      *(Corrected in batch 58: Great Elm sold the businesses behind "Openwave" (2012) and "Unwired
      Planet" (2016), so both are dropped; and "Aaron's" is withheld because the brand went with
      the spin-off, which is no longer listed.)*
- Measured live, SEC filings and renames per page, main → now, for all 55. No page holds a filing
  twice. The largest:

  | Ticker | Main | Now | Earliest now |
  |---|---:|---:|---|
  | TIMB (TIM, Brazil) | 541 | 1,644 | 2002 |
  | AU (AngloGold Ashanti) | 132 | 1,275 | 2002 |
  | CIB (Grupo Cibest, Bancolombia) | 48 | 983 | 2002 |
  | WFRD (Weatherford) | 390 | 948 | 1995 |
  | NWE (NorthWestern) | 85 | 926 | 1994 |
  | OVV (Ovintiv, Encana) | 205 | 865 | 2002 |
  | SWX (Southwest Gas) | 281 | 756 | 1994 |
  | NE (Noble) | 100 | 697 | 2002 |
  | QDEL (QuidelOrtho) | 130 | 693 | 1995 |
  | GEG (Great Elm; Phone.com, Openwave) | 118 | 684 | 1999 |
  | PRG (PROG Holdings; Aaron's) | 123 | 634 | 1995 |
  | NWN (Northwest Natural) | 193 | 596 | 1994 |
  | BH-A (Biglari; Steak n Shake) | 138 | 601 | 1994 |
  | CLB (Core Laboratories) | 68 | 595 | 1996 |

  And smaller ones gain most of what they have: CBAT 2 → 397, DMRC 18 → 360, PNFP 30 → 499, CLBK
  13 → 172. DraftKings starts at the April 2020 merger (82 → 164), not the SPAC.
- **Left out (41)**, by reason:
  - **A SPAC**, whose own filings are a blank-check company's (9): OIO, MYPS, FOA, IGIC, NIVF,
    FIRY, TTSH, NUAI, ABTC.
  - **A merger into a new company**, its name or ticker new, or the other company's (15):
    Paramount and Skydance (SKYD), Primo Water and BlueTriton (PRMB), Baker Hughes and GE's oil
    business (BKR), Xperi and TiVo (ADEA), HollyFrontier and Sinclair (DINO), Cyberonics and Sorin
    (LIVN), Talos and Stone (TALO), Sonus and Genband (RBBN), I.D. Systems and Pointer (AIOT), Real
    and RE/MAX (REAX), Cedar Fair and Six Flags under Six Flags' name (FUN), JFB and Xtend (XTND,
    which reads as a merger but was not confirmed), Bank of New York and Mellon (BNY), Colony and
    NorthStar (DBRHP), and Restaurant Brands' partnership units (QSP).
  - **A bought company's registration**, inherited by its buyer (2): Pembina took Provident's
    (PBA), First Mining took Clifton Star's (FFMGF).
  - **A bank's holding company** (12): AMAL, USCB, CARE, BPRN, MRBK, VABK, FGBI, OPHC, BOTJ, ENBP,
    STBI, NWPP. The old company is the bank itself, which reported to its bank regulator, not on
    EDGAR, so there is no older record to read.
  - **The old company still listed** (1): WISeKey International Holding still trades as WKEY
    beside WQEY.
  - **Not settled** (2): Ferrari (RACE), whose old and new records share the name Ferrari N.V.
    and whose old one held three months of filings; and Lionsgate Studios (LION), whose 2025
    separation leaves open which history is whose.
- Checks: `check:predecessors` 20 → 27: a start day falls before its handover; batch 55's mapped
  (Ovintiv, Grupo Cibest, DraftKings, Weatherford three back, Noble two); Linde, HF Sinclair, Baker
  Hughes and Pembina have none; DraftKings' 2021 and 2022 annual reports on its page and the SPAC's
  not, against a stand-in EDGAR; and the news names, with no "Aaron's". On main's code 3 of the 7
  new checks fail; the other four guard what main already leaves out.

## NC ledger — batch 54: the audit's four other findings fixed (2026-10-25)

Batch 53 fixed the 2026-10-25 audit's `P1` and left the four findings inside its scope open. This
batch fixes all four. Each was reproduced before it was fixed, and each fix was measured live
against main's code.

`npm run check` passes (48 suites), `npm run lint` and `tsc --noEmit` are clean, and `next build`
passes. `check:ui` passes 198/198 against a fresh demo database, built against it. Its first run there
failed 13, all on pages showing Ford's real rows: the build had reused a data cache left by the
Ford test below against the main database. With that cache cleared, every check passes.
HawkScan could not run: `HAWK_API_KEY` is not set.

- [x] **Finding 1 (`P2`): Justice Department releases about a company with an apostrophe in its
      name.** Two causes, both fixed (`lib/doj.ts`):
      - **The query.** justice.gov's title filter matches an apostrophe as written (letter case
        aside), and its titles carry both kinds. Measured 2026-10-25: "Moody’s" 2 titles,
        "Moody's" and "MOODYS" none; "Lowe’s" 12, "Lowe's" 5 (older titles, stored as `&#039;`);
        "Kohl’s" 3, "Kohl's" none. A possessive is now asked in both spellings. Where the SEC
        title dropped the apostrophe, the possessive comes from Wikidata's own name, cut after its
        "'s" ("Moody's Corporation" → "Moody's", batch 36's `possessiveNameFor`). With none, a
        one-word name ending in "s" gets one ("KOHLS" → "KOHL'S"); a one-word name that is no
        possessive costs two queries that find nothing.
      - **The party test.** An apostrophe in a name matches either kind, and a word's closing
        "s" may carry the apostrophe its SEC title dropped, so MOODYS names "Moody’s". "Lowe's"
        joins the names a release is matched under, since LOWES COMPANIES alone names none.
        "Centers" may follow a name, as in "Lowe’s Home Centers to Pay $12.5M Penalty".
      - **Headline scoring** (`mentions`, `lib/enrich/relevance.ts`), the same gap the audit
        found for Kohl's: a one-word name kept without its apostrophe ("kohls") now names "Kohl's
        names new CEO", and a curly "McDonald’s" names McDonald's, which it did not on main either.
        "Ford's profit falls" still names Ford, and "Harrison Ford's new film" is still left for
        the model.
      - Live (2026-10-25), releases a page gets, main → now: Moody's 0 → 1 (the $864M
        settlement, 2017-01-13), Kohl's 0 → 1 (2022-05-05; Walmart, the other party, keeps it
        too), Macy's 0 → 1 (2016-06-22), Lowe's 0 → 2 (the 2025-11-25 lead-paint penalty and the
        2024-12-03 accessibility agreement), McDonald's 0 → 1 (2015-11-19). Walmart 8 → 8 and
        Home Depot 3 → 3. Wendy's, Domino's, Dick's and Papa John's still get none: their titles
        are about franchise owners, a former employee, robberies and insider trading. No title
        names Dillard's, Campbell's, BJ's or O'Reilly in either spelling.
- [x] **Finding 2 (`P2`): one click on a long timeline made later focused views of that page hide
      most of their matches** (`components/EventList.tsx`).
      - The list now keeps what the reader changed (years opened from the opening folds, years
        and months folded), not a copy of the whole folded set. So a list that grows or shortens
        still opens as its length says, with the reader's own changes on top.
      - A focused view keeps its folds to itself: it reads no saved choice, so every year opens,
        and a fold made in it is not saved. A change of view never carries one view's folds into
        the other's storage.
      - A view saved before this batch held the whole folded set; it is read as no choice, once.
      - Live in Chromium against Ford's real local page (2,349 events), the audit's steps:

        | Step | Main | Now |
        |---|---|---|
        | `?focus=recall`, a fresh visitor | 863 rows, 0 years folded | the same |
        | `/company/F`, then one year clicked | 329 rows, 98 folded | the same; saved: that one year |
        | then `?focus=recall` again | **158 rows, 57 folded**, no note | **863 rows, 0 folded** |
        | a year folded while focused, then `/company/F` | that year folded there too (233 rows) | not carried over (329 rows) |
- [x] **Finding 3 (`P3`): UnitedHealth's 2026 results releases titled "Page 1 of N …".** Its
      releases set each page as one line, which opens with the page's count. The reader now drops
      a "Page N of M" opening a line; a count alone on its line was already dropped
      (`lib/secHeadlines.ts`). `HEADLINE_VERSION` is 7, so stored titles are read again. Live: the
      January, April and July releases now read "UnitedHealth Group Reports 2025 Results and
      Issues 2026 Outlook", "…First Quarter 2026 Results" and "…Second Quarter 2026 Results".
      `check:live` counts a "Page N of M" opening as page furniture, and samples UNH.
- [x] **Finding 4 (`P3`): `check:feeds` asked GDELT what production no longer sends, and never
      asked the newer sources.** It now makes every fetch `ingestCompany` makes, with the same
      arguments: GDELT by `gdeltNewsPlan` from `newsNamesFor` and `possessiveNameFor`, the
      company Federal Register feed, NHTSA and FDA recalls for mapped companies, the Justice
      Department, Yahoo, the Library of Congress and the Internet Archive. It also reads the
      newest 8-K's or 6-K's headline. A refusal or failure now reads as one, not as 0 articles.
      Old query → now: Visa "VISA" → "VISA Inc"; McDonald's "MCDONALDS" → "MCDONALD" by
      relevance; Uber and IBM gain the names ingest ORs in. Run live for MCO and MCD: the Justice
      Department, recall, FDA and headline lines answer; GDELT answered "fetch failed" from this
      cloud machine, and says so.
      `check:wiring` now fails if a fetch in `ingestCompany` is missing from `check:feeds`, word
      for word.
- Checks: `check:doj` 37 → 45, `check:relevance` 49 → 52, `check:event-folds` 16 → 21,
  `check:sec-headlines` 247 → 250 (UnitedHealth's January release joins the real documents),
  `check:wiring` 199 → 202, and `check:live-harness` stays at 45 with one more past wrong title
  (16). In `check:event-folds`, three checks that only matched main's code as written (the saved
  view's two and the jump's) give way to the audit's click sequence, step by step. On main's
  code:
  - `check:doj` and `check:event-folds` stop at once: the helpers they call do not exist there.
    The six real releases the new DOJ cases use all fail main's matcher.
  - `check:relevance` fails its 2 new naming cases, and `check:sec-headlines` its 3 new ones.
  - `check:wiring` fails its 3 new checks against main's `check:feeds`.
  - `check:live-harness` fails 2 against main's `check:live`.

## NC ledger — batch 53: a company's history before its new SEC record (2026-10-25)

The `code-auditor` agent checked everything changed since the last audit (`d36636d`, batches
24–52) on `7ba8cb6`. Its report is `docs/audits/2026-10-25-code-audit.md`: four findings inside
that scope (two `P2`, two `P3`), six set aside, and one outside it that it rated above them all
(`P1`). This batch fixes that one. The four are below as open items, for batch 54.

`npm run check` passes (48 suites), `npm run lint` and `tsc --noEmit` are clean. `check:ui` was
not run: no page or component changed. HawkScan could not run: `HAWK_API_KEY` is not set.

- [x] **XOM's page carried 8 filings; Exxon's record holds 581 back to 1994.** A holding-company
      reorganisation, a redomicile or a merger the company survives gives the listed parent a new
      SEC record (CIK), and EDGAR links the two nowhere. ExxonMobil Holdings Corp took XOM on
      2026-07-01 and its record starts that day; BlackRock's new parent took BLK in October 2024.
      Alphabet's page began in October 2015 and Disney's in 2019 for the same reason.
      - `lib/predecessors.ts` maps each successor to the record its history stays under, with the
        day of the handover. Every entry was checked by hand: the successor's notice of succession
        (an 8-K12B or 8-K12G3) names the predecessor, and the predecessor's record no longer lists
        a ticker, because its ticker passed on.
      - The filings reader (`getFilingsDeep`, `lib/sec.ts`) reads the predecessor's record too and
        keeps its filings dated before the handover. Its later filings are a subsidiary's (debt
        filings, its deregistration) and are left out. A filing both records carry is shown once.
        The predecessor's titles carry the company's present name; their links point at the record
        they are filed under.
      - The predecessor's own renames before the handover count ("Exxon" to "Exxon Mobil", 1999).
        Its last rename does not when that rename is into a subsidiary's name at the handover:
        BlackRock's old record became "BlackRock Finance" and Disney's "TWDC Enterprises 18".
      - The 8-K headline reader asks EDGAR for a filing under the CIK in the filing's own link.
        Asked under the successor's CIK, EDGAR answers 404 for a predecessor's filing.
      - News uses the predecessor's own name where the successor's present name is not it:
        "Exxon Mobil" and "Exxon" for XOM, "Cigna" for CI, "Bunge" for BG, "Marvell" for MRVL
        (`newsNamesFor`). A name that is also an everyday word or a common surname ("Apache",
        "Ferguson") is left out, as batch 34 left them out.
      - Left out on purpose: a merger into a new company under a new ticker (Linde, Nutrien,
        Restaurant Brands), which is not one company's history; and UBS AG, whose record lists
        hundreds of notes of its own, which would bury UBS Group's page.
- Measured live (2026-10-25), SEC filings and renames per page, main → now, with the annual reports
  among them:

  | Ticker | Main | Now | Earliest now | Annual reports |
  |---|---:|---:|---|---|
  | XOM | 8 | 583 | 1994-03-04 | 0 → 33 |
  | BLK | 46 | 456 | 2006-06-09 | 2 → 20 |
  | GOOGL | 266 | 570 | 2004-04-29 | 11 → 22 |
  | DIS | 171 | 689 | 1995-09-20 | 7 → 30 |
  | AVGO | 229 | 529 | 2008-08-21 | 8 → 17 |
  | CI | 225 | 897 | 1994-01-11 | 8 → 33 |
  | FERG | 50 | 201 | 2021-03-08 | 2 → 5 |
  | BG | 103 | 706 | 2001-08-10 | 3 → 26 |
  | HHH | 90 | 408 | 2010-10-22 | 3 → 16 |
  | APO | 218 | 513 | 2008-04-08 | 4 → 14 |
  | MRVL | 157 | 703 | 2000-03-23 | 5 → 26 |
  | APA | 126 | 724 | 1994-02-11 | 5 → 33 |
  | XRX | 203 | 963 | 1994-02-11 | 7 → 32 |
  | MDT | 259 | 670 | 1994-03-04 | 12 → 33 |
  | ETN | 266 | 619 | 1994-02-14 | 14 → 33 |

  No page holds a filing twice. AVGO reads two records back: Broadcom Limited (2016–2018) and
  Avago Technologies (2008–2016). A page refreshed by `npm run ingest` picks the history up; the
  first pass reads the predecessor's recent filings too.
- [x] **The rest of the successors.** Of the 264 listed companies that have filed a notice
      of succession since 2001, 115 have a record that starts at most 18 months before it. The 15
      above are mapped. The other 100 need the same hand check before they are added, BNY, Baker
      Hughes, AB InBev, Crown Holdings, DraftKings, HF Sinclair, Liberty Global, Noble, Ovintiv,
      Ferrari, Southwest Gas and Weatherford among them. Linde, Nutrien, Restaurant Brands and
      UBS AG stay out (above), and SKYD's notice was not confirmed. Whoever adds one adds a line
      to `lib/predecessors.ts`; `check:predecessors` checks its form against the ticker index.
      Done in batch 55: 55 more mapped, and each of the other 41 left out for a stated reason.
- [x] **Audit finding 1 (`P2`): the Justice Department feed loses every release about a
      company whose name has an apostrophe** (Moody's $864M settlement, Kohl's, Macy's, Lowe's,
      McDonald's); Kohl's joint penalty with Walmart reached only Walmart's page. The API is asked
      under the SEC spelling ("MOODYS", "KOHLS") while justice.gov writes "Moody’s", and the party
      test (`escapeName`) does not fold `'` and `’` the way the Federal Register's `words()` does.
      Fixed in batch 54.
- [x] **Audit finding 2 (`P2`): one click on a long timeline makes later focused views of
      that page hide most of their matches.** A year folded or opened by hand is saved per page
      and overrides the "open every year" a focused view asks for, so "How did covid affect Ford"
      opens with most matched years folded. Fixed in batch 54.
- [x] **Audit finding 3 (`P3`): UnitedHealth's 2026 results releases are titled "Page 1 of
      N …".** The reader should strip a leading page count from a line that holds a whole page.
      Fixed in batch 54.
- [x] **Audit finding 4 (`P3`): `check:feeds` asks GDELT a query production no longer sends,
      and never asks the newer sources.** It should build its GDELT line from `gdeltNewsPlan` and
      `newsNamesFor`, and add lines for the recall, FDA and Justice Department feeds. Fixed in
      batch 54.
- The audit's six set-asides stay as it left them (each is in the report): "Form 10-K" resolving
  to FormFactor, recalls' marker priority in Biggest Moves, three fresh-filer headlines cut short,
  "/de/" in Moody's scoring aliases, "Chase" and "Citi" resolving to small companies, and the
  Federal Register asked under the SEC spelling (no document lost). Batch 56 fixed the first five;
  the sixth needs nothing.
- Checks: `check:predecessors` is new, 20 checks: the map against the committed ticker index
  (each successor listed, no predecessor still listed, dates and notices well formed); the reader
  against a stand-in EDGAR (the predecessor's filings before the handover only, back to its older
  shard, titled and linked as above, a shared filing once, the renames kept and dropped); the
  headline reader's CIK; and the news names, scored on "Exxon Mobil beats profit estimates". On
  main's reader 10 of the 20 fail; the 10 that pass there check the map alone, which main does
  not have.

## NC ledger — batch 52: "Apple 10-K" narrows to the annual reports (2026-10-25)

Batch 39 left this open: '"8-K" still has nothing to look for. GDELT and the feeds write "8-K" as
two short pieces, "8" and "K", and a single character is never a focus word.' The same held for
every SEC form, the words an analyst types to find a filing: "Apple 10-K" or "Ford 8-K" gave no
focus at all, and the search box read "Apple 10-K" as one name.

`npm run check` passes (47 suites), `npm run lint` and `tsc --noEmit` are clean, and `next build`
passes. `check:ui` passes 198/198 against a fresh demo database, built against it. Its economy-overlay
checks skip themselves there, as that database holds no economy subject. HawkScan could not run:
`HAWK_API_KEY` is not set.

- [x] **A form's name is one focus term** (`lib/focus.ts`): "8-K", "10-K", "10-Q", "6-K", "11-K",
      "20-F", "40-F" and "S-1", "S-3", "S-4", "S-8", "F-1", "F-3", "F-4", in the plural too
      ("8-Ks"). It is kept as the pair of words a filing's title holds ("Annual report (10-K)"),
      so it matches every filing of the form, its amendments ("10-K/A") and the "10-K405" the
      annual report was until 2002.
      - "10K" and "10Q" count without the hyphen; the rest need it, so "8K video" is no 8-K and
        "Ford's 3 recalls" no S-3. A dollar figure ("$10K") is no form.
      - With a form named, "filings", "reports" and "forms" beside it are dropped. Alone they
        would also match every title that says "filing" (a 6-K's, or a pre-2004 8-K's).
      - A form has no timeline of its own, so the focus bar does not offer one.
      - The best-matches list writes the form as typed: "“10-K” in the headline".
- [x] **The search box splits a form from the security** (`lib/prompt.ts`): "Apple 10-K",
      "Ford's 8-K filings", "TSMC 20-F" and "10-Q for Tesla" open the company's page narrowed to
      that form. A year still narrows too: "Apple 10-K filings in 2020". "Sony 4K" and "10-K"
      alone are left as they are.
- [x] Batch 39's open item is ticked.
- Measured live (2026-10-25), searched from the home page's box on the local database:
  - "Apple 10-K" opens AAPL with 34 of its 698 events, which is every title holding "10-K" (30
    annual reports, 2 amended, 2 10-K405s);
  - "Ford's 8-K filings" opens F with 803 of 2,337, every title holding "8-K";
  - "10-Q for IBM" opens IBM with 100 of 1,438, every title holding "10-Q".
  On main's code, "Apple 10-K" gave no focus: the page said nothing in "10-K" could be looked for.
- Checks: `check:focus` 66 → 74 and `check:prompt` 37 → 46. They cover the forms as terms, the
  look-alikes that are not forms, the 10-K's amendments and 10-K405, "8-K filings" not matching a
  6-K's "filing", the focus bar's and best matches' wording, and the search split with its
  guards. On main's code `check:focus` fails 2 cases and then stops, because the new helper it
  calls does not exist there; `check:prompt` fails 7 of its 9 new cases.

## NC ledger — batch 51: every Takeda and UBS 6-K read (2026-10-25)

Batch 48 left five wrong titles open at Takeda and UBS: a slogan in front of a headline, a label
said twice, a city left on the end, a table's header and a sentence's fragment. Each was a layout
that only a full read had shown. So this batch read every 6-K Takeda has filed since 2019 (343)
and UBS's (422 from UBS Group since 2016, and UBS AG's 49 since October 2025): 814 filings through
the reader, each title looked at.

`npm run check` passes (47 suites), `npm run lint` and `tsc --noEmit` are clean, and `next build`
passes. `check:ui` was not run: no page or component changed. HawkScan could not run:
`HAWK_API_KEY` is not set.

- [x] **What the read found, and the fix for each** (`lib/secHeadlines.ts`):
      - **Takeda's slogan**, "Better Health, Brighter Future". Alone on its line it is letterhead
        now, and at the front of a page set as one line it is taken off. Two titles opened with it
        and two were nothing else.
      - **A label said twice**: "Statement Statement on…" is said once.
      - **A city in small letters before its country in capitals**, in a page set as one line:
        "…in 2025 Osaka, JAPAN, May 8, 2025 –" is all dateline now, so two titles lose "Osaka".
        A two-word city is taken only when its first word opens one ("New York").
      - **A comma after the dateline's date**, "Osaka, Japan, May 15, 2020, --- On…", no longer
        hides the dateline. One title had been a numbered heading under it ("2.Details and
        rationale…"), and a filing that had no title now has its headline.
      - **A company's name in capitals**, as a signature sets it ("TAKEDA PHARMACEUTICAL COMPANY
        LIMITED"), is letterhead. One title had been that name.
      - **"not" alone on its line** was taken for the cover page's "No ☐" box, so everything above
        it was cut as cover page, the headline included. UBS's 2024 meeting notice was titled
        "stand for re-election after eight years of Board"; it is now "UBS publishes agenda for
        its Annual General Meeting on 24 April 2024".
      - **A report's numbered part**, "II – Treasury, risk, balance sheet…", was read as a place
        before a dash, like "DETROIT – …". Credit Suisse's half-year report, filed by UBS, was
        titled with its contents page; as a report, it now has no title.
      - **Headlines cut short at the end of a line** on a word no headline ends on: "Accepts"
        (and "Grants", "Receives"), "Ended" or "Ending" before a date, a plural's possessive
        ("…Nimbus Therapeutics’"), a length of time ("32-Week"), and "to" with a verb that takes
        an object ("to Evaluate", "to Release", "to Divest"). Seven titles now read whole.
- Measured (2026-10-25), each reader on the same saved copies of the documents:
  - Takeda and UBS, 814 filings: 21 titles change. 16 wrong titles become right. 3 filings with
    no title get their headline: two results releases under the slogan, and one under a dateline
    with a comma. The Credit Suisse report loses a title it should not have had. The 2019 notice
    titled by the company's name now gets its headline's first line; the whole headline reads as
    body text (see open). No filing went unanswered.
  - Everything read before gives the same titles: the 798 stored 8-K and 6-K documents from
    batches 42–44, and the 533 filings from batch 48's live read of 44 companies.
- [x] Batch 48's Takeda and UBS items are ticked.
- [ ] **Open** at Takeda and UBS after the read, each needing more than a rule can safely tell:
      - Cut short still: Takeda's "Notice regarding the Acquisition of the Entire Issued and To Be
        Issued" (… "Share of Shire plc…"), its 2019 capital notice (a headline of 253 letters,
        nearly all in small letters, which the reader takes for body text), and UBS's "Pricing of
        UBS Group AG Additional" ("Tier 1 instruments").
      - UBS's 2023 announcement of its new chief executive is titled by its first sentence (the
        batch 43 item), and a 2018 headline runs into its subheadline ("…Group Executive Board of
        UBS Kathy Shih retiring at year-end").
      - Two UBS quarterly reports are titled by their covers ("First Quarter 2021 Report Our
        financial results"), and a Takeda call transcript by its cover ("WAVE 1 PIPELINE MARKET
        OPPORTUNITY CALL (PART 2)…").
- `HEADLINE_VERSION` 5 → 6, so the titles stored by the old reading are read again.
- Checks: `check:sec-headlines` 224 → 247. The real documents rise from 127 to 140 (115 releases,
  25 that must give none), each new one read wrong by main's reader. Ten direct checks cover the
  rules on small cases, with guards where a rule must stop: a name's possessive ("…of McDonald's")
  still ends a line, "Results" before "New York, NY," stays in the headline, and "No ☐" is still
  the cover's. On main's reader 22 of them fail.
- `npm run check:live` (2026-10-25): "EDGAR — recent press releases read as headlines" passes on
  the new reader. As a whole: 21 pass, 0 fail, 5 unreachable (GDELT, which gives this session no
  answer), 1 skipped (Etherscan, no key).

## NC ledger — batch 50: a fund's first page knows it is a fund (2026-10-25)

Batch 46 left one item open: "a fund first visited before its industry is stored (GLD on a first
pass) is a `Corporation` until the scheduled ingest gives it one." Only the scheduled ingest
stored a company's SEC industry. The first visit, the gather that runs while the visitor waits,
took the filings and the price chart and nothing else. So GLD, told from a company by its industry
code (6221) and its name, was a `Corporation` on the page its first visitor saw. And every
company's first page went without its sector: the sector link and the comparison with it.

`npm run check` passes (47 suites), `npm run lint` and `tsc --noEmit` are clean, and `next build`
passes. `check:ui` was not run: no page or component changed. HawkScan could not run:
`HAWK_API_KEY` is not set.

- [x] **The first visit stores the SEC industry** (`lib/ingest/firstPass.ts`). The industry is a
      field of the same EDGAR record the filings are read from, so it is asked for at the same
      moment as the filings. It is an extra that never holds the page up:
      - it is not part of the 8-second deadline the filings and the chart have;
      - once the filings are in, it gets at most one more second (`INDUSTRY_GRACE_MS`), and then
        the page renders without it;
      - a refusal from EDGAR, or a record with no industry, means no industry;
      - it is saved before the page's events, so no reader sees the page without it, and outside
        their transaction, so a database refusal costs only the industry.
      The scheduled ingest still links the industry on its next run, as before.
- [x] Batch 46's open item is ticked.
- Measured live (2026-10-25), GLD on an empty database against the real EDGAR: with this change
  the first page is an `InvestmentFund` and shows its industry, "Commodity Contracts Brokers &
  Dealers". With main's code the same first visit gives a `Corporation` and stores no industry.
- Checks: `check:ondemand` 42 → 49. GLD's first visit runs end to end through a stand-in database
  and EDGAR record. It is linked to `sic-6221`, before its events. A record with no industry still
  renders, with no link. A link the database refuses leaves the page's rows written. An industry
  that never answers holds the page one second at most. On main's code 3 of them fail: no link is
  made, and there is no grace to keep to.

## NC ledger — batch 49: a live check of the headline reader (2026-10-25)

The 2026-10-25 audit closed on an opportunity: "the headline reader has no standing live check. A
small sampled read like the one above would have caught findings 1–3." Batches 47 and 48 each
found their faults by reading live filings by hand. Every fault was a filer's own layout that no
fixture held: a Japanese bank's legend, GSK's date line, Takeda's signature after the date,
Lloyds' exhibit index. A filer can bring in a new layout any week. This batch makes that read a
standing check.

`npm run check` passes (47 suites), `npm run lint` and `tsc --noEmit` are clean, and `next build`
passes. `check:ui` was not run: no page or component changed. HawkScan could not run:
`HAWK_API_KEY` is not set.

- [x] **`check:live` gains "EDGAR — recent press releases read as headlines"**
      (`scripts/check-live.ts`). It reads the newest five 8-Ks and 6-Ks of 16 filers through the
      real reader, paced under EDGAR's limit as the ingest is. The filers are four US companies,
      the 6-K layouts that went wrong once (the three Japanese banks, GSK, SAP, Takeda, Lloyds,
      BP, UBS) and three that never did (TSMC, ASML, Nomura). It fails on any title that has a
      mark no headline carries:
      - a signature or a disclosure's field;
      - a signer's title alone;
      - the SEC's cover page, an exhibit's label or index, or a page's furniture;
      - a date, or a place and date, alone;
      - an HTML entity left as written;
      - a company's name alone, matched against the filer's own name when the legal form is left off;
      - words cut off on a joining word, or on a figure after "its" or "the".
      It also fails when the reader finds a headline in fewer than one recent filing in eight,
      which is a broken reader rather than a filer's layout. A refusal from EDGAR is UNREACHABLE,
      as for every source. Like the rest of `check:live`, it stays out of the offline chain.
- [x] **The marks are kept to ones a real headline never carries,** so a FAIL is worth reading.
      Each was tried against every headline at hand:
      - none of the 103 headlines in the reader's fixtures matches;
      - none of the 554 read in batch 48 matches, beyond the 12 wrong titles batch 48 fixed;
      - none of the 464 the real ingest stored in batches 47–48 matches, beyond the 4 wrong titles
        fixed after those runs.
      Three marks were narrowed on the way. A title must have three words of any kind ("Q4 2025
      Update" is one). The cover page means "Form 20-F" and "Form 40-F" together, since a headline
      may announce a 20-F filing. A cut-off "A" must be lower case ("…haemophilia A").
- Measured live (2026-10-25): the case passes in 48 seconds (35 headlines from 80 filings, none
  flagged). The same sample read by batch 47's reader flags 7: Takeda's signer's title three times,
  Lloyds' exhibit index twice, BP's exhibit list and UBS's cover. These are the faults batch 48
  found by reading by hand, so the case would have found them. `npm run check:live` as a whole:
  20 pass, 0 fail, 6 unreachable (GDELT's five, which give this session no answer, and Wikipedia,
  which answers it 429), 1 skipped (Etherscan, no key).
- [ ] **Open:** the sample is 80 filings, so a fault at a filer outside it, or in an older layout,
  shows up only in the ingest's own titles. Batch 48's full read is the way to find those, and is
  worth repeating whenever the reader changes.
- Checks: `check:live-harness` 40 → 45: none of the fixtures' 103 headlines is taken for a wrong
  one; each of 15 wrong titles the reader once gave is caught; the company's name alone is caught
  by the filer's name, but a headline naming the company is not, nor "…haemophilia A" nor "…per
  Share of $1.12"; and the case samples both 8-K and 6-K filers. On main the harness cannot run:
  `headlineProblems` and `HEADLINE_SAMPLE` do not exist.

## NC ledger — batch 48: every headline read, and what the reading found (2026-10-25)

The open item that batches 42, 43, 44 and 47 carried, headlines cut short where a wrap and a
subheadline look alike, had last been measured in batch 42 at about one in ten. This batch measured
it again by reading all 554 headlines the stored samples and batch 47's live reads give: 306 from
the 378 stored 8-K exhibits, 62 from the 160 stored 6-Ks, and 186 from batch 47's live reads. Each
was shown beside the line after it, and the 192 where that line could have carried the headline on
were read one by one. Eight are cut short. The same reading found titles that are simply wrong, at
filers batch 47 did not sample, and those matter more.

`npm run check` passes (47 suites), `npm run lint` and `tsc --noEmit` are clean, and `next build`
passes. `check:ui` was not run: no page or component changed. HawkScan could not run:
`HAWK_API_KEY` is not set.

- [x] **Wrong titles** (`lib/secHeadlines.ts`):
      - Takeda's 6-Ks were titled "Chief Accounting Officer and Corporate Controller". Takeda signs
        after the date on one line ("Date: August 28, 2026 By: /s/ Norimasa Takeda"), and the
        signature was read only on a line it opened. It is read anywhere on its line now. That also
        reaches TSMC's signature, where a title under the name opens on the company's name ("TSMC
        Board of Directors Meeting Resolutions") and is the headline. So a signer's unlabelled title
        must now open on the title itself ("Chief…", "Senior…", "Member of…").
      - UBS's capital report was titled "Form 20-F ☒ Form 40-F ☐", its check boxes set one to a line.
        A cover page's own phrase is no headline, nor is "This Form 6-K consists of…". The report
        is not a release, so it gives none.
      - Five Lloyds 6-Ks were titled "Index to Exhibits Item". The index and its "No. 1 Regulatory
        News Service Announcement…" entry are letterhead; the titles are "Transactions in Own
        Securities".
      - BP's were titled by their exhibit list ("Ian Tyler appointed bp Chair dated 02 September 2026
        Exhibit 1.1"). An exhibit's label with any number is letterhead now, not only 99 and 20.
      - "Jpmorganchase" is JPMorganChase, and P&G's results deck loses its trailing "July 29, 2026
        EARNINGS RELEASE".
      - Takeda's two-city datelines ("OSAKA, Japan, and CAMBRIDGE, Massachusetts, …") were read from
        the second city, and the first was left on the headline ("…Chief Financial Officer
        Succession OSAKA, Japan, and"). It is dropped, on its own or at the end of a page set as one
        line.
- [x] **Cut short:**
      - A line opening on "And", "Of" or "Between" carries a headline of four words or more on:
        Intel ("…Open to Certain Investors" / "And Related Tender Offers…"), Schering-Plough
        ("…Public Offering" / "Of Common Shares…"), SAP 2010, and Mizuho ("…Business Alliance" /
        "Between Mizuho Bank and Rakuten Bank" / "and Expected Change…"). The four-word floor keeps
        a 1995 two-column release, with a contact's name between its headline's halves, untitled.
      - A figure after "its" or "the" ends no line: AMD's "…Tender Offer for its 6.00%" / "Convertible
        Senior Notes due 2015".
      - The place-and-date rule now needs a year. It read "MUFG Announces December 1 Closing Date of
        the Sale of" as a place and a date, dropped it, and titled the filing by its second line.
- [x] `HEADLINE_VERSION` 4 → 5, so every title stored by batch 47's reading is read again.
- Measured, every document read by main's reader and this one: 20 titles change across batch 47's
  live reads (15) and the stored samples (5), every one from wrong to right. Nothing else in the
  378 stored 8-K exhibits, the 160 stored 6-Ks, the 288 fresh 6-Ks or the 120 fresh US 8-Ks
  changes. The real ingest of Takeda, Lloyds, UBS and BP into a fresh scratch database (600
  filings read, 208 headlines) shows none of the faults fixed above. Its read turned up the Takeda
  first-city fault, fixed last and checked by reading those filings again.
- [ ] **Open:**
      - Cut short still, each needing more than a rule can safely tell: "Walmart Elects Charles
        Holley" (… "New Chief Financial Officer"), "Verizon Communications Establishes Record and
        Closing" ("Dates for…"), "Nomura to Announce Second Quarter", Mitsubishi UFJ's "…of
        Performance-Based" and "…the Sale of MUFG". Joining any line that cannot end on its own
        would fix the last two, but it also joins Cisco's headline to a subheadline that wraps.
      - ~~Takeda: page-per-line documents whose dateline is read from "JAPAN" leave "…in 2025 Osaka";
        a "Statement" label doubles ("Statement Statement on…"); a slogan opens one title ("Better
        Health, Brighter Future Takeda Settles…").~~ Fixed in batch 51.
      - ~~UBS: one title is a table's header ("Wealth Management Swiss Bank Asset Management…") and
        one a sentence's fragment ("stand for re-election after eight years of Board").~~ Fixed in
        batch 51.
- Checks: `check:sec-headlines` 206 → 224. The real documents rise from 112 to 127 (103 releases
  with the headline each must give, 24 that must give none). The 13 new ones above are each kept
  long enough that main's reader gets them wrong, and the fixture builder refuses one it gets
  right. Two are guards that read the same under both: TSMC's headline under its signer's title,
  and the 1995 two-column release. Direct checks: a signature after the date, a headline with a
  day and month in it, and the version. On main's reader 16 of the 18 new checks fail; the two
  that pass are the guards.

## NC ledger — batch 47: the headline audit's findings fixed (2026-10-25)

The `code-auditor` agent checked batches 42–46 on `258d6dc`. Its report is
`docs/audits/2026-10-25-headlines-audit.md`: five findings, three of them `P1`, all in the
headline reader's 6-K side. Each was reproduced live before it was fixed, from the filings the
report names. The 8-K side was clean, and stays unchanged: the 378 stored 8-K exhibits, the 160
stored 6-Ks and 120 fresh US 8-Ks (the newest 8 of 15 companies) read exactly as before.

`npm run check` passes (47 suites), `npm run lint` and `tsc --noEmit` are clean, and `next build`
passes. `check:ui` was not run: no page or component changed. HawkScan could not run:
`HAWK_API_KEY` is not set.

- [x] **Finding 1 (`P1`): a Japanese bank's 6-K titled by its signature** —
      "By: /s/ Yoshitaka Sekine Name: Yoshitaka Sekine", "Managing Director, Head of
      Documentation…". The cover page is now cut past the signature. That needed two things:
      - The banks' 370–430-character legend ("THIS REPORT ON FORM 6-K SHALL BE DEEMED TO BE
        INCORPORATED BY REFERENCE…") counts as cover, so it no longer stops the cut.
      - The signature counts too, in each layout found: one field to a line ("By:" over "/s/ …"),
        a label alone over its value ("Title:" / "Executive Officer & General Manager," /
        "Financial Accounting Dept"), and no labels at all (Nomura and ORIX print the name and the
        signer's titles under "/s/"). A title line counts only when it has no verb, so "Acme Names
        New Chief Operating Officer" under a signature stays a headline. And the signature counts
        only after a cover phrase, so an exhibit's own "Name:" is left alone.
      The same live read showed what sits under the signature, now letterhead too: the bank's name
      with its short form ("Mitsubishi UFJ Financial Group, Inc. (MUFG)", "… Co., Ltd. (MUMSS)",
      "… Inc. (TSE Code: 8306)", "…Group,Inc."), the Tokyo exchange's opening fields ("Company
      Name:", "Representative:", "Code Number:", "Stock code:"), and the company's name with its
      legal form left off when the dateline under it writes the name in full. A headline cut
      after "Regarding", "Concerning" or a slash now carries on.
- [x] **Finding 2 (`P1`): every GSK release titled "Issued: 20 October 2026, London UK".** A
      release's date line is noise: with "Issued:", without it ("24th August 2026, London UK"),
      and with the day as an ordinal, which the date pattern now reads anywhere. GSK's
      "Strictly embargoed until…" line is a release marker.
- [x] **Finding 3 (`P1`): the listed-release rule read any sentence, and could throw.** SMFG's
      September 2026 filing was titled by its May release, which its dateline cited. The rule
      now looks only above any dateline, at an entry that opens its own line (after at most the
      list's own words and mark: "List of materials Documents attached hereto: i) A press release
      announcing…", "Enclosure: Press release dated…"). A date, a rule or a scrap is no title.
      "Press release: ------" gave a TypeError, which kept that filing from ever being stored and
      counted it towards the three-failure stop; it now gives nothing.
- [x] **Finding 4 (`P2`): `&euro;`, `&pound;` and the other Latin-1 signs reached titles as
      written** ("SAP Proposes Dividend of &euro;2.20 per Share"). They are decoded now, and so
      are `&ensp;`, `&emsp;`, `&thinsp;` and a soft hyphen.
- [x] **Finding 5 (`P2`): the reader's documentation described batch 42 only.** The module header
      lists the four ways a document is marked as a release, in the order tried. The migration's
      comment says 8-Ks and 6-Ks and two to four requests (`db:migrate` tracks files by name, so
      the edit re-runs nothing). README says the signature is cut and where a listed title may
      sit.
- [x] Also from the live runs: a web page's credit above SAP's headline ("Source: … (sap.com)")
      and EDGAR's "Table of Contents" link are noise.
- [x] `HEADLINE_VERSION` 3 → 4, so every title stored by the old reading is read again, 150 a
      run.
- Measured live, every document read by main's reader and this one:
  - The audited filers, the 25 newest 6-Ks each of Mitsubishi UFJ, Mizuho, SMFG, GSK and SAP: 27
    titles change, every one from wrong to right. Mitsubishi UFJ 10 and Mizuho 3 lose their
    signatures; SMFG 2 (its own headline instead of May's, a capital-ratio notice instead of a job
    title); GSK 7 (an FDA approval among them, "Hibsago (bepirovirsen) approved in the US…"); SAP
    5 (4 euros, 1 "Source:").
  - 24 other foreign filers, 12 newest 6-Ks each (288): 10 change. Philips gains 7 (4 that were
    "/s/ M.J. van Ginneken", 3 that had no title), Nomura 2, and ORIX's financial results go from
    a signature to no title, which is true.
  - The real ingest into a fresh scratch database, 150 headlines read for each of Mitsubishi UFJ,
    GSK, Mizuho and SMFG: 256 found. Reading all 256 found the second wave of cases above (GSK's
    date lines without "Issued:", the bracketed bank names, SMFG's name without "Inc."); each is
    fixed and kept as a case, and a second clean run differs only in those.
- [ ] **Open:**
      - Headlines cut short where a wrap and a subheadline look alike, the class batches 42–44
        left open, turned up again: "Nomura to Announce Second Quarter" (for "…Operating Results
        on October 28"), "Notice Regarding Continuation of Performance-Based", "MUFG Union Bank to
        U.S. Bancorp". Each was a signature or worse before. Batch 48 measured the class (8 of 554)
        and fixed the last of these and five others; the first two stay open there.
      - The audit's note on one slow pattern (a 0.5 MB run of text with no line breaks takes 4 s;
        no real document comes near) is left as it is; the audit did not count it a finding.
      - The audit's suggestion of a standing sampled live check of the reader is for the
        `opportunity-scout`; not built here. Built in batch 49 as a `check:live` case.
- Checks: `check:sec-headlines` 177 → 206. The real documents rise from 92 to 112 (90 releases
  with the headline each must give, 22 that must give none): the audit's examples and the second
  wave from Mitsubishi UFJ, Mizuho, SMFG, GSK and SAP, Nomura's and Philips' signatures, and ORIX's
  results, which must give none. Each new document is kept long enough that main's reader gets it
  wrong, and the fixture builder refuses one it gets right. Direct checks: the citing sentence,
  the rule that threw, a date as a title and the headline under it, the list's own words before
  an entry, the entities, an exhibit's "Name:", a headline under a signature, and the version. On
  main's reader 27 of the 29 new checks fail; the other two guard the new rules from overreaching.

## NC ledger — batch 46: a fund described as a fund (2026-10-25)

Every security page told search engines it was a schema.org `Corporation` — SPY, VOO and GLD
included — and its description pegged the timeline to "the stock price". Batches 9 and 10 left it
so because "telling a fund from a company is not reliable from what is stored": the SEC files SPY
and GLD as companies and VOO only as a fund. Three stored things do tell them apart.

`npm run check` passes (46 suites), `npm run lint` and `tsc --noEmit` are clean, and `next build`
passes. `check:ui` passes 205/205 against the demo database. HawkScan could not run:
`HAWK_API_KEY` is not set.

- [x] **`isFund`** (`lib/sec.ts`), each signal measured against the committed index on
      2026-10-25:
      - a symbol in the index's registered-fund half — VOO, QQQ, IVV, VFIAX, ARKK, IBIT;
      - a name that says ETF or Fund — SPY, DIA and MDY are unit investment trusts in the company
        half with no industry code at all, but "SPDR S&P 500 ETF TRUST" says what it is. The company
        half has 384 such names (60 ETF, 324 Fund): closed-end funds, lending funds, crypto trusts,
        "United States Oil Fund, LP" — and the 8 whose other words do not say fund, read one by one,
        are funds too ("GDL FUND", "BANCROFT FUND LTD");
      - EDGAR's industry 6221 with a name that says Trust — GLD, IAU and SLV ("SPDR GOLD TRUST")
        file under "Commodity Contracts Brokers & Dealers". The code alone is not enough: EDGAR's
        list of 6221 registrants includes operating companies (Antalpha Platform Holding, AIB Data
        Centers). Nor is Trust alone, a bank's (Northern Trust) or a REIT's name as often.
      A business development company (Ares Capital) files as a company and stays one. None of the
      index's 300 largest companies is called a fund; 428 securities in its company half are.
- [x] **What the page says** (`lib/seo.ts` `securityLd`, `app/company/[ticker]/page.tsx`): a fund
      is an `InvestmentFund`, its ticker the identifier (schema.org gives an InvestmentFund no
      `tickerSymbol`); a company stays a `Corporation` with its `tickerSymbol`. A fund's
      description pegs the timeline to "its share price". The page data carries `fund`, asked of
      `isFund` with the stored industry code.
- [x] Batch 10's open item ("Not done: funds in JSON-LD") is ticked, and batch 9's note says so.
- [x] ~~**Open:** a fund first visited before its industry is stored (GLD on a first pass) is a
      `Corporation` until the scheduled ingest gives it one.~~ Batch 50: the first visit stores
      the industry, and GLD's first page is an `InvestmentFund`.
- Checks: `check:security-kind` (29), new and in the chain — registered funds, the trusts named by
  their names, the commodity trusts by code and name and not by either alone, companies under
  6221 or named Trust, the 300 largest companies, both structured-data shapes, and the wiring. On
  main's code it cannot run (`isFund` and `securityLd` do not exist). `check:ui` gains two: VOO's
  page carries an InvestmentFund block and no Corporation, and its description says share price.
  `check:wiring`'s check that a company's summary reaches search engines now finds it passed to
  `securityLd`, which trims it.

## NC ledger — batch 45: a filing titled by its press release links to that release (2026-10-25)

Batches 42–44 title an 8-K or 6-K by the headline of the press release filed with it, but its link
still opened the filing's own document. For an 8-K that is the SEC's cover form, which says only
that an exhibit is attached: a reader clicking "Boeing Raises Dividend 10 Percent…" got a page of
check boxes. The reader already stores which document each headline came from.

`npm run check` passes (45 suites), `npm run lint` and `tsc --noEmit` are clean, and `next build`
passes. `check:ui` was not run: no page or component changed. HawkScan could not run:
`HAWK_API_KEY` is not set.

- [x] **The link opens the release** (`lib/secHeadlines.ts` `releaseUrl`, `withHeadline`;
      `lib/ingest/headlines.ts`). A titled filing's link is the document its headline was read
      from, in the filing's own EDGAR folder: the press-release exhibit, a 6-K's own document, or,
      for a filing from before about 2001, its full submission text, which EDGAR serves from the
      folder too. The description adds "and the link opens it". Only a plain file name in an EDGAR
      filing's folder is ever linked; anything else keeps the filing's own link, and so does a
      filing read and found to have no headline.
- [x] **Applied wherever stored headlines are:** the scheduled ingest (for the filings it reads in
      the run and those read before) and the first pass. A filing's stored link is updated on its
      next ingest, since the store already replaces an attestation's link.
- [x] **Live:** Boeing's real ingest into the scratch database re-read 150 filings under batch 44's
      reading and stored links for all 189 titled filings, each in its own folder; 20 drawn at
      random, from 1997 submission texts to 2026 exhibits, all opened (HTTP 200) on the release.
- [x] **And a name:** a headline in capitals that starts "MC" keeps the name's shape — "MCDONNELL
      DOUGLAS" is McDonnell Douglas, "MCKESSON" McKesson — where it gave "Mcdonnell" (found in the
      same Boeing sample).
- Checks: `check:sec-headlines` 169 → 177 — the release link for an exhibit, a 6-K document and a
  pre-2001 submission text; never outside an EDGAR folder or for a name with a path or another
  kind of file; stored readings and a run's fresh reads applied to the link; the stand-in database
  now keeps the document's name; two names beginning "MC". On main's code the check cannot run
  (`releaseUrl` does not exist), and main's `applyHeadlines` leaves every link on the cover form.

## NC ledger — batch 44: results releases the headline reader gave up on (2026-10-25)

A results release is the filing most likely to explain a price move, and many gave no headline:
the reader of batches 42–43 counts a document as a press release only by a dateline ("CITY, Date
—") or a lead paragraph that says "today", and JPMorgan, Walmart, Exxon, Tesla, Novartis and others
write results releases with neither. Their 8-Ks kept "Earnings announcement (8-K)" and their 6-Ks
"6-K filing". Of the results exhibits in batch 42's two samples, 30 of 173 gave nothing. This batch
reads the ones that can be told apart from what is not a release, and closes most of what batches
42 and 43 left open.

`npm run check` passes (45 suites), `npm run lint` and `tsc --noEmit` are clean, and `next build`
passes. `check:ui` was not run: no page or component changed. HawkScan could not run:
`HAWK_API_KEY` is not set.

- [x] **A results headline with nothing else to mark it** (`lib/secHeadlines.ts`). With no dateline
      and no lead paragraph, the first line under the letterhead that reads as a headline is taken
      — but only when it announces results: a company reports, announces, posts or delivers
      results, earnings, net income, EPS, revenue, sales or guidance, or a quarter's results,
      update or deliveries ("JPMorgan Chase Reports Third-Quarter 2022 Net Income of $9.7
      Billion…", "Tesla Q1 2017 Vehicle Production and Deliveries", "Novartis delivers solid sales
      and core operating income growth… in Q3"). A shareholder letter ("Dear Fellow Shareholders"),
      a set of statements, a call's transcript, a supplement and a slide deck's title give nothing,
      and so does a first line that announces anything else. It looks no further than 15 lines.
- [x] **What else the reader had given up on:**
      - a bullet's mark set on a line of its own joins its text, so a page of bullets no longer
        pushes a dateline past line 40 (Cisco 2022, at line 40); an empty bullet before a dateline
        is dropped (UBS);
      - "News Summary:" is no letterhead (Cisco's contacts' names had become its headline);
      - "CINCINNATI, Nov.1, 2005 -" is a dateline, the day set straight after the month's point;
      - Business Wire's old routing code before a headline, "( BW)(CA-AMGEN-INC)(AMGN)", and its
        "Business Editors/…" line are dropped;
      - in a scanned page run together, a place in capitals whose sentence says "today" is a
        dateline ("DETROIT – General Motors Co. (NYSE: GM) today reported"), and the release time
        before the headline ("…at 6:30 a.m. ET") is cut;
      - a capitals line that opens on the line above's first two words starts a headline of its
        own ("AMERICAN EXPRESS Q3 2026 RESULTS" / "AMERICAN EXPRESS RAISES…");
      - a headline carries on after "Following", "including" or "during" (CVS 2018), and a year
        after "of" ends one (Baidu 2005, no longer run into its subheadline);
      - names a headline in capitals spells as words keep their own spelling — JPMorgan,
        UnitedHealth, NVIDIA, ExxonMobil, GlaxoSmithKline, PepsiCo and a few more, a short list;
      - a footnote's number or a trademark's letters set on a word are dropped ("core1",
        "PluvictoTM", "spin-off,2"), never a model's number ("PS5") or a figure ("3.5").
- [x] **Measured.** The three samples and four companies already in the scratch database, every
      changed headline read:
      - **8-Ks, batch 42's samples:** 155 → 164 of 211 and 135 → 142 of 167 exhibits give a
        headline. All 16 new ones are right; 6 more changed for the better (ExxonMobil, NVIDIA and
        UnitedHealth spelled right, CVS no longer cut short).
      - **6-Ks:** 60 → 62 of 160 (BP's "First Quarter 2005 Trading Update", Spotify's "Q4 2025
        Update"), and Baidu 2005 no longer runs on.
      - **Live,** each company's stored filings read once from EDGAR and given to batch 43's reader
        and this one: Boeing 167 → 208 of 336 (40 quarterly results releases, 2003–2019, and a CFO's
        retirement), Pfizer 108 → 109 of 150 (and GlaxoSmithKline spelled right twice), Novartis
        116 → 132 of 150 (16 results releases; four lost a "TM" or footnote mark), NIO unchanged
        at 203 of 274. Every one of the 64 changes read right but one, "…Board endorses Sandoz
        spin-off,2", whose footnote after a comma is now dropped too.
- [x] **Read again:** `HEADLINE_VERSION` is 3, so every filing read by batches 42–43 is read again
      under this reading, a run's worth at a time.
- [x] Batches 42's and 43's open items now say which this batch closed: Exxon's 2004 results,
      Tesla's deliveries and letters, Novartis's results, names in capitals, CVS, Baidu and the
      marks. README says what counts as a release.
- [ ] **Open:**
      - Netflix's results are letters and Tesla's recent ones are decks run together as one page;
        both keep "Earnings announcement (8-K)".
      - Amgen's 2012 headline is four lines in capitals and is cut after the second; SAP's
        "Quarterly Statement Q2 2026" is too short to count as a headline, so a subheadline stands
        in.
      - The list of names spelled their own way is short; any other name written in capitals is
        still recased as a word.
- Checks: `check:sec-headlines` 142 → 169. The real documents rise from 74 to 92 (71 releases with
  the headline each must give, 21 documents that must give none): 12 results releases and other
  cases above, 6 that must stay untitled (two Netflix letters, GE's statements, an Exxon analyst
  meeting, a Nike call transcript, AMD's accounting note), and Exxon's 2004 results, which moved
  from "none" to its headline. Direct checks cover the name spellings, bullet marks and
  footnote marks. Batch 43's reader gets 17 of the 92 documents wrong.

## NC ledger — batch 43: a foreign company's 6-K titled by its announcement's headline (2026-10-25)

A foreign company files its news as a 6-K, and every 6-K was titled "6-K filing" — NIO's monthly
deliveries, Novartis's drug approvals, Shell's buybacks all looked alike on the timeline. Batch 42
taught the reader to take a press release's headline from an 8-K and left 6-Ks open. This batch
reads them, and along the way the reader learned to recognise a release with no dateline, which
also titles more 8-Ks.

`npm run check` passes (45 suites), `npm run lint` and `tsc --noEmit` are clean, and `next build`
passes. `check:ui` was not run: no page or component changed. HawkScan could not run:
`HAWK_API_KEY` is not set.

- [x] **6-Ks are read** (`lib/secHeadlines.ts`). A 6-K's announcement is either attached (EX-99,
      the way an 8-K carries one) or is the 6-K's own document under the SEC's cover page. The
      attachments are read first, then the 6-K's own document with its cover page cut ("REPORT OF
      FOREIGN PRIVATE ISSUER…", the check boxes, the signature). Every 6-K is asked, since a 6-K
      lists no items. The title becomes "NIO Inc.: NIO Inc. Provides April 2023 Delivery Update
      (6-K)". A Japanese 6-K that lists its release by title ("Press release entitled “Agreement
      to Transfer to Sony Certain Epson Business Assets…”") gives that title. A routine 6-K — a
      monthly return on shares, a buyback report, a set of accounts, a director's share dealing —
      gives nothing and keeps "6-K filing".
- [x] **A release with no dateline.** European and Asian companies often write none: "Shell plc
      (the 'Company') today announces…". With no dateline in the first 40 lines, a long lead
      paragraph in which the company announces, reports or declares something "today" (or under
      its exchange symbol, "(NYSE: BABA and HKEX: 9988…) announces") marks the release, and the
      headline is read above it — but only below the letterhead, never guessed from above it.
- [x] **What foreign releases taught the reader**, each kept as a real case in the check:
      "Media Release · Communiqué aux médias · Medienmitteilung" and "Financial Results |
      Résultats financiers | Finanzergebnisse" are letterhead; "Ad hoc announcement pursuant to
      Art. 53 LR" under a headline does not push the search below it; a day-first date ("10 July
      2017"), a country after "the" ("VELDHOVEN, the Netherlands"), a second city not in capitals
      ("Burbank, CA and Las Vegas, NV (February 6, 2006) —", which also fixed a Disney 8-K that
      gave "ABC Radio Station Group New York, NY") and international phone numbers are read; a
      long headline in sentence case is no longer mistaken for body text (Novartis writes them
      near 200 characters long); accented capitals recase as letters ("NESTLÉ" → "Nestlé", never "NestlÉ");
      a currency in a dealing table ("GBP - British Pound") and a contents line ("CORE RESULTS -
      Reconciliation from…") are no datelines; "…Delivery Update" ends a headline, "Update" being
      a noun there.
- [x] **Measured.** Three samples, all read from EDGAR:
      - **6-Ks:** 160 from 16 companies, 1998–2026. 60 give a headline (26 from an attachment, 34
        from the 6-K's own document); main reads none, as it never asks a 6-K. Of the 60, two run
        into a subheadline (Baidu 2005, SAP 2026); most of the 100 without one are routine filings.
      - **8-Ks, the batch 42 samples:** 139 → 155 of 211 exhibits and 108 → 135 of 167 give a
        headline. Of the 43 new ones, 41 read right and 2 are cut short (CVS 2018, Amgen 2012).
        Three changed: GM's 2026 results keep the second half of a two-line headline ("…; Board
        approves new $20 billion share repurchase authorization, declares quarterly dividend"),
        and Oracle 2018 and 3M 2008 drop a subheadline they had run into.
      - **Live, through the real ingest** into a scratch database: NIO's 274 6-Ks took two runs
        and gave 203 headlines (first run 2 min 28 s for every source, second 48 s; 4 filings
        could not be read on the first run and were read fine on the second). Of 45 drawn at random, 40 were right
        and 5 ran on into the line under them ("…Delivery Update Company Achieved New Record-High
        Monthly Deliveries"); fixed, and a re-read of all 274 changed exactly those 22. Novartis's
        first run read 150 of its 936 and gave 91; of 45 drawn at random, 37 were right, 3 were the
        title of a "supplementary data" report rather than a release, and 5 were wrong (letterhead,
        or a bullet taken where the headline was long). Fixed: the same 150 now give 116 and lose
        the report titles; a fresh 40 drawn from the 116 were all right.
- [x] **Stored readings are refreshed.** `HEADLINE_VERSION` is 2, so every 8-K read by batch 42 is
      read again, a run's worth at a time, under the new reading.
- [x] The 2026-10-22 sources shortlist and batch 42's open item ("A foreign company's 6-K… is not
      read yet") now point here; README, `docs/COVERAGE-MAP.md` and the ingest's log line say
      "8-Ks and 6-Ks".
- [ ] **Open:**
      - Novartis's results releases put a page of bullets between the headline and the dateline,
        past line 40, so they give nothing; the reader gives up rather than guess. Titled since
        batch 44, by their results headline.
      - A long headline is still sometimes cut short or run into a subheadline (CVS 2018, Amgen
        2012, Baidu 2005, SAP 2026), and a trademark or footnote mark can stay on a word
        ("PluvictoTM", "core1"). Batch 44 fixed CVS, Baidu and the marks; Amgen 2012 and SAP 2026
        stay open.
      - UBS puts a one-sentence summary where a headline goes; that sentence becomes the title.
      - A big foreign filer's history fills in slowly: Novartis's 936 6-Ks take about seven runs.
- Checks: `check:sec-headlines` 96 → 142. The real documents rise from 45 to 74 (58 releases with
  the headline each must give, 16 documents that must give none; first written as 57 and 17,
  corrected in batch 44), among them 25 6-Ks and the five
  mistakes found in the live runs; the 6-K index pages of Shell (announcement in its own document)
  and NIO (attached), read through a stand-in EDGAR; the cover-page cut, the lead rule, listed
  titles, the 6-K title and which 6-Ks are asked. On main's code the check cannot run (the cover
  page, lead and listed-title readers do not exist); main's reader gets 23 of the 74 documents
  wrong.

## NC ledger — batch 42: an 8-K titled by the headline of its press release (2026-10-24)

An 8-K was titled by its item — "Other events (8-K 8.01)", "Officer or director change (8-K
5.02)" — which says what kind of thing was reported and not what it was. Many 8-Ks carry the
company's press release as an exhibit, and its headline is what a reader looking at a price move
wants. The 2026-10-22 sources shortlist named this ("The press release inside each 8-K") and left
it unbuilt because the headline is hard to pick out reliably. This batch picks it out, and only
when it can tell the document is a press release.

`npm run check` passes (45 suites), `npm run lint` and `tsc --noEmit` are clean, `next build`
succeeds, and `check:ui` passes 203/203 against the demo database (re-run because the timeline's
filing stacks changed). HawkScan could not run: `HAWK_API_KEY` is not set.

- [x] **The headline reader** (`lib/secHeadlines.ts`). An exhibit (EX-99, or EX-20 before 2004)
      counts as a press release only when a dateline — "DEARBORN, Mich., Sept. 1, 2004 –",
      "CUPERTINO, CALIFORNIA —" — sits in its first 40 lines; a contract, slide deck, certification,
      prospectus, set of financial statements or court notice filed as EX-99 gives nothing, and the
      filing keeps its item title. The headline is the first line above the dateline after the
      letterhead (contacts, phone numbers, addresses, release markers), joined with the lines it
      wraps onto and kept apart from its subheadline and bullets. A headline in capitals is recased
      ("IBM", "UPS", "Non-GAAP", "McDonald's" kept right); one in mixed case is the filer's own.
      Windows dashes and quotes (`&#151;`, raw 0x97) are read as such: a dateline's dash is what the
      reading turns on, and Node's own windows-1252 decoder returns them as control codes.
- [x] **Measured before it was wired in.** 638 8-Ks sampled from 57 companies, 1994–2026, all read
      from EDGAR on 2026-10-24: 25 companies to build the reader against, then 32 others. 378 carried
      an EX-99 or EX-20 and 247 gave a headline. Read one by one:
      - **The second sample, on its first run:** 107 headlines, of which about 92 were right, 12 cut
        short and 3 wrong (a contact's name and title, a court's caption, a headline run into its
        subheadline). Those mistakes were then fixed, so the 108 it gives now — about 100 right, 6
        cut short, 2 that are a subheadline rather than the headline (Oracle) — are not an untouched
        measure.
      - **Live, through the real ingest** into a scratch database: Boeing's 336 8-Ks that can carry
        a release took three runs and gave 164 headlines; of 41 drawn at random, 38 were right and 3
        wrong (a 1997 table row, a subheadline under a rule, a bullet label run on). Pfizer's first
        run read 150 and gave 107; of 45 drawn at random, one was wrong (the time the release went
        out). All four were fixed and are cases in the check; none of the wrong ones remains.
- [x] **Read once, kept** (`db/029_sec_headlines.sql`, `lib/ingest/headlines.ts`). Reading a
      filing costs two or three EDGAR requests — its index page, then the release, or for a filing
      from before 2001 its full submission text — and a filing never changes, so each 8-K is read
      once and the answer stored by accession number: the headline, or none. The scheduled ingest
      reads up to 150 a run, newest first, paced under 8 requests a second; it stops at the first
      refusal or after three failures in a row, and a filing that could not be read is not stored,
      so it is asked again. Each run applies everything stored. A whole Boeing ingest, every
      source, took 89 s with 150 headlines read and 56 s with the next 150.
      - **Only 8-Ks that can carry a release are asked:** since 2004, one listing exhibits (9.01) or
        an announcing item (2.02, 7.01, 8.01, 5.02, 2.01). A shareholder vote filed bare is not; of
        the 541 sampled 8-Ks filed since 2004 that skipped 37, 36 with no exhibit at all.
      - **An enrichment:** if the headline step fails — the table missing, EDGAR down — the filings
        are stored with their item titles, as before. The first pass applies headlines already
        stored and never reads EDGAR for them, so a first pass that runs again cannot put the item
        titles back.
      - `HEADLINE_VERSION` marks the reading that produced each row; when the reading improves, rows
        from an older version are read again, a run's worth at a time.
- [x] **The title keeps its form:** "Boeing Co: Boeing Sets 787 First Delivery Date for Mid-First
      Quarter 2011 (8-K 8.01)", the item's name moved into the description. The timeline's filing
      stacks read the form from the closing brackets now, so a headline that names another form
      ("…Regarding 2008 10-K Earnings per Share Data (8-K 8.01)") no longer renames the stack.
      Headlines are words a focused search can match: "dividend" now finds "Boeing Raises Dividend
      10 Percent…", which was "Other events" before.
- [ ] **Open:**
      - Some headlines are cut short where a wrap and a subheadline look alike ("Walmart Elects
        Charles Holley" for "…New Chief Financial Officer"), and a few run a capitals headline into
        a subheadline in capitals ("Pfizer Reports Fourth-Quarter and Full-Year 2016 Results
        Provides 2017 Financial Guidance"). A name written in capitals is recased as a word
        ("Nvidia", "Exxonmobil") — the well-known ones spelled right since batch 44.
      - A release whose dateline sits below 40 lines of tables (Exxon's 2004 results) gives nothing,
        by design: further down, a place and a date are too often inside something else. Since
        batch 44 such a release is titled by its results headline instead.
      - Netflix's and Tesla's results are letters and decks with no dateline, so their earnings 8-Ks
        keep "Earnings announcement (8-K)". Since batch 44 Tesla's delivery releases and update
        letters are titled; Netflix's letters and Tesla's decks still are not.
      - A foreign company's 6-K carries its press releases the same way — read since batch 43. Only
        a filing's first two release exhibits are read.
      - A bank's structured-note 8-Ks (JPMorgan filed about 700 in 2005–2008) list 9.01 and are
        asked; each costs one request to find no release, spread over its runs.
- Checks: `check:sec-headlines` (96), new and in the chain. 35 real press releases with the headline
  each must give and 10 exhibits that are not releases, the index pages of three real filings, a
  stand-in EDGAR for the reading of one filing, and a stand-in database for a run's limits, order,
  failures and stored answers. On main's code it cannot run: the reader does not exist. With main's
  `EventList`, the filing-stack check fails ("10-K ×3").

## NC ledger — batch 41: FDA recalls for Johnson & Johnson and the businesses that changed hands (2026-10-24)

Batch 40 left J&J and a few others unmapped because their firms are mostly not named for them,
and each changed hands on a day that needs its own source. This batch maps them, each day from the
company's own SEC filing, and follows J&J's sold businesses to their listed buyers.

`npm run check` passes (44 suites), `npm run lint` and `tsc --noEmit` are clean. `check:ui` was not
re-run: only the firm map, its check and the docs changed, no page, component or route. The FDA
case in `check:live` is unchanged. HawkScan could not run: `HAWK_API_KEY` is not set.

- [x] **Johnson & Johnson (485 recalls, 298 before 2017):** the units named for it and its long-held
      companies (Ethicon, DePuy, Janssen, Biosense Webster, Mentor, Acclarent), with:
      - **bought:** Synthes from 2012-06-14 (J&J's 8-K filed 2012-06-14), Abbott Medical Optics from
        2017-02-27, Auris Health from 2019-04-01 (J&J's 10-K for 2019), Abiomed from 2022-12-22 (8-K
        filed 2022-12-22), Shockwave Medical from 2024-05-31 (10-Q filed 2024-07-25);
      - **sold:** Ortho-Clinical Diagnostics to 2014-06-29 (sold to Carlyle 2014-06-30, 8-K filed
        2014-06-30), Cordis to 2015-10-01, Codman to 2017-10-01, LifeScan to 2018-10-01 (its sale
        announced complete 2018-10-02, 8-K filed that day), Advanced Sterilization Products to
        2019-03-31;
      - **its consumer business** ("Johnson & Johnson Consumer", McNeil) to 2023-08-22: its exchange
        offer for Kenvue completed 2023-08-23 (8-K filed 2023-08-25).
- [x] **Followed to the buyers that are listed:**
      - **Kenvue:** its own names, and the consumer names from the close of its IPO on 2023-05-08
        (Kenvue's 8-K filed 2023-05-08). Until 2023-08-23 J&J still held most of Kenvue, so a recall
        in those months is both companies'. One recall so far.
      - **Cardinal Health (97):** its own, and "Cordis Corporation" from 2015-10-02 (Cardinal's 10-Q
        filed 2015-11-03). Cardinal says only that it sold Cordis in the quarter to 2021-09-30, so
        Cordis counts to 2021-06-30, the last day its filings show it held it; the buyer files as
        "Cordis US Corp", which counts for no one.
      - **Integra LifeSciences (112):** its own named sites, and Codman from 2017-10-02 (Integra's 8-K
        filed 2017-10-02). A firm called "Integra Limited" is left out as not shown to be Integra's.
      - **QuidelOrtho (49):** Quidel's, since QuidelOrtho carries Quidel's ticker, and Ortho-Clinical
        from the combination on 2022-05-27 (QuidelOrtho's 10-K for 2022). Ortho-Clinical's recalls
        between the Carlyle sale and the combination count for no one.
      - **Fortive** bought Advanced Sterilization Products, but no recall has been filed under the
        name since, so it has no entry.
- [x] **Novartis (62):** its own, its consumer business to 2015-03-01 (into GSK's joint venture on
      2015-03-02, Novartis's 20-F for 2015), Sandoz to 2023-10-03 (spun off 2023-10-04, 6-K filed
      2023-10-04), and Alcon to 2019-04-08. **Alcon (25)** from its spin-off on 2019-04-09 (Alcon's
      20-F for 2019).
- [x] **Viatris (27):** its own, and Mylan and Greenstone from its formation on 2020-11-16 (8-K/A filed
      2020-11-19). Viatris does not carry Mylan's ticker, so Mylan's earlier recalls are not its;
      Greenstone counts for Pfizer until then (Pfizer 82 → 86).
- [x] **Teva:** Actavis from 2016-08-02 (6-K filed 2016-08-02). **Smucker:** Hostess Brands from
      2023-11-07 (8-K filed 2023-11-07); none filed under the name since.
- [x] **Now 38 companies and 4,690 recalls,** every one answering live on 2026-10-24.
- [ ] **Open:**
      - Kellogg's two companies, Kellanova and WK Kellogg, are no longer in the company index, so
        they have no page. Celgene and Big Heart Pet Brands have no FDA records.
      - Cardinal's Cordis cut-off is a bound, not the closing day; a filing that names the day would
        let it run to the end.
- Checks: `check:fda-recalls` 29 → 37, on 25 more real openFDA records (51 in all). On main's code it
  stops at the first new case (J&J is not mapped). One check holds every day a firm joined or left
  a company to an SEC filing.

## NC ledger — batch 40: FDA recalls on drug, device and food companies' pages (2026-10-24)

The owner approved FDA enforcement reports on 2026-10-24, #3 in
`docs/proposals/2026-10-22-news-sources.md`, now marked APPROVED. A health or food company's page
now carries its drug, medical-device and food recalls from mid-2012: about 3,800 across 30
companies.

`npm run check` passes (44 suites), `npm run lint` and `tsc --noEmit` are clean. `check:ui` passes
203/203 against the demo database. `check:live` gains an FDA case, which passes run on its own; the rest of `check:live` was not run.
HawkScan could not run: `HAWK_API_KEY` is not set.

- [x] **Measured first** (openFDA, 2026-10-24):
      - **A record is one product, not one recall.** A recall of several products shares an event
        number: Medtronic's 1,270 device records are 420 recalls.
      - **Firm names are free text.** Medtronic files under more than 25 spellings ("Medtronic
        Vascular", "Medtronic Inc., Cardiac Rhythm and Heart Failure (CRHF)", "COVIDIEN MEDTRONIC").
        Some look-alikes are other companies: "HERSHEY CREAMERY CO.", "Merck Millipore Ltd."
        (Germany's Merck), "Tim Campbell Farm LLC".
      - **Unbracketed, openFDA answers an OR for the last name only:** `recalling_firm:"Medtronic"
        recalling_firm:"Covidien"` gave Covidien's 573 records; bracketed, 1,787.
      - **A search that matches nothing is a 404,** not an empty list.
      - **The enforcement report's own page shows a recall's event** (`ires/index.cfm?Event=…`),
        once its script has run: checked in Chromium for Medtronic's event 93163.
- [x] **The source** (`lib/fdaRecalls.ts`, `fda_enforcement`, public domain under CC0, licence read
      2026-10-24):
      - **`FDA_FIRMS` maps 30 companies by hand:** a phrase the company's firm names contain, the
        look-alikes left out, and the days ownership changed, each from the company's own SEC
        filing. Covidien counts for Medtronic from 2015-01-26 (8-K filed 2015-01-27); Hospira for
        Pfizer from 2015-09-03; St. Jude for Abbott from 2017-01-04 and Alere from 2017-10-03; Abbott
        Medical Optics stops being Abbott's after its sale to Johnson & Johnson on 2017-02-27 (10-Q
        filed 2017-05-03); Bard counts for Becton Dickinson from 2017-12-29; Biomet for Zimmer from
        2015-06-24; "GE Healthcare" is GE's until the spin-off on 2023-01-03 (8-K filed 2023-01-04)
        and GE HealthCare's from 2023-01-04. Joint ventures (Philips–Neusoft, Wipro–GE) are left out.
      - **Class I and II only.** Class III, unlikely to cause harm, is left out.
      - **One event per recall:** its first day, its most serious class, the first product named,
        with "(3 products)" when there are more, the recall's reason beneath, and a link to the
        report's page. "Class I device recall: MiniMed 780G Insulin Pump (3 products)".
      - **A product name from a label:** the text before the first comma, model, catalogue, UPC or
        lot number, after a label word ("Vial Label:") or a package size ("28 oz. Gatorade…").
      - **A start date before 2000, or after the report published it, gives way to the report's
        date.** One record in all three sets is like that: an Intuitive Surgical recall published
        2013-11-13 that says it started on 1930-12-11.
      - **Asked daily** for all three product types, a page per 1,000 records. 1,000 requests a day
        without a key; three to six a day per mapped company.
- [x] **Counts, live, 2026-10-24** (recalls; Class I in brackets): Philips 590 (29), Medtronic 532
      (62), Zimmer Biomet 383 (4), Stryker 330 (6), GE 281 (19, to the spin-off), Baxter 279 (54),
      Becton Dickinson 267 (11), Abbott 224 (20), Boston Scientific 183 (25), Teva 121 (7), Smith &
      Nephew 119 (0), Teleflex 108 (16), Intuitive Surgical 104 (1), Pfizer 82 (20), Edwards 49 (8),
      PepsiCo 45 (22), General Mills 23 (10), GE HealthCare 22 (1), Conagra 20 (8), Mondelez 16 (3),
      Kraft Heinz 9, ResMed 7, Bristol Myers Squibb 6, Merck 6, Smucker 6, Hormel 4, Lilly 4, Tyson
      3, Campbell 2, Hershey 2. Before 2017: Medtronic 147 of 532, Philips 232 of 590.
- [x] **On the page:** Medtronic ingested into a scratch database stored all 532, each scored as
      the company's without the model, as a vehicle recall is. Its page shows them under the Recalls
      chip, linked to the FDA's page for each.
      - **A Class II recall is drawn as a plain dot and ranked like a news story** (`markerStyle`,
        `markerPriority`, `lib/markers.ts`). With all 532 drawn as an "R", Medtronic's five-year
        chart was covered in them. Class I and every vehicle recall keep the R.
      - The chart's legend says "Recall", not "Vehicle recall", and a recall's relevance reason no
        longer says "vehicle maker".
- [x] The FDA is credited in the footer and the Terms with the other sources; README and
      `docs/COVERAGE-MAP.md` describe it.
- [ ] **Open:**
      - **Not yet mapped:** Johnson & Johnson (its firms are mostly not named for it: Ethicon,
        DePuy, Janssen, McNeil, and Kenvue's separation in 2023), Kellogg and WK Kellogg (split in
        2023), Novartis with Sandoz (spun off 2023), Smucker's Hostess and Big Heart, Bristol Myers
        Squibb's Celgene, Teva's Actavis, Viatris. Each needs its own dates. Hologic is not in the
        company index. ✅ **Batch 41: J&J, Kenvue, Novartis with Alcon and Sandoz, Viatris, Teva's
        Actavis, Smucker's Hostess, and the buyers of J&J's sold businesses are mapped.** Kellogg's
        two companies left the index; Celgene and Big Heart have no FDA records.
      - A product name is sometimes awkward: "Medtronic Grafton DBF Inject: a) GRAFTON T50303 DBF
        INJECT 3CC (12 products)".
      - The list carries every Class II recall: 137 of the 242 rows Medtronic's page opens with.
- Checks: new `check:fda-recalls` (29), wired after `check:doj`, on 26 real openFDA records in
  `scripts/fixtures/fda-recalls.json`. On main's code it cannot load (`lib/fdaRecalls.ts` does not
  exist).

## NC ledger — batch 39: the focus bar never claims a match it did not make (2026-10-24)

Batch 38 found this in passing. A focused search whose words are all too short or too common
narrows nothing, so every event comes back, and the focus bar then said every event mentions it.
Real questions do this: `lib/prompt.ts` leaves "5G" as the focus of "how did 5G affect Verizon's
stock", "in Q3" of "Ford in Q3", and "the US", "the EU" and "the UK" of "how did the US affect
Ford" and its like. Each kept no focus word.

`npm run check` passes (43 suites), `npm run lint` and `tsc --noEmit` are clean. `check:ui` passes
203/203 against the demo database. HawkScan could not run: `HAWK_API_KEY` is not set.

- [x] **A two-character word made of a letter and a digit is a focus word** (`SHORT_CODE`,
      `lib/focus.ts`): "5G", "Q3", "4K", "3D". Too specific to turn up by chance, where the other
      short words are not: "us", "eu" and "in" turn up in every other headline, and a place has a
      timeline of its own (the concept list keeps places out for the same reason). A number
      alone stays out, so "COVID-19" gains no "19".
- [x] **A focus with nothing to look for says so** (`components/FocusBar.tsx`). It used to say
      "Showing the 52 of 52 events that mention “the US”". Now: "Nothing in “the US” can be looked
      for in headlines: words under three letters and common words like “the” are skipped. This is
      the whole timeline." It is shown like a focus that matched nothing, with Dismiss.
      - In Chromium on the demo Ford page: "the US" shows that line over all 46 rows, "5G" says
        nothing on the timeline mentions it, and "NHTSA" still narrows to its 3 events.
- [x] ~~**Open:** "8-K" still has nothing to look for. GDELT and the feeds write "8-K" as two short
      pieces, "8" and "K", and a single character is never a focus word. "8-K filings" works,
      through "filing".~~ Batch 52: a form's name is one focus term, "8-K" narrows to the 8-Ks,
      and the search box splits "Ford 8-K" into Ford and its 8-Ks.
- Checks: `check:focus` 60 → 66. On main's code 4 of the new cases fail: "5G" and "Q3" give no
      focus word, so "how did 5G affect Verizon" narrows nothing, and the bar says "Showing the 3
      of 3 events that mention “the US”" and the same for "5G".

## NC ledger — batch 38: a long timeline opens with its older years folded (2026-10-24)

Batch 35 left this open: JPMorgan's page was still 7.1 MB, and "what is left is the 4,652 rows the
browser lays out." Every row of the timeline list was drawn and laid out when a page opened, from
1799 down, for a reader who came for this year. Now a long list opens with its recent years and
folds the rest.

`npm run check` passes (43 suites), `npm run lint` and `tsc --noEmit` are clean. `check:ui` passes
203/203 against the demo database, whose pages are short enough to open whole. HawkScan could not
run: `HAWK_API_KEY` is not set.

- [x] **Measured first, in Chromium** (2026-10-24, the scratch database from batch 35: JPMorgan's
      real EDGAR, Yahoo and GDELT rows plus 3,000 stand-in stories, and the real Ford, IBM, Apple
      and UPS rows; each page opened three times, medians). On main's code:
      - **JPMorgan:** 2,212 event rows, 32,971 elements, 385 ms of layout and 264 ms of style
        work; ready (DOMContentLoaded) at 848 ms. Its 2026 alone has 382 rows.
      - **Ford:** 1,979 rows and 298 ms of layout. **IBM:** 1,048 rows. **Apple** and **UPS:**
        about 610 each.
      - This container is fast. A phone does the same layout several times slower.
- [x] **A long list opens with its older years folded** (`OPEN_ROW_BUDGET` = 300 and
      `foldedYears`, `components/EventList.tsx`). The newest years stay open while their rows
      fit 300, and the newest year is always open. The first year that does not fit, and every
      year before it, start folded. A stack of filings counts as the one card it is. A list that
      fits opens whole, as before, and so does a long one that a filter has shortened: the opening
      folds are worked out from the list on screen, not stored.
      - **A list a focused search narrowed opens every year, however long** (`openAll`, set from
        the focus on company and topic pages). For "how did covid affect…" the years asked about
        are 2020 and 2021, the ones the opening folds would hide. A focus that matches nothing shows
        everything, as before, and folds like any long list.
      - **A folded year keeps its header and its count** ("2019 · 89 events"), and the hover
        preview it already had. It opens on a click, with Expand all, from the Jump bar, or by
        itself when the chart or a Biggest-moves card jumps into it. Its days keep their anchors.
      - **The page says so:** "Years before 2026 are folded so this page stays quick to load. Click
        a year to open it, or use Expand all above." The list's button reads Expand all while any
        year is folded, and Collapse all once none is; before, a page that opened partly folded
        would have offered only Collapse all.
      - **A remembered view is saved only once the reader chooses.** Before, every visit saved the
        page's sections as they stood, so a stored copy of the opening folds would have kept them
        after the list outgrew them. Saved views now carry a mark; one saved before this batch,
        which every visit wrote, is not taken for a choice. Only the owner's browser has any.
      - Topic, industry and group pages use the same list, so a long one folds the same way.
- [x] **After, the same pages and the same database:**

      | Page | Event rows laid out | Elements | Layout | Ready | HTML (gzipped) |
      |---|---|---|---|---|---|
      | JPMorgan | 2,212 → **382** | 32,971 → 8,979 | 385 → **69 ms** | 848 → 504 ms | 7.10 → 3.56 MB (0.52 → 0.36) |
      | Ford | 1,979 → 258 | 28,375 → 7,860 | 298 → 77 ms | 673 → 374 ms | 5.55 → 2.76 MB (0.44 → 0.32) |
      | IBM | 1,048 → 273 | 16,885 → 6,086 | 164 → 65 ms | 521 → 359 ms | 3.84 → 2.47 MB (0.33 → 0.29) |
      | Apple | 613 → 268 | 9,700 → 5,085 | 103 → 60 ms | 368 → 231 ms | 2.36 → 1.77 MB (0.21 → 0.19) |
      | UPS | 607 → 272 | 9,238 → 5,018 | 99 → 56 ms | 374 → 197 ms | 1.91 → 1.44 MB (0.16 → 0.14) |

      On JPMorgan's page in Chromium: clicking 2020 opened it (382 → 533 rows) and a reload kept
      it open; Expand all opened all 2,212 and the button then read Collapse all; a Biggest-moves
      card for Apr 9, 2009 opened 2009; and nothing was saved, and a reload opened the same way,
      until the reader chose. Focused, "dividend" showed its 179 rows across 43 years and
      "interest rates" its 246, all open, with no note; no focus in that database matched more
      than 300, so a long narrowed list is held by the check alone.
- [ ] **Open:**
      - The page still sends every row as data: a folded row is not drawn, but it is downloaded.
        Script time barely moved (JPMorgan 625 → 555 ms) because the browser still reads and
        hydrates the whole list. Sending older years only when opened would cut that. It is a
        larger change: the explorer filters, ranks and focuses the whole list in the browser.
      - A folded year keeps one zero-height anchor per day (about 2,000 on JPMorgan's page) so a
        jump still lands. They are cheap, but one per year would do now that a jump opens the year
        first.
      - **Found in passing, not this batch's:** a focus whose words are all dropped, such as
        "8-K" or "10-K", narrows nothing, yet the focus bar says "Showing the 3789 of 3789 events
        that mention “8-K”". `applyFocus` returns every event with `matched` equal to the total,
        and `FocusBar` reads that as a match. ✅ **Batch 39: the bar says so instead, and "5G" and
        "Q3" became focus words.**
- Checks: new `check:event-folds` (16), wired after `check:gdelt-relevance`. On main's code it
  stops at its first case (`foldedYears` does not exist). It renders the list as the server sends
  it, with rows spread over the years as JPMorgan's and Ford's pages spread theirs.

## NC ledger — batch 37: crowded names asked by relevance (2026-10-23)

Batches 25 and 36 left the same lead open: for a name in every other article, GDELT's newest
hundred pages are passing mentions, and a headline about the company never makes the hundred.
GDELT can sort by relevance instead. Measured, it fixes the two worst cases.

`npm run check` passes (42 suites), `npm run lint` and `tsc --noEmit` are clean. `check:ui` was not
re-run: no page, component or route changed. `check:live` gains a McDonald's case but was not run,
since GDELT was answering this session about once every few minutes. HawkScan could not run:
`HAWK_API_KEY` is not set.

- [x] **Measured, three days of GDELT each (2026-10-23):**
      - **"mcdonald":** newest first, none of the hundred headlines named McDonald's; by relevance
        (`sort=hybridrel`), 37 did ("McDonald Is Crowned a Dividend King", "McRib Returns to
        Indiana McDonald Restaurants"). Batch 36's alternatives found 9 ("mcdonalds") and 4
        ("mcdonald corp").
      - **"uber":** newest first, 1 of the hundred; by relevance, 26 ("Uber gives more than 30,000
        staff OpenAI ChatGPT Work agent").
      - **"lowe":** by relevance, 12 headlines carried the name, half of them people (Rob Lowe,
        Rupert Lowe); the headline test below kept 3, every one the company's ("Lowe volunteers
        help build community garden"). Batch 36's "lowes companies" found 1 article.
      - **"moody":** by relevance, 10 headlines, but the test would keep two about Moody Park in
        Houston ("command center at Moody Park"). Left out.
      - **The window matters:** "mcdonald" by relevance over three months returned 92 pages and no
        headline naming it, so the window is three days.
- [x] **A measured name is asked by relevance over the last three days** (`gdeltNewsPlan`,
      `GDELT_BY_RELEVANCE`, `lib/news.ts`). McDonald's is asked for "MCDONALD", Lowe's for "lowe"
      (bare: GDELT refuses four letters quoted), and Uber Technologies for "Uber Technologies" OR
      uber, all by relevance. Every other company is asked newest first, as before.
      - **Kept to measured names on purpose:** the same treatment could fit Wendy's or Brink's, but
        their stems are first names and words ("Wendy Williams", "on the brink of"), so each joins
        only once it is measured — as Moody's was, and failed.
- [x] **Asked by relevance, a headline must name the company the way scoring counts naming:** not
      after a capitalised word, so a person is left out. Of the McDonald headlines GDELT returned,
      "Cooper McDonald" and "Rep . McDonald Rivet" are dropped (GDELT's space before the full stop
      is closed up first, so "Rep." is seen). The test is conservative: "3 Reasons to Own McDonald
      Stock" is dropped too.
- [ ] **Open:**
      - Alphabet's "google" is unmeasured: the probe sent `"alphabet" OR "google"` without the
        brackets GDELT requires, and it was refused.
      - Some Uber headlines are incidents in an Uber ride ("fake Uber driver"). They name the
        company, as other feeds' headlines do, but say little about the business.
- Checks: new `check:gdelt-relevance` (12), wired after `check:possessive`. On main's code it stops
  at its first case (`gdeltNewsPlan` does not exist). `check:recall`, `check:short-names`,
  `check:possessive` and `check:aliases` follow ingest's new lines; what each holds is unchanged.

## NC ledger — batch 36: possessive company names on GDELT (2026-10-23)

Batch 28 left this to be measured "when GDELT answers": GDELT seemed to drop a possessive "'s",
so a company whose name is a possessive would be asked for in a form GDELT never holds. It does,
and it costs the multi-word ones most of their GDELT news.

`npm run check` passes (41 suites), `npm run lint` and `tsc --noEmit` are clean. `check:ui` was not
re-run: no page, component or route changed, and the name index gains no search names.
`check:live` gains a Domino's case but was not run, since GDELT was answering this session about
once every few minutes. HawkScan could not run: `HAWK_API_KEY` is not set.

- [x] **What GDELT does with a possessive, measured** (three days of GDELT each, 2026-10-23):
      - **Headlines drop the "'s" whole:** none of the 211 GDELT headlines stored for JPMorgan keeps
        an apostrophe ("Here What JPMorgan , Citi , BofA , Others Are Doing"), and the batch 34
        probes returned "Grey Anatomy" and "Today Top Deals".
      - **A quoted possessive is read as one run-together word:** "mcdonald's" and "mcdonalds" each
        found the same 9 articles.
      - **Multi-word names:** "dominos pizza", the form Domino's was asked for, found 2 articles;
        "domino pizza" found 18, 7 naming Domino's in the headline. "dick sporting goods" found
        17 ("DICK Sporting Goods Store is Set to Open New Store").
      - **One-word names:** nothing measured well for McDonald's. "mcdonalds" found 9 articles,
        "mcdonald corp" 4, and "mcdonald" returned the hundred newest pages, all passing mentions
        or people called McDonald, none naming McDonald in the headline.
- [x] **The name index keeps a company's own possessive spelling** (`lib/companyAliases.ts`,
      `possessive` in `data/company-aliases.json`). The SEC's title often drops the apostrophe
      ("MCDONALDS CORP", "DOMINOS PIZZA INC"), and Wikidata's spelling of the name was dropped as
      redundant for search, so nothing said where the possessive was. Fourteen are kept now:
      McDonald's, Lowe's, Moody's, Domino's Pizza, Casey's General Stores, Dr. Reddy's
      Laboratories, Papa John's, Pilgrim's, Carter's, Brink's, Alexander's, Nathan's Famous,
      Nature's Sunshine Products and BJ's Restaurant & Brewery. Rebuilt offline from batch 33's
      Wikidata answer; the 1,555 names are unchanged.
- [x] **A possessive of more than one word is asked in GDELT's form** (`gdeltEverydayName`,
      `lib/news.ts`). Ten of the 1,500 largest companies are asked differently, and no other:
      "DOMINO PIZZA", "CASEY GENERAL STORES", "DICK SPORTING GOODS", "VICTORIA SECRET", "DR REDDY
      LABORATORIES", "BJ WHOLESALE CLUB", "OLLIE BARGAIN OUTLET", "JERSEY MIKE SUBS", "PILGRIM
      PRIDE" and "LOWE COMPANIES". An other name goes the same way ("papa john"), and one that
      comes to one word is left out, since alone it is a surname.
- [x] **A GDELT headline without the "'s" names the company** (`gdeltHeadlineNames`, in ingest and
      in re-scoring). "McDonald to raise menu prices again" names McDonald's now and did not
      before; "Travis McDonald signs with the Packers" does not.
- [ ] **Open:**
      - The one-word possessives keep their query: McDonald's, Moody's, Macy's, Wendy's, Dillard's,
        Campbell's, Carter's, Brink's. Nothing measured better; GDELT's relevance sort and its
        `repeat3:` operator (batch 25) are the leads left. ✅ **McDonald's asked by relevance since
        batch 37** (37 of the hundred headlines); the others wait on their own measurement.
      - Lowe's gains nothing either way: "lowe companies" and "lowes companies" each found 1
        article in three days, and neither had a headline naming it. Headlines call it "Lowe's",
        which GDELT holds as "Lowe": under five letters, and a surname. It is as uncovered as
        McDonald's. ✅ **Both asked by relevance since batch 37.**
      - "domino pizza" also finds the separately listed Domino's companies, the UK's Domino's
        Pizza Group and Australia's Domino's Pizza Enterprises: one brand, three listings.
- Checks: new `check:possessive` (15), wired after `check:page-news`. On main's code it stops at
  its first case (`gdeltForm` does not exist). `check:aliases`, `check:recall` and
  `check:short-names` follow ingest's new lines; what each holds is unchanged.

## NC ledger — batch 35: a page's news, bounded under the cache limit (2026-10-22)

Batch 23 left this open: "the timeline entry still grows with stored news, and nothing bounds it."
Next caches no entry over 2 MB, and a company page is one entry for its timeline. About 1,200 more
stories would take JPMorgan's page over it, and GDELT is asked every hour for its newest hundred,
so a heavily covered company could get there within days. Past it, every view rebuilds the page
from the database, and the visitor downloads all of it.

`npm run check` passes (40 suites), `npm run lint` and `tsc --noEmit` are clean. `check:ui` passes
(203/203) against the demo database: the note shows on no demo page, since none holds that much
news. HawkScan could not run: `HAWK_API_KEY` is not set.

- [x] **News fills the room the rest of a page leaves** (`lib/pageNews.ts`, `boundPageNews`).
      Every filing, earnings release, recall and other record stays; only news is left out, and
      only when it would take the page's cached entry over budget. The room goes in two halves:
      - **The newest stories take the first half**, so a page read today carries today's news.
      - **The past takes the rest a round at a time:** the strongest story of each day, then each
        day's second, and so on. In every round the days the price moved most come first, so when
        the room runs out, the stories kept are the ones beside the moves a reader came to explain.
      - **On a day,** a story whose headline scoring named the company comes before an unscored
        one.
      - Done when the page is read: the database keeps every story. Topic pages are bounded the
        same way, their prices counted since a topic's prices share its cached entry.
- [x] **Weighed the way Next weighs it.** `unstable_cache` stores a page as a JSON string inside a
      JSON entry and compares that outer JSON's length with 2 × 1024 × 1024
      (`next/dist/server/lib/incremental-cache`), so every quote in a page counts twice. Batch 23
      measured plain JSON, which reads 10–15% light: JPMorgan's timeline entry is 1.34 MB plain and
      1.48 MB as Next measures it, its prices 0.66 and 0.75 MB. Both were under the limit, with less
      room than recorded. The budget is 1.8 MB as Next measures, leaving room for the entry's own
      fields.
- [x] **Measured on JPMorgan's real data**, ingested into a scratch database (8,369 EDGAR rows,
      11,746 daily closes, 75 GDELT and 15 Yahoo stories), with 3,000 stand-in stories added to stand
      for a few days of hourly runs. The site was built and JPMorgan's page opened three times on
      each side:
      - **Main's code:** the entry weighs 3.16 MB, and Next refused to cache it on every view ("items
        over 2MB can not be cached (3162145 bytes)"). Each view took 0.93–1.35 s and sent 13.3 MB.
      - **This batch:** 1.80 MB and no refusal. It keeps 659 of the 3,090 stories: all 198 since
        June, today's included, and one story on each of 461 earlier days. Repeat views took
        0.45–0.51 s and sent 7.1 MB.
- [x] **The page says so** (`components/NewsLeftOut.tsx`): "Showing 659 of the 3,090 news stories
      stored for this page, so it stays quick to load: the newest, then the strongest of the days the
      price moved most. Every filing and other record is here." A page that leaves nothing out says
      nothing.
- [ ] **Open:** the page a visitor downloads is still 7.1 MB for JPMorgan: the rendered event list
      and the data it is rendered from, prices included. The cache budget does not reach that;
      paging the event list would. And how soon a real page reaches the budget is unknown until
      the hourly refresh runs in production. *(Corrected 2026-10-23, batch 36: 7.1 MB is the
      uncompressed size. Next compresses what it sends, so JPMorgan's page is 0.52 MB on the wire,
      against 1.08 MB on main's code before this batch. What is left is the 4,652 rows the browser
      lays out.)* ✅ **Batch 38: a long list opens with its older years folded, so JPMorgan's
      page lays out 382 rows, not 2,212.** The data it is drawn from still ships whole.
- Checks: new `check:page-news` (21), wired after `check:short-names`. On main's code it cannot
  load (`lib/pageNews.ts` does not exist). It pins how Next measures an entry, read from
  `node_modules`, so an upgrade that changes the measurement fails the check rather than the cache.
  `check:macro`'s pattern for a company page's events follows the new call; what it holds, that
  the economy rows stay a field of their own, is unchanged.

## NC ledger — batch 34: short names claim news, and go to GDELT bare (2026-10-22)

The owner answered batch 33's two questions with yes ("shorter names work fine"): a company's own
initials claim its news even where Wikidata files them as an alias (AIG, UPS, ADP), and a short
name that is not a word goes to GDELT unquoted (Etsy, Roku). Both were built with guards, because
a news item whose headline does not name the company is displayed, not hidden (it waits for the
model), so a bare word that brings in unrelated articles puts them on the page.

`npm run check` passes (39 suites) and `npm run lint` is clean. `check:ui` was not re-run: no
page, component or route changed, the name index gains no search names this time (21 entries only
start claiming news), and the one route that imports the scoring module reads a constant from it.
HawkScan could not run: `HAWK_API_KEY` is not set.

- [x] **A company's own initials claim its news** (`lib/companyAliases.ts`). The rebuilt index has
      the same 1,555 names; 21 now claim news: AIG, UPS, ADP, ADM, AEP, BMS, CNR, DAL, HII, HPE,
      IFF, ITW, JCI, JLL, PAN, RBC, RDS, SLF, TSM, WDP and WMG.
      - **Excepted:** Philip Morris's "PMI", which is the purchasing managers' index in every monthly
        economic report (`INITIALS_NOT_NEWS`). It still finds the company in search.
      - **Capitals only:** in headline scoring a company's initials count only in capitals, so "PAN
        shares jump" names Palo Alto Networks and "Pan-European stocks slip" does not.
- [x] **A short name that is no word goes to GDELT bare, keeping only headlines that name the
      company** (`lib/news.ts`). GDELT takes a bare three-letter word where it refuses a quoted one.
      - **What may go bare:** three or four letters that are not one of the 4,971 English words of
        two to four letters in ENABLE (public domain, committed as `data/english-short-words.json`),
        and not on a short list of letters that mean something else first (`GDELT_NOT_UNQUOTED`):
        RTX (Nvidia's graphics cards), CGI, AIG, AMD, ADM, BMS, RBC, UBER, BCE, APA, PTC, AES, ATI,
        EQT, FNB, RDS, TSM, CNR, SPIE, MOOG, NOV, COPA, TIM, DAVE, DIDI. AIG, AMD, ADM, BMS, RBC, UBER
        and CGI are measured (below); the rest are from what the letters commonly mean.
      - **The headline filter:** with a bare name in the query, an article is kept only when its
        headline names the company by one of the names asked for. On 2026-10-22 a bare "IBM"
        returned 30 articles in a day; 9 named IBM in the headline and the rest in passing
        ("Aionos Appoints Hemant Lamba…"). The company's initials count there only in capitals, as
        in headline scoring, so "Adm. Paparo warns…" is never a headline of ADM's.
      - **Measured after the first push**, from GDELT's newest week for each bare name, 2026-10-22:
        - **Kept bare:** "IBM", "CSX", "Roku", "ADP", "AEP", "HII", "HPE", "ITW", "JLL", "SLF",
          "WMG" and "TSMC" — every headline naming the letters was the company's ("CSX (NASDAQ: CSX)
          Stock Price Up 6.1% on Earnings Beat", "AEP Increases Quarterly Dividend to 97 Cents a
          Share", "HII receives US Navy contract for Lyndon B Johnson sea trials"; 15 of 15 for HPE,
          14 of 14 for TSMC, 10 of 10 for AEP). "JCI" brought 15 articles and Disney's "WDP" one,
          neither with a headline naming the letters.
        - **"AIG":** both headlines naming it were Nigeria's assistant inspectors-general of police
          ("AIG Ewah assures students of police protection"), none the insurer's. The first push
          would have put them on AIG's page. Now on the list.
        - **"AMD":** 28 of the 30 newest articles were about Judi Dench's failing sight
          (age-related macular degeneration). A headline like "new treatment for wet AMD" would
          have passed the filter. Now on the list.
        - **"ADM":** of 7 headlines naming it, 3 were not the company: Australian Defence
          Magazine, a Montreal manufacturing expo, a political story. Now on the list.
        - **"BMS":** the one headline naming it was an Indian organisation opening an office in
          Pulwama, not Bristol Myers Squibb. Now on the list.
        - **"RBC":** 7 of 8 headlines were Royal Bank of Canada's, but one was RBC Bearings' stock
          ("Reviewing RBC Bearings (NYSE: RBC)…"), a listed company whose ticker it is, and such
          stock-site headlines recur. Now on the list.
        - **"UBER":** the 100 newest articles held one headline naming Uber. Bare, the word ("über",
          "uber-rich") and passing mentions fill the hundred and crowd out "Uber Technologies",
          which goes quoted. Now on the list.
        - **Already kept out:** "CGI" (no headline of CGI Inc's among 30: film reviews and PHP
          security flaws), "UPS" (an English word; no headline of the company's among 30) and
          "PMI" (10 of 30 were Philip Morris's, the rest the Project Management Institute, a fund
          company and the economic index).
      - **The 107 short everyday names** among the 1,500 largest companies now all get a query
        GDELT takes: 59 bare ("ETSY", "CSX", "HSBC", "NIKE"), 48 with the legal form because they
        are words or listed letters ("VISA Inc", "CGI Inc", "SAP SE"). CRH, last batch's one gap, now
        goes bare.
      - A real `npm run ingest -- --ticker IBM` stored 24 GDELT articles under the bare name, every
        headline naming IBM ("IBM beats Q3 earnings on software rebound…").
      - **The cost, measured:** a bare brand mentioned in passing everywhere fills GDELT's 100
        newest with those mentions. A bare "Etsy" returned 30 articles in three days and none named
        Etsy in its headline, so Etsy's page gains headlines slowly, run by run, rather than none.
- [x] **The federal feeds take short names where they help, and not where they drown:**
      - The Federal Register search leaves out an other name under five characters, though it still
        names the company in a title. "UPS" is in 2,031 documents since 2015 against 374 for
        "United Parcel Service", and the feed reads the newest 1,000.
      - The Justice Department feed asks for the initials, and reads a short name's titles only one
        page when there are more than it reads: "AIG" is inside 1,600 titles ("Craig"), "ADM" inside
        8,333, "DAL" inside 1,559, and their newest 500 held none of the company's releases. "UPS",
        in 273, held four, so UPS goes from 2 releases to 6 ("UPS Agrees To Forfeit $40 Million…",
        2013), and HPE gains its Juniper acquisition case. A real `npm run ingest -- --ticker UPS`
        stored the 6.
- [ ] **Open:** every bare other name is now measured; the short everyday names but CSX, Roku and
      Etsy are not, though for them bare is the only query GDELT takes. A name found wanting goes on
      `GDELT_NOT_UNQUOTED` with what it brought in.
      Tickers that are words ("ups", "are") still score a headline in any letter case, as before;
      only initials that are news names became capitals-only.
- Checks: `check:short-names` 18 → 27, its batch 33 cases rewritten for the owner's calls. On
  main's code 2 fail before it stops (`unquotable` does not exist); on this batch's first push, 4
  fail (AIG, AMD and ADM go bare; "Adm." passes the headline filter). `check:aliases` now allows a
  company's own initials as the one alias that claims news. `check:live` gains a case that IBM's
  bare-name articles all name IBM in the headline.

## NC ledger — batch 33: short company names — IBM, and Visa's news (2026-10-22)

The owner said to merge batch 32 and continue. Batch 32's open item noted that companies known by
a short name get no Justice Department releases; IBM had none, because it was searched only as
"International Business Machines". Looking into why turned up a larger hole: GDELT refuses a
phrase under five characters, so every company with a short everyday name — Visa, NIKE, AT&T, 3M,
eBay, HSBC, SAP — was asked a news query GDELT refused, on every run.

`npm run check` passes (39 suites) and `npm run lint` is clean. `check:live` gains a GDELT case
for Visa, but GDELT throttled this session's every few requests, so it was measured by hand
instead (below). A real `npm run ingest -- --ticker IBM` got 75 GDELT articles under its unchanged
long-name query, in one request. `check:ui` is 203/203 on a production build, re-run because the site's search reads the name
index. HawkScan could not run: `HAWK_API_KEY` is not set.

- [x] **A company's own initials are a name** (`lib/companyAliases.ts`). The alias builder dropped
      every three-letter one-word name as "too short", which keeps out "Sun" but also threw away
      42 initialisms Wikidata holds. One in capitals that spells the company's own initials now
      passes; the other tests still apply after it. Rebuilt from the same Wikidata answer (no
      drift since the last sync), the index gains exactly 25 names and loses none:
      - **News may use two**, Wikidata's own labels: "IBM" and "AMD".
      - **Search gains** BMS (Bristol Myers Squibb), RDS (Shell), WDP (Disney), FBR (Warner
        Music's Fueled by Ramen) and PAN (Palo Alto Networks, which the larger-company rule now
        prefers to Pan American Silver's title prefix). The rest, such as AIG, UPS, ADP and ITW, are
        their own tickers already. Another company's ticker still wins: "RBC" is RBC Bearings, not
        Royal Bank of Canada.
      - Still out: letters that are not initials (Moody's "MCO", Constellation's "STZ"), a
        little-known company's initials (Community Health Systems' "CHS"), and "Sun".
- [x] **GDELT is never asked a phrase it refuses** (`lib/news.ts`). "CSX" and "Visa" each came
      back "The specified phrase is too short."; unquoted, "Visa" matched the word ("Trump revokes
      over 300,000 visas"). So:
      - a name under five characters stays out of the OR'd query and only scores headlines (IBM's
        query is unchanged, so "IBM" costs it no refused request);
      - a short everyday name is asked with the legal form its SEC title carries, the way an
        article names the company at first mention: "VISA Inc", "CSX Corp", "NIKE Inc", "3M Co",
        "AT&T Inc", "News Corp", "HSBC Holdings", "SAP SE". 106 of the 107 short names among the
        1,500 largest companies now get a query GDELT takes; CRH ("CRH PUBLIC LTD CO") does not.
      - Measured by hand, spaced a minute apart around the throttle: "visa inc" returned 7
        articles from the last two weeks (among them "…Owed a Share of Visa and Mastercard $167.5M
        Settlement"), "csx corp" 1 ("CSX Corp. Announces Third Quarter 2026 Results"), "nike inc" 8
        ("Nike Stands By Converse As Sales Keep Sinking"). Each had been none. Not every one
        helps: "ebay inc" returned none in the two weeks, and two of "hess corp"'s 3 were about
        Hess Midstream, a separate listed company, which headline scoring then has to judge.
        "Apple", five letters, was taken (25 articles) where four-letter "Visa" and "Nike" were
        refused: the limit is five.
- [x] **The Justice Department feed** now asks for IBM by "IBM" too, and its rule takes "Claim
      Against" as it took "Claims Against": IBM gets its 3 releases (a real
      `npm run ingest -- --ticker IBM` stored them), and the 912-title set gains two real AT&T
      releases ("Justice Department Settles Civil Antitrust Claim Against AT&T and DIRECTV…"). The
      40 held-out companies are unchanged.
- [ ] **Open:**
      - Whether to send GDELT a short name unquoted for companies whose name is not a word ("Etsy",
        "Roku"). Measured, it works but matches every use of the word, so for "Visa", "Gap" or
        "Snap" it would bring in unrelated news. The legal form is the safe default; this is the
        owner's call. ✅ **Owner: yes (2026-10-22); built in batch 34**, with a headline filter.
      - Most initialisms Wikidata files as an alias, not a label (AIG, UPS, ADP), so they find the
        company in search but do not claim its news. Promoting them is a rule change for the name
        index, also the owner's. ✅ **Owner: yes; built in batch 34**, PMI excepted.
      - When Wikidata lists two written forms of one name, which one is kept depends on the order
        it answers in ("Mellanox Technologies, Ltd." or "…Ltd."): a re-sync can flip it with no real
        change. Harmless, but it makes a sync diff noisy.
- Checks: new `check:short-names` (18), on the real Wikidata items and GDELT's real refusal. On
  main's code 9 fail before it stops (`gdeltEverydayName` does not exist). `check:aliases` and
  `check:recall` now expect the GDELT call through `gdeltEverydayName`; `check:recall` keeps its
  guard that a long name is asked as the everyday name ("FORD MOTOR"), never the legal title.

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
      word ("Target") is read only to its newest 500 titles. ✅ **Partly done in batch 33:** IBM
      is searched as "IBM" now and gets its 3 releases; AIG's initials remain a search name only,
      and "PNC" is not PNC's initials.
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
- [x] **Open:** GDELT appears to drop apostrophes and a possessive "'s" with them. In the audit's
      saved results, "Buffett's Berkshire … Here's Why I'm" came back as "Buffett Berkshire … Here
      Why Im". If so, "Angie's List", "Papa John's" and "Dave & Buster's" are asked for in a form
      GDELT never prints, and their GDELT headlines do not match. One headline is too little to
      build on; measure it when GDELT answers. ✅ **Measured and built in batch 36:** it does, and
      a possessive of more than one word is now asked in GDELT's form ("DOMINO PIZZA").
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
        100 places. *(Corrected 2026-10-26, batch 58: scoring keeps off a page that does not name
        the company in its headline, but not one that uses the company's name as a word: "IMF
        urges retaining 5 % inflation target" scores 0.9 for Target. The backfill holds such names
        back; the hourly ask still lets them in.)* *(Corrected again 2026-10-26, batch 59: a
        headline that does not name the company is left unscored, and shown, until the paid model
        or `--strict-headline` scores it. A headline with a company's one-word name only in
        lowercase now scores 0.2 and is hidden; "Southern California" still scores 0.9 for
        Southern Company.)* One lead, measured once: GDELT's `repeat3:` operator (the word at least three
        times on the page) works, and "Alphabet" OR `repeat3:"google"` returned 5 in 100 against
        "Alphabet" alone's 1. It, and GDELT's relevance sort, are worth measuring on more companies
        before the platform words go back into queries this way. The same measurement settles the
        batch 28 audit's suggestion to send the longer forms instead ("facebook inc", "google
        llc"): "Google LLC" is the name privacy and cookie notices use, so it may be furniture too.
        ✅ **Relevance sort measured in batch 37:** by relevance, "mcdonald" put McDonald's in 37 of
        the hundred headlines over three days against none newest first, and "uber" Uber in 26
        against 1; both are asked that way now. "google" is still unmeasured.
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
      - [x] **Open:** the timeline entry still grows with stored news, and nothing bounds it.
            JPMorgan's is about 1.2 MB before any news row. Cap or page what a company page
            carries before a heavy page's timeline approaches 2 MB. ✅ **Built in batch 35**
            (`lib/pageNews.ts`): news fills the room the rest leaves, under a 1.8 MB budget
            measured the way Next measures.
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
- [x] `P1` **The company Federal Register feed back to 1994, and past the newest forty.** It asks
      from `FR_COMPANY_SINCE = "2015-01-01"` (`lib/frCompany.ts:194`), though the API answers from
      1994 — a floor `docs/COVERAGE-MAP.md:100-101` calls "a choice, not a limit", in the 1963–2017
      stretch it calls the corpus's biggest hole — and keeps `.slice(0, FR_COMPANY_CAP)`, the
      newest 40, on every run (`:191`, `:238`), so a company's 41st-newest title-naming document
      never reaches its page however many runs go by. Measured 2026-10-26 with the feed's own match
      rule, directives left out: across fourteen companies the source holds 2,909 documents the
      rule accepts and the feed can carry at most 338 (GM: 225 before 2015, 51 since, 40 kept;
      Ford: 100 and 32); without the two railroads and Duke, 910 against 218. The older years hold
      what the feed already carries — NHTSA petitions, FTC consent orders (Wal-Mart Stores 1999
      and 2002), trade-adjustment determinations at named plants, FERC complaints.
      - Walk each company's past years once, each closed year kept in a table shaped like
        `gdelt_windows` (db/030) and never asked again — about 21 requests per company, once. A
        closed year stores every title-naming document; the forty stays a per-run ceiling on
        today's daily ask only.
      - Search a company's EDGAR former names (batch 15, `renamesFrom`) for dates before the rename
        only: "Walmart" finds 1 document before 2015, "Wal-Mart Stores" 5.
      - ✅ **The owner's call, 2026-10-26: group them, one row a month.** UNP's 663 and CSX's 430
        pre-2015 documents are nearly all Surface Transportation Board line notices, Duke's 461
        FERC dockets. Records are never cut by the page budget and news is (`lib/pageNews.ts`), so
        grouping is what keeps their stories on the page.
      - **Done in batch 63** (see its section): the year walk (`lib/ingest/frBackfill.ts`,
        `fr_windows`), former names by year, routine notices grouped (`pageRegulations`).
      - [ ] `P2` Still open: the sector feed has the same 2015 floor (`lib/federalregister.ts:19`,
        `fetchRegulations(term, since = "2015-01-01")`); the same change follows, at lower
        priority.
      - Cases in `check:wiring` against a stand-in Federal Register — a 2003 Ford document reaches
        the page, 60 since 2015 are all kept once walked, a closed year is not asked twice, a former
        name counts only before the rename — and a `check:live` case. No key, licence or recurring
        cost; a cloud session builds it.
      - *Derived from [`docs/proposals/2026-10-26-proposals.md`](proposals/2026-10-26-proposals.md)
        #1, approved 2026-10-26. Importance high · Efficiency high · Practicality medium-high (one
        owner call on routine notices).*
- [x] `P1` **A results release is an earnings event, whatever form carried it.** An 8-K is typed
      `earnings` by item 2.02, so a foreign issuer's results 6-K never is — "a 6-K stays a filing:
      … the submissions list does not say which" (`lib/sec.ts:849-852`, batch 11) — and nor is any
      results 8-K filed before item 2.02 existed (August 2004). Since batches 43–44 the headline
      reader does say which: each 6-K's headline is in `sec_headlines` (db/029), and
      `RESULTS_HEADLINE` (`lib/secHeadlines.ts:833`) already recognises a results headline. NIO's
      32 quarterly-results 6-Ks and Boeing's 1997–2004 results 8-Ks are typed `filing` in the batch
      42 and 48 databases: no Earnings chip, no marker, and Biggest moves ranks them as a filing
      (4), not earnings (5), when it picks a move's catalyst (`components/BiggestMoves.tsx:37-41`).
      - One predicate beside `RESULTS_HEADLINE`, applied where a stored headline is put on a filing
        (`lib/ingest/headlines.ts:75`), so the kind travels with the title; stored rows re-type on
        their next ingest, and the description says why ("a results release, counted as
        earnings"). Not by EDGAR's pre-2004 8-K item codes, which disagree with the documents (the
        proposal's "Considered and cut").
      - Tried on 1,079 real headlines: a reporting period, a results word and no excluded word
        marks 196, agrees with 2.02 on 120 of the 130 titled 2.02 releases (8 of the 10 misses are
        not results releases), and newly types 47 — 42 results releases, 5 not. Traps it must keep
        out, all stored: Takeda's "Phase 3 Topline Results", UBS's tender-offer "Results", MUFG's
        quarterly capital ratio, a Novartis supplementary-data report.
      - ✅ **The owner's call, 2026-10-26: only actual results count.** The 5 — a profit alert, a
        pre-announcement, a guidance update and two Takeda forecast revisions — stay filings, shown
        with their headlines; the Earnings chip means reported results.
      - **Done in batch 64** (see its section): `announcesResults` and `asResultsRelease`, applied
        where a stored headline is put on a filing.
      - Cases in `check:sec-headlines` from the real stored titles: NIO's 32 and Boeing's four
        become earnings, the traps stay filings, the 120 still agree. No key, licence, recurring
        cost or request — the headlines are stored; small, offline.
      - *Derived from [`docs/proposals/2026-10-26-proposals.md`](proposals/2026-10-26-proposals.md)
        #2, approved 2026-10-26. Importance high · Efficiency very high · Practicality high.*
- [x] `P1` **Keep the SEC forms the 2026-10-18 list missed — foreign listings, large-company
      shelves, late-filing notices, proxy fights, tender results.** The owner picked
      `MATERIAL_FORMS` (`lib/secForms.ts:114-143`) on 2026-10-18 without the live count; it is now
      made, across 45 submissions records (20 large US companies, 25 foreign issuers), and these
      rows — already in the records ingest downloads — are dropped at `lib/sec.ts:818`:
      - **S-3ASR 123, in 18 records, against S-3's 95 kept**: large seasoned issuers shelve on the
        automatic form, so "Shelf registration" (`lib/secForms.ts:137`) almost never fires for the
        most-read companies. F-3 and F-3ASR 67, F-10 22.
      - **F-1, 9 foreign listings, none kept** (ARM 2023, BABA 2014, SPOT 2018, NIO 2018…), while
        the US listings are (META 2012, TSLA 2010). F-4 15.
      - **Late-filing notices** (NT 10-K, NT 10-Q, NT 20-F): 8 even among these — Apple's NT 10-Q
        and NT 10-K of 2006, NVIDIA's of 2002, GM's of 2010, Tesla's of 2013, NIO's NT 20-F of 2020.
      - **Proxy fights:** PREC14A and DEFC14A 15 (Disney 2023 and 2024, GM 2017); DFAN14A 195, 134
        of them Disney's, so grouped a row a month as `pageFilings` groups prospectuses.
      - **Tenders:** SC TO-T/A 299 against SC TO-T's 59 kept (or only the final amendment, which
        reports the result); SC TO-I 23.
      - **A dead end it closes:** focus and search already read F-1, F-3 and F-4 as form names
        (`lib/focus.ts:54`), so "Arm F-1" opens ARM narrowed to its F-1s and finds none.
      - ✅ **The owner's pick, 2026-10-26: all four groups** — the offerings (S-3ASR, F-1, F-3,
        F-3ASR, F-10), late-filing notices, proxy fights, and the tender and merger forms (SC TO-T/A,
        SC TO-I, F-4). Not picked: SUPPL (77 rows, offered as optional). Counted and not proposed:
        425, DEFA14A, PX14A6G, CORRESP/UPLOAD; insider forms stay out.
      - **Done in batch 65** (see its section): the forms, named in `MATERIAL_FORMS`; DFAN14A and
        SC TO-T/A grouped a row a month; a company's own tender offers and proxy fights at other
        companies named as its own.
      - Labels and typing in `MATERIAL_FORMS`, the monthly grouping reusing `pageFilings`; cases in
        `check:sec-forms` from real rows (ARM's F-1 kept; Apple's NT 10-Q a late-filing notice;
        Disney's 2024 DFAN14As one row a month; S-3ASR reads as a shelf) and a `check:prompt` case
        for "Arm F-1". No key, licence, recurring cost or request; small, offline.
      - *Derived from [`docs/proposals/2026-10-26-proposals.md`](proposals/2026-10-26-proposals.md)
        #3, approved 2026-10-26. Importance high · Efficiency very high · Practicality high (one
        owner pick, the counts in hand).*
- [x] `P1` **NHTSA defect investigations beside the recalls, on carmakers' pages.** A new source,
      approved by the owner 2026-10-26: NHTSA's "Investigations Data"
      (`data.transportation.gov/resource/b3rp-be92`), licence field "Public Domain U.S.
      Government" — the same as the recalls dataset batch 30 built on (`6axg-epim`,
      `lib/recalls.ts:18`) — and no key. A carmaker's recall is on its page; the investigation
      that came before it, often the event the stock reacted to, is not. Measured 2026-10-26: 4,053
      investigations, 1975-03-27 to 2026-10-23, each with an action number, the maker as the
      recalls dataset writes it, a type, subject, component, open and close dates and the recall
      it led to. Through the existing `RECALL_MAKERS` map and its dates (`lib/recalls.ts:56`),
      1,766 land on 20 mapped companies, 1,579 of them before 2017 — Ford 684, GM 651, Toyota 114,
      Honda 113, Stellantis 50 (from 2014-10-12, as for recalls).
      - An adapter in the recall adapter's shape: one request a day per mapped maker, on the portal
        ingest already calls. Titles say what was opened, never a finding ("NHTSA opened an
        engineering analysis: Steering knuckle fracture"). Registered, licence-checked, credited.
      - ✅ **The owner's calls, 2026-10-27: under the Recalls tag, and the opening only** — the
        closing is said in the row. Ford's page gains 684 records, which the page budget pays for
        in news. **Done in batch 66** (see its section).
      - A new `check:vehicle-investigations` (or cases in `check:vehicle-recalls`) on real pinned
        rows — Toyota's 2010 RQ10003 lands on TM; a Chrysler row before 2014-10-12 is refused for
        Stellantis; another maker's row is refused — plus `check:wiring` and
        `check:commercial-mode`. No key, licence fee or recurring cost; a cloud session builds it.
      - *Derived from [`docs/proposals/2026-10-26-proposals.md`](proposals/2026-10-26-proposals.md)
        #4, approved 2026-10-26 with the new source. Importance high for its 20 companies ·
        Efficiency high · Practicality medium (the source approved; the event kind chosen
        2026-10-27).*
- [x] `P1` **The SEC's own press releases naming a company as the party, from 1998.** A new
      source, approved by the owner 2026-10-29: the SEC newsroom's press-release list
      (`www.sec.gov/newsroom/press-releases?year=YYYY&month=All`, 25 a page, each with its title,
      link and a dated `<time>`), on the host EDGAR is read from, and no key. Licence: "Information
      presented on sec.gov is considered public information and may be copied or further
      distributed by users of the web site without the SEC's permission. Please consider
      appropriate citation to the SEC as the source" (`sec.gov/about/privacy-information`, "Website
      Dissemination", read 2026-10-28). The Justice Department's releases that make a company the
      party are on its page from 2009 (`lib/doj.ts`); the SEC's are on no page from any year, in
      every sector, and reach into the 1963–2017 stretch `docs/COVERAGE-MAP.md:87-91` calls the
      corpus's biggest hole. The 2026-10-22 note left "SEC enforcement releases" off its shortlist
      (`docs/proposals/2026-10-22-news-sources.md:170-172`); this is the press-release series, not
      the litigation releases, and reading each past year once is now a built pattern (batch 63).
      - Measured 2026-10-28: 2010 holds 258 releases on 11 pages, 2003 holds 185 on 8; the 1998 and
        1999 pages list releases, 1996's none (1997 not asked). Read by hand, 2010 has 8 releases
        whose party has a page here — Goldman Sachs twice (the CDO charge, then the record $550
        million settlement), Citigroup, General Electric (FCPA), State Street, ABB, Daimler AG,
        Innospec — and 3 naming a firm that may be a unit of one (Banc of America Securities,
        Morgan Keegan, General Re), each needing its owner on that day from a filing. 2003 has 10:
        CIBC's Enron settlement, Alliance Capital's $250 million, Invesco Funds Group, Morgan
        Stanley's $50 million, J.P. Morgan Securities' $25 million, AIG's $10 million, Goldman
        Sachs (the 30-year bond case), UBS PaineWebber, Deutsche Bank's advisory unit, and J.P.
        Morgan Chase and Citigroup together over Enron. If those years are typical, about 250
        events across the index for 1998–2025 before units, most on the largest financial
        companies; not sized per company past the two years read.
      - A year walk in the shape of `lib/ingest/frBackfill.ts` (`fr_windows`, db/031): each closed
        year read once and never asked again, its titles stored once and matched against each held
        company at its ingest. About 220 to 310 requests for 1998–2025 at the measured rates, a
        second apart, once for all companies rather than per company; then the current year's
        first page or two a day.
      - The party rule: `releaseNamesParty` (`lib/doj.ts:127`), run unchanged on the 443 titles of
        the two years with 18 companies' names, keeps 4 (Goldman's 2010 settlement; the Morgan
        Stanley, AIG and CIBC releases of 2003) and nothing else — it reads a company as the party
        when it pays or settles, not when "SEC Charges" or "SEC Sues" it. Teach it the SEC's
        phrasing ("SEC Charges X", "SEC Sues X", "SEC Brings … Action Against X", "Commission
        Settles … Against X"), with the names every scoring path takes (`companyScoringAliases`,
        `lib/scoringNames.ts:43`) and the DOJ adapter's look-alike guards. Real titles it must
        refuse: "SEC Charges Former Carter's Executive With Fraud and Insider Trading", "SEC Charges
        Two Individuals for Roles in Innospec FCPA Scheme", "SEC Proposes New Measures to Help
        Investors in Target Date Funds".
      - A unit named for the company ("J.P. Morgan Securities", "Banc of America Securities")
        counts as the DOJ adapter's units do; a firm bought later does not, by the rule every map
        follows: Merrill Lynch's 2003 Enron case is not Bank of America's.
      - Registered in `SOURCES` (`lib/ingest/store.ts`; public domain, commercial use), credited in
        the footer and the Terms page as the Justice Department is, scored without the model as a
        Justice Department release is. The listing's `<time>` is a day ("2010-12-27T07:00:00Z"),
        not an instant, so it sets no `occurred_at`.
      - A new `check:sec-press` in the `check` chain, on the pinned 2003 and 2010 titles: Goldman's
        2010 charge and settlement land on GS; the 2003 J.P. Morgan Chase and Citigroup release
        lands on both; the Innospec individuals', Carter's executive's and Target Date Funds
        releases land on no company; a closed year is not asked twice; the source is registered,
        licence-checked (`check:commercial-mode`) and credited. No key, licence fee or recurring
        cost; a cloud session builds it (sec.gov answers from the container, measured).
      - *Derived from [`docs/proposals/2026-10-28-proposals.md`](proposals/2026-10-28-proposals.md)
        #1, approved 2026-10-29 with the new source. Importance high · Efficiency medium-high ·
        Practicality medium (the source approved; a title rule to tune on the two years read).*
      - ✅ **Done in batch 73** (see its section): every release since 1997, the first year the
        listing holds, read once for every company; 209 of the 6,898 name a company in the index as
        the party, 125 of them before 2017. Units named otherwise ("J.P. Morgan Securities", "Banc
        of America Securities") are not reached: the names a company's record carries do not
        include them. Reached since batch 82, each while its bank owned it (`lib/releaseNames.ts`).
- [x] `P1` **The small-business reports, the 1990s tender offers and 10-K405/A: forms ingest
      downloads and the form filter drops.** The 10-K405 is kept as "the annual report's own form
      until 2002, which the older shards reach" (`lib/secForms.ts:120-121`), and so are SC TO-T,
      SC TO-T/A and SC TO-I (`:125-130`). The forms a small company reported on until 2008, and the
      tender-offer forms Schedule TO replaced in 2000, are not: the filter (`lib/sec.ts:869-894`)
      drops any form outside `wanted`, `MATERIAL_FORMS`, 8-K/A and the 424B prospectuses, and none
      of them is named anywhere in the code. Batch 65's count read 45 large companies' records,
      which file no small-business report, and did not list the old tender forms.
      - ✅ **The owner's pick, 2026-11-01: groups (a), (b) and (c), and of the options SB-2 and
        10-12B.** 10-12G stays out: a registration under section 12(g), not for an exchange
        listing.
        - (a) the small-business annual and quarterly reports, 10KSB, 10KSB40 and 10QSB (EDGAR
          writes them without a hyphen), with their amendments, labelled and typed earnings as the
          10-K and 10-Q are;
        - (b) the tender-offer forms before 2000: SC 14D1, an outside bidder's offer, read by batch
          65's file-number rule as the company's own offer when it made one, its amendments a row
          a month as SC TO-T/A's are; and SC 13E4, the company's offer for its own shares, as
          SC TO-I is;
        - (c) 10-K405/A, the amended annual report of the 10-K405 years, beside the 10-K/A kept;
        - SB-2, a small company's registration to sell shares, beside the S-1 kept, and 10-12B, a
          spin-off's registration of its shares for an exchange listing.
      - Measured 2026-11-01 on EDGAR's quarterly form indexes (`full-index/Y/QTRn/form.gz`, every
        filing of the quarter by form and CIK), kept to the CIKs in `data/edgar-tickers.json`:

        | Quarter | Rows on index companies | Kept today | 10QSB | 10KSB, 10KSB40 | amendments |
        |---|---:|---:|---:|---:|---:|
        | 1998 Q2 | 6,482 | 4,282 | 151 | 50 | 30 |
        | 2003 Q2 | 24,478 | 9,353 | 248 | 84 | 80 |
        | 2007 Q2 | 48,097 | 15,435 | 326 | 151 | 72 |

        That is 1,192 small-business reports on **464 companies** in three quarters, Take-Two
        (TTWO, a 10QSB of 1998-06-15), Axon (as TASER International, 2003), XPO (as Segmentz,
        2003), Halozyme, Celsius (2007), Universal Display, Neogen, Gulfport Energy and BJ's
        Restaurants (as Chicago Pizza & Brewery, 1998) among them. Estimated from the three
        quarters rather than counted: about 700 a year in 1998 and 1,300 to 1,600 in 2003–2007, on
        the order of 10,000–15,000 rows over 1996–2008.
      - Eagle Bancorp's record (EGBN, its older shard), read whole: 18 small-business reports from
        1998-04-28 to 2002-11-14, 4 10KSB and 14 10QSB. Of its reports for 1998–2002 the filter
        keeps one, the 10-Q of 1999-05-14; its SB-2 of 1997-12-12, the offering its record begins
        with, is dropped too.
      - The tender forms in 1998 Q2, on index companies: five offers they made (SPX's for Echlin,
        Viad's for MoneyGram Payment Systems, Dillard's for Mercantile Stores, Tyco's for Sigma
        Circuits on JCI's record, Armstrong's for Triangle Pacific); 39 amendments on 11 companies
        (Abbott, Alcoa on Howmet's record, Motorola, Snap-on, Cendant on Avis Budget's…); and The
        Limited's offer for its own shares (BBWI's record) and SAP's. None in 2003 or 2007.
        Dillard's SC 14D1 of 1998-05-21 and its nine amendments to 1998-08-19 carry no file number,
        while its 1990s 10-Ks, 10-Qs, 8-Ks and 13Gs all carry one, so `DEAL_FORM`'s rule
        (`lib/secForms.ts:172`) reads them as its own offer, as it reads Pfizer's SC TO-T filings.
      - 10-K405/A: 42 rows on 39 index companies in 1998 Q2 (AMD, ATI, AXP, AAL…), none later.
        SB-2: 3, 7 and 31 rows in the three quarters; 10-12B and 10-12G together 5, 4 and 3.
      - The work: rows in `MATERIAL_FORMS`; SC 14D1 and SC 14D1/A in `DEAL_FORM`,
        `FOR_ANOTHER_COMPANY` and `MONTHLY_FORM`. Focus reads a 10-K405 as a 10-K
        (`lib/focus.ts:67-68`) and should read a 10KSB so, and a 10QSB as a 10-Q; `EventList`'s
        form pattern names 10-K405 (`components/EventList.tsx:416`) and needs the new forms.
      - A caveat to state: a few of these records were shells or blank-check companies then —
        QXO's 2007 10KSB is Trey Resources', Primoris's is Rhapsody Acquisition's. Their reports
        read under today's name, as those records' 8-Ks of the same years already do; how many of
        the 464 are such records was not counted.
      - Cases in `check:sec-forms` on rows pinned from the two records read: EGBN's 10QSB of
        1998-04-28 (report date 1998-03-31) is kept as a quarterly report typed earnings, and its
        10KSB of 1999-03-30 as an annual report; Dillard's SC 14D1 of 1998-05-21 is kept as its own
        tender offer, its amendments one row a month; a 10-K405/A is kept as an amended annual
        report; by the pick, EGBN's SB-2 of 1997-12-12 is kept and a 10-12G is not. In
        `check:focus`, "10-K" finds a 10KSB and "10-Q" a 10QSB. On main each row is dropped at
        `lib/sec.ts:894`, so the cases fail. No key, licence, recurring cost or request — the rows
        are in the older shards ingest already reads; small, offline.
      - *Derived from [`docs/proposals/2026-11-01-proposals.md`](proposals/2026-11-01-proposals.md)
        #1, approved 2026-11-01 with the pick. Importance high · Efficiency very high ·
        Practicality high (one owner pick, made 2026-11-01).*
      - ✅ **Done in batch 80** (see its section): the twelve forms kept, Eagle Bancorp's 1998–2002
        going from 1 report to 19 and Dillard's 1998 offer for Mercantile Stores on its page.
- [x] `P1` **The SEC's litigation releases and administrative proceedings, by the parties their
      captions name.** A new source, approved by the owner 2026-11-01: the SEC's other two
      enforcement listings, on the host and under the licence of the press releases batch 73 reads
      back to 1997 — "Information presented on sec.gov is considered public information and may be
      copied or further distributed by users of the web site without the SEC's permission. Please
      consider appropriate citation to the SEC as the source" (`lib/secPress.ts:13-16`, read
      2026-10-28) — and no key. They are the SEC's record of each case it brings, in every sector,
      and reach into the 1963–2017 stretch `docs/COVERAGE-MAP.md:88` calls the corpus's biggest
      hole. The 2026-10-22 note did not shortlist them: "finding a company means reading every
      year's pages, and the latest page of litigation releases named individuals and small firms
      only" (`docs/proposals/2026-10-22-news-sources.md:170-172`). Reading every year once is now
      built — batch 73's walk read 293 pages and never asks a closed year again — and the latest
      page is not the year: 2010, read whole, names 16 listed companies.
      - ✅ **The owner's call, 2026-11-01: yes to the source.**
      - The listings: litigation releases at
        `www.sec.gov/enforcement-litigation/litigation-releases?year=Y&month=All&page=N`, and
        `administrative-proceedings` in the same shape, 100 rows a page, newest first. Each row has
        a `<time>` instant; the caption, which lists the defendants or respondents ("Huntington
        Bancshares, Inc.; Thomas E. Hoaglin, Michael J. McMennamin, and John Van Fleet, CPA"); the
        release numbers (LR-21795, 34-63571); a proceeding's file number (3-14153); and a link.
      - Measured 2026-11-01: 2010 holds 439 litigation releases on 5 pages and 739 proceedings on
        8. A party matched to an index company by its exact everyday name gives **25 events (a
        company and a day) on 16 companies**:
        - litigation releases: Transocean, Tidewater and Noble (all 2010-11-04, the
          customs-bribery cases), ABB, Universal Corp, Citigroup, General Electric, Eni, Innospec,
          Assurant, Bank of America (three days in January and February), and Morgan Stanley &
          Co. among the dealers named on 03-19;
        - proceedings: Morgan Stanley & Co. (four days), Value Line (four days, under one
          caption), Huntington Bancshares (11-09), Daxor and China Yuchai;
        - only 4 of the 25 fall on a day a press release names the company (Innospec 03-18, GE
          07-27, Citigroup 07-29, ABB 09-29; `sec_press_releases`, `chronolens_b73`). The press
          release of 2010-11-04 (2010-214) names none of the three drillers.

        2004's first pages (October to December, 200 rows) give 4 events on 3 companies: Disney,
        AIG and Morgan Stanley. If 2010 is typical, about 20 a year, roughly 450 for 1995–2016,
        beside the 120 press releases before 2017 on pages today; not sized past the years read.
      - A second year walk beside the press releases' (`lib/ingest/secPressWalk.ts`), its rows
        stored once as `sec_press_releases` and `sec_press_years` are, each closed year read once
        and never asked again, and each company matched at its ingest. The caption is split into
        its parties (at ";", ", and", "Defendants", "et al.", "(n/k/a …)"), and each party is
        compared with the company's names for that year (`namesForYear`, as the press releases and
        the Federal Register walk do), under the longer-listed-name and shared-name guards already
        written. A day's releases on one company make one row; a proceeding's file number ties its
        steps. The `<time>` is an instant, so the day is Washington's (`easternDay`,
        `lib/secPress.ts:57`). Registered in `SOURCES`, credited, and scored without the model, as
        the press releases are.
      - What the rule must refuse, all on those pages:
        - a namesake: "Overland Energy, Inc., Acorn Energy, Inc., Garry B. Smith, …" (2010-11-10),
          whose co-defendants are not Acorn Energy's (ACFN) people;
        - relief defendants, who are not charged ("…, Defendants, and Tega Operating Company,
          Relief Defendant");
        - a company's stock as the subject: "One or More Unknown Purchasers of Securities of Martek
          Biosciences Corporation", "…of Options of InterMune, Inc.";
        - the lists of delinquent registrants whose registration is revoked, five to seven shells a
          caption ("EC Power, Inc., Electro Energy, Inc., EMB Corporation (n/k/a AMTGroup, Inc.),
          …", 2010-12-21);
        - an acquisition's past: "Jefferies and Co., Inc." (2010-12-09) was Jefferies Group's, which
          Leucadia, today's JEF (CIK 96223), bought in 2013; "Janus Capital Management LLC"
          (12-01) is Janus's, which merged with Henderson in 2017.
      - Units the captions name exactly — "Banc of America Securities LLC" (four rows in November
        and December 2010), "Wachovia Securities, LLC", "J.P. Morgan Securities Inc." and "Bear,
        Stearns & Co. Inc." — reach their banks through the release rules' unit map (the `P2` from
        the same proposals, at this section's end). The exact names do not need it.
      - A new check on rows pinned from 2010's pages: Transocean, Tidewater and Noble land on RIG,
        TDW and NE on 2010-11-04 (Noble's through its predecessor in `lib/predecessors.ts`), and
        Huntington's on HBAN; Acorn Energy's case is refused for ACFN; Martek's unknown purchasers,
        the revocation lists and a relief defendant land on no company; with the unit map, Banc of
        America Securities' order of 2010-12-17 lands on BAC and Jefferies and Co.'s is refused for
        JEF; a closed year is not asked twice. On main it cannot run: the adapter does not exist.
        No key, licence fee or recurring cost: reading 1995–2025 once is roughly 300–400 requests
        if other years are 2010's size, a second apart, once for all companies; then each listing's
        newest page a day. A cloud session builds it (sec.gov answers from the container,
        measured).
      - *Derived from [`docs/proposals/2026-11-01-proposals.md`](proposals/2026-11-01-proposals.md)
        #2, approved 2026-11-01 with the new source. Importance high · Efficiency medium-high ·
        Practicality medium (the source approved; the namesakes a caption can carry).*
      - ✅ **Done in batch 83** (see its section): both listings read whole once, 1995–2026, 344
        pages and 30,654 rows. A caption entry names a company only by its name or legal name with
        legal words after it, so "Southern Financial Group, Inc." is not Southern Company. Replayed
        against the index: 1,022 company days on 352 companies, 478 before 2017, 813 of them on a
        day no press release names the company. 2010 gives 55 on 24 companies; the scout's exact
        names gave 25 on 16. Ten namesakes the rule cannot tell apart were read by hand and are kept
        off by CIK.
- [x] `P1` **A legal form left in the everyday name: Deutsche Bank, Fresenius SE, YPF and eleven
      others.** `commonName` strips "AG", "S.A." and "SE" (`lib/edgarName.ts:16-17`) and not the
      words they abbreviate, so 14 everyday names in the committed index keep a legal form:
      DEUTSCHE BANK AKTIENGESELLSCHAFT (DB, 287th in the index), Fresenius SE & Co. KGaA (FSNUY,
      494th) and YPF SOCIEDAD ANONIMA (YPF, 641st); Ottobock, Turk Altin Isletmeleri (A.S), SCHOTT
      Pharma, Springer Nature, InoBat, LuxExperience, Loma Negra, Cementos Pacasmayo (SAA), Meridian
      Mining UK (Societas), Com7 (PCL) and TKMS. Every name-based source then asks for a phrase no
      headline, title or caption writes. The check that should catch it, "no everyday name in the
      committed index keeps a mark or a legal form" (`scripts/check-recall.ts:92-95`), passes,
      because its pattern knows only the short forms: "DEUTSCHE LUFTHANSA A G" is a case there
      (`:73`), "AKTIENGESELLSCHAFT" is not. Deutsche Bank's part was raised in batch 73 (its "Found
      on the way") and confirmed by the 2026-10-30 audit.
      - ✅ **The owner's approval, 2026-11-01: as proposed, with no call.** It is the rule's own
        reach, not a new name: "AG" is stripped wherever it stands, and "Aktiengesellschaft" is the
        word it abbreviates. The calls on the unit map (the `P2` at this section's end) add names a
        company's record does not carry; this only finishes cleaning the one it does.
      - What each source asks for Deutsche Bank today, from the code's own functions:
        - GDELT: "DEUTSCHE BANK AKTIENGESELLSCHAFT" (`gdeltNewsPlan`, `scripts/ingest.ts:671`);
        - the Justice Department's title search: the same (`dojQueryNames`);
        - the SEC and Federal Register title rules: the same (`companyNames`);
        - its scoring names include "aktiengesellschaft" (`companyScoringAliases`), and Wikidata
          gives it no other name (`data/company-aliases.json`).

        Fresenius SE and YPF are asked the same way, by "Fresenius SE & Co. KGaA" and "YPF SOCIEDAD
        ANONIMA".
      - Measured 2026-11-01: the 6,894 stored SEC releases (`chronolens_b73`), replayed with the
        rule unchanged and "Deutsche Bank" as the name, make it the party in 7, 4 before 2017 —
        among them 2004-120 (Deutsche Bank Securities, research conflicts), 2009-127 (auction-rate
        securities, which lands today on Bank of America and RBC only), 2015-99 ("SEC Charges
        Deutsche Bank With Misstating Financial Reports During Financial Crisis") and 2016-264.
        Under today's name, none. The Justice Department, asked for "Deutsche Bank", has 21 titles,
        none containing the name the adapter asks; about 8 days make the bank a party — "Deutsche
        Bank Agrees to Pay $7.2 Billion for Misleading Investors in its Sale of Residential
        Mortgage-Backed Securities" (2017-01-17), its London subsidiary's LIBOR plea (2015-04-23),
        the 2014-12-08 suit over a tax scheme, "United States Sues Deutsche Bank and Subsidiary
        MortgageIT" (2011-05-03). The rest are about the bank's people, which the rule refuses.
      - Strip the long forms of the legal suffixes the rule already strips in short:
        Aktiengesellschaft ("AG"), KGaA, Sociedad Anonima ("S.A."), S.A.A., B.V., A.S., PCL and
        Societas ("SE"); then extend the index-wide check's pattern to them. Nothing to re-read by
        hand: the GDELT months and Federal Register years are kept by the names they were asked
        under ("months not yet asked under this query", `lib/ingest/newsBackfill.ts:78`;
        `lib/ingest/frBackfill.ts:107`), so a corrected name is asked afresh on its own. Two things
        to watch: "Fresenius" alone then names Fresenius SE, while "Fresenius Medical Care" stays
        FMC's by the longer-name rule (`longerListedNameIn`); "YPF" is under five letters, so GDELT
        is asked with its legal form, as Visa is (`docs/COVERAGE-MAP.md`, the GDELT row).
      - Deutsche Bank's scoring names change with it. Whether "deutsche" alone should stay among
        them is batch 79's note for the next audit, not part of this item.
      - Cases in `check:recall`: "DEUTSCHE BANK AKTIENGESELLSCHAFT" is "DEUTSCHE BANK", "Fresenius
        SE & Co. KGaA" is "Fresenius", "CEMENTOS PACASMAYO SAA" is "CEMENTOS PACASMAYO"; the
        index-wide check, its pattern extended, finds none of the 14. A `check:sec-press` case:
        2015-99 lands on DB. On main the cases fail, and the extended index-wide check finds 14. No
        key, licence, recurring cost or request beyond each company's usual ones; small, offline.
      - *Derived from [`docs/proposals/2026-11-01-proposals.md`](proposals/2026-11-01-proposals.md)
        #3, approved 2026-11-01 as proposed. Importance medium-high · Efficiency very high ·
        Practicality high (no call, as the owner agreed).*
      - ✅ **Done in batch 81** (see its section): 17 everyday names cleaned, not 14 — the spaced
        "A S" left Novo Nordisk, Turkcell and Anadolu Efes too; Deutsche Bank's SEC releases go from
        0 to 7.
- [x] `P1` **The SEC News Digest, 1956 to the mid-1990s: the SEC's own daily record before EDGAR,
      a count first.** A new source, approved by the owner 2026-11-02: the Digest's yearly archive
      pages (`www.sec.gov/news/digest/digarchives/digarchYYYY.shtml`, 1956–2013), one PDF an issue
      with a text layer, on sec.gov under the licence `lib/secCases.ts` quotes ("Information
      presented on sec.gov is considered public information and may be copied or further
      distributed…", re-read 2026-11-02). No key. Before 1995 a company's page holds Yahoo's
      dividends and splits and a few EDGAR filings (IBM's 1963–1993 is 127 events, every one a
      dividend or split); the Digest is the SEC's daily summary of the same business before that.
      - ✅ **The owner's call, 2026-11-02: yes to the source, with the count first.**
      - ✅ **Step 1 done in batch 87:** `npm run digest-report -- 1985` counted 508 rows on 258
        listed companies, all under the names their EDGAR records had that day. 361 remain after
        the first-price floor; 50 of 50 sampled rows were right. The count read ~173 MB, not ~140.
        The dated names keep Deutsche Bank AG's order (IC-14293) off DB, whose record began in 2002.
        Step 2 waits on the owner's read of the count; see batch 87's ledger section.
      - ✅ **The owner's call, 2026-11-06: "Go ahead with the Digest step 2".**
      - ✅ **Done in batch 102** (see its section): the walk keeps every issue's entries of
        1956–1993, and each company's ingest puts its own on its page, under the names its EDGAR
        record had on the issue's day, from its first price. On 1985 it gives 509 rows on 259
        companies and 358 events on 188 pages. The walk itself starts once `NEWS_CHARTS_CONTACT`
        and poppler's `pdftotext` are on the ingest host (`docs/OWNER-ACTIONS.md`).
      - What an issue holds, from six read by the scout (1965–1990): enforcement actions with their
        release numbers; Holding Company and Investment Company Act orders (Deutsche Bank AG's
        IC-14293, 1985); Securities Act registrations by registrant; the 8-K reports filed, by
        company, with their items and month (247 in the 1975-06-16 issue, Abbott's and PepsiCo's
        among them); 13D and 14D-1 filings (Hasbro, 1990); listing and delisting orders.
      - Index companies in the six, read by hand: 0 to 10 an issue, about 3 on average. An estimate,
        not a count: on the order of 750 entries a year, 25,000–30,000 over 1956–1993.
      - **Step 1, the count:** `npm run digest-report -- <year>` reads one year's issues once
        (~250 requests, ~140 MB), takes each PDF's text, splits it into its sections, and prints,
        per index company and section, the entries that name it under its names and EDGAR former
        names. Nothing is stored, as batch 13's `fr-company-report` sized the Federal Register.
      - **Step 2, only if the count holds:** a year walk in the shape of the SEC press-release
        walk, entries stored once and matched at each company's ingest, typed by section and
        linked to the issue's PDF; the 8-K entries a row a month. 1956–1993 is about 9,500 PDFs,
        ~5.4 GB, read once.
      - What the rule must refuse or cannot reach: an underwriter named inside another company's
        registration; a record younger than the name (McGraw Hill, MH, listed 2025); names older
        than EDGAR's former names (Caterpillar Tractor, Middle South Utilities) without a hand map;
        OCR noise in the column tables.
      - **Open after the count:** whether the Digest keeps the first-price floor (Yahoo's daily
        data begins 1962 at the earliest); the count reports the entries it would remove.
        Batch 102 kept it, as for every source: in 1985 it removes 147 of 509 rows. Lifting it is
        the owner's call.
      - A PDF text reader on the ingest path: poppler's `pdftotext` (in this container) or
        `pdfjs-dist` (Apache-2.0). A new check on the six issues' text: Abbott's 8-K of May 1975
        lands on ABT on 1975-06-16, 3M's under its EDGAR former name, Deutsche Bank AG's IC-14293
        on DB, Hasbro's five 13D rows make one row, the 1980 underwriter on no page, McGraw-Hill's
        1990 delisting not on MH. On main it cannot run: the reader does not exist.
      - *Derived from [`docs/proposals/2026-11-02-proposals.md`](proposals/2026-11-02-proposals.md)
        #1, approved 2026-11-02 with the count first. Importance high · Efficiency medium ·
        Practicality low-medium (OCR, names older than EDGAR, and the count first).*
- [ ] `P2` The rest of the securities-coverage depth set: **GDELT year-window backfill** (GDELT
      answers from this container but throttles hard — 429/503 — so this needs the production
      host to develop against) and **richer paid-tier evidence** (needs a paid key). The LoC
      decade walk serves companies too and keeps its place; Wikidata alias harvesting shipped in
      batch 24 once `query.wikidata.org` answered from the cloud session. Topic-only recall items
      rank behind all of these until the scope changes again. ✅ **GDELT backfill built in batch
      57**, a month at a time rather than a year (see that section); its live measurement waits on
      the production host. The paid-tier evidence stays open.
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
- [x] `P2` **A fund's page carries its own fund's filings, by EDGAR's series tag.** It revisits
      NC-139's premise, "filtering per fund would cost a request per filing": today every trust
      filing goes on every series' page, titled with the registrant, scored 0.7 and "may concern a
      sibling fund" (`lib/sec.ts:880-895`). EDGAR's per-series list
      (`browse-edgar?action=getcompany&CIK=S000002839&owner=include&count=100&output=atom`) tags
      each fund filing with its series at a request per hundred: VOO's 533 since 2006 in 6
      requests. Measured 2026-10-26: of the 432 kept-form filings the Vanguard Index Funds trust
      made from 2022-12-05 to 2026-08-28, all on VOO's page today, 76 (18%) are VOO's (NPORT-P
      181 → 15, 497K 191 → 16, 497 39 → 29).
      - Keep the series id the sync already reads and drops — `parseSeriesPage` returns `seriesId`
        (`lib/edgarSeries.ts:57`), `collect` keeps only name, symbol and CIK
        (`scripts/sync-tickers.ts:177-187`); one id per series, 19,540. At ingest, read the fund's
        own list, paced as the headline reader is: its own filings are titled with its name and
        score 1.0, a sibling's are not linked. When the list cannot be read, today's behaviour
        stays.
      - Needs one `npm run sync:tickers` to write the ids (the owner's host or a cloud session).
      - A `check:tickers` case (the index carries the id, no request) and `check:sec-forms` cases
        on pinned Atom pages: VOO keeps 76 of the 432; a sibling's NPORT-P is not on VOO's page; an
        unreachable list leaves today's titles. No key, licence or recurring cost.
      - ✅ **Done in batch 67** (see its section). The fund's name goes on at read time, since one
        stored row serves every sibling's page. Filings before a list begins (February 2006) keep
        their hedge.
      - *Derived from [`docs/proposals/2026-10-26-proposals.md`](proposals/2026-10-26-proposals.md)
        #5, approved 2026-10-26. Importance medium · Efficiency high · Practicality high.*
- [x] `P2` **When a filing came out: before the open, or after the close.** Every submissions
      record carries each filing's `acceptanceDateTime`, and `FilingBlock` reads none of it
      (`lib/sec.ts:759-766`); `events.occurred_at` exists for "a real instant"
      (`docs/EVENTS-SCHEMA.md:134`), and 0 of 30,470 events in the batch 42 database have one. The
      schema deferred it "until the price series goes intraday" (`:346-347`); this is a different
      reason — the time decides which daily bar a release belongs to, and prices stay end of day.
      Measured 2026-10-26: of 544 results 8-Ks since 2008 in 45 sampled records, 290 (53%) were
      accepted after 16:00 ET and carry that day's date. All 45 of Apple's since 2015 came after
      the close: median move 0.7% on the release day, 3.7% the next session. Biggest moves knows
      and guesses ("an after-close 8-K/earnings moves the *next* session",
      `components/BiggestMoves.tsx:32-34`) but scores the move's own day first (`:97`), so a
      2%-plus release-day move — 10 of Apple's 45 — is captioned with a release that came after it.
      - Read the field, store it in `occurred_at` and carry it to the event; the row says "4:30 pm
        ET, after the close"; one rule in `nearestCatalyst`: a move is never paired with something
        published after its session closed. The schema doc's deferral note changes with it.
        GDELT's `seendate` and Yahoo's `pubDate` could follow; not part of this item.
      - A `check:sec-forms` case (Apple's 2026-07-30 release, "2026-07-30T20:30:00.000Z", stored as
        16:30 ET, daylight saving handled) and a `nearestCatalyst` case in `check:markers`. No key,
        licence, recurring cost or request; small, offline.
      - *Derived from [`docs/proposals/2026-10-26-proposals.md`](proposals/2026-10-26-proposals.md)
        #6, approved 2026-10-26. Importance medium · Efficiency high · Practicality high (it
        revisits a written deferral, with a reason the deferral did not weigh).*
      - ✅ **Done in batch 68** (see its section). Apple's measured figures differ a little from
        those above (release day 1.0%, next session 3.5%), and stamps before 2002 are mostly
        midnight placeholders, read as no time.
- [x] `P2` **Federal Reserve enforcement actions on bank pages.** A new source, approved by the
      owner 2026-10-26: the Board's actions against a listed bank holding company — cease-and-desist
      orders, written agreements, civil money penalties — as regulation events. Licence:
      "information on Board's website is in the public domain … Please cite to the Board as the
      source" (`federalreserve.gov/disclaimer.htm`); the Board is already credited for the FOMC
      statements (batch 21). Carmakers and drug, device and food makers carry their regulator's
      actions; banks carry none of theirs. Measured 2026-10-26: two keyless JSON files,
      `/supervisionreg/ea-old.json` (2,514 actions, 1989-09-25 to 2018-12-26, 566 KB, read once)
      and `/supervisionreg/files/ea-cms-recent.json` (385 since 2019-01-18, 92 KB, read daily); 45
      actions against five large banks, most before 2017 — Wells Fargo's asset-cap order of
      2018-02-02, JPMorgan's $200 million penalty of 2013-09-18.
      - **A hand-checked map like `FDA_FIRMS`, with a city check, never a name alone:** by name,
        152 actions land on 76 listed companies, many of them other banks of the same name
        ("Huntington Bancshares, Inc., Huntington, Texas" is not Huntington). Start with the 20 or
        so largest bank holding companies. An action against a person is not the bank's; a
        cease-and-desist and a penalty the same day are one event.
      - Unsized past the large banks until the map is built: a few to a dozen material events a
        bank.
      - A new `check:fed-actions` on real rows: Wells Fargo's 2018 order lands on WFC; the
        namesakes are refused; same-day orders make one event; the source is registered and
        credited. No key, licence fee or recurring cost; a cloud session builds it.
      - *Derived from [`docs/proposals/2026-10-26-proposals.md`](proposals/2026-10-26-proposals.md)
        #7, approved 2026-10-26 with the new source. Importance medium · Efficiency medium ·
        Practicality medium (the source approved; the bank map still to build).*
      - ✅ **Done in batch 69** (see its section): 25 banks mapped, 72 events on 18 of them, 51 before
        2017. Foreign banks' US arms are the next step if wanted.
- [x] `P2` **FDA recalls for the next health-care makers.** Extend `FDA_FIRMS`
      (`lib/fdaRecalls.ts:54`, 38 companies today) to the listed device and drug makers with the
      most Class I and II recalls not yet mapped, each date a firm joined or left taken from the
      company's own SEC filing, as batch 41 did. Measured on openFDA 2026-10-26: Beckman Coulter
      223 (Danaher's), Fresenius Medical Care 86, ICU Medical 78, Steris 57, Bausch 24, Amneal 24,
      Perrigo 20, GlaxoSmithKline 18, Avanos 18, Insulet 15 — about 650 across some twenty
      companies; food and household makers add about 150 (Dole 26, TreeHouse 13, Church & Dwight
      13).
      - Most of the work is the acquisition dates (ICU Medical's Smiths Medical, Steris's Cantel,
        the GSK consumer business that became Haleon) and the look-alike pass batch 40 did:
        "Bausch" is two listed companies; "Coca-Cola" (33) is mostly independent bottlers.
        Retailers' store-brand recalls (Kroger 41) stay out, for the reason the CPSC note gives
        (`docs/proposals/2026-10-22-news-sources.md:144-146`).
      - Nearly all are Class II, which rank as news (Beckman Coulter: 334 Class II, 5 Class I).
      - Cases in `check:fda-recalls` on real openFDA records for each new company, both sides of
        each date, look-alikes refused. 3–6 requests a day per company, inside openFDA's keyless
        1,000 a day; no key, licence or recurring cost.
      - *Derived from [`docs/proposals/2026-10-26-proposals.md`](proposals/2026-10-26-proposals.md)
        #8, approved 2026-10-26. Importance low-medium · Efficiency medium · Practicality high.*
      - ✅ **Done in batch 70** (see its section): 33 more companies (71 in all), and units the map
        missed on seven it had (Teleflex's Arrow, Stryker's Howmedica and later purchases, BD's
        CareFusion, GE's other names). Recalls 4,696 → 6,606. Siemens Healthineers is left out: it
        has no SEC filing to date its listing.
- [x] `P2` **The Federal Reserve's actions against the foreign banks with pages here.** Add the
      foreign banks in the company index to `FED_BANKS` (`lib/fedActions.ts:53`), each row checked
      by eye as batch 69 did, under its rule: a bank's own history and its US arms count, an
      acquisition's past never does, and a unit the company sold stops counting the day it left
      (`:51`). Batch 69 left it as the next step ("Foreign banks' US arms … are not mapped", in its
      "Left as is"). Measured 2026-10-28 on the Board's two files (2,899 rows, 1,562 of them against
      an organisation rather than a person): 37 action days fall on 14 foreign banks in the company
      index, 27 of them before 2017 — HSBC 7 (6 before 2017; penalties of $165M in 2012, $131M in
      2016, $175.3M in 2017), DB 7 (2; $136.95M in 2017), SAN 4 (3), UBS 3 (2; $100M in 2004, $342M
      in 2015), NWG 3 (3; $274M in 2015, as The Royal Bank of Scotland), BCS 2 (2; $342M in 2015),
      SMFG 2 (1), MUFG 2 (2), BBVA 2 (2), and RY, TD, BMO, BNS and CM 1 each (4 before 2017; TD's is
      2024-10-09). Today's 25 banks carry 72 events (batch 69); these add 37. Four recent penalties
      carry no amount in the file (Deutsche Bank's of 2022 and 2023, UBS's of 2023, TD's of 2024).
      - **What the map must refuse, all in the files:** Bankers Trust's agreements of 1991 and 1994,
        from before Deutsche Bank bought it (the day read from a filing) — its US trust company
        counts under its later name, Deutsche Bank Trust Company Americas (2005, 2022); namesakes
        ("Community Bankers Trust Corporation, Glen Allen, Virginia" is not Deutsche Bank's; "City
        National Bancshares Corporation, Newark, New Jersey" is not RBC's City National; "Capital
        Commerce Bancorp" and "Tennessee Commerce Bancorp" are not TD's); Credit Suisse's actions
        from before UBS bought it — UBS's 2023 action names UBS Group AG beside Credit Suisse, and
        counts.
      - Where a named unit was bought ("Deutsche Bank Trust Company Americas", "RBC Centura Bank",
        "HSBC Finance Corporation", "Santander Holdings USA"), the day it became the bank's comes
        from a filing, as batch 69 dated American Express's sale. UBS AG's 2004 and 2015 actions are
        read as the group's bank's, as Goldman Sachs Bank USA's are Goldman's (`:63`). MUFG's 2004
        row is against "Union Bank of California International", by its name a unit of
        UnionBanCal; its ownership that day needs a filing.
      - Not mappable, so left out: the largest foreign-bank penalties in the files — BNP Paribas's
        $508 million (2014) and $246.4 million (2017), Standard Chartered's, Société Générale's,
        Commerzbank's and ICBC's — fall on banks with no page in the company index.
      - Cases in `check:fed-actions` on rows pinned from both files: HSBC's 2012-12-11 order and
        $165 million penalty are one event on HSBC; Barclays' 2015-05-20 penalty lands on BCS;
        Bankers Trust's 1994 agreement is refused for DB, and Deutsche Bank Trust Company Americas'
        2005 agreement is not; the Newark City National and the two Commerce Bancorps are refused;
        UBS's 2023 action lands on UBS; every new bank's count is pinned. No key, licence or
        recurring cost, and no request: the two files are already read once an ingest process,
        whatever the number of banks.
      - *Derived from [`docs/proposals/2026-10-28-proposals.md`](proposals/2026-10-28-proposals.md)
        #2, approved 2026-10-29. Importance medium · Efficiency high · Practicality high.*
      - ✅ **Done in batch 74** (see its section): the 14 banks mapped, 37 events, 27 before 2017,
        exactly as measured; each bought US unit dated from the bank's own filing.
- [x] `P2` **QQQ's annual reports: keep form N-30B-2 among the fund forms.** QQQ's record (Invesco
      QQQ Trust, Series 1, CIK 1067839, read whole) holds 22 N-30B-2 filings, filed 2005-05-16 to
      2025-10-24, each with a report date of 30 September, 2004 to 2025 — its annual reports as a
      unit investment trust (the record also holds the trust forms S-6 and N-8B-2). The fund form
      list (`lib/sec.ts:823-840`) has no N-30B-2, so the filter drops every one (`:847`), and the
      only shareholder report on its page is the N-CSRS of 2026-06-01. SPY, DIA and MDY file theirs
      as N-30D, which is kept and typed earnings (`:832`): 48, 51 and 25 in their records. QQQ is
      one of the four securities in the homepage's first chips (`INITIAL`,
      `lib/suggestions.ts:50-56`).
      - Add "N-30B-2" to `wanted` and `FUND_LABELS`, labelled "Shareholder report (N-30B-2)" and
        typed `earnings` as the N-30D is: 21 years of the fund's annual reports on the Earnings chip
        where SPY's sit. The rows go through batch 67's series rule as any fund filing does (QQQ's
        series id, S000101292, is in `data/edgar-tickers.json`); one filed before its series list
        begins keeps the trust's name and hedge.
      - **Optional, not part of the approval unless the owner picks it:** the older forms of two the
        list keeps. On Fidelity Contrafund's record N-Q runs to 2018-11-28 and NPORT-P begins
        2019-11-26; NSAR-A and NSAR-B run to 2018 and N-CEN begins 2020-03-12. Counts: N-Q 29,
        NSAR-A 24, NSAR-B 25 on Contrafund's record; NSAR-U 21, 19, 20 and 20 on SPY's, QQQ's,
        DIA's and MDY's. Routine forms: a page would gain years of the rows it already shows from
        2019 and 2020.
      - A `check:sec-forms` case on QQQ's real row of 2021-12-29 (report date 2021-09-30): kept,
        labelled and typed earnings; against main it is dropped at the form filter. No key, licence,
        recurring cost or request — the rows are in the record ingest already downloads; small,
        offline.
      - *Derived from [`docs/proposals/2026-10-28-proposals.md`](proposals/2026-10-28-proposals.md)
        #3, approved 2026-10-29. Importance medium · Efficiency very high · Practicality high.*
      - ✅ **Done in batch 75** (see its section): all 22 kept, labelled and typed earnings. The
        optional older forms (N-Q, NSAR-A, NSAR-B, NSAR-U) stay out, as the approval did not pick
        them.
- [x] `P2` **FDA recalls for Siemens Healthineers and Fresenius SE.** Batch 70 counted both and left
      them out for a rule, not for want of data (its "Not mapped, and why"), and both pages carry
      almost nothing from EDGAR: Siemens Healthineers' record (SMMNY, CIK 1738519) holds six F-6EF
      filings, the first 2018-04-26, and nothing else; Fresenius SE's (FSNUY, CIK 904868) holds 24
      Schedule 13D filings and amendments about FMC, which carry no file number on its record, so
      the stake rule keeps them off its page (`lib/sec.ts:863`).
      - ✅ **The owner's calls, 2026-10-29:**
        - **Siemens Healthineers' recalls count from its 2018 listing** (option a), the day read
          from the company's own annual report, since no SEC filing dates it — for this case, an
          exception to the map taking every date from the company's own SEC filing
          (`lib/fdaRecalls.ts:77-78`). The map already dates a unit spun off from a listed parent
          from its listing (Kenvue, `:317-328`); Siemens AG has no page here. Its 726 Class I and II
          recalls under "Siemens Medical Solutions USA" and "Siemens Healthcare Diagnostics" (1,459
          records; 4 recalls with a Class I product) are the 726 batch 70 counted: 413 began before
          2018 and stay out, 313 from 2018 on, so at most 313 land. Not all 726 (option b, reading
          a parent with no page as Medline's private past is read, `:369`), and not left out (c).
        - **Fresenius SE's control of FMC counts:** FMC's recalls before 2023-11-30 are also
          Fresenius SE's. Its 13D/A filed 2023-12-07 says that on 2023-11-30 FMC converted from a
          KGaA to an AG "and Fresenius KGaA completed the deconsolidation of Fresenius Medical Care
          AG"; before that day it "owned 100% of the equity of the General Partner", and held 32% of
          FMC's shares. For this case the map's rule for a listed unit, "both companies' while the
          parent holds most of it" (Envista `:403`, Bausch + Lomb `:501`), becomes "while the parent
          controls it". 65 of the 86 recalls filed under FMC's own name began before 2023-11-30
          (batch 70's 91 for FMC include NxStage).
      - Fresenius Kabi, which needs neither call: "Fresenius Kabi USA" and "Fresenius Kabi
        Compounding" have 58 recalls from 2012-09-27 — 36 drug and 22 device, 25 with a Class I
        product — mapped to FSNUY. FMC's entry keeps refusing Kabi, "Fresenius Kabi belongs to
        Fresenius SE, another company" (`:410`).
      - Varian Medical Systems, which Siemens Healthineers bought, has 31 recalls, the last
        2022-03-21: only those after the purchase closed count, so one at most. "Siemens Hearing
        Instruments" is not Siemens Healthineers'.
      - Cases in `check:fda-recalls` on real openFDA records: a Fresenius Kabi recall lands on FSNUY
        and not on FMS; an FMC recall before 2023-11-30 lands on both FMS and FSNUY, and one from
        that day on FMS only; Siemens Healthineers' recalls land on SMMNY from the listing day and
        not before; "Siemens Hearing Instruments" is refused. Six more openFDA requests a day, three
        per company, on the map's 213 (batch 70), inside the keyless 1,000; no key, licence or
        recurring cost.
      - *Derived from [`docs/proposals/2026-10-28-proposals.md`](proposals/2026-10-28-proposals.md)
        #4, approved 2026-10-29 with both calls. Importance low-medium · Efficiency high ·
        Practicality medium (the two calls made 2026-10-29).*
      - ✅ **Done in batch 76** (see its section): Siemens Healthineers 298 recalls from its
        listing on 2018-03-16, Fresenius SE 125 (Kabi's 58, FMC's 67 from before 2023-11-30).
- [x] `P2` **The vehicle brands Ford and GM owned, on their pages while they owned them.** The FDA
      and Federal Reserve maps count a business a company sold until the day it left
      (`lib/fdaRecalls.ts:78`, `lib/fedActions.ts:51`) — J&J's Cordis counts for J&J until
      2015-10-01 (`lib/fdaRecalls.ts:305`) — and the vehicle map cannot: `RecallMaker` has a `from`
      and no `to` (`lib/recalls.ts:33-43`). Batch 31 left the question open: "whether a former
      subsidiary's recalls belong on the seller's page is a question the rule does not settle" (its
      "Open" box).
      - ✅ **The owner's call, 2026-10-29: a brand Ford or GM owned counts for it until the day it
        sold the brand**, as a sold business does in the other two maps.
      - Add `to` to `RecallMaker` and to both adapters' queries and row filters — `recallQuery`
        (`lib/recalls.ts:146-151`, filter `:231`) and `investigationQuery`
        (`lib/investigations.ts:44-49`, filter `:90`). Map Volvo, Jaguar and Land Rover to Ford and
        Saab to GM for the years each owned them, each day read from the company's own filings, as
        batch 31 read purchase dates. Investigations follow through the same map.
      - Measured 2026-10-28 on the recalls dataset at the 10,000-vehicle floor, in sizing windows
        (the real days come from the filings): "Volvo Car USA, LLC", the dataset's name for Volvo's
        recalls since 1968, 30 from 1999-04 to 2010-07, the largest 245,894 vehicles; "Jaguar Cars,
        Ltd." 11 and "Redundant JAGUAR ROVER TRIUMPH INC." 2, from 1990 to 2008-05; "Land Rover" 13
        from 2000-07 to 2008-05, the largest 100,174 vehicles; "SAAB CARS USA, INC." 12 from 2000 to
        2010-02, and 8 more in 1990–1999 whose ownership the filings must settle. Defect
        investigations opened in the same windows: Volvo 17, Jaguar 5, Land Rover 6, Saab 9. Ford's
        page gains about 56 recalls and 28 investigations from 1990 to 2010, beside its 861 recalls
        (batch 30); GM's about 12 and 9.
      - What stays out: Jaguar Land Rover North America's 41 large recalls and 3 investigations,
        all filed after the sale; Volvo's from before 1999 and after 2010. Aston Martin has none at
        the floor.
      - Cases in `check:vehicle-recalls` on pinned rows: a Volvo Car USA recall of 2003 lands on Ford
        and one of 2016 does not; a Land Rover recall of 2004 lands on Ford and a Jaguar Land Rover
        North America one of 2015 does not; a 2004 Saab recall lands on GM; the same holds for an
        investigation of each. No key, licence, recurring cost or request — the makers join the same
        per-company query (`manufacturer IN (…)`); small.
      - *Derived from [`docs/proposals/2026-10-28-proposals.md`](proposals/2026-10-28-proposals.md)
        #5, approved 2026-10-29 with the call. Importance low-medium · Efficiency high ·
        Practicality medium-high (the call made 2026-10-29).*
      - ✅ **Done in batch 77** (see its section): Ford's page gains 56 recalls and 29
        investigations of Volvo, Jaguar and Land Rover from 1990 to 2010, GM's 12 and 9 of Saab from
        2000 to 2010, each day from Ford's and GM's own filings.
- [x] `P2` **The banks as the SEC names them: their securities units while they owned them, and
      three names in the release rules' own map.** The FDA, Federal Reserve and NHTSA maps count a
      unit the company owned while it owned it ("A unit the company sold stops counting the day it
      left", `lib/fedActions.ts:51`; `lib/fdaRecalls.ts:78`; `RecallMaker.to`). The SEC's and the
      Justice Department's rules know a company only by the names its own record carries, so
      "Units named otherwise ('J.P. Morgan Securities', 'Banc of America Securities') are not
      reached" (batch 73's note on the SEC press-release item above). JPMorgan's "J.P. Morgan" and
      UBS Group's missing "UBS" were raised in batch 73, and Credit Suisse's 7 releases on GLDI in
      batch 78; all three were left as owner calls.
      - ✅ **The owner's calls, 2026-11-01:**
        - (a) yes: "J.P. Morgan" and "JPMorgan" are JPMorgan Chase's names in the release rules'
          map;
        - (b) yes: a bare "UBS" is UBS Group's there. As proposed, (b) also reads "Credit Suisse"
          as UBS Group's from UBS's purchase of it; the call's words name only the bare "UBS";
        - (c) yes: Credit Suisse's releases come off GLDI, Credit Suisse AG's notes record. As
          proposed, the banks' releases stay off AMUB (UBS AG's) too, as batch 74 kept their Fed
          actions off both;
        - all three in the release rules' own map only, never in the names headlines are scored
          by. CLAUDE.md's one place for those stays `companyScoringAliases`; a name hand-added to
          `newsNamesFor` (`scripts/ingest.ts:448`) would reach news, scoring and the Justice
          Department search too. JPMorgan's scoring names already include "jpmorgan".
      - A dated map of the units the SEC charges by name, read only by the release rules (the SEC's
        press releases, the litigation releases and proceedings above, the Justice Department's
        releases), as `FED_BANKS` is the Fed adapter's own. Each day comes from the company's own
        filings, as batch 74 dated its banks' purchases:
        - Bank of America: Banc of America Securities, Investment Services and Capital Management,
          and Merrill Lynch from its purchase;
        - Wells Fargo: Wachovia from its purchase;
        - JPMorgan Chase: J.P. Morgan Securities, and Bear Stearns from its purchase;
        - Citigroup: Citigroup Global Markets, and Smith Barney until it went into the joint
          venture;
        - Morgan Stanley: Morgan Stanley Smith Barney from that venture's start;
        - Regions: Morgan Keegan while it owned it.
      - Measured 2026-11-01 on the 6,894 stored releases (`chronolens_b73`), replayed with
        `secReleaseNamesParty` unchanged, each company's names of today (and JPMorgan's former
        name), and the names below inside sizing windows; the real days come from the filings:

        | Bank | Names added | On its page today | Added | Of them before 2017 |
        |---|---|---:|---:|---:|
        | Bank of America | its three units; Merrill Lynch from 2009-01-01 | 8 | 20 | 12 |
        | JPMorgan Chase | J.P. Morgan Securities · call (a) | 2 | 3 · 8 | 2 · 4 |
        | Citigroup | Citigroup Global Markets; Smith Barney until 2009-06-01 | 10 | 3 | 2 |
        | Morgan Stanley | Morgan Stanley Smith Barney from 2009-06-01 | 14 | 3 | 0 |
        | Regions | Morgan Keegan, 2001-06-29 to 2012-04-02 | 0 | 3 | 3 |
        | Wells Fargo | Wachovia from 2008-12-31 | 9 | 1 | 1 |
        | UBS Group | call (b) | 0 | about 18, read by hand | about 14 |

        The units add 33 releases (20 before 2017), call (a) 8 more and call (b) about 18. With
        Deutsche Bank's 7 (the legal-form `P1` above), about 66 on 8 banks, beside the 201 on 122
        companies today. Among them: "Banc of America Capital Management, BACAP Distributors and
        Banc of America Securities to Pay $375 Million…" (2005-16); "Merrill Lynch to Pay $415
        Million for Misusing Customer Cash…" (2016-128); "Morgan Keegan to Pay $200 Million to
        Settle Fraud Charges Related to Subprime Mortgage-Backed Securities" (2011-132); "J.P.
        Morgan to Pay $153.6 Million to Settle SEC Charges of Misleading Investors in CDO…"
        (2011-131); "UBS Agrees to Pay $200 Million…" (2009-29).
      - What stays out under the rule unchanged: a unit before its purchase (Merrill Lynch's Enron
        charge of 2003 and its auction-rate settlement of 2008, Wachovia's of 2004 and 2008, Bear
        Stearns' of 2006); people ("SEC Charges Two J.P. Morgan Traders…", 2013-154; "Former
        Countrywide Executives", 2009-129). GLDI carries 7 Credit Suisse releases today, 2012-11-16
        to 2021-10-19 (the audit's list); off the notes record they sit on no page, since Credit
        Suisse Group is not in the index. Only a release after 2023-06-12 would be UBS's ("Credit
        Suisse Entities to Pay $10 Million…", 2023-12-13). Bare "UBS" today names UBS AG's notes
        record and is outranked there by UBS Group (`outrankingNameFor`), so neither page takes it;
        UBS AG stays out of UBS Group's history (`lib/predecessors.ts:20-21`).
      - The Justice Department, asked here: "Merrill Lynch" has 5 titles, one of them a party
        (Merrill Lynch Commodities, 2019-06-25); "J.P. Morgan" 4, none; "Banc of America" 1, none.
        Its gain is Deutsche Bank's.
      - Cases in `check:sec-press` on the stored rows: Banc of America Securities' charge of
        2010-12-07 (2010-239) lands on BAC; Merrill Lynch's 2016-128 lands on BAC, and its 2003-32
        does not; Morgan Keegan's 2011-132 lands on RF; "Two J.P. Morgan Traders" lands nowhere; by
        the calls, 2011-131 lands on JPM, 2009-29 on UBS, and nothing on GLDI. Then the whole stored
        listing replayed against the index with its count pinned, as the 2026-10-30 audit
        suggested (`docs/audits/2026-10-30-code-audit.md:211`), so the change shows its full effect.
        On main the unit cases fail. No key, licence or recurring cost: the releases are stored,
        and only the purchase days need EDGAR. About a dozen rows; a cloud session builds it.
      - *Derived from [`docs/proposals/2026-11-01-proposals.md`](proposals/2026-11-01-proposals.md)
        #4, approved 2026-11-01 with the three calls. Importance medium · Efficiency high ·
        Practicality medium (the three calls made 2026-11-01; the units needed none).*
      - ✅ **Done in batch 82** (see its section): the map is `lib/releaseNames.ts`, read by the
        SEC's and the Justice Department's release rules alone. Replayed on the 6,894 stored
        releases, 208 page entries become 252: Bank of America 8 → 28, UBS Group 0 → 11, JPMorgan
        1 → 11 (current names), Regions 0 → 3, and Credit Suisse's 7 leave GLDI. Two days differ
        from the proposal, each from the filings: the Smith Barney venture closed 2009-05-31, and
        Regions bought Morgan Keegan 2001-03-30.
- [x] `P2` **The Federal Reserve Board's own announcements about a bank: its approvals of banks'
      acquisitions since 2006.** A new source, approved by the owner 2026-11-01: the Board's
      press-release feed, `https://www.federalreserve.gov/json/ne-press.json`, on the host the
      enforcement files and FOMC statements are read from, and no key. Licence: "Unless otherwise
      indicated, information on Board's website is in the public domain and may be copied and
      distributed without permission. Please cite to the Board as the source of the information."
      (`federalreserve.gov/disclaimer.htm`, read 2026-10-26, quoted for the enforcement files at
      `lib/ingest/store.ts:318-320`; not re-read for this item). The feed announces by name each
      approval of a bank's acquisition, and no page reads it: on a bank's page a deal carries its
      8-Ks, not the approval that let it close.
      - ✅ **The owner's call, 2026-11-01: yes to the source.**
      - Measured 2026-11-01: the feed is 1.0 MB, 4,650 releases from 2006-01-10 to 2026-10-29,
        each with its day (most with a time), title, type and link. By type: Enforcement Actions
        1,335, Banking and Consumer Regulatory Policy 1,103, Monetary Policy 1,076, Other
        Announcements 672, Orders on Banking Applications 463.
        - Of the 463 orders, **157 name an index company as the applicant** by its exact everyday
          name, 83 of them before 2017, on 89 companies: "Approval of proposal by Wells Fargo &
          Company to acquire Wachovia Corporation" (2008-10-12); "…by Bank of America to acquire
          Merrill Lynch" (2008-11-26); "…by Mitsubishi UFJ Financial Group to acquire voting shares
          of Morgan Stanley" (2008-10-06). PNC has 7, Huntington 6, Bank of America 5, and TD,
          Capital One, Scotiabank, Old National and Ameris 4 each; the other 81, most of them
          regional banks, have one to three.
        - 34 policy releases name a large bank, 21 before 2017, counted by a list of names, not by
          a rule: the joint statement on Citigroup (2008-11-23); "Treasury, Federal Reserve, and
          the FDIC Provide Assistance to Bank of America" (2009-01-16); Goldman Sachs and Morgan
          Stanley's applications to become bank holding companies (2008-09-21); the capital plans,
          among them "…requiring Bank of America Corporation to resubmit its capital plan and to
          suspend planned increases in capital distributions" (2014-04-28).
        - Most releases carry their time ("10/29/2026 4:30:00 PM"), so batch 68's after-the-close
          mark applies, as it does for a filing; 468, all before 2017, give a day only
          ("1/2/2008").
      - Read the feed once a day, one file for every bank. On a bank's page, keep an "Orders on
        Banking Applications" release whose applicant is the bank, read from "by X" in the title
        and matched as the Federal Register company titles are (`lib/frCompany.ts`'s rules, the
        longer listed name owning the mention); and a policy release that names the bank as the
        one acted on (its capital plan objected to, its rescue), through the same party rule. The
        Fed map's rule holds: a bank's own history counts, an acquisition's past does not.
        Registered in `SOURCES`, credited, scored without the model.
      - Namesakes, so the 157 and the 34 are read by hand, as batch 73's 209 were: "Approval of
        proposal by Fortis" (2007-12-04) is the Belgian bank, not Fortis Inc. (FTS); a looser first
        match also took "Banco Popular Español" (2006-02-08) for Popular, Inc., and Michigan's
        "Citizens Banking Corporation" (2006) for Citizens, Inc.
      - **Open, raised before:** Popular, Inc. (BPOP) is missing from the Fed map (batch 74's
        "Found on the way"). Its order of 2010-04-30 ("…approves Banco Popular de Puerto Rico to
        acquire assets and assume liabilities of Westernbank Puerto Rico") is in the feed, beside
        its three actions in the enforcement files, and one row in `FED_BANKS` would serve both.
        The proposal carried it as a note in this item, and the call above is on the source.
      - A new check on rows pinned from the feed: Wells Fargo's approval of 2008-10-12 lands on WFC;
        Bank of America's of 2008-11-26 lands on BAC; MUFG's of 2008-10-06 lands on MUFG and Morgan
        Stanley; "Fortis" is refused for FTS, and "Banco Popular Español" for BPOP; the
        capital-plan release of 2014-04-28 lands on BAC; an approval released after the close
        carries its time, and a 2008 release with a day only carries none. On main it cannot run:
        the adapter does not exist. No key, licence fee or recurring cost — one request of about
        1 MB a day for every bank; a cloud session builds it (federalreserve.gov answers from the
        container, measured). Not measured: the Board's orders before 2006, on yearly pages.
      - *Derived from [`docs/proposals/2026-11-01-proposals.md`](proposals/2026-11-01-proposals.md)
        #5, approved 2026-11-01 with the new source. Importance medium · Efficiency high ·
        Practicality medium-high (the source approved; a hand read of 191 matches).*
      - ✅ **Done in batch 84** (see its section): source 29, `fed_press` (`lib/fedPress.ts`). Read
        against the index, the 2,219 releases of the three types read give 225 matches on 103
        companies, 126 before 2017, 181 of them orders, each read by hand. Beyond the proposal: an
        order filed under a bank batch 69's map gives the company counts ("Goldman Sachs Bank USA",
        BB&T's orders on Truist's page), and the licence was re-read on 2026-11-01. Popular's row in
        the Fed map is still the owner's, and orders filed under a bank whose name is not its
        holding company's are not given yet (about two dozen, listed in the section).
- [x] `P2` **The listed banks' and brokers' own units: their banks in the Board's orders, their
      broker-dealers and advisers in the SEC's cases.** Approved by the owner 2026-11-02.
      ✅ **Done in batch 88:** 34 companies' units in `BANK_UNITS`, 133 company events on the saved
      rows; Lazard Capital Markets and Fiserv Securities' 2005 case refused as the filings say (see
      batch 88's ledger section). Batch 84's
      open call and batch 74's Popular, Inc. row, now with the same firms' units in the case
      captions.
      - ✅ **The owner's calls, 2026-11-02:** (a) yes, widen the maps; (b) American Express
        Financial Advisors' cases before the 2005 spin-off go on **both** pages — American
        Express's, whose unit it was, and Ameriprise's, whose own record carries the name (AMP's
        EDGAR former names "AMERICAN EXPRESS FINANCIAL ADVISORS", 1995-10-25 to 2003-03-10, and
        "AMERICAN EXPRESS FINANCIAL CORP", to 2005-07-26); (c) Prudential Securities (2000–2003)
        goes on Prudential Financial (PRU), not Prudential plc (PUK).
      - **What:** rows in the release rules' map (`lib/releaseNames.ts`) and in `FED_BANKS` for the
        Board's orders, each unit counting while the company owned it, each day read from the
        company's filings, as batch 82 dated its banks:
        - the own banks of batch 84's list: Regions Bank, Frost Bank, Origin Bank, Centennial Bank,
          PlainsCapital Bank, Simmons Bank, Green Dot Bank, Five Star Bank, Equity Bank, Banco de
          Crédito del Perú, National Westminster Bank, ING Bank, Lloyds Bank Corporate Markets;
        - Popular's Banco Popular de Puerto Rico, Banco Popular North America and Popular
          Securities, and Popular in `FED_BANKS` (its three enforcement actions too);
        - the broker-dealers and advisers named after their parents: Ameriprise Financial Services,
          FTN Financial Securities, First Horizon Advisors, BB&T Securities, Hilltop Securities,
          Fifth Third Securities, BlackRock Advisors, NASDAQ Execution Services, Fiserv Securities,
          Lazard Capital Markets, Oppenheimer Asset Management, U.S. Bancorp Piper Jaffray until
          the spin-off, and the eleven others the proposal lists.
      - **Measured** by the scout on the saved case rows: 62 company days on 24 companies, 25 before
        2017, on no page today; with batch 84's ~25 orders and Popular's 3. About 35 map rows, ~70
        EDGAR requests once for the days.
      - **Refused, as the proposal found:** Reliance Financial Advisors (not RS), Southern Financial
        Services (not SO), Seaboard Investment Advisers, Meridian Securities, and U.S. Bancorp Piper
        Jaffray after the spin-off.
      - Cases in `check:sec-cases`: Regions Bank's case of 2009-09-21 on RF, Fifth Third
        Securities' of 2002-06-18 on FITB, U.S. Bancorp Piper Jaffray's of 2002-11-05 on USB and
        its 2005-09-02 not, Ameriprise Financial Services' of 2009-07-10 on AMP, Hilltop
        Securities' of 2016-02-02 on HTH, Nasdaq's of 2013-05-29 on NDAQ, American Express Financial
        Advisors' of 2004-02-12 on AXP and AMP, Prudential Securities on PRU and not PUK, Reliance
        Financial Advisors on no page; the full replay re-pinned. In `check:fed-press`: Frost
        Bank's approval of 2019-06-20 on CFR, Popular's of 2010-04-30 on BPOP. On main the unit
        cases fail.
      - *Derived from [`docs/proposals/2026-11-02-proposals.md`](proposals/2026-11-02-proposals.md)
        #4, approved 2026-11-02 with the three calls. Importance medium · Efficiency high ·
        Practicality medium (a day per row from filings).*
- [x] `P2` **The Consumer Financial Protection Bureau's enforcement actions, from 2012.** A new
      source, approved by the owner 2026-11-02: the Bureau's action list
      (`www.consumerfinance.gov/enforcement/actions/?page=N`, 25 a page, read once) and its feed
      (`/enforcement/actions/feed/`, the newest 25, once a day), one read for every company. Licence:
      "Information created by the CFPB is in the public domain and you may reproduce, publish, or
      otherwise use it without the Bureau's permission. Please consider appropriate citation to the
      Bureau as the source." (consumerfinance.gov/privacy/website-privacy-policy/, "Legal
      notices", read 2026-11-02). No key.
      - ✅ **The owner's call, 2026-11-02: yes to the source.**
      - Keep an action on a company's page when its title, which names the respondents, names the
        company or a unit the map gives it, by the caption rule (`captionParty`); one event a
        company a day. Registered in `SOURCES`, credited, scored without the model.
      - **Measured** by the scout: 2012–2016 holds 164 actions, read by hand as 34 company days on
        27 listed companies (Capital One Bank 2012, American Express's banks 2012 and 2013,
        JPMorgan Chase Bank 2013, Bank of America and FIA Card Services 2014, Citibank 2015, the
        four mortgage insurers of 2013-04-04, Wells Fargo Bank 2016…). About 14 match by names the
        rules already hold; about 20 need the units above, so it builds after them. The 222
        actions of 2017–2026 were not read.
      - **Not their own:** Discover Bank, Sprint, Hudson City Savings Bank and Flagstar Bank (2014,
        before today's FLG took the name), each an acquisition's past; GE Capital Retail Bank and
        Synchrony Bank before SYF's listing of 2014-07-31, and PayPal's of 2015-05-19 before its
        spin-off, are left to the first price.
      - A new check on the saved list pages: Wells Fargo Bank's action of 2016-09-08 on WFC,
        Citibank's of 2015-07-21 on C, Capital One Bank's of 2012-07-18 on COF, Discover Bank's on
        no page, Flagstar Bank's of 2014 not on FLG, Synchrony Bank's of 2014-06-19 refused by SYF's
        first price, a day's three American Express actions one event. On main it cannot run: the
        adapter does not exist.
      - ✅ **Done in batch 89:** `lib/cfpb.ts`, `lib/ingest/cfpbWalk.ts` and `db/035`, registered as
        source 30, credited, scored without the model; 22 more companies' units and ten more
        names for six mapped banks. The 386 actions give 87 company days on 46 companies, 35
        before 2017; batch 90 brought them to 92 on 50, 87 of which reach a page. The daily read is the list's first page, not the feed, which dates an item by its
        last edit. `check:cfpb` (45) holds every case above.
      - *Derived from [`docs/proposals/2026-11-02-proposals.md`](proposals/2026-11-02-proposals.md)
        #5, approved 2026-11-02 with the new source. Importance medium-low · Efficiency high ·
        Practicality medium (the units above first).*
- [x] `P1` **The EPA's civil enforcement cases, from the 1970s.** A new source, approved by the owner
      2026-11-05 ("Lets move forward with all of the proposals."): EPA's case file
      (`echo.epa.gov/files/echodownloads/case_downloads.zip`, 82 MB, 137,108 cases), read once a
      month. A case is kept on a company's page when a defendant is the company by the caption rule,
      from its first price, dated by its lodging or final order, titled with what EPA did and the
      penalty, and linked to its ECHO case report.
      - **The owner's rule of the same day applies:** a case naming several listed companies goes on
        each of their pages. The proposal's "three defendants or fewer" own-row limit gives way:
        every listed defendant gets the case. Orders without a penalty are grouped a row a month,
        as routine Federal Register notices are.
      - **Licence, for the build to quote:** EPA's Standard Open Data License ("all data produced by
        the U.S EPA is by default in the public domain") and the disclaimers page's note on
        documents, both quoted in the proposal. The owner approved with both in front of them. The
        build stores the file's fields and links to EPA's page; it copies no document.
      - **Measured** by the scout: 6,406 cases on 663 companies under present names, 5,505 before
        2017. Of 40 read by hand, 31 were right; the first-price floor drops six of the nine wrong
        ones, and two guards drop the rest: "Power and Light Company" is one name, and a trailing
        given name ("Retherford, Dana") is a person.
      - ✅ **Done in batch 95:** 137,103 cases read from the file; against every company in the
        index, 6,001 rows on 665 companies before first prices, 5,169 before 2017.
      - *Derived from [`docs/proposals/2026-11-05-proposals.md`](proposals/2026-11-05-proposals.md)
        #1, approved 2026-11-05.*
- [x] `P1` **The Justice Department's releases of 2001–2008, from its archive.** The same source
      (`doj_press`), approved by the owner 2026-11-05. Read each month page of 2001–2008 once (the
      archive is closed), store its rows, and match them at each company's ingest through
      `releaseNamesParty`, from the company's first price, with its names that year and the release
      map. ✅ **Done in batch 94:** 5,712 releases from the 96 months; against every company in the
      index, 106 reach 71 pages.
      - *Derived from [`docs/proposals/2026-11-02-proposals.md`](proposals/2026-11-02-proposals.md)
        #2, approved 2026-11-05.*
- [x] `P2` **CPSC product recalls, 1973 on.** A new source, approved by the owner 2026-11-05 ("Yes I
      would like to add product safety recalls."): saferproducts.gov's keyless recall service, one
      answer of every recall, kept where a listed company is the maker, the importer or the
      retailer the recall names, under the owner's rule of the same day (every listed company a
      recall names gets it). ✅ **Done in batch 96:** 10,070 recalls; against every company in the
      index, 2,331 rows on 218 companies before first prices, 713 as maker, importer or
      distributor.
      - *Derived from [`docs/proposals/2026-10-22-news-sources.md`](proposals/2026-10-22-news-sources.md)
        #4, approved 2026-11-05.*
- [x] `P2` **The CFTC's enforcement actions, from 1995.** ✅ **Done in batch 97:** 2,607 actions; 83
      company days on 33 companies before first prices. A new source, approved by the owner
      2026-11-05: the Commission's enforcement-action list, its site in the public domain by its web
      policy, kept where a release makes a listed company the party, by the release rules and the
      unit map, on every listed party's page.
      - *Derived from [`docs/proposals/2026-11-05-proposals.md`](proposals/2026-11-05-proposals.md)
        #2, approved 2026-11-05.*
- [x] `P2` **The Board's enforcement actions against the 23 listed banks its map leaves out.** The
      same source (`fed_enforcement`), approved by the owner 2026-11-05: rows added to `FED_BANKS`
      for the 29 own days the scout read city by city. ✅ **Done in batch 98:** 39 events on the 23,
      read city by city with their banks named after them.
      - *Derived from [`docs/proposals/2026-11-05-proposals.md`](proposals/2026-11-05-proposals.md)
        #3, approved 2026-11-05.*
- [x] `P2` **The Board's orders of 1996–2005, from its yearly pages.** The same source
      (`fed_press`), approved by the owner 2026-11-05: the ten yearly pages read once, the orders
      matched through `orderParties`, which also reads the older titles' "of". ✅ **Done in batch
      99:** 469 orders committed with each page's sentence naming every party; 141 matches on 59
      companies under the committed names, five namesakes kept off by city.
      - *Derived from [`docs/proposals/2026-11-02-proposals.md`](proposals/2026-11-02-proposals.md)
        #3, approved 2026-11-05.*
- [x] `P2` **A case naming several companies goes on every relevant company's page** — the owner's
      rule, 2026-11-05: "for any instance that multiple companies are involved in a case add the
      story to all relevant companies pages". The rules already give each named listed company its
      own event. The rule settles the three ownership calls left open:
      - GE Capital Retail Bank's CFPB actions (2013, 2014) on GE, its owner then;
      - PayPal's CFPB action of 2015-05-19 on eBay, its owner until the spin-off;
      - JCI's case of 2016 on Tyco's record, on Johnson Controls' page.
      - ✅ **Done in batch 93:** GE's bank to 2015-11-16 and eBay's PayPal from 2002-10-03 to
        2015-07-16 in `BANK_UNITS`; Synchrony's and PayPal Holdings' own units marked to count
        before listing; JCI's case pinned. The Bureau's 386 actions now give 95 days on 52
        companies, 92 of them on a page.
- [x] `P1` **EPA's cases against the companies' own operating units.** No new source: approved by the
      owner 2026-11-06 ("Approve all three, Shell from 2005-07-20"). EPA files a company's cases
      under its subsidiaries' names (Chevron U.S.A., Shell Oil Company, Union Pacific Railroad),
      which the caption rule rightly refuses. Extend batch 101's `UNITS` with each owner's units and
      the days it held them, read from the filings; a branded station is not the brand's unit, and
      joint ventures are no one's. **The owner's call:** Shell's units count from 2005-07-20, when
      Royal Dutch Shell plc became the group's single parent.
      - **Measured** by the scout on the saved case file: 1,607 rows added on 33 companies; Chevron
        20→258, BP 4→238, Shell 15→208 from its first price (22 court-or-penalty days from
        2005-07-20).
      - ✅ **Done in batch 104** (see its section): 52 unit entries on 34 companies, each day read
        from EDGAR filing lists; 1,442 rows added before first prices, 40 of 40 sampled cases right, no
        case of the earlier 5,994 rows lost.
      - *Derived from [`docs/proposals/2026-11-06-proposals.md`](proposals/2026-11-06-proposals.md)
        #2, approved 2026-11-06.*
- [x] `P1` **The FDA's new-drug approvals since 1985, on the page of the company that applied.** A
      new source, approved by the owner 2026-11-06: the FDA's compilation of new-drug approvals
      (`www.fda.gov/media/177921/download`, one Excel file, 1,387 approvals from 1985), whose
      applicant is the one the approval letter names (Lipitor is Parke-Davis's, Humira Abbott's).
      Read once a year into a committed file, as the Board's 1996–2005 orders are; an approval is
      kept on a company's page when its applicant is the company by the caption rule or one of
      `FDA_FIRMS`' hand-checked firms on its days, from its first price.
      - **Licence, for the build to quote:** the FDA's website policies put its content in the
        public domain (quoted in the proposal). No key, no recurring cost.
      - **Measured** by the scout: 461 approvals on 82 companies from first prices, 279 before 2017.
        Before building: give the recall map's units their start days (Alcon on Novartis, Genzyme on
        Sanofi) and keep the joint ventures (DuPont Merck, Astra Merck) off Merck; add the older
        names by hand (Zeneca, Ortho, Tibotec, "Lilly", Squibb), about 57 more (an estimate).
      - ✅ **Done in batch 105** (see its section): the 1,387 approvals committed and read by the
        repository's own workbook reader; from the 26 drugmakers' first prices, 435 approvals, 302
        before 2017, 66 before EDGAR; every row of the eleven largest pages read by hand.
      - *Derived from [`docs/proposals/2026-11-06-proposals.md`](proposals/2026-11-06-proposals.md)
        #1, approved 2026-11-06.*
- [x] `P2` **A case's other listed companies, linked from its row** ("Also on Ford, General Motors
      and 25 more"). Approved by the owner 2026-11-06. No new data: one read beside `loadEvents`
      for the other held pages holding the same source's same case, and one line in `EventList`.
      - **Measured** by the scout: 543 EPA cases are on two or more companies' pages; 2,659 of
        5,996 rows (44%) hold a case another page also holds. The counts are a ceiling: only held
        pages can be named.
      - ✅ **Done in batch 106** (see its section): all eight multi-party sources, a release held
        once on several pages included; run against a real database; on batch 104's replay, 672
        EPA cases on two or more pages, 3,366 of 7,436 rows.
      - *Derived from [`docs/proposals/2026-11-06-proposals.md`](proposals/2026-11-06-proposals.md)
        #3, approved 2026-11-06.*
- [x] `P1` **EPA's own figures on the case rows pages already hold.** No new source: approved by the
      owner 2026-11-07 ("Approve all three, titles from the FDA's data"). Read the settlements table
      (`CASE_ENFORCEMENT_CONCLUSIONS.csv`) and the case table's work-ordered and summary columns of the
      zip the monthly walk already reads. A case of one settlement and no case total takes the
      settlement's penalty; the row names the work ordered, "among N parties" on a case of several;
      EPA's summary, when it says something, is the row's description. Money stays numeric.
      - **Measured** by the scout on the replay: 1,079 rows gain a penalty, 755 before 2017; 2,523
        rows the work ordered; 4,203 of 4,630 page cases have a summary.
      - ✅ **Done in batch 113** (see its section): 1,250 more rows give a penalty (890 before
        2017), 2,805 name the work ordered and 6,417 carry EPA's summary; every moved row keeps its
        stored identity; and a NUL in EPA's text, which made every month's read fail on a real
        database, is dropped.
      - *Derived from [`docs/proposals/2026-11-07-proposals.md`](proposals/2026-11-07-proposals.md)
        #1, approved 2026-11-07.*
- [x] `P2` **EPA's cases against the utilities' operating companies.** No new source: approved by
      the owner 2026-11-07. About 60 more `UNITS` patterns on 31 utility holding companies (Georgia
      Power on Southern, Ohio Edison on FirstEnergy, PSE&G on PSEG), each ownership day read from an
      EDGAR filing at build time, as batch 104's were, and a guard for "Mississippi Power & Light"
      (Entergy's, not Southern's).
      - **Measured** by the scout: 442 cases, 213 a court case or a penalty, 186 of those before
        2017; 13 pages gain their first EPA rows (PSEG 0→44, Exelon 0→22).
      - ✅ **Done in batch 114** (see its section): 140 unit entries on 33 companies, each day read
        from 63 data.sec.gov filing lists and pages; 419 more rows on 31 companies, 261 a court case
        or a penalty; 13 companies gain their first EPA rows; every caught name read by hand.
      - *Derived from [`docs/proposals/2026-11-07-proposals.md`](proposals/2026-11-07-proposals.md)
        #3, approved 2026-11-07.*
- [x] `P2` **New indications and other efficacy supplements, for drugs whose holder never
      changed.** A new dataset, approved by the owner 2026-11-07: Drugs@FDA through openFDA (CC0, no
      key), kept only where today's sponsor is the applicant batch 105's compilation names, so a
      supplement is never an acquirer's. **The owner's call:** titles from the data alone; no
      approval letter is read.
      - **Measured** by the scout through batch 105's rule from first prices: 973 supplements on 27
        pages, 352 before 2017; no false match in 25 sampled rows and all 58 page–sponsor pairs.
      - ✅ **Done in batch 115** (see its section): a new source, `fda_supplements` (id 36), and a
        committed file of 3,132 supplements; 1,191 on 48 pages from first prices, 420 before 2017;
        all 135 page, applicant and sponsor pairs read by hand. Old Biogen's two approvals of before
        2003 come off Biogen's page.
      - *Derived from [`docs/proposals/2026-11-07-proposals.md`](proposals/2026-11-07-proposals.md)
        #2, approved 2026-11-07.*
- [x] `P2` **A record that took a bought company's name: one rule for every source.** A company's
      present EDGAR name is read in every year, so where its record took the name of a company it
      bought, that company's past reaches the page. Batches 108, 115 and 116 fixed three such names
      one source at a time (old Waste Management on WM, old Biogen on BIIB, AT&T Corp. on T).
      - ✅ **Done in batch 117** (see its section): one table, `TAKEN_NAMES` in lib/takenNames.ts, of
        28 records, each day read from a filing. Every caption rule reads it, ingest drops such rows
        from every source found by name, a page and its "Also on" leave stored ones off, and the
        Federal Register asks the years before under the record's own name of then. The three
        one-source entries are gone into it. check:taken-names holds it to a committed scan of 173
        renamed records, each read.
      - *Raised by batch 116; the 2026-11-07 audit of batches 108–115 proposed it.*
- [x] `P3` **What batch 117's scan of renamed records left open.** Three readings needed more than
      the table: three namesakes not yet dated (LTBR, VAI, MRDN), three tickers whose history looked
      like another record's (SSYS, WCN, DWSN), and GDELT's months before a taken name's day, asked
      under the present name.
      - ✅ **Done in batch 118** (see its section): the three namesakes are dated from their filings,
        and so is Dawson, whose chart turned out to be TGC's, so its old record's past is a taken
        name's. Stratasys's and Waste Connections's histories are mapped to the old records, as
        Merck's is, with Objet's and Progressive Waste's own past labelled. GDELT's months before the
        day are asked under the record's own name of then. Linde plc and Six Flags, which had no
        name of their own before, keep the present one.
      - *Raised by batch 117.*
- [x] `P1` **EPA's cases under 28 more companies' own operating units.** No new source: approved by
      the owner 2026-11-08 ("All three"), with both calls inside it as drafted: Pharmacia LLC on
      Pfizer's page from 2003, MidAmerican Energy Berkshire's from 2006-02-09. Three parts: (a) the
      units in `UNITS` (BNSF on Berkshire, Pratt & Whitney on RTX, AlliedSignal's on Honeywell), each
      day read from a filing; (b) a name's "&" read as "and" too, with the taken-names table reading
      "AT AND T"; (c) the same units' names in the release map, for the Justice Department's rule.
      - **Measured** by the scout: 847 cases, 481 a court case or a penalty, 350 of those before 2017;
        (b) 112 cases; (c) 12 releases of 2001–2008 on 8 pages.
      - ✅ **Parts (a) and (b) done in batch 120** (see its section): 112 unit entries on 30
        companies, every day read from a filing; 906 cases and 818 rows more on 41 pages from first
        prices, none fewer, 471 of the cases a court case or a penalty, 345 before 2017; nine pages
        gain their first EPA rows.
      - ✅ **Part (c) done in batch 121** (see its section): 288 unit names on 74 companies in the
        release map, each on its EPA days; 54 more Justice Department releases on 23 pages from first
        prices, 14 from the 2001–2008 archive and 40 from the API's years. The API's own filter, found
        broken on the way, is fixed: it reads `title`, not `parameters[title]`.
      - *Derived from [`docs/proposals/2026-11-08-proposals.md`](proposals/2026-11-08-proposals.md)
        #1, approved 2026-11-08.*
- [x] `P2` **EPA's own days on the cases pages already hold.** No new source: approved by the owner
      2026-11-08. Two tables of the zip the monthly walk already reads: (a) the day the suit was
      filed, a row of its own beside the decree's; (b) each settlement of a case whose defendants are
      all the company's, on its own day. It fixes the rows dated by a later amendment with no penalty
      (Wisconsin Electric's 05-2003-0333).
      - **Measured** by the scout: (a) 178 cases on 85 pages, 128 before 2001; (b) 26 cases, 46
        settlements.
      - **Done in batch 122:** (a) 228 rows on 106 pages, 254 cases, 162 filed before 2001; (b) 39
        settlement rows more on 24 pages, 7 rows that now give a penalty; every row before kept under
        its key. A unit's settlements before its sale stay its seller's (Murphy Oil USA's 2010 and
        2012 on Murphy Oil). db/044 needs `npm run db:migrate`.
      - *Derived from [`docs/proposals/2026-11-08-proposals.md`](proposals/2026-11-08-proposals.md)
        #2, approved 2026-11-08.*
- [x] `P2` **NHTSA recalls under makers listed companies own that the map lacks.** No new source:
      approved by the owner 2026-11-08. About 20 more makers in `RECALL_MAKERS` (lib/recalls.ts),
      each day read from a filing: Graco's child seats on Newell, Dana, Lippert on LCI, Hino on Toyota,
      Kelly-Springfield on Goodyear.
      - **Measured** by the scout: 84 recalls on 20 pages, 57 before 2017; six days were estimates.
      - **Done in batch 123 for 16 makers:** 69 recalls on 16 pages, 45 before 2017, and 24
        investigations. The six whose days need a filing's text (Hino, Kelly-Springfield, Buell,
        Fisher-Price, two Thor companies) are an open item in the batch 123 ledger, waiting on
        `NEWS_CHARTS_CONTACT`.
      - *Derived from [`docs/proposals/2026-11-08-proposals.md`](proposals/2026-11-08-proposals.md)
        #3, approved 2026-11-08.*

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
