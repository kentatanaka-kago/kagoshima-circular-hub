import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { generateBlogPost } from '@/lib/blog/generate';
import type { NewsArticle } from '@/lib/database.types';

export const runtime = 'nodejs';
export const maxDuration = 120;

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
    .select('*')
    .eq('id', articleId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'article not found' }, { status: 404 });

  const article = data as NewsArticle;
  if (!article.raw_excerpt || !article.ai_summary) {
    return NextResponse.json(
      { error: 'article missing raw_excerpt or ai_summary — wait for backfill' },
      { status: 409 },
    );
  }

  let post;
  try {
    post = await generateBlogPost(article);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const hashtagsLine = post.hashtags.join(' ');
  const { error: updErr } = await admin
    .from('news_articles')
    .update({
      blog_title: post.title,
      blog_body: `${post.body}\n\n${hashtagsLine}`,
    } as never)
    .eq('id', article.id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    articleId: article.id,
    title: post.title,
    hashtags: post.hashtags,
    bodyLength: post.body.length,
    model: post.model,
  });
}
