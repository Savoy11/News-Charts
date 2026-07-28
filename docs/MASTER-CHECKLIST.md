# News Charts — Master Checklist

The governing checklist for the **News Charts** project: a single place to track initiatives,
priorities, and progress. Add to it, check things off, re-prioritise. This is a living doc.

**Last updated:** 2026-07-25

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

---

## Project state & prioritized backlog (from PR review — 2026-07-25)

**Where News Charts stands.** The data layer is real — 5 SQL migrations (`db/001`–`005`) plus a
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

## Initiative: Hardening & follow-ups from the feed/UX build-out (2026-07 session)

Consequences of what shipped on PR #9 (citation mining, NL prompts, pre-IPO story, crosshair
popup, filing stacks, collapsible list, 8 new news repositories), ranked by value-per-effort.

- [ ] `P0` **Commit the test suite.** The session's verification (cite-date parsing, prompt
      parsing, year extraction incl. ticker/domain false positives, prehistory guard, all 9
      adapter fixtures with mocked fetch) lives in throwaway scratchpad scripts. Add vitest and
      commit those ~60 assertions so every parser is regression-proof.
- [ ] `P1` **Noise control for the aggregators.** Keyword search across four general aggregators
      pulls junk (listicles, passing mentions). Add a server-side relevance floor (title must
      mention the subject; Marketaux/EODHD ticker tags are free wins) and near-duplicate
      collapsing across feeds — dedup is exact-URL today, so one wire story from three outlets
      shows three times (extend GDELT's headline+day rule cross-feed).
- [ ] `P1` **Per-source refresh windows + quota safety.** The company path fires ~15 fetches
      every hour a page is viewed. Split TTLs by volatility (news hourly, wiki daily, archives
      weekly) — faster pages, and free-tier quotas (Newsdata 200/day, GNews 100/day) stop being
      a multi-user risk.
- [ ] `P1` **Feed visibility in the UI.** A page silently rendering with 3 of 11 feeds down
      looks fine and misdirects debugging (the CAEP fallback lesson). Per-subject "Sources"
      panel: which feeds contributed, how many articles each — doubles as the attribution
      display the licenses want. `scripts/check-feeds.ts` covers the CLI half.
- [ ] `P1` **Finish the approved "Both views" condense.** The horizontal timeline still has no
      collapse-all (list view got one); add the one-click condense control there.
- [ ] `P2` **Auto-expand on jump.** Chart click-to-jump into a collapsed list section scrolls to
      it but doesn't open it.
- [ ] `P2` **NYT Keyword facet → event tags.** Needs a tags field on events; would feed the
      focus/AI relevance filtering.
- [ ] `P2` **Month-level date precision** plumb-through (month-only citation dates currently
      land on the 1st with day precision).
- [ ] `P1` **Internet Archive adapter (keyless).** Still the biggest unbuilt lever for the
      old-articles goal — and immune to key expiry or licensing changes.
- [ ] `P1` **Merge PR #9 to main** — ~20 commits across two dozen files is enough surface;
      shrink the risk. Add a committed `.env.example` documenting all eight key names.

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

- [ ] `P1` **Volume bars + moving averages on the price chart.** Cheap win: the Yahoo chart
      response the prices route already fetches carries volume in the same payload; SMAs
      (50/200-day) compute client-side. Lightweight-charts supports histogram + line series on
      the existing chart. Lets a reader see if an event moved price on real volume.
- [ ] `P1` **Corporate actions on the timeline (splits, dividends).** Also cheap: Yahoo's chart
      API returns dividend and split events via `events=div,splits` on the same request. Plot
      as their own marker type so a mechanical price change is never misread as news reaction.
      (Note: our prices are adjusted, so splits don't cliff — the value is labeling, not
      correction. Buybacks already arrive via 8-K filings.)
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

- [ ] `P1` **Topic timeline pegged to a company's stock price.** Pick any search term and
      overlay it on any company's price series — e.g. "Donald Trump presidency" against Ford
      stock. The strongest new idea in the dump: it generalises what company pages already do
      (events pegged to price) to *arbitrary* subjects, and `/compare` already aligns two
      subjects on one axis, so the pieces exist. Design question to settle first: the topic
      supplies events, the company supplies the price — so this is a **two-subject compose**,
      not a new page type. Keep the correlation framing honest (proximity ≠ causation, same
      rule as Biggest Moves).
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
- [ ] `P2` **Site name / domain.** Candidates: Timelines.ai · Timecharts.ai · Newscharts.ai ·
      Thetimeline.ai · Timeline.ai. ⚠ Renaming is not just a logo: `SITE_URL`, canonical URLs,
      the sitemap, OG images and JSON-LD all carry the name, and redirects would be needed to
      keep any indexed pages. Cheapest before launch, expensive after. Check domain
      availability and trademark conflicts before falling in love with one.
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
