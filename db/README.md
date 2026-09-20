# Database

Frozen schema lives in `schema.sql`. Seed data is generated from
`lib/seed` via `npm run db:generate-seed`.

Against a new, empty Tiger Cloud Free Plan service in `us-east-1`, put the
downloaded connection string in `.env.local` as `DATABASE_URL`, then apply the
database files in this order:

```bash
psql "$DATABASE_URL" -f db/schema.sql
psql "$DATABASE_URL" -f db/migrations/100_feeds.sql
psql "$DATABASE_URL" -f db/migrations/200_extract_proposal_metadata.sql
psql "$DATABASE_URL" -f db/migrations/400_review_clock.sql
psql "$DATABASE_URL" -f db/seed.sql
npm run smoke
```

`seed.sql` is demo bootstrap data, not an idempotent migration. Run it only on
an empty service. The smoke test verifies the `review_event` hypertable,
`review_daily` continuous aggregate and refresh policy, additive review-clock
migration, and DiskANN indexes.

With no `DATABASE_URL`, the app uses an in-memory fixture backend. With one, all
runtime stores and notebook diagnostics read Tiger through the shared pool in
`lib/db.ts`.
