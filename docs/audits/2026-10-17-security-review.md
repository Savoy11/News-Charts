# Security review — the accounts-free site (2026-10-17)

**Scope (NC-090):**
- every route a visitor can reach: `app/api/*`, `/search` and the page routes;
- the middleware;
- what the browser stores;
- every fetch the server makes on a visitor's behalf;
- the response headers;
- the dependency advisories.

The site has no accounts, so there is no session, no password and no per-user data on the server.
The question is what an anonymous visitor can make the site do, read or say.

**Method:** read the code on `main` after batch 6 (merge f5c0ebd), then fixed what was small and
in scope in batch 7. Each finding carries its ledger id. The checks that pin the fixes are in
`npm run check` (mostly `check:abuse`, `check:ai`, `check:links`, `check:api`).

## What a visitor can send, and what happens to it

| Entry point | Input | Handling | Verdict |
| --- | --- | --- | --- |
| `/api/resolve`, `/search` | `q` | Parameterised SQL. Now capped at 200 characters before the fuzzy match runs (it used to be capped only for the log). Logged without IP, user agent or cookie, and purged after 90 days. | Fixed here (cap) |
| `/api/signals` | industry, tickers (≤40), thresholds (clamped), `frTerms` | Parameterised SQL. Terms normalised, at most 5, fetched from one fixed date floor; at most 15 new terms per client per hour (NC-162). | OK |
| `/api/group` | tickers (≤40) | Parameterised, read-only, groups never stored. | OK |
| `/api/suggestions` | none | Cached 60 s. | OK |
| `/topic/<words>`, `/company/<x>` | path | A first visit runs one bounded, ledger-claimed gather. A topic is minted only when every distinctive word of the URL is in the article title; preview cards use stored names (NC-157). Demand is counted at most hourly per slug (NC-145). | OK |
| All of `/api/*` and `/search` | volume | 120 requests per client per minute, in memory, per instance (NC-162). | OK; needs a host limit too |

## What the site says on a visitor's screen

| Surface | Risk | State |
| --- | --- | --- |
| Event links | A stored `javascript:` link would run on click | Only http(s) is stored or rendered (NC-163). |
| AI explanations | A planted headline steering published text | Delimited prompts, validated replies, labelled as AI output (NC-153). |
| Preview images | Typed words rendered under the site's name | Built from stored names, with a generic card otherwise (NC-157). |
| JSON-LD blocks | A stored `</script>` in a name or domain (EDGAR, Wikipedia or Wikidata text) closing the block | `<`, `>` and `&` are now escaped (`components/JsonLd.tsx`). **Fixed here.** |
| React text | Injection via headlines | React escapes text. The only other raw HTML is a fixed inline script in `app/layout.tsx`. |

## What leaves the server on a visitor's behalf

- **Federal Register:** term-based only, never a URL, normalised and rate-limited. This is the
  only live fetch an anonymous request can cause.
- **First-visit gather:** Wikipedia, EDGAR and the Yahoo chart only (`check:ondemand` pins it),
  under an 8 s deadline, claimed through the attempt ledger, on its own two-connection pool.
- **Visitor-supplied URLs:** nothing. Visitor model endpoints and NYT/Guardian keys are used from
  the visitor's browser, never by the server, so they are not a server-side request-forgery path.

## Headers (fixed here)

`next.config.mjs` now sends the following on every response:
- `Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- a restrictive `Permissions-Policy`
- HSTS

The policy deliberately sets no `script-src`/`connect-src` yet, for two reasons:
- visitor model endpoints are arbitrary hosts;
- the ad network is not chosen.

A script policy belongs with NC-164.

## Still open

- **NC-164 — visitor keys and ad scripts.** AI and NYT/Guardian keys sit in `localStorage` on the
  origin that will load ad scripts. Any script on the page can read them. Before the first ad,
  either isolate key storage and key-using calls in a separate-origin frame, or keep ads off pages
  that hold keys, and add a script policy.
- **NC-166 — Next.js 14.2.35 advisories.** The App Router denial-of-service and cache-poisoning
  advisories apply to this site, and the fixes need 15.5.24 or later. Until the upgrade, put a CDN
  or WAF with request-size and rate limits in front.
- **Host controls.** The in-app limiter counts per instance and trusts the first
  `X-Forwarded-For` hop. The host must overwrite that header, and a host or WAF limit is the
  durable version (owner action, recorded in `docs/OWNER-ACTIONS.md`).
- **Soft 404s (NC-160)** are an indexing problem rather than a security one, listed for
  completeness.
