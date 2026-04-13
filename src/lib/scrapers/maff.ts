import { createNationalHtmlScraper } from './national-html';

// MAFF press index encodes the publication date in each press-release URL
// as YYMMDD.html — e.g. 260413.html = 2026/04/13.
const LINK_RE = /<a[^>]+href="(\.\/[^"]+\/(\d{6})\.html)"[^>]*>([^<]{8,160})<\/a>/g;

function yymmddToISO(yymmdd: string): string | null {
  const y = 2000 + Number(yymmdd.slice(0, 2));
  const m = Number(yymmdd.slice(2, 4));
  const d = Number(yymmdd.slice(4, 6));
  if (!y || !m || !d) return null;
  const dt = new Date(Date.UTC(y, m - 1, d, -9, 0, 0));
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

export const maffScraper = createNationalHtmlScraper({
  id: 'maff.go.jp',
  name: '農林水産省',
  indexUrl: 'https://www.maff.go.jp/j/press/',
  urlPrefix: 'https://www.maff.go.jp/',
  extractItems(html) {
    const out: Array<{ title: string; url: string; publishedAt: string | null }> = [];
    let m: RegExpExecArray | null;
    LINK_RE.lastIndex = 0;
    while ((m = LINK_RE.exec(html)) !== null) {
      out.push({ url: m[1], publishedAt: yymmddToISO(m[2]), title: m[3] });
    }
    return out;
  },
});
