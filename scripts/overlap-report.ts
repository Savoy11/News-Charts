import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * Would topic pages have securities to point at?
 *
 *   npm run overlap-report
 *
 * The go/no-go count for the "Securities in these stories" strip (2026-10-17 proposal 7). Run it
 * against the production database: the strip is worth building if a good share of topics would
 * list at least one security. Read-only — it changes nothing.
 */
import { getPool, closePool, configProblem } from "../lib/db";
import { OVERLAP_SQL, STRIP_MIN_SHARED, summariseOverlap, type OverlapPair } from "../lib/overlap";

async function main(): Promise<void> {
  const pool = getPool();
  const [{ rows: pairs }, { rows: topics }] = await Promise.all([
    pool.query<OverlapPair>(OVERLAP_SQL),
    pool.query<{ n: number }>("SELECT count(*)::int AS n FROM subjects WHERE kind = 'topic'"),
  ]);
  const s = summariseOverlap(pairs, topics[0]?.n ?? 0);
  const share = s.topicsHeld ? `${Math.round((s.topicsWithStrip / s.topicsHeld) * 100)}%` : "—";

  console.log(`\nTopic ↔ security overlap (a pair is listed at ${STRIP_MIN_SHARED}+ shared events)\n`);
  console.log(`  ${s.topicsWithStrip} of ${s.topicsHeld} topics (${share}) would show a "Securities in these stories" strip`);
  console.log(`  ${s.securitiesWithStrip} securities would show a "Topics that share events" line`);
  console.log(`  ${pairs.length} pairs share at least one event; ${s.listed.length} reach the bar\n`);
  for (const p of s.listed.slice(0, 20)) {
    console.log(`  ${String(p.shared).padStart(4)}  ${p.topic}  ↔  ${p.ticker}`);
  }
  if (s.listed.length > 20) console.log(`  … and ${s.listed.length - 20} more`);
  console.log("");
  await closePool();
}

main().catch(async (err) => {
  const known = configProblem(err);
  console.error(known ? `\noverlap-report failed: ${known}` : err);
  await closePool().catch(() => {});
  process.exit(1);
});
