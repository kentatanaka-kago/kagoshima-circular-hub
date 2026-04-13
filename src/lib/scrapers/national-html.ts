import { extractTags, fetchText, relevanceScoreFor, resolveUrl } from './common';
import type { Scraper, ScrapedArticle } from './types';

export interface NationalHtmlConfig {
  id: string;
  name: string;
  indexUrl: string;
  // How to pair a publication date with each article link.
  extractItems: (html: string) => Array<{ title: string; url: string; publishedAt: string | null }>;
  urlPrefix?: string; // Optional allowlist — only keep links starting with this prefix.
}

export function parseNationalHtml(config: NationalHtmlConfig, html: string): ScrapedArticle[] {
  const items = config.extractItems(html);
  const seen = new Set<string>();
  const out: ScrapedArticle[] = [];
  for (const item of items) {
    const url = resolveUrl(config.indexUrl, item.url);
    if (config.urlPrefix && !url.startsWith(config.urlPrefix)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    const tags = extractTags(item.title);
    if (relevanceScoreFor(tags) === 0) continue;
    out.push({
      source_type: 'national',
      source_id: config.id,
      source_name: config.name,
      source_url: url,
      title: item.title.trim(),
      published_at: item.publishedAt,
      raw_excerpt: null,
      tags,
    });
  }
  return out;
}

export function createNationalHtmlScraper(config: NationalHtmlConfig): Scraper {
  return {
    name: `national-${config.id}`,
    async run(): Promise<ScrapedArticle[]> {
      const html = await fetchText(config.indexUrl);
      return parseNationalHtml(config, html);
    },
  };
}

// Parses "2026年4月13日" or "令和8年4月13日" into an ISO string (JST midnight).
export function parseJpDateLoose(text: string): string | null {
  let m = /(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日/.exec(text);
  if (m) return toISOJst(+m[1], +m[2], +m[3]);
  m = /令和\s*(\d+|元)\s*年\s*(\d{1,2})月\s*(\d{1,2})日/.exec(text);
  if (m) {
    const n = m[1] === '元' ? 1 : +m[1];
    return toISOJst(2018 + n, +m[2], +m[3]);
  }
  return null;
}

function toISOJst(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d, -9, 0, 0));
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}
