import { extractTags, fetchText, parseRssItems, relevanceScoreFor } from './common';
import type { Scraper, ScrapedArticle } from './types';

export interface MunicipalityRssConfig {
  id: string;           // Scraper + municipality id, e.g. '46201'
  name: string;         // Display name '鹿児島市'
  rssUrl: string;
}

export function createMunicipalityRssScraper(config: MunicipalityRssConfig): Scraper {
  return {
    name: `municipality-${config.id}`,
    async run(): Promise<ScrapedArticle[]> {
      const xml = await fetchText(config.rssUrl);
      const out: ScrapedArticle[] = [];
      for (const item of parseRssItems(xml)) {
        const tags = extractTags(item.title);
        if (relevanceScoreFor(tags) === 0) continue;
        out.push({
          source_type: 'municipality',
          source_id: config.id,
          source_name: config.name,
          source_url: item.link,
          title: item.title,
          published_at: item.publishedAt,
          raw_excerpt: null,
          tags,
        });
      }
      return out;
    },
  };
}
