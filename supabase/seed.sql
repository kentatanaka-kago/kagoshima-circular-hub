-- Seed the three MVP sources for Phase 1.
-- 43市町村の追加は後続タスク。
insert into municipalities (id, name, name_kana, website_url, news_index_url) values
  ('46201', '鹿児島市',   'かごしまし',    'https://www.city.kagoshima.lg.jp', 'https://www.city.kagoshima.lg.jp/shinchaku/index.html'),
  ('46000', '鹿児島県',   'かごしまけん',  'https://www.pref.kagoshima.jp',    'https://www.pref.kagoshima.jp/saishin/index.html')
on conflict (id) do update set
  name = excluded.name,
  name_kana = excluded.name_kana,
  website_url = excluded.website_url,
  news_index_url = excluded.news_index_url;
