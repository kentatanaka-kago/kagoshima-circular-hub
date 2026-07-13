'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Summary } from '@/components/Summary';

interface SourceRef {
  id: string;
  title: string;
  source_name: string;
  published_at: string | null;
}

type StreamEvent =
  | { type: 'sources'; sources: SourceRef[] }
  | { type: 'delta'; text: string }
  | { type: 'done'; id: string | null }
  | { type: 'error'; error: string };

export function RegulationCheck() {
  const [product, setProduct] = useState('');
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<SourceRef[]>([]);
  const [shareId, setShareId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 逐次 setState だと描画が過剰になるので、バッファに溜めて rAF でまとめて反映。
  const bufferRef = useRef('');
  const flushTimerRef = useRef<number | null>(null);

  function flushSoon() {
    if (flushTimerRef.current !== null) return;
    flushTimerRef.current = window.requestAnimationFrame(() => {
      flushTimerRef.current = null;
      setAnswer(bufferRef.current);
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = product.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    setSources([]);
    setShareId(null);
    setCopied(false);
    bufferRef.current = '';
    try {
      const res = await fetch('/api/regulation-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product: q }),
      });
      const contentType = res.headers.get('content-type') ?? '';
      if (!res.ok || !contentType.includes('text/event-stream')) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error ?? 'エラーが発生しました');
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let pending = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        // SSE frames are separated by a blank line.
        const frames = pending.split('\n\n');
        pending = frames.pop() ?? '';
        for (const frame of frames) {
          const data = frame.split('\n').find((l) => l.startsWith('data: '))?.slice(6);
          if (!data) continue;
          const ev = JSON.parse(data) as StreamEvent;
          if (ev.type === 'sources') setSources(ev.sources);
          else if (ev.type === 'delta') {
            bufferRef.current += ev.text;
            flushSoon();
          } else if (ev.type === 'done') setShareId(ev.id);
          else if (ev.type === 'error') throw new Error(ev.error);
        }
      }
      setAnswer(bufferRef.current || null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function copyShareLink() {
    if (!shareId) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/regulation-check/${shareId}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('コピーに失敗しました');
    }
  }

  return (
    <section className="rounded-lg border border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/20 p-5 space-y-3">
      <div>
        <h2 className="font-semibold text-indigo-950 dark:text-indigo-100">AI規制チェック（β）</h2>
        <p className="mt-1 text-xs text-indigo-900/70 dark:text-indigo-200/70">
          製品・部品・素材名を入力すると、関係しうる法規制と準備事項をAIが簡易整理します。例: リチウムイオン電池、プラスチック容器、鉄スクラップ
        </p>
      </div>
      <form onSubmit={submit} className="flex flex-wrap gap-2">
        <input
          type="text"
          value={product}
          onChange={(e) => setProduct(e.target.value)}
          maxLength={40}
          placeholder="製品・部品名を入力…"
          className="flex-1 min-w-[200px] px-3 py-2 text-sm border border-indigo-300 dark:border-indigo-800 rounded-md bg-white dark:bg-zinc-900"
        />
        <button
          type="submit"
          disabled={loading || product.trim().length < 2}
          className="px-5 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? '分析中…' : 'チェック'}
        </button>
      </form>

      {loading && !answer && (
        <p className="text-sm text-indigo-900/70 dark:text-indigo-200/70">
          関連する規制記事を検索しています…
        </p>
      )}
      {error && <p className="text-sm text-red-700 dark:text-red-400">✗ {error}</p>}

      {answer && (
        <div className="rounded-md bg-white dark:bg-zinc-900 border border-indigo-200 dark:border-indigo-900 p-4 space-y-3">
          <Summary markdown={answer} className="text-sm text-zinc-800 dark:text-zinc-200" />
          {!loading && sources.length > 0 && (
            <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <p className="text-xs font-medium text-zinc-500 mb-1.5">参考にした収集記事:</p>
              <ul className="space-y-1">
                {sources.map((s) => (
                  <li key={s.id} className="text-xs">
                    <Link href={`/news/${s.id}`} className="text-blue-700 dark:text-blue-400 hover:underline">
                      {s.title}
                    </Link>
                    <span className="text-zinc-400 ml-1.5">（{s.source_name}）</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!loading && shareId && (
            <div className="flex items-center gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={copyShareLink}
                className="px-3 py-1.5 rounded-md border border-indigo-300 dark:border-indigo-800 text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
              >
                {copied ? '✓ コピーしました' : 'この結果の共有リンクをコピー'}
              </button>
              <Link
                href={`/regulation-check/${shareId}`}
                className="text-xs text-indigo-700 dark:text-indigo-300 hover:underline"
              >
                結果ページを開く ↗
              </Link>
            </div>
          )}
          <p className="text-[11px] text-zinc-400">
            AIによる簡易的な情報整理であり、法的助言ではありません。実際の対応は必ず公式情報・専門家にご確認ください。
          </p>
        </div>
      )}
    </section>
  );
}
