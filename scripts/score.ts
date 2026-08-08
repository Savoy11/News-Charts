import { config } from "dotenv";
config({ path: ".env.local" });

import type { PoolClient } from "pg";
import { getPool, closePool } from "../lib/db";
import {
  DEFAULT_CAP_USD,
  costUsd,
  estimateBatched,
  formatUsd,
  withinCap,
} from "../lib/enrich/cost";
import {
  MODEL,
  aliasesFor,
  deterministicScore,
  scoreBatchWithModel,
  type ScorableRow,
  type SubjectContext,
} from "../lib/enrich/relevance";

const BATCH = 25;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);

interface Pending extends ScorableRow {
  subjectId: number;
}

async function writeScores(
  client: PoolClient,
  subjectId: number,
  scores: { eventId: number; score: number }[],
  scoredBy: string
): Promise<void> {
  if (!scores.length) return;
  await client.query(
    `UPDATE event_subjects es
        SET relevance = v.score, scored_by = $3, scored_at = now()
       FROM (SELECT * FROM unnest($1::bigint[], $2::real[]) AS t(event_id, score)) v
      WHERE es.event_id = v.event_id AND es.subject_id = $4`,
    [scores.map((s) => s.eventId), scores.map((s) => s.score), scoredBy, subjectId]
  );
}

async function scoreSubject(client: PoolClient, slug: string, strict: boolean, limit: number) {
  const { rows: subjectRows } = await client.query(
    `SELECT id, kind, display_name, ticker FROM subjects WHERE slug = $1`,
    [slug.toLowerCase()]
  );
  if (!subjectRows[0]) {
    console.log(`  no subject with slug "${slug}"`);
    return;
  }
  const subject: SubjectContext = {
    kind: subjectRows[0].kind,
    displayName: subjectRows[0].display_name,
    ticker: subjectRows[0].ticker,
  };
  const subjectId = Number(subjectRows[0].id);
  // Stored aliases ("Google" for Alphabet) settle headlines deterministically that would
  // otherwise cost a model call — one indexed read that pays for itself immediately.
  const { rows: aliasRows } = await client.query<{ alias: string }>(
    `SELECT alias FROM subject_aliases WHERE subject_id = $1`,
    [subjectId]
  );
  const aliases = aliasesFor(subject, aliasRows.map((r) => r.alias));

  const { rows } = await client.query(
    `SELECT e.id, e.kind, e.title
       FROM events e JOIN event_subjects es ON es.event_id = e.id
      WHERE es.subject_id = $1 AND es.relevance IS NULL
      ORDER BY e.occurred_on DESC
      LIMIT $2`,
    [subjectId, limit]
  );
  const pending: Pending[] = rows.map((r) => ({
    eventId: Number(r.id),
    kind: r.kind,
    title: r.title,
    subjectId,
  }));

  console.log(`\n${slug} — ${subject.displayName}`);
  console.log(`  aliases: ${aliases.join(", ")}`);
  console.log(`  unscored pairs: ${pending.length}`);
  if (!pending.length) return;

  // --- tier 1: free, provenance-based ---
  const free: { eventId: number; score: number }[] = [];
  const remaining: ScorableRow[] = [];
  for (const row of pending) {
    const verdict = deterministicScore(row, subject, aliases, strict);
    if (verdict) free.push({ eventId: row.eventId, score: verdict.score });
    else remaining.push(row);
  }
  if (!has("dry-run")) await writeScores(client, subjectId, free, "deterministic");
  console.log(`  deterministic: scored ${free.length}, left ${remaining.length} for the model`);

  if (!remaining.length) return;

  // --- tier 2: model, batched ---
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log(
      `  model pass skipped — set ANTHROPIC_API_KEY in chronolens/.env.local to score the rest.\n` +
        `  (they stay NULL, which still displays: nothing is hidden without a score)`
    );
    return;
  }

  /**
   * Estimate before spending, not after.
   *
   * The old flow reported an accurate cost that arrived too late to act on. A 600-event subject
   * is one `--limit` away, so the first warning should not be the bill.
   */
  const estimate = estimateBatched(MODEL, remaining.map((r) => r.title), BATCH);
  const capUsd = Number(arg("max-usd") ?? DEFAULT_CAP_USD);
  const verdict = withinCap(estimate, capUsd);
  console.log(
    `  model pass: ${estimate.items} events in ${estimate.batches} batch(es), ` +
      `~${formatUsd(estimate.usd)} estimated`
  );
  if (!verdict.allowed) {
    console.log(`  stopped — ${verdict.reason}`);
    return;
  }

  let scoredCount = 0;
  let inTok = 0;
  let outTok = 0;
  for (let i = 0; i < remaining.length; i += BATCH) {
    const chunk = remaining.slice(i, i + BATCH);
    try {
      const result = await scoreBatchWithModel(chunk, subject, apiKey);
      const scores = [...result.scores].map(([eventId, score]) => ({ eventId, score }));
      if (!has("dry-run")) await writeScores(client, subjectId, scores, MODEL);
      scoredCount += scores.length;
      inTok += result.inputTokens;
      outTok += result.outputTokens;
    } catch (err) {
      console.log(`  batch ${i / BATCH + 1} failed: ${(err as Error).message}`);
    }
  }
  console.log(
    `  model (${MODEL}): scored ${scoredCount}  ` +
      `tokens ${inTok} in / ${outTok} out  ≈ ${formatUsd(costUsd(MODEL, inTok, outTok))}` +
      `  (estimated ${formatUsd(estimate.usd)})`
  );
}

async function main() {
  const slug = arg("subject");
  const limit = Number(arg("limit") ?? 500);
  const strict = has("strict-headline");
  const client = await getPool().connect();
  try {
    let slugs: string[];
    if (slug) {
      slugs = [slug];
    } else {
      const { rows } = await client.query("SELECT slug FROM subjects ORDER BY id");
      slugs = rows.map((r) => r.slug);
    }
    if (strict) console.log("strict-headline: company news must name the subject in the headline");
    if (has("dry-run")) console.log("dry-run: no writes");
    for (const s of slugs) await scoreSubject(client, s, strict, limit);
  } finally {
    client.release();
    await closePool();
  }
  console.log("\ndone.");
}

main().catch((err) => {
  console.error("\nscore failed:", err.message);
  process.exit(1);
});
