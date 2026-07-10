import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import type { NewsArticle } from '@/lib/database.types';

export const runtime = 'nodejs';

// Queues an article for note draft creation. The actual posting happens on
// the local Mac: launchd runs scripts/publish-queued.ts every 5 minutes and
// processes rows where note_publish_requested_at is set and note_draft_url
// is still null.
export async function POST(req: Request) {
  let articleId: string | undefined;
  try {
    const body = (await req.json()) as { articleId?: string };
    articleId = body.articleId;
  } catch {
    return NextResponse.json({ error: 'expected JSON body { articleId }' }, { status: 400 });
  }
  if (!articleId) return NextResponse.json({ error: 'articleId is required' }, { status: 400 });

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('news_articles')
    .select('id, blog_body, note_draft_url, note_publish_requested_at')
    .eq('id', articleId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'article not found' }, { status: 404 });

  const article = data as Pick<NewsArticle, 'id' | 'blog_body' | 'note_draft_url' | 'note_publish_requested_at'>;
  if (!article.blog_body) {
    return NextResponse.json({ error: 'ブログ未生成の記事です。先に「生成」を実行してください' }, { status: 409 });
  }
  if (article.note_draft_url) {
    return NextResponse.json({ error: '既にnote下書きが作成済みです' }, { status: 409 });
  }

  const requestedAt = new Date().toISOString();
  const { error: updErr } = await admin
    .from('news_articles')
    .update({ note_publish_requested_at: requestedAt } as never)
    .eq('id', articleId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, articleId, requestedAt });
}

// Cancels a pending request (only meaningful while the draft is not yet made).
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const admin = supabaseAdmin();
  const { error } = await admin
    .from('news_articles')
    .update({ note_publish_requested_at: null } as never)
    .eq('id', id)
    .is('note_draft_url', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, articleId: id });
}
