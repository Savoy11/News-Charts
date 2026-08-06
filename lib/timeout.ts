/**
 * A budget for work that reaches the network on a visitor's request.
 *
 * `/api/resolve` is the last read path that still fetches while someone waits: it asks the SEC
 * ticker index whether a query is a company, and Wikipedia whether the other side of a relational
 * question is drawable. Neither has a timeout of its own, and the search box awaited both with
 * none either — so a throttled EDGAR (which is what happens after a few `npm run refresh` runs,
 * since it rate-limits by User-Agent) left the button spinning with nothing on screen to explain
 * it.
 *
 * A bounded answer is the point. "We could not reach the ticker index in three seconds" is a
 * result a page can act on; an unbounded await is not a result at all.
 */

/** Returned instead of a value when the work did not finish inside its budget. */
export const TIMED_OUT = Symbol("timed-out");

export type Timed<T> = T | typeof TIMED_OUT;

export function timedOut<T>(value: Timed<T>): value is typeof TIMED_OUT {
  return value === TIMED_OUT;
}

/**
 * Run `work` with a deadline, resolving to `TIMED_OUT` if it misses it.
 *
 * A distinct sentinel rather than `null`, because the two mean different things and the whole
 * point is to tell them apart: EDGAR answering "no such ticker" is knowledge, and EDGAR not
 * answering is not. Collapsing them is what let a real ticker be recorded as an assumed topic.
 *
 * The underlying promise is not cancelled — `resolveCompany` has no abort hook and inventing one
 * is a bigger change than this. It is abandoned instead: its result is ignored, and its rejection
 * is swallowed so an unhandled rejection cannot take the process down after the fact.
 */
export function withTimeout<T>(work: Promise<T>, ms: number): Promise<Timed<T>> {
  return new Promise<Timed<T>>((resolve) => {
    const timer = setTimeout(() => resolve(TIMED_OUT), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        // A rejection is not a timeout: the caller wanted a value and there is none. It resolves
        // as TIMED_OUT too, since every caller here treats "no answer" the same way — and a
        // thrown probe must never take down a search.
        clearTimeout(timer);
        resolve(TIMED_OUT);
      }
    );
  });
}

/**
 * How long a visitor's search may spend waiting on somebody else's server.
 *
 * Three seconds is long enough for a healthy EDGAR round trip (typically well under one) and
 * short enough that a throttled one is a brief pause rather than an apparently broken page.
 */
export const NETWORK_BUDGET_MS = 3_000;

/**
 * The browser's own budget, deliberately longer than the server's.
 *
 * The server is bounded twice over — the company probe and the drawable probe each get
 * `NETWORK_BUDGET_MS` — so a client that gave up sooner would abandon a request that was about
 * to succeed and report a failure the server never had.
 */
export const CLIENT_BUDGET_MS = 10_000;
