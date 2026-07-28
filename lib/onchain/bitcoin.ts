import { dayFromEpoch, getJson, getText, onchainEvent } from "./chain";
import type { TimelineEvent } from "../types";

/**
 * Bitcoin halvings — the cleanest possible on-chain event, and the reason this is Phase 0.
 *
 * The heights are protocol constants (every 210,000 blocks), so nothing is curated except the
 * arithmetic; the *dates* come from the chain itself, because a halving happens when the block
 * is mined, not on a scheduled day. Long finalized by many years, so there is no reorg risk to
 * reason about yet — that policy lands in Phase 1 with the live feeds.
 *
 * Keyless, and doubly so: mempool.space first, Blockstream Esplora second. Both speak the same
 * Esplora API, so the fallback is a base-URL swap.
 */
const HALVING_INTERVAL = 210_000;
const INITIAL_REWARD = 50;

const EXPLORERS = [
  { base: "https://mempool.space/api", label: "mempool.space", web: "https://mempool.space/block" },
  { base: "https://blockstream.info/api", label: "Blockstream", web: "https://blockstream.info/block" },
];

/** Block reward in BTC after `n` halvings — 50, 25, 12.5, … */
export function rewardAfter(n: number): number {
  return INITIAL_REWARD / 2 ** n;
}

/** Trim float noise: 6.25 stays 6.25, 3.125 stays 3.125, 0.30000000000000004 never appears. */
function fmtReward(btc: number): string {
  return btc.toFixed(8).replace(/\.?0+$/, "");
}

async function blockAt(height: number): Promise<{ hash: string; time: number; web: string; label: string } | null> {
  for (const ex of EXPLORERS) {
    const hash = (await getText(`${ex.base}/block-height/${height}`))?.trim();
    // a height above the tip answers with an error string, not a 64-char hash
    if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) continue;
    const block = await getJson<{ timestamp?: number; time?: number }>(`${ex.base}/block/${hash}`);
    const time = block?.timestamp ?? block?.time;
    if (typeof time !== "number") continue;
    return { hash, time, web: `${ex.web}/${hash}`, label: ex.label };
  }
  return null;
}

/**
 * Every halving that has already happened. A height above the current tip simply has no block,
 * so the next halving drops out on its own — there is no "is it in the future" date arithmetic
 * to get wrong, and no scheduled event is ever published as though it had occurred.
 */
export async function getBitcoinHalvings(maxEpochs = 6): Promise<TimelineEvent[]> {
  const out: TimelineEvent[] = [];
  for (let n = 1; n <= maxEpochs; n++) {
    const height = HALVING_INTERVAL * n;
    const block = await blockAt(height);
    if (!block) break; // not mined yet — and neither is anything after it
    const before = fmtReward(rewardAfter(n - 1));
    const after = fmtReward(rewardAfter(n));
    out.push(
      onchainEvent({
        date: dayFromEpoch(block.time),
        title: `Bitcoin halving — block reward drops to ${after} BTC`,
        description:
          `At block ${height.toLocaleString("en-US")} the subsidy paid to miners fell from ` +
          `${before} to ${after} BTC, halving the rate of new issuance. Written into the ` +
          `protocol, not decided by anyone.`,
        url: block.web,
        ref: `btc-block-${height}`,
        // The explorer alone. The block height is the event's chain reference and the row
        // renders it there; repeating it here read as "Bitcoin block 840,000 · via Bitcoin
        // block 840,000", and credited the explorer with the fact rather than with the lookup.
        sourceLabel: block.label,
      })
    );
  }
  return out;
}
