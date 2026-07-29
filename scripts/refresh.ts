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
import { ingestCompany, ingestTopic } from "./ingest";
import { markFailed, markFulfilled, pendingRequests } from "../lib/ingest/queue";
import { project } from "../lib/ingest/quota";
import type { SourceKey } from "../lib/types";

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
    for (const r of rows) {
      const label = r.ticker ?? r.slug;
      if (dry) {
        console.log(`  would refresh ${r.kind.padEnd(8)} ${label}`);
        continue;
      }
      try {
        // Each ingester applies its own per-source windows, so this is not eleven requests.
        if (r.kind === "company" && r.ticker) await ingestCompany(client, r.ticker);
        else await ingestTopic(client, r.slug);
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
          if (p.kind === "company" && p.ticker) await ingestCompany(client, p.ticker);
          else await ingestTopic(client, p.slug);
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
    // The quota check belongs here, where the requests were actually made.
    const tight = (["gnews", "newsdata", "eodhd", "marketaux", "nyt"] as SourceKey[])
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
