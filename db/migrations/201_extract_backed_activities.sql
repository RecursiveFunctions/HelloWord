-- B, band 200-299. Manual SuperMemo-style clozes may derive from extracts.
alter table activity
  alter column note_id drop not null,
  alter column source_body_hash drop not null,
  add column if not exists extract_id uuid references extract(id) on delete cascade;

alter table activity
  drop constraint if exists activity_exactly_one_parent,
  add constraint activity_exactly_one_parent
    check (num_nonnulls(note_id, extract_id) = 1);

drop view if exists activity_v;
create view activity_v as
  select a.*,
         coalesce(a.note_id is not null and a.source_body_hash <> n.body_hash, false) as stale
  from activity a
  left join note n on n.id = a.note_id;

alter table review_event
  alter column note_id drop not null,
  add column if not exists extract_id uuid references extract(id) on delete cascade;

alter table review_event
  drop constraint if exists review_event_exactly_one_parent,
  add constraint review_event_exactly_one_parent
    check (num_nonnulls(note_id, extract_id) = 1);

create unique index if not exists activity_manual_cloze_identity
  on activity (extract_id, md5(payload::text))
  where extract_id is not null and type = 'fill_blank';