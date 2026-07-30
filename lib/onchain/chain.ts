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
export async function getJson<T>(url: string): Promise<T | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers: UA, next: { revalidate: 86_400 } });
      if (res.ok) return (await res.json()) as T;
      // 4xx is a bad request, not a blip — retrying just burns the rate limit
      if (res.status >= 400 && res.status < 500) return null;
    } catch {
      /* network blip — fall through to the retry */
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
