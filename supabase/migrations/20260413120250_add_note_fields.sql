-- Track blog posts generated on note.com per article
alter table news_articles
  add column note_draft_url   text,
  add column note_post_url    text,
  add column note_posted_at   timestamptz,
  add column blog_title       text,
  add column blog_body        text;

create index news_articles_unposted_idx
  on news_articles (created_at desc)
  where note_draft_url is null;
