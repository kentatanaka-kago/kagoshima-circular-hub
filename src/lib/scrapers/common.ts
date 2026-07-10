import * as cheerio from 'cheerio';

// METI's WebOTX CDN hangs connections that carry a bot-identifying
// suffix in the UA (empirically verified). Stick to a stock Chrome UA.
// Politeness is enforced by scheduling (once daily) and by honouring
// ETag / Last-Modified on each request naturally via the CDN.
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/rss+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
      'Accept-Encoding': 'gzip, deflate',
    },
    cache: 'no-store',
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
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
  [/(脱炭素|カーボン|CO2|温室効果ガス|再エネ|再生可能エネルギー|省エネ|GX\b|グリーントランスフォーメーション|JCM|二国間クレジット)/, '脱炭素'],
  [/(プラスチック|容器包装)/, 'プラスチック'],
  [/(食品ロス|フードロス|残渣)/, '食品ロス'],
  [/(バイオマス|堆肥|コンポスト)/, 'バイオマス'],
  [/(サーキュラー|循環経済)/, 'サーキュラー'],
];

// Secondary tags — attached only when a CE keyword is already present.
const SECONDARY_KEYWORDS: Array<[RegExp, string]> = [
  [/(補助金|助成|交付金)/, '補助金'],
];

// CE-related regulations to track (EU product rules / EU trade & reporting /
// domestic law). A match adds the umbrella tag '法規制' plus the specific tag,
// and counts as a relevance signal on its own — regulation news often lacks
// generic CE keywords in the title. Shown on /regulations.
export const REGULATION_TAG = '法規制';
export const REGULATION_KEYWORDS: Array<[RegExp, string]> = [
  // EU product regulations
  [/\bESPR\b|エコデザイン規則|持続可能な製品のためのエコデザイン/i, 'ESPR'],
  [/\bDPP\b|デジタル(プロダクト|製品)パスポート|(バッテリー|電池)パスポート/i, 'DPP'],
  [/(欧州|EU)(電池|バッテリー)規則/i, '電池規則'],
  [/\bPPWR\b|包装(・|および)?包装廃棄物規則|欧州包装規則/i, 'PPWR'],
  [/\bELV\b|廃(自動)?車規則|自動車設計・廃車管理規則/i, 'ELV'],
  [/\bCEA\b|循環経済法|サーキュラーエコノミー法/i, 'CEA'],
  // EU trade / reporting
  [/\bCBAM\b|炭素国境調整/i, 'CBAM'],
  [/\bCSRD\b|\bCSDDD\b|サステナビリティ報告指令|デュー・?ディリジェンス指令/i, 'CSRD/CSDDD'],
  [/\bEUDR\b|森林破壊防止規則|森林減少防止/i, 'EUDR'],
  // Domestic law
  [/資源有効利用促進法/, '資源有効利用促進法'],
  [/プラスチック(に係る)?資源循環(の)?促進(等に関する)?法|プラ新法/, 'プラ新法'],
  [/GX-?ETS|排出量取引制度/i, 'GX-ETS'],
  [/ウラノス|Ouranos/i, 'ウラノス'],
  [/産業廃棄物処理法|廃棄物処理法|廃掃法/, '廃棄物処理法'],
];

export function extractRegulationTags(text: string): string[] {
  const found = new Set<string>();
  for (const [re, tag] of REGULATION_KEYWORDS) if (re.test(text)) found.add(tag);
  if (found.size > 0) found.add(REGULATION_TAG);
  return [...found];
}

export function extractTags(text: string): string[] {
  const found = new Set<string>();
  for (const [re, tag] of CE_KEYWORDS) if (re.test(text)) found.add(tag);
  for (const tag of extractRegulationTags(text)) found.add(tag);
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
  const raw = re.exec(s)?.[1]?.trim() ?? '';
  // WordPress feeds wrap fields in CDATA.
  return raw.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function normalizeDate(s: string): string | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
