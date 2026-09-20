# HelloWord

A spaced repetition progressive web app built for SteelHacks XIII, live at
[hello-word.tech](https://hello-word.tech).

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
reader.

Apply the real schema later:

```bash
psql "$DATABASE_URL" -f db/schema.sql
npm run db:migrate
psql "$DATABASE_URL" -f db/seed.sql
npm run smoke
```

[db/README.md](db/README.md) has the full bootstrap, including the two
backfills to re-run after seeding.

`npm run db:generate-seed` rewrites `db/seed.sql` from `lib/seed`.
Run the generated seed only against an empty service. See [db/README.md](db/README.md)
for the full bootstrap and verification notes.

## Deploy to Vercel

The intended topology is fixture-backed Preview deployments and a Tiger
Cloud-backed Production deployment. Import this repository into a Vercel
Hobby project with these settings:

- Framework preset: **Next.js**
- Root directory: repository root
- Install command: `npm install` (the committed `package-lock.json` is used)
- Build command: `npm run vercel-build` (set in `vercel.json`): applies pending
  migrations, then `next build`
- Node.js version: **22.x**
- Production branch: `main`

`vercel.json` pins Server Functions to `iad1`, near the Tiger Cloud
`us-east-1` service, and declares the longer source/AI function durations.
Provision the database once from a trusted workstation using
[db/README.md](db/README.md); `schema.sql` and seed data stay out of the Vercel
build. Additive migrations do not: the Production build runs
`npm run db:migrate` first, because code that deployed ahead of a hand-applied
migration is what took production down once. Preview has no `DATABASE_URL`, so
Preview builds skip the step - and, running on fixtures, cannot show you a
schema problem. `GET /api/health` on Production can: `schema.missing` should be
empty.

### Environment variables

Define variables in **Project Settings → Environment Variables**, scoped as
follows. Redeploy after changing a value.

| Variable | Preview | Production |
|---|---|---|
| `AI_MOCK` | `1` | `0` |
| `DATABASE_URL` | Unset (committed fixtures) | Tiger Cloud connection string |
| `SPACES_KEY`, `SPACES_SECRET`, `SPACES_BUCKET`, `SPACES_ENDPOINT` | Unset unless testing uploads | Required for PDF uploads |
| `NVIDIA_API_KEY`, `NVIDIA_BASE_URL`, `NVIDIA_MODEL` | Unset | Brev-hosted Nemotron NIM chat settings |
| `NVIDIA_EMBED_API_KEY`, `NVIDIA_EMBED_BASE_URL`, `NVIDIA_EMBED_MODEL` | Unset | Separate NVIDIA embedding settings |
| `DO_INFERENCE_KEY`, `DO_INFERENCE_BASE_URL`, `DO_NEMOTRON_MODEL` | Unset | Live failover settings |
| `GEMINI_API_KEY` | Unset | Live PDF/URL fallback |
| `SNOWFLAKE_ACCOUNT`, `SNOWFLAKE_PAT`, `SNOWFLAKE_MODEL` | Unset | Live report provider |

Do not add Production database or provider secrets to Preview scope. Preview
APIs are write-capable and must not be able to mutate the Production database.
All values are server-only; none should use a `NEXT_PUBLIC_` prefix.

Production chat is expected to use Nemotron 3 Nano 30B-A3B served by NVIDIA
NIM on a Brev GPU. Calls to NVIDIA API Catalog (`integrate.api.nvidia.com`)
are development/diagnostic traffic and do not consume Brev credits. Follow
[docs/nemotron-brev-nim.md](docs/nemotron-brev-nim.md) to provision the NIM,
secure its ingress, verify the exact served model ID, and configure Vercel.
Chat and embedding URLs are deliberately independent because the Nano chat NIM
does not serve the embedding model.

### PDF storage and Spaces CORS

Vercel Functions have an ephemeral filesystem. The app therefore refuses to
store PDFs locally when `VERCEL=1`; Production PDF uploads require a private
DigitalOcean Spaces bucket. Local development still falls back to
`data/pdfs/` when Spaces is not configured.

Large PDFs are uploaded directly from the browser with a presigned `PUT` to
avoid Vercel's request-body limit. Configure the bucket CORS policy to allow
`PUT` from the exact Production origin and any Preview origin used for upload
testing. Allow the `Content-Type` header. Do not make the bucket public; PDF
reads continue through `/api/sources/[id]/file`.

### Release checklist

1. Run `npm test`, `npm run lint`, and `npm run build` locally.
2. Deploy a Preview and verify `/api/health` reports `db: false` and
	`aiMock: true`.
3. Check navigation, offline fallback, manifest/service-worker installation,
	and fixture-backed reads in the Preview.
4. Bootstrap Tiger Cloud out of band, configure Production variables, and
	deploy `main`.
5. Verify `/api/health` reports `db: true` and `aiMock: false` without exposing
	any credential values.
6. Add a URL, upload a small PDF, upload a PDF over 4 MB through the presigned
	path, and confirm the archived PDF remains readable after a new invocation.
7. Exercise AI generation, reporting, review grading, and feed refresh while
	monitoring Vercel Function logs for provider or timeout errors.

To roll back application code, promote the previous healthy Vercel deployment.
Do not roll back database migrations destructively; schema changes are
additive. Rotate any credential that appears in a build log or client bundle.

## Sponsor credentials

A listing endpoint is not a smoke test. Put keys in `.env.local` (gitignored), then:

```bash
cp .env.example .env.local
npm run smoke
```

That makes a real Nemotron completion, a Snowflake Cortex REST call, and a Tiger Cloud connection. DigitalOcean inference is the optional Nemotron failover, used when NVIDIA rate-limits.

| Sponsor | Signup | What “prepared” means |
|---|---|---|
| Nemotron | [build.nvidia.com](https://build.nvidia.com) → API key | `POST /v1/chat/completions` returns 200. `GET /v1/models` can be 200 while completions are 403. |
| Snowflake API | [signup.snowflake.com/?trial=student](https://signup.snowflake.com/?trial=student) (120 days). PAT + network-policy exception | `POST /api/v2/cortex/v1/chat/completions` with `X-Snowflake-Authorization-Token-Type: PROGRAMMATIC_ACCESS_TOKEN`. Not the legacy `inference:complete` path. |
| Tiger Data | Tiger Console → **Free Plan**, not the 30-day trial, `us-east-1` | `DATABASE_URL` connects; the smoke verifies extensions, `review_event` hypertable, `review_daily` aggregate policy, migration, and DiskANN indexes. |

Sponsor API notes: [docs/hackathon-sponsor-api-brief.md](docs/hackathon-sponsor-api-brief.md) and [docs/tigerdata-digitalocean-snowflake-api-brief.md](docs/tigerdata-digitalocean-snowflake-api-brief.md).

## Stack

Next.js 16 App Router, Tailwind 4, shadcn, Tiger Cloud (pgvector +
TimescaleDB), `ts-fsrs`, NVIDIA Nemotron with DigitalOcean failover.

## Team
Raymond FernandezOwner
[@RecursiveFunctions](https://github.com/RecursiveFunctions)
rfernan2@andrew.cmu.edu

Julia Kobulinsky
[@jkob15](https://github.com/jkob15)
jkobul7@gmail.com


Ethan Wang
[@nullishew](https://github.com/nullishew)
ecwang@andrew.cmu.edu


William Amick
[@willyumm3rs](https://github.com/willyumm3rs)
williamamick@gmail.com





## Prior art and reused code

- [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) for scheduling.
- [obsidian-incremental-reading](https://github.com/RecursiveFunctions/obsidian-incremental-reading) (MIT): concepts reused; copied files get a header with repo URL, commit hash, and license.

## License

MIT
