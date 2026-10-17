import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * What one anonymous client can make the site do.
 *
 *   npm run check:abuse
 *
 * NC-145: every not-indexed page view added one to a request and re-opened it, so a script
 * reloading junk URLs held the scheduler's slots for good. NC-162: no rate limit anywhere, and
 * /api/signals turned each request into up to five live Federal Register calls. NC-157: any
 * /topic/<words> URL could mint a permanent topic under the visitor's wording, with a branded
 * preview card repeating it.
 *
 * Offline: the limiter and the slug rules are pure, the middleware runs on constructed requests,
 * and the SQL is read as text. The queue's behaviour against a real Postgres is verified live and
 * recorded in docs/MASTER-CHECKLIST.md.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import {
  DistinctLimiter,
  FixedWindowLimiter,
  MAX_FR_TERMS,
  NEW_TERMS_PER_HOUR,
  REQUESTS_PER_MINUTE,
  clientKey,
  frFetchSince,
  normaliseTerms,
} from "../lib/rateLimit";
import { MAX_REQUEST_SLUG, ledgerSlugFor, requestKey } from "../lib/ingest/queue";
import { articleAnswersSlug, articleCoversSlug, topicSlugFromTitle } from "../lib/wiki";
import { middleware, config as middlewareConfig } from "../middleware";
import { jsonLdText } from "../components/JsonLd";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

console.log("\nA reloaded URL is one request, not a thousand (NC-145)");
{
  const queue = read("lib/ingest/queue.ts");
  check("a repeat ask counts again only after the interval", /\+ CASE WHEN subject_requests\.counted_at < now\(\) - \(\$5 \|\| ' minutes'\)::interval\s+THEN 1 ELSE 0 END/.test(queue));
  check("nothing is recorded or re-opened while the first pass has the target in back-off", /WHERE NOT EXISTS \(SELECT 1 FROM first_pass_attempts\s+WHERE slug = \$4 AND dead_until > now\(\)\)/.test(queue));
  check("  …and the scheduler waits that out too", /pendingRequests[\s\S]*?NOT EXISTS \(SELECT 1 FROM first_pass_attempts f[\s\S]*?f\.dead_until > now\(\)/.test(queue));
  check("a company request is looked up under its ledger name", ledgerSlugFor("company", "tsla") === "co:tsla" && ledgerSlugFor("topic", "bicycle") === "bicycle");
  check("  …matching the name the first pass writes", /const ledgerSlug = `co:\$\{query\.toLowerCase\(\)\}`/.test(read("lib/ingest/firstPass.ts")));
  check("an over-long slug is not stored", requestKey("x".repeat(MAX_REQUEST_SLUG + 1)) === null);
  check("  …a normal one is, normalised", requestKey("  Electric Cars ") === "electric cars");
  check("the refresh purges stale unfulfilled requests", /await purgeStaleRequests\(\)/.test(read("scripts/refresh.ts")));
  check("  …and only unfulfilled ones", /DELETE FROM subject_requests\s+WHERE fulfilled_at IS NULL/.test(queue));
  check("the counter has its own column", /ADD COLUMN IF NOT EXISTS counted_at/.test(read("db/024_request_counting.sql")));
}

console.log("\nA fixed window per client (NC-162)");
{
  const lim = new FixedWindowLimiter(3, 60_000);
  const t0 = 1_000_000;
  const used = [1, 2, 3].map((i) => lim.take("a", 1, t0 + i).allowed);
  check("the limit is allowed", used.every(Boolean));
  const over = lim.take("a", 1, t0 + 10);
  check("one past it is refused", !over.allowed);
  check("  …with how long to wait", over.retryAfterSeconds === 60, String(over.retryAfterSeconds));
  check("another client is unaffected", lim.take("b", 1, t0 + 10).allowed);
  check("the window resets", lim.take("a", 1, t0 + 60_001).allowed);
  const costly = new FixedWindowLimiter(5, 60_000);
  check("a cost that does not fit is refused", !costly.take("a", 6, t0).allowed);
  check("  …and spends nothing", costly.take("a", 5, t0).allowed);
  const small = new FixedWindowLimiter(1, 60_000, 50);
  for (let i = 0; i < 500; i++) small.take(`ip-${i}`, 1, t0 + i);
  check("tracked clients stay bounded", small.size <= 50, String(small.size));
}

console.log("\nFederal Register terms: new ones are what cost (NC-162)");
{
  const terms = new DistinctLimiter(3, 3_600_000);
  check("a client's terms are allowed", terms.take("a", ["tariffs", "export controls"], 0).allowed);
  check("asking for the same ones again is free", [1, 2, 3, 4, 5].every((i) => terms.take("a", ["tariffs", "export controls"], i).allowed));
  check("one more new term fits", terms.take("a", ["rare earth"], 10).allowed);
  check("cycling through fresh ones is refused", !terms.take("a", ["steel"], 11).allowed);
  check("…and resets with the window", terms.take("a", ["steel"], 3_600_001).allowed);
  check("case and spacing are one term", JSON.stringify(normaliseTerms("Export  Controls,export controls, TARIFFS")) === '["export controls","tariffs"]', JSON.stringify(normaliseTerms("Export  Controls,export controls, TARIFFS")));
  check("short and over-long terms are dropped", normaliseTerms(`ab,${"x".repeat(61)},steel`).join() === "steel");
  check(`at most ${MAX_FR_TERMS} per request`, normaliseTerms("aaa,bbb,ccc,ddd,eee,fff,ggg").length === MAX_FR_TERMS);
  check("the fetch floor is fixed, not the visitor's lookback", frFetchSince(new Date("2026-10-17")) === "2006-01-01");
  const route = read("app/api/signals/route.ts");
  check("the signals route fetches from the fixed floor", /fetchRegulations\(t, frSince\)/.test(route) && !/fetchRegulations\(t, sinceStr\)/.test(route));
  check("  …and trims to the visitor's window after", /\.filter\(\(e\) => e\.date >= sinceStr\)/.test(route));
  check("  …with terms normalised the same way the middleware counts them", /const terms = normaliseTerms\(q\.get\("frTerms"\)\)/.test(route));
}

console.log("\nWho a request is counted against");
{
  const h = (o: Record<string, string>) => new Headers(o);
  check("the first forwarded hop", clientKey(h({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" })) === "203.0.113.9");
  check("else x-real-ip", clientKey(h({ "x-real-ip": "198.51.100.4" })) === "198.51.100.4");
  check("else what the host saw", clientKey(h({}), "192.0.2.1") === "192.0.2.1");
  check("else one shared bucket", clientKey(h({})) === "unknown");
}

console.log("\nThe middleware");
{
  const req = (path: string, ip: string) =>
    new NextRequest(`http://localhost${path}`, { headers: { "x-forwarded-for": ip } });
  let refused = -1;
  for (let i = 0; i <= REQUESTS_PER_MINUTE; i++) {
    if (middleware(req("/api/resolve?q=ford", "203.0.113.50")).status === 429) {
      refused = i;
      break;
    }
  }
  check(`request ${REQUESTS_PER_MINUTE + 1} in a minute is refused`, refused === REQUESTS_PER_MINUTE, String(refused));
  const res = middleware(req("/api/resolve?q=ford", "203.0.113.50"));
  check("  …as 429 with Retry-After", res.status === 429 && Number(res.headers.get("retry-after")) > 0);
  check("another client still gets through", middleware(req("/api/resolve?q=ford", "203.0.113.51")).status !== 429);

  const fresh = Array.from({ length: NEW_TERMS_PER_HOUR + 1 }, (_, i) => `term number ${i}`);
  let signalsRefused = -1;
  for (let i = 0; i < fresh.length; i++) {
    const r = middleware(req(`/api/signals?industry=sic-3711&frTerms=${encodeURIComponent(fresh[i])}`, "203.0.113.60"));
    if (r.status === 429) {
      signalsRefused = i;
      break;
    }
  }
  check(`new Federal Register term ${NEW_TERMS_PER_HOUR + 1} in an hour is refused`, signalsRefused === NEW_TERMS_PER_HOUR, String(signalsRefused));
  check(
    "a repeat of a term already used is not",
    middleware(req(`/api/signals?industry=sic-3711&frTerms=${encodeURIComponent(fresh[0])}`, "203.0.113.60")).status !== 429
  );
  check("it covers the API and /search", JSON.stringify(middlewareConfig.matcher) === '["/api/:path*","/search"]');
}

console.log("\nA typed URL does not become a topic under its own words (NC-157)");
{
  check("the reproduced case is refused", !articleCoversSlug("tesla files for bankruptcy", "History of Tesla, Inc."));
  check("  …though the looser test still calls it about Tesla — refresh of a held subject is unchanged", articleAnswersSlug("tesla files for bankruptcy", "History of Tesla, Inc."));
  check("electric cars still reaches Electric car", articleCoversSlug("electric cars", "Electric car"));
  check("telegraph still reaches Telegraphy", articleCoversSlug("telegraph", "Telegraphy"));
  check("a qualified query still reaches its subject", articleCoversSlug("nvidia earnings", "Nvidia"));
  check("the prompt-shaped slug still reaches its subject", articleCoversSlug("how-donald-trumps-presidency-affected", "Second presidency of Donald Trump"));
  check("one invented word is enough to refuse", !articleCoversSlug("ford fraud", "Ford Motor Company"));
  check("a new topic is named for its article", topicSlugFromTitle("History of the bicycle") === "bicycle" && topicSlugFromTitle("Electric car") === "electric car");
  check("  …keeping a name's own punctuation", topicSlugFromTitle("History of Tesla, Inc.") === "tesla, inc.", topicSlugFromTitle("History of Tesla, Inc."));
  const fp = read("lib/ingest/firstPass.ts");
  check("the first pass mints only on the strict test", /if \(!articleCoversSlug\(slug, wiki\.title\)\)/.test(fp) && !/articleAnswersSlug\(/.test(fp));
  check("  …under the article's name", /canonicalSlug: topicSlugFromTitle\(wiki\.title\)/.test(fp));
  const ingest = read("scripts/ingest.ts");
  check("the scheduler mints on the strict test, refreshes on the loose one", /\(existing \? articleAnswersSlug : articleCoversSlug\)\(topic, wiki\.title\)/.test(ingest));
  check("  …and names what it mints for the article", /canonicalSlug: topicSlugFromTitle\(wiki\.title\)/.test(ingest));
  check("a canonical slug another subject holds is not taken", /SELECT 1 FROM subjects WHERE slug = \$1`, \[s\.canonicalSlug\]/.test(read("lib/ingest/store.ts")));
  check("another phrasing redirects to the stored slug", /if \(data\.slug !== topic\.trim\(\)\.toLowerCase\(\)\) redirect\(subjectPath\("topic", data\.slug\)\)/.test(read("app/topic/[slug]/page.tsx")));
  for (const [route, param] of [["app/topic/[slug]/opengraph-image.tsx", "slug"], ["app/company/[ticker]/opengraph-image.tsx", "ticker"]] as const) {
    const src = read(route);
    check(`${route.split("/")[1]} card reads the stored name, not the URL`, /loadSubject\(/.test(src) && /OG_UNKNOWN/.test(src) && !new RegExp(`ogCard\\([^)]*params\\.${param}`).test(src) && !/titleFromSlug/.test(src));
  }
  const ind = read("app/industry/[slug]/opengraph-image.tsx");
  check("the sector card echoes a slug only when it is a SIC code and unconfirmed", /industry === undefined && \/\^sic-\\d\+\$\/i\.test\(slug\)/.test(ind));
}

console.log("\nBaseline hardening from the security review (NC-090)");
{
  const nextConfig = read("next.config.mjs");
  for (const h of ["Content-Security-Policy", "X-Frame-Options", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy", "Strict-Transport-Security"]) {
    check(`every response carries ${h}`, nextConfig.includes(`key: "${h}"`));
  }
  check("  …applied to every path", /source: "\/:path\*"/.test(nextConfig));
  check("the CSP forbids framing, <base> and plugins without touching scripts", /frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'/.test(nextConfig) && !/script-src/.test(nextConfig));
  const ld = jsonLdText({ name: "Acme</script><script>alert(1)</script> & Co" });
  check("stored text cannot close a JSON-LD block", !ld.includes("</script>") && !ld.includes("<script"), ld);
  check("  …and still parses to the same value", JSON.parse(ld).name === "Acme</script><script>alert(1)</script> & Co");
  check("a search is capped before the database sees it", /const query = q\.replace\(\/\\s\+\/g, " "\)\.trim\(\)\.slice\(0, MAX_QUERY\);/.test(read("lib/resolveSearch.ts")));
}

console.log(`\n${pass}/${pass + fail} checks passed\n`);
if (fail) process.exit(1);
