import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Summary } from '@/components/Summary';
import { formatDateJST } from '@/lib/format';
import type { RegulationCheck } from '@/lib/database.types';

// 保存済み結果は不変なので長めにキャッシュしてよい。
export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data } = await supabase
    .from('regulation_checks')
    .select('product')
    .eq('id', id)
    .single();
  const product = (data as { product: string } | null)?.product;
  return {
    title: product
      ? `${product} のAI規制チェック結果 | 鹿児島サーキュラーエコノミー情報ポータル`
      : 'AI規制チェック結果 | 鹿児島サーキュラーエコノミー情報ポータル',
    description: 'サーキュラーエコノミー関連の法規制と準備事項をAIが簡易整理した結果の共有ページです。',
  };
}

export default async function RegulationCheckResult({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data, error } = await supabase
    .from('regulation_checks')
    .select('id, product, company_name, corporate_number, answer, sources, model, created_at')
    .eq('id', id)
    .single();

  if (error || !data) notFound();
  const check = data as unknown as RegulationCheck;

  return (
    <article className="space-y-6 max-w-3xl">
      <nav className="text-sm">
        <Link href="/regulations" className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">← 法規制ページへ</Link>
      </nav>

      <header className="space-y-2">
        <p className="text-xs text-zinc-500">
          AI規制チェック結果 <time className="ml-2">{formatDateJST(check.created_at, 'long')} 実行</time>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          「{check.product}」の関連規制と準備事項
        </h1>
        {check.company_name && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">対象企業: {check.company_name}</p>
        )}
      </header>

      <section className="rounded-lg border border-indigo-200 dark:border-indigo-900 bg-white dark:bg-zinc-900 p-5 space-y-3">
        <Summary markdown={check.answer} className="text-sm text-zinc-800 dark:text-zinc-200" />
        {check.model && (
          <p className="text-[10px] text-zinc-400">by {check.model}</p>
        )}
      </section>

      {check.sources.length > 0 && (
        <section className="space-y-1.5">
          <p className="text-xs font-medium text-zinc-500">参考にした収集記事:</p>
          <ul className="space-y-1">
            {check.sources.map((s) => (
              <li key={s.id} className="text-sm">
                <Link href={`/news/${s.id}`} className="text-blue-700 dark:text-blue-400 hover:underline">
                  {s.title}
                </Link>
                <span className="text-xs text-zinc-400 ml-1.5">（{s.source_name}）</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="pt-4 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
        <p className="text-xs text-zinc-500">
          AIによる簡易的な情報整理であり、法的助言ではありません。実行時点の収集記事に基づくため、最新の規制動向は
          <Link href="/regulations" className="text-blue-700 dark:text-blue-400 hover:underline mx-0.5">法規制ページ</Link>
          と公式情報でご確認ください。
        </p>
        <Link
          href="/regulations"
          className="inline-flex items-center gap-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 transition-colors"
        >
          自分でもチェックしてみる
        </Link>
      </section>
    </article>
  );
}
