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

export async function fetchBody(url: string): Promise<string | null> {
  try {
    const $ = await fetchHtml(url);
    $(JUNK_SELECTORS).remove();

    for (const sel of MAIN_SELECTORS) {
      const el = $(sel).first();
      if (el.length) {
        const text = normalize(el.text());
        if (text.length >= 200) return text.slice(0, 3000);
      }
    }
    const fallback = normalize($('body').text());
    return fallback.length >= 100 ? fallback.slice(0, 3000) : null;
  } catch {
    return null;
  }
}

function normalize(s: string): string {
  return s
    .replace(/\u3000/g, ' ')
    .replace(/[\t\r]+/g, ' ')
    .replace(/ +/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
