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
/**
 * What the row is credited to when the explorer did NOT answer and the curated activation date
 * stood in. The link still points at Etherscan, because that is the page a reader lands on to
 * check — but nothing here was read from the chain, and the label must not imply it was.
 */
const PUBLISHED_LABEL = "Published activation date · verify on Etherscan";

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
    /**
     * When the explorer answers, the chain's own timestamp both dates the event and proves the
     * block is settled. When it does not, the published activation date stands in for both.
     *
     * That substitution is safe *here* and would not be everywhere: these are curated
     * milestones with published dates years in the past, so the finality check they face is a
     * formality. It is still worth making them face it — a milestone added with a date of today
     * is withheld, which is the correct answer whether the explorer replied or not.
     */
    const fromChain = Number.isFinite(parsed);
    const blockTime = fromChain
      ? Math.floor(parsed / 1000)
      : Math.floor(Date.parse(`${m.fallbackDate}T00:00:00Z`) / 1000);
    const date = fromChain ? dayFromEpoch(Math.floor(parsed / 1000)) : m.fallbackDate;
    const event = onchainEvent({
      date,
      title: m.name,
      description: m.description,
      url: `${EXPLORER_WEB}/${m.block}`,
      ref: `eth-block-${m.block}`,
      /**
       * The credit follows whichever branch produced the date, which it did not used to.
       *
       * Every row carried `Blockscout · Etherscan` unconditionally, so when the explorer was
       * unreachable — measured 2026-08-12, `eth.blockscout.com` answering 403 from the build
       * container — all four milestones still told the reader their date had been read from the
       * chain. Substituting the published date is deliberate and defensible; keeping the
       * provenance was not. This repo's standard is that a failed provider degrades with
       * *visible* provenance, and `onchain` is the event kind whose whole justification is that
       * a reader can re-verify it.
       *
       * The published activation date is perfectly good provenance. It simply is not Blockscout.
       */
      sourceLabel: fromChain ? EXPLORER_LABEL : PUBLISHED_LABEL,
      blockTime,
    });
    if (event) out.push(event);
  }
  return out;
}
