/**
 * Crypto sectors — the industry graph, applied to subjects that will never have a SIC code.
 *
 * The grouping question is the same one the SIC graph answers for companies: *what else is like
 * this, and did the same thing happen to all of them?* A stablecoin sector page puts every
 * issuer's supply moves on one axis, and that is where a redemption wave is legible. On any
 * single issuer's page it looks like an ordinary week.
 *
 * Curated, and the membership rows say so (`source = 'curated'`). Nobody assigned these
 * categories — we did — and that is a different kind of claim from a SIC code an issuer filed.
 */

export interface CryptoSector {
  slug: string;
  displayName: string;
  summary: string;
  /** subject slugs, which must exist before membership can be recorded */
  members: string[];
}

export const CRYPTO_SECTORS: CryptoSector[] = [
  {
    slug: "sector-stablecoins",
    displayName: "Stablecoins",
    summary:
      "Dollar-pegged tokens whose supply is created and destroyed on-chain. Because issuance is " +
      "public, expansions and redemptions are visible as they happen rather than reported after " +
      "the fact — and seen together, the issuers move in ways no single one of them shows.",
    members: ["usdc", "usdt", "dai", "pyusd"],
  },
  {
    slug: "sector-layer-1",
    displayName: "Layer-1 chains",
    summary:
      "Base-layer blockchains with their own consensus and issuance schedules. Their timelines " +
      "are protocol history: halvings, upgrades, and the events that changed the rules.",
    members: ["btc", "eth"],
  },
  {
    slug: "sector-defi-governance",
    displayName: "DeFi protocols",
    summary:
      "Protocols governed by token holders voting in public. Their timelines are a record of " +
      "decisions taken about themselves, which is a different thing from coverage of them.",
    members: ["uni", "aave"],
  },
];

/** Which sectors claim a subject. A subject may sit in more than one. */
export const sectorsFor = (slug: string): CryptoSector[] =>
  CRYPTO_SECTORS.filter((s) => s.members.includes(slug));
