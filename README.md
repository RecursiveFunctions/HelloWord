# HelloWord

A spaced repetition progressive web app built for SteelHacks XIII.

> "HelloWord" is a placeholder name.

The app supports two runtime backends: committed in-memory fixtures for local
development, and Tiger Cloud for persistent data and review diagnostics.

## Pitch

An incremental reading engine that turns feeds into things you actually
remember. Sources come in (RSS, pasted URLs, PDFs), every source becomes
markdown, AI proposes extracts, you distill those into notes, and the notes
become gradeable questions scheduled with FSRS.

The markdown note is the pivot: nothing generates an activity from a source.

## Run locally

```bash
npm install
cp .env.example .env.local   # AI_MOCK=1 is the default assumption
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Notebooks, Library,
Review, and Settings all render seed rows. Click a source to open the
placeholder reader.

Apply the real schema later:

```bash
psql "$DATABASE_URL" -f db/schema.sql
psql "$DATABASE_URL" -f db/migrations/100_feeds.sql
psql "$DATABASE_URL" -f db/migrations/200_extract_proposal_metadata.sql
psql "$DATABASE_URL" -f db/migrations/400_review_clock.sql
psql "$DATABASE_URL" -f db/seed.sql
npm run smoke
```

`npm run db:generate-seed` rewrites `db/seed.sql` from `lib/seed`.
Run the generated seed only against an empty service. See [db/README.md](db/README.md)
for the full bootstrap and verification notes.

## Sponsor credentials

A listing endpoint is not a smoke test. Put keys in `.env.local` (gitignored), then:

```bash
cp .env.example .env.local
npm run smoke
```

That makes a real Nemotron completion, a Snowflake Cortex REST call, and a Tiger Cloud connection. DigitalOcean inference is the Nemotron failover — optional until NVIDIA rate-limits, required for that track.

| Sponsor | Signup | What “prepared” means |
|---|---|---|
| Nemotron | [build.nvidia.com](https://build.nvidia.com) → API key | `POST /v1/chat/completions` returns 200. `GET /v1/models` can be 200 while completions are 403. |
| Snowflake API | [signup.snowflake.com/?trial=student](https://signup.snowflake.com/?trial=student) (120 days). PAT + network-policy exception | `POST /api/v2/cortex/v1/chat/completions` with `X-Snowflake-Authorization-Token-Type: PROGRAMMATIC_ACCESS_TOKEN`. Not the legacy `inference:complete` path. |
| Tiger Data | Tiger Console → **Free Plan**, not the 30-day trial, `us-east-1` | `DATABASE_URL` connects; the smoke verifies extensions, `review_event` hypertable, `review_daily` aggregate policy, migration, and DiskANN indexes. |

Keep `AI_MOCK=1` until C’s client is live. Wave 1 UI work does not wait on these calls.

## Frozen files (do not edit on a feature branch)

A contract change is its own small PR to `main`. Everyone rebases onto it.

- `db/schema.sql`
- `lib/contracts/*`
- `lib/api.ts`
- `lib/db.ts`
- `components/ui/*`

## Workstreams

Cut branches from this commit, prefixed `cursor/` per repo convention:

| Branch | Owns | Builds against |
|---|---|---|
| `cursor/a-ingest` | `app/api/sources`, `feeds`, `notebooks`, `lib/ingest`, `lib/storage`, Notebooks + Library screens | seeded `source.markdown` |
| `cursor/b-reader` | `app/read`, `lib/editor`, `lib/anchor`, `app/api/notes`, `app/api/extracts` | seeded markdown + `lib/ai/__fixtures__/extract-proposals.json` |
| `cursor/c-ai` | `lib/ai`, `app/api/ai`, `app/api/report` (no UI) | fixtures first, then live Nemotron with `AI_MOCK=1` still working |
| `cursor/d-review` | `app/(app)/review`, `settings`, `lib/fsrs`, `lib/diagnostics`, review/scheduler APIs | 40 seeded activities + 90 days of `review_event` |

Additive migrations only, in your band: A `100-199`, B `200-299`, C `300-399`, D `400-499`.

Plan of record: [PLAN.md](PLAN.md). Sponsor API notes: [docs/hackathon-sponsor-api-brief.md](docs/hackathon-sponsor-api-brief.md) and [docs/tigerdata-digitalocean-snowflake-api-brief.md](docs/tigerdata-digitalocean-snowflake-api-brief.md).

## Stack

Next.js 16 App Router, Tailwind 4, shadcn, Tiger Cloud (pgvector +
TimescaleDB), `ts-fsrs`, NVIDIA Nemotron with DigitalOcean failover.

## Team

| GitHub | Workstream |
|---|---|
| [@RecursiveFunctions](https://github.com/RecursiveFunctions) | TBD |
| [@nullishew](https://github.com/nullishew) | TBD |
| [@willyumm3rs](https://github.com/willyumm3rs) | TBD |
| [@jkob15](https://github.com/jkob15) | TBD |

## Prior art and reused code

- [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) for scheduling.
- [obsidian-incremental-reading](https://github.com/RecursiveFunctions/obsidian-incremental-reading) (MIT): concepts reused; copied files get a header with repo URL, commit hash, and license.

## License

MIT
