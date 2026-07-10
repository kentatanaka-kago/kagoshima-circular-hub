-- Vector search: pgvector + embedding column + cosine match RPC.
-- Embeddings are produced by OpenAI text-embedding-3-small (1536 dims)
-- during the daily aggregate run (backfillEmbeddings).
create extension if not exists vector;

alter table news_articles add column if not exists embedding vector(1536);

create index if not exists news_articles_embedding_idx
  on news_articles using hnsw (embedding vector_cosine_ops);

create or replace function match_news_articles(
  query_embedding vector(1536),
  match_count int default 20,
  filter_source_type text default null
)
returns table (
  id uuid,
  title text,
  source_name text,
  source_url text,
  source_type text,
  published_at timestamptz,
  scraped_at timestamptz,
  tags text[],
  ai_summary text,
  note_post_url text,
  similarity float
)
language sql stable as $$
  select
    a.id, a.title, a.source_name, a.source_url, a.source_type,
    a.published_at, a.scraped_at, a.tags, a.ai_summary, a.note_post_url,
    1 - (a.embedding <=> query_embedding) as similarity
  from news_articles a
  where a.embedding is not null
    and (filter_source_type is null or a.source_type = filter_source_type)
  order by a.embedding <=> query_embedding
  limit least(match_count, 100);
$$;
