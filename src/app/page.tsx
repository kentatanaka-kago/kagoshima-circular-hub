import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Summary } from '@/components/Summary';
import type { NewsArticle } from '@/lib/database.types';

export const revalidate = 300;

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

// Card previews: show only the opening paragraph so markdown tables
// don't get clipped weirdly inside line-clamp.
function firstParagraph(md: string): string {
  const lines = md.split('\n');
  const chunks: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      if (chunks.length > 0) break;
      continue;
    }
    // Stop before tables / headings
    if (t.startsWith('|') || t.startsWith('#')) break;
    chunks.push(line);
  }
  return chunks.join('\n').trim() || md.slice(0, 200);
}

export default async function Home() {
  const { data, error } = await supabase
    .from('news_articles')
    .select('*')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(30);

  const articles = (data ?? []) as NewsArticle[];

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight">最新情報</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          鹿児島県内の自治体・国の公式発表から、サーキュラーエコノミー関連情報を自動収集しています。
        </p>
      </section>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-900 dark:text-red-200">
          データベースへの接続でエラーが発生しました: {error.message}
        </div>
      )}

      {!error && articles.length === 0 && (
        <div className="rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 px-6 py-12 text-center text-sm text-zinc-500">
          まだ記事がありません。毎朝のクローリングで蓄積されます。
        </div>
      )}

      <ul className="space-y-4">
        {articles.map((a) => (
          <li key={a.id} className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors">
            <div className="flex items-baseline justify-between gap-3 text-xs text-zinc-500">
              <span>{a.source_name}</span>
              <time>{formatDate(a.published_at)}</time>
            </div>
            <h2 className="mt-2 font-medium leading-snug">
              <Link href={`/news/${a.id}`} className="hover:underline">{a.title}</Link>
            </h2>
            {a.ai_summary && (
              <Summary
                markdown={firstParagraph(a.ai_summary)}
                className="mt-2 text-sm text-zinc-700 dark:text-zinc-300 line-clamp-3"
              />
            )}
            {a.tags?.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {a.tags.map((t) => (
                  <span key={t} className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
