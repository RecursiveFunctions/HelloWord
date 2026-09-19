-- Workstream A, band 100-199. Additive only.
-- RSS subscriptions for POST /api/feeds/refresh, plus the lookup that
-- "have I already ingested this URL?" does on every feed refresh and paste.

create table if not exists feed (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  feed_url        text not null unique,
  site_url        text,
  last_fetched_at timestamptz,
  created_at      timestamptz not null default now()
);

-- Keep in step with lib/store/default-feeds.ts.
insert into feed (title, feed_url, site_url) values
  ('Simon Willison', 'https://simonwillison.net/atom/everything/', 'https://simonwillison.net'),
  ('Julia Evans',    'https://jvns.ca/atom.xml',                   'https://jvns.ca'),
  ('Dan Luu',        'https://danluu.com/atom.xml',                'https://danluu.com')
on conflict (feed_url) do nothing;

create index if not exists source_origin_uri_idx on source (origin_uri);
