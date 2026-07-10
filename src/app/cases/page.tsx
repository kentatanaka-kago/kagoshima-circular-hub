import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Summary } from '@/components/Summary';
import { CopyMenu } from '@/components/CopyMenu';
import { formatDateJST, isRecentlyPublished } from '@/lib/format';
import { toExport } from '@/lib/export';
import { sourceChipClass } from '@/lib/source-color';
import { ARTICLE_COLUMNS, type NewsArticle } from '@/lib/database.types';

export const revalidate = 300;

export const metadata = {
  title: '国内事例 | 鹿児島サーキュラーエコノミー情報ポータル',
  description: '全国のサーキュラーエコノミー実践事例をCE専門メディアから自動収集しています。',
};

const ALL_TAGS = ['資源循環', '脱炭素', 'プラスチック', '食品ロス', 'バイオマス', 'サーキュラー'];
const PAGE_SIZE = 30;

function buildQuery(
  current: { tag?: string; source?: string },
  patch: { tag?: string | null; source?: string | null; page?: number | null },
) {
  const next = { ...current, ...patch };
  const params = new URLSearchParams();
  if (next.tag) params.set('tag', next.tag);
  if (next.source) params.set('source', next.source);
  if (patch.page && patch.page > 1) params.set('page', String(patch.page));
  const qs = params.toString();
  return qs ? `/cases?${qs}` : '/cases';
}

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string; source?: string; page?: string }>;
}) {
  const filters = await searchParams;
  const page = Math.max(1, Number.parseInt(filters.page ?? '1', 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  let query = supabase
    .from('news_articles')
    .select(ARTICLE_COLUMNS, { count: 'exact' })
    .eq('source_type', 'domestic_case')
    .order('published_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (filters.tag) query = query.contains('tags', [filters.tag]);
  if (filters.source) query = query.eq('source_name', filters.source);

  const { data, error, count } = await query;
  const articles = (data ?? []) as unknown as NewsArticle[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const { data: srcRows } = await supabase
    .from('news_articles')
    .select('source_name')
    .eq('source_type', 'domestic_case');
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
        <h1 className="text-3xl font-semibold tracking-tight">国内事例</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          全国のサーキュラーエコノミー実践事例を、CE専門メディアの公式RSSから自動収集しています。各記事の著作権は出典元に帰属します。
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
          <span className="text-xs font-medium text-zinc-500 mr-1">メディア:</span>
          <FilterPill href={buildQuery(filters, { source: null })} active={!filters.source}>すべて</FilterPill>
          {sourceNames.map((s) => (
            <FilterPill key={s} href={buildQuery(filters, { source: s })} active={filters.source === s}>
              {s} <span className="opacity-60">({sourceCounts[s]})</span>
            </FilterPill>
          ))}
        </div>
        {activeFilter && (
          <div className="text-xs text-zinc-500">
            <Link href="/cases" className="underline hover:text-zinc-800 dark:hover:text-zinc-200">フィルタをクリア</Link>
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
          該当する記事がありません。次回の自動収集（毎朝6:40）以降に表示されます。
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
              <span className="tabular-nums">発表 {formatDateJST(a.published_at)}</span>
            </div>
            <h2 className="mt-2 font-medium leading-snug flex items-baseline gap-2">
              {isRecentlyPublished(a.scraped_at) && (
                <span className="shrink-0 rounded bg-rose-500 text-white text-[10px] font-semibold px-1.5 py-0.5 leading-none uppercase tracking-wide">NEW</span>
              )}
              <a href={a.source_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                {a.title} <span className="text-zinc-400">↗</span>
              </a>
            </h2>
            {a.ai_summary && (
              <Summary
                markdown={a.ai_summary}
                className="mt-2 text-sm text-zinc-700 dark:text-zinc-300 line-clamp-3"
              />
            )}
            <div className="mt-3 flex flex-wrap gap-1.5">
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
          </li>
        ))}
      </ul>

      {total > PAGE_SIZE && (
        <nav className="flex items-center justify-between text-sm" aria-label="ページ送り">
          {page > 1 ? (
            <Link
              href={buildQuery(filters, { page: page - 1 })}
              className="px-4 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              ← 前のページ
            </Link>
          ) : (
            <span className="px-4 py-2 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-300 dark:text-zinc-700">← 前のページ</span>
          )}
          <span className="text-zinc-500 tabular-nums">
            {page} / {totalPages} ページ（全 {total} 件）
          </span>
          {page < totalPages ? (
            <Link
              href={buildQuery(filters, { page: page + 1 })}
              className="px-4 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              次のページ →
            </Link>
          ) : (
            <span className="px-4 py-2 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-300 dark:text-zinc-700">次のページ →</span>
          )}
        </nav>
      )}
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
