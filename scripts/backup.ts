import { config } from "dotenv";
config({ path: ".env.local" });

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { getPool, closePool, configProblem } from "../lib/db";
import { COUNTS_SQL, countsFileFor, countsFromRow, formatCounts, type TableCounts } from "../lib/backupCounts";

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

/**
 * Recorded beside the dump so a restore can be checked against it (NC-152), and printed. Null when
 * the counts could not be read — the dump is still taken, it just has nothing to be compared with.
 */
async function snapshotCounts(): Promise<TableCounts | null> {
  try {
    const { rows } = await getPool().query(COUNTS_SQL);
    return countsFromRow(rows[0]);
  } catch {
    return null;
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
  const outFile = join(outDir, `news-charts-${stamp}.dump`);
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

  // A failed dump must not stay behind: pg_dump creates the file before it connects, and an empty
  // file named like the newest backup is exactly what a rehearsal or a 3am restore would pick up.
  const discard = () => {
    if (existsSync(outFile)) unlinkSync(outFile);
  };
  if (result.status !== 0) {
    discard();
    throw new Error(`pg_dump failed: ${(result.stderr || result.stdout || "").trim().slice(0, 300)}`);
  }

  const bytes = statSync(outFile).size;
  if (bytes === 0) {
    discard();
    throw new Error("pg_dump produced an empty file");
  }

  // A dump that cannot be listed cannot be restored — check before pruning old ones.
  const verify = spawnSync(pgDump.replace(/pg_dump(\.exe)?$/i, "pg_restore$1"), ["-l", outFile], {
    encoding: "utf8",
  });
  const entries = verify.status === 0 ? verify.stdout.split("\n").filter((l) => l && !l.startsWith(";")).length : -1;

  console.log(`wrote    ${outFile}`);
  console.log(`size     ${(bytes / 1024).toFixed(0)} KB`);
  console.log(`captured ${contents ? formatCounts(contents) : "counts unavailable"}`);
  console.log(entries >= 0 ? `verified ${entries} restorable objects` : "verified could not run pg_restore -l");

  /**
   * Nothing is pruned unless the new dump was read back. `entries` is -1 when pg_restore -l could
   * not run at all, and only 0 used to stop the run — so a fortnight of unreadable dumps would
   * have pruned every good one before it, leaving no restorable backup (NC-151).
   */
  if (entries < 0) throw new Error("could not verify the new dump with pg_restore -l — older dumps kept");
  if (entries === 0) throw new Error("dump contains no restorable objects — older dumps kept");
  // What `npm run db:verify-restore` compares a restored copy against.
  if (contents) writeFileSync(countsFileFor(outFile), JSON.stringify({ capturedAt: new Date().toISOString(), counts: contents }, null, 2));

  /**
   * Retention spans every name this project's dumps have carried.
   *
   * The last rename left `chronolens-*.dump` files unmatched by a `news-charts-*` regex, so they
   * were never pruned and had to be deleted by hand — an open item on the checklist for a fortnight.
   * Renaming back would repeat it in the other direction, so both prefixes are recognised.
   *
   * Sorted by the TIMESTAMP rather than the filename: alphabetically every `chronolens-` dump
   * sorts before every `news-charts-` one regardless of date, so a plain `.sort()` here would
   * prune the newest dumps of one prefix while keeping the oldest of the other.
   */
  const DUMP = /^(?:chronolens|news-charts)-(.*)\.dump$/;
  const old = readdirSync(outDir)
    .map((f) => ({ f, stamp: DUMP.exec(f)?.[1] }))
    .filter((x): x is { f: string; stamp: string } => x.stamp !== undefined)
    .sort((a, b) => a.stamp.localeCompare(b.stamp))
    .slice(0, -KEEP)
    .map((x) => x.f);
  for (const f of old) {
    unlinkSync(join(outDir, f));
    if (existsSync(countsFileFor(join(outDir, f)))) unlinkSync(countsFileFor(join(outDir, f)));
  }
  if (old.length) console.log(`pruned   ${old.length} dump(s), keeping the newest ${KEEP}`);

  console.log(`\nrestore with:\n  pg_restore --clean --if-exists -d "$DATABASE_URL" "${outFile}"`);
}

main().catch((err) => {
  // A configuration problem is a sentence, not a stack; anything else keeps its stack,
  // because hiding a real fault to look tidy is how it becomes hard to diagnose.
  const known = configProblem(err);
  console.error(known ? `
backup failed: ${known}` : err);
  process.exit(1);
});
