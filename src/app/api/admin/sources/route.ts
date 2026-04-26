import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET() {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('news_articles')
    .select('source_name')
    .order('source_name', { ascending: true })
    .limit(5000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  type Row = { source_name: string };
  const names = new Set(((data as Row[] | null) ?? []).map((r) => r.source_name).filter(Boolean));
  return NextResponse.json({ sources: Array.from(names).sort((a, b) => a.localeCompare(b, 'ja')) });
}
