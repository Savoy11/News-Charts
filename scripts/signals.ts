import { config } from "dotenv";
config({ path: ".env.local" });

import { getPool, closePool, configProblem } from "../lib/db";
import { computeSignals } from "../lib/signals";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const slug = arg("industry");
  const since = arg("since") ?? "2024-01-01";

  const pool = getPool();
  const { rows } = slug
    ? await pool.query(
        "SELECT id, slug, display_name FROM subjects WHERE slug = $1 AND kind = 'industry'",
        [slug.toLowerCase()]
      )
    : await pool.query(
        "SELECT id, slug, display_name FROM subjects WHERE kind = 'industry' ORDER BY id"
      );

  if (!rows.length) {
    console.log(slug ? `no industry with slug "${slug}"` : "no industries yet");
    await closePool();
    return;
  }

  for (const ind of rows) {
    console.log(`\n${ind.slug} — ${ind.display_name}   (since ${since})`);
    const { rows: mem } = await pool.query(
      "SELECT member_id FROM subject_members WHERE industry_id = $1",
      [ind.id]
    );
    const memberIds = mem.map((m) => Number(m.member_id));
    const signals = await computeSignals([Number(ind.id), ...memberIds], memberIds, since);
    if (!signals.length) {
      console.log("  no signals above threshold");
      continue;
    }
    for (const s of signals) {
      const span = s.windowStart === s.windowEnd ? s.windowStart : `${s.windowStart}→${s.windowEnd}`;
      console.log(
        `  ${s.kind.padEnd(19)} ${span}  ${String(s.magnitude).padStart(6)}  ${s.headline}`
      );
      console.log(`  ${" ".repeat(19)} ${s.detail}  [${s.eventIds.length} events cited]`);
    }
    console.log(`  ${signals.length} signal(s)`);
  }

  await closePool();
}

main().catch(async (err) => {
  // A configuration problem is a sentence, not a stack; anything else keeps its stack,
  // because hiding a real fault to look tidy is how it becomes hard to diagnose.
  const known = configProblem(err);
  console.error(known ? `
signals failed: ${known}` : err);
  await closePool();
  process.exit(1);
});
