/**
 * Shared plumbing for the on-chain adapters.
 *
 * Everything here is failure-isolated the same way the news adapters are: a fetcher that
 * cannot reach its explorer returns nothing, and the page renders without it. On-chain data
 * is a supplement to a timeline, never a dependency of one.
 */
import type { TimelineEvent } from "../types";

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
 */
export function onchainEvent(e: {
  date: string;
  title: string;
  description: string;
  url: string;
  /** stable chain-level identity: `btc-block-840000`, `eth-tx-0x…` */
  ref: string;
  sourceLabel: string;
}): TimelineEvent {
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
