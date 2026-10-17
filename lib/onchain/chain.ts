/**
 * Shared plumbing for the on-chain adapters.
 *
 * Everything here is failure-isolated the same way the news adapters are: a fetcher that
 * cannot reach its explorer returns nothing, and the page renders without it. On-chain data
 * is a supplement to a timeline, never a dependency of one.
 */
import type { TimelineEvent } from "../types";
import { chainOfRef, isFinal } from "./finality";

const UA = { "User-Agent": "News Charts Research marcusowens94@gmail.com" };

/** Explorers rate-limit modestly and we ask for very little; one retry is plenty. */
/**
 * Etherscan's V2 multichain API, pinned to Ethereum mainnet. Append `&module=…` to it.
 *
 * V1 (`api.etherscan.io/api`) was retired in 2025: it now answers every call with status "0" and
 * "You are using a deprecated V1 endpoint", confirmed live 2026-09-28. Both supply feeds were
 * built on it, so every stablecoin and USDT timeline had been empty since (NC-054).
 */
export const ETHERSCAN_API = "https://api.etherscan.io/v2/api?chainid=1";

/**
 * Retry timing for the explorers, exposed so the offline checks can run it at zero.
 *
 * A blip used to get one immediate retry, which against a rate limit is the same request again
 * inside the same second (NC-055). Now a 429, a 5xx or a dropped connection waits — 1s, then 2s —
 * and `PAGE_GAP_MS` spaces out the pages of a multi-page read, so a backfill stays under
 * Etherscan's five calls a second instead of tripping it on page two.
 */
export const RETRY = { attempts: 3, baseMs: 1000, pageGapMs: 250 };

export const sleep = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();

export async function getJson<T>(url: string): Promise<T | null> {
  for (let attempt = 0; attempt < RETRY.attempts; attempt++) {
    if (attempt > 0) await sleep(RETRY.baseMs * 2 ** (attempt - 1));
    try {
      const res = await fetch(url, { headers: UA, next: { revalidate: 86_400 } });
      if (res.ok) return (await res.json()) as T;
      // Any other 4xx is a bad request, not a blip — retrying just burns the rate limit. A 429 is
      // the one 4xx that means "later".
      if (res.status >= 400 && res.status < 500 && res.status !== 429) return null;
    } catch {
      /* network blip — wait and retry */
    }
  }
  return null;
}

export async function getText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: UA, next: { revalidate: 86_400 } });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

export const dayFromEpoch = (seconds: number): string =>
  new Date(seconds * 1000).toISOString().slice(0, 10);

/**
 * An on-chain event's identity is the thing on the chain, not our description of it — a block
 * height, a transaction hash. Two ingests of the same halving must produce one row, and they
 * do because the basis never mentions a title we might later reword.
 *
 * **Returns null for a block that is not yet final**, and that is why `blockTime` is required
 * rather than optional. An on-chain row cannot be retracted once a synthesis cites it
 * (`ON DELETE RESTRICT`), so an event orphaned by a reorg would be a permanent claim about
 * something that did not happen. Making the timestamp mandatory means a new adapter cannot skip
 * the check by forgetting it existed — the type system asks, every time.
 */
export function onchainEvent(e: {
  date: string;
  title: string;
  description: string;
  url: string;
  /** stable chain-level identity: `btc-block-840000`, `eth-tx-0x…` */
  ref: string;
  sourceLabel: string;
  /** epoch seconds of the block this event is in — judged against the chain's finality rule */
  blockTime: number;
}): TimelineEvent | null {
  if (!isFinal(chainOfRef(e.ref), e.blockTime)) return null;
  return {
    id: `onchain-${e.ref}`,
    date: e.date,
    type: "onchain",
    title: e.title,
    description: e.description,
    url: e.url,
    source: e.sourceLabel,
    sourceKey: "onchain",
    externalId: e.ref,
    dedupBasis: e.ref,
  };
}
