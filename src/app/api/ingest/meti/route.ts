import { NextResponse } from 'next/server';
import { parseMetiHtml } from '@/lib/scrapers/meti';
import { upsertAndBackfill } from '@/lib/ingest';
import type { ScrapedArticle } from '@/lib/scrapers/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

// Accepts one of:
//   (a) JSON body: { "articles": ScrapedArticle[] }   — preferred path
//       (use when the caller has already fetched the press index + bodies,
//        typically from a GitHub Actions runner since Vercel IPs can't
//        reach www.meti.go.jp).
//   (b) raw HTML body (Content-Type: text/html)       — fallback path
//       (we try to fetch bodies/dates ourselves; will fail if METI is
//        still blocking Vercel, but kept for local testing).
export async function POST(req: Request) {
  const auth = req.headers.get('authorization');
  const expected = process.env.INGEST_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'INGEST_SECRET not configured on server' }, { status: 500 });
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const contentType = req.headers.get('content-type') ?? '';
  let articles: ScrapedArticle[];

  if (contentType.includes('application/json')) {
    const payload = (await req.json()) as { articles?: unknown };
    if (!Array.isArray(payload.articles)) {
      return NextResponse.json({ error: 'expected { articles: ScrapedArticle[] }' }, { status: 400 });
    }
    articles = payload.articles as ScrapedArticle[];
  } else {
    const html = await req.text();
    if (!html || html.length < 200) {
      return NextResponse.json({ error: 'empty or suspiciously small HTML body' }, { status: 400 });
    }
    articles = parseMetiHtml(html);
  }

  const result = await upsertAndBackfill(articles);
  return NextResponse.json({ ok: true, source: 'meti.go.jp', received: articles.length, ...result });
}
