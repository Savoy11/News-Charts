/**
 * Baseline security headers on every response (NC-090).
 *
 * The CSP here constrains only what cannot break the site: framing, `<base>`, plugins and where
 * forms may post. A script/connect policy is deliberately not set yet — visitors' own model
 * endpoints are arbitrary hosts, and the ad network that will load scripts is not chosen; that
 * policy belongs with the key-isolation decision in NC-164.
 */
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  // Ignored by browsers over plain http, so harmless in development.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
