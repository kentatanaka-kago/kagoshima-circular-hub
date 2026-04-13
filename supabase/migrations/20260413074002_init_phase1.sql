-- Phase 1: information aggregation schema
-- tables: municipalities, news_articles, subsidies

create table municipalities (
  id              text primary key,
  name            text not null,
  name_kana       text,
  website_url     text,
  news_index_url  text,
  created_at      timestamptz not null default now()
);

create table news_articles (
  id                 uuid primary key default gen_random_uuid(),
  source_type        text not null check (source_type in ('municipality', 'news_site', 'national')),
  source_id          text,
  source_name        text not null,
  source_url         text not null unique,
  title              text not null,
  published_at       timestamptz,
  raw_excerpt        text,
  ai_summary         text,
  ai_summary_model   text,
  tags               text[] not null default '{}',
  relevance_score    int,
  scraped_at         timestamptz not null default now(),
  created_at         timestamptz not null default now()
);

create index news_articles_published_at_idx on news_articles (published_at desc nulls last);
create index news_articles_source_idx on news_articles (source_type, source_id);
create index news_articles_tags_idx on news_articles using gin (tags);

create table subsidies (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  issuer                text not null,
  issuer_level          text not null check (issuer_level in ('national', 'prefectural', 'municipal')),
  target                text,
  amount_text           text,
  application_start_at  date,
  application_end_at    date,
  source_url            text not null,
  ai_summary            text,
  tags                  text[] not null default '{}',
  created_at            timestamptz not null default now()
);

create index subsidies_deadline_idx on subsidies (application_end_at) where application_end_at is not null;
create index subsidies_issuer_level_idx on subsidies (issuer_level);

-- RLS: public read-only for Phase 1 frontend via the anon key
alter table municipalities enable row level security;
alter table news_articles enable row level security;
alter table subsidies enable row level security;

create policy "public read municipalities" on municipalities for select using (true);
create policy "public read news_articles"  on news_articles  for select using (true);
create policy "public read subsidies"      on subsidies      for select using (true);

-- Writes are restricted to service_role (no public policy for insert/update/delete).
