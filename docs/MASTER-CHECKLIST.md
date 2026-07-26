# Chronolens — Master Checklist

The governing checklist for the **Chronolens** project: a single place to track initiatives,
priorities, and progress. Add to it, check things off, re-prioritise. This is a living doc.

**Last updated:** 2026-07-25

## Scope & independence

- **This checklist governs Chronolens only.** Crypto-Stuff / CAEP is a **separate project with
  its own master checklist**; the two are developed **independently** — no shared code, no
  runtime coupling. Any future cross-project connection would be a separate, explicit decision,
  not something assumed or tracked here.
- **Related Chronolens docs:** `README.md` (feature notes), `docs/EVENTS-SCHEMA.md` (the events
  schema spec). This checklist tracks *work*; those describe *what exists*.

## Legend

- **Priority:** `P0` = do first / unblocks others · `P1` = core value · `P2` = later / nice-to-have
- Each backlog item is rated on three lenses: **Importance** (impact / business value),
  **Efficiency** (ROI — value ÷ effort), **Practicality** (readiness — dependencies, risk, is it
  already built). Priority is the net of the three.
- Check a box when done; add sub-bullets for notes/links as we go.

---

## Project state & prioritized backlog (from PR review — 2026-07-25)

**Where Chronolens stands.** The data layer is real — 5 SQL migrations (`db/001`–`005`) plus a
full script suite (`ingest`, `score`, `signals`, `explain`, `plan`). But **all 7 feature PRs
(#1–#7) are open, unmerged drafts**, and every one says *"not yet eyeballed in a live browser
against a seeded DB."* So the value is built but unshipped, and the blocker is verification, not
coding. (The `docs/EVENTS-SCHEMA.md` "not yet applied" header is stale — migrations exist.)

Prioritized, most-important first. For a **traffic/ad-funded** product, discoverability and
retention outrank polish.

- [ ] `P0` **Stand up a seeded environment and verify the 7 open PRs live.** *Importance:*
      critical — it unblocks *all* of #1–#7 at once (each is code-/build-verified but not
      browser-verified). *Efficiency:* high — one-time Postgres + migrate + ingest a few subjects.
      *Practicality:* high. **Do this first; it gates everything below.**
- [ ] `P0` **Merge #4 — SEO + shareable URLs + dynamic OG images.** *Importance:* highest —
      discoverability **is** the revenue model for an ad-funded site (metadata, sitemap, robots,
      `/explore`, JSON-LD, social cards). *Efficiency:* high (done, `next build` verified).
      *Practicality:* merge this **first of the #4/#5/#6 trio** to set the nav/header baseline.
- [ ] `P1` **Merge #6 — Follow subjects + "new since your last visit."** *Importance:* high —
      retention hook → return visits → more ad impressions, with no accounts/server state.
      *Practicality:* resolve the nav/header conflict against #4 (keep both).
- [ ] `P1` **Merge #7 — settings copy fix** ("nothing leaves your machine" was misleading; timeline
      data is fetched online). *Importance:* med (honesty/trust) · *Efficiency:* very high (copy-only)
      · *Practicality:* trivial. **Easy win.**
- [ ] `P1` **Merge #1 — EventList year→month→day grouping.** *Importance:* med (readability of the
      core view) · *Efficiency:* high (small, presentational) · *Practicality:* high, no conflicts.
- [ ] `P2` **Merge #5 — Compare two subjects (`/compare`).** *Importance:* med-high (differentiating
      feature; makes `price_divergence` visual) · *Practicality:* third of the nav-conflict trio.
- [ ] `P2` **Merge #2 — timeline stacking + settings + mini-map.** *Importance:* med (UX for busy
      periods) · *Efficiency:* med (largest presentational surface) · *Practicality:* independent.
- [ ] `P2` **Merge #3 — "Biggest moves" panel** on company pages. *Importance:* med (surfaces
      catalysts) · *Practicality:* independent, derived-only.
- [ ] `P1` **Coordinate the #4/#5/#6 nav/header merge conflicts** — all three edit `app/layout.tsx`
      and subject headers. Merge in order (#4 → #6 → #5), keeping every header link/control at each step.

> The **On-chain events** initiative below is a new P1 build — schedule it after (or alongside)
> clearing this backlog, since the pending PRs are already-sunk work waiting only on verification.

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
- [ ] Keyless public-domain / open sources — SEC EDGAR, Federal Register, Chronicling America,
      Wikipedia (CC BY-SA, attribution rendered), GDELT — nothing to do, confirm attribution shows.
- [ ] Optional hardening: build a `COMMERCIAL_MODE=true` env flag that refuses to fetch from any
      source flagged `commercialOk: false`, so a forgotten key can't cause non-compliance.
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
- [ ] Attribution renders on every surface (source label + outward link on list rows, cards,
      chart popup).
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

- [ ] `P0` **Subject model for coins/protocols:** `kind='topic'` with slug (`ethereum`, `usdc`)
      vs. a new `subject_kind`. (Leaning: reuse `topic` — no migration, inherits
      timelines/scoring.)
- [ ] `P0` **New `event_kind`:** add `'onchain'` to the enum (migration) vs. reuse an existing
      kind. (Leaning: dedicated `'onchain'` for filtering/attribution.)
- [ ] `P1` **Confirmation lag / finality policy:** how many blocks (or "finalized" tag) before an
      event is ingestable, to avoid reorg orphans.
- [ ] `P1` **Address label source:** hand-maintained provenance map vs. Etherscan labels vs.
      both. Where does the canonical map live?

### Phase 0 — Foundations & spike (free, zero reorg risk) · `P0`

Prove the chart-overlay value on long-finalized events with no spend.

- [ ] `P0` Add `'onchain'` to the `event_kind` enum + migration (`scripts/gen-migration.mjs`).
- [ ] `P0` Register an `onchain` entry in `SOURCES` (`lib/ingest/store.ts`) with
      `commercialOk: true`, license = "public domain (on-chain facts)", attribution per chain.
- [ ] `P0` Seed 3–4 crypto subjects (`btc`, `eth`, `usdc`) as `topic` subjects with slugs + aliases.
- [ ] `P0` **BTC halvings** adapter (keyless): 2012/2016/2020/2024 via mempool.space /
      Blockstream Esplora, with on-chain block links.
- [ ] `P0` **ETH network milestones** adapter: Frontier (2015), The Merge (2022), Shanghai,
      Dencun — dates + block links.
- [ ] `P0` **One stablecoin's mints/burns** (USDC `Transfer` from/to treasury) via Etherscan free
      key, curated to material sizes only.
- [ ] `P0` Verify events render on the timeline **pegged to the price chart** (BTC halving on BTC
      price = the demo).
- [ ] `P0` Confirm dedup/idempotency: re-run ingest, confirm updates not duplicates.

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
backfill throughput, handled by back-off + idempotency. Contrast Chronolens's other sources
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

- [ ] `P0` **Mine Wikipedia *citations*** (the References list) into distinct, dated source
      events instead of only slicing prose; demote prose-sentence events to connective narrative
      and cap them. *Keyless. Directly fixes the "all events link the same article" redundancy —
      the reason this initiative exists.*
- [ ] `P1` **Internet Archive adapter** (advancedsearch + Wayback CDX) — keyless archive search.
- [ ] `P1` **NYT Article Search adapter** (archive to 1851) — free BYO key, plumbed like the
      AI-model key (stays in the browser / server env, never in the shared corpus).
- [ ] `P1` **Guardian Open Platform adapter** (to 1999) — free BYO key, same plumbing.
- [ ] `P2` **Google Programmable Search** (Custom Search JSON API) as a **present-day discovery
      layer only** — accept the 100/day free cap and weak historical date-filtering; it searches
      the live web, not archives, so it is *not* a time machine.
- [ ] `P1` **Evaluate an alternative search engine to Google** — Bing Web Search, Brave Search
      API, SerpAPI, Marginalia, DuckDuckGo (and similar). Compare historical reach, date-filter
      quality, quota, cost, and ToS for an ad-supported product; pick the best discovery engine,
      which may replace Google rather than supplement it.

### Cross-cutting

- [ ] `P1` **Licensing gate:** every source carries `commercialOk` + license in `SOURCES`; only
      commercial-safe sources feed the ad-supported path (same discipline as the on-chain and
      Google-News-RSS bars).
- [ ] `P1` **BYO-key plumbing** for the keyed sources (NYT, Guardian, discovery engine) — mirror
      the AI-model-key pattern; keys never touch the shared server state.
- [ ] `P1` **Dedup basis = article URL**, so the same wire story surfaced by two engines collapses
      to one event (mirrors the existing GDELT dedup rule).
- [ ] `P2` **Coverage-map doc** kept current as sources are added, so "how far back can this go"
      is answerable per subject.

## Other initiatives

_Add new Chronolens initiatives here as they come up — this doc is meant to govern the whole
project, not just the on-chain work._
