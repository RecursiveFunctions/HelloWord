-- Workstream A, band 100-199. Additive only.
-- Optional screenshot/cover for a notebook card. The pointer is a public path,
-- a memory: key, or a Spaces object key; bytes are not stored in this column.

alter table notebook
  add column if not exists cover_storage_key text;
