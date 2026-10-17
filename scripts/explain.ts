import { config } from "dotenv";
config({ path: ".env.local" });

import { getPool, closePool, configProblem } from "../lib/db";
import { computeSignals, DEFAULT_SIGNAL_OPTIONS, type Signal } from "../lib/signals";
import { DEFAULT_CAP_USD, costUsd, estimateBatched, formatUsd, withinCap } from "../lib/enrich/cost";
import {
  EXPLAIN_MAX_TOKENS,
  EXPLAIN_MODEL,
  alreadyAttempted,
  explainPrompt,
  explainSignal,
  explanationHash,
  loadCitableEvents,
  saveExplanation,
  saveRefusal,
  type CitableEvent,
} from "../lib/enrich/explain";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (n: string) => process.argv.includes(`--${n}`);

interface Job {
  subjectId: number;
  subjectName: string;
  signal: Signal;
  events: CitableEvent[];
  hash: Buffer;
}

async function main() {
  const slug = arg("industry");
  const since = arg("since") ?? "2024-01-01";
  const limit = Number(arg("limit") ?? 6);
  const capUsd = Number(arg("max-usd") ?? DEFAULT_CAP_USD);
  const apiKey = process.env.ANTHROPIC_API_KEY;

  const pool = getPool();
  const client = await pool.connect();
  try {
    const { rows } = slug
      ? await client.query(
          "SELECT id, slug, display_name FROM subjects WHERE slug=$1 AND kind='industry'",
          [slug.toLowerCase()]
        )
      : await client.query(
          "SELECT id, slug, display_name FROM subjects WHERE kind='industry' ORDER BY id"
        );

    if (!rows.length) {
      console.log("no matching industry — ingest a member company first");
      return;
    }

    /**
     * Gather every call the run would make *before* making any (NC-149).
     *
     * The loop used to ask as it went, so the only figure was a per-industry total printed after
     * the money was spent, and the default run covers every industry. Now the whole run is priced
     * first and held to the same cap as `npm run score`.
     */
    const jobs: Job[] = [];
    let cached = 0;
    let refusedBefore = 0;
    for (const ind of rows) {
      const subjectId = Number(ind.id);
      console.log(`\n${ind.slug} — ${ind.display_name}`);

      const { rows: mem } = await client.query(
        "SELECT member_id FROM subject_members WHERE industry_id=$1",
        [subjectId]
      );
      const memberIds = mem.map((m) => Number(m.member_id));
      const signals = await computeSignals(
        [subjectId, ...memberIds],
        memberIds,
        since,
        DEFAULT_SIGNAL_OPTIONS
      );

      const citable = signals.filter((s) => s.eventIds.length);
      const withEvidence = citable.slice(0, limit);
      const uncitable = signals.length - citable.length;
      const overLimit = citable.length - withEvidence.length;
      console.log(
        `  ${signals.length} signal(s): ${withEvidence.length} with evidence` +
          (uncitable ? `, ${uncitable} with nothing to cite` : "") +
          (overLimit ? `, ${overLimit} beyond --limit ${limit}` : "")
      );

      for (const signal of withEvidence) {
        const events = await loadCitableEvents(client, signal.eventIds);
        if (!events.length) continue;
        const hash = explanationHash(signal, events);
        // never pay twice for the same anomaly over the same content — kept or refused
        const before = await alreadyAttempted(client, subjectId, signal, hash);
        if (before === "kept") cached++;
        else if (before === "refused") refusedBefore++;
        else {
          jobs.push({ subjectId, subjectName: ind.display_name, signal, events, hash });
          console.log(`    to explain: ${signal.headline}  [${events.length} events]`);
        }
      }
    }

    // The ceiling, not the guess: max_tokens of output on every call.
    const estimate = estimateBatched(
      EXPLAIN_MODEL,
      jobs.map((j) => explainPrompt(j.signal, j.subjectName, j.events)),
      1,
      0,
      EXPLAIN_MAX_TOKENS
    );
    console.log(
      `\n${jobs.length} to explain, ${cached} already explained, ${refusedBefore} refused before for the same input` +
        (jobs.length ? `  — at most ${formatUsd(estimate.usd)}` : "")
    );
    if (!jobs.length) return;

    if (!apiKey) {
      console.log(
        "\n  No ANTHROPIC_API_KEY in news-charts/.env.local — nothing was generated.\n" +
          "  Signals and the timeline are unaffected; explanations are purely additive."
      );
      return;
    }
    if (has("dry-run")) {
      console.log("dry-run: the model was not called.");
      return;
    }
    const verdict = withinCap(estimate, capUsd);
    if (!verdict.allowed) {
      console.log(`stopped — ${verdict.reason}`);
      return;
    }

    let made = 0;
    const refusals = new Map<string, number>();
    let inTok = 0;
    let outTok = 0;
    const perCall = estimate.usd / estimate.items;

    for (const job of jobs) {
      // The estimate is a ceiling, but a cap that only holds if the estimate is right is not one.
      if (costUsd(EXPLAIN_MODEL, inTok, outTok) + perCall > capUsd) {
        console.log(`\n  stopped — the next call could pass the ${formatUsd(capUsd)} cap`);
        break;
      }
      try {
        const attempt = await explainSignal(job.signal, job.subjectName, job.events, apiKey);
        // counted whatever the outcome: a refused reply was billed the same as a kept one
        inTok += attempt.inputTokens;
        outTok += attempt.outputTokens;
        if (!attempt.explanation) {
          await saveRefusal(client, job.subjectId, job.signal, job.hash, attempt);
          const why = attempt.refusal ?? "refused";
          refusals.set(why, (refusals.get(why) ?? 0) + 1);
          console.log(`\n  ${job.signal.headline}\n    discarded: ${why}`);
          continue;
        }
        const id = await saveExplanation(client, job.subjectId, job.signal, job.hash, attempt.explanation);
        if (id) {
          made++;
          console.log(`\n  ${job.signal.headline}`);
          console.log(`    ${attempt.explanation.body.replace(/\s+/g, " ")}`);
          console.log(`    cites ${attempt.explanation.citedEventIds.length} of ${job.events.length} events`);
        }
      } catch (err) {
        console.log(`    failed: ${(err as Error).message}`);
      }
    }

    const discarded = [...refusals].map(([why, n]) => `${n} ${why}`).join(", ");
    console.log(
      `\n  generated ${made}, discarded ${[...refusals.values()].reduce((a, b) => a + b, 0)}` +
        (discarded ? ` (${discarded})` : "") +
        `  tokens ${inTok} in / ${outTok} out  ≈ ${formatUsd(costUsd(EXPLAIN_MODEL, inTok, outTok))}` +
        `  (at most ${formatUsd(estimate.usd)} estimated)`
    );
  } finally {
    client.release();
    await closePool();
  }
  console.log("\ndone.");
}

main().catch(async (err) => {
  // A configuration problem is a sentence, not a stack; anything else keeps its stack,
  // because hiding a real fault to look tidy is how it becomes hard to diagnose.
  const known = configProblem(err);
  console.error(known ? `
explain failed: ${known}` : err);
  await closePool();
  process.exit(1);
});
