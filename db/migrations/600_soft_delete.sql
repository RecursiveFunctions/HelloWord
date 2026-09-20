-- Recently deleted. Additive only.
-- A delete now stamps `deleted_at` instead of removing the row; every reader
-- filters on `deleted_at is null`. Deleting a source stamps its extracts and
-- their activities with the same instant so a restore can find exactly what
-- the delete took with it.

alter table notebook add column if not exists deleted_at timestamptz;
alter table source   add column if not exists deleted_at timestamptz;
alter table note     add column if not exists deleted_at timestamptz;
alter table extract  add column if not exists deleted_at timestamptz;
alter table activity add column if not exists deleted_at timestamptz;
