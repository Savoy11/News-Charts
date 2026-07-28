import { config } from "dotenv";
config({ path: ".env.local" });

import { getPool, closePool } from "../lib/db";
import { computeSignals, DEFAULT_SIGNAL_OPTIONS } from "../lib/signals";
import {
  EXPLAIN_MODEL,
  explainSignal,
  explanationHash,
  loadCitableEvents,
  saveExplanation,
} from "../lib/enrich/explain";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (n: string) => process.argv.includes(`--${n}`);

async function main() {
  const slug = arg("industry");
  const since = arg("since") ?? "2024-01-01";
  const limit = Number(arg("limit") ?? 6);
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
        `  ${signals.length} signal(s): ${withEvidence.length} to explain` +
          (uncitable ? `, ${uncitable} with nothing to cite` : "") +
          (overLimit ? `, ${overLimit} beyond --limit ${limit}` : "")
      );

      if (!apiKey) {
        console.log(
          "\n  No ANTHROPIC_API_KEY in news-charts/.env.local — nothing was generated.\n" +
            "  Signals and the timeline are unaffected; explanations are purely additive."
        );
        for (const s of withEvidence) {
          console.log(`    would explain: ${s.headline}  [${s.eventIds.length} events]`);
        }
        continue;
      }

      let made = 0;
      let cached = 0;
      let refused = 0;
      let inTok = 0;
      let outTok = 0;

      for (const signal of withEvidence) {
        const events = await loadCitableEvents(client, signal.eventIds);
        if (!events.length) continue;
        const hash = explanationHash(signal, events);

        // never pay twice for the same anomaly over the same content
        const { rows: existing } = await client.query(
          `SELECT 1 FROM syntheses
            WHERE subject_id=$1 AND kind=$2 AND window_start=$3 AND window_end=$4
              AND model=$5 AND input_hash=$6`,
          [subjectId, signal.kind, signal.windowStart, signal.windowEnd, EXPLAIN_MODEL, hash]
        );
        if (existing.length) {
          cached++;
          continue;
        }

        if (has("dry-run")) {
          console.log(`    [dry-run] ${signal.headline} — ${events.length} events`);
          continue;
        }

        try {
          const explanation = await explainSignal(signal, ind.display_name, events, apiKey);
          if (!explanation) {
            refused++; // no citations => discarded by design
            continue;
          }
          inTok += explanation.inputTokens;
          outTok += explanation.outputTokens;
          const id = await saveExplanation(client, subjectId, signal, hash, explanation);
          if (id) {
            made++;
            console.log(`\n  ${signal.headline}`);
            console.log(`    ${explanation.body.replace(/\s+/g, " ")}`);
            console.log(`    cites ${explanation.citedEventIds.length} of ${events.length} events`);
          }
        } catch (err) {
          console.log(`    failed: ${(err as Error).message}`);
        }
      }

      const cost = (inTok / 1e6) * 1 + (outTok / 1e6) * 5; // Haiku 4.5 list price
      console.log(
        `\n  generated ${made}, cached ${cached}, discarded ${refused} (uncited)` +
          `  tokens ${inTok} in / ${outTok} out  ≈ $${cost.toFixed(4)}`
      );
    }
  } finally {
    client.release();
    await closePool();
  }
  console.log("\ndone.");
}

main().catch(async (err) => {
  console.error("explain failed:", err.message);
  await closePool();
  process.exit(1);
});
