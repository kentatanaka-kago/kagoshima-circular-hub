import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { emailSingleArticle } from '@/lib/mail/send-articles';

export const runtime = 'nodejs';
export const maxDuration = 60;

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
  const result = await emailSingleArticle(admin, articleId);
  const status = result.ok ? 200 : 500;
  return NextResponse.json(result, { status });
}
