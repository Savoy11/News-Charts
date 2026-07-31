import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * Refresh every indexed subject, and pick up what visitors asked for.
 *
 *   npm run refresh              # everything due
 *   npm run refresh -- --limit 20
 *   npm run refresh -- --dry-run
 *
 * Run this on a schedule — hourly is a sensible starting point, since the tightest refresh
 * window is an hour and anything shorter only re-asks sources that would decline to answer.
 *
 * This is the half that makes pages read-only. Refresh used to happen on a *page view*: the
 * unlucky visitor arriving after a TTL expired waited on eleven feeds, several visitors arriving
 * together each triggered their own fetch, and a database outage turned every page load into a
 * live fetch — burning quota exactly when it could least be afforded. Moving it here makes the
 * cost a function of how many subjects exist, which is a number we choose, rather than of how
 * much traffic arrives, which is not.
 *
 * Per-source windows still apply inside each subject, so a subject being "due" does not mean
 * eleven requests: `selectStaleSources` asks only what has actually aged out.
 */
import { getPool, closePool } from "../lib/db";
import { COMPANY_SOURCES, TOPIC_SOURCES, ingestCompany, ingestOnchain, ingestTopic } from "./ingest";
import { ensureSources } from "../lib/ingest/store";
import { markFailed, markFulfilled, pendingRequests } from "../lib/ingest/queue";
import { project } from "../lib/ingest/quota";
import { CRYPTO_SUBJECTS } from "../lib/onchain";
import { purgeOldResolutions } from "../lib/searchLog";
import type { SourceKey } from "../lib/types";

/**
 * Crypto assets are `topic` subjects, so a plain topic refresh would send them down the
 * Wikipedia path — which fetches none of their on-chain history and, worse, resolves a bare slug
 * like "dai" against Wikipedia's search. `scripts/ingest.ts` imported only `ingestCompany` and
 * `ingestTopic`, so on the schedule no halving, supply move, governance vote or exploit has ever
 * been refreshed; they entered the corpus at seed time and stopped there.
 */
const ONCHAIN_SLUGS = new Set(CRYPTO_SUBJECTS.map((c) => c.slug));

/** Send each subject to the ingester that knows what it is. */
async function refreshSubject(
  client: import("pg").PoolClient,
  s: { slug: string; kind: string; ticker: string | null }
): Promise<void> {
  if (s.kind === "company" && s.ticker) return ingestCompany(client, s.ticker);
  if (ONCHAIN_SLUGS.has(s.slug)) return ingestOnchain(client, s.slug);
  return ingestTopic(client, s.slug);
}

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const has = (name: string) => process.argv.includes(`--${name}`);

interface Row {
  slug: string;
  kind: "company" | "topic" | "industry";
  ticker: string | null;
}

async function main(): Promise<void> {
  const limit = Number(arg("limit") ?? 200);
  const dry = has("dry-run");
  const pool = getPool();

  const { rows } = await pool.query<Row>(
    `SELECT slug, kind, ticker FROM subjects
      WHERE kind IN ('company','topic')
      -- oldest first, so a run that cannot finish still makes progress on the stalest
      ORDER BY refreshed_at NULLS FIRST
      LIMIT $1`,
    [limit]
  );

  console.log(`\nRefreshing ${rows.length} subject(s)${dry ? " (dry run)" : ""}\n`);

  let ok = 0;
  let failed = 0;
  const client = await pool.connect();
  try {
    /**
     * The licence gate reads the `sources` table, and nothing on this path ever wrote it: the
     * only callers of `ensureSources` were `ingest.ts`'s own CLI main, `seed-demo` and `plan`,
     * none of which a scheduled refresh enters, and no migration seeds it. `assertCommercialOk`
     * now refuses a source it cannot find, so establishing the registry here is what keeps the
     * scheduled path working *and* checked rather than silently unguarded.
     */
    if (!dry) await ensureSources(client);

    for (const r of rows) {
      const label = r.ticker ?? r.slug;
      if (dry) {
        console.log(`  would refresh ${r.kind.padEnd(8)} ${label}`);
        continue;
      }
      try {
        // Each ingester applies its own per-source windows, so this is not eleven requests.
        await refreshSubject(client, r);
        ok++;
      } catch (err) {
        // One subject failing must not end the run: the next one may be perfectly fetchable, and
        // a scheduled job that stops at the first bad subject stops permanently.
        failed++;
        console.log(`  ✗ ${label} — ${(err as Error).message}`);
      }
    }

    /**
     * Then what people asked for and we did not have.
     *
     * After the existing subjects rather than before: a request is a promise to *someone*, but
     * letting new subjects crowd out the refresh of subjects already on the site would make the
     * whole corpus stale to serve the newest arrival.
     */
    const pending = await pendingRequests(Number(arg("requests") ?? 10));
    if (pending.length) {
      console.log(`\n${pending.length} requested subject(s), most-wanted first\n`);
      for (const p of pending) {
        if (dry) {
          console.log(`  would ingest ${p.kind.padEnd(8)} ${p.ticker ?? p.slug} (${p.requests} ask(s))`);
          continue;
        }
        try {
          await refreshSubject(client, p);
          await markFulfilled(null, p.id);
          console.log(`  ✓ ${p.ticker ?? p.slug} (${p.requests} ask(s))`);
        } catch (err) {
          // Left pending on purpose — a source down this hour may answer the next.
          await markFailed(p.id, (err as Error).message);
          console.log(`  ✗ ${p.ticker ?? p.slug} — ${(err as Error).message}`);
        }
      }
    }
  } finally {
    client.release();
  }

  if (!dry) {
    console.log(`\n  ${ok} refreshed, ${failed} failed`);

    /**
     * Search-log retention, applied here because this is the only thing that runs on a schedule.
     * A 90-day policy that depends on an operator remembering to run a command is not a policy,
     * and the rows are visitor queries — the one kind of data worth deleting on time.
     */
    const purged = await purgeOldResolutions(90);
    if (purged) console.log(`  purged ${purged} search log row(s) past the 90-day retention`);
    /**
     * The quota check belongs here, where the requests were actually made — and over the sources
     * this run actually asks. It named GNews, Newsdata, EODHD, Marketaux and NYT, none of which
     * the ingest path calls: a warning that could only ever be about feeds spending nothing.
     */
    const tight = ([...new Set([...TOPIC_SOURCES, ...COMPANY_SOURCES])] as SourceKey[])
      .map((k) => project(k, rows.length))
      .filter((p) => p.verdict !== "ok" && p.verdict !== "unmetered");
    if (tight.length) {
      console.log(
        `  ⚠ at ${rows.length} subjects these are at or past their free tier: ` +
          tight.map((t) => `${t.source} (${Math.round((t.utilisation ?? 0) * 100)}%)`).join(", ") +
          `\n    npm run cost-report for the full picture.`
      );
    }
  }

  await closePool();
}

main().catch(async (err) => {
  console.error("\nrefresh failed:", err.message);
  await closePool().catch(() => {});
  process.exit(1);
});
