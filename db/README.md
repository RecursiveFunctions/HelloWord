# Database

Frozen schema lives in `schema.sql`. Seed data is generated from
`lib/seed` via `npm run db:generate-seed`.

Against a Tiger Cloud free-plan service:

```bash
psql "$DATABASE_URL" -f db/schema.sql
psql "$DATABASE_URL" -f db/seed.sql
```

The Next.js shell does not need a database. Screens read `lib/seed` until a
workstream wires `lib/db.ts` to these tables.
