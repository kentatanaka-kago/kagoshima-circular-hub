import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Summary } from '@/components/Summary';
import { CopyMenu } from '@/components/CopyMenu';
import { formatDateJST, isRecentlyPublished } from '@/lib/format';
import { toExport } from '@/lib/export';
import { sourceChipClass } from '@/lib/source-color';
import type { NewsArticle } from '@/lib/database.types';

export const revalidate = 300;

const ALL_TAGS = ['補助金', '資源循環', '脱炭素', 'プラスチック', '食品ロス', 'バイオマス', 'サーキュラー'];

function firstParagraph(md: string): string {
  const lines = md.split('\n');
  const chunks: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      if (chunks.length > 0) break;
      continue;
    }
    if (t.startsWith('|') || t.startsWith('#')) break;
    chunks.push(line);
  }
  return chunks.join('\n').trim() || md.slice(0, 200);
}

function buildQuery(current: { tag?: string; source?: string }, patch: { tag?: string | null; source?: string | null }) {
  const next = { ...current, ...patch };
  const params = new URLSearchParams();
  if (next.tag) params.set('tag', next.tag);
  if (next.source) params.set('source', next.source);
  const qs = params.toString();
  return qs ? `/?${qs}` : '/';
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string; source?: string }>;
}) {
  const filters = await searchParams;

  let query = supabase
    .from('news_articles')
    .select('*')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(30);

  if (filters.tag) query = query.contains('tags', [filters.tag]);
  if (filters.source) query = query.eq('source_name', filters.source);

  const { data, error } = await query;
  const articles = (data ?? []) as NewsArticle[];

  // Distinct sources across DB (unfiltered) for the source picker
  const { data: srcRows } = await supabase.from('news_articles').select('source_name');
  const sourceCounts: Record<string, number> = {};
  (srcRows ?? []).forEach((r) => {
    const n = (r as { source_name: string }).source_name;
    sourceCounts[n] = (sourceCounts[n] ?? 0) + 1;
  });
  const sourceNames = Object.keys(sourceCounts).sort((a, b) => sourceCounts[b] - sourceCounts[a]);

  const activeFilter = filters.tag || filters.source;
  const exportItems = articles.map(toExport);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight">最新情報</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          鹿児島県内の自治体・国の公式発表から、サーキュラーエコノミー関連情報を自動収集しています。
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-zinc-500 mr-1">カテゴリ:</span>
          <FilterPill href={buildQuery(filters, { tag: null })} active={!filters.tag}>すべて</FilterPill>
          {ALL_TAGS.map((t) => (
            <FilterPill key={t} href={buildQuery(filters, { tag: t })} active={filters.tag === t}>{t}</FilterPill>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-zinc-500 mr-1">出典:</span>
          <FilterPill href={buildQuery(filters, { source: null })} active={!filters.source}>すべて</FilterPill>
          {sourceNames.map((s) => (
            <SourcePill
              key={s}
              href={buildQuery(filters, { source: s })}
              active={filters.source === s}
              name={s}
              count={sourceCounts[s]}
            />
          ))}
        </div>
        {activeFilter && (
          <div className="text-xs text-zinc-500">
            <Link href="/" className="underline hover:text-zinc-800 dark:hover:text-zinc-200">フィルタをクリア</Link>
          </div>
        )}
        {exportItems.length > 0 && (
          <div className="pt-2">
            <CopyMenu items={exportItems} size="sm" />
          </div>
        )}
      </section>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-900 dark:text-red-200">
          データベースへの接続でエラーが発生しました: {error.message}
        </div>
      )}

      {!error && articles.length === 0 && (
        <div className="rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 px-6 py-12 text-center text-sm text-zinc-500">
          該当する記事がありません。
        </div>
      )}

      <ul className="space-y-4">
        {articles.map((a) => (
          <li key={a.id} className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors">
            <div className="flex items-center justify-between gap-3 text-xs text-zinc-500">
              <Link
                href={buildQuery(filters, { source: a.source_name })}
                className={`rounded-full px-2 py-0.5 font-medium hover:opacity-80 transition-opacity ${sourceChipClass(a.source_name)}`}
              >
                {a.source_name}
              </Link>
              <div className="flex items-center gap-3 tabular-nums">
                <span>発表 {formatDateJST(a.published_at)}</span>
                <span className="text-zinc-400">·</span>
                <span>更新 {formatDateJST(a.scraped_at)}</span>
              </div>
            </div>
            <h2 className="mt-2 font-medium leading-snug flex items-baseline gap-2">
              {isRecentlyPublished(a.scraped_at) && (
                <span className="shrink-0 rounded bg-rose-500 text-white text-[10px] font-semibold px-1.5 py-0.5 leading-none uppercase tracking-wide">NEW</span>
              )}
              <Link href={`/news/${a.id}`} className="hover:underline">{a.title}</Link>
            </h2>
            {a.ai_summary && (
              <Summary
                markdown={firstParagraph(a.ai_summary)}
                className="mt-2 text-sm text-zinc-700 dark:text-zinc-300 line-clamp-3"
              />
            )}
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1.5">
                {a.tags?.map((t) => (
                  <Link
                    key={t}
                    href={buildQuery(filters, { tag: t })}
                    className="rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 px-2 py-0.5 text-xs text-zinc-600 dark:text-zinc-400"
                  >
                    {t}
                  </Link>
                ))}
              </div>
              {a.note_post_url && (
                <a
                  href={a.note_post_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-3 py-1 transition-colors"
                  title="note でこの記事の解説ブログを読む"
                >
                  note で読む ↗
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FilterPill({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={
        active
          ? 'rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-1 text-xs font-medium'
          : 'rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 px-3 py-1 text-xs'
      }
    >
      {children}
    </Link>
  );
}

function SourcePill({ href, active, name, count }: { href: string; active: boolean; name: string; count: number }) {
  const base = 'rounded-full px-3 py-1 text-xs font-medium transition-opacity';
  const activeRing = active ? 'ring-2 ring-offset-1 ring-zinc-900 dark:ring-zinc-100 dark:ring-offset-zinc-950' : 'hover:opacity-80';
  return (
    <Link href={href} className={`${base} ${sourceChipClass(name)} ${activeRing}`}>
      {name} <span className="opacity-60">({count})</span>
    </Link>
  );
}
