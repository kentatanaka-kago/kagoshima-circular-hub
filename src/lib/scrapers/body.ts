import * as cheerio from 'cheerio';
import { fetchHtml } from './common';

const JUNK_SELECTORS = [
  'script',
  'style',
  'nav',
  'header',
  'footer',
  'aside',
  '.breadcrumb',
  '.pankuzu',
  '.tmp_header',
  '.tmp_footer',
  '.tmp_menu',
  '.navi',
  '.menu',
  '.globalnav',
  '.sns',
].join(',');

const MAIN_SELECTORS = [
  'main',
  'article',
  '#tmp_main',
  '#main',
  '#contents',
  '.l-main',
  '.col_main',
  '.tmp_contents',
  '#content',
  '.content',
];

const DATE_SELECTORS = [
  '.p-press-release-material__date',        // env.go.jp
  'time[datetime]',
  '.date',
  '.updateDate',
  '.release-date',
];

export interface FetchResult {
  body: string | null;
  publishedAt: string | null;
}

export async function fetchArticlePage(url: string): Promise<FetchResult> {
  try {
    const $ = await fetchHtml(url);
    const publishedAt = extractDate($);
    $(JUNK_SELECTORS).remove();
    const body = extractBody($);
    return { body, publishedAt };
  } catch {
    return { body: null, publishedAt: null };
  }
}

function extractBody($: cheerio.CheerioAPI): string | null {
  for (const sel of MAIN_SELECTORS) {
    const el = $(sel).first();
    if (el.length) {
      const text = normalize(el.text());
      if (text.length >= 200) return text.slice(0, 3000);
    }
  }
  const fallback = normalize($('body').text());
  return fallback.length >= 100 ? fallback.slice(0, 3000) : null;
}

function extractDate($: cheerio.CheerioAPI): string | null {
  for (const sel of DATE_SELECTORS) {
    const el = $(sel).first();
    if (!el.length) continue;
    const attr = el.attr('datetime');
    if (attr) {
      const d = new Date(attr);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
    const text = el.text().trim();
    const iso = parseJapaneseDate(text);
    if (iso) return iso;
  }
  // Fallback: labelled date like "更新日：2026年4月13日" / "公開日：..." found anywhere in body
  const bodyText = $('body').text();
  const m = /(?:更新日|公開日|掲載日|発行日)\s*[：:]\s*([^\n<]{1,40})/.exec(bodyText);
  if (m) {
    const iso = parseJapaneseDate(m[1]);
    if (iso) return iso;
  }
  return null;
}

function parseJapaneseDate(text: string): string | null {
  // YYYY年MM月DD日
  let m = /(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日/.exec(text);
  if (m) return toISO(+m[1], +m[2], +m[3]);
  // 令和N年MM月DD日 (令和元=2019, 令和N=2018+N)
  m = /令和\s*(\d+|元)\s*年\s*(\d{1,2})月\s*(\d{1,2})日/.exec(text);
  if (m) {
    const n = m[1] === '元' ? 1 : +m[1];
    return toISO(2018 + n, +m[2], +m[3]);
  }
  return null;
}

function toISO(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d, -9, 0, 0)); // JST → UTC midnight JST
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

function normalize(s: string): string {
  return s
    .replace(/\u3000/g, ' ')
    .replace(/[\t\r]+/g, ' ')
    .replace(/ +/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
