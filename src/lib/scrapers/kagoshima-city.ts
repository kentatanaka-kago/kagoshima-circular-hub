import { extractTags, fetchText, parseRssItems, relevanceScoreFor } from './common';
import type { Scraper, ScrapedArticle } from './types';

const RSS_URL = 'https://www.city.kagoshima.lg.jp/shinchaku/shinchaku.xml';
const SOURCE_ID = '46201';
const SOURCE_NAME = '鹿児島市';

export const kagoshimaCityScraper: Scraper = {
  name: 'kagoshima-city',
  async run(): Promise<ScrapedArticle[]> {
    const xml = await fetchText(RSS_URL);
    const out: ScrapedArticle[] = [];
    for (const item of parseRssItems(xml)) {
      const tags = extractTags(item.title);
      if (relevanceScoreFor(tags) === 0) continue;
      out.push({
        source_type: 'municipality',
        source_id: SOURCE_ID,
        source_name: SOURCE_NAME,
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
