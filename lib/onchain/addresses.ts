/**
 * Hand-maintained address labels, with provenance.
 *
 * The checklist leaves "hand-maintained map vs. Etherscan labels vs. both" open. Phase 0 takes
 * the hand-maintained half only, deliberately: an explorer's label is an opinion we would be
 * republishing without being able to show our work, and a wrong label on a timeline reads as a
 * factual claim about who moved money. Every entry below therefore records *why* we believe it,
 * in a form a reader could check.
 *
 * Rule for adding one: the address must be identifiable from the issuer's own documentation or
 * from an on-chain role (a contract's declared minter), never from an explorer's tag alone.
 */
export interface LabelledAddress {
  address: string;
  label: string;
  /** how we know — issuer documentation, contract role, or published attestation */
  provenance: string;
}

/** The canonical zero address. Tokens are minted from it and burned to it by convention. */
export const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * A stablecoin whose supply moves are readable as transfers to and from the null address.
 *
 * `materialUsd` is per token on purpose. A threshold is a claim about what mattered, and what
 * counts as a large mint differs by an order of magnitude between a $60bn token and a $1bn one:
 * one number across all of them would either bury the small tokens' timelines or hide the big
 * ones' routine housekeeping.
 */
export interface Stablecoin extends LabelledAddress {
  /** decimals differ by token — reading USDC as 18 misreports supply by 10^12 */
  decimals: number;
  /** below this, a supply move is treasury housekeeping rather than a timeline event */
  materialUsd: number;
}

export const USDC: Stablecoin = {
  address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  label: "USDC",
  decimals: 6,
  materialUsd: 100_000_000,
  provenance:
    "Circle's published USDC contract address for Ethereum mainnet; the contract's own " +
    "symbol() returns USDC and its decimals() returns 6.",
};

export const DAI: Stablecoin = {
  address: "0x6b175474e89094c44da98b954eedeac495271d0f",
  label: "DAI",
  decimals: 18,
  // Roughly a tenth of USDC's supply, so a tenth of the threshold keeps the bar comparable.
  materialUsd: 10_000_000,
  provenance:
    "MakerDAO's published DAI contract address for Ethereum mainnet. A DSToken: mint() emits " +
    "Transfer from the null address and burn() emits Transfer to it, which is the convention " +
    "this adapter reads.",
};

export const PYUSD: Stablecoin = {
  address: "0x6c3ea9036406852006290770bedfcaba0e23a0e8",
  label: "PYUSD",
  decimals: 6,
  // A much smaller float; $100m here would be most of a month's activity.
  materialUsd: 5_000_000,
  provenance:
    "Paxos's published PayPal USD contract address for Ethereum mainnet; a standard ERC-20 " +
    "whose supply changes emit Transfer to and from the null address.",
};

/**
 * Tokens whose supply moves this adapter can read, and why USDT is not among them.
 *
 * **USDT is deliberately excluded.** Tether's contract does not mint or burn through the null
 * address: `issue()` credits the treasury balance directly and emits its own `Issue` event, and
 * `redeem()` emits `Redeem`. Reading null-address transfers would therefore return *nothing* for
 * USDT — which on a page is indistinguishable from "no material mints this month", the exact
 * silent-empty failure the Sources panel exists to expose. Covering it needs a second code path
 * against those events, which is its own item rather than a line in a table.
 */
export const STABLECOINS: Stablecoin[] = [USDC, DAI, PYUSD];

/** @deprecated read `USDC.decimals`; kept so nothing silently reads a stale constant. */
export const USDC_DECIMALS = USDC.decimals;
