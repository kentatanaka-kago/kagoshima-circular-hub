import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { kagoshimaCityScraper } from '@/lib/scrapers/kagoshima-city';
import { kagoshimaPrefScraper } from '@/lib/scrapers/kagoshima-pref';
import { kirishimaScraper } from '@/lib/scrapers/kirishima';
import { kanoyaScraper } from '@/lib/scrapers/kanoya';
import { makurazakiScraper } from '@/lib/scrapers/makurazaki';
import { airaScraper } from '@/lib/scrapers/aira';
import { envGoJpScraper } from '@/lib/scrapers/env-go-jp';
// METI (経産省) is temporarily disabled — www.meti.go.jp refuses
// connections from Vercel's function network (ETIMEDOUT both from iad1
// and hnd1). Revisit when we have a workable proxy or a manual seed.
// import { metiScraper } from '@/lib/scrapers/meti';
import { maffScraper } from '@/lib/scrapers/maff';
import { soumuScraper } from '@/lib/scrapers/soumu';
import { fetchArticlePage } from '@/lib/scrapers/body';
import type { ScrapedArticle, ScraperResult } from '@/lib/scrapers/types';
import { summarizeArticle } from '@/lib/ai/summarize';

export const runtime = 'nodejs';
export const maxDuration = 300;

const SCRAPERS = [
  kagoshimaCityScraper,
  kagoshimaPrefScraper,
  kirishimaScraper,
  kanoyaScraper,
  makurazakiScraper,
  airaScraper,
  envGoJpScraper,
  // metiScraper,  // temporarily disabled — see import note
  maffScraper,
  soumuScraper,
];
const BODY_BATCH = 40;
const BODY_CONCURRENCY = 4;
const SUMMARIZE_BATCH = 40;
const SUMMARIZE_CONCURRENCY = 3;

type Admin = ReturnType<typeof supabaseAdmin>;

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
      const msg = e instanceof Error ? e.message : String(e);
      const cause = e instanceof Error && 'cause' in e && e.cause ? String((e.cause as { code?: string; message?: string }).code ?? (e.cause as Error).message ?? e.cause) : undefined;
      results.push({
        source: scraper.name,
        fetched: 0,
        error: cause ? `${msg} (${cause})` : msg,
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

  const bodies = await backfillBodies(admin);
  const summarized = await backfillSummaries(admin);

  if (inserted > 0 || bodies.ok > 0 || summarized.ok > 0) {
    revalidatePath('/');
    revalidatePath('/calendar');
  }

  return NextResponse.json({
    ok: true,
    results,
    candidates: all.length,
    inserted,
    bodies,
    summarized,
  });
}

async function backfillBodies(admin: Admin) {
  // Fetch when raw_excerpt is missing OR published_at is missing —
  // one network round-trip gets us both.
  const { data: pending, error } = await admin
    .from('news_articles')
    .select('id, source_url, raw_excerpt, published_at')
    .or('raw_excerpt.is.null,published_at.is.null')
    .order('scraped_at', { ascending: false })
    .limit(BODY_BATCH);

  if (error) return { pending: 0, ok: 0, failed: 0, error: error.message };
  if (!pending || pending.length === 0) return { pending: 0, ok: 0, failed: 0 };

  type Row = { id: string; source_url: string; raw_excerpt: string | null; published_at: string | null };
  const rows = pending as Row[];
  let ok = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i += BODY_CONCURRENCY) {
    const batch = rows.slice(i, i + BODY_CONCURRENCY);
    await Promise.all(
      batch.map(async (row) => {
        const { body, publishedAt } = await fetchArticlePage(row.source_url);
        const update: Record<string, string> = {};
        if (body && !row.raw_excerpt) update.raw_excerpt = body;
        if (publishedAt && !row.published_at) update.published_at = publishedAt;
        if (Object.keys(update).length === 0) {
          failed += 1;
          return;
        }
        const { error: updErr } = await admin
          .from('news_articles')
          .update(update as never)
          .eq('id', row.id);
        if (updErr) failed += 1;
        else ok += 1;
      }),
    );
  }
  return { pending: rows.length, ok, failed };
}

async function backfillSummaries(admin: Admin) {
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
