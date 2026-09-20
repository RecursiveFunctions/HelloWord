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

Schema itself lives in `../schema.sql` and is frozen. A contract change is a
small PR to `main`, not a feature-branch edit.
