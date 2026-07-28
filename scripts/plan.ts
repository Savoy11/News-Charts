import { config } from "dotenv";
config({ path: ".env.local" });

import type { PoolClient } from "pg";
import { getPool, closePool } from "../lib/db";
import { PLAN_MODEL, planQueries, type QueryPlan } from "../lib/enrich/plan";
import {
  ensureSources,
  emptyStats,
  logFetch,
  shouldBackOff,
  upsertEvent,
} from "../lib/ingest/store";
import { fetchRegulations } from "../lib/federalregister";
import { fetchNews } from "../lib/news";
import { fetchPressMentions } from "../lib/loc";
import type { FetchResult } from "../lib/types";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (n: string) => process.argv.includes(`--${n}`);

/** The model names a source; this decides how that source is actually called. */
function run(plan: QueryPlan, since: string): Promise<FetchResult> {
  switch (plan.source) {
    case "federal_register":
      return fetchRegulations(plan.query, since);
    case "gdelt":
      return fetchNews(plan.query);
    case "loc_chronam":
      return fetchPressMentions(plan.query);
  }
}

async function execute(client: PoolClient, subjectId: number, plan: QueryPlan, since: string) {
  const backoff = await shouldBackOff(client, plan.source, subjectId, 10);
  if (backoff) {
    console.log(`    skipped — ${plan.source} ${backoff} recently`);
    return;
  }

  const result = await run(plan, since);
  const stats = emptyStats();
  await client.query("BEGIN");
  try {
    for (const ev of result.events.slice(0, 40)) {
      if (ev.sourceKey) await upsertEvent(client, ev, subjectId, stats);
    }
    await logFetch(
      client,
      plan.source,
      subjectId,
      plan.query,
      result.outcome,
      result.events.length,
      result.httpStatus,
      `planned by ${PLAN_MODEL}`
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.log(`    failed: ${(err as Error).message}`);
    return;
  }
  console.log(
    `    ${result.outcome.padEnd(9)} ${stats.events} events (${stats.newEvents} new), ` +
      `links +${stats.links}`
  );
}

async function main() {
  const slug = arg("subject") ?? arg("industry");
  const since = arg("since") ?? "2015-01-01";
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!slug) {
    console.error("usage: npm run plan -- --subject <slug> [--execute]");
    process.exit(2);
  }

  const client = await getPool().connect();
  try {
    const { rows } = await client.query(
      "SELECT id, kind, display_name FROM subjects WHERE slug = $1",
      [slug.toLowerCase()]
    );
    if (!rows[0]) {
      console.log(`no subject with slug "${slug}"`);
      return;
    }
    const subjectId = Number(rows[0].id);
    console.log(`\n${slug} — ${rows[0].display_name} (${rows[0].kind})`);

    // what has already been asked, and what the timeline already holds
    const [{ rows: past }, { rows: sample }] = await Promise.all([
      client.query(
        "SELECT DISTINCT query FROM source_fetches WHERE subject_id=$1 AND query IS NOT NULL",
        [subjectId]
      ),
      client.query(
        `SELECT e.title FROM events e
           JOIN event_subjects es ON es.event_id=e.id AND es.subject_id=$1
          ORDER BY e.occurred_on DESC LIMIT 15`,
        [subjectId]
      ),
    ]);
    const alreadyQueried = past.map((r) => r.query as string);
    console.log(`  already searched: ${alreadyQueried.join("; ") || "nothing"}`);

    if (!apiKey) {
      console.log(
        "\n  No ANTHROPIC_API_KEY in news-charts/.env.local — no plan was generated.\n" +
          "  Planning only ever proposes search terms against the sources below; it can\n" +
          "  never name a URL, so nothing here fetches from an arbitrary address.\n" +
          "    federal_register · gdelt · loc_chronam"
      );
      return;
    }

    const { plans, inputTokens, outputTokens } = await planQueries(
      {
        subjectName: rows[0].display_name,
        subjectKind: rows[0].kind,
        alreadyQueried,
        sampleTitles: sample.map((r) => r.title as string),
      },
      apiKey
    );

    const cost = (inputTokens / 1e6) * 1 + (outputTokens / 1e6) * 5;
    console.log(
      `\n  ${plans.length} plan(s) survived validation  ` +
        `tokens ${inputTokens} in / ${outputTokens} out  ≈ $${cost.toFixed(4)}\n`
    );

    for (const plan of plans) {
      console.log(`  ${plan.source.padEnd(17)} "${plan.query}"`);
      if (plan.rationale) console.log(`  ${" ".repeat(17)} ${plan.rationale}`);
      if (has("execute")) {
        await ensureSources(client);
        await execute(client, subjectId, plan, since);
      }
    }

    if (!has("execute")) {
      console.log("\n  dry run — pass --execute to fetch and ingest these");
    }
  } finally {
    client.release();
    await closePool();
  }
  console.log("\ndone.");
}

main().catch(async (err) => {
  console.error("plan failed:", err.message);
  await closePool();
  process.exit(1);
});
