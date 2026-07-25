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
- Check a box when done; add sub-bullets for notes/links as we go.

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

## Other initiatives

_Add new Chronolens initiatives here as they come up — this doc is meant to govern the whole
project, not just the on-chain work._
