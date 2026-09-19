import { Pool } from "pg";

/**
 * Frozen database access. Tiger Cloud free plan has no connection pooler,
 * so keep `max` low. `sslmode=require` in the URL is not enough for
 * node-postgres — it still validates certs unless told otherwise.
 *
 * Feature branches should import `query` / `pool` from here and not open
 * their own pools.
 */
const connectionString = process.env.DATABASE_URL;

export const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 5,
    })
  : null;

export function dbConfigured(): boolean {
  return pool !== null;
}

export async function query<T extends object = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  if (!pool) {
    throw new Error(
      "DATABASE_URL is not set. Load lib/seed for local UI work, or point .env.local at Tiger Cloud.",
    );
  }
  const result = await pool.query<T>(text, params);
  return result.rows;
}
