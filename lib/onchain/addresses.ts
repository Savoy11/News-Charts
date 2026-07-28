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

export const USDC: LabelledAddress = {
  address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  label: "USDC",
  provenance:
    "Circle's published USDC contract address for Ethereum mainnet; the contract's own " +
    "symbol() returns USDC and its decimals() returns 6.",
};

/** USDC carries 6 decimals, not 18 — getting this wrong misreports supply by 10^12. */
export const USDC_DECIMALS = 6;
