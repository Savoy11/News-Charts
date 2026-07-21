import { config } from "dotenv";
config({ path: ".env.local" });

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getPool, closePool } from "../lib/db";

/** Applies db/*.sql in filename order, once each, inside a transaction per file. */
async function main() {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename    text PRIMARY KEY,
        applied_at  timestamptz NOT NULL DEFAULT now()
      )`);

    const dir = join(process.cwd(), "db");
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    const { rows } = await client.query<{ filename: string }>(
      "SELECT filename FROM schema_migrations"
    );
    const applied = new Set(rows.map((r) => r.filename));

    let ran = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`  skip   ${file} (already applied)`);
        continue;
      }
      const sql = readFileSync(join(dir, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log(`  applied ${file}`);
        ran++;
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`${file} failed: ${(err as Error).message}`);
      }
    }
    console.log(ran ? `\n${ran} migration(s) applied.` : "\nNothing to do — schema is current.");
  } finally {
    client.release();
    await closePool();
  }
}

main().catch((err) => {
  console.error("migrate failed:", err.message);
  process.exit(1);
});
