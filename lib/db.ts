import { Pool } from "pg";

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
      throw new Error("DATABASE_URL is not set — see .env.local");
    }
    pool = new Pool({ connectionString, max: 4 });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
