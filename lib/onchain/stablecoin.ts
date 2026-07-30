import { dayFromEpoch, getJson, onchainEvent } from "./chain";
import { NULL_ADDRESS, USDC, USDC_DECIMALS } from "./addresses";
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

/** Below this, a supply move is treasury housekeeping rather than a timeline event. */
export const MATERIAL_USDC = 100_000_000;

interface TokenTx {
  hash: string;
  timeStamp: string;
  from: string;
  to: string;
  value: string;
}

/** Token amounts are integer strings in base units; Number() on a 6-decimal USDC value is safe. */
function toUnits(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n / 10 ** USDC_DECIMALS : 0;
}

const money = (n: number): string =>
  n >= 1e9 ? `$${(n / 1e9).toFixed(2)}bn` : `$${Math.round(n / 1e6)}m`;

export async function getUsdcSupplyMoves(
  minimum = MATERIAL_USDC,
  limit = 40
): Promise<TimelineEvent[]> {
  const key = process.env.ETHERSCAN_API_KEY;
  if (!key) return [];

  const url =
    `${ETHERSCAN}?module=account&action=tokentx` +
    `&contractaddress=${USDC.address}&address=${NULL_ADDRESS}` +
    `&page=1&offset=1000&sort=desc&apikey=${encodeURIComponent(key)}`;

  const body = await getJson<{ status?: string; result?: TokenTx[] | string }>(url);
  // Etherscan answers errors with HTTP 200 and status "0", and puts the message where the
  // rows go — so a failure is indistinguishable from an empty result unless both are checked.
  if (!body || body.status !== "1" || !Array.isArray(body.result)) return [];

  const out: TimelineEvent[] = [];
  for (const tx of body.result) {
    const amount = toUnits(tx.value);
    if (amount < minimum) continue;

    const from = tx.from?.toLowerCase();
    const to = tx.to?.toLowerCase();
    const minted = from === NULL_ADDRESS;
    const burned = to === NULL_ADDRESS;
    if (!minted && !burned) continue; // neither direction touches supply

    const seconds = Number(tx.timeStamp);
    if (!Number.isFinite(seconds)) continue;

    out.push(
      onchainEvent({
        date: dayFromEpoch(seconds),
        title: `${money(amount)} USDC ${minted ? "minted" : "burned"}`,
        description: minted
          ? `New USDC entered circulation in a single transaction — supply expanding, which ` +
            `usually tracks demand for dollars on-chain.`
          : `USDC was destroyed in a single transaction — supply contracting, usually a ` +
            `redemption back to dollars.`,
        url: `https://etherscan.io/tx/${tx.hash}`,
        // the transaction hash is the event's identity: re-running ingest updates, never duplicates
        ref: `eth-tx-${tx.hash}`,
        sourceLabel: "Ethereum transaction (Etherscan)",
      })
    );
    if (out.length >= limit) break;
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
