# Database

Frozen schema lives in `schema.sql`. Seed data is generated from
`lib/seed` via `npm run db:generate-seed`.

## Deploys migrate themselves

`npm run db:migrate` (`scripts/migrate.ts`) applies every file in
`db/migrations/` that the `schema_migrations` table has not recorded, each in
its own transaction. Vercel runs it before `next build` (`vercel-build` in
`package.json`, wired up in `vercel.json`), so a deployment's schema is in place
before its code serves a request, and a migration that fails fails the build
and leaves the previous deployment live.

```bash
npm run db:status    # applied / PENDING per file, changes nothing
npm run db:migrate   # apply whatever is pending
```

`GET /api/health` reports `schema.missing`, the migrations a database has not
had, and answers 503 while that list is non-empty.

This replaced applying migrations by hand. The store selects explicit column
lists, so code that reached production ahead of its migration turned every
route touching that table into a 500, and nothing local noticed, because
`npm run dev` and most tests run on the in-memory backend.
`lib/store/postgres.test.ts` now runs the Postgres half of the store against
PGlite with the real schema and migrations, so that class of break fails in
`npm test` instead.

## Bootstrapping an empty service

Against a new, empty Tiger Cloud Free Plan service in `us-east-1`, put the
downloaded connection string in `.env.local` as `DATABASE_URL`, then:

```bash
psql "$DATABASE_URL" -f db/schema.sql
npm run db:migrate
psql "$DATABASE_URL" -f db/seed.sql
psql "$DATABASE_URL" -f db/migrations/500_extract_queue.sql
psql "$DATABASE_URL" -f db/migrations/501_distill_drafts.sql
npm run smoke
```

The two 500-band files are run a second time on purpose: each ends with a
backfill that marks rows which have already been through the reading queue, and
the first pass ran before the seed rows existed. Every migration is safe to
re-run.

`seed.sql` is demo bootstrap data, not an idempotent migration. Run it only on
an empty service. The smoke test verifies the `review_event` hypertable,
`review_daily` continuous aggregate and refresh policy, additive review-clock
migration, and DiskANN indexes.

With no `DATABASE_URL`, the app uses an in-memory fixture backend. With one, all
runtime stores and notebook diagnostics read Tiger through the shared pool in
`lib/db.ts`.
