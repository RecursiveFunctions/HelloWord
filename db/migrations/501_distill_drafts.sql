-- E, band 500-599. Additive.
--
-- The auto-distill pipeline: after ingest the model proposes extracts, then
-- drafts a note and cards for each one the reader reaches. A human approves
-- before anything becomes a real note or a reviewable activity.
--
-- Drafted cards live here as jsonb and deliberately NOT as `activity` rows. The
-- review queue treats any activity without a schedule as due immediately, and
-- the library, notebooks, and diagnostics all read `activity` unfiltered. A
-- "pending" flag there would have to be remembered in every one of them, and
-- the first one to forget would quiz the reader on cards nobody approved.
alter table source
  add column if not exists distill_status text not null default 'none'
    check (distill_status in ('none', 'extracting', 'proposed', 'failed')),
  add column if not exists distill_error text;

-- A source that already has extracts has been distilled, by hand or by an
-- earlier Suggest. Without this the reader would re-propose on first open.
update source s
   set distill_status = 'proposed'
 where distill_status = 'none'
   and exists (select 1 from extract e where e.source_id = s.id);

create table if not exists distill_draft (
  extract_id    uuid primary key references extract(id) on delete cascade,
  status        text not null default 'pending'
                check (status in ('pending', 'drafting_note', 'note_ready',
                                  'drafting_cards', 'ready', 'failed', 'approved')),
  note_title    text,
  note_body_md  text,
  note_concepts text[] not null default '{}',
  activities    jsonb not null default '[]',   -- ActivityPayload[]
  error         text,
  -- Doubles as the claim timestamp: a `drafting_*` row this old was abandoned
  -- by a function that timed out, and may be claimed again.
  updated_at    timestamptz not null default now()
);
