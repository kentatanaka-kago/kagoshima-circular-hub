import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { kagoshimaCityScraper } from '@/lib/scrapers/kagoshima-city';
import { kagoshimaPrefScraper } from '@/lib/scrapers/kagoshima-pref';
import { envGoJpScraper } from '@/lib/scrapers/env-go-jp';
import type { ScrapedArticle, ScraperResult } from '@/lib/scrapers/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

const SCRAPERS = [kagoshimaCityScraper, kagoshimaPrefScraper, envGoJpScraper];

export async function GET(req: Request) {
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`
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

  let inserted = 0;
  if (all.length > 0) {
    const admin = supabaseAdmin();
    // upsert on unique source_url — duplicates do not re-insert
    const { data, error } = await admin
      .from('news_articles')
      .upsert(all as never[], { onConflict: 'source_url', ignoreDuplicates: true })
      .select('id');
    if (error) {
      return NextResponse.json(
        { ok: false, results, insertError: error.message },
        { status: 500 },
      );
    }
    inserted = data?.length ?? 0;
  }

  return NextResponse.json({ ok: true, results, candidates: all.length, inserted });
}
