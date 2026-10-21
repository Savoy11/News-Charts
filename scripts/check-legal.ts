/**
 * The legal pages say what the code does (NC-124).
 *
 *   npm run check:legal
 *
 * A privacy page goes stale silently: a new feature stores something in the browser, or a
 * retention period changes, and the page keeps promising the old thing. So the numbers it states
 * are imported from the code that enforces them, and this check fails when the code writes a
 * browser-storage key the page does not list — or the page lists one nothing writes any more.
 * Offline: it reads source files and nothing else.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { BROWSER_STORAGE, LEGAL_DRAFT } from "../lib/legal";
import { ADS_OFF_FLAG } from "../lib/adGate";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}
const read = (p: string) => readFileSync(p, "utf8");

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.(ts|tsx)$/.test(name) && p !== join("lib", "legal.ts")) out.push(p);
  }
  return out;
}

console.log("\nEvery key this site writes to the browser is on the privacy page");
const code = ["lib", "components", "app"].flatMap((d) => sources(d)).map((p) => ({ p, s: read(p) }));
// A storage namespace is "news-charts:<name>:" — event names ("news-charts:prefs") have no trailing
// colon — plus the one session flag, which is a bare key.
const written = new Map<string, string>();
for (const { p, s } of code) {
  for (const m of s.matchAll(/news-charts:([a-z-]+):/g)) written.set(`news-charts:${m[1]}:`, p);
}
written.set(ADS_OFF_FLAG, "lib/adGate.ts");
const listed = new Set(BROWSER_STORAGE.map((b) => b.prefix));
const unlisted = [...written.keys()].filter((k) => !listed.has(k));
check("nothing stored that the page leaves out", unlisted.length === 0, unlisted.map((k) => `${k} (${written.get(k)})`).join(", "));
const stale = [...listed].filter((k) => !written.has(k));
check("  …and nothing listed that the site no longer stores", stale.length === 0, stale.join(", "));
check("  …each entry says what it holds and where", BROWSER_STORAGE.every((b) => b.what.length > 10 && /^(local|session)Storage$/.test(b.where)));

console.log("\nThe numbers come from the code that enforces them");
const privacy = read("app/legal/privacy/page.tsx");
check("the privacy page takes the search log's retention and cap from lib/searchLog.ts",
  /import \{[^}]*MAX_QUERY[^}]*SEARCH_LOG_RETENTION_DAYS[^}]*\} from "@\/lib\/searchLog"/.test(privacy));
check("  …and the request queue's retention from lib/ingest/queue.ts", /REQUEST_RETENTION_DAYS[^;]*from "@\/lib\/ingest\/queue"/.test(privacy));
check("  …with no day counts typed into the prose", !/\b\d+ days\b/.test(privacy.replace(/\{[A-Z_]+\} days/g, "")));
const searchLog = read("lib/searchLog.ts");
check("the purge defaults to that same constant", /purgeOldResolutions\(days = SEARCH_LOG_RETENTION_DAYS\)/.test(searchLog));
check("  …and its scheduled caller passes no number of its own",
  /purgeOldResolutions\(\)/.test(read("scripts/refresh.ts")) && !/purgeOldResolutions\(\d/.test(read("scripts/refresh.ts") + read("scripts/search-report.ts")));

console.log("\nDrafts say so, and are not indexed");
const pages = ["app/legal/terms/page.tsx", "app/legal/privacy/page.tsx", "app/legal/disclaimer/page.tsx"];
check("every legal page asks not to be indexed while it is a draft",
  pages.every((p) => /robots: LEGAL_DRAFT \? \{ index: false, follow: false \} : undefined/.test(read(p))));
check("  …and renders through the frame that carries the draft notice",
  pages.every((p) => /<LegalPage title=/.test(read(p))) && /\{LEGAL_DRAFT && \(/.test(read("components/LegalPage.tsx")));
check("  …and the sitemap leaves them out", !/legal/.test(read("app/sitemap.ts")));
console.log(`  (LEGAL_DRAFT is ${LEGAL_DRAFT})`);

console.log("\nReachable from every page");
const layout = read("app/layout.tsx");
check("the footer links all three", ["/legal/terms", "/legal/privacy", "/legal/disclaimer"].every((h) => layout.includes(`href="${h}"`)));
check("the terms make the disclaimer part of them", /href="\/legal\/disclaimer"/.test(read("app/legal/terms/page.tsx")));

console.log(`\n${pass}/${pass + fail} checks passed\n`);
if (fail) process.exit(1);
