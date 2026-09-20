-- E, band 500-599. Additive.
--
-- The incremental reading queue. An extract is the queue item: it comes back
-- on a growing interval until it is distilled into a note and cards, or
-- dismissed. `priority` (already on the row, lower surfaces sooner) orders
-- whatever is due.
--
-- This is deliberately not a second `schedule` table. FSRS models recall, and
-- re-reading a passage produces no recall grade to feed it; a plain
-- multiplicative interval is the honest model. `queue_due` is wall-clock, like
-- `schedule.due`, so the review clock offset and `day_ms` apply unchanged.
alter table extract
  add column if not exists queue_status text not null default 'queued'
    check (queue_status in ('queued', 'distilled', 'dismissed')),
  add column if not exists queue_due timestamptz not null default now(),
  add column if not exists queue_interval_days double precision not null default 1,
  add column if not exists queue_reps int not null default 0,
  add column if not exists queue_last_seen timestamptz;

-- Anything that already produced a note or a card has been through the queue.
update extract e
   set queue_status = 'distilled'
 where queue_status = 'queued'
   and (exists (select 1 from extract_note en where en.extract_id = e.id)
     or exists (select 1 from activity a where a.extract_id = e.id));

create index if not exists extract_queue_idx
  on extract (queue_due, priority)
  where accepted and queue_status = 'queued';
