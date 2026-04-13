import type { SourceType } from '../database.types';

export interface ScrapedArticle {
  source_type: SourceType;
  source_id: string | null;
  source_name: string;
  source_url: string;
  title: string;
  published_at: string | null;
  raw_excerpt: string | null;
  tags: string[];
}

export interface ScraperResult {
  source: string;
  fetched: number;
  error?: string;
}

export interface Scraper {
  name: string;
  run: () => Promise<ScrapedArticle[]>;
}
