# News Charts — Master Checklist

The governing checklist for the **News Charts** project: a single place to track initiatives,
priorities, and progress. Add to it, check things off, re-prioritise. This is a living doc.

**Last updated:** 2026-07-28

## Scope & independence

- **This checklist governs News Charts only.** Crypto-Stuff / CAEP is a **separate project with
  its own master checklist**; the two are developed **independently** — no shared code, no
  runtime coupling. Any future cross-project connection would be a separate, explicit decision,
  not something assumed or tracked here.
- **Related News Charts docs:** `README.md` (feature notes), `docs/EVENTS-SCHEMA.md` (the events
  schema spec). This checklist tracks *work*; those describe *what exists*.

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

**Where News Charts stands.** The data layer is real — 7 SQL migrations (`db/001`–`007`) plus a
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

**Do not release until every data feed has been checked on two axes — does it work, and are we
allowed to use it commercially.** The source registry (`lib/ingest/store.ts` `SOURCES`) carries a
`commercialOk` flag + license note per source and is the single place to verify against.

### Licensing / keys (monetization turns several free tiers non-compliant)

- [ ] **Newsdata.io** — free tier is personal/testing. Upgrade to a paid plan (explicitly allows
      commercial use); swap key in `.env.local`. No code change.
- [ ] **GNews** — free tier is non-commercial. Upgrade to a paid tier; swap key. No code change.
- [ ] **Currents API** — free developer tier is non-commercial. Upgrade or drop the key at launch.
- [ ] **Marketaux** — free tier is non-commercial. Upgrade or drop the key at launch.
- [ ] **EODHD** — free tier is personal/evaluation. Upgrade or drop the key at launch.
- [ ] **Finnhub** — free tier is personal/non-commercial. Upgrade or drop the key at launch.
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
      - `scripts/check-feeds.ts` now reports *why* a feed sat out ("blocked by COMMERCIAL_MODE"
        vs "no KEY set") instead of showing an indistinguishable empty result.
      - ⚠ The flag enforces the `commercialOk` flags; it does not judge them. Yahoo Finance RSS
        is flagged `true` today (the "gray zone" item above), so it keeps fetching — settle that
        call rather than assuming the flag covers it.
- [ ] `P0` **Turn `COMMERCIAL_MODE=true` on in production the same day anything earns money.**
      The flag is built and tested but is **off by default**, which is right for development and
      wrong the moment an ad renders. Pair it with the affiliate item further down — that item's
      "recognise what this triggers" note is this switch.
- [ ] Get a real legal review of the above before revenue flows — the flags encode a practical
      reading of published terms, not legal advice.

### Feed health (each source, against production keys)

- [ ] Every adapter returns real data for a fresh company AND a fresh topic (not silently `[]`):
      GDELT, Yahoo RSS, NYT, Guardian, Newsdata, GNews, Currents, Marketaux, EODHD, Finnhub,
      Wikipedia (prose + citations), LoC press (topics AND company pre-IPO),
      SEC filings, Federal Register, prices.
- [ ] Keys valid under production quotas (Newsdata 200/day, GNews 100/day, NYT/Guardian limits)
      with the 6h/1h cache windows doing the rate-limiting.
- [ ] Dedup sanity: the same story from two repositories collapses to one event (URL dedup).
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
- [ ] `P1` **Confirmation lag / finality policy:** how many blocks (or "finalized" tag) before an
      event is ingestable, to avoid reorg orphans. **Still open, and deliberately not needed
      yet:** every Phase 0 event is years finalized (the most recent is the April 2024 halving),
      which is exactly why the phase was scoped this way. The policy must land *before* Phase 1's
      live stablecoin feed, not after — an orphaned event that a synthesis already cites cannot
      be deleted (`ON DELETE RESTRICT`).
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

- [ ] `P1` Generalise Phase-0 fetchers into a reusable module (`lib/onchain/*`) matching the
      `FetchResult` / `TimelineEvent` contract.
- [ ] `P1` Extend stablecoin coverage: USDT, DAI, PYUSD mints/burns.
- [ ] `P1` **Reorg safety:** ingest only finalized blocks (confirmation lag) so no published
      event can be orphaned (respects `ON DELETE RESTRICT` on citations).
- [ ] `P1` **Address labeling** map for issuers/treasuries/bridges (Circle, Tether, exchange hot
      wallets) — provenance-tracked.
- [ ] `P1` Deterministic relevance floor: enrich only material events; leave ambiguous ones
      `NULL` for the AI tier (same pattern as Federal Register events).
- [ ] `P2` Backfill throughput: paginated `eth_getLogs` with back-off; document each source's
      reach (genesis) and rate limits.

### Phase 2 — Governance & protocol events · `P1`/`P2`

- [ ] `P1` **Snapshot GraphQL** adapter (keyless): passed governance proposals for Uniswap, Aave,
      Compound, Maker → protocol subjects.
- [ ] `P1` **Exploits/hacks** curated feed (correlate with price drops) — the highest-signal
      timeline events; confirm each on-chain before ingest.
- [ ] `P2` **Tally / on-chain governance** for executed proposals (parameter changes).
- [ ] `P2` **DefiLlama** protocol launches / TVL inflection events.
- [ ] `P2` **Industry/sector grouping** for crypto (mirror the SIC industry graph): "stablecoins",
      "L2s" as industry subjects with merged timelines.

### Cross-cutting for this initiative

- [ ] `P0` **Licensing gate:** keep all sources `commercialOk: true` — raw chain facts + public
      explorers only. **No Dune/Nansen aggregations in the ad-supported path** (TOS), same
      discipline as the Google-News-RSS bar.
- [ ] `P1` **Cost monitoring:** log per-source fetch counts; confirm free-tier limits (Etherscan
      5/s, 100k/day) aren't exceeded by scheduled ingest.
- [ ] `P1` **AI-cost discipline:** on-chain is high-volume — filter before enrichment; rely on
      content-hash keying so unchanged events are never re-paid for.
- [ ] `P2` **Attribution UI:** render chain/explorer attribution on event cards + footer.

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
- [ ] `P1` **Internet Archive adapter** (advancedsearch + Wayback CDX) — keyless archive search.
      **The biggest unbuilt lever left in this initiative**, and immune to key expiry or a
      licensing change, which none of the eight keyed feeds are. (The hardening list below
      carried a duplicate of this item; it now points here.)
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
- [ ] `P1` **BYO-key plumbing** for the keyed sources (NYT, Guardian, discovery engine) — mirror
      the AI-model-key pattern; keys never touch the shared server state. **Still open, and the
      shipped NYT/Guardian adapters do not do this**: they read a *server* env key, so the
      operator pays the quota and wears the licence. Moving them browser-side would make each
      visitor's own key the licensee — which is a materially different answer to the
      non-commercial-tier problem in the feed gate, and worth weighing against buying licences.
- [x] ~~`P1` **Dedup basis = article URL**~~ — shipped in PR #9: `dedupByUrl` in
      `lib/newsExtra.ts` merges every repository's results, so one wire story surfaced by three
      outlets collapses to one event. (Cross-*feed* near-duplicate collapsing by headline+day is
      a separate, still-open item in the hardening list below.)
- [ ] `P2` **Coverage-map doc** kept current as sources are added, so "how far back can this go"
      is answerable per subject.

## Initiative: Hardening & follow-ups from the feed/UX build-out (2026-07 session)

Consequences of what shipped on PR #9 (citation mining, NL prompts, pre-IPO story, crosshair
popup, filing stacks, collapsible list, 8 new news repositories), ranked by value-per-effort.

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
- [ ] `P1` **Internet Archive adapter (keyless).** → **duplicate**; tracked in the Historical
      article resurfacing backlog above. Left as a pointer so it isn't picked up twice.
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
- [ ] `P2` **Virtualize very large event lists** — the one claim with substance: no windowing
      exists, so a 500+-event timeline renders every row. Current mitigations (160-citation
      cap, filing stacks, collapsible sections, stacking) keep it acceptable; add
      virtualization (or render-on-expand) if profiling shows scroll jank on big subjects.

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
- [ ] `P2` **Sentiment coloring on event nodes.** Do it keyless first: a lexicon-based
      positive/negative/neutral score at ingest (title keywords), color-coding timeline dots so
      perceived sentiment can be read against the actual price move. BYO-model rescoring can
      refine later; no server-side LLM cost.
- [ ] `P2` **AI primary-event summary nodes.** Overlaps the planned cross-feed near-duplicate
      collapsing (hardening list) — do the heuristic clustering there first; the DB's existing
      syntheses layer (synthesis + synthesis_citations tables) is the natural home for an
      AI-written summary node over a cluster. Sequence: cluster → then summarize.
- [ ] `P2` **Macro-event overlay (Fed decisions, CPI prints).** Architecture already supports
      it: sector events merge into company timelines via subject membership — a curated "macro"
      subject whose events overlay any company page is the same pattern. FOMC/CPI calendars are
      public and keyless. Toggle off by default.
- [ ] `P2` **Compare: both subjects' events** — partly built already: /compare renders a
      shared-axis event strip and combined timeline for both subjects. The remaining gap is
      per-side event markers on the price overlay itself, and industry-news intersection
      (BABA vs JD under one regulatory headline) via the existing sector-event machinery.
- [ ] `P2` **Private annotations on the timeline.** Fits the localStorage-first pattern
      perfectly (like follows/prefs — no accounts, no server state): pin notes / thesis markers
      / entry-exit points to dates, rendered as a distinct marker type. The trading-journal
      angle with zero infra.
- [ ] `P3` **Saved-focus alerts (email/push on new matches).** Real retention value but the
      only idea needing infrastructure that doesn't exist: accounts, background jobs, an email
      provider. The no-server cousin is already live (Follow + "new since last visit"); an
      intermediate step is highlighting saved-focus matches on return, still keyless. Defer
      until there are users to retain.

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
      pages (a period-history reader is a plausible book buyer); `CaepPromo` already does
      cross-promotion to CAEP, so the slot pattern exists.
- [ ] `P2` **Never paywall-launder.** Linking a reader to a paywalled cited article is fine and
      honest; taking a commission for it must not change which citations get mined or shown.
- [ ] `P3` Measure click-through per surface before expanding, without shipping
      user-identifying analytics.

## Owner backlog (2026-07-26 brain dump)

News Charts-side items only. CAEP items went to that project's `docs/ROADMAP.md`; company-level
items (entity filing, federal regulation research, disclosure documents, "what does sellable
look like") went to a **separate business checklist** worked independently of both products —
`docs/BUSINESS-CHECKLIST.md` in the Crypto-Stuff repo.

- [ ] `P1` **Search-prompt coverage beyond the shapes it was built for.** Reported 2026-07-28:
      *"Barak Obamas effect on Ford stock"* returned junk twice. The parser only understood
      *"the history of X in Y"*; anything else went to `resolveCompany` verbatim, missed, and was
      handed to Wikipedia, which fuzzy-matched something unrelated — a confidently wrong page
      rather than an error. **Fixed** (`npm run check:prompt`, 24 cases, was 10/24):
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
      - ⚠ **Still open, and this is the item below:** the honest answer to that question is a
        *two-subject compose* — Obama's events over Ford's price. Today it lands on Ford's
        timeline with "Barak Obamas" pre-filled in the AI panel, which is useful and truthful,
        but it is not yet the overlay the question actually asks for.
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
- [x] **Rename the software to News Charts.** Done 2026-07-28 (PR #11, merged) — settled the
      *name* half of the site-name/domain question below, pre-launch, i.e. at its cheapest.
      Display name, header/OG wordmarks, SEO metadata and docs say **News Charts**; the
      `news-charts` slug covers the npm package, the localStorage/event namespace, backup
      filenames and log tags; docs and `.env.example` use a `news_charts` Postgres
      role/database. An inline pre-hydration script in `app/layout.tsx` migrates visitors' old
      `chronolens:*` localStorage keys, so follows, prefs and AI settings survive. The GitHub
      repo is renamed to `News-Charts` (old URLs redirect). Loose ends:
      - [ ] `P2` Rename the live Postgres role/database from `chronolens` to `news_charts` —
            or keep the old names in `.env.local`; only the docs assume `news_charts`.
      - [ ] `P2` Old `chronolens-*.dump` backups no longer match the retention regex in
            `scripts/backup.ts`, so they are never auto-pruned — delete them by hand once
            enough `news-charts-*` dumps have accumulated.
- [ ] `P2` **Domain for the site.** The name is now settled (News Charts, above), which points
      at **Newscharts.ai** from the original candidate list (Timelines.ai · Timecharts.ai ·
      Thetimeline.ai · Timeline.ai were the alternatives). ⚠ Still to do: check domain
      availability and trademark conflicts, then set `SITE_URL` — canonical URLs, the sitemap,
      OG images and JSON-LD all carry it, and redirects would be needed to keep any indexed
      pages. Cheapest before launch, expensive after.
- [ ] `P1` **Label every source on screen, and the compliance around it.** News Charts' half of
      the source-labeling policy in the business checklist (`docs/BUSINESS-CHECKLIST.md`,
      Crypto-Stuff repo). Concretely: every event already carries a `source` label and an
      outward link, but with eleven feeds the labels are inconsistent — GDELT reports bare
      domains (`chinatechnews.com`), NYT/Guardian report publication names, aggregators report
      whichever outlet they found, and Wikipedia prose reports the article. Decide the house
      form, then render licence-required attribution properly (Wikipedia is CC BY-SA and must
      credit contributors + licence; LoC, GDELT and SEC each differ). Mark *derived* values as
      ours, never as a publisher's. Pairs with the feed-visibility panel above — the same panel
      can carry the attribution block.
- [ ] `P2` **Research more news repositories.** Feeds the article-resurfacing initiative; the
      keyless Internet Archive adapter
      is still the top unbuilt candidate.

## Other initiatives

_Add new News Charts initiatives here as they come up — this doc is meant to govern the whole
project, not just the on-chain work._
