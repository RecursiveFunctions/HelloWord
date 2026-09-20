Copy this prompt to the agent with TCP access:

---

You are continuing Tiger Cloud integration work in the `RecursiveFunctions/HelloWord` repository on branch `feat/tiger-data-integration`.

## Objective

Validate the application against the real Tiger Cloud PostgreSQL service, initialize it only if safe, run integration checks, and fix Tiger-specific defects discovered during testing.

## Safety requirements

- Never print, expose, copy, or commit `.env.local` or `DATABASE_URL`.
- Do not modify credentials.
- Do not run destructive SQL.
- Do not seed a non-empty database.
- Do not bump package or application versions.
- Do not commit or push unless explicitly requested.
- Preserve the fixture fallback when `DATABASE_URL` is absent.
- Read `AGENTS.md` before changing code.
- This is Next.js 16.3.5. Before framework-sensitive changes, consult the relevant documents under `docs`.
- The working tree may contain uncommitted Tiger integration changes. Do not discard or overwrite them.
- Before editing, inspect current contents—especially:
  - `page.tsx`
  - `page.tsx`
- A safety stash may exist. Do not pop or drop it without first inspecting the worktree and obtaining permission.
- If a commit is later requested, disable signing for this RecursiveFunctions repository.

## Initial Git checks

1. Confirm the branch is `feat/tiger-data-integration`.
2. Run `git status --short --branch`.
3. Fetch `origin`, but do not reset or overwrite local work.
4. Confirm the branch is based on current `origin/main`.
5. Check for unresolved conflict markers.
6. Record existing modifications before making changes.

## Existing implementation

The branch should contain:

- Dual-backend stores:
  - Tiger/PostgreSQL when `DATABASE_URL` is configured.
  - Mutable fixture-backed memory otherwise.
- New or modified stores for:
  - Notes.
  - Concepts and concept-note relations.
  - Extract listing.
  - Preview generation without direct fixture entity lookups.
- Notebook diagnostics backed by `review_daily` in Tiger mode.
- Notebook trends and a diagnostics API.
- Store-backed library, reader, review, and notebook paths.
- Expanded Tiger smoke checks.
- Tiger bootstrap documentation.

Important files include:

- `db.ts`
- `notes.ts`
- `concepts.ts`
- `extracts.ts`
- `previews.ts`
- `notebook.ts`
- `route.ts`
- `smoke-sponsors.ts`
- `schema.sql`
- `100_feeds.sql`
- `200_extract_proposal_metadata.sql`
- `400_review_clock.sql`
- `seed.sql`
- `README.md`

The latest local validation previously reported 41 passing unit tests. Revalidate rather than assuming that remains true.

## Connection validation

Using the locally configured `DATABASE_URL`, without displaying it:

1. Confirm the variable is loaded.
2. Parse and report only non-sensitive connection metadata:
   - Protocol.
   - Hostname or a redacted hostname.
   - Port.
   - Database name.
   - Never report username or password.
3. Test DNS resolution.
4. Test TCP connectivity to the configured host and port.
5. Test a TLS PostgreSQL connection.
6. Run a minimal read-only query such as:
   - `select current_database(), version();`
7. If connectivity fails, classify the failure precisely:
   - DNS resolution.
   - TCP timeout or refusal.
   - TLS/certificate.
   - Authentication.
   - PostgreSQL/database error.
8. Stop before schema changes if connection or authentication is not reliable.

## Database inspection

Before applying anything, inspect the service read-only:

- Installed extensions relevant to TimescaleDB and vector support.
- Existing application relations.
- Approximate row counts for application tables.
- Whether `review_event` is a hypertable.
- Whether `review_daily` exists as a continuous aggregate.
- Whether a continuous aggregate refresh policy exists.
- Whether `clock_offset_ms` exists.
- Whether required vector indexes exist.

Expected capabilities include:

- TimescaleDB.
- `vectorscale`/pgvector support.
- `review_event` hypertable.
- `review_daily` continuous aggregate.
- `vector(768)` columns on `note.embedding` and `extract.embedding`.
- StreamingDiskANN indexes.
- Review clock support from migration `400_review_clock.sql`.

## Initialization decision

Initialize only if the service is demonstrably empty of this application’s schema/data.

If empty, apply in this exact order:

1. `schema.sql`
2. `100_feeds.sql`
3. `200_extract_proposal_metadata.sql`
4. `400_review_clock.sql`
5. `seed.sql`
6. `npm run smoke`

`seed.sql` is not idempotent. Never run it unless the database is empty and initialization is clearly intended.

If the schema already exists:

- Do not rerun the seed.
- Compare existing schema with expected schema and migrations.
- Apply only missing, safe migrations after explaining what is missing.
- Do not overwrite or delete existing data.

## Runtime integration testing

With `DATABASE_URL` enabled, verify that runtime requests use Tiger rather than fixtures.

Test at least:

- Health endpoint.
- Sources.
- Notes.
- Extracts.
- Notebooks.
- Notebook items.
- Notebook cover and item preview endpoints.
- Notebook diagnostics endpoint.
- Review queue and due counts.
- Review grading persistence.
- Virtual review clock behavior.
- `review_daily`-backed diagnostics and 90-day notebook trends.

Verify representative UI routes if feasible:

- `/library`
- `/notebooks`
- `/notebooks/[id]`
- `/read/[id]`
- `/review`

Confirm:

- Notebook pie diagnostics render from Tiger-backed results.
- Notebook covers and card/list views still work.
- Preview generation does not silently fall back to seed helpers.
- A review grade persists a `review_event`.
- The associated schedule updates correctly.
- Diagnostics reflect the persisted review data after aggregate refresh or expected refresh latency.

Avoid leaving test mutations behind unless they are part of the intended demo seed. If mutation cleanup would require destructive SQL, stop and report what was changed instead.

## Validation

Run:

1. Unit tests.
2. TypeScript checking.
3. Lint.
4. Production build.
5. `npm run smoke` against Tiger.
6. Any targeted API/UI integration checks needed to verify the real database path.

Distinguish new failures from pre-existing issues. Previously observed unrelated lint locations included:

- `color-wheel.tsx`
- `carousel.tsx`
- `use-mobile.ts`
- A warning in `reviews.ts`

Stale `.next/dev/types` route declarations previously caused route type errors. If encountered, validate using the repository’s clean/build-supported process rather than editing generated files.

## Scope of fixes

Fix only defects needed for Tiger integration and real-database execution. Keep SQL parameterized and row hydration typed. Preserve fixture mode.

Do not implement vector similarity search or deployment configuration in this task; those are delegated GitHub issues:

- Issue #19: Tiger vector similarity search.
- Issue #20: Tiger Cloud and Vercel deployment configuration.

## Final report

Return:

1. Git branch and worktree status.
2. Connection result by layer: DNS, TCP, TLS, authentication, SQL.
3. Whether the database was empty.
4. Exact schema/migration/seed operations performed.
5. Smoke-check results.
6. Runtime routes and workflows tested.
7. Tests, type check, lint, and build results.
8. Files changed and why.
9. Database mutations performed.
10. Remaining blockers or follow-up work.
11. Confirmation that no credentials were exposed and no secret files were committed.

Do not report the connection string or any credentials.

---