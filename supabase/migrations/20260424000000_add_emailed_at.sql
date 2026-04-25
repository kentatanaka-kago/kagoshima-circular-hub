alter table news_articles add column emailed_at timestamptz;

create index news_articles_emailed_at_idx
  on news_articles (scraped_at)
  where emailed_at is null;

-- Backfill existing articles so the first run doesn't email the entire backlog.
update news_articles set emailed_at = scraped_at where emailed_at is null;
