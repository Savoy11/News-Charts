import type { SourceKey } from "../types";
import { dailyRequestsPerSubject } from "./refresh";

/**
 * What each source's free tier actually allows, and whether scheduled ingest fits inside it.
 *
 * The refresh windows in `refresh.ts` were chosen against these numbers, but nothing checked the
 * arithmetic afterwards — and the arithmetic is the whole point. A feed that goes quiet because
 * its daily budget was spent by lunchtime does not look rate limited on a page; it looks like a
 * source with nothing to say. That failure is invisible precisely where it matters most, which
 * is why this is a report rather than a comment.
 *
 * The limits are documented free-tier figures. Where a source publishes no number, `perDay` is
 * null and the report says "no published limit" rather than inventing headroom.
 */

export interface Quota {
  /** requests per day on the free tier, or null when the source publishes no figure */
  perDay: number | null;
  /** requests per second, where the source enforces a burst limit as well */
  perSecond?: number;
  note: string;
}

export const QUOTAS: Record<SourceKey, Quota> = {
  // ---- keyed feeds, where the cap is small enough to hit in an afternoon ----
  gnews: { perDay: 100, note: "free tier, 100 req/day — the tightest budget here" },
  newsdata: { perDay: 200, note: "free tier, 200 req/day" },
  currents: { perDay: 600, note: "free developer tier" },
  marketaux: { perDay: 100, note: "free tier, 100 req/day" },
  eodhd: { perDay: 20, note: "free tier is ~20 API calls/day and may exclude news entirely" },
  finnhub: { perDay: null, perSecond: 1, note: "60 req/min rather than a daily cap" },
  nyt: { perDay: 500, perSecond: 0.2, note: "500 req/day and 5 req/min — the per-minute limit bites first" },
  guardian: { perDay: 5000, note: "free developer key, 5,000 req/day" },

  // ---- keyless, but not free of obligation ----
  gdelt: { perDay: null, perSecond: 0.2, note: "~1 req/5s per IP; throttling arrives as HTTP 200 with a text body" },
  wikipedia: { perDay: null, note: "no hard cap; the User-Agent policy is the real obligation" },
  loc_chronam: { perDay: null, note: "no published cap, but 503s under load are routine" },
  sec_edgar: { perDay: null, perSecond: 10, note: "10 req/s, and a contact User-Agent is required" },
  federal_register: { perDay: null, note: "no published cap; generous in practice" },
  yahoo_finance: { perDay: null, note: "undocumented and unofficial — the licence question, not the quota, is the risk" },
  internet_archive: { perDay: null, note: "no published cap; be a good citizen" },
  snapshot: { perDay: null, note: "public GraphQL hub, no published cap" },
  defillama: { perDay: null, note: "open API, no published cap" },
  // Phase 0 uses the keyless explorers; ETHERSCAN_API_KEY only covers token supply moves.
  onchain: { perDay: 100_000, perSecond: 5, note: "Etherscan free tier: 5 req/s, 100k/day" },
};

export type Verdict = "ok" | "tight" | "over" | "unmetered";

export interface Projection {
  source: SourceKey;
  perSubjectPerDay: number;
  projectedPerDay: number;
  limit: number | null;
  /** fraction of the daily budget used, or null when there is no published budget */
  utilisation: number | null;
  verdict: Verdict;
}

/** Over 80% of a daily cap is "tight": one busy day or a retry storm takes it over. */
export const TIGHT_AT = 0.8;

/**
 * What scheduled ingest costs at a given number of tracked subjects.
 *
 * Deliberately a *floor*, not an estimate: it counts one request per source per refresh window
 * per subject and nothing else. Retries, the second page some adapters fetch, and any manual
 * run all sit on top. A projection that flatters the budget would be worse than none, so where
 * this says "tight" the real answer is probably "over".
 */
export function project(source: SourceKey, subjects: number): Projection {
  const perSubjectPerDay = dailyRequestsPerSubject(source);
  const projectedPerDay = Math.ceil(perSubjectPerDay * Math.max(0, subjects));
  const limit = QUOTAS[source].perDay;
  if (limit === null) {
    return { source, perSubjectPerDay, projectedPerDay, limit, utilisation: null, verdict: "unmetered" };
  }
  const utilisation = limit > 0 ? projectedPerDay / limit : Infinity;
  const verdict: Verdict = utilisation > 1 ? "over" : utilisation >= TIGHT_AT ? "tight" : "ok";
  return { source, perSubjectPerDay, projectedPerDay, limit, utilisation, verdict };
}

/**
 * How many subjects a source can carry before its free tier is spent.
 *
 * The number worth knowing before launch: it converts an abstract quota into "this feed covers
 * 25 subjects", which is the form the buy-or-drop decision actually takes.
 */
export function subjectCapacity(source: SourceKey): number | null {
  const limit = QUOTAS[source].perDay;
  if (limit === null) return null;
  const per = dailyRequestsPerSubject(source);
  return per > 0 ? Math.floor(limit / per) : null;
}

/** Sources whose free tier cannot carry the given subject count, tightest budget first. */
export function overBudget(subjects: number): Projection[] {
  return (Object.keys(QUOTAS) as SourceKey[])
    .map((s) => project(s, subjects))
    .filter((p) => p.verdict === "over" || p.verdict === "tight")
    .sort((a, b) => (b.utilisation ?? 0) - (a.utilisation ?? 0));
}
