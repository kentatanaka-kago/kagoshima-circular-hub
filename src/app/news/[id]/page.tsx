import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { NewsArticle } from '@/lib/database.types';

export const revalidate = 300;

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

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

  return (
    <article className="space-y-6 max-w-3xl">
      <nav className="text-sm">
        <Link href="/" className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">← 最新情報へ</Link>
      </nav>

      <header className="space-y-3">
        <div className="flex items-baseline gap-3 text-xs text-zinc-500">
          <span>{article.source_name}</span>
          <time>{formatDate(article.published_at)}</time>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{article.title}</h1>
      </header>

      {article.ai_summary && (
        <section className="rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-5 py-4">
          <div className="text-xs font-medium text-emerald-800 dark:text-emerald-300 mb-1">AI要約（実務ダイジェスト）</div>
          <p className="text-sm leading-relaxed text-emerald-950 dark:text-emerald-100 whitespace-pre-wrap">{article.ai_summary}</p>
          {article.ai_summary_model && (
            <p className="mt-2 text-[10px] text-emerald-700 dark:text-emerald-400">by {article.ai_summary_model}</p>
          )}
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
