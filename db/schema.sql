-- HelloWord schema. Frozen in the contracts commit.
-- Apply against Tiger Cloud (pgvector + pgvectorscale + TimescaleDB).
-- Workstream migrations are additive only, in reserved bands:
--   A 100-199  B 200-299  C 300-399  D 400-499

create extension if not exists vectorscale cascade;   -- pulls in pgvector

-- immutable imported reading material
create table source (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('pdf','url')),
  title         text not null,
  origin_uri    text not null,
  storage_key   text,                      -- Spaces key, pdf only
  markdown      text,                      -- null until ingested
  ingest_status text not null default 'pending'
                check (ingest_status in ('pending','processing','ready','failed')),
  ingest_method text check (ingest_method in ('unpdf','defuddle','gemini_vision','gemini_url')),
  ingest_error  text,
  word_count    int,
  created_at    timestamptz not null default now(),
  -- the invariant: nothing is readable or extractable until it is markdown
  constraint source_ready_implies_markdown
    check (ingest_status <> 'ready' or markdown is not null)
);

-- the pivot: human-readable, human-editable
create table note (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  body_md    text not null default '',
  body_hash  text not null,                -- sha256(body_md), maintained by the app
  origin     text not null default 'human'
             check (origin in ('human','ai_drafted','ai_edited')),
  embedding  vector(768),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table extract (
  id            uuid primary key default gen_random_uuid(),
  source_id     uuid references source(id) on delete cascade,
  note_id       uuid references note(id)   on delete cascade,
  body_md       text not null,
  priority      int  not null default 50 check (priority between 0 and 100),
  selector      jsonb not null,            -- SelectorBundle
  anchor_status text not null default 'anchored'
                check (anchor_status in ('anchored','orphaned','detached')),
  suggested_by  text not null default 'human' check (suggested_by in ('human','nemotron')),
  accepted      boolean not null default true,
  embedding     vector(768),
  created_at    timestamptz not null default now(),
  check (num_nonnulls(source_id, note_id) = 1)   -- an extract has exactly one parent
);

create table extract_note (                 -- many extracts distil into many notes
  extract_id uuid references extract(id) on delete cascade,
  note_id    uuid references note(id)    on delete cascade,
  primary key (extract_id, note_id)
);

create table activity (
  id               uuid primary key default gen_random_uuid(),
  note_id          uuid not null references note(id) on delete cascade,
  type             text not null check (type in ('mcq','select_all','fill_blank','closed')),
  payload          jsonb not null,          -- ActivityPayload, discriminated on type
  source_body_hash text not null,           -- note.body_hash at generation time
  variant_of       uuid references activity(id),
  created_at       timestamptz not null default now()
);

-- staleness is derived, never stored
create view activity_v as
  select a.*, (a.source_body_hash <> n.body_hash) as stale
  from activity a join note n on n.id = a.note_id;

-- column names map 1:1 onto the ts-fsrs Card interface
create table schedule (
  activity_id    uuid primary key references activity(id) on delete cascade,
  due            timestamptz not null,
  stability      double precision not null default 0,
  difficulty     double precision not null default 0,
  elapsed_days   int not null default 0,
  scheduled_days int not null default 0,
  learning_steps int not null default 0,
  reps           int not null default 0,
  lapses         int not null default 0,
  state          smallint not null default 0,   -- ts-fsrs State enum
  last_review    timestamptz,
  -- per-card interval multiplier, SuperMemo's A-factor in spirit.
  -- 1.0 = whatever FSRS said. <1 shows it more often, >1 less often.
  a_factor       double precision not null default 1.0
                 check (a_factor between 0.1 and 5.0)
);

-- user-tunable scheduling. one row per user; single-row for the hackathon.
create table scheduler_profile (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  request_retention double precision not null default 0.90
                    check (request_retention between 0.70 and 0.98),
  maximum_interval  int not null default 36500,
  learning_steps    text[] not null default '{1m,10m}',
  relearning_steps  text[] not null default '{10m}',
  enable_fuzz       boolean not null default true,
  -- global multiplier applied on top of every card's own a_factor
  interval_modifier double precision not null default 1.0
                    check (interval_modifier between 0.01 and 5.0),
  -- length of one FSRS "day" in real milliseconds. 86400000 = normal.
  -- lower it to compress the whole schedule for a demo.
  day_ms            bigint not null default 86400000
                    check (day_ms between 250 and 86400000),
  created_at        timestamptz not null default now()
);

create table review_event (
  time           timestamptz not null default now(),
  activity_id    uuid not null,
  note_id        uuid not null,
  concept_id     uuid,
  rating         smallint not null,             -- ts-fsrs Rating 1..4
  state          smallint not null,
  elapsed_days   int not null,
  scheduled_days int not null,
  stability      double precision not null,
  difficulty     double precision not null,
  duration_ms    int,
  mode           text not null default 'queue' check (mode in ('queue','quiz','voice'))
) with (tsdb.hypertable, tsdb.partition_column = 'time', tsdb.chunk_interval = '1 day');

create table concept (
  id        uuid primary key default gen_random_uuid(),
  label     text not null unique,
  embedding vector(768)
);
create table concept_note    (concept_id uuid references concept(id) on delete cascade,
                              note_id    uuid references note(id)    on delete cascade,
                              primary key (concept_id, note_id));
create table concept_extract (concept_id uuid references concept(id) on delete cascade,
                              extract_id uuid references extract(id) on delete cascade,
                              primary key (concept_id, extract_id));

create table notebook (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  color       text,
  created_at  timestamptz not null default now()
);

-- polymorphic on purpose: the Library screen reads notebook contents in one query
create table notebook_item (
  notebook_id uuid not null references notebook(id) on delete cascade,
  item_type   text not null check (item_type in ('source','note','extract','activity')),
  item_id     uuid not null,
  added_at    timestamptz not null default now(),
  primary key (notebook_id, item_type, item_id)
);

create table quizset (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  kind       text not null check (kind in ('flashcards','quiz')),
  created_at timestamptz not null default now()
);
create table quizset_activity (
  quizset_id  uuid references quizset(id) on delete cascade,
  activity_id uuid references activity(id) on delete cascade,
  position    int not null,
  primary key (quizset_id, activity_id)
);

create index extract_embedding_idx on extract using diskann (embedding vector_cosine_ops);
create index note_embedding_idx    on note    using diskann (embedding vector_cosine_ops);
create index schedule_due_idx      on schedule (due);

-- ships in the contracts commit so C and D can both read it from hour zero
create materialized view review_daily
with (timescaledb.continuous) as
select time_bucket('1 day', time) as bucket,
       concept_id,
       count(*)                                   as reviews,
       count(*) filter (where rating >= 2)        as recalled,
       avg(stability)                             as avg_stability,
       avg(difficulty)                            as avg_difficulty,
       avg(duration_ms)                           as avg_duration_ms
from review_event
group by bucket, concept_id;

select add_continuous_aggregate_policy('review_daily',
  start_offset      => interval '90 days',
  end_offset        => interval '1 hour',
  schedule_interval => interval '1 hour');
