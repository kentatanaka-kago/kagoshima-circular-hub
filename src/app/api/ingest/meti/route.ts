import { NextResponse } from 'next/server';
import { parseMetiHtml } from '@/lib/scrapers/meti';
import { upsertAndBackfill } from '@/lib/ingest';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: Request) {
  const auth = req.headers.get('authorization');
  const expected = process.env.INGEST_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'INGEST_SECRET not configured on server' }, { status: 500 });
  }
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const html = await req.text();
  if (!html || html.length < 200) {
    return NextResponse.json({ error: 'empty or suspiciously small HTML body' }, { status: 400 });
  }

  const articles = parseMetiHtml(html);
  const result = await upsertAndBackfill(articles);

  return NextResponse.json({ ok: true, source: 'meti.go.jp', ...result });
}
