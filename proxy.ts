import { NextResponse, type NextRequest } from "next/server";
import {
  DistinctLimiter,
  FixedWindowLimiter,
  NEW_TERMS_PER_HOUR,
  REQUESTS_PER_MINUTE,
  clientKey,
  normaliseTerms,
} from "./lib/rateLimit";

/**
 * Rate limits for the routes that cost something per call (NC-162) — the API, and `/search`,
 * which writes the search log. Pages are left alone: a held page is a database read, and a
 * first-visit gather has its own attempt ledger, cooldown and two-connection pool.
 *
 * Two budgets per client. Every request spends one of the first. A `/api/signals` request also
 * counts its Federal Register terms against the second — only terms the client has not already
 * used this hour, because a new term is what reaches another service on the visitor's behalf and
 * a repeat comes from the fetch cache. See lib/rateLimit.ts for what an in-memory limiter can and
 * cannot promise.
 *
 * Next 16 renamed middleware to proxy (`proxy.ts`, running on the Node runtime) and dropped
 * `req.ip`, which self-hosted Next never filled in anyway — the client comes from the forwarded
 * headers alone (NC-166).
 */
const requests = new FixedWindowLimiter(REQUESTS_PER_MINUTE, 60_000);
const newTerms = new DistinctLimiter(NEW_TERMS_PER_HOUR, 3_600_000);

function tooMany(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: "Too many requests — please wait a moment and try again." },
    { status: 429, headers: { "retry-after": String(retryAfterSeconds) } }
  );
}

export function proxy(req: NextRequest) {
  const key = clientKey(req.headers);
  const first = requests.take(key);
  if (!first.allowed) return tooMany(first.retryAfterSeconds);

  if (req.nextUrl.pathname === "/api/signals") {
    const terms = normaliseTerms(req.nextUrl.searchParams.get("frTerms"));
    if (terms.length) {
      const second = newTerms.take(key, terms);
      if (!second.allowed) return tooMany(second.retryAfterSeconds);
    }
  }
  return NextResponse.next();
}

export const config = { matcher: ["/api/:path*", "/search"] };
