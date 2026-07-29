import { dayFromEpoch, getJson, onchainEvent } from "./chain";
import { NULL_ADDRESS, STABLECOINS, USDC, type Stablecoin } from "./addresses";
import type { TimelineEvent } from "../types";

/**
 * USDC supply moves — mints and burns, read as ERC-20 `Transfer` events to and from the null
 * address, which is how supply is created and destroyed by convention.
 *
 * Curated to material sizes only, and that threshold is doing real work: USDC mints hundreds of
 * times a month, and an un-floored feed would bury a subject's timeline under routine treasury
 * operations. A timeline is a claim about what mattered; a $2m mint did not.
 *
 * The only adapter in Phase 0 that needs a key. Without `ETHERSCAN_API_KEY` it returns nothing
 * and the rest of the on-chain timeline is unaffected — the same degradation the news adapters
 * use, for the same reason: an optional source must never be able to empty a page.
 */
const ETHERSCAN = "https://api.etherscan.io/api";

/** @deprecated per-token now — read `USDC.materialUsd`. Kept so nothing reads a stale constant. */
export const MATERIAL_USDC = USDC.materialUsd;

interface TokenTx {
  hash: string;
  timeStamp: string;
  from: string;
  to: string;
  value: string;
}

/**
 * Token amounts are integer strings in base units.
 *
 * `Number()` is safe up to 2^53. A 6-decimal token stays far inside that; an 18-decimal one like
 * DAI does not — $10m of DAI is 1e25, well past exact integer range. The division is applied to
 * the parsed float anyway, so the result is accurate to about fifteen significant figures, which
 * is many more than a "$250m minted" headline needs. Precision beyond that would be false
 * precision on a timeline card.
 */
function toUnits(raw: string, decimals: number): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n / 10 ** decimals : 0;
}

const money = (n: number): string =>
  n >= 1e9 ? `$${(n / 1e9).toFixed(2)}bn` : `$${Math.round(n / 1e6)}m`;

/**
 * Supply moves for one stablecoin.
 *
 * Generalised from the USDC-only Phase 0 version by adding tokens, rather than by inventing an
 * abstraction first: the only things that actually differ are the contract, the decimals and the
 * materiality bar, which is why those are the only things the table carries.
 */
export async function getStablecoinSupplyMoves(
  token: Stablecoin,
  minimum = token.materialUsd,
  limit = 40
): Promise<TimelineEvent[]> {
  const key = process.env.ETHERSCAN_API_KEY;
  if (!key) return [];

  const url =
    `${ETHERSCAN}?module=account&action=tokentx` +
    `&contractaddress=${token.address}&address=${NULL_ADDRESS}` +
    `&page=1&offset=1000&sort=desc&apikey=${encodeURIComponent(key)}`;

  const body = await getJson<{ status?: string; result?: TokenTx[] | string }>(url);
  // Etherscan answers errors with HTTP 200 and status "0", and puts the message where the
  // rows go — so a failure is indistinguishable from an empty result unless both are checked.
  if (!body || body.status !== "1" || !Array.isArray(body.result)) return [];

  const out: TimelineEvent[] = [];
  for (const tx of body.result) {
    const amount = toUnits(tx.value, token.decimals);
    if (amount < minimum) continue;

    const from = tx.from?.toLowerCase();
    const to = tx.to?.toLowerCase();
    const minted = from === NULL_ADDRESS;
    const burned = to === NULL_ADDRESS;
    if (!minted && !burned) continue; // neither direction touches supply

    const seconds = Number(tx.timeStamp);
    if (!Number.isFinite(seconds)) continue;

    const event = onchainEvent({
        date: dayFromEpoch(seconds),
        title: `${money(amount)} ${token.label} ${minted ? "minted" : "burned"}`,
        description: minted
          ? `New ${token.label} entered circulation in a single transaction — supply expanding, ` +
            `which usually tracks demand for dollars on-chain.`
          : `${token.label} was destroyed in a single transaction — supply contracting, usually ` +
            `a redemption back to dollars.`,
        url: `https://etherscan.io/tx/${tx.hash}`,
        // the transaction hash is the event's identity: re-running ingest updates, never duplicates
        ref: `eth-tx-${tx.hash}`,
        sourceLabel: "Ethereum transaction (Etherscan)",
        blockTime: seconds,
      });
    /**
     * The reason the finality policy exists. This feed reads transfers sorted newest-first, so
     * without the gate a mint minutes old would be published, and a reorg would leave a row that
     * cannot be deleted once anything cites it. Skipping rather than breaking: the list is
     * newest-first, so the too-new ones are all at the top and the settled ones follow.
     */
    if (!event) continue;
    out.push(event);
    if (out.length >= limit) break;
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** The Phase 0 entry point, kept so existing callers and checks are unaffected. */
export async function getUsdcSupplyMoves(
  minimum = USDC.materialUsd,
  limit = 40
): Promise<TimelineEvent[]> {
  return getStablecoinSupplyMoves(USDC, minimum, limit);
}

/**
 * Every covered stablecoin's supply moves, merged.
 *
 * One token failing costs only that token: a rate limit on the third request must not discard
 * the two that already answered, which `Promise.all` would do.
 */
export async function getAllStablecoinSupplyMoves(limit = 40): Promise<TimelineEvent[]> {
  const settled = await Promise.allSettled(
    STABLECOINS.map((t) => getStablecoinSupplyMoves(t, t.materialUsd, limit))
  );
  return settled
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .sort((a, b) => a.date.localeCompare(b.date));
}
