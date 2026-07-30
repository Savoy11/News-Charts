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
import { costUsd, formatUsd } from "../lib/enrich/cost";
import { SOURCES } from "../lib/ingest/store";
import { COMPANY_SOURCES, TOPIC_SOURCES } from "./ingest";
import type { SourceKey } from "../lib/types";

const MARK = { ok: "✓", tight: "!", over: "✗", unmetered: "·" } as const;

/**
 * The sources scheduled ingest actually asks. A projection over the whole registry counted
 * requests for the eight keyed aggregators nothing calls — which is a licence bill quoted for
 * feeds contributing zero rows, and the buy-or-drop decision this report exists to inform is the
 * one it would have got wrong.
 */
const INGESTED: ReadonlySet<SourceKey> = new Set<SourceKey>([
  ...TOPIC_SOURCES,
  ...COMPANY_SOURCES,
  // reached by the other two ingesters rather than by a subject refresh
  "federal_register",
  "onchain",
  "snapshot",
  "defillama",
]);

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
    .map((key) => ({ key, p: project(key, subjects), cap: subjectCapacity(key), on: INGESTED.has(key) }))
    .sort((a, b) => (b.p.utilisation ?? -1) - (a.p.utilisation ?? -1));

  for (const { key, p, cap, on } of rows) {
    if (!on) {
      // Its window would cost this much *if* anything asked. Nothing does, so the honest figure
      // is zero, and the projection is kept only as what turning it on would cost.
      console.log(
        `  · ${key.padEnd(18)} not on the ingest path — 0/day today` +
          (p.limit === null ? "" : ` (would be ${p.projectedPerDay}/${p.limit} if wired)`)
      );
      continue;
    }
    const budget =
      p.limit === null
        ? "no published daily limit"
        : `${p.projectedPerDay}/${p.limit} per day · ${Math.round((p.utilisation ?? 0) * 100)}%` +
          (cap !== null ? ` · covers ~${cap} subjects` : "");
    console.log(`  ${MARK[p.verdict]} ${key.padEnd(18)} ${budget}`);
  }

  const problems = rows.filter((r) => r.on && (r.p.verdict === "over" || r.p.verdict === "tight"));
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
    console.log(`\n  Every metered source on the ingest path fits its free tier at ${subjects} subjects.\n`);
  }

  /**
   * AI spend, from what was actually recorded rather than what was printed.
   *
   * Both tiers key on a content hash — `event_enrichments` on the event's own, `syntheses` on
   * the hash of everything cited — so an unchanged input is never paid for twice. That is the
   * discipline; this is the receipt.
   */
  console.log("\nAI spend — recorded, all time\n");
  const { rows: enrich } = await pool.query<{ model: string; n: string; intok: string; outtok: string }>(
    `SELECT model, count(*) AS n,
            coalesce(sum(input_tokens),0)  AS intok,
            coalesce(sum(output_tokens),0) AS outtok
       FROM event_enrichments GROUP BY model`
  );
  const { rows: synth } = await pool.query<{ model: string; n: string; intok: string; outtok: string; unknown: string }>(
    `SELECT model, count(*) AS n,
            coalesce(sum(input_tokens),0)  AS intok,
            coalesce(sum(output_tokens),0) AS outtok,
            count(*) FILTER (WHERE input_tokens IS NULL) AS unknown
       FROM syntheses GROUP BY model`
  );
  const { rows: scored } = await pool.query<{ scored_by: string; n: string }>(
    `SELECT scored_by, count(*) AS n FROM event_subjects
      WHERE scored_by IS NOT NULL GROUP BY scored_by ORDER BY n DESC`
  );

  let total = 0;
  for (const [label, rows] of [["enrichments", enrich], ["syntheses", synth]] as const) {
    for (const r of rows) {
      const usd = costUsd(r.model, Number(r.intok), Number(r.outtok));
      total += usd;
      console.log(
        `  ${label.padEnd(13)} ${r.model.padEnd(28)} ${String(r.n).padStart(4)} rows  ` +
          `${r.intok} in / ${r.outtok} out  ${formatUsd(usd)}`
      );
    }
  }
  // Rows written before db/013 carry no figure, and a zero there would understate the total.
  const unknown = synth.reduce((n, r) => n + Number(r.unknown ?? 0), 0);
  if (unknown) console.log(`  ${unknown} synthesis row(s) predate token recording — not counted.`);

  for (const r of scored) {
    // Deterministic scores are the ones that cost nothing; showing them next to the paid ones is
    // the point, because the ratio is what the relevance floor is for.
    const free = r.scored_by === "deterministic";
    console.log(`  ${"relevance".padEnd(13)} ${r.scored_by.padEnd(28)} ${String(r.n).padStart(4)} rows  ${free ? "free" : "paid"}`);
  }
  if (!enrich.length && !synth.length && !scored.length) console.log("  nothing enriched yet.");
  else console.log(`\n  total recorded model spend: ${formatUsd(total)}`);

  await closePool();
}

main().catch(async (err) => {
  console.error(err);
  await closePool().catch(() => {});
  process.exit(1);
});
