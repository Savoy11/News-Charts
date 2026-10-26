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
  freePass,
  scoreBatchWithModel,
  type ScorableRow,
  type SubjectContext,
} from "../lib/enrich/relevance";
import { companyScoringAliases } from "../lib/news";

const BATCH = 25;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);

interface Pending extends ScorableRow {
  subjectId: number;
  /** the free tier's earlier score, on a `--rescore` */
  prior: number | null;
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

/**
 * What the free tier writes as its scorer: a `--strict-headline` score apart, so a rescore without
 * the flag, and ingest's own re-score, leave its demotions alone (batch 61). Before, a plain
 * `--rescore` cleared every strict 0.2 back to NULL, and the page showed them again.
 */
const FREE = "deterministic";
const FREE_STRICT = "deterministic-strict";
const freeScorers = (strict: boolean) => (strict ? [FREE, FREE_STRICT] : [FREE]);

/** Hands rows the free tier scored back to the model: its rules no longer settle them. */
async function clearScores(client: PoolClient, subjectId: number, eventIds: number[], strict: boolean): Promise<void> {
  if (!eventIds.length) return;
  await client.query(
    `UPDATE event_subjects SET relevance = NULL, scored_by = NULL, scored_at = NULL
      WHERE subject_id = $1 AND event_id = ANY($2::bigint[]) AND scored_by = ANY($3::text[])`,
    [subjectId, eventIds, freeScorers(strict)]
  );
}

async function scoreSubject(client: PoolClient, slug: string, strict: boolean, limit: number, rescore: boolean) {
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
  // A company is scored by the names ingest scores it with ("Google" for Alphabet), never by its
  // stored search aliases, whose former names news does not keep (batch 61). Any other subject
  // by its stored aliases, the phrasings searched for it — one indexed read.
  const cik = subject.kind === "company" ? subjectRows[0].cik : null;
  const { rows: aliasRows } = cik ? { rows: [] as { alias: string }[] } : await client.query<{ alias: string }>(
    `SELECT alias FROM subject_aliases WHERE subject_id = $1`,
    [subjectId]
  );
  const aliases = cik
    ? companyScoringAliases({ name: subject.displayName, ticker: subject.ticker, cik })
    : aliasesFor(subject, aliasRows.map((r) => r.alias));

  const { rows } = await client.query(
    // The primary attestation's source rides along: an Internet Archive "citation" is judged on
    // whether it names the subject, a Wikipedia one is not (NC-131). A `--rescore` takes the rows
    // the free tier scored too, so a corrected rule reaches the rows it scored before (batch 59).
    `SELECT e.id, e.kind, e.title, s.key AS source_key, a.source_label, es.relevance AS prior
       FROM events e JOIN event_subjects es ON es.event_id = e.id
       LEFT JOIN event_attestations a ON a.event_id = e.id AND a.is_primary
       LEFT JOIN sources s ON s.id = a.source_id
      WHERE es.subject_id = $1 AND (es.relevance IS NULL OR ($3 AND es.scored_by = ANY($4::text[])))
      ORDER BY e.occurred_on DESC
      LIMIT $2`,
    [subjectId, limit, rescore, freeScorers(strict)]
  );
  const pending: Pending[] = rows.map((r) => ({
    eventId: Number(r.id),
    kind: r.kind,
    title: r.title,
    sourceKey: r.source_key,
    byline: r.source_label,
    subjectId,
    prior: r.prior === null ? null : Number(r.prior),
  }));

  console.log(`\n${slug} — ${subject.displayName}`);
  console.log(`  aliases: ${aliases.join(", ")}`);
  console.log(`  ${rescore ? "pairs to score or rescore" : "unscored pairs"}: ${pending.length}`);
  if (!pending.length) return;

  // --- tier 1: free, provenance-based ---
  const { scores: free, cleared, remaining } = freePass(pending, subject, aliases, strict);
  if (!has("dry-run")) {
    await writeScores(client, subjectId, free, strict ? FREE_STRICT : FREE);
    await clearScores(client, subjectId, cleared, strict);
  }
  console.log(`  deterministic: scored ${free.length}${rescore ? ` (new or changed), cleared ${cleared.length}` : ""}, left ${remaining.length} for the model`);

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
  const rescore = has("rescore");
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
    if (rescore) console.log("rescore: the free tier's own scores are worked out again; a model's are kept");
    for (const s of slugs) await scoreSubject(client, s, strict, limit, rescore);
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
