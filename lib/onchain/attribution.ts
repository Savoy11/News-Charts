import type { TimelineEvent } from "../types";

/**
 * Reading an on-chain event's attribution back off its reference.
 *
 * The claim an on-chain row makes is unusually strong — "this happened, at this height, on this
 * chain" — and it is only as good as the reader's ability to go and check. So the chain and the
 * reference are shown on the row rather than buried in a link, and the explorer is credited as
 * what it is: the thing that read the chain for us, not the authority for the fact.
 *
 * Refs are minted by `onchainEvent` and are the event's identity in the database, so parsing
 * them is reading our own format back, not guessing at someone else's.
 */

export interface ChainRef {
  chain: string;
  /** "block 840,000" or "tx 0x1f4c…9ab2" — already formatted for a reader */
  label: string;
}

const CHAINS: Record<string, string> = { btc: "Bitcoin", eth: "Ethereum" };

/** 840000 → "840,000". Grouping is the difference between a number and a wall of digits. */
const groupDigits = (n: string) => n.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/**
 * A hash is too long to read and too important to truncate silently, so it is elided in the
 * middle: both ends are what a reader compares against an explorer, and the middle is what
 * nobody checks.
 */
const shortHash = (h: string) => (h.length > 14 ? `${h.slice(0, 8)}…${h.slice(-6)}` : h);

export function parseChainRef(ref: string | undefined): ChainRef | null {
  if (!ref) return null;
  const m = /^(btc|eth)-(block|tx)-(.+)$/.exec(ref);
  if (!m) return null;
  const [, chain, kind, value] = m;
  if (kind === "block") {
    if (!/^\d+$/.test(value)) return null;
    return { chain: CHAINS[chain], label: `block ${groupDigits(value)}` };
  }
  if (!/^0x[0-9a-fA-F]+$/.test(value)) return null;
  return { chain: CHAINS[chain], label: `tx ${shortHash(value)}` };
}

/** Only on-chain rows carry a chain reference; everything else has no chain to point at. */
export function chainRefOf(ev: TimelineEvent): ChainRef | null {
  return ev.type === "onchain" ? parseChainRef(ev.externalId) : null;
}
