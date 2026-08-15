import { getJson, onchainEvent } from "./chain";
import { USDT } from "./addresses";
import { topicFor } from "./keccak";
import type { FetchResult, TimelineEvent } from "../types";

/**
 * USDT supply moves, read from Tether's own `Issue` and `Redeem` events.
 *
 * The second code path the stablecoin table could not have: Tether does not mint through the
 * null address. `issue()` credits the treasury balance directly and emits `Issue(uint256)`;
 * `redeem()` emits `Redeem(uint256)`. Pointing the transfer reader at this contract returns
 * nothing at all — which on a page is indistinguishable from "no material mints this month",
 * so it was left out of that table rather than shipped as a row that quietly returns zero.
 *
 * The topics are **derived, not copied**. A wrong 32-byte hash matches no logs and produces
 * exactly the silent emptiness this exists to avoid, so `keccak256` computes them from the
 * signature and is itself pinned against published digests.
 *
 * ⚠ **Still unverified live, and for a reason that has not changed: this needs `ETHERSCAN_API_KEY`,
 * which the build container does not have.** (Egress itself is open as of 2026-08-12 — several
 * adapters were exercised that day — so the key is the whole blocker here, and saying so is more
 * use than the blanket claim it replaces.) `npm run check:onchain` pins the parsing.
 */

const ETHERSCAN = "https://api.etherscan.io/api";

export const ISSUE_TOPIC = topicFor("Issue(uint256)");
export const REDEEM_TOPIC = topicFor("Redeem(uint256)");

interface EtherscanLog {
  topics?: string[];
  /** the amount, ABI-encoded as a single uint256 word */
  data?: string;
  /** hex, seconds */
  timeStamp?: string;
  transactionHash?: string;
}

/** A uint256 word of base units. BigInt because 18-decimal amounts exceed exact float range. */
export function amountFromData(data: string | undefined, decimals: number): number | null {
  if (!data || !/^0x[0-9a-fA-F]+$/.test(data)) return null;
  try {
    const raw = BigInt(data);
    if (raw <= BigInt(0)) return null;
    // Divide in BigInt first, keep the remainder as a fraction — converting the raw value to a
    // Number before dividing loses precision above 2^53 and silently misreports large mints.
    const scale = BigInt(10) ** BigInt(decimals);
    return Number(raw / scale) + Number(raw % scale) / Number(scale);
  } catch {
    return null;
  }
}

const money = (n: number): string =>
  n >= 1e9 ? `$${(n / 1e9).toFixed(2)}bn` : `$${Math.round(n / 1e6)}m`;

const dayFromEpoch = (seconds: number): string =>
  new Date(seconds * 1000).toISOString().slice(0, 10);

export async function fetchUsdtSupplyMoves(
  minimum = USDT.materialUsd,
  limit = 40
): Promise<FetchResult> {
  const key = process.env.ETHERSCAN_API_KEY;
  if (!key) return { events: [], outcome: "empty", detail: "no ETHERSCAN_API_KEY" };

  const events: TimelineEvent[] = [];
  for (const [topic, verb] of [
    [ISSUE_TOPIC, "minted"],
    [REDEEM_TOPIC, "burned"],
  ] as const) {
    const url =
      `${ETHERSCAN}?module=logs&action=getLogs&address=${USDT.address}` +
      `&topic0=${topic}&fromBlock=0&toBlock=latest&page=1&offset=1000` +
      `&apikey=${encodeURIComponent(key)}`;

    const body = await getJson<{ status?: string; result?: EtherscanLog[] | string }>(url);
    // Etherscan answers errors with HTTP 200 and status "0", putting the message where the rows
    // go — so a failure reads as an empty result unless both are checked.
    if (!body || body.status !== "1" || !Array.isArray(body.result)) continue;

    for (const log of body.result) {
      if (log.topics?.[0]?.toLowerCase() !== topic.toLowerCase()) continue;
      const amount = amountFromData(log.data, USDT.decimals);
      if (amount === null || amount < minimum) continue;
      const seconds = Number(log.timeStamp);
      if (!Number.isFinite(seconds) || seconds <= 0) continue;
      const hash = log.transactionHash;
      if (!hash) continue;

      const event = onchainEvent({
        date: dayFromEpoch(seconds),
        title: `${money(amount)} USDT ${verb}`,
        description:
          verb === "minted"
            ? `Tether issued new USDT in a single transaction. Issuance is authorised by Tether ` +
              `rather than by a contract anyone can call, so this records the act, not a redemption.`
            : `Tether redeemed USDT out of circulation in a single transaction.`,
        url: `https://etherscan.io/tx/${hash}`,
        ref: `eth-tx-${hash}`,
        sourceLabel: "Ethereum transaction (Etherscan)",
        blockTime: seconds,
      });
      // withheld by the finality gate when the block has not settled
      if (event) events.push(event);
      if (events.length >= limit) break;
    }
  }
  events.sort((a, b) => a.date.localeCompare(b.date));
  return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200 };
}

export async function getUsdtSupplyMoves(): Promise<TimelineEvent[]> {
  return (await fetchUsdtSupplyMoves()).events;
}
