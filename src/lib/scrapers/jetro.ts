import { extractRegulationTags, extractTags, fetchText, parseRssItems } from './common';
import type { Scraper, ScrapedArticle } from './types';

// JETRO ビジネス短信 — 世界の通商・規制ニュース。CE 関連の法規制
// (CBAM, ESPR, 電池規則 …) の一次報道が厚いが、フィード全体は規制と
// 無関係な経済ニュースが大半なので、法規制キーワードに一致した記事
// だけを採用する。Shown on /regulations (and the top feed) via the
// 法規制 tag.
const RSS_URL = 'https://www.jetro.go.jp/rss2/biznews.xml';

export const jetroScraper: Scraper = {
  name: 'jetro-biznews',
  async run(): Promise<ScrapedArticle[]> {
    const xml = await fetchText(RSS_URL);
    const out: ScrapedArticle[] = [];
    for (const item of parseRssItems(xml)) {
      if (extractRegulationTags(item.title).length === 0) continue;
      out.push({
        source_type: 'national',
        source_id: 'jetro.go.jp',
        source_name: 'JETROビジネス短信',
        source_url: item.link,
        title: item.title,
        published_at: item.publishedAt,
        raw_excerpt: null,
        tags: extractTags(item.title),
      });
    }
    return out;
  },
};
