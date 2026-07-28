import { dayFromEpoch, getJson, onchainEvent } from "./chain";
import type { TimelineEvent } from "../types";

/**
 * Ethereum network milestones.
 *
 * Unlike Bitcoin halvings, these are not derivable from a constant — an upgrade happens when
 * the network agrees it happens, so *which* blocks matter is curated. What is not curated is
 * the date: each entry carries its activation block, and the timestamp is read from the chain
 * via Blockscout (keyless). The curated date is only a fallback for when the explorer is
 * unreachable, and any disagreement is the chain's to win.
 *
 * Provenance for the block numbers: each is the published activation block for that fork, and
 * each is checkable at the URL the event links to. Nothing here is a secondary source's
 * summary of a date.
 */
const BLOCKSCOUT = "https://eth.blockscout.com/api/v2/blocks";
const EXPLORER_WEB = "https://etherscan.io/block";
// Blockscout answers the timestamp; Etherscan is where the link sends a reader. Naming both is
// the honest credit — one did the lookup, the other is the page you land on.
const EXPLORER_LABEL = "Blockscout · Etherscan";

interface Milestone {
  block: number;
  /** published activation date, used only if the explorer cannot be reached */
  fallbackDate: string;
  name: string;
  description: string;
}

export const ETH_MILESTONES: Milestone[] = [
  {
    block: 1,
    fallbackDate: "2015-07-30",
    name: "Frontier — Ethereum's first block",
    description:
      "The network began producing blocks. Everything on an Ethereum timeline is bounded " +
      "below by this date; there is no earlier on-chain history to find.",
  },
  {
    block: 15_537_394,
    fallbackDate: "2022-09-15",
    name: "The Merge — proof of work ends",
    description:
      "Ethereum switched from mining to proof of stake at this block, cutting the network's " +
      "energy use by roughly 99.9% and changing issuance from miner rewards to staking rewards.",
  },
  {
    block: 17_034_870,
    fallbackDate: "2023-04-12",
    name: "Shanghai/Capella — staked ETH becomes withdrawable",
    description:
      "The first upgrade to let validators withdraw staked ETH. Until this block, ETH " +
      "deposited to the beacon chain since 2020 could not be retrieved.",
  },
  {
    block: 19_426_587,
    fallbackDate: "2024-03-13",
    name: "Dencun — blob transactions cut rollup costs",
    description:
      "EIP-4844 introduced blob-carrying transactions, sharply reducing the cost for layer-2 " +
      "rollups to post data to Ethereum.",
  },
];

/**
 * Milestones with their dates read from the chain where possible. A milestone whose block
 * cannot be resolved still ships on its published date — these are settled historical facts,
 * and dropping them because an explorer is down would be the wrong trade.
 */
export async function getEthereumMilestones(): Promise<TimelineEvent[]> {
  const out: TimelineEvent[] = [];
  for (const m of ETH_MILESTONES) {
    const block = await getJson<{ timestamp?: string }>(`${BLOCKSCOUT}/${m.block}`);
    const parsed = block?.timestamp ? Date.parse(block.timestamp) : NaN;
    const date = Number.isFinite(parsed)
      ? dayFromEpoch(Math.floor(parsed / 1000))
      : m.fallbackDate;
    out.push(
      onchainEvent({
        date,
        title: m.name,
        description: m.description,
        url: `${EXPLORER_WEB}/${m.block}`,
        ref: `eth-block-${m.block}`,
        sourceLabel: EXPLORER_LABEL,
      })
    );
  }
  return out;
}
