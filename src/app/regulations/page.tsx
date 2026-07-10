import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Summary } from '@/components/Summary';
import { CopyMenu } from '@/components/CopyMenu';
import { RegulationCheck } from '@/components/RegulationCheck';
import { formatDateJST, isRecentlyPublished } from '@/lib/format';
import { toExport } from '@/lib/export';
import { sourceChipClass } from '@/lib/source-color';
import { ARTICLE_COLUMNS, type NewsArticle } from '@/lib/database.types';
import { REGULATION_KEYWORDS, REGULATION_TAG } from '@/lib/scrapers/common';

export const revalidate = 300;

export const metadata = {
  title: '法規制 | 鹿児島サーキュラーエコノミー情報ポータル',
  description: 'ESPR・DPP・電池規則など、サーキュラーエコノミー関連の法規制情報を自動収集。製品名からAIが関連規制と準備事項を簡易チェックできます。',
};

const PAGE_SIZE = 30;
// Chip order mirrors the dictionary (EU product → EU trade/reporting → domestic).
const REG_TAGS = [...new Set(REGULATION_KEYWORDS.map(([, tag]) => tag))];

function buildQuery(
  current: { reg?: string },
  patch: { reg?: string | null; page?: number | null },
) {
  const next = { ...current, ...patch };
  const params = new URLSearchParams();
  if (next.reg) params.set('reg', next.reg);
  if (patch.page && patch.page > 1) params.set('page', String(patch.page));
  const qs = params.toString();
  return qs ? `/regulations?${qs}` : '/regulations';
}

export default async function RegulationsPage({
  searchParams,
}: {
  searchParams: Promise<{ reg?: string; page?: string }>;
}) {
  const filters = await searchParams;
  const page = Math.max(1, Number.parseInt(filters.page ?? '1', 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const activeReg = filters.reg && REG_TAGS.includes(filters.reg) ? filters.reg : undefined;

  const wantTags = activeReg ? [REGULATION_TAG, activeReg] : [REGULATION_TAG];
  const { data, error, count } = await supabase
    .from('news_articles')
    .select(ARTICLE_COLUMNS, { count: 'exact' })
    .contains('tags', wantTags)
    .order('published_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + PAGE_SIZE - 1);

  const articles = (data ?? []) as unknown as NewsArticle[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const exportItems = articles.map(toExport);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight">法規制</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          ESPR・DPP・EU電池規則・改正資源有効利用促進法など、サーキュラーエコノミー関連の法規制情報を国内外の公式発表・専門メディアから自動収集しています。
        </p>
      </section>

      <RegulationCheck />

      <section className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-zinc-500 mr-1">規制で絞り込み:</span>
          <FilterPill href={buildQuery(filters, { reg: null })} active={!activeReg}>すべて</FilterPill>
          {REG_TAGS.map((t) => (
            <FilterPill key={t} href={buildQuery(filters, { reg: t })} active={activeReg === t}>{t}</FilterPill>
          ))}
        </div>
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
          該当する記事がまだありません。毎朝の自動収集で法規制関連の発表が見つかると、ここに表示されます。
        </div>
      )}

      <ul className="space-y-4">
        {articles.map((a) => (
          <li key={a.id} className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors">
            <div className="flex items-center justify-between gap-3 text-xs text-zinc-500">
              <span className={`rounded-full px-2 py-0.5 font-medium ${sourceChipClass(a.source_name)}`}>
                {a.source_name}
              </span>
              <span className="tabular-nums">発表 {formatDateJST(a.published_at)}</span>
            </div>
            <h2 className="mt-2 font-medium leading-snug flex items-baseline gap-2">
              {isRecentlyPublished(a.scraped_at) && (
                <span className="shrink-0 rounded bg-rose-500 text-white text-[10px] font-semibold px-1.5 py-0.5 leading-none uppercase tracking-wide">NEW</span>
              )}
              <Link href={`/news/${a.id}`} className="hover:underline">{a.title}</Link>
            </h2>
            {a.ai_summary && (
              <Summary
                markdown={a.ai_summary}
                className="mt-2 text-sm text-zinc-700 dark:text-zinc-300 line-clamp-3"
              />
            )}
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1.5">
                {a.tags?.filter((t) => t !== REGULATION_TAG).map((t) => (
                  <Link
                    key={t}
                    href={REG_TAGS.includes(t) ? buildQuery(filters, { reg: t }) : `/?tag=${encodeURIComponent(t)}`}
                    className="rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 px-2 py-0.5 text-xs text-zinc-600 dark:text-zinc-400"
                  >
                    {t}
                  </Link>
                ))}
              </div>
              <a
                href={a.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:underline"
              >
                元記事を読む ↗
              </a>
            </div>
          </li>
        ))}
      </ul>

      {total > PAGE_SIZE && (
        <nav className="flex items-center justify-between text-sm" aria-label="ページ送り">
          {page > 1 ? (
            <Link
              href={buildQuery(filters, { reg: activeReg ?? null, page: page - 1 })}
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
              href={buildQuery(filters, { reg: activeReg ?? null, page: page + 1 })}
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
