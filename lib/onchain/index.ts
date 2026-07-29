import { getBitcoinHalvings } from "./bitcoin";
import { getEthereumMilestones } from "./ethereum";
import { getStablecoinSupplyMoves } from "./stablecoin";
import { DAI, PYUSD, USDC, type Stablecoin } from "./addresses";
import type { TimelineEvent } from "../types";

export { getBitcoinHalvings } from "./bitcoin";
export { getEthereumMilestones, ETH_MILESTONES } from "./ethereum";
export {
  getAllStablecoinSupplyMoves,
  getStablecoinSupplyMoves,
  getUsdcSupplyMoves,
  MATERIAL_USDC,
} from "./stablecoin";

/**
 * The crypto subjects Phase 0 covers.
 *
 * **Modelled as topics, not a new subject kind.** The schema bars `kind='company'` without a
 * CIK and a ticker, which no crypto asset has and which it would be dishonest to invent; a new
 * `subject_kind` would mean a migration plus a fourth page type, and would inherit none of the
 * timeline, scoring, SEO or follow behaviour topics already have. `topic` costs nothing and
 * inherits all of it.
 *
 * The one thing topics lacked was a price chart, and that is why crypto is a good forcing
 * function: assets have a continuous price series, so `TopicExplorer` now renders the chart
 * when a subject has price rows. Ordinary topics have none and are unaffected.
 */
export interface CryptoSubject {
  slug: string;
  displayName: string;
  aliases: string[];
  summary: string;
  firstEventOn: string;
  /** Yahoo quotes crypto on the same chart endpoint as equities, so prices come for free. */
  yahooSymbol: string | null;
}

export const CRYPTO_SUBJECTS: CryptoSubject[] = [
  {
    slug: "btc",
    displayName: "Bitcoin",
    aliases: ["bitcoin", "btc", "btc-usd"],
    summary:
      "Bitcoin is a peer-to-peer digital currency whose issuance schedule is fixed in its " +
      "protocol: the reward paid to miners halves every 210,000 blocks, roughly every four " +
      "years, until issuance ends. Its on-chain history begins at the genesis block in 2009.",
    firstEventOn: "2009-01-03",
    yahooSymbol: "BTC-USD",
  },
  {
    slug: "eth",
    displayName: "Ethereum",
    aliases: ["ethereum", "eth", "eth-usd"],
    summary:
      "Ethereum is a programmable blockchain whose rules change through coordinated network " +
      "upgrades rather than on a schedule. Its on-chain history begins with the Frontier " +
      "launch in July 2015.",
    firstEventOn: "2015-07-30",
    yahooSymbol: "ETH-USD",
  },
  {
    slug: "usdc",
    displayName: "USDC",
    aliases: ["usdc", "usd coin", "usdc-usd"],
    summary:
      "USDC is a dollar-backed stablecoin issued by Circle on Ethereum and other chains. " +
      "Because supply is created and destroyed on-chain, expansions and redemptions are " +
      "publicly visible as transactions rather than reported after the fact.",
    firstEventOn: "2018-09-26",
    // a stablecoin's price is ~$1 by construction; a chart of it would say nothing
    yahooSymbol: null,
  },
  {
    slug: "dai",
    displayName: "DAI",
    aliases: ["dai", "makerdao dai", "dai-usd"],
    summary:
      "DAI is a dollar-pegged stablecoin issued by the Maker protocol against collateral held " +
      "in smart contracts rather than by a company holding reserves. Supply expands and " +
      "contracts as borrowers open and close positions, so its issuance history is a record of " +
      "on-chain credit demand.",
    firstEventOn: "2019-11-18",
    yahooSymbol: null,
  },
  {
    slug: "pyusd",
    displayName: "PayPal USD",
    aliases: ["pyusd", "paypal usd", "paypal dollar"],
    summary:
      "PayPal USD is a dollar-backed stablecoin issued by Paxos for PayPal. It is the first " +
      "stablecoin from a mainstream US payments company, which makes its supply history a " +
      "readable proxy for how quickly that distribution actually took hold.",
    firstEventOn: "2023-08-07",
    yahooSymbol: null,
  },
];

/**
 * Which token each stablecoin subject reads.
 *
 * A `Record` rather than a lookup by slug: adding a subject without wiring its token would
 * otherwise compile and return an empty timeline, which reads as "nothing has happened" instead
 * of "nobody connected this up".
 */
const STABLECOIN_SUBJECTS: Record<string, Stablecoin> = {
  usdc: USDC,
  dai: DAI,
  pyusd: PYUSD,
};

/**
 * Every on-chain event for a subject. Each adapter is failure-isolated, so one explorer being
 * unreachable costs that adapter's events and nothing else.
 */
export async function ingestOnchainFor(slug: string): Promise<TimelineEvent[]> {
  switch (slug) {
    case "btc":
      return getBitcoinHalvings().catch(() => []);
    case "eth":
      return getEthereumMilestones().catch(() => []);
    default: {
      const token = STABLECOIN_SUBJECTS[slug];
      return token ? getStablecoinSupplyMoves(token).catch(() => []) : [];
    }
  }
}
