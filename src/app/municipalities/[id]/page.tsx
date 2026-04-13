import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { Municipality, NewsArticle } from '@/lib/database.types';

export const revalidate = 600;

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

export default async function MunicipalityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [{ data: m }, { data: news }] = await Promise.all([
    supabase.from('municipalities').select('*').eq('id', id).single(),
    supabase.from('news_articles').select('*').eq('source_id', id).order('published_at', { ascending: false, nullsFirst: false }).limit(50),
  ]);

  if (!m) notFound();
  const municipality = m as Municipality;
  const articles = (news ?? []) as NewsArticle[];

  return (
    <div className="space-y-8">
      <nav className="text-sm">
        <Link href="/" className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">← 最新情報へ</Link>
      </nav>

      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{municipality.name}</h1>
        {municipality.website_url && (
          <a href={municipality.website_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-700 dark:text-blue-400 hover:underline">
            公式サイト ↗
          </a>
        )}
      </header>

      <section>
        <h2 className="text-lg font-semibold mb-4">{municipality.name}の最新情報</h2>
        {articles.length === 0 ? (
          <p className="text-sm text-zinc-500">まだ記事がありません。</p>
        ) : (
          <ul className="space-y-3">
            {articles.map((a) => (
              <li key={a.id} className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
                <time className="text-xs text-zinc-500">{formatDate(a.published_at)}</time>
                <h3 className="mt-1 font-medium">
                  <Link href={`/news/${a.id}`} className="hover:underline">{a.title}</Link>
                </h3>
                {a.ai_summary && <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300 line-clamp-2">{a.ai_summary}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
