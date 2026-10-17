import { Pool, TypeOverrides, types } from "pg";

/**
 * How every pool here parses Postgres values — pass as `types` to `new Pool`.
 *
 * DATE comes back as the 'YYYY-MM-DD' Postgres sent, not a JS Date. node-pg's default builds a
 * Date at *local* midnight, and the readers then took `toISOString().slice(0, 10)` — the previous
 * day on any host east of UTC (NC-100). A calendar date has no time zone and should never pass
 * through one. The readers' string branch (`String(v).slice(0, 10)`) is what now runs.
 */
export const PG_TYPES = new TypeOverrides();
PG_TYPES.setTypeParser(types.builtins.DATE, (value: string) => value);

/**
 * News Charts owns its own database and its own non-superuser role. It shares
 * nothing with any other project on this machine. Both are still named `chronolens`
 * — the live role/database keeps the product's original name across renames;
 * renaming a running Postgres role is owner infrastructure work, not a code change.
 */
let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(MISSING_DATABASE_URL);
    }
    pool = new Pool({ connectionString, max: 4, types: PG_TYPES });
  }
  return pool;
}

/** The one startup failure that is a *configuration state* rather than a fault. */
export const MISSING_DATABASE_URL = "DATABASE_URL is not set — see .env.local";

/**
 * How a script should report a failure it caught on the way up.
 *
 * Returns the message, plus what to do about it, for the conditions an operator is expected to
 * hit and can fix. Returns `null` for everything else — meaning **print the stack**, because an
 * unexpected error is a bug and hiding its stack to look tidy is how a real fault becomes hard
 * to diagnose.
 *
 * This exists because the same missing variable read as a setting in one script and a crash in
 * another: `npm run refresh` printed the sentence while `npm run cost-report` dumped the whole
 * Error object for the identical condition. One rule, applied everywhere, is the fix — not a
 * tidier `catch` in the one script somebody happened to notice.
 */
export function configProblem(err: unknown): string | null {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("DATABASE_URL is not set")) {
    return `${message}\n  Set it in .env.local, or point it at a database: DATABASE_URL=postgresql://…`;
  }
  // A database that is configured but not answering is the other everyday one.
  if (/ECONNREFUSED|ENOTFOUND|password authentication failed|database .* does not exist/i.test(message)) {
    return `${message}\n  The database is configured but did not answer — is Postgres running?`;
  }
  return null;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
