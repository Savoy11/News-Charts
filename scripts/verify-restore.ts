import { config } from "dotenv";
config({ path: ".env.local" });

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";
import { PG_TYPES } from "../lib/db";
import {
  COUNTS_SQL,
  countMismatches,
  countsFileFor,
  countsFromRow,
  formatCounts,
  sameDatabase,
  type TableCounts,
} from "../lib/backupCounts";

/**
 * Actually restores a dump instead of merely inspecting it — into a database that is not the live
 * one, and then checks that everything came back (NC-152).
 *
 *   RESTORE_TARGET_URL=postgresql://…/news_charts_restore npm run db:verify-restore
 *   npm run db:verify-restore -- --target postgresql://…/news_charts_restore --file backups/….dump
 *
 * This used to replay the dump's SQL against DATABASE_URL inside a transaction it then rolled
 * back. That held exclusive locks on every production table for the whole reload — the DROPs
 * come first — and, because the live database already had the roles and extensions, it proved
 * nothing about restoring to a fresh host. It also never looked at what was restored. Now the
 * target must be a separate, disposable database (it is overwritten), the restore is real, and
 * the restored row counts are compared with the counts the backup recorded beside the dump.
 *
 * The `chronolens` role deliberately lacks CREATEDB, so the scratch database is created once by
 * someone who has it (`createdb -U postgres news_charts_restore`), on this server or another.
 *
 * A backup nobody has ever restored is a guess, not a backup.
 */
function findTool(name: "pg_restore"): string {
  const onPath = spawnSync(name, ["--version"], { encoding: "utf8" });
  if (onPath.status === 0) return name;
  for (const root of ["C:/Program Files/PostgreSQL", "C:/Program Files (x86)/PostgreSQL"]) {
    if (!existsSync(root)) continue;
    for (const v of readdirSync(root)
      .filter((d) => /^\d+$/.test(d))
      .sort((a, b) => Number(b) - Number(a))) {
      const p = join(root, v, "bin", `${name}.exe`);
      if (existsSync(p)) return p;
    }
  }
  throw new Error(`${name} not found — add PostgreSQL's bin directory to PATH`);
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const live = process.env.DATABASE_URL;
  const target = arg("target") ?? process.env.RESTORE_TARGET_URL;
  if (!target) {
    throw new Error(
      "no restore target — set RESTORE_TARGET_URL (or pass --target) to a separate, disposable " +
        "database; it will be overwritten. Create one with: createdb -U postgres news_charts_restore"
    );
  }
  // The one thing this must never do is what it used to do.
  if (live && sameDatabase(live, target)) {
    throw new Error(
      "the restore target is the live database (DATABASE_URL). A rehearsal overwrites its target " +
        "and locks every table while it runs — point RESTORE_TARGET_URL at a scratch database"
    );
  }

  const dir = arg("dir") ?? "backups";
  const file =
    arg("file") ??
    (() => {
      // Newest by TIMESTAMP, not filename — dumps carry every prefix this project has
      // used (`chronolens-*`, `news-charts-*`), and alphabetically one prefix always
      // outranks the other regardless of date. Same rule as backup.ts retention.
      const DUMP = /^(?:chronolens|news-charts)-(.*)\.dump$/;
      const dumps = readdirSync(dir)
        .filter((f) => f.endsWith(".dump"))
        .sort((a, b) => (DUMP.exec(a)?.[1] ?? a).localeCompare(DUMP.exec(b)?.[1] ?? b));
      if (!dumps.length) throw new Error(`no dumps in ${dir} — run npm run db:backup first`);
      return join(dir, dumps[dumps.length - 1]);
    })();

  const t = new URL(target);
  console.log(`rehearsing ${file}\n     into ${t.hostname}:${t.port || "5432"}/${t.pathname.slice(1)}`);

  // A real restore, committed, exactly as recovery would run it. `--no-owner` because a fresh host
  // need not have the roles the dump was taken under; `--single-transaction` so a failure leaves
  // the scratch database as it was rather than half-loaded.
  const restore = spawnSync(
    findTool("pg_restore"),
    [
      "--clean", "--if-exists", "--no-owner", "--single-transaction", "--exit-on-error",
      "-h", t.hostname,
      "-p", t.port || "5432",
      "-U", decodeURIComponent(t.username),
      "-d", decodeURIComponent(t.pathname.slice(1)),
      file,
    ],
    { encoding: "utf8", env: { ...process.env, PGPASSWORD: decodeURIComponent(t.password) } }
  );
  const err = (restore.stderr || "").trim();
  if (restore.status !== 0) {
    console.error(`\nRESTORE FAILED — this backup would not have recovered:\n${err.slice(0, 600)}`);
    process.exit(1);
  }

  // Then the part the old rehearsal never did: did everything come back?
  const pool = new Pool({ connectionString: target, max: 1, types: PG_TYPES });
  let restored: TableCounts;
  try {
    const { rows } = await pool.query(COUNTS_SQL);
    restored = countsFromRow(rows[0]);
  } finally {
    await pool.end();
  }
  console.log(`restored ${formatCounts(restored)}`);

  const sidecar = countsFileFor(file);
  if (!existsSync(sidecar)) {
    console.log(
      "\nRESTORED, NOT COMPARED — this dump has no recorded counts (taken before NC-152, or the\n" +
        "backup could not read them). The restore ran; whether it holds everything is unchecked."
    );
    return;
  }
  const captured = (JSON.parse(readFileSync(sidecar, "utf8")) as { counts: TableCounts }).counts;
  const mismatches = countMismatches(captured, restored);
  if (mismatches.length) {
    console.error(`\nRESTORE INCOMPLETE — the restored copy differs from what was backed up:\n  ${mismatches.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`backed up ${formatCounts(captured)}`);
  console.log("\nRESTORE VERIFIED — the dump restores to a separate database, and every count matches");
}

main().catch((err) => {
  console.error("verify-restore failed:", (err as Error).message);
  process.exit(1);
});
