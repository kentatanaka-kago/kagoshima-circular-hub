import * as cheerio from 'cheerio';

const USER_AGENT =
  'KagoshimaCircularHub/0.1 (+https://kagoshima-circular-hub.vercel.app; contact: itkagonma@kenta89.com)';

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml,application/rss+xml,application/xml' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const charset = detectCharset(res.headers.get('content-type'), buffer);
  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
}

function detectCharset(contentType: string | null, buffer: Buffer): string {
  const fromHeader = contentType?.match(/charset=([^;\s]+)/i)?.[1];
  if (fromHeader) return normalizeCharset(fromHeader);
  const head = buffer.subarray(0, 2048).toString('ascii');
  const fromMeta = head.match(/charset=["']?([a-zA-Z0-9_-]+)/i)?.[1];
  return normalizeCharset(fromMeta ?? 'utf-8');
}

function normalizeCharset(c: string): string {
  const k = c.toLowerCase();
  if (k === 'shift_jis' || k === 'shift-jis' || k === 'x-sjis') return 'shift-jis';
  if (k === 'euc-jp' || k === 'eucjp') return 'euc-jp';
  return k;
}

export async function fetchHtml(url: string): Promise<cheerio.CheerioAPI> {
  return cheerio.load(await fetchText(url));
}

export function resolveUrl(base: string, href: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

// CE keywords — at least one of these must match for the article to be
// considered relevant. "補助金" alone is NOT a CE signal (税務取扱い、
// 生活支援補助金 など CE と無関係なものが大量にヒットするため).
const CE_KEYWORDS: Array<[RegExp, string]> = [
  [/(廃棄物|リサイクル|資源循環|循環型|再資源化|再生利用|リユース|リペア|分別回収)/, '資源循環'],
  [/(脱炭素|カーボン|CO2|温室効果ガス|再エネ|再生可能エネルギー|省エネ)/, '脱炭素'],
  [/(プラスチック|容器包装)/, 'プラスチック'],
  [/(食品ロス|フードロス|残渣)/, '食品ロス'],
  [/(バイオマス|堆肥|コンポスト)/, 'バイオマス'],
  [/(サーキュラー|循環経済)/, 'サーキュラー'],
];

// Secondary tags — attached only when a CE keyword is already present.
const SECONDARY_KEYWORDS: Array<[RegExp, string]> = [
  [/(補助金|助成|交付金)/, '補助金'],
];

export function extractTags(text: string): string[] {
  const found = new Set<string>();
  for (const [re, tag] of CE_KEYWORDS) if (re.test(text)) found.add(tag);
  if (found.size > 0) {
    for (const [re, tag] of SECONDARY_KEYWORDS) if (re.test(text)) found.add(tag);
  }
  return [...found];
}

export function relevanceScoreFor(tags: string[]): number {
  const ceCount = tags.filter((t) => t !== '補助金').length;
  if (ceCount === 0) return 0;
  return Math.min(100, ceCount * 25);
}

// Regex-based RSS parsing — cheerio's XML mode mishandles namespaced
// tags like <dc:date>, so we extract fields directly from the XML text.
export interface RssItem {
  title: string;
  link: string;
  publishedAt: string | null;
}

export function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const body = m[1];
    const title = decodeEntities(pick(body, /<title>([\s\S]*?)<\/title>/));
    const link = decodeEntities(pick(body, /<link>([\s\S]*?)<\/link>/));
    const date = pick(body, /<dc:date>([\s\S]*?)<\/dc:date>/) || pick(body, /<pubDate>([\s\S]*?)<\/pubDate>/);
    if (!title || !link) continue;
    items.push({ title: title.trim(), link: link.trim(), publishedAt: normalizeDate(date) });
  }
  return items;
}

function pick(s: string, re: RegExp): string {
  return re.exec(s)?.[1]?.trim() ?? '';
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function normalizeDate(s: string): string | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
