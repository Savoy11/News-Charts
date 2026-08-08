import { config } from "dotenv";
config({ path: ".env.local" });

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Actually restores a dump instead of merely inspecting it.
 *
 * The `chronolens` role deliberately lacks CREATEDB, so a scratch database isn't an
 * option. Instead the dump's own SQL — DROP and CREATE included, exactly what a real
 * recovery runs — is executed inside a transaction that is then rolled back. Nothing
 * persists, and even in the impossible case of a commit the data written would be the
 * dump of this same database.
 *
 * A backup nobody has ever restored is a guess, not a backup.
 */
function findTool(name: "pg_restore" | "psql"): string {
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

function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set — see .env.local");

  const dir = arg("dir") ?? "backups";
  const file =
    arg("file") ??
    (() => {
      const dumps = readdirSync(dir)
        .filter((f) => f.endsWith(".dump"))
        .sort();
      if (!dumps.length) throw new Error(`no dumps in ${dir} — run npm run db:backup first`);
      return join(dir, dumps[dumps.length - 1]);
    })();

  console.log(`rehearsing ${file}`);

  // 1. expand the dump to the SQL a real restore would run
  const work = mkdtempSync(join(tmpdir(), "chronolens-restore-"));
  const sqlFile = join(work, "restore.sql");
  const expand = spawnSync(
    findTool("pg_restore"),
    ["-f", sqlFile, "--clean", "--if-exists", file],
    { encoding: "utf8" }
  );
  if (expand.status !== 0) {
    throw new Error(`pg_restore could not read the dump: ${(expand.stderr || "").slice(0, 200)}`);
  }

  const sql = readFileSync(sqlFile, "utf8");
  const statements = (sql.match(/^(CREATE|ALTER|DROP|COPY)\s/gim) ?? []).length;

  // 2. run it for real, then throw it away
  const wrapped = join(work, "wrapped.sql");
  writeFileSync(wrapped, `BEGIN;\n${sql}\nROLLBACK;\n`, "utf8");

  const db = new URL(url);
  const run = spawnSync(
    findTool("psql"),
    [
      "-w", "-v", "ON_ERROR_STOP=1", "-q",
      "-h", db.hostname,
      "-p", db.port || "5432",
      "-U", db.username,
      "-d", db.pathname.slice(1),
      "-f", wrapped,
    ],
    { encoding: "utf8", env: { ...process.env, PGPASSWORD: decodeURIComponent(db.password) } }
  );

  const err = (run.stderr || "").trim();
  if (run.status !== 0) {
    console.error(`\nRESTORE FAILED — this backup would not have recovered:\n${err.slice(0, 600)}`);
    process.exit(1);
  }

  console.log(`executed ${statements} DDL/COPY statements against the live server`);
  console.log("transaction rolled back — nothing persisted");
  if (err) console.log(`notices:\n${err.split("\n").slice(0, 3).join("\n")}`);
  console.log("\nRESTORE VERIFIED — this dump is recoverable");
}

try {
  main();
} catch (err) {
  console.error("verify-restore failed:", (err as Error).message);
  process.exit(1);
}
