export type SourceType = 'municipality' | 'news_site' | 'national';
export type IssuerLevel = 'national' | 'prefectural' | 'municipal';

export interface Municipality {
  id: string;
  name: string;
  name_kana: string | null;
  website_url: string | null;
  news_index_url: string | null;
  created_at: string;
}

export interface NewsArticle {
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
  blog_title: string | null;
  blog_body: string | null;
}

export interface SystemMeta {
  key: string;
  value: string | null;
  updated_at: string;
}

export interface Subsidy {
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

export interface Database {
  public: {
    Tables: {
      municipalities: { Row: Municipality; Insert: Partial<Municipality> & Pick<Municipality, 'id' | 'name'>; Update: Partial<Municipality> };
      news_articles: { Row: NewsArticle; Insert: Partial<NewsArticle> & Pick<NewsArticle, 'source_type' | 'source_name' | 'source_url' | 'title'>; Update: Partial<NewsArticle> };
      subsidies: { Row: Subsidy; Insert: Partial<Subsidy> & Pick<Subsidy, 'name' | 'issuer' | 'issuer_level' | 'source_url'>; Update: Partial<Subsidy> };
      system_meta: { Row: SystemMeta; Insert: Partial<SystemMeta> & Pick<SystemMeta, 'key'>; Update: Partial<SystemMeta> };
    };
  };
}
