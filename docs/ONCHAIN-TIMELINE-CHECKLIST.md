# On-Chain Timeline — Master Checklist

A living, cross-project checklist for bringing **on-chain events into the Chronolens timeline
engine**, with CAEP (Crypto-Stuff) as a shared data source and consumer. Add to it, check
things off, re-prioritise. This is the single source of truth for the initiative across both
repos.

**Last updated:** 2026-07-25

---

## North star

Give users a free, visual way to see on-chain history on a linear timeline — protocol
milestones, governance, stablecoin supply moves, and exploits — pegged to the price chart so
they can see *what sparked a move*. On-chain becomes the **shared spine** between the two
projects: CAEP produces/consumes the same event stream, deep-links "view on timeline," and
Chronolens links back to CAEP's evaluation (driving traffic to CAEP, per Chronolens's purpose).

## Legend

- **Priority:** `P0` = do first / unblocks others · `P1` = core value · `P2` = later / nice-to-have
- **Project:** 📈 Chronolens · 🔗 CAEP (Crypto-Stuff) · 🤝 Shared / cross-cutting
- Check a box when done; add sub-bullets for notes/links as we go.

---

## Open decisions (resolve as we build)

- [ ] 🤝 `P0` **Source topology:** does Chronolens hit explorers directly, or consume CAEP's
      `/api/v1/` as the on-chain source? (Leaning: CAEP `/api/v1/` for mints/burns/depegs = one
      source of truth; explorers direct for network milestones & governance.)
- [ ] 📈 `P0` **Subject model for coins/protocols:** `kind='topic'` with slug (`ethereum`,
      `usdc`) vs. a new `subject_kind`. (Leaning: reuse `topic` — no migration, inherits
      timelines/scoring.)
- [ ] 📈 `P0` **New `event_kind`:** add `'onchain'` to the enum (migration) vs. reuse an
      existing kind. (Leaning: dedicated `'onchain'` for filtering/attribution.)
- [ ] 🤝 `P1` **Confirmation lag / finality policy:** how many blocks (or "finalized" tag)
      before an event is ingestable, to avoid reorg orphans.
- [ ] 🤝 `P1` **Address label source:** hand-maintained map (CAEP-style provenance file) vs.
      Etherscan labels vs. both. Where does the canonical map live?
- [ ] 🤝 `P2` **Cost ceiling:** confirm we stay free-tier only for v1; define the trigger that
      would justify a paid tier (Dune/Alchemy) later.

---

## Phase 0 — Foundations & spike (free, zero reorg risk) · `P0`

Goal: prove the chart-overlay value on long-finalized events with no spend.

- [ ] 📈 `P0` Add `'onchain'` to the `event_kind` enum + migration (`scripts/gen-migration.mjs`).
- [ ] 📈 `P0` Register an `onchain` entry in `SOURCES` (`lib/ingest/store.ts`) with
      `commercialOk: true`, license = "public domain (on-chain facts)", attribution per chain.
- [ ] 📈 `P0` Seed 3–4 crypto subjects (`btc`, `eth`, `usdc`) as `topic` subjects with slugs +
      aliases.
- [ ] 📈 `P0` **BTC halvings** adapter (keyless): 4 events (2012, 2016, 2020, 2024) via
      mempool.space / Blockstream Esplora, or hardcoded with on-chain block links.
- [ ] 📈 `P0` **ETH network milestones** adapter: Frontier (2015), The Merge (2022), Shanghai,
      Dencun — dates + block links.
- [ ] 📈 `P0` **One stablecoin's mints/burns** (USDC `Transfer` from/to treasury) via Etherscan
      free key, curated to material sizes only.
- [ ] 📈 `P0` Verify events render on the timeline **pegged to the price chart** (BTC halving on
      BTC price = the demo).
- [ ] 🤝 `P0` Confirm dedup: `dedupBasis` = tx hash / `(contract,logIndex,blockHash)`; re-run
      ingest and confirm idempotency (updates, not duplicates).

## Phase 1 — Curated on-chain adapter (breadth) · `P1`

- [ ] 📈 `P1` Generalise the Phase-0 fetchers into a reusable on-chain source module
      (`lib/onchain/*`) matching the `FetchResult`/`TimelineEvent` contract.
- [ ] 📈 `P1` Extend stablecoin coverage: USDT, DAI, PYUSD mints/burns; link to the coin subject.
- [ ] 🤝 `P1` **Reorg safety:** ingest only finalized blocks (confirmation lag) so no event is
      published that could be orphaned (respects `ON DELETE RESTRICT` on citations).
- [ ] 🤝 `P1` **Address labeling** map for issuers/treasuries/bridges (Circle, Tether, exchange
      hot wallets) — provenance-tracked, CAEP-data-file style.
- [ ] 📈 `P1` Deterministic relevance floor for on-chain: enrich only material events; leave
      ambiguous ones `NULL` for the AI tier (same pattern as Federal Register events).
- [ ] 📈 `P2` Backfill throughput: paginated `eth_getLogs` with back-off; document how far each
      source reaches (genesis) and its rate limits.

## Phase 2 — Governance & protocol events · `P1`/`P2`

- [ ] 📈 `P1` **Snapshot GraphQL** adapter (keyless): passed governance proposals for Uniswap,
      Aave, Compound, Maker → protocol subjects.
- [ ] 📈 `P2` **Tally / on-chain governance** for executed proposals (parameter changes).
- [ ] 📈 `P1` **Exploits/hacks** curated feed (correlate with price drops) — the highest-signal
      timeline events; confirm each on-chain before ingest.
- [ ] 📈 `P2` **DefiLlama** protocol launches / TVL inflection events (CAEP already consumes
      this — candidate for the shared-source path).
- [ ] 📈 `P2` **Industry/sector grouping** for crypto (mirror the SIC industry graph): e.g.
      "stablecoins", "L2s" as industry subjects with merged timelines.

## Phase 3 — CAEP ⇄ Chronolens integration (the shared spine) · `P1`

- [ ] 🔗 `P1` Expose CAEP on-chain events via `/api/v1/` (mints/burns, depeg events) with CORS +
      `updatedAt`/`source` metadata (CAEP's existing v1 conventions).
- [ ] 📈 `P1` If topology = "CAEP as source": Chronolens adapter reads CAEP `/api/v1/` instead of
      explorers for those event classes.
- [ ] 🔗 `P1` **Deep-link out:** CAEP coin/stablecoin pages get a "View on timeline →" link to
      the Chronolens subject.
- [ ] 📈 `P1` **Deep-link back:** Chronolens crypto subjects link to CAEP's evaluation/risk page
      for that asset.
- [ ] 🔗 `P2` CAEP depeg **alerts** (`/live-data/alerts`) emit timeline events (depeg start/
      recovery) into the shared stream.
- [ ] 🤝 `P2` Decide whether the address-label map and curated event catalog are **shared code**
      between repos (submodule / published package) vs. duplicated.

## Cross-cutting (applies to every phase)

- [ ] 🤝 `P0` **Licensing gate:** keep all sources `commercialOk: true` — raw chain facts +
      public explorers only. **No Dune/Nansen aggregations in the ad-supported path** (TOS),
      same discipline as the Google-News-RSS bar.
- [ ] 🤝 `P1` **Cost monitoring:** log per-source fetch counts; confirm free-tier limits
      (Etherscan 5/s, 100k/day) are not exceeded by scheduled ingest.
- [ ] 📈 `P1` **AI-cost discipline:** on-chain is high-volume — filter before enrichment; rely
      on content-hash keying so unchanged events are never re-paid for.
- [ ] 🤝 `P2` **Attribution UI:** render chain/explorer attribution on event cards + footer.

---

## Historical-depth reference (how far back)

The honest floor — name it, don't fake depth:

| Chain / data | Reaches back to | Notes |
| --- | --- | --- |
| Bitcoin (genesis) | **2009-01-03** | Absolute floor — nothing on-chain predates this |
| Ethereum (genesis) | **2015-07-30** | Frontier launch |
| Most DeFi / governance | **~2020+** | Protocol-dependent |

Within these bounds data is **complete and gap-free** (immutable chain); the only constraint is
backfill throughput, handled by back-off + idempotency. Contrast with Chronolens's other
sources (Chronicling America → 1800s, Wikipedia → further): **crypto subjects have short
timelines, on purpose.**

## Cost reference (v1 target: $0 recurring)

| Source | Depth | Cost | Key |
| --- | --- | --- | --- |
| mempool.space / Blockstream Esplora (BTC) | 2009 | free | keyless |
| Etherscan API family (ETH + L2s) | 2015 | free tier 5/s, 100k/day | free key |
| Blockscout | per-chain genesis | free/open | keyless |
| Snapshot GraphQL (governance) | ~2020+ | free | keyless |
| DefiLlama | protocol-dependent | free | keyless (CAEP uses it) |
| Dune / Nansen / Alchemy paid | genesis, decoded | **$$** | paid — later only |

---

## Backlog / later ideas

- [ ] 📈 NFT collection launch/mint milestones as timeline events.
- [ ] 📈 Whale / large-transfer events (needs strong relevance filtering to avoid noise).
- [ ] 📈 Staking milestones (ETH beacon deposits, validator counts) — CAEP already has staking data.
- [ ] 🔗 CAEP "Compare" surface: overlay a coin's on-chain events on its price alongside peers.
- [ ] 🤝 Multi-chain expansion (L2s, Solana) once the EVM adapter pattern is proven.
