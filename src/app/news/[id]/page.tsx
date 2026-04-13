import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Summary } from '@/components/Summary';
import { CopyMenu } from '@/components/CopyMenu';
import { formatDateJST, isRecentlyPublished } from '@/lib/format';
import { toExport } from '@/lib/export';
import { sourceChipClass } from '@/lib/source-color';
import type { NewsArticle } from '@/lib/database.types';

export const revalidate = 300;

export default async function NewsDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data, error } = await supabase
    .from('news_articles')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) notFound();
  const article = data as NewsArticle;
  const isNew = isRecentlyPublished(article.published_at);

  return (
    <article className="space-y-6 max-w-3xl">
      <nav className="text-sm">
        <Link href="/" className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">← 最新情報へ</Link>
      </nav>

      <header className="space-y-3">
        <div className="flex items-baseline gap-3 text-xs text-zinc-500">
          <span className={`rounded-full px-2 py-0.5 font-medium ${sourceChipClass(article.source_name)}`}>
            {article.source_name}
          </span>
          <time>{formatDateJST(article.published_at, 'long')}</time>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-baseline gap-3 flex-wrap">
          {isNew && (
            <span className="shrink-0 rounded bg-rose-500 text-white text-xs font-semibold px-2 py-0.5 leading-none uppercase tracking-wide">NEW</span>
          )}
          <span>{article.title}</span>
        </h1>
        <div className="pt-1">
          <CopyMenu items={toExport(article)} size="sm" />
        </div>
      </header>

      {article.ai_summary && (
        <section className="rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-5 py-4">
          <div className="text-xs font-medium text-emerald-800 dark:text-emerald-300 mb-2">AI要約（実務ダイジェスト）</div>
          <Summary
            markdown={article.ai_summary}
            className="text-sm leading-relaxed text-emerald-950 dark:text-emerald-100"
          />
          {article.ai_summary_model && (
            <p className="mt-3 text-[10px] text-emerald-700 dark:text-emerald-400">by {article.ai_summary_model}</p>
          )}
        </section>
      )}

      {article.note_post_url && (
        <section className="rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-5 space-y-2">
          <div className="text-xs font-medium text-emerald-800 dark:text-emerald-300">解説ブログを note に公開中</div>
          <h2 className="font-medium text-emerald-950 dark:text-emerald-100">
            {article.blog_title ?? '解説記事'}
          </h2>
          <a
            href={article.note_post_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-3 py-1.5 transition-colors"
          >
            note で記事を読む ↗
          </a>
        </section>
      )}

      <section className="pt-4 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
        <p className="text-xs text-zinc-500">
          AI要約は補助的な表示です。正確な条件・金額・締切は必ず出典元でご確認ください。
        </p>
        <a
          href={article.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 dark:text-blue-400 hover:underline"
        >
          出典元を見る（{article.source_name}） ↗
        </a>
      </section>

      {article.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {article.tags.map((t) => (
            <span key={t} className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs text-zinc-600 dark:text-zinc-400">
              {t}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}
