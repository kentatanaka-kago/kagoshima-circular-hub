import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Summary } from '@/components/Summary';
import { formatDateJST } from '@/lib/format';
import { sourceChipClass } from '@/lib/source-color';
import { embedTexts } from '@/lib/ai/embeddings';
import type { MatchedArticle } from '@/lib/database.types';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '検索 | 鹿児島サーキュラーエコノミー情報ポータル',
  description: '収集した全記事から意味ベース（ベクトル検索）で関連情報を探せます。',
};

const SOURCE_TYPE_LABEL: Record<string, string> = {
  municipality: '自治体',
  national: '国',
  news_site: 'ニュース',
  domestic_case: '国内事例',
};

const MATCH_COUNT = 20;
// Cosine similarity below this is noise for text-embedding-3-small.
const MIN_SIMILARITY = 0.25;

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? '').trim().slice(0, 200);

  let results: MatchedArticle[] = [];
  let errorMsg: string | null = null;

  if (query) {
    try {
      const [vector] = await embedTexts([query]);
      const { data, error } = await supabase.rpc('match_news_articles', {
        query_embedding: JSON.stringify(vector),
        match_count: MATCH_COUNT,
      });
      if (error) throw new Error(error.message);
      results = ((data ?? []) as MatchedArticle[]).filter((r) => r.similarity >= MIN_SIMILARITY);
    } catch (e) {
      errorMsg = (e as Error).message;
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight">記事検索</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          キーワードが一致しなくても、意味の近い記事を横断検索します（AIベクトル検索）。
          例:「生ごみを堆肥にする取り組み」「プラごみの分別ルール」
        </p>
      </section>

      <form action="/search" className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="調べたい内容を文章で入力…"
          className="flex-1 px-4 py-2.5 text-sm border border-zinc-300 rounded-md dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          className="px-5 py-2.5 rounded-md bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          検索
        </button>
      </form>

      {errorMsg && (
        <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-900 dark:text-red-200">
          検索でエラーが発生しました: {errorMsg}
        </div>
      )}

      {query && !errorMsg && results.length === 0 && (
        <div className="rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 px-6 py-12 text-center text-sm text-zinc-500">
          「{query}」に近い記事が見つかりませんでした。
        </div>
      )}

      {results.length > 0 && (
        <section>
          <p className="text-xs text-zinc-500 mb-3">「{query}」に近い記事 {results.length} 件（関連度順）</p>
          <ul className="space-y-4">
            {results.map((a) => (
              <li key={a.id} className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors">
                <div className="flex items-center justify-between gap-3 text-xs text-zinc-500">
                  <span className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 font-medium ${sourceChipClass(a.source_name)}`}>
                      {a.source_name}
                    </span>
                    <span className="text-zinc-400">{SOURCE_TYPE_LABEL[a.source_type] ?? a.source_type}</span>
                  </span>
                  <span className="flex items-center gap-3 tabular-nums">
                    <span>発表 {formatDateJST(a.published_at)}</span>
                    <span className="text-emerald-600 dark:text-emerald-500" title="クエリとの意味的な近さ">
                      関連度 {(a.similarity * 100).toFixed(0)}%
                    </span>
                  </span>
                </div>
                <h2 className="mt-2 font-medium leading-snug">
                  {a.source_type === 'domestic_case' ? (
                    <a href={a.source_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {a.title} <span className="text-zinc-400">↗</span>
                    </a>
                  ) : (
                    <Link href={`/news/${a.id}`} className="hover:underline">{a.title}</Link>
                  )}
                </h2>
                {a.ai_summary && (
                  <Summary
                    markdown={a.ai_summary}
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
        </section>
      )}
    </div>
  );
}
