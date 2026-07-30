/**
 * How old a block must be before an event in it can be published.
 *
 * This exists because an on-chain event is not retractable here. Events are cited by syntheses
 * under `ON DELETE RESTRICT`, so a row that turns out to have been reorged out of the chain
 * cannot simply be deleted — it becomes a permanent, confident claim about something that did
 * not happen. That is the worst failure this project has: worse than a missing event, worse than
 * a late one.
 *
 * Phase 0 did not need this, and deliberately so: every event it publishes is years finalized,
 * which is why the phase was scoped to halvings and network upgrades. Phase 1's stablecoin feed
 * reads transfers minutes old, so the policy has to land before it, not after.
 *
 * The rule is *age*, not confirmation count, for one practical reason: every adapter here
 * already has a block timestamp — it is what dates the event — and none of them has a chain tip
 * to count back from without an extra request per event. Age is the same guarantee expressed in
 * the units we already hold.
 */

/** Chains this project can reason about. Anything else is not publishable — see `isFinal`. */
export type Chain = "bitcoin" | "ethereum";

export interface FinalityRule {
  minAgeSeconds: number;
  why: string;
}

export const FINALITY: Record<Chain, FinalityRule> = {
  /**
   * Post-Merge Ethereum has actual finality: two epochs, 64 slots, ~12.8 minutes, after which
   * reverting requires an attack costing a third of all staked ether. An hour is roughly five
   * times that window, which absorbs missed slots and an explorer lagging the head without
   * getting anywhere near the real risk.
   */
  ethereum: {
    minAgeSeconds: 60 * 60,
    why: "~4.7× the two-epoch finality window, allowing for missed slots and a lagging explorer",
  },
  /**
   * Bitcoin has no finality gadget — depth is a probability, not a guarantee. Six confirmations
   * is the exchange convention and is about an hour at target block time, but block times vary
   * enough that an hour is sometimes three blocks. Six hours is ~36 blocks: far past the deepest
   * reorg Bitcoin has ever seen outside a consensus bug, and free here, because nothing this
   * project publishes about Bitcoin is time-sensitive to the hour.
   */
  bitcoin: {
    minAgeSeconds: 6 * 60 * 60,
    why: "~36 blocks, far beyond any observed mainnet reorg; costs nothing on historical events",
  },
};

/** `btc-block-840000` / `eth-tx-0x…` → the chain it happened on. */
export function chainOfRef(ref: string): Chain | null {
  if (ref.startsWith("btc-")) return "bitcoin";
  if (ref.startsWith("eth-")) return "ethereum";
  return null;
}

/**
 * Is a block old enough to publish an event from?
 *
 * Fails closed on every uncertainty — an unknown chain, a missing or nonsensical timestamp, a
 * block dated in the future. Each of those means we cannot show the block is settled, and
 * "cannot show" has to behave like "not settled" when the mistake is permanent.
 */
export function isFinal(
  chain: Chain | null,
  blockTimeSeconds: number | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): boolean {
  if (!chain) return false;
  if (typeof blockTimeSeconds !== "number" || !Number.isFinite(blockTimeSeconds)) return false;
  if (blockTimeSeconds <= 0) return false;
  // A timestamp ahead of us is a clock disagreement or a bad parse, never a settled block.
  if (blockTimeSeconds > nowSeconds) return false;
  return nowSeconds - blockTimeSeconds >= FINALITY[chain].minAgeSeconds;
}

/** Why an event was withheld, for the ingest log — "nothing returned" and "too new" differ. */
export function withheldReason(chain: Chain | null, blockTimeSeconds: number | undefined): string {
  if (!chain) return "unknown chain";
  if (typeof blockTimeSeconds !== "number" || !Number.isFinite(blockTimeSeconds) || blockTimeSeconds <= 0) {
    return "no block timestamp";
  }
  const mins = Math.round(FINALITY[chain].minAgeSeconds / 60);
  return `not yet final (needs ${mins} min on ${chain})`;
}
