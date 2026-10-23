import { config } from "dotenv";
config({ path: ".env.local" });

import type { PoolClient } from "pg";
import { getPool, closePool, configProblem } from "../lib/db";
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
import { newsNamesFor, possessiveNameFor } from "../lib/sec";
import { gdeltHeadlineNames } from "../lib/news";

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
    `SELECT id, kind, display_name, ticker, cik FROM subjects WHERE slug = $1`,
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
  // …and a company's other names that news may use, the ones ingest searched under (batch 25), with
  // the names a GDELT headline gives a possessive ("mcdonald" for McDonald's, batch 36)
  const cik = subject.kind === "company" ? subjectRows[0].cik : null;
  const alsoKnownAs = cik ? [...newsNamesFor(cik), ...gdeltHeadlineNames(subject.displayName, possessiveNameFor(cik))] : [];
  const aliases = aliasesFor(subject, [...aliasRows.map((r) => r.alias), ...alsoKnownAs]);

  const { rows } = await client.query(
    // The primary attestation's source rides along: an Internet Archive "citation" is judged on
    // whether it names the subject, a Wikipedia one is not (NC-131).
    `SELECT e.id, e.kind, e.title, s.key AS source_key, a.source_label
       FROM events e JOIN event_subjects es ON es.event_id = e.id
       LEFT JOIN event_attestations a ON a.event_id = e.id AND a.is_primary
       LEFT JOIN sources s ON s.id = a.source_id
      WHERE es.subject_id = $1 AND es.relevance IS NULL
      ORDER BY e.occurred_on DESC
      LIMIT $2`,
    [subjectId, limit]
  );
  const pending: Pending[] = rows.map((r) => ({
    eventId: Number(r.id),
    kind: r.kind,
    title: r.title,
    sourceKey: r.source_key,
    byline: r.source_label,
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
      `  model pass skipped — set ANTHROPIC_API_KEY in news-charts/.env.local to score the rest.\n` +
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
  // A dry run that still called the model only skipped the write — and paid for the reply (NC-149).
  if (has("dry-run")) {
    console.log(`  dry-run: the model was not called`);
    return;
  }
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
      inTok += result.inputTokens;
      outTok += result.outputTokens;
      if (result.rejected) console.log(`  batch ${i / BATCH + 1}: ${result.rejected} reply item(s) failed validation`);
      if (result.suspect) {
        // left unscored, which still displays: a steered batch must not hide anything (NC-153)
        console.log(`  ⚠ batch ${i / BATCH + 1} held back — ${result.suspect}; check those headlines by hand`);
        continue;
      }
      const scores = [...result.scores].map(([eventId, score]) => ({ eventId, score }));
      await writeScores(client, subjectId, scores, MODEL);
      scoredCount += scores.length;
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
  // A configuration problem is a sentence, not a stack; anything else keeps its stack,
  // because hiding a real fault to look tidy is how it becomes hard to diagnose.
  const known = configProblem(err);
  console.error(known ? `
score failed: ${known}` : err);
  process.exit(1);
});
