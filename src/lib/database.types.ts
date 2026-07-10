export type SourceType = 'municipality' | 'news_site' | 'national' | 'domestic_case';
export type IssuerLevel = 'national' | 'prefectural' | 'municipal';

export type Municipality = {
  id: string;
  name: string;
  name_kana: string | null;
  website_url: string | null;
  news_index_url: string | null;
  created_at: string;
}

export type NewsArticle = {
  id: string;
  source_type: SourceType;
  source_id: string | null;
  source_name: string;
  source_url: string;
  title: string;
  published_at: string | null;
  raw_excerpt: string | null;
  ai_summary: string | null;
  ai_summary_model: string | null;
  tags: string[];
  relevance_score: number | null;
  scraped_at: string;
  created_at: string;
  emailed_at: string | null;
  note_draft_url: string | null;
  note_post_url: string | null;
  note_posted_at: string | null;
  note_publish_requested_at: string | null;
  blog_title: string | null;
  blog_body: string | null;
  /** pgvector column — returned as a string like "[0.1,...]"; written as JSON string */
  embedding: string | null;
}

// All news_articles columns except `embedding` (1536-dim vector ≈ 19KB per
// row as JSON). Use instead of select('*') anywhere the vector is not needed.
export const ARTICLE_COLUMNS =
  'id, source_type, source_id, source_name, source_url, title, published_at, raw_excerpt, ai_summary, ai_summary_model, tags, relevance_score, scraped_at, created_at, emailed_at, note_draft_url, note_post_url, note_posted_at, note_publish_requested_at, blog_title, blog_body';

export type SystemMeta = {
  key: string;
  value: string | null;
  updated_at: string;
}

export type MailRecipient = {
  id: string;
  email: string;
  enabled: boolean;
  note: string | null;
  created_at: string;
}

export type Subsidy = {
  id: string;
  name: string;
  issuer: string;
  issuer_level: IssuerLevel;
  target: string | null;
  amount_text: string | null;
  application_start_at: string | null;
  application_end_at: string | null;
  source_url: string;
  ai_summary: string | null;
  tags: string[];
  created_at: string;
}

// Row returned by the match_news_articles RPC (vector search).
export type MatchedArticle = {
  id: string;
  title: string;
  source_name: string;
  source_url: string;
  source_type: SourceType;
  published_at: string | null;
  scraped_at: string;
  tags: string[];
  ai_summary: string | null;
  note_post_url: string | null;
  similarity: number;
}

export interface Database {
  public: {
    Tables: {
      municipalities: { Row: Municipality; Insert: Partial<Municipality> & Pick<Municipality, 'id' | 'name'>; Update: Partial<Municipality>; Relationships: [] };
      news_articles: { Row: NewsArticle; Insert: Partial<NewsArticle> & Pick<NewsArticle, 'source_type' | 'source_name' | 'source_url' | 'title'>; Update: Partial<NewsArticle>; Relationships: [] };
      subsidies: { Row: Subsidy; Insert: Partial<Subsidy> & Pick<Subsidy, 'name' | 'issuer' | 'issuer_level' | 'source_url'>; Update: Partial<Subsidy>; Relationships: [] };
      system_meta: { Row: SystemMeta; Insert: Partial<SystemMeta> & Pick<SystemMeta, 'key'>; Update: Partial<SystemMeta>; Relationships: [] };
      mail_recipients: { Row: MailRecipient; Insert: Partial<MailRecipient> & Pick<MailRecipient, 'email'>; Update: Partial<MailRecipient>; Relationships: [] };
    };
    Views: { [_ in never]: never };
    Functions: {
      match_news_articles: {
        Args: { query_embedding: string; match_count?: number; filter_source_type?: string | null };
        Returns: MatchedArticle[];
      };
    };
  };
}
