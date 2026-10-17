/**
 * Third-party links are only ever http(s) — at ingest and at render (NC-163).
 *
 *   npm run check:links
 *
 * Feed links are stored as the feed gave them and React 18 still renders a `javascript:` href,
 * so one hostile feed item would run script on the origin that keeps visitors' API keys. This
 * checks the rule itself, and then reads every component and page to make sure no link to a
 * stored or fetched URL bypasses it — the failure here is a new component written the old way,
 * which no rendered page would reveal until someone clicked the wrong headline.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { safeHref } from "../lib/safeUrl";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

console.log("\nReal links pass through unchanged");
for (const url of [
  "https://www.reuters.com/business/ford-recalls-2024-05-02/",
  "http://www.loc.gov/resource/sn83045462/1903-06-17/ed-1/?sp=4",
  "https://web.archive.org/web/20190402/ford.com",
  "https://example.com/a%20b?q=1#frag",
]) {
  check(url.slice(0, 60), safeHref(url) === url, String(safeHref(url)));
}

console.log("\nEverything else is not a link");
for (const [label, url] of [
  ["javascript:", "javascript:alert(document.cookie)"],
  ["upper-case scheme", "JavaScript:alert(1)"],
  ["leading space", " javascript:alert(1)"],
  ["newline inside the scheme", "java\nscript:alert(1)"],
  ["tab inside the scheme", "java\tscript:alert(1)"],
  ["data: URL", "data:text/html,<script>alert(1)</script>"],
  ["vbscript:", "vbscript:msgbox(1)"],
  ["file:", "file:///etc/passwd"],
  ["relative path", "/company/AAPL"],
  ["bare text", "not a url"],
  ["empty string", ""],
] as const) {
  check(label, safeHref(url) === undefined, String(safeHref(url)));
}
check("null", safeHref(null) === undefined);
check("undefined", safeHref(undefined) === undefined);

console.log("\nNo component links a stored URL without the check");
// `href={ev.url}`, `href={cur.url ?? "#"}`, `href={c.url}` — any href built from a `.url`
// property that does not pass through safeHref. Our own links (`href={`/company/…`}`,
// `href={s.href}`) are not URLs from a feed and do not match.
const RAW_URL_HREF = /href=\{(?![^}]*safeHref)[^}]*\.url\b[^}]*\}/g;
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}
const files = [...walk("components"), ...walk("app")];
const offenders = files.flatMap((file) =>
  [...readFileSync(file, "utf8").matchAll(RAW_URL_HREF)].map((m) => `${file}: ${m[0]}`)
);
check(`${files.length} files scanned, none renders a raw .url href`, offenders.length === 0, offenders.join("; "));
check(
  "the scan does catch the old pattern",
  ['href={ev.url}', 'href={cur.url ?? "#"}', "href={c.url}"].every((s) => s.match(RAW_URL_HREF)) &&
    !"href={safeHref(ev.url)}".match(RAW_URL_HREF)
);

console.log("\nIngest stores only what render would link");
const store = readFileSync("lib/ingest/store.ts", "utf8");
check("upsertEvent derives the stored url through safeHref", /const url = safeHref\(ev\.url\)/.test(store));
check("  …and the attestation stores that, not the raw feed link", !/ev\.url \?\? null, ev\.source/.test(store));

console.log(`\n${pass}/${pass + fail} checks passed\n`);
if (fail) process.exit(1);
