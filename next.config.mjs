/**
 * Baseline security headers on every response (NC-090).
 *
 * The CSP forbids framing, `<base>`, plugins and posting forms elsewhere, and — since NC-164 —
 * says where scripts may come from: this site, and the ad network's loader once one is configured
 * (`NEXT_PUBLIC_AD_SCRIPT_URL`, loaded only by components/AdScript.tsx). No other host's script
 * runs, so an injected `<script src>` or a compromised third party has no way in. `'unsafe-inline'`
 * stays because the App Router streams its payload in inline scripts and layout.tsx carries one;
 * development adds `'unsafe-eval'`, which Next's dev tooling needs.
 *
 * Connections are deliberately left open: a visitor's own model endpoint can be any host — Ollama on
 * localhost, OpenRouter, Groq — and the browser calls it directly. What guards their keys is that a
 * browser holding one never loads ads (lib/adGate.ts). When a network is chosen, the frame and
 * connect hosts it documents are added here with it.
 */
const adOrigin = (() => {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_AD_SCRIPT_URL ?? "");
    return url.protocol === "https:" ? url.origin : "";
  } catch {
    return "";
  }
})();
const scriptSrc = [
  "'self'",
  "'unsafe-inline'",
  ...(process.env.NODE_ENV === "production" ? [] : ["'unsafe-eval'"]),
  ...(adOrigin ? [adOrigin] : []),
].join(" ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: `frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'; script-src ${scriptSrc}`,
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
