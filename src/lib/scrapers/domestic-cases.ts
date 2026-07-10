import { extractTags, fetchText, parseRssItems } from './common';
import type { Scraper, ScrapedArticle } from './types';

// 国内事例 (domestic CE case studies) — collected from CE-focused media that
// publish standard RSS feeds. Google News RSS is deliberately NOT used here:
// its terms restrict the feed to personal, non-commercial feed readers.
// Displayed on /cases, excluded from the top page and from email delivery.
interface CaseFeed {
  id: string;
  name: string;
  rssUrl: string;
  // 'all': dedicated CE media — every item is relevant.
  // 'keyword': broader media — keep only titles matching CE keywords.
  filter: 'all' | 'keyword';
}

const FEEDS: CaseFeed[] = [
  { id: 'cehub', name: 'Circular Economy Hub', rssUrl: 'https://cehub.jp/feed/', filter: 'all' },
  { id: 'ideasforgood', name: 'IDEAS FOR GOOD', rssUrl: 'https://ideasforgood.jp/feed/', filter: 'keyword' },
];

export const domesticCasesScraper: Scraper = {
  name: 'domestic-cases',
  async run(): Promise<ScrapedArticle[]> {
    const out: ScrapedArticle[] = [];
    const errors: string[] = [];
    for (const feed of FEEDS) {
      try {
        const xml = await fetchText(feed.rssUrl);
        for (const item of parseRssItems(xml)) {
          const tags = extractTags(item.title);
          if (feed.filter === 'keyword' && tags.length === 0) continue;
          out.push({
            source_type: 'domestic_case',
            source_id: feed.id,
            source_name: feed.name,
            source_url: item.link,
            title: item.title,
            published_at: item.publishedAt,
            raw_excerpt: null,
            tags,
          });
        }
      } catch (e) {
        errors.push(`${feed.id}: ${(e as Error).message}`);
      }
    }
    if (out.length === 0 && errors.length > 0) {
      throw new Error(errors.join(' / '));
    }
    if (errors.length > 0) console.error('[domestic-cases] partial failure:', errors.join(' / '));
    return out;
  },
};
