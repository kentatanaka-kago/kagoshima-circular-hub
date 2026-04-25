import { revalidatePath } from 'next/cache';
import type { ScrapedArticle } from './scrapers/types';
import { fetchArticlePage } from './scrapers/body';
import { summarizeArticle } from './ai/summarize';
import { supabaseAdmin } from './supabase';
import { emailUnsentArticles, type MailResult } from './mail/send-articles';

type Admin = ReturnType<typeof supabaseAdmin>;

export interface IngestResult {
  candidates: number;
  inserted: number;
  bodies: { pending: number; ok: number; failed: number };
  summarized: { pending: number; ok: number; failed: number; sampleErrors?: string[] };
  mailed: MailResult;
}

const BODY_BATCH = 40;
const BODY_CONCURRENCY = 4;
const SUMMARIZE_BATCH = 40;
const SUMMARIZE_CONCURRENCY = 3;

export async function upsertAndBackfill(articles: ScrapedArticle[]): Promise<IngestResult> {
  const admin = supabaseAdmin();

  let inserted = 0;
  if (articles.length > 0) {
    const { data, error } = await admin
      .from('news_articles')
      .upsert(articles as never[], { onConflict: 'source_url', ignoreDuplicates: true })
      .select('id');
    if (error) throw new Error(`upsert failed: ${error.message}`);
    inserted = data?.length ?? 0;
  }

  const bodies = await backfillBodies(admin);
  const summarized = await backfillSummaries(admin);

  let mailed: MailResult = { pending: 0, sent: 0, failed: 0, recipients: 0 };
  try {
    mailed = await emailUnsentArticles(admin);
  } catch (e) {
    console.error('[ingest] emailUnsentArticles failed:', (e as Error).message);
  }

  if (inserted > 0 || bodies.ok > 0 || summarized.ok > 0) {
    revalidatePath('/');
    revalidatePath('/calendar');
  }

  return { candidates: articles.length, inserted, bodies, summarized, mailed };
}

export async function backfillBodies(admin: Admin) {
  const { data: pending, error } = await admin
    .from('news_articles')
    .select('id, source_url, raw_excerpt, published_at')
    .or('raw_excerpt.is.null,published_at.is.null')
    .order('scraped_at', { ascending: false })
    .limit(BODY_BATCH);

  if (error) return { pending: 0, ok: 0, failed: 0 };
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

export async function backfillSummaries(admin: Admin) {
  const { data: pending, error } = await admin
    .from('news_articles')
    .select('id, title, source_name, raw_excerpt')
    .is('ai_summary', null)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(SUMMARIZE_BATCH);

  if (error) return { pending: 0, ok: 0, failed: 0 };
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
          const { error: updErr } = await admin
            .from('news_articles')
            .update({ ai_summary: summary, ai_summary_model: model } as never)
            .eq('id', row.id);
          if (updErr) throw updErr;
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
