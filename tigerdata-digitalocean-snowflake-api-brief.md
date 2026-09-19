# Sponsor API Brief: Tiger Data + DigitalOcean + Snowflake

Research date: 2026-09-19. Every claim is sourced from a live docs fetch, a live HTTP probe, or
the npm registry on that date. Anything I could not confirm is marked **[UNVERIFIED]**.

Target stack assumed: Next.js App Router + Node 22, server-side route handlers.

---

## 0. Read this first — five things in the question that are out of date

1. **Tiger Cloud's in-database LLM calls and managed Vectorizer were scheduled for removal on
   June 30, 2026 — that date has passed.** `ai.openai_embed()`, `ai.openai_chat_complete()`,
   `ai.anthropic_generate()`, `ai.voyageai_embed()` and the Tiger-Cloud-managed vectorizer worker
   are all on the removal list. So "does pgai auto-embed a column?" — the *mechanism* still exists,
   but on Tiger Cloud **you now have to run the vectorizer worker yourself** (Docker/CLI), and the
   SQL-callable LLM helpers are gone. Tiger's own current tutorials generate embeddings in
   application code and pass the vector in as a bind parameter.
   ([vectorizer-deprecation](https://www.tigerdata.com/docs/deploy/tiger-cloud/vectorizer-deprecation))
2. **The Snowflake endpoint MLH's own linked demo repo uses is legacy.**
   `POST /api/v2/cortex/inference:complete` has been replaced by
   `POST /api/v2/cortex/v1/chat/completions` (OpenAI spec) and
   `POST /api/v2/cortex/v1/messages` (Anthropic spec).
   ([Cortex REST API](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-rest-api))
   The model IDs in that repo (`claude-3-5-sonnet`, `mistral-large2`, `llama3.1-70b`) are also
   mostly superseded — see §3.3.
3. **DigitalOcean Gradient AI's serverless inference lives on a different host with a different
   credential type.** Base URL is `https://inference.do-ai.run/v1` (not `api.digitalocean.com`),
   and it takes a **model access key** in `sk-do-...` format. Agent endpoints are different again:
   `https://<agent-id>.agents.do-ai.run/api/v1/chat/completions` with an `agent_access_key`. The
   three credential types are not interchangeable.
   ([serverless-inference API ref](https://docs.digitalocean.com/reference/api/reference/serverless-inference/index.html.md))
4. **DigitalOcean's docs have been reorganised out of `/products/gradient-ai-platform/`.** Gradient
   is still the brand name ("DigitalOcean Gradient™ AI Agentic Cloud"), but the live doc trees are
   `/products/inference/` and `/products/ai-platform/`. Old `gradient-ai-platform` deep links 404.
5. **On Tiger Cloud, `pgvector` and `pgvectorscale` are enabled by default but `pgai` is not.**
   You `CREATE EXTENSION` pgai yourself if you want it.
   ([tiger-cloud-extensions](https://www.tigerdata.com/docs/deploy/tiger-cloud/tiger-cloud-aws/tiger-cloud-extensions))

Live probes I ran on 2026-09-19: `https://inference.do-ai.run/v1/models` → 401 (host live, auth
required); `https://cli.tigerdata.com` → 200; `https://mcp.tigerdata.com/docs` → 200.

---

# 1. Tiger Data (formerly Timescale)

## 1.1 What it is now, and the free tier

TimescaleDB the company rebranded to **Tiger Data**; the managed product is **Tiger Cloud**,
administered through **Tiger Console**. A "service" is a Postgres instance with TimescaleDB plus
the vector extensions.

There are two distinct free things, and picking the wrong one costs you on day two:

| | Free Plan | 30-day trial |
| --- | --- | --- |
| Cost | $0, no time limit, **no credit card** | $1000 credit, 30 days, card required before end |
| Services | up to 2 per account | full |
| Storage | 750 MB per service (read-only past that) | full |
| Compute | shared | dedicated |
| Region | `us-east-1` only | all |
| Excluded | connection pooling, replication, data tiering, exporters, metrics, VPC | — |
| Included | pgvector, hypertables, continuous aggregates, columnstore, forks (24h PITR), pg_cron, PostGIS, Insights | — |

Sources: [free plan announcement](https://www.tigerdata.com/blog/introducing-agentic-postgres-free-plan-experiment-ai-on-postgres),
[create-service](https://www.tigerdata.com/docs/get-started/quickstart/create-service).
Free services are flagged beta.

**Sign up:** register at Tiger Console, pick **"Free Plan"** (explicitly *not* the 30-day trial),
click `+ New service`, then `Download the config` — that file (`<service>-credentials.txt`) has
the password, which is shown exactly once. Or from the terminal:

```bash
curl -fsSL https://cli.tigerdata.com | sh    # or: brew install timescale/tap/tiger
tiger auth login
tiger service create
tiger db connection-string <service-id>
```

**Connection string shape** (the default user is `tsdbadmin`, default db is `tsdb`):

```
postgres://tsdbadmin:<password>@<host>:<port>/tsdb?sslmode=require
```

In Next.js, `sslmode=require` in the URL is not enough for `node-postgres` — it still validates
certs unless told otherwise:

```ts
// lib/db.ts
import { Pool } from 'pg' // pg 8.23.0
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5, // free tier has no connection pooler; keep this small
})
```

The "no connection pooling" limitation on the free tier is the one most likely to bite a Next.js
app — serverless/edge invocations each open a connection. Keep `max` low, or run on a long-lived
Node server.

## 1.2 Hypertables

Current idiomatic syntax is `CREATE TABLE ... WITH (tsdb.hypertable)`, not the older
`create_hypertable()` call. The partition column is auto-detected as the first `TIMESTAMP`/
`TIMESTAMPTZ` column.

```sql
CREATE TABLE events (
  time        TIMESTAMPTZ NOT NULL,
  device_id   INT,
  temperature DOUBLE PRECISION
) WITH (tsdb.hypertable);
```

With explicit options:

```sql
CREATE TABLE crypto_ticks (
  "time"     TIMESTAMPTZ,
  symbol     TEXT,
  price      DOUBLE PRECISION,
  day_volume NUMERIC
) WITH (
  tsdb.hypertable,
  tsdb.partition_column = 'time',
  tsdb.chunk_interval   = '1 day',   -- default is 7 days
  tsdb.segmentby        = 'symbol',
  tsdb.orderby          = 'time DESC'
);
```

`tsdb.*` and `timescaledb.*` prefixes both appear in current docs and are equivalent. Creating via
`CREATE TABLE WITH` also auto-creates a columnstore (compression) policy using the chunk interval —
that's where the "90%+ compression" in the MLH blurb comes from, and it's free.

Converting an **existing** populated table still needs the function form:

```sql
SELECT create_hypertable('existing_table', by_range('time'), migrate_data => true);
```

Full options: [CREATE TABLE reference](https://www.tigerdata.com/docs/reference/timescaledb/hypertables/create_table).

## 1.3 Continuous aggregates and `time_bucket`

```sql
CREATE MATERIALIZED VIEW events_hourly
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', time) AS bucket,
  device_id,
  avg(temperature)                AS avg_temp,
  max(temperature) - min(temperature) AS spread
FROM events
GROUP BY bucket, device_id;

SELECT add_continuous_aggregate_policy('events_hourly',
  start_offset      => INTERVAL '1 month',
  end_offset        => INTERVAL '1 hour',   -- exclude the hot bucket
  schedule_interval => INTERVAL '1 hour');
```

`start_offset` must be greater than `end_offset`. Setting `end_offset => NULL` is possible but
discouraged; to serve up-to-the-second data, enable real-time aggregation instead. Full parameter
list (including `buckets_per_batch`, `refresh_newest_first`, `timezone`):
[add_continuous_aggregate_policy](https://www.tigerdata.com/docs/reference/timescaledb/continuous-aggregates/add_continuous_aggregate_policy).

This is the single highest-leverage Tiger feature for a hackathon dashboard: the MLH prize copy
calls out "Instant Dashboards: ... pre-computed Continuous Aggregates" by name.

Integer time columns work too, but you must supply `set_integer_now_func` before creating the
aggregate ([time-and-continuous-aggregates](https://www.tigerdata.com/docs/learn/continuous-aggregates/time-and-continuous-aggregates)).

## 1.4 pgvector / pgvectorscale (StreamingDiskANN)

**Availability:** pgvector and pgvectorscale are enabled by default on Tiger Cloud services,
including free ones. `pg_textsearch` (BM25) and `pgai` are available but off by default.

```sql
CREATE EXTENSION IF NOT EXISTS vectorscale CASCADE;  -- CASCADE pulls in pgvector
CREATE EXTENSION IF NOT EXISTS pg_textsearch;        -- optional, for BM25
```

Index types available to you:

| Index | Syntax | Notes |
| --- | --- | --- |
| StreamingDiskANN | `USING diskann (embedding vector_cosine_ops)` | pgvectorscale. Graph lives on disk, so it doesn't need to fit in RAM. Recommended default. |
| HNSW | `USING hnsw (embedding vector_cosine_ops)` | pgvector. Needs the index in memory. |
| IVFFlat | `USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)` | pgvector. |

Operator must match the opclass: `vector_cosine_ops` → `<=>`, `vector_l2_ops` → `<->`,
`vector_ip_ops` → `<#>`. Inner-product indexes are incompatible with plain storage.

```sql
CREATE TABLE documents (
  id        BIGINT PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
  contents  TEXT,
  embedding VECTOR(1536)          -- OpenAI text-embedding-3-small
);

CREATE INDEX documents_embedding_idx ON documents
  USING diskann (embedding vector_cosine_ops);

-- optional tuning
CREATE INDEX ... USING diskann (embedding) WITH (num_neighbors = 50);
-- label-filtered search (Filtered DiskANN)
CREATE INDEX ... USING diskann (embedding vector_cosine_ops, labels);
```

Semantic search query — note the embedding comes from your app, as a bind parameter:

```sql
SELECT id, contents, 1 - (embedding <=> $1::vector) AS similarity
FROM documents
ORDER BY embedding <=> $1::vector
LIMIT 10;
```

Recall/latency knob, per transaction:

```sql
SET LOCAL diskann.query_rescore = 150;
```

From a Next.js route handler:

```ts
// app/api/search/route.ts
import OpenAI from 'openai' // openai 7.19.0
import { pool } from '@/lib/db'

const openai = new OpenAI()

export async function POST(req: Request) {
  const { q } = await req.json()
  const { data } = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: q,
  })
  // pgvector's text input format is '[1,2,3]' — JSON.stringify of a number[] matches it
  const vec = JSON.stringify(data[0].embedding)

  const { rows } = await pool.query(
    `SELECT id, contents, 1 - (embedding <=> $1::vector) AS similarity
       FROM documents
      ORDER BY embedding <=> $1::vector
      LIMIT 10`,
    [vec],
  )
  return Response.json(rows)
}
```

Sources: [pgvectorscale README](https://github.com/timescale/pgvectorscale),
[pgvector vs pgvectorscale](https://www.tigerdata.com/docs/learn/search/pgvector-pgvectorsearch),
[hybrid search tutorial](https://www.tigerdata.com/docs/build/examples/hybrid-search).

### Hybrid search (BM25 + vector) with reciprocal rank fusion

Tiger's own tutorial pattern, worth stealing wholesale because it demos two Tiger-specific
extensions at once:

```sql
CREATE INDEX episodes_bm25_idx ON episodes
  USING bm25(description) WITH (text_config = 'english');
CREATE INDEX episodes_embedding_idx ON episodes
  USING diskann (embedding vector_cosine_ops);

WITH bm25_results AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY description <@> 'mental health boundaries') AS rank
  FROM episodes ORDER BY description <@> 'mental health boundaries' LIMIT 20
),
vector_results AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY embedding <=> $1) AS rank
  FROM episodes ORDER BY embedding <=> $1 LIMIT 20
)
SELECT d.id, d.title,
       COALESCE(1.0 / (60 + b.rank), 0) + COALESCE(1.0 / (60 + v.rank), 0) AS rrf_score
FROM episodes d
LEFT JOIN bm25_results   b ON d.id = b.id
LEFT JOIN vector_results v ON d.id = v.id
WHERE b.id IS NOT NULL OR v.id IS NOT NULL
ORDER BY rrf_score DESC
LIMIT 10;
```

`<@>` is the BM25 distance operator from `pg_textsearch`. It doesn't support phrase queries —
over-fetch and post-filter with `ILIKE` if you need them.

## 1.5 pgai Vectorizer — yes it auto-embeds, but read the caveat

A vectorizer installs triggers on your source table, so inserts/updates enqueue work, and a
background worker fills in embeddings. Two destination shapes:

```sql
-- Table destination (default): separate _store table + a joining view, supports chunking
SELECT ai.create_vectorizer(
  'website.blog'::regclass,
  name        => 'website_blog_vectorizer',
  loading     => ai.loading_column('contents'),
  embedding   => ai.embedding_openai('text-embedding-3-small', 1536),
  chunking    => ai.chunking_character_text_splitter(128, 10),
  formatting  => ai.formatting_python_template('title: $title published: $published $chunk'),
  indexing    => ai.indexing_diskann(),
  destination => ai.destination_table(
    target_table => 'blog_embeddings_store',
    view_name    => 'blog_embeddings'
  )
);

-- Column destination: embedding column on the source table. Requires chunking_none().
SELECT ai.create_vectorizer(
  'website.product_descriptions'::regclass,
  loading     => ai.loading_column('description'),
  embedding   => ai.embedding_openai('text-embedding-3-small', 768),
  chunking    => ai.chunking_none(),
  destination => ai.destination_column('description_embedding')
);
```

**Embedding providers** (`docs/vectorizer/api-reference.md` in `timescale/pgai`):

| Function | Provider |
| --- | --- |
| `ai.embedding_openai(model, dims)` | OpenAI |
| `ai.embedding_ollama(model, dims)` | Ollama — **not supported on Tiger Cloud**, self-host only |
| `ai.embedding_voyageai(model, dims)` | Voyage AI (`voyage-3.5-lite`, `voyage-3.5`, `voyage-3-large`, `voyage-code-3`, `voyage-finance-2`, `voyage-law-2`; 1024 dims, `output_dimension` supports 256/512/1024/2048 via Matryoshka) |
| `ai.embedding_litellm(...)` | LiteLLM → many providers |

**The caveat.** On Tiger Cloud the *managed* worker is deprecated with a stated removal date of
June 30, 2026, which has passed. To use a vectorizer today you self-run the worker:

```bash
docker run --env-file .env \
  timescale/pgai-vectorizer-worker:latest \
  --db-url "postgres://tsdbadmin:<pw>@<host>:<port>/tsdb?sslmode=require" \
  --poll-interval 5m -c 4
```

and set existing vectorizers to `scheduling: none`. For a weekend hackathon on a Next.js app, the
simpler and more robust path is **skip the vectorizer entirely** — embed in your API route and
`INSERT` the vector. That is exactly what Tiger's own current hybrid-search tutorial does.

Source: [vectorizer API reference](https://github.com/timescale/pgai/blob/main/docs/vectorizer/api-reference.md),
[deprecation + migration](https://www.tigerdata.com/docs/deploy/tiger-cloud/vectorizer-deprecation).

## 1.6 Tiger MCP, Tiger CLI, Tiger Agents

**Tiger MCP** ships *inside* the Tiger CLI binary. It exposes:
- service tools: `service_list`, `service_get`, `service_create`, `service_fork`, `service_resize`,
  `service_start`, `service_stop`, `service_update_password`, `service_logs`
- db tools: `db_execute_query` (supports DML and DDL; multi-statement when no `parameters`), `db_schema`
- knowledge: `search_docs`, `view_skill` (built-in skills for schema design, hypertable setup,
  migration planning)

```bash
tiger mcp install       # auto-configures Cursor / Claude Code / VS Code
tiger mcp start         # manual: point your client's JSON config at this
tiger mcp get <tool>    # current schema for a tool
```

Read-only mode disables all mutating service tools and runs DB sessions in Tiger Cloud's immutable
read-only mode. There's also a **hosted docs-only MCP** at `https://mcp.tigerdata.com/docs`
(returned 200 when I probed it) that you can point an agent at without auth.

Refs: [MCP quickstart](https://www.tigerdata.com/docs/get-started/quickstart/mcp-cli),
[Tiger MCP tool reference](https://www.tigerdata.com/docs/reference/tiger-cloud/tiger-mcp).

**Zero-copy forks** (Fluid Storage, copy-on-write) are on the free plan and are a genuinely
demo-able differentiator:

```bash
tiger service fork <service-id> --now            # or --last-snapshot / --to-timestamp
```

There's a GitHub Action too: `timescale/fork-service@v1`, which outputs `host`, `port`, and
`initial_password` for an ephemeral test DB per PR.

**"Tiger Agents"** is `timescale/tiger-agents-for-work` — a Python library/CLI for Slack-native
agents with Postgres-backed durable, exactly-once event handling and bounded concurrency
(Apache-2.0, v0.2.10 as of 2026-07-16). Built on pydantic-ai. **It is Python, not Node**, so it's
a sidecar rather than something you embed in a Next.js app. "Tiger Eon" is the turnkey
Slack+GitHub+Linear deployment of it.

---

# 2. DigitalOcean

## 2.1 Gradient AI — serverless inference

**Yes, it is OpenAI-compatible.** Two credential types, do not mix them up:

| Surface | Base URL | Credential |
| --- | --- | --- |
| Serverless inference | `https://inference.do-ai.run/v1` | model access key, `sk-do-...` (a DO PAT `dop_v1_*` also works) |
| Agent endpoint | `https://<agent>.agents.do-ai.run/api/v1` | `agent_access_key`, scoped to that agent |
| Control plane (create agents, KBs, droplets) | `https://api.digitalocean.com` | DO OAuth token `dop_v1_*` |

Endpoints on `inference.do-ai.run`:

| Path | Method | Purpose |
| --- | --- | --- |
| `/v1/models` | GET | list model IDs your account can call |
| `/v1/chat/completions` | POST | OpenAI Chat Completions |
| `/v1/responses` | POST | OpenAI Responses API |
| `/v1/messages` | POST | Anthropic Messages (set `ANTHROPIC_BASE_URL` for Claude Code) |
| `/v1/embeddings` | POST | OpenAI-compatible embeddings, 1–2048 inputs |
| `/v1/images/generations` | POST | image gen |

Rate limits documented on the embeddings response: **5000 req/hour, 250 req/minute**, surfaced in
`ratelimit-limit` / `ratelimit-remaining` / `ratelimit-reset` headers.

Next.js route handler using the stock `openai` SDK:

```ts
// app/api/chat/route.ts
import OpenAI from 'openai'

const client = new OpenAI({
  baseURL: 'https://inference.do-ai.run/v1',
  apiKey: process.env.MODEL_ACCESS_KEY,   // sk-do-...
})

export async function POST(req: Request) {
  const { messages } = await req.json()
  const stream = await client.chat.completions.create({
    model: 'llama-4-maverick',
    messages,
    stream: true,
    max_completion_tokens: 1024,   // note: max_completion_tokens, not max_tokens
  })
  return new Response(stream.toReadableStream())
}
```

Discover valid IDs at runtime rather than hardcoding — availability is account-scoped:

```bash
curl -s -H "Authorization: Bearer $MODEL_ACCESS_KEY" \
  https://inference.do-ai.run/v1/models | jq '.data[].id'
```

There is also a first-party `@digitalocean/dots` npm package (v1.19.0) exporting `InferenceClient`,
but the plain `openai` SDK is the lower-risk choice for a hackathon.

**Model IDs** (from [Supported Models](https://docs.digitalocean.com/products/inference/details/models/index.html.md),
70+ total — this is a selection, confirm against `/v1/models`):

| Family | IDs |
| --- | --- |
| Anthropic | `anthropic-claude-opus-5`, `anthropic-claude-opus-4.8`, `anthropic-claude-5-sonnet`, `anthropic-claude-4.6-sonnet`, `anthropic-claude-4.5-sonnet`, `anthropic-claude-haiku-4.5`, `anthropic-claude-fable-5.1` |
| OpenAI | `openai-gpt-6-astra`, `openai-gpt-5.6-sol` / `-terra` / `-luna`, `openai-gpt-5.5`, `openai-gpt-5.4` (+`-mini`/`-nano`/`-pro`), `openai-gpt-5.3-codex`, `openai-gpt-5.2`, `openai-gpt-5`, `openai-gpt-5-mini`, `openai-gpt-4.1` |
| Meta | `llama-4-maverick`, `llama3-8b-instruct` |
| Mistral | `mistral-3-14B`, `ministral-3-8b-instruct-2512`, `mistral-7b-instruct-v0.3` |
| **NVIDIA Nemotron** | `nemotron-3-ultra-550b`, `nemotron-3-nano-30b`, `nemotron-3-nano-omni`, `nemotron-nano-12b-v2-vl` |
| Embeddings | `qwen3-embedding-0.6b` (plus BAAI / Intfloat / UKP Lab models) |

Gotcha worth flagging: several OpenAI models are **Responses-API-only** on serverless inference
(`openai-gpt-6-astra`, `openai-gpt-5.5`, the GPT-5.4 family), while the GPT-5.6 family is
**Chat-Completions-only**. Check the "Usage Notes" column before wiring one up.

**Answering your Nemotron question directly: you do not need a GPU Droplet to run Nemotron.**
Nemotron 3 Ultra 550B and the Nano variants are all available through serverless inference at
`inference.do-ai.run`. Renting an H100 to self-host Nemotron for a hackathon would be a mistake —
see §2.6.

## 2.2 Agents and knowledge bases (RAG)

Agents are created in the control panel (Create → Agents): name, instructions (≤10,000 chars),
model, workspace, optional knowledge bases, optional VPC. Then generate an **Endpoint Access Key**
under the agent's Settings → Endpoint Access Keys, and call:

```bash
curl -X POST "$AGENT_ENDPOINT/api/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AGENT_ACCESS_KEY" \
  -d '{
    "messages": [{"role": "user", "content": "What is our refund policy?"}],
    "stream": false,
    "include_retrieval_info": true,
    "include_functions_info": true,
    "include_guardrails_info": true
  }'
```

`include_retrieval_info: true` returns the knowledge-base chunks and source files used — that's
your citations UI for free. From the OpenAI SDK, point `baseURL` at `$AGENT_ENDPOINT/api/v1/`
(don't append `/chat/completions`), pass `model: 'n/a'`, and put the flags in `extra_body`.

**Knowledge bases** are the managed RAG store. Data sources: file upload, Spaces bucket/folder,
web URL or sitemap crawl (crawler UA `DigitalOceanGradientAICrawler/1.0`, ≤5,500 pages, respects
`robots.txt`), Dropbox, Amazon S3. Formats: `.csv .pdf .docx .md .html .json .jsonl`. Vectors are
stored in a **managed OpenSearch cluster** you create or reuse — budget roughly 2× your source
dataset size. Optional reranking model, billed per request. Most Agent Platform infra sits in
**TOR1**, so co-locate.

You can also flip an agent's endpoint to Public, which generates a copy-pasteable HTML chatbot
embed snippet — a fast way to get a demo-able UI.

Refs: [Inference quickstart](https://docs.digitalocean.com/products/inference/getting-started/quickstart/),
[use agents](https://docs.digitalocean.com/products/inference/how-to/use-agents/),
[agent-inference API ref](https://docs.digitalocean.com/reference/api/reference/agent-inference/index.html.md).

## 2.3 App Platform — deploying Next.js

App Platform detects Node and uses the Heroku Node.js buildpack (v342). Default runtime is
**Node 22.x**; pin it in `package.json` `engines` to avoid surprises. It runs `npm ci` by default
(set `USE_NPM_INSTALL=true` at `BUILD_TIME` scope to change that).

**The two things that break Next.js deploys:**
1. The new buildpack already runs `npm run build` automatically. A `build_command: npm run build`
   in the spec runs *after* that, i.e. twice. Omit it unless you're overriding.
2. Your server must bind `0.0.0.0` on `process.env.PORT`, not `localhost`. App Platform injects
   `PORT` from `http_port`. `next start` honours `PORT`, so this is usually fine — but if you
   hardcoded 3000 and left `http_port` at its 8080 default, the health check fails.

`.do/app.yaml`:

```yaml
name: my-hack-app
region: nyc
features:
  - new-nodejs-buildpack=true
services:
  - name: web
    environment_slug: node-js
    github:
      repo: your-org/your-repo
      branch: main
      deploy_on_push: true
    source_dir: /
    run_command: npm start
    http_port: 3000
    instance_count: 1
    instance_size_slug: apps-s-1vcpu-1gb
    envs:
      - key: MODEL_ACCESS_KEY
        scope: RUN_TIME
        type: SECRET
      - key: DATABASE_URL
        scope: RUN_AND_BUILD_TIME
        value: ${db.DATABASE_URL}
    health_check:
      http_path: /api/health
```

Deploy with `doctl apps create --spec .do/app.yaml`. Full field list:
[app-spec reference](https://docs.digitalocean.com/products/app-platform/reference/app-spec/).

**Credits:** MLH's prize copy says signing up gets **$200 in free credits** via
`https://try.digitalocean.com/freetrialoffer/`. When I fetched that landing page on 2026-09-19 it
had been rewritten as a generic "AI-Native Cloud" page and did not state the $200 figure, so
treat the amount as MLH's claim rather than a confirmed DO offer — **[UNVERIFIED]**.

## 2.4 Spaces (S3-compatible object storage)

Endpoint is `https://<region>.digitaloceanspaces.com`. The `region` field in the SDK is an AWS
region name and must be `us-east-1` when creating a bucket; the *actual* DO datacenter comes from
the endpoint hostname. Use virtual-hosted style (`forcePathStyle: false`).

```ts
// lib/spaces.ts
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3' // 3.1136.0
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export const spaces = new S3Client({
  endpoint: 'https://nyc3.digitaloceanspaces.com',
  region: 'us-east-1',
  forcePathStyle: false,
  credentials: {
    accessKeyId: process.env.SPACES_KEY!,
    secretAccessKey: process.env.SPACES_SECRET!,
  },
})

export async function presignUpload(key: string, contentType: string) {
  return getSignedUrl(
    spaces,
    new PutObjectCommand({ Bucket: 'my-space', Key: key, ContentType: contentType }),
    { expiresIn: 600 },
  )
}
```

Nice synergy: a Spaces bucket can be attached directly as a knowledge-base data source (§2.2), so
"user uploads a PDF → Space → KB indexes it → agent answers about it" needs no glue code.

Ref: [Spaces with AWS SDKs](https://docs.digitalocean.com/products/spaces/how-to/use-aws-sdks/index.html.md).

## 2.5 Managed Postgres and Valkey

| | Postgres | Valkey (Redis-compatible) |
| --- | --- | --- |
| Smallest single-node | $15.15/mo, 1 GiB / 1 vCPU / 10 GiB | $15.00/mo, 1 GiB / 1 vCPU / 10 GiB |
| HA starts at | $30/mo primary + $30/mo standby | $30/mo + standby |
| Extra storage | $0.215/GiB/mo | — |
| Versions | Standard: PG 14–18. Advanced: 16–18, new default 18 | — |
| Connections | 1 GiB → 22 backend connections; 25 per GiB minus 3 reserved | 10,000 simultaneous on 1 GiB, but only 200 new conns/sec/CPU |
| Pooling | Built-in PgBouncer, 21 pools, up to 1,000 conns. Use **transaction** mode. | none native; pool client-side |

Max 3 nodes per Postgres cluster. Database traffic doesn't count against bandwidth allowance.

With a 1 GiB plan giving you 22 raw connections, **create a PgBouncer pool in transaction mode and
point `DATABASE_URL` at the pool**, not the primary — otherwise a few concurrent Next.js
invocations will exhaust it.

Refs: [Managed DB pricing](https://www.digitalocean.com/pricing/managed-databases),
[PG limits](https://docs.digitalocean.com/products/databases/postgresql/details/limits/index.html.md),
[connection pools](https://docs.digitalocean.com/products/databases/postgresql/how-to/manage-connection-pools/).

## 2.6 GPU Droplets

On-demand, per-second billing with a 60-second / $0.01 minimum. **Powered-off droplets still bill** —
destroy, don't stop.

| GPU | $/hour | Available in |
| --- | --- | --- |
| NVIDIA RTX 4000 Ada | $0.76 | TOR1 |
| NVIDIA L40S / RTX 6000 Ada | $1.57 | TOR1 |
| AMD MI300X | $2.59 | ATL1 |
| AMD MI325X | $3.80 | NYC2, SFO3, TOR1, ATL1 |
| NVIDIA H100 | $4.41 ($35.28 for 8×) | NYC2, AMS3, TOR1 |
| NVIDIA H200 | $4.47 ($35.76 for 8×) | NYC2, ATL1 |
| NVIDIA B300 | $11.19 | RIC1, MKC1 |

Relevance to Nemotron: **none, for a hackathon.** Nemotron 3 Ultra / Nano are already on serverless
inference (§2.1), so a GPU Droplet only makes sense if you're fine-tuning or running a model DO
doesn't host. If you do spin one up, set a calendar alarm — an idle 8×H100 is $35/hour.

Refs: [Droplet pricing](https://docs.digitalocean.com/products/droplets/details/pricing/),
[GPU availability by region](https://docs.digitalocean.com/products/droplets/details/availability/).

---

# 3. Snowflake

## 3.1 The single-curl claim, corrected

MLH says "a single CURL command to Snowflake's REST API". That's true, but the endpoint has
changed since MLH's demo repo was written.

```bash
curl "https://<account-identifier>.snowflakecomputing.com/api/v2/cortex/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SNOWFLAKE_PAT" \
  -d '{
    "model": "claude-sonnet-4-5",
    "messages": [
      {"role": "user", "content": "How does a snowflake get its unique pattern?"}
    ]
  }'
```

Anthropic-shaped alternative (Claude models only):

```bash
curl "https://<account-identifier>.snowflakecomputing.com/api/v2/cortex/v1/messages" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SNOWFLAKE_PAT" \
  -H "anthropic-version: 2023-06-01" \
  -d '{"model":"claude-sonnet-4-5","max_tokens":1024,
       "messages":[{"role":"user","content":"hi"}]}'
```

| | Chat Completions | Messages |
| --- | --- | --- |
| Path | `/api/v2/cortex/v1/chat/completions` | `/api/v2/cortex/v1/messages` |
| Spec | OpenAI | Anthropic |
| Models | all (OpenAI, Claude, Llama, Mistral, DeepSeek, Snowflake) | Claude only |
| SDK | `openai` Python/JS | `anthropic` Python/JS |

Both share auth, model catalog, and rate limits. `max_tokens` is deprecated on Chat Completions —
use `max_completion_tokens`.

## 3.2 Auth: PAT vs keypair JWT

Three options; all set `Authorization: Bearer <token>` and optionally
`X-Snowflake-Authorization-Token-Type`.

| Method | Header value | Setup cost |
| --- | --- | --- |
| **PAT** | `PROGRAMMATIC_ACCESS_TOKEN` | ~1 minute in the UI. **Use this for a hackathon.** |
| Keypair JWT | `KEYPAIR_JWT` | generate RSA keypair, assign public key, compute SHA256 fingerprint, sign a JWT with `iss = ACCOUNT.USER.SHA256:fp`, `sub = ACCOUNT.USER`, max 1 hour lifetime |
| OAuth | `OAUTH` | full OAuth integration |

Generate a PAT at `https://app.snowflake.com/_deeplink/settings/authentication` → Programmatic
access tokens → Generate new token. **Set the network policy exception** or requests from your
laptop/Vercel will be rejected. Note that PAT generation requires the user's authentication policy
to include `'PROGRAMMATIC_ACCESS_TOKEN'`; on a fresh trial account it does by default, but if it
fails:

```sql
ALTER ACCOUNT SET AUTHENTICATION_POLICY = ...  -- must include 'PROGRAMMATIC_ACCESS_TOKEN'
```

**Authorization**, separate from authentication: your **default role** must hold
`SNOWFLAKE.CORTEX_USER` (granted to `PUBLIC` by default, so usually already true) or the narrower
`SNOWFLAKE.CORTEX_REST_API_USER`. REST requests use the user's default role, so:

```sql
ALTER USER my_user SET DEFAULT_ROLE = my_role;
```

Your account identifier is in the UI under your name → "Connect a tool to Snowflake".

Refs: [REST auth](https://docs.snowflake.com/en/developer-guide/snowflake-rest-api/authentication),
[PATs](https://docs.snowflake.com/en/user-guide/programmatic-access-tokens).

## 3.3 Models available via Cortex

Extracted from the Model availability tables on the
[Cortex REST API page](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-rest-api).
Availability is **per cloud and per region** — the doc is a grid, not a flat list, so verify in
Cortex Playground (`https://app.snowflake.com/_deeplink/#/cortex/playground`) for your account.

| Family | Model IDs |
| --- | --- |
| Anthropic | `claude-opus-5`, `claude-opus-4-8`, `claude-opus-4-7`, `claude-opus-4-6`, `claude-opus-4-5`, `claude-sonnet-5`, `claude-sonnet-4-6`, `claude-sonnet-4-5`, `claude-4-sonnet`, `claude-haiku-4-5`, `claude-fable-5-1`, `claude-fable-5` |
| OpenAI | `openai-gpt-6-astra`, `openai-1p-gpt-5.6-luna` / `-sol` / `-terra`, `openai-gpt-5.5`, `openai-gpt-5.4`, `openai-gpt-5.2`, `openai-gpt-5.1`, `openai-gpt-5`, `openai-gpt-5-mini`, `openai-gpt-5-nano`, `openai-gpt-4.1` |
| Meta | `llama4-maverick`, `llama3.1-8b`, `llama3.1-70b`, `llama3.1-405b` |
| Mistral | `mistral-large2`, `mistral-large`, `mistral-7b` |
| DeepSeek | `deepseek-v4-flash`, `deepseek-r1` |
| Snowflake | `snowflake-llama-3.3-70b` |

Snowflake applies "legacy dates": after a model's legacy date, only accounts that already called it
can keep doing so. Usage is queryable via `CORTEX_REST_API_USAGE_HISTORY` in Account Usage — note
that REST API calls do **not** write to `AI_OBSERVABILITY_EVENTS`.

## 3.4 Cortex Search (RAG service)

```bash
curl --location "https://<ACCOUNT_URL>/api/v2/databases/<DB>/schemas/<SCHEMA>/cortex-search-services/<SERVICE>:query" \
  --header 'Content-Type: application/json' \
  --header 'Accept: application/json' \
  --header "Authorization: Bearer $PAT" \
  --data '{
    "query": "how do I reset my password",
    "columns": ["chunk", "doc_url"],
    "filter": {"@eq": {"lang": "en"}},
    "limit": 5
  }'
```

SQL preview equivalent, handy for iterating in a worksheet:

```sql
SELECT PARSE_JSON(
  SNOWFLAKE.CORTEX.SEARCH_PREVIEW('my_search_service',
    '{"query":"preview query","columns":["col1","col2"],"limit":10}')
)['results'] AS results;
```

Ref: [query a Cortex Search service](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-search/query-cortex-search-service).

## 3.5 Cortex Analyst and Cortex Agents

**Cortex Analyst** (natural language → SQL over a semantic model):

```
POST /api/v2/cortex/analyst/message
```

Body takes `messages[].role` (`user` only), `messages[].content[]` with `{type:"text", text:"..."}`,
plus one of `semantic_model_file` (a `@db.schema.stage/model.yaml` path), `semantic_model` (inline
YAML string), `semantic_view` (a name), or `semantic_models[]` for several. Response content blocks
come back typed `text`, `suggestions`, or `sql`.

Headers: `Authorization`, `Content-Type: application/json`, optional
`X-Snowflake-Authorization-Token-Type`.

**Note:** the Analyst docs now open with "Snowflake recommends transitioning to Cortex Agents,
which supports every Cortex Analyst capability with higher answer quality."

**Cortex Agents** (orchestrates Analyst + Search + tools):

```
POST /api/v2/cortex/agent:run                                        # inline config, no agent object
POST /api/v2/databases/{db}/schemas/{schema}/agents/{name}:run       # saved agent object
GET  /api/v2/cortex/agent/runs/{run_id}                              # stream a background run
```

```bash
curl -X POST "$HOST/api/v2/cortex/agent:run" \
  -H "Authorization: Bearer $PAT" \
  -H "Content-Type: application/json" -H "Accept: application/json" \
  -d '{
    "messages":[{"role":"user","content":[{"type":"text","text":"What is total revenue for 2025?"}]}],
    "models":{"orchestration":"claude-4-sonnet"},
    "stream": false,
    "tools": [], "tool_resources": {}
  }'
```

SSE streaming is the default; set `"stream": false` for one JSON response. Saved-agent calls need
`thread_id` and a unique `parent_message_id` (start at `0`). `X-Snowflake-Role` overrides the
default role for a request.

Refs: [Analyst REST API](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-analyst/rest-api),
[Agents Run API](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-run).

## 3.6 SQL-side AI: AI_EMBED, VECTOR, VECTOR_COSINE_SIMILARITY, AI_COMPLETE

`EMBED_TEXT_768` / `EMBED_TEXT_1024` still exist but **`AI_EMBED(model, input)` is the current
function** and supersedes them. It also does images via `TO_FILE`.

Text embedding models: `snowflake-arctic-embed-l-v2.0` (1024, multilingual),
`snowflake-arctic-embed-l-v2.0-8k`, `snowflake-arctic-embed-m-v1.5` (768),
`snowflake-arctic-embed-m` (768), `e5-base-v2` (768), `nv-embed-qa-4` (1024),
`voyage-multilingual-2` (1024, 32k context). Images: `voyage-multimodal-3`.

Similarity functions: `VECTOR_COSINE_SIMILARITY`, `VECTOR_INNER_PRODUCT`, `VECTOR_L1_DISTANCE`,
`VECTOR_L2_DISTANCE`. These are free — no token cost.

```sql
ALTER TABLE issues ADD COLUMN issue_vec VECTOR(FLOAT, 768);
UPDATE issues SET issue_vec = AI_EMBED('snowflake-arctic-embed-m', issue_text);

SELECT issue,
       VECTOR_COSINE_SIMILARITY(
         issue_vec,
         AI_EMBED('snowflake-arctic-embed-m', 'could not install app on phone')
       ) AS similarity
FROM issues
ORDER BY similarity DESC
LIMIT 5;
```

Put the similarity call in `SELECT`, not `WHERE` — in `WHERE` it evaluates over every row. Alias it
and filter on the alias.

`AI_COMPLETE` is the current completion function (supersedes `SNOWFLAKE.CORTEX.COMPLETE`, which
still works):

```sql
SELECT AI_COMPLETE(
  model            => 'llama3.3-70b',
  prompt           => 'Summarise: ' || content,
  model_parameters => {'temperature': 0.2, 'max_tokens': 512, 'guardrails': true},
  response_format  => TYPE OBJECT(summary STRING, sentiment STRING),
  show_details     => TRUE
) FROM reviews LIMIT 10;
```

`response_format` accepts either a SQL `TYPE OBJECT(...)` literal or a JSON-schema object — both
give you structured output without prompt-engineering JSON. `guardrails: true` enables Cortex Guard
(Llama Guard 3), billed on input tokens. Requires `SNOWFLAKE.CORTEX_USER` or
`SNOWFLAKE.CORTEX_EMBED_USER`.

Refs: [AI_EMBED](https://docs.snowflake.com/en/sql-reference/functions/ai_embed),
[vector embeddings](https://docs.snowflake.com/en/user-guide/snowflake-cortex/vector-embeddings),
[AI_COMPLETE](https://docs.snowflake.com/en/sql-reference/functions/ai_complete-single-string).

## 3.7 Running SQL from a Next.js route

**Option A — SQL REST API (`/api/v2/statements`).** No driver, no connection pooling, works on
edge/serverless. Best fit for Next.js.

```ts
// app/api/query/route.ts
export async function POST(req: Request) {
  const res = await fetch(
    `https://${process.env.SNOWFLAKE_ACCOUNT}.snowflakecomputing.com/api/v2/statements`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${process.env.SNOWFLAKE_PAT}`,
        'X-Snowflake-Authorization-Token-Type': 'PROGRAMMATIC_ACCESS_TOKEN',
        'User-Agent': 'my-hack-app/1.0',
      },
      body: JSON.stringify({
        statement: 'SELECT title, AI_COMPLETE(?, ?) AS blurb FROM docs WHERE id = ?',
        timeout: 60,
        database: 'MYDB',      // case-sensitive, match SHOW output (usually UPPERCASE)
        schema: 'PUBLIC',
        warehouse: 'COMPUTE_WH',
        role: 'MYROLE',
        bindings: {
          '1': { type: 'TEXT',  value: 'llama3.3-70b' },
          '2': { type: 'TEXT',  value: 'Summarise this doc' },
          '3': { type: 'FIXED', value: '123' },
        },
      }),
    },
  )
  return Response.json(await res.json())
}
```

Things that will trip you up here:
- `database` / `schema` / `warehouse` / `role` are **case-sensitive** and must match what `SHOW`
  returns — unquoted identifiers are created uppercase, so these are usually uppercase.
- Binding **values must be strings**, even numbers (`"123"`, not `123`).
- Execution is **not guaranteed synchronous** even without `async=true`. Handle a
  `statementStatusUrl` / 202 response and poll.
- Bind variables are not supported in multi-statement requests.
- For safe retries, pass `?requestId=<uuid>&retry=true`.
- Timestamp bindings are nanoseconds since epoch; DATE is milliseconds.

**Option B — Node driver.** `snowflake-sdk` 3.3.0. Stateful connection, so it fits a long-lived
Node server better than serverless functions.

```ts
import snowflake from 'snowflake-sdk' // 3.3.0

const connection = snowflake.createConnection({
  account: process.env.SNOWFLAKE_ACCOUNT,
  username: process.env.SNOWFLAKE_USER,
  authenticator: 'PROGRAMMATIC_ACCESS_TOKEN',
  token: process.env.SNOWFLAKE_PAT,
  warehouse: 'COMPUTE_WH',
  database: 'MYDB',
  schema: 'PUBLIC',
})

connection.connect((err) => { if (err) throw err })
connection.execute({
  sqlText: 'SELECT * FROM docs LIMIT 10',
  complete: (err, stmt, rows) => { /* ... */ },
})
```

Other `authenticator` values: `SNOWFLAKE`, `SNOWFLAKE_JWT` (keypair), `OAUTH`, `EXTERNALBROWSER`,
`USERNAME_PASSWORD_MFA`, `WORKLOAD_IDENTITY`. A PAT also works in the `password` field.

Refs: [SQL API](https://docs.snowflake.com/en/developer-guide/sql-api/submitting-requests),
[Node.js options](https://docs.snowflake.com/en/developer-guide/node-js/nodejs-driver-options).

## 3.8 The student trial and the example repo

- **Trial:** `https://signup.snowflake.com/?trial=student` → "Start your 120-day free trial …
  includes $400 worth of free usage". Confirmed live on 2026-09-19. The plain
  `https://signup.snowflake.com/` is only **30 days** with the same $400, so the `?trial=student`
  query param is the whole trick. No credit card. Cloud/region/edition are fixed at signup and
  cannot be changed later.
- **The repo MLH links to** (`https://mlh.link/snowflake-tutorial`) resolves to
  **https://github.com/annafil/cortex-rest-api-demo** — a Streamlit chat app, ~140 lines. Useful
  for the PAT/account-identifier walkthrough and its screenshots. **Do not copy its API call:** it
  posts to the legacy `/api/v2/cortex/inference:complete`, uses
  `Authorization: Snowflake Token="..."` (session token from `snowflake.connector`) rather than a
  Bearer PAT, and defaults to `claude-3-5-sonnet`. It's also Python/Streamlit, not Node.

---

# 4. MLH prize requirements (verbatim from mlh.com/events/prizes, fetched 2026-09-19)

These are the generic sponsor blurbs on MLH's upcoming-prizes page. Individual events restate them,
occasionally with different hardware — check your event's Devpost.

**Best Use of Tiger Data — Stream Deck Mini (1 winner)**
> Building high-performance apps under hackathon deadlines shouldn't mean spending half your
> weekend configuring complex databases or learning obscure query languages. Tiger Data extends
> PostgreSQL to give student developers an ultra-fast foundation for real-time data, time-series
> metrics, and complex analytics. Why build with Tiger Data this weekend?
> - Standard SQL Power: Query massive datasets instantly using the SQL you already know, with no
>   complex NoSQL aggregation pipelines required.
> - Unified Data Stack: Store relational user profiles and high-frequency metric streams
>   side-by-side in a single database.
> - Instant Dashboards: Serve lag-free, real-time frontend charts using pre-computed Continuous
>   Aggregates.
> - 90%+ Data Compression: Store millions of events on free-tier cloud instances without running
>   out of disk space.
>
> Whether you're building real-time IoT monitoring, AI-driven analytics dashboards, or financial
> prediction engines, show us how Tiger Data powers your project. The team that demonstrates the
> most innovative, impactful, and performance-driven use of Tiger Data will take home some great
> prizes!

Read the judging criteria literally: it names **continuous aggregates** and **compression**, not
vector search. The highest-scoring build is a live dashboard reading from a continuous aggregate
over a hypertable. Link: `https://mlh.link/tigerdata` → `https://mlh.com/partners/tigerdata`.

**Best Use of DigitalOcean — Retro Wireless Mouse**
> DigitalOcean offers a reliable and easy-to-use cloud platform for every stage of your project.
> Leverage core services like Droplets, Managed Databases, and App Platform to build, deploy, and
> scale your application effortlessly. Building with AI? DigitalOcean Gradient™ AI enables you to
> build, train, and deploy machine learning models, including access to GPU infrastructure and
> serverless inference! Sign up for DigitalOcean today and get $200 worth of free credits that you
> can use towards building your next great hack.

Signup link: `https://mlh.link/digitalocean-signup` → `https://try.digitalocean.com/freetrialoffer/`.

**Best Use of Snowflake API — Raspberry Pi 4**
> Play with industry-leading LLMs on a single account using the Snowflake APIs. Adding AI
> capabilities into your application can be as simple as a single CURL command to Snowflake's REST
> API. Build customized applications, RAG powered chat bots, or embed AI-powered features into your
> app in half the time with half the hassle. Get started for free with a special, student 120-day
> Snowflake trial and check out this repository for an example of the Snowflake REST API in action.

Links: trial `https://mlh.link/snowflake-signup` → `https://signup.snowflake.com/?trial=student`;
repository `https://mlh.link/snowflake-tutorial` → `https://github.com/annafil/cortex-rest-api-demo`.

Note the prize is named "Best Use of Snowflake **API**" — a SQL-only Snowsight demo is off-brief.
Hit the REST API from your app.

---

# 5. Things I could not verify

1. **Whether pgai Vectorizer and `ai.*` LLM functions still work on Tiger Cloud today.** The
   deprecation page still says "will be removed on **June 30, 2026**" in future tense, but that
   date is ~3 months past. Either the docs are stale or the removal slipped. Untestable without a
   live Tiger Cloud service. Assume removed; design around it.
2. **Whether `/api/v2/cortex/inference:complete` still responds on Snowflake.** Described as
   "legacy"/"replaced" by current docs and by LiteLLM's migration PRs, but I found no formal
   Snowflake deprecation or sunset notice. MLH's linked demo still uses it. Unclear whether it
   404s or merely isn't documented.
3. **DigitalOcean's $200 credit.** Stated in MLH's prize copy; the linked landing page no longer
   shows a figure. Amount and eligibility unconfirmed.
4. **Per-region / per-account model availability** for both Snowflake Cortex and DO serverless
   inference. Both publish grids, not flat lists. The model ID tables above are *catalogues*, not
   guarantees. Resolve at runtime: `GET https://inference.do-ai.run/v1/models` for DO, Cortex
   Playground for Snowflake.
5. **Whether Snowflake's `?trial=student` 120-day offer requires proof of student status.** The
   signup form has a "Why are you signing up? → Student" dropdown but I saw no verification step.
   MLH links to it directly, which implies none.
6. **Exact MLH prize wording at your specific event.** I fetched the generic
   `mlh.com/events/prizes` page. Per-event Devpost pages restate these and sometimes differ (e.g.
   Hack RenderATL 2026 carried the identical Tiger Data text with a Stream Deck Mini).
7. **Tiger free-plan EU regions.** Announced as "coming soon"; currently `us-east-1` only. Latency
   from a European judge's browser is a real risk for a live-dashboard demo.
8. **`@digitalocean/dots` (v1.19.0) `InferenceClient` ergonomics.** It exists on npm and appears in
   DO's own docs, but I did not run it. The plain `openai` SDK against
   `https://inference.do-ai.run/v1` is the safer choice.

---

# 6. If you want the shortest path to all three prizes in one app

A build that hits every judging criterion without three separate integrations:

- **Ingest** a high-frequency event stream into a Tiger Cloud **hypertable** (free plan). Add a
  **continuous aggregate** with a refresh policy. Chart it in Next.js. → hits Tiger's stated
  criteria (continuous aggregates, compression, real-time analytics) exactly.
- **Deploy** the Next.js app on DigitalOcean **App Platform**; put user uploads in **Spaces**; call
  **Gradient serverless inference** at `https://inference.do-ai.run/v1` from a route handler for
  the natural-language layer. → DigitalOcean asks for "core services … App Platform" plus Gradient.
- **Call Snowflake Cortex** from one route handler for a second-opinion model or for `AI_COMPLETE`
  structured extraction over data in Snowflake, via `POST /api/v2/cortex/v1/chat/completions` with
  a PAT. → satisfies "Best Use of Snowflake **API**" literally.

Total new credentials: a Tiger connection string, a DO model access key, a Snowflake PAT. All three
are obtainable without a credit card.
