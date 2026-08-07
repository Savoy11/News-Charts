/**
 * The bounds on first-visit ingest — that the render path stays a bounded, keyless,
 * database-gated fetch and can never regress into per-view fetching.
 *
 *   npm run check:ondemand
 *
 * Commit 813d505 removed live fetching from the render path; lib/ingest/firstPass.ts returns
 * a deliberately bounded slice of it. Nothing else in the check chain asserts those bounds, so
 * nothing else would catch the quiet regression — a keyed source slipping into the first pass,
 * or a fetch happening when the database (whose ledger is the permission slip) is down.
 *
 * Offline by construction: fetch is replaced, DATABASE_URL points at a closed port, and the
 * rest is import graphs and pure functions. What this deliberately CANNOT prove is that the
 * Postgres advisory lock excludes two OS processes — that is a live, two-terminal
 * verification, recorded as such in docs/MASTER-CHECKLIST.md rather than implied here.
 */

import { readFileSync } from "node:fs";
import * as path from "node:path";
import { QUOTAS } from "../lib/ingest/quota";
import type { SourceKey } from "../lib/types";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = ""): void => {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};

async function main(): Promise<void> {
  console.log("\nThe first pass reaches only unmetered sources");
  // Imported AFTER env mangling below would be too late for pool config, but constants are safe.
  const { FIRST_PASS_SOURCES, FIRST_PASS_BUDGET_MS, ATTEMPT_COOLDOWN_MINUTES } = await import(
    "../lib/ingest/firstPass"
  );
  for (const key of FIRST_PASS_SOURCES) {
    const quota = QUOTAS[key as SourceKey];
    check(
      `${key} carries no daily cap a traffic spike could drain`,
      quota !== undefined && quota.perDay === null,
      `perDay=${quota?.perDay}`
    );
  }

  console.log("\n...and its import graph cannot reach a keyed or slow source");
  // The keyed aggregators live in newsExtra; the slow sources (GDELT sleeps 5.5s twice when
  // throttled, Chronicling America 4s, Internet Archive) have no place on a visitor's clock.
  const src = readFileSync(path.join(__dirname, "../lib/ingest/firstPass.ts"), "utf8");
  for (const banned of ["newsExtra", "../news", "./news\"", "../loc", "../archive", "federalregister", "onchain"]) {
    check(`firstPass never imports ${banned.replace(/["\\]/g, "")}`, !src.includes(`from "${banned}`));
  }
  check("firstPass imports the wiki, sec and prices tiers only", ["../wiki", "../sec", "../prices"].every((m) => src.includes(`from "${m}"`)));

  console.log("\nA database outage means zero fetches — permission to fetch is a database write");
  process.env.DATABASE_URL = "postgresql://nobody:nothing@127.0.0.1:59999/absent";
  const attempted: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: unknown) => {
    attempted.push(String(input));
    return { ok: true, status: 200, json: async () => ({}), text: async () => "" } as unknown as Response;
  }) as typeof fetch;
  try {
    const { firstPassTopic, firstPassCompany } = await import("../lib/ingest/firstPass");
    const t = await firstPassTopic("bicycle");
    check("topic pass reports unavailable", t === "unavailable", t);
    const c = await firstPassCompany("AAPL");
    check("company pass reports unavailable", c === "unavailable", c);
    check("no fetch was attempted by either", attempted.length === 0, attempted[0]?.slice(0, 80) ?? "");
  } finally {
    globalThis.fetch = realFetch;
  }

  console.log("\nThe numbers are the ones we chose");
  check("the visitor's wait is bounded", FIRST_PASS_BUDGET_MS <= 10_000, `${FIRST_PASS_BUDGET_MS}ms`);
  check(
    "an unresolvable slug retries at most 4×/day",
    ATTEMPT_COOLDOWN_MINUTES >= 360,
    `${ATTEMPT_COOLDOWN_MINUTES}min cooldown`
  );
  // The dedicated pool must shed, not queue: pg-pool's default is NO connect timeout.
  check("the ingest pool sheds load instead of queueing", /connectionTimeoutMillis:\s*\d+/.test(src));
  check("  ...and is capped at two concurrent gathers", /max:\s*2/.test(src));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  if (fail) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
