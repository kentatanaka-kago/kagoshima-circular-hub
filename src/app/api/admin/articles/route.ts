import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET() {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('news_articles')
    .select('id, title, source_name, source_url, published_at, scraped_at, tags, blog_title, blog_body, note_draft_url, ai_summary, raw_excerpt')
    .order('scraped_at', { ascending: false })
    .limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ articles: data ?? [] });
}
