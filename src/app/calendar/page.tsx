import { supabase } from '@/lib/supabase';
import type { Subsidy } from '@/lib/database.types';

export const revalidate = 600;

function formatDate(d: string | null) {
  if (!d) return '未定';
  return new Date(d).toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'numeric', day: 'numeric',
  });
}

function daysUntil(d: string | null): number | null {
  if (!d) return null;
  const diff = new Date(d).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

const LEVEL_LABEL: Record<Subsidy['issuer_level'], string> = {
  national: '国',
  prefectural: '県',
  municipal: '市町村',
};

export default async function Calendar() {
  const { data, error } = await supabase
    .from('subsidies')
    .select('*')
    .order('application_end_at', { ascending: true, nullsFirst: false });

  const subsidies = (data ?? []) as Subsidy[];

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight">支援施策カレンダー</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          環境省補助金から地域支援事業まで、申請締切の近い順に一元管理。
        </p>
      </section>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-900 dark:text-red-200">
          エラー: {error.message}
        </div>
      )}

      {!error && subsidies.length === 0 && (
        <div className="rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 px-6 py-12 text-center text-sm text-zinc-500">
          登録された支援施策はまだありません。
        </div>
      )}

      <ul className="space-y-3">
        {subsidies.map((s) => {
          const d = daysUntil(s.application_end_at);
          return (
            <li key={s.id} className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-zinc-600 dark:text-zinc-400">
                      {LEVEL_LABEL[s.issuer_level]}
                    </span>
                    <span className="text-zinc-500">{s.issuer}</span>
                  </div>
                  <h2 className="mt-1.5 font-medium">
                    <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="hover:underline">{s.name}</a>
                  </h2>
                  {s.ai_summary && (
                    <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">{s.ai_summary}</p>
                  )}
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {s.target && (<><dt className="text-zinc-500">対象</dt><dd>{s.target}</dd></>)}
                    {s.amount_text && (<><dt className="text-zinc-500">金額</dt><dd>{s.amount_text}</dd></>)}
                    <dt className="text-zinc-500">受付</dt>
                    <dd>{formatDate(s.application_start_at)} 〜 {formatDate(s.application_end_at)}</dd>
                  </dl>
                </div>
                {d !== null && (
                  <div className={`shrink-0 text-right ${d <= 7 ? 'text-red-600 dark:text-red-400' : d <= 30 ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-500'}`}>
                    <div className="text-2xl font-semibold leading-none">{d >= 0 ? d : '—'}</div>
                    <div className="text-[10px] mt-1">{d >= 0 ? '日後に締切' : '締切済み'}</div>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
