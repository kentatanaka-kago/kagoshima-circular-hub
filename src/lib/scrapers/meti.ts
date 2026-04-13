import {
  createNationalHtmlScraper,
  parseJpDateLoose,
  parseNationalHtml,
  type NationalHtmlConfig,
} from './national-html';
import type { ScrapedArticle } from './types';

// METI press index: "2026年4月13日" text preceding a press-release anchor
// within /press/YYYY/MM/... paths.
const DATE_LINK_RE =
  /(20\d{2}年\d{1,2}月\d{1,2}日)[\s\S]{0,200}?<a[^>]+href="(\/press\/[^"]+\.html)"[^>]*>([^<]{8,120})<\/a>/g;

export const metiConfig: NationalHtmlConfig = {
  id: 'meti.go.jp',
  name: '経済産業省',
  indexUrl: 'https://www.meti.go.jp/press/',
  urlPrefix: 'https://www.meti.go.jp/',
  extractItems(html) {
    const out: Array<{ title: string; url: string; publishedAt: string | null }> = [];
    let m: RegExpExecArray | null;
    DATE_LINK_RE.lastIndex = 0;
    while ((m = DATE_LINK_RE.exec(html)) !== null) {
      out.push({
        publishedAt: parseJpDateLoose(m[1]),
        url: m[2],
        title: m[3],
      });
    }
    return out;
  },
};

export const metiScraper = createNationalHtmlScraper(metiConfig);

export function parseMetiHtml(html: string): ScrapedArticle[] {
  return parseNationalHtml(metiConfig, html);
}
