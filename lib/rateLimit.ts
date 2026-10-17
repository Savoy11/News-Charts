/**
 * Per-client request limits for the routes that cost something to answer (NC-162).
 *
 * `/api/signals` turned each anonymous request into up to five live Federal Register calls, and
 * `/api/resolve` and `/search` write to the database on every call. With no limit anywhere, one
 * client could spend those on repeat — and a source that throttles this server's IP throttles the
 * scheduled ingest along with it.
 *
 * A fixed window per client, in memory. Deliberately simple, and it has two limits worth saying
 * out loud: it is per server instance (a deployment running several holds several counters), and
 * it trusts the first `x-forwarded-for` hop, which only the host's proxy can make honest. A host or
 * WAF rule is the durable answer; this is the floor that holds wherever the app runs.
 *
 * Runs in `proxy.ts` and imports nothing from Node, so it would run on either runtime.
 */

export interface Verdict {
  allowed: boolean;
  /** whole seconds until the window this client is in resets */
  retryAfterSeconds: number;
}

export class FixedWindowLimiter {
  private windows = new Map<string, { start: number; used: number }>();

  constructor(
    readonly limit: number,
    readonly windowMs: number,
    /** past this many tracked clients, expired windows are swept before a new one is added */
    private readonly maxKeys = 10_000
  ) {}

  /** Spend `cost` units for `key`; refused (and nothing spent) when that would pass the limit. */
  take(key: string, cost = 1, now = Date.now()): Verdict {
    let w = this.windows.get(key);
    if (!w || now - w.start >= this.windowMs) {
      if (!w && this.windows.size >= this.maxKeys) this.sweep(now);
      w = { start: now, used: 0 };
      this.windows.set(key, w);
    }
    const retryAfterSeconds = Math.max(1, Math.ceil((w.start + this.windowMs - now) / 1000));
    if (w.used + cost > this.limit) return { allowed: false, retryAfterSeconds };
    w.used += cost;
    return { allowed: true, retryAfterSeconds };
  }

  private sweep(now: number): void {
    for (const [k, w] of this.windows) if (now - w.start >= this.windowMs) this.windows.delete(k);
    // Every window still live: drop the oldest rather than grow without bound. A client forgotten
    // early gets a fresh window — the failure is a little leniency, never a refusal.
    if (this.windows.size >= this.maxKeys) {
      const oldest = this.windows.keys().next().value;
      if (oldest !== undefined) this.windows.delete(oldest);
    }
  }

  get size(): number {
    return this.windows.size;
  }
}

/**
 * A cap on how many *different* things a client may ask for in a window.
 *
 * For the Federal Register terms on `/api/signals`, what reaches the upstream service is a new
 * term — a repeat is answered from the fetch cache. Counting every request would refuse a visitor
 * for moving a slider (each move re-fetches with the same terms); counting distinct terms refuses
 * only the client cycling through fresh ones, which is the amplification.
 */
export class DistinctLimiter {
  private windows = new Map<string, { start: number; seen: Set<string> }>();

  constructor(
    readonly limit: number,
    readonly windowMs: number,
    private readonly maxKeys = 10_000
  ) {}

  take(key: string, items: string[], now = Date.now()): Verdict {
    let w = this.windows.get(key);
    if (!w || now - w.start >= this.windowMs) {
      if (!w && this.windows.size >= this.maxKeys) {
        for (const [k, x] of this.windows) if (now - x.start >= this.windowMs) this.windows.delete(k);
        if (this.windows.size >= this.maxKeys) {
          const oldest = this.windows.keys().next().value;
          if (oldest !== undefined) this.windows.delete(oldest);
        }
      }
      w = { start: now, seen: new Set() };
      this.windows.set(key, w);
    }
    const retryAfterSeconds = Math.max(1, Math.ceil((w.start + this.windowMs - now) / 1000));
    const fresh = items.filter((i) => !w!.seen.has(i));
    if (w.seen.size + fresh.length > this.limit) return { allowed: false, retryAfterSeconds };
    for (const i of fresh) w.seen.add(i);
    return { allowed: true, retryAfterSeconds };
  }
}

/**
 * The client a request is counted against: the first forwarded hop, else `x-real-ip`. Next's own
 * server sets `x-forwarded-for` to the socket address when a request arrives without one, so a
 * direct visitor is counted by their own address; "unknown" is only reached outside it.
 */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}

/** How many Federal Register terms `/api/signals` will fetch for one request. */
export const MAX_FR_TERMS = 5;

/**
 * Visitor-supplied Federal Register terms, normalised before they reach a fetch.
 *
 * Case and spacing variants were separate cache entries and separate upstream calls; now
 * "Export Controls" and "export  controls" are one. Short, long, and duplicate terms are dropped.
 */
export function normaliseTerms(raw: string | null): string[] {
  const out: string[] = [];
  for (const part of (raw ?? "").split(",")) {
    const t = part.replace(/\s+/g, " ").trim().toLowerCase();
    if (t.length < 3 || t.length > 60 || out.includes(t)) continue;
    out.push(t);
    if (out.length >= MAX_FR_TERMS) break;
  }
  return out;
}

/**
 * The publication-date floor every live Federal Register fetch uses.
 *
 * The route used to pass the visitor's own window start, so each lookback setting was a different
 * URL — a different cache entry and another upstream call for the same term. Results come back
 * newest first, so fetching from the widest window the route allows (240 months) and filtering
 * afterwards returns exactly the same events; the URL now changes once a year.
 */
export function frFetchSince(now = new Date()): string {
  return `${now.getUTCFullYear() - 20}-01-01`;
}

/** Ordinary requests to a limited route: this many per client per minute. */
export const REQUESTS_PER_MINUTE = 120;
/** Different Federal Register terms a client may have fetched live: this many per hour. */
export const NEW_TERMS_PER_HOUR = 15;
