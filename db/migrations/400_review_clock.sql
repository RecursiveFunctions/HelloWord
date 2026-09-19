-- D, band 400-499. Additive.
--
-- The demo affordance behind "skip ahead": an offset added to wall-clock time
-- for every review query, so a queue that is empty until tomorrow can be shown
-- now without touching a single due date.
--
-- Pulling `schedule.due` backwards would have been the obvious shortcut and is
-- exactly wrong: FSRS would then see a card answered earlier than it scheduled,
-- read that as an early successful recall, and inflate stability. Moving the
-- observer instead of the schedule keeps elapsed_days honest.
alter table scheduler_profile
  add column if not exists clock_offset_ms bigint not null default 0;
