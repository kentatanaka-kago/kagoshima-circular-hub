import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const sources = url.searchParams.getAll('source').filter(Boolean);
  const status = url.searchParams.get('status') ?? '';
  const offset = Math.max(0, Number.parseInt(url.searchParams.get('offset') ?? '0', 10) || 0);
  const limitRaw = Number.parseInt(url.searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT;
  const limit = Math.min(MAX_LIMIT, Math.max(1, limitRaw));

  const admin = supabaseAdmin();
  let query = admin
    .from('news_articles')
    .select(
      'id, title, source_name, source_url, published_at, scraped_at, tags, blog_title, blog_body, note_draft_url, note_post_url, note_posted_at, ai_summary, raw_excerpt, emailed_at',
      { count: 'exact' },
    )
    .order('scraped_at', { ascending: false });

  if (sources.length > 0) {
    query = query.in('source_name', sources);
  }
  if (status === 'note_published') {
    query = query.not('note_post_url', 'is', null);
  } else if (status === 'note_unpublished') {
    query = query.is('note_post_url', null);
  } else if (status === 'ungenerated') {
    query = query.is('blog_body', null);
  } else if (status === 'generated') {
    query = query.not('blog_body', 'is', null);
  }
  if (q) {
    // Strip characters that would break Supabase's PostgREST `or=` parser.
    const safe = q.replace(/[,()%]/g, ' ').trim();
    if (safe) {
      query = query.or(
        `title.ilike.%${safe}%,source_name.ilike.%${safe}%,ai_summary.ilike.%${safe}%,raw_excerpt.ilike.%${safe}%`,
      );
    }
  }

  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    articles: data ?? [],
    total: count ?? 0,
    limit,
    offset,
  });
}
