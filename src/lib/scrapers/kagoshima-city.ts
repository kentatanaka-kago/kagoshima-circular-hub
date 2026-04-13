import { extractTags, fetchXml, relevanceScoreFor } from './common';
import type { Scraper, ScrapedArticle } from './types';

const RSS_URL = 'https://www.city.kagoshima.lg.jp/shinchaku/shinchaku.xml';
const SOURCE_ID = '46201';
const SOURCE_NAME = '鹿児島市';

export const kagoshimaCityScraper: Scraper = {
  name: 'kagoshima-city',
  async run(): Promise<ScrapedArticle[]> {
    const $ = await fetchXml(RSS_URL);
    const out: ScrapedArticle[] = [];
    $('item').each((_, el) => {
      const item = $(el);
      const title = item.find('title').first().text().trim();
      const url = item.find('link').first().text().trim();
      const date = item.find('dc\\:date, date').first().text().trim();
      if (!title || !url) return;
      const tags = extractTags(title);
      if (relevanceScoreFor(tags) === 0) return;
      out.push({
        source_type: 'municipality',
        source_id: SOURCE_ID,
        source_name: SOURCE_NAME,
        source_url: url,
        title,
        published_at: date ? new Date(date).toISOString() : null,
        raw_excerpt: null,
        tags,
      });
    });
    return out;
  },
};
