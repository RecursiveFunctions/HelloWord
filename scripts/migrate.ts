import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { Pool, type PoolClient } from "pg";

/**
 * Apply `db/migrations/*.sql` to the database in `DATABASE_URL`.
 *
 * This exists because of an outage. Migrations used to be applied by hand with
 * `psql`, while code deployed itself on merge. The store selects explicit
 * column lists, so the first deploy whose code named a column the production
 * database did not have yet took down every route that touched that table -
 * and nothing local could have caught it, because `npm run dev` and the tests
 * run on the in-memory backend, which has no schema to drift from.
 *
 * So the deploy applies its own migrations: `vercel-build` runs this before
 * `next build`, and a migration that fails fails the build, which leaves the
 * previous deployment serving. Code can no longer go live ahead of its schema.
 *
 *   npm run db:migrate   apply whatever is pending
 *   npm run db:status    list applied and pending, change nothing
 *
 * Migrations must be additive and safe to re-run (`if not exists`, `on
 * conflict do nothing`). The first run here meets databases where 100-400 were
 * already applied by hand and never recorded, and simply runs them again.
 *
 * Not handled: `db/schema.sql` and `db/seed.sql`. Bootstrapping an empty
 * service is still the manual sequence in `db/README.md`.
 */

function loadEnvFile(name: string) {
  const path = resolve(process.cwd(), name);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const MIGRATIONS_DIR = resolve(process.cwd(), "db", "migrations");

/** Any constant; it only has to be the same in every process that migrates. */
const ADVISORY_LOCK_KEY = 4_815_162_342;

export function migrationFiles(dir = MIGRATIONS_DIR): string[] {
  return readdirSync(dir)
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10) || a.localeCompare(b));
}

/** The slice of `pg` the runner needs, so a test can hand it something else. */
export type MigrationClient = Pick<PoolClient, "query">;

export async function appliedMigrations(client: MigrationClient): Promise<Set<string>> {
  await client.query(
    `create table if not exists schema_migrations (
       filename   text primary key,
       applied_at timestamptz not null default now()
     )`,
  );
  const result = await client.query(`select filename from schema_migrations`);
  return new Set(result.rows.map((row: { filename: string }) => row.filename));
}

export async function migrate(
  client: MigrationClient,
  options: { dir?: string; log?: (line: string) => void } = {},
): Promise<string[]> {
  const dir = options.dir ?? MIGRATIONS_DIR;
  const log = options.log ?? (() => undefined);

  const bootstrapped = await client.query(`select to_regclass('public.source') as source`);
  if (!bootstrapped.rows[0]?.source) {
    throw new Error(
      "This database has no `source` table, so db/schema.sql was never applied. Migrations only extend an existing schema; bootstrap it first (see db/README.md).",
    );
  }

  const applied = await appliedMigrations(client);
  const ran: string[] = [];
  for (const filename of migrationFiles(dir)) {
    if (applied.has(filename)) continue;
    const sql = readFileSync(resolve(dir, filename), "utf8");
    // One transaction per file: a migration that fails halfway leaves nothing
    // behind, and is not recorded, so the next run starts it clean.
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query(`insert into schema_migrations (filename) values ($1)`, [filename]);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw new Error(
        `Migration ${filename} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    log(`applied ${filename}`);
    ran.push(filename);
  }
  return ran;
}

async function main() {
  const statusOnly = process.argv.includes("--status");
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.log("db:migrate: DATABASE_URL is not set; nothing to migrate (in-memory backend).");
    return;
  }

  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 1 });
  const client = await pool.connect();
  try {
    // Two deployments building at once must not race the same file.
    await client.query(`select pg_advisory_lock($1)`, [ADVISORY_LOCK_KEY]);
    try {
      if (statusOnly) {
        const applied = await appliedMigrations(client);
        for (const filename of migrationFiles()) {
          console.log(`${applied.has(filename) ? "applied" : "PENDING"}  ${filename}`);
        }
        return;
      }
      const ran = await migrate(client, { log: (line) => console.log(`db:migrate: ${line}`) });
      console.log(
        ran.length
          ? `db:migrate: ${ran.length} migration${ran.length === 1 ? "" : "s"} applied.`
          : "db:migrate: schema is up to date.",
      );
    } finally {
      await client.query(`select pg_advisory_unlock($1)`, [ADVISORY_LOCK_KEY]);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

// Imported by the test for `migrate`; only the CLI entry point connects.
if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
