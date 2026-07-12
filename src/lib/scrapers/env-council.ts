import * as cheerio from 'cheerio';
import { REGULATION_TAG, extractTags, fetchText, resolveUrl } from './common';
import type { Scraper, ScrapedArticle } from './types';

// 中央環境審議会 循環型社会部会とその現役小委員会の開催実績。
// 資源有効利用促進法改正・太陽光パネルリサイクル制度などの法制化は
// プレスリリースより先にここで審議されるため、/regulations の一次情報
// として法規制タグを必ず付与する。
//
// ページ構成: 部会トップに「令和◯年◯月◯日 会合名 議事次第・配布資料／議事録」
// 形式の <li> が並び、「小委員会・専門委員会」見出しの下に現役小委員会への
// リンクがある（「廃止された小委員会」「旧部会」配下は追わない）。
const INDEX_URL = 'https://www.env.go.jp/council/03recycle/yoshi03.html';
const SOURCE_NAME = '環境省 審議会';
// 過去会合まで遡ると初回実行で数百件が一気に入りメール配信が溢れるため、
// 直近の会合だけを扱う。
const RECENT_DAYS = 180;
const MAX_SUBCOMMITTEES = 15;

const ERA_DATE_RE = /^(令和|平成)([0-9０-９]+|元)年([0-9０-９]+)月([0-9０-９]+)日/;
// li 末尾のリンクラベル（配布/配付の表記ゆれあり）を会合名から取り除く。
const LINK_LABEL_RE = /(議事次第(・配[布付]資料)?|配[布付]資料|議事録|議事要旨|／)/g;

function toHalfWidth(s: string): string {
  return s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

function parseEraDate(era: string, year: string, month: string, day: string): Date | null {
  const y = (era === '令和' ? 2018 : 1988) + (year === '元' ? 1 : Number(toHalfWidth(year)));
  const d = new Date(`${y}-${toHalfWidth(month).padStart(2, '0')}-${toHalfWidth(day).padStart(2, '0')}T00:00:00+09:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

interface Meeting {
  title: string;
  url: string;
  publishedAt: string;
}

function parseMeetings(html: string, pageUrl: string, since: Date): Meeting[] {
  const $ = cheerio.load(html);
  const out: Meeting[] = [];
  $('main li, #main li, .l-main li').each((_, el) => {
    const li = $(el);
    const text = li.text().replace(/\s+/g, ' ').trim();
    const m = ERA_DATE_RE.exec(text);
    if (!m) return;
    const date = parseEraDate(m[1], m[2], m[3], m[4]);
    if (!date || date < since) return;
    const href = li.find('a').first().attr('href');
    if (!href) return;
    const name = text.slice(m[0].length).replace(LINK_LABEL_RE, '').replace(/\s+/g, ' ').trim();
    if (!name) return;
    out.push({
      title: name,
      url: resolveUrl(pageUrl, href),
      publishedAt: date.toISOString(),
    });
  });
  return out;
}

// 「小委員会・専門委員会」見出しから次の見出しまでのリンクだけを現役とみなす。
function activeSubcommitteeUrls(html: string): string[] {
  const $ = cheerio.load(html);
  const urls: string[] = [];
  $('h2').each((_, el) => {
    const h2 = $(el);
    if (!h2.text().includes('小委員会・専門委員会')) return;
    h2.nextUntil('h2').find('a[href]').each((_, a) => {
      const url = resolveUrl(INDEX_URL, $(a).attr('href') ?? '');
      if (url.startsWith('https://www.env.go.jp/') && !urls.includes(url)) urls.push(url);
    });
  });
  return urls.slice(0, MAX_SUBCOMMITTEES);
}

export const envCouncilScraper: Scraper = {
  name: 'env-council',
  async run(): Promise<ScrapedArticle[]> {
    const since = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000);
    const indexHtml = await fetchText(INDEX_URL);
    const meetings = parseMeetings(indexHtml, INDEX_URL, since);

    const errors: string[] = [];
    for (const pageUrl of activeSubcommitteeUrls(indexHtml)) {
      try {
        meetings.push(...parseMeetings(await fetchText(pageUrl), pageUrl, since));
      } catch (e) {
        errors.push(`${pageUrl}: ${(e as Error).message}`);
      }
    }
    if (errors.length > 0) console.error('[env-council] partial failure:', errors.join(' / '));

    const seen = new Set<string>();
    return meetings
      .filter((m) => (seen.has(m.url) ? false : (seen.add(m.url), true)))
      .map((m) => ({
        source_type: 'national' as const,
        source_id: 'env-council',
        source_name: SOURCE_NAME,
        source_url: m.url,
        title: m.title,
        published_at: m.publishedAt,
        raw_excerpt: null,
        tags: [...new Set([REGULATION_TAG, ...extractTags(m.title)])],
      }));
  },
};
