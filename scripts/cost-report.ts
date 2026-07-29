import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * What ingest actually spent, and what it would spend at scale.
 *
 *   npm run cost-report            # last 7 days
 *   npm run cost-report 30         # last 30 days
 *
 * Two halves, and both are needed. The **observed** half reads `source_fetches`, which has
 * logged every request since the beginning; the **projected** half works out what the current
 * refresh windows cost per tracked subject and compares that against each free tier.
 *
 * The reason this exists: a feed that burns its daily budget by lunchtime does not look rate
 * limited on a page, it looks like a source with nothing to say. That is invisible exactly where
 * it matters, and it is also the arithmetic behind the launch decision — "buy this tier or drop
 * it" is really "this tier covers N subjects".
 */
import { getPool, closePool } from "../lib/db";
import { QUOTAS, project, subjectCapacity } from "../lib/ingest/quota";
import { SOURCES } from "../lib/ingest/store";
import type { SourceKey } from "../lib/types";

const MARK = { ok: "✓", tight: "!", over: "✗", unmetered: "·" } as const;

async function main(): Promise<void> {
  const days = Number(process.argv[2] ?? 7) || 7;
  const pool = getPool();

  const { rows: counts } = await pool.query<{ key: string; n: string; throttled: string; errors: string; empty: string }>(
    `SELECT s.key,
            count(*)                                              AS n,
            count(*) FILTER (WHERE f.outcome = 'throttled')        AS throttled,
            count(*) FILTER (WHERE f.outcome = 'error')            AS errors,
            count(*) FILTER (WHERE f.outcome = 'empty')            AS empty
       FROM source_fetches f JOIN sources s ON s.id = f.source_id
      WHERE f.fetched_at > now() - ($1 || ' days')::interval
      GROUP BY s.key ORDER BY n DESC`,
    [String(days)]
  );

  const { rows: subjectRows } = await pool.query<{ n: string }>(
    `SELECT count(*) AS n FROM subjects WHERE kind IN ('company','topic')`
  );
  const subjects = Number(subjectRows[0]?.n ?? 0);

  console.log(`\nObserved — last ${days} day${days === 1 ? "" : "s"}\n`);
  if (!counts.length) {
    console.log("  nothing logged in the window. Either ingest has not run, or it ran earlier.\n");
  } else {
    for (const r of counts) {
      const perDay = (Number(r.n) / days).toFixed(1);
      const flags = [
        Number(r.throttled) ? `${r.throttled} throttled` : "",
        Number(r.errors) ? `${r.errors} errors` : "",
        Number(r.empty) ? `${r.empty} empty` : "",
      ].filter(Boolean).join(", ");
      console.log(`  ${r.key.padEnd(18)} ${String(r.n).padStart(5)} requests  ${perDay.padStart(6)}/day  ${flags}`);
    }
    // A throttle is the only outcome here that means "we asked too often"; the report should not
    // bury it among the ones that mean "the source had nothing".
    const throttled = counts.filter((r) => Number(r.throttled) > 0);
    if (throttled.length) {
      console.log(`\n  ⚠ throttled by: ${throttled.map((r) => r.key).join(", ")} — the windows are too tight for these.`);
    }
  }

  console.log(`\nProjected — ${subjects} tracked subject${subjects === 1 ? "" : "s"}, at the current refresh windows\n`);
  const rows = (SOURCES.map((s) => s.key) as SourceKey[])
    .map((key) => ({ key, p: project(key, subjects), cap: subjectCapacity(key) }))
    .sort((a, b) => (b.p.utilisation ?? -1) - (a.p.utilisation ?? -1));

  for (const { key, p, cap } of rows) {
    const budget =
      p.limit === null
        ? "no published daily limit"
        : `${p.projectedPerDay}/${p.limit} per day · ${Math.round((p.utilisation ?? 0) * 100)}%` +
          (cap !== null ? ` · covers ~${cap} subjects` : "");
    console.log(`  ${MARK[p.verdict]} ${key.padEnd(18)} ${budget}`);
  }

  const problems = rows.filter((r) => r.p.verdict === "over" || r.p.verdict === "tight");
  if (problems.length) {
    console.log(
      `\n  ${problems.length} source${problems.length === 1 ? "" : "s"} at or past the free tier:\n` +
        problems.map((r) => `    ${r.key} — ${QUOTAS[r.key].note}`).join("\n")
    );
    console.log(
      `\n  These are the buy-or-drop decisions in the release gate. The projection counts one\n` +
        `  request per source per window per subject and nothing else, so where it says "tight"\n` +
        `  the real answer is probably "over".\n`
    );
  } else {
    console.log(`\n  Every metered source fits its free tier at ${subjects} subjects.\n`);
  }

  await closePool();
}

main().catch(async (err) => {
  console.error(err);
  await closePool().catch(() => {});
  process.exit(1);
});
