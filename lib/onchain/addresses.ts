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
/**
 * What an address *is*, which decides how a sentence about it reads. "Minted to Circle's
 * treasury" and "sent to the Arbitrum bridge" are different claims and neither is "sent to
 * 0x55fe…".
 */
export type AddressKind = "burn" | "token" | "treasury" | "bridge" | "exchange";

export interface LabelledAddress {
  address: string;
  label: string;
  kind: AddressKind;
  /** how we know — issuer documentation, contract role, or published attestation */
  provenance: string;
  /**
   * For token contracts: what the chain itself should say. `npm run verify:addresses` calls
   * `symbol()` and `decimals()` and fails on a mismatch, which turns the provenance note above
   * from a claim into something a machine re-checks.
   */
  expect?: { symbol: string; decimals: number };
}

/** A well-formed 20-byte address, lowercased. Anything else is a typo, not an address. */
export const isAddress = (s: string): boolean => /^0x[0-9a-f]{40}$/.test(s.toLowerCase());

/** Addresses arrive checksummed from some explorers and lowercase from others. */
export const normaliseAddress = (s: string): string => s.trim().toLowerCase();

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
  kind: "token",
  expect: { symbol: "USDC", decimals: 6 },
  decimals: 6,
  materialUsd: 100_000_000,
  provenance:
    "Circle's published USDC contract address for Ethereum mainnet; the contract's own " +
    "symbol() returns USDC and its decimals() returns 6.",
};

export const DAI: Stablecoin = {
  address: "0x6b175474e89094c44da98b954eedeac495271d0f",
  label: "DAI",
  kind: "token",
  expect: { symbol: "DAI", decimals: 18 },
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
  kind: "token",
  expect: { symbol: "PYUSD", decimals: 6 },
  decimals: 6,
  // A much smaller float; $100m here would be most of a month's activity.
  materialUsd: 5_000_000,
  provenance:
    "Paxos's published PayPal USD contract address for Ethereum mainnet; a standard ERC-20 " +
    "whose supply changes emit Transfer to and from the null address.",
};

/**
 * Tether, which reports supply changes through its own events rather than null-address
 * transfers — see `usdt.ts`. Kept out of `STABLECOINS` so the transfer-reading path never asks
 * about it and silently finds nothing.
 */
export const USDT: Stablecoin = {
  address: "0xdac17f958d2ee523a2206206994597c13d831ec7",
  label: "USDT",
  kind: "token",
  expect: { symbol: "USDT", decimals: 6 },
  decimals: 6,
  materialUsd: 100_000_000,
  provenance:
    "Tether's published USDT contract address for Ethereum mainnet. Its supply changes emit " +
    "Issue(uint256) and Redeem(uint256) rather than Transfer to or from the null address.",
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

/**
 * The burn address, as a labelled entry rather than a bare constant, so a sentence about it
 * reads the same way as one about any other counterparty.
 */
export const BURN: LabelledAddress = {
  address: NULL_ADDRESS,
  label: "the burn address",
  kind: "burn",
  provenance:
    "The all-zero address. Nobody holds its key, so tokens sent to it are unspendable — which " +
    "is why issuers use it to destroy supply, and why a transfer *from* it is a mint.",
};

/**
 * Every address this project is willing to name.
 *
 * **Deliberately short, and the shortness is the point.** The rule at the top of this file bars
 * adding an address on an explorer's tag alone, and that rule excludes almost every exchange hot
 * wallet and treasury in circulation: those labels are community attributions, and republishing
 * one turns someone else's guess into our factual claim about who moved money. So this holds
 * contracts — each verifiable by asking the contract itself what it is — and the burn address,
 * which is a mathematical fact.
 *
 * To add an exchange or bridge: cite the operator's own documentation or an on-chain role, put
 * that in `provenance`, and prefer an entry that `npm run verify:addresses` can re-check. An
 * address nobody can check does not belong here, however confident the internet is about it.
 */
export const ADDRESS_BOOK: LabelledAddress[] = [BURN, USDC, DAI, PYUSD, USDT];

const BY_ADDRESS = new Map(ADDRESS_BOOK.map((a) => [normaliseAddress(a.address), a]));

/**
 * What we can say about an address, or null when the answer is "we do not know".
 *
 * Null is a real answer and callers must render it as one. "Sent to an address we cannot
 * identify" is true; silently omitting the counterparty implies there wasn't one.
 */
export function labelFor(address: string | undefined): LabelledAddress | null {
  if (!address) return null;
  return BY_ADDRESS.get(normaliseAddress(address)) ?? null;
}

/** How to name a counterparty in a sentence, including when we cannot. */
export function describeCounterparty(address: string | undefined): string {
  const known = labelFor(address);
  if (known) return known.label;
  return address && isAddress(address) ? "an address we haven’t identified" : "an unknown address";
}
