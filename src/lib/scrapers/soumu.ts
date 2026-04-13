import { createNationalHtmlScraper, parseJpDateLoose } from './national-html';

// MIC (総務省) publishes its 報道資料 index in Shift-JIS. The fetcher in
// common.ts decodes based on the meta charset; the pattern itself is the
// same "date ... <a>" as METI.
const DATE_LINK_RE =
  /(20\d{2}年\d{1,2}月\d{1,2}日|令和\d+年\d{1,2}月\d{1,2}日)[\s\S]{0,200}?<a[^>]+href="(\/menu_news\/s-news\/[^"]+\.html)"[^>]*>([^<]{8,160})<\/a>/g;

export const soumuScraper = createNationalHtmlScraper({
  id: 'soumu.go.jp',
  name: '総務省',
  indexUrl: 'https://www.soumu.go.jp/menu_news/s-news/index.html',
  urlPrefix: 'https://www.soumu.go.jp/',
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
});
