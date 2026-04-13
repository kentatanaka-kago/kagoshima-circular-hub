import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { kagoshimaCityScraper } from '@/lib/scrapers/kagoshima-city';
import { kagoshimaPrefScraper } from '@/lib/scrapers/kagoshima-pref';
import { envGoJpScraper } from '@/lib/scrapers/env-go-jp';
import type { ScrapedArticle, ScraperResult } from '@/lib/scrapers/types';
import { summarizeArticle } from '@/lib/ai/summarize';

export const runtime = 'nodejs';
export const maxDuration = 300;

const SCRAPERS = [kagoshimaCityScraper, kagoshimaPrefScraper, envGoJpScraper];
const SUMMARIZE_BATCH = 40;       // per-run ceiling
const SUMMARIZE_CONCURRENCY = 3;  // simultaneous Gemini calls

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  const expected = process.env.CRON_SECRET;
  if (expected && auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const results: ScraperResult[] = [];
  const all: ScrapedArticle[] = [];

  for (const scraper of SCRAPERS) {
    try {
      const items = await scraper.run();
      all.push(...items);
      results.push({ source: scraper.name, fetched: items.length });
    } catch (e) {
      results.push({
        source: scraper.name,
        fetched: 0,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const admin = supabaseAdmin();

  let inserted = 0;
  if (all.length > 0) {
    const { data, error } = await admin
      .from('news_articles')
      .upsert(all as never[], { onConflict: 'source_url', ignoreDuplicates: true })
      .select('id');
    if (error) {
      return NextResponse.json({ ok: false, results, insertError: error.message }, { status: 500 });
    }
    inserted = data?.length ?? 0;
  }

  const summarized = await backfillSummaries(admin);

  if (inserted > 0 || summarized.ok > 0) {
    revalidatePath('/');
    revalidatePath('/calendar');
  }

  return NextResponse.json({
    ok: true,
    results,
    candidates: all.length,
    inserted,
    summarized,
  });
}

async function backfillSummaries(admin: ReturnType<typeof supabaseAdmin>) {
  const { data: pending, error } = await admin
    .from('news_articles')
    .select('id, title, source_name, raw_excerpt')
    .is('ai_summary', null)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(SUMMARIZE_BATCH);

  if (error) return { pending: 0, ok: 0, failed: 0, error: error.message };
  if (!pending || pending.length === 0) return { pending: 0, ok: 0, failed: 0 };

  type Row = { id: string; title: string; source_name: string; raw_excerpt: string | null };
  const rows = pending as Row[];

  let ok = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i += SUMMARIZE_CONCURRENCY) {
    const batch = rows.slice(i, i + SUMMARIZE_CONCURRENCY);
    await Promise.all(
      batch.map(async (row) => {
        try {
          const { summary, model } = await summarizeArticle({
            title: row.title,
            source_name: row.source_name,
            excerpt: row.raw_excerpt,
          });
          const { error: updateError } = await admin
            .from('news_articles')
            .update({ ai_summary: summary, ai_summary_model: model } as never)
            .eq('id', row.id);
          if (updateError) throw updateError;
          ok += 1;
        } catch (e) {
          failed += 1;
          if (errors.length < 3) {
            errors.push(e instanceof Error ? e.message : String(e));
          }
        }
      }),
    );
  }

  return { pending: rows.length, ok, failed, ...(errors.length ? { sampleErrors: errors } : {}) };
}
