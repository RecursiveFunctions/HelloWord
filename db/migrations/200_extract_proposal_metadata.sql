-- Metadata shown beside accepted Nemotron extract proposals.
alter table extract add column if not exists suggestion_reason text;
alter table extract add column if not exists suggestion_concepts text[] not null default '{}';

-- One accepted source passage is one extract, regardless of which AI run found it.
create unique index if not exists extract_source_body_unique
  on extract (source_id, body_md)
  where source_id is not null and accepted;