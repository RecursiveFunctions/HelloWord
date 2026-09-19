# Migrations

Additive only. Pick a filename in your workstream's band so two branches
cannot collide on ordering.

| Workstream | Band | Examples |
|---|---|---|
| A ingest / shell | 100–199 | `100_spaces_bucket.sql` |
| B reader / notes | 200–299 | `200_extract_comment.sql` |
| C AI services | 300–399 | `300_embed_job.sql` |
| D review / diagnostics | 400–499 | `400_review_compression.sql` |

Schema itself lives in `../schema.sql` and is frozen. A contract change is a
small PR to `main`, not a feature-branch edit.
