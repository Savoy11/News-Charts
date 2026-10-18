/**
 * Request pacing for the scripts that walk a rate-limited host hundreds of times — so far
 * `npm run sync:tickers` against the SEC. The SEC allows 10 requests a second per client and, when
 * a client goes over, refuses it for several minutes rather than for one request.
 */

/**
 * A gate that lets one request start every `minIntervalMs`, however many workers are waiting on
 * it. A worker pool keeps slow responses from stalling the run; this keeps fast ones from turning
 * the pool into a burst the host counts against us.
 */
export function createPacer(minIntervalMs: number): () => Promise<void> {
  let nextAt = 0;
  return async () => {
    const now = Date.now();
    const at = Math.max(now, nextAt);
    nextAt = at + minIntervalMs;
    if (at > now) await new Promise((r) => setTimeout(r, at - now));
  };
}

/**
 * How long to wait before retry `attempt` (0-based) after a 429: from 30 seconds, doubling, at most
 * ten minutes. The SEC's refusal outlasts any short retry — the old single retry after two seconds
 * met the same block and dropped the registrant.
 */
export function backoffMs(attempt: number): number {
  return Math.min(30_000 * 2 ** attempt, 600_000);
}
