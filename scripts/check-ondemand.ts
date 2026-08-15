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

  /**
   * Wikipedia always answers, so "found an article" is not "found the right article".
   *
   * Search stopped minting topics in the 2026-08-08 scope refocus, but a slug typed straight into
   * the URL bar still reaches the first pass. Measured live 2026-08-12, asking Wikipedia for
   * `best buy earnings q3` returns **TaxAct** with 21 events — a complete, confident timeline for
   * a company the visitor never asked about, which is worse than the honest notice a miss gets.
   */
  console.log("\nThe article has to be about what was asked for");
  const { articleAnswersSlug } = await import("../lib/wiki");
  check("the live failure is rejected", !articleAnswersSlug("best buy earnings q3", "TaxAct"));
  check("  …and so is its shorter form", !articleAnswersSlug("best buy", "TaxAct"));
  check("an unrelated article is rejected", !articleAnswersSlug("penicillin", "TaxAct"));

  /**
   * The corpus already depends on stem tolerance, so these are regression cases, not niceties:
   * exact word-boundary matching — which `mentions()` does, correctly, for headlines — would
   * reject both and silently delete two subjects the site holds today.
   */
  check("telegraph still reaches Telegraphy", articleAnswersSlug("telegraph", "Telegraphy"));
  check("electric cars still reaches Electric car", articleAnswersSlug("electric cars", "Electric car"));
  check("a company slug still reaches its article", articleAnswersSlug("ford", "Ford Motor Company"));
  check("a qualified query still reaches its subject", articleAnswersSlug("nvidia earnings", "Nvidia"));
  check("covid reaches the pandemic article", articleAnswersSlug("covid", "COVID-19 pandemic"));
  // The parser artifact that gave this initiative its name still names a real subject.
  check(
    "a prompt-shaped slug still matches its subject",
    articleAnswersSlug("how-donald-trumps-presidency-affected", "Second presidency of Donald Trump")
  );

  // Conservative where it cannot judge: a slug of nothing but filler has no grounds to refuse on,
  // and being wrong that way costs a thin page rather than deleting a real subject.
  check("a slug with no distinctive token is not refused", articleAnswersSlug("q3 earnings", "TaxAct"));
  check("an empty slug is not refused", articleAnswersSlug("", "Anything"));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  if (fail) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
