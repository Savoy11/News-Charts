import { ETHERSCAN_API, getJson, onchainEvent } from "./chain";
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
 * which the build container does not have.** `npm run check:onchain` pins the parsing and the
 * paging; the owner's live run is the confirmation.
 */

export const ISSUE_TOPIC = topicFor("Issue(uint256)");
export const REDEEM_TOPIC = topicFor("Redeem(uint256)");

interface EtherscanLog {
  topics?: string[];
  /** the amount, ABI-encoded as a single uint256 word */
  data?: string;
  /** hex, seconds */
  timeStamp?: string;
  transactionHash?: string;
  /** hex */
  blockNumber?: string;
  /** hex, position within the block */
  logIndex?: string;
}

/** Etherscan's getLogs page size, which is also its ceiling. */
export const LOGS_PAGE = 1000;
/** Pages read per event type before giving up and reporting the read as incomplete. */
export const MAX_LOG_PAGES = 20;

/**
 * Every log for one topic, oldest to newest, paged forward by block.
 *
 * getLogs returns at most 1,000 rows in ascending block order and takes no sort. The adapter used
 * to ask once from block 0, so once Tether had issued more than 1,000 times it read the oldest
 * thousand and never saw a recent mint (NC-056). Paging by block rather than by `page` keeps
 * every request a fresh 1,000-row window: the next one starts at the last block seen (again,
 * since a block's logs can straddle the cut), and rows already read are skipped by identity.
 */
async function readAllLogs(
  topic: string,
  key: string
): Promise<{ logs: EtherscanLog[]; failure: string | null }> {
  const logs: EtherscanLog[] = [];
  const seen = new Set<string>();
  let fromBlock = 0;
  for (let page = 0; page < MAX_LOG_PAGES; page++) {
    const url =
      `${ETHERSCAN_API}&module=logs&action=getLogs&address=${USDT.address}` +
      `&topic0=${topic}&fromBlock=${fromBlock}&toBlock=latest&page=1&offset=${LOGS_PAGE}` +
      `&apikey=${encodeURIComponent(key)}`;
    const body = await getJson<{ status?: string; message?: string; result?: EtherscanLog[] | string }>(url);
    // Etherscan answers errors with HTTP 200 and status "0", putting the message where the rows
    // go — so a failure reads as an empty result unless both are checked.
    if (!body) return { logs, failure: "Etherscan did not answer" };
    if (body.status !== "1" || !Array.isArray(body.result)) {
      if (body.message === "No records found") return { logs, failure: null };
      const said = typeof body.result === "string" ? body.result : (body.message ?? "unexpected reply");
      return { logs, failure: said.slice(0, 200) };
    }
    for (const log of body.result) {
      const id = `${log.transactionHash}:${log.logIndex}`;
      if (seen.has(id)) continue;
      seen.add(id);
      logs.push(log);
    }
    if (body.result.length < LOGS_PAGE) return { logs, failure: null };
    const last = Number(body.result[body.result.length - 1]?.blockNumber);
    if (!Number.isFinite(last)) return { logs, failure: "a full page with no readable block number" };
    // A full page inside a single block would ask the same window for ever; step past it.
    fromBlock = last > fromBlock ? last : fromBlock + 1;
  }
  return { logs, failure: `more than ${MAX_LOG_PAGES * LOGS_PAGE} logs — read stopped early` };
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
  // Unreadable without a key — logged as such, not as a quiet month (NC-142).
  if (!key) return { events: [], outcome: "error", detail: "ETHERSCAN_API_KEY is not set" };

  const events: TimelineEvent[] = [];
  const failures: string[] = [];
  for (const [topic, verb] of [
    [ISSUE_TOPIC, "minted"],
    [REDEEM_TOPIC, "burned"],
  ] as const) {
    const { logs, failure } = await readAllLogs(topic, key);
    if (failure) failures.push(`${verb === "minted" ? "Issue" : "Redeem"}: ${failure}`);

    for (const log of logs) {
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
    }
  }
  // The newest material moves, the same choice the transfer reader makes with sort=desc.
  events.sort((a, b) => a.date.localeCompare(b.date));
  const kept = events.slice(-limit);
  // A read that stopped part-way is not a quiet month; what was read is still kept.
  if (failures.length) {
    const throttled = failures.every((f) => /rate limit/i.test(f));
    return { events: kept, outcome: throttled ? "throttled" : "error", detail: failures.join("; ").slice(0, 300) };
  }
  return { events: kept, outcome: kept.length ? "ok" : "empty", httpStatus: 200 };
}

export async function getUsdtSupplyMoves(): Promise<TimelineEvent[]> {
  return (await fetchUsdtSupplyMoves()).events;
}
