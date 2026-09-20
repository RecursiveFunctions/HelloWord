import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";

/**
 * Prove sponsor credentials with a real call each.
 * Listing models is not enough — NVIDIA keys have been 200 on GET /v1/models
 * and 403 on POST /chat/completions.
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

type Result = { name: string; ok: boolean; detail: string };

const NVIDIA_MODEL =
  process.env.NVIDIA_MODEL ?? "nvidia/nemotron-3-super-120b-a12b";
const DO_MODEL = process.env.DO_NEMOTRON_MODEL ?? "nemotron-3-nano-30b";
const SNOWFLAKE_MODEL = process.env.SNOWFLAKE_MODEL ?? "claude-sonnet-4-5";

async function jsonOrText(res: Response): Promise<string> {
  const text = await res.text();
  try {
    return JSON.stringify(JSON.parse(text), null, 2).slice(0, 800);
  } catch {
    return text.slice(0, 800);
  }
}

async function chatCompletion(
  baseUrl: string,
  apiKey: string,
  model: string,
): Promise<{ status: number; body: string; content?: string }> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "Reply with the single word pong." }],
      max_tokens: 32,
      temperature: 0,
    }),
  });
  const body = await jsonOrText(res);
  let content: string | undefined;
  try {
    const parsed = JSON.parse(body) as {
      choices?: { message?: { content?: string } }[];
    };
    content = parsed.choices?.[0]?.message?.content;
  } catch {
    /* not json */
  }
  return { status: res.status, body, content };
}

async function smokeNvidia(): Promise<Result> {
  const key = process.env.NVIDIA_API_KEY;
  const base = process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1";
  if (!key) {
    return {
      name: "Nemotron (NVIDIA)",
      ok: false,
      detail:
        "NVIDIA_API_KEY missing. Create a key at https://build.nvidia.com and put it in .env.local. GET /models returning 200 is not enough — new keys have been 403 on /chat/completions.",
    };
  }
  const result = await chatCompletion(base, key, NVIDIA_MODEL);
  if (result.status === 200 && result.content) {
    return {
      name: "Nemotron (NVIDIA)",
      ok: true,
      detail: `${NVIDIA_MODEL} replied: ${result.content.trim().slice(0, 120)}`,
    };
  }
  return {
    name: "Nemotron (NVIDIA)",
    ok: false,
    detail: `POST ${base}/chat/completions → ${result.status}. ${result.body}`,
  };
}

async function smokeDigitalOcean(): Promise<Result> {
  const key = process.env.DO_INFERENCE_KEY;
  const base =
    process.env.DO_INFERENCE_BASE_URL ?? "https://inference.do-ai.run/v1";
  if (!key) {
    return {
      name: "Nemotron failover (DigitalOcean)",
      ok: false,
      detail:
        "DO_INFERENCE_KEY missing. Optional until NVIDIA rate-limits, but this is how DigitalOcean earns its track. Create a model access key (sk-do-...) and confirm the id with GET /v1/models.",
    };
  }
  const result = await chatCompletion(base, key, DO_MODEL);
  if (result.status === 200 && result.content) {
    return {
      name: "Nemotron failover (DigitalOcean)",
      ok: true,
      detail: `${DO_MODEL} replied: ${result.content.trim().slice(0, 120)}`,
    };
  }
  return {
    name: "Nemotron failover (DigitalOcean)",
    ok: false,
    detail: `POST ${base}/chat/completions → ${result.status}. ${result.body}`,
  };
}

async function smokeSnowflake(): Promise<Result> {
  const account = process.env.SNOWFLAKE_ACCOUNT;
  const pat = process.env.SNOWFLAKE_PAT;
  if (!account || !pat) {
    return {
      name: "Snowflake Cortex API",
      ok: false,
      detail:
        "SNOWFLAKE_ACCOUNT or SNOWFLAKE_PAT missing. Sign up at https://signup.snowflake.com/?trial=student (the query param is 120 days, not 30). Then Settings → Programmatic access tokens, and allow a network-policy exception for this laptop/Vercel.",
    };
  }
  const host = account.replace(/\.snowflakecomputing\.com$/i, "");
  const url = `https://${host}.snowflakecomputing.com/api/v2/cortex/v1/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${pat}`,
      "Content-Type": "application/json",
      "X-Snowflake-Authorization-Token-Type": "PROGRAMMATIC_ACCESS_TOKEN",
    },
    body: JSON.stringify({
      model: SNOWFLAKE_MODEL,
      messages: [
        {
          role: "user",
          content: "Reply with the single word pong.",
        },
      ],
      max_completion_tokens: 32,
    }),
  });
  const body = await jsonOrText(res);
  if (res.ok) {
    return {
      name: "Snowflake Cortex API",
      ok: true,
      detail: `${SNOWFLAKE_MODEL} via ${url} → ${res.status}`,
    };
  }
  return {
    name: "Snowflake Cortex API",
    ok: false,
    detail: `${url} → ${res.status}. ${body} If this is a network-policy rejection, add an exception for this IP. Do not use the legacy /api/v2/cortex/inference:complete path.`,
  };
}

async function smokeTiger(): Promise<Result> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return {
      name: "Tiger Cloud",
      ok: false,
      detail:
        "DATABASE_URL missing. In Tiger Console pick Free Plan (not the 30-day trial), us-east-1, download credentials once. Shape: postgres://tsdbadmin:...@HOST:PORT/tsdb?sslmode=require",
    };
  }
  const pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: 1,
  });
  try {
    const ext = await pool.query<{ extname: string }>(
      `select extname from pg_extension
        where extname in ('timescaledb', 'vector', 'vectorscale')
        order by extname`,
    );
    const names = ext.rows.map((r) => r.extname);
    const missing = ["timescaledb", "vector", "vectorscale"].filter(
      (n) => !names.includes(n) && !(n === "vector" && names.includes("vectorscale")),
    );
    // vectorscale CASCADE pulls in pgvector; either vector or vectorscale is enough to start
    const hasVector = names.includes("vector") || names.includes("vectorscale");
    const hasTs = names.includes("timescaledb");
    if (!hasTs || !hasVector) {
      return {
        name: "Tiger Cloud",
        ok: false,
        detail: `Connected, but extensions are ${names.join(", ") || "(none)"}. Need timescaledb plus vector/vectorscale. Missing: ${missing.join(", ")}.`,
      };
    }
    const tables = await pool.query<{ relname: string }>(
      `select relname from pg_class
       where relname in ('source', 'note', 'concept', 'review_event', 'review_daily')`,
    );
    const present = new Set(tables.rows.map((r) => r.relname));
    if (!present.has("source")) {
      return {
        name: "Tiger Cloud",
        ok: true,
        detail: `Connected (${names.join(", ")}). Schema not applied yet — run schema, migrations, then seed as documented in db/README.md.`,
      };
    }
    const expected = ["source", "note", "concept", "review_event", "review_daily"];
    const missingRelations = expected.filter((name) => !present.has(name));
    if (missingRelations.length > 0) {
      return {
        name: "Tiger Cloud",
        ok: false,
        detail: `Schema is incomplete. Missing: ${missingRelations.join(", ")}. Reapply db/schema.sql to an empty service.`,
      };
    }

    const [hypertable, aggregate, policy, migration, indexes] = await Promise.all([
      pool.query(`select 1 from timescaledb_information.hypertables
                  where hypertable_name = 'review_event'`),
      pool.query(`select 1 from timescaledb_information.continuous_aggregates
                  where view_name = 'review_daily'`),
      pool.query(`select 1 from timescaledb_information.jobs
                  where proc_name = 'policy_refresh_continuous_aggregate'
                    and hypertable_name = 'review_daily'`),
      pool.query(`select 1 from information_schema.columns
                  where table_name = 'scheduler_profile'
                    and column_name = 'clock_offset_ms'`),
      pool.query<{ indexname: string }>(
        `select indexname from pg_indexes
         where indexname in ('extract_embedding_idx', 'note_embedding_idx')`,
      ),
    ]);
    const problems = [
      hypertable.rowCount ? null : "review_event is not a hypertable",
      aggregate.rowCount ? null : "review_daily is not a continuous aggregate",
      policy.rowCount ? null : "review_daily refresh policy is missing",
      migration.rowCount ? null : "migration 400_review_clock.sql is missing",
      indexes.rowCount === 2 ? null : "DiskANN indexes are incomplete",
    ].filter(Boolean);
    if (problems.length > 0) {
      return {
        name: "Tiger Cloud",
        ok: false,
        detail: `Connected, but Tiger setup is incomplete: ${problems.join("; ")}.`,
      };
    }
    const events = present.has("review_event")
      ? await pool.query<{ n: string }>(`select count(*)::text as n from review_event`)
      : { rows: [{ n: "0" }] };
    const notes = await pool.query<{ n: string }>(`select count(*)::text as n from note`);
    return {
      name: "Tiger Cloud",
      ok: true,
      detail: `Connected; hypertable, review_daily policy, migration, and DiskANN indexes verified. note rows=${notes.rows[0]?.n ?? "?"}, review_event rows=${events.rows[0]?.n ?? "?"}.`,
    };
  } catch (error) {
    return {
      name: "Tiger Cloud",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await pool.end();
  }
}

async function main() {
  const results = await Promise.all([
    smokeNvidia(),
    smokeDigitalOcean(),
    smokeSnowflake(),
    smokeTiger(),
  ]);

  for (const result of results) {
    const mark = result.ok ? "ok " : "FAIL";
    console.log(`\n[${mark}] ${result.name}\n  ${result.detail}`);
  }

  const required = results.filter((r) => r.name !== "Nemotron failover (DigitalOcean)");
  const requiredFailed = required.filter((r) => !r.ok).length;
  console.log(
    `\n${required.length - requiredFailed}/${required.length} required sponsors ready. DigitalOcean inference is the Nemotron failover and can wait, but it is the DigitalOcean track.`,
  );
  process.exit(requiredFailed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
