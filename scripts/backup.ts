import { config } from "dotenv";
config({ path: ".env.local" });

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { getPool, closePool } from "../lib/db";

/** Keep this many dumps; older ones are pruned after a successful run. */
const KEEP = 14;

/** pg_dump is not on PATH in a default Windows install, so look where it actually lands. */
function findPgDump(): string {
  const fromEnv = process.env.PG_DUMP_PATH;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  const onPath = spawnSync("pg_dump", ["--version"], { encoding: "utf8" });
  if (onPath.status === 0) return "pg_dump";

  const roots = ["C:/Program Files/PostgreSQL", "C:/Program Files (x86)/PostgreSQL"];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const versions = readdirSync(root)
      .filter((v) => /^\d+$/.test(v))
      .sort((a, b) => Number(b) - Number(a)); // newest first
    for (const v of versions) {
      const candidate = join(root, v, "bin", "pg_dump.exe");
      if (existsSync(candidate)) return candidate;
    }
  }
  throw new Error(
    "pg_dump not found. Add it to PATH or set PG_DUMP_PATH in .env.local " +
      "(e.g. C:/Program Files/PostgreSQL/17/bin/pg_dump.exe)"
  );
}

/** Recorded in the log so a dump's contents are verifiable without restoring it. */
async function snapshotCounts(): Promise<string> {
  try {
    const { rows } = await getPool().query(`
      SELECT (SELECT count(*) FROM subjects)           AS subjects,
             (SELECT count(*) FROM events)             AS events,
             (SELECT count(*) FROM event_attestations) AS attestations,
             (SELECT count(*) FROM event_subjects)     AS links,
             (SELECT count(*) FROM event_subjects WHERE relevance IS NOT NULL) AS scored,
             (SELECT count(*) FROM prices)             AS prices`);
    const r = rows[0];
    return `${r.subjects} subjects, ${r.events} events, ${r.attestations} attestations, ${r.links} links (${r.scored} scored), ${r.prices} prices`;
  } catch (err) {
    return `counts unavailable (${(err as Error).message})`;
  } finally {
    await closePool();
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set — see .env.local");
  const db = new URL(url);

  // Default inside the project so OneDrive picks it up; the database itself lives
  // under Program Files and is synced by nothing.
  const outDir = resolve(process.env.BACKUP_DIR ?? "backups");
  mkdirSync(outDir, { recursive: true });

  const contents = await snapshotCounts();

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outFile = join(outDir, `chronolens-${stamp}.dump`);
  const pgDump = findPgDump();

  // -Fc: compressed custom format, restorable whole or table-by-table with pg_restore.
  // Password goes through the environment rather than argv, so it stays out of the
  // process list.
  const result = spawnSync(
    pgDump,
    [
      "-Fc",
      "-h", db.hostname,
      "-p", db.port || "5432",
      "-U", db.username,
      "-d", db.pathname.slice(1),
      "-f", outFile,
    ],
    {
      encoding: "utf8",
      env: { ...process.env, PGPASSWORD: decodeURIComponent(db.password) },
    }
  );

  if (result.status !== 0) {
    throw new Error(`pg_dump failed: ${(result.stderr || result.stdout || "").trim().slice(0, 300)}`);
  }

  const bytes = statSync(outFile).size;
  if (bytes === 0) throw new Error("pg_dump produced an empty file");

  // A dump that cannot be listed cannot be restored — check before pruning old ones.
  const verify = spawnSync(pgDump.replace(/pg_dump(\.exe)?$/i, "pg_restore$1"), ["-l", outFile], {
    encoding: "utf8",
  });
  const entries = verify.status === 0 ? verify.stdout.split("\n").filter((l) => l && !l.startsWith(";")).length : -1;

  console.log(`wrote    ${outFile}`);
  console.log(`size     ${(bytes / 1024).toFixed(0)} KB`);
  console.log(`captured ${contents}`);
  console.log(entries >= 0 ? `verified ${entries} restorable objects` : "verified could not run pg_restore -l");

  if (entries === 0) throw new Error("dump contains no restorable objects");

  const old = readdirSync(outDir)
    .filter((f) => /^chronolens-.*\.dump$/.test(f))
    .sort()
    .slice(0, -KEEP);
  for (const f of old) unlinkSync(join(outDir, f));
  if (old.length) console.log(`pruned   ${old.length} dump(s), keeping the newest ${KEEP}`);

  console.log(`\nrestore with:\n  pg_restore --clean --if-exists -d "$DATABASE_URL" "${outFile}"`);
}

main().catch((err) => {
  console.error("backup failed:", err.message);
  process.exit(1);
});
