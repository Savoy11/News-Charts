/**
 * Proves the framework upgrade holds (NC-166).
 *
 *   npm run check:framework
 *
 * Next 14.2.35 carried 24 advisories (`npm audit`, rated critical), among them App Router
 * denial-of-service and cache-poisoning advisories that apply to this site. Fixing them took two
 * major versions, and every way that fix could quietly come undone is visible in the files:
 *
 * - package.json or the lockfile drifting back below the version that audited clean;
 * - `middleware.ts` reappearing. Next 16 runs `proxy.ts`; with both present the build fails, and
 *   with only the old name the rate limits run on a deprecated path;
 * - a page reading `params` or `searchParams` as a plain object. In Next 16 they are Promises, so
 *   `params.slug` is `undefined` at runtime, while a hand-written `{ slug: string }` type still
 *   typechecks;
 * - `next lint`, which Next 16 removed, coming back as the lint script.
 *
 * Offline: it reads files and nothing else.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** The version that `npm audit --omit=dev` reported clean on 2026-10-17. */
export const NEXT_FLOOR = "16.4.2";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail && !ok ? " — " + detail : ""}`);
}

const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const installed = (pkg: string): string | null => {
  const path = join("node_modules", pkg, "package.json");
  return existsSync(path) ? readJson(path).version : null;
};

/** -1, 0 or 1, comparing plain x.y.z versions. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0) ? -1 : 1;
  }
  return 0;
}

const pkg = readJson("package.json");
const lock = readJson("package-lock.json");
const pin: string = pkg.dependencies?.next ?? "";

console.log("\nThe Next.js version");
check("package.json pins next to an exact version", /^\d+\.\d+\.\d+$/.test(pin), `found "${pin}"`);
check(`…no older than ${NEXT_FLOOR}`, /^\d+\.\d+\.\d+$/.test(pin) && compareVersions(pin, NEXT_FLOOR) >= 0, `found "${pin}"`);
check("the lockfile resolves the same version", lock.packages?.["node_modules/next"]?.version === pin,
  `lockfile has ${lock.packages?.["node_modules/next"]?.version}`);
check("the installed copy is that version", installed("next") === pin, `installed ${installed("next")}`);
check("eslint-config-next is pinned to the same version", pkg.devDependencies?.["eslint-config-next"] === pin,
  `found "${pkg.devDependencies?.["eslint-config-next"]}"`);
const react = installed("react");
check("React 19 is installed, with react-dom at the same version",
  !!react && react.startsWith("19.") && installed("react-dom") === react,
  `react ${react}, react-dom ${installed("react-dom")}`);

console.log("\nThe proxy (Next 16's name for middleware)");
check("proxy.ts exists", existsSync("proxy.ts"));
check("…and exports `proxy`", existsSync("proxy.ts") && /export function proxy\(/.test(readFileSync("proxy.ts", "utf8")));
check("middleware.ts is gone", !existsSync("middleware.ts"));

console.log("\nRoute params are awaited");
/** Source with comments removed, so prose like "never params.slug" is not read as code. */
const code = (path: string) =>
  readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return filesUnder(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}
const routeFiles = filesUnder("app");
const plainType = routeFiles.filter((f) => /\b(params|searchParams)\s*:\s*\{/.test(code(f)));
check("no route types params or searchParams as a plain object", plainType.length === 0, plainType.join(", "));
const syncRead = routeFiles.filter((f) => /\bparams\.\w/.test(code(f)));
check("no route reads params.<name> without awaiting it", syncRead.length === 0, syncRead.join(", "));
check("the scan saw the dynamic routes", routeFiles.filter((f) => f.includes("[")).length >= 7,
  `${routeFiles.filter((f) => f.includes("[")).length} files under dynamic segments`);

console.log("\nLint");
check("the lint script is not `next lint` (removed in Next 16)", !/\bnext lint\b/.test(pkg.scripts?.lint ?? ""),
  `found "${pkg.scripts?.lint}"`);
check("eslint.config.mjs replaces .eslintrc.json", existsSync("eslint.config.mjs") && !existsSync(".eslintrc.json"));

console.log(`\n${pass}/${pass + fail} checks passed\n`);
if (fail) process.exit(1);
