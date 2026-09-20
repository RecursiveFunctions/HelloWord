# Migrations

Additive only. Pick a filename in your workstream's band so two branches
cannot collide on ordering.

| Workstream | Band | Examples |
|---|---|---|
| A ingest / shell | 100–199 | `100_spaces_bucket.sql` |
| B reader / notes | 200–299 | `200_extract_comment.sql` |
| C AI services | 300–399 | `300_embed_job.sql` |
| D review / diagnostics | 400–499 | `400_review_compression.sql` |
| E reading queue / distill | 500–599 | `500_extract_queue.sql`, `501_distill_drafts.sql` |
| F trash / file management | 600–699 | `600_soft_delete.sql` |

Rules, because `npm run db:migrate` applies these on every deploy:

- **Additive.** The previous deployment keeps serving while the build runs, so
  a migration must not break code that does not know about it yet.
- **Safe to re-run.** `if not exists`, `drop ... if exists`, `on conflict do
  nothing`. Databases that predate the runner had 100-400 applied by hand, and
  its first run applies them again.
- **No statement that refuses a transaction** (`create index concurrently`, a
  continuous aggregate). Each file runs inside one.
- **Add a sentinel** to `SCHEMA_SENTINELS` in `lib/db-schema.ts`, so
  `/api/health` can name the file when a database is missing it. A test fails
  if you forget.

Schema itself lives in `../schema.sql` and is frozen. A contract change is a
small PR to `main`, not a feature-branch edit.
