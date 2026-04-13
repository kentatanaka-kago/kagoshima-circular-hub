import { extractTags, fetchHtml, relevanceScoreFor, resolveUrl } from './common';
import type { Scraper, ScrapedArticle } from './types';

const INDEX_URL = 'https://www.env.go.jp/press/index.html';
const SOURCE_NAME = '環境省';

export const envGoJpScraper: Scraper = {
  name: 'env-go-jp',
  async run(): Promise<ScrapedArticle[]> {
    const $ = await fetchHtml(INDEX_URL);
    const out: ScrapedArticle[] = [];
    $('main a[href], #main a[href], .l-main a[href]').each((_, el) => {
      const a = $(el);
      const href = a.attr('href');
      const title = a.text().trim();
      if (!href || !title || title.length < 6) return;
      const url = resolveUrl(INDEX_URL, href);
      if (!url.startsWith('https://www.env.go.jp/')) return;
      const tags = extractTags(title);
      if (relevanceScoreFor(tags) === 0) return;
      out.push({
        source_type: 'national',
        source_id: 'env.go.jp',
        source_name: SOURCE_NAME,
        source_url: url,
        title,
        published_at: null,
        raw_excerpt: null,
        tags,
      });
    });
    const seen = new Set<string>();
    return out.filter((a) => (seen.has(a.source_url) ? false : (seen.add(a.source_url), true)));
  },
};
