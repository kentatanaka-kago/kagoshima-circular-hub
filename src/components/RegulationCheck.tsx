'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Summary } from '@/components/Summary';

interface SourceRef {
  id: string;
  title: string;
  source_name: string;
  published_at: string | null;
}

interface Company {
  corporate_number: string;
  name: string;
  location: string | null;
}

type StreamEvent =
  | { type: 'sources'; sources: SourceRef[] }
  | { type: 'delta'; text: string }
  | { type: 'done'; id: string | null }
  | { type: 'error'; error: string };

type Mode = 'product' | 'company';

export function RegulationCheck() {
  const [mode, setMode] = useState<Mode>('product');
  const [product, setProduct] = useState('');

  // 企業検索フロー
  const [companyQuery, setCompanyQuery] = useState('');
  const [companyHits, setCompanyHits] = useState<Company[]>([]);
  const [searching, setSearching] = useState(false);
  const [company, setCompany] = useState<Company | null>(null);
  const [useWebSearch, setUseWebSearch] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [products, setProducts] = useState<string[]>([]);
  const [suggestNote, setSuggestNote] = useState<string | null>(null);

  // 規制チェック（共通）
  const [loading, setLoading] = useState(false);
  const [checkedProduct, setCheckedProduct] = useState<string | null>(null);
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

  // 企業名のインクリメンタル検索（400ms デバウンス）
  useEffect(() => {
    const q = companyQuery.trim();
    if (mode !== 'company' || q.length < 2 || (company && q === company.name)) {
      setCompanyHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/company-search?q=${encodeURIComponent(q)}`);
        const json = await res.json();
        if (res.ok && json.ok) {
          setCompanyHits(json.companies ?? []);
          setError(null);
        } else {
          setCompanyHits([]);
          setError(json.error ?? '企業検索でエラーが発生しました');
        }
      } catch {
        setCompanyHits([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [companyQuery, mode, company]);

  function selectCompany(c: Company) {
    setCompany(c);
    setCompanyQuery(c.name);
    setCompanyHits([]);
    setProducts([]);
    setSuggestNote(null);
  }

  async function suggestProducts() {
    if (!company || suggesting) return;
    setSuggesting(true);
    setError(null);
    setProducts([]);
    setSuggestNote(null);
    try {
      const res = await fetch('/api/product-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ corporate_number: company.corporate_number, use_web_search: useWebSearch }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'エラーが発生しました');
      const list = (json.products ?? []) as string[];
      setProducts(list);
      if (list.length === 0) {
        setSuggestNote('公表データから製品を推定できませんでした。下の入力欄に製品名を直接入力してください。');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSuggesting(false);
    }
  }

  async function runCheck(target: string) {
    const q = target.trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    setSources([]);
    setShareId(null);
    setCopied(false);
    setCheckedProduct(q);
    bufferRef.current = '';
    try {
      const res = await fetch('/api/regulation-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product: q,
          ...(mode === 'company' && company
            ? { company: { name: company.name, corporate_number: company.corporate_number } }
            : {}),
        }),
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

  const inputClass =
    'flex-1 min-w-[200px] px-3 py-2 text-sm border border-indigo-300 dark:border-indigo-800 rounded-md bg-white dark:bg-zinc-900';
  const buttonClass =
    'px-5 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50';

  return (
    <section className="rounded-lg border border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/20 p-5 space-y-3">
      <div>
        <h2 className="font-semibold text-indigo-950 dark:text-indigo-100">AI規制チェック（β）</h2>
        <p className="mt-1 text-xs text-indigo-900/70 dark:text-indigo-200/70">
          {mode === 'product'
            ? '製品・部品・素材名を入力すると、関係しうる法規制と準備事項をAIが簡易整理します。例: リチウムイオン電池、プラスチック容器、鉄スクラップ'
            : '企業名で検索すると、公表データ（gBizINFO）からその企業の製品をAIが推定し、法規制チェックにつなげます。'}
        </p>
      </div>

      <div className="flex gap-1 rounded-md bg-indigo-100/70 dark:bg-indigo-900/30 p-1 w-fit" role="tablist">
        {(
          [
            ['product', '製品名から'],
            ['company', '企業名から'],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={
              mode === m
                ? 'px-3 py-1 rounded text-xs font-medium bg-white dark:bg-zinc-900 text-indigo-900 dark:text-indigo-100 shadow-sm'
                : 'px-3 py-1 rounded text-xs text-indigo-800/70 dark:text-indigo-200/70 hover:text-indigo-900 dark:hover:text-indigo-100'
            }
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'company' && (
        <div className="space-y-2">
          <div className="relative">
            <input
              type="text"
              value={companyQuery}
              onChange={(e) => {
                setCompanyQuery(e.target.value);
                setCompany(null);
                setProducts([]);
              }}
              maxLength={60}
              placeholder="企業名を入力して検索…"
              className={`${inputClass} w-full`}
            />
            {searching && (
              <span className="absolute right-3 top-2.5 text-xs text-zinc-400">検索中…</span>
            )}
            {companyHits.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg max-h-64 overflow-y-auto">
                {companyHits.map((c) => (
                  <li key={c.corporate_number}>
                    <button
                      type="button"
                      onClick={() => selectCompany(c)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                    >
                      <span className="font-medium">{c.name}</span>
                      <span className="ml-2 text-xs text-zinc-500">
                        {c.location ?? ''}（法人番号 {c.corporate_number}）
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {company && (
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-indigo-900/80 dark:text-indigo-200/80">
                <input
                  type="checkbox"
                  checked={useWebSearch}
                  onChange={(e) => setUseWebSearch(e.target.checked)}
                  className="rounded border-indigo-300"
                />
                Web検索も使って精度を上げる（少し時間がかかります）
              </label>
              <button type="button" onClick={suggestProducts} disabled={suggesting} className={buttonClass}>
                {suggesting ? '推定中…' : '製品候補を出す'}
              </button>
            </div>
          )}

          {products.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-indigo-900/70 dark:text-indigo-200/70">
                推定された製品（タップで規制チェック）:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {products.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => runCheck(p)}
                    disabled={loading}
                    className="rounded-full border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-zinc-900 px-3 py-1 text-sm text-indigo-900 dark:text-indigo-100 hover:bg-indigo-100 dark:hover:bg-indigo-950/60 disabled:opacity-50"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
          {suggestNote && <p className="text-xs text-zinc-500">{suggestNote}</p>}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          runCheck(product);
        }}
        className="flex flex-wrap gap-2"
      >
        <input
          type="text"
          value={product}
          onChange={(e) => setProduct(e.target.value)}
          maxLength={40}
          placeholder={mode === 'company' ? '製品名を直接入力する場合はこちら…' : '製品・部品名を入力…'}
          className={inputClass}
        />
        <button type="submit" disabled={loading || product.trim().length < 2} className={buttonClass}>
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
          {checkedProduct && (
            <p className="text-xs text-zinc-500">
              「{checkedProduct}」のチェック結果
              {mode === 'company' && company ? `（対象企業: ${company.name}）` : ''}
            </p>
          )}
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
