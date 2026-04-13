import * as cheerio from 'cheerio';

const USER_AGENT =
  'KagoshimaCircularHub/0.1 (+https://kagoshima-circular-hub.vercel.app; contact: itkagonma@kenta89.com)';

export async function fetchHtml(url: string): Promise<cheerio.CheerioAPI> {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
  const html = await res.text();
  return cheerio.load(html);
}

export async function fetchXml(url: string): Promise<cheerio.CheerioAPI> {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml,application/xml,text/xml' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
  const xml = await res.text();
  return cheerio.load(xml, { xmlMode: true });
}

export function resolveUrl(base: string, href: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

const KEYWORDS: Array<[RegExp, string]> = [
  [/(補助金|助成|交付金)/, '補助金'],
  [/(廃棄物|リサイクル|資源循環|再資源化|再生利用)/, '資源循環'],
  [/(脱炭素|カーボン|CO2|温室効果ガス|再エネ|再生可能エネルギー|省エネ)/, '脱炭素'],
  [/(プラスチック|容器包装)/, 'プラスチック'],
  [/(食品ロス|フードロス|残渣)/, '食品ロス'],
  [/(バイオマス|堆肥|コンポスト)/, 'バイオマス'],
  [/(サーキュラー|循環経済)/, 'サーキュラー'],
];

export function extractTags(text: string): string[] {
  const found = new Set<string>();
  for (const [re, tag] of KEYWORDS) if (re.test(text)) found.add(tag);
  return [...found];
}

export function relevanceScoreFor(tags: string[]): number {
  if (tags.length === 0) return 0;
  return Math.min(100, tags.length * 25);
}
