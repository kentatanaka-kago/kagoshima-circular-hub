-- 1) Allow 'domestic_case' as a source_type (国内事例 articles from CE media RSS)
alter table news_articles drop constraint if exists news_articles_source_type_check;
alter table news_articles add constraint news_articles_source_type_check
  check (source_type in ('municipality', 'news_site', 'national', 'domestic_case'));

-- 2) Note draft queue: admin button stamps this; the local Mac watcher picks
--    up rows where note_publish_requested_at is set and note_draft_url is null.
alter table news_articles add column if not exists note_publish_requested_at timestamptz;

create index if not exists news_articles_note_queue_idx
  on news_articles (note_publish_requested_at)
  where note_publish_requested_at is not null and note_draft_url is null;
