'use client';

import { useCallback, useEffect, useState } from 'react';

interface ArticleRow {
  id: string;
  title: string;
  source_name: string;
  source_url: string;
  published_at: string | null;
  scraped_at: string;
  tags: string[];
  blog_title: string | null;
  blog_body: string | null;
  note_draft_url: string | null;
  ai_summary: string | null;
  raw_excerpt: string | null;
}

interface Recipient {
  id: string;
  email: string;
  enabled: boolean;
  note: string | null;
  created_at: string;
}

function fmt(dt: string | null) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AdminDashboard() {
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);

  const [aggregating, setAggregating] = useState(false);
  const [aggResult, setAggResult] = useState<string | null>(null);

  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [genResult, setGenResult] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState('');
  const [newNote, setNewNote] = useState('');
  const [recipMsg, setRecipMsg] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [aRes, rRes] = await Promise.all([
        fetch('/api/admin/articles', { cache: 'no-store' }),
        fetch('/api/admin/recipients', { cache: 'no-store' }),
      ]);
      const aJson = await aRes.json();
      const rJson = await rRes.json();
      setArticles(aJson.articles ?? []);
      setRecipients(rJson.recipients ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function runAggregate() {
    setAggregating(true);
    setAggResult(null);
    try {
      const res = await fetch('/api/admin/aggregate', { method: 'POST' });
      const json = await res.json();
      const summary = `候補:${json.candidates ?? 0} 新規:${json.inserted ?? 0} 本文:${json.bodies?.ok ?? 0} 要約:${json.summarized?.ok ?? 0} メール送信:${json.mailed?.sent ?? 0}/${json.mailed?.recipients ?? 0}人`;
      setAggResult(res.ok ? `✓ ${summary}` : `✗ ${json.insertError ?? 'エラー'}`);
      await loadAll();
    } catch (e) {
      setAggResult(`✗ ${(e as Error).message}`);
    } finally {
      setAggregating(false);
    }
  }

  async function generateBlog(articleId: string) {
    setGeneratingId(articleId);
    setGenResult(null);
    try {
      const res = await fetch('/api/admin/generate-blog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId }),
      });
      const json = await res.json();
      if (res.ok) {
        setGenResult(`✓ 生成完了: ${json.title}（${json.bodyLength}字）— ローカルで publish-queued.ts を実行して投稿してください`);
        await loadAll();
      } else {
        setGenResult(`✗ ${json.error ?? 'エラー'}`);
      }
    } catch (e) {
      setGenResult(`✗ ${(e as Error).message}`);
    } finally {
      setGeneratingId(null);
    }
  }

  async function addRecipient(e: React.FormEvent) {
    e.preventDefault();
    setRecipMsg(null);
    try {
      const res = await fetch('/api/admin/recipients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, note: newNote || null }),
      });
      const json = await res.json();
      if (res.ok) {
        setNewEmail('');
        setNewNote('');
        setRecipMsg(`✓ ${json.recipient.email} を追加`);
        await loadAll();
      } else {
        setRecipMsg(`✗ ${json.error ?? 'エラー'}`);
      }
    } catch (e) {
      setRecipMsg(`✗ ${(e as Error).message}`);
    }
  }

  async function toggleRecipient(r: Recipient) {
    await fetch('/api/admin/recipients', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: r.id, enabled: !r.enabled }),
    });
    await loadAll();
  }

  async function deleteRecipient(r: Recipient) {
    if (!confirm(`${r.email} を削除しますか?`)) return;
    await fetch(`/api/admin/recipients?id=${encodeURIComponent(r.id)}`, { method: 'DELETE' });
    await loadAll();
  }

  return (
    <div className="space-y-12">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">管理ダッシュボード</h1>
        <p className="text-sm text-zinc-500 mt-1">公開ナビからは到達できません。URLは秘匿してください。</p>
      </header>

      <section>
        <h2 className="text-lg font-semibold mb-3">即時取得</h2>
        <p className="text-sm text-zinc-500 mb-3">スクレイピング → 要約 → メール送信を即座に実行します(2〜5分)。</p>
        <button
          type="button"
          onClick={runAggregate}
          disabled={aggregating}
          className="px-4 py-2 rounded-md bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {aggregating ? '実行中…' : '今すぐ取得'}
        </button>
        {aggResult && <p className="mt-3 text-sm font-mono text-zinc-700 dark:text-zinc-300">{aggResult}</p>}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Note記事生成（最新20件）</h2>
        <p className="text-sm text-zinc-500 mb-3">
          Claude Sonnetで本文を生成し、Supabaseの <code>blog_title</code> / <code>blog_body</code> に保存します。
          実際のnote.com投稿はローカルで <code>npx tsx scripts/publish-queued.ts</code> を実行してください。
        </p>
        {genResult && <p className="mb-3 text-sm font-mono text-zinc-700 dark:text-zinc-300">{genResult}</p>}
        {loading ? (
          <p className="text-sm text-zinc-500">読込中…</p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-md">
            {articles.map((a) => {
              const status = a.note_draft_url
                ? { label: 'note公開済', cls: 'text-emerald-600' }
                : a.blog_body
                  ? { label: '生成済（未投稿）', cls: 'text-amber-600' }
                  : { label: '未生成', cls: 'text-zinc-400' };
              const canGenerate = !!a.raw_excerpt && !!a.ai_summary;
              return (
                <li key={a.id} className="flex items-start gap-3 px-3 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <span>{a.source_name}</span>
                      <span>·</span>
                      <span>{fmt(a.published_at ?? a.scraped_at)}</span>
                      <span className={`ml-auto ${status.cls}`}>{status.label}</span>
                    </div>
                    <a href={a.source_url} target="_blank" rel="noreferrer" className="block mt-1 text-sm font-medium hover:underline truncate">
                      {a.title}
                    </a>
                  </div>
                  <button
                    type="button"
                    onClick={() => generateBlog(a.id)}
                    disabled={!canGenerate || generatingId === a.id || !!a.note_draft_url}
                    className="shrink-0 px-3 py-1.5 rounded text-xs font-medium border border-zinc-300 hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed dark:border-zinc-700 dark:hover:bg-zinc-800"
                    title={canGenerate ? '生成（再生成可）' : '本文 or 要約 が未取得のため生成不可'}
                  >
                    {generatingId === a.id ? '生成中…' : a.blog_body ? '再生成' : '生成'}
                  </button>
                </li>
              );
            })}
            {articles.length === 0 && <li className="px-3 py-6 text-sm text-zinc-500 text-center">記事がありません</li>}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">メール送信先</h2>
        <p className="text-sm text-zinc-500 mb-3">
          ここに登録された有効なアドレス全員にBCCで配信されます。新着記事1件 = 1メール。
        </p>
        <form onSubmit={addRecipient} className="flex flex-wrap gap-2 mb-4">
          <input
            type="email"
            placeholder="email@example.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            required
            className="flex-1 min-w-[200px] px-3 py-1.5 text-sm border border-zinc-300 rounded dark:border-zinc-700 dark:bg-zinc-900"
          />
          <input
            type="text"
            placeholder="メモ(任意)"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            className="flex-1 min-w-[160px] px-3 py-1.5 text-sm border border-zinc-300 rounded dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="submit"
            className="px-4 py-1.5 rounded bg-zinc-900 text-white text-sm hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            追加
          </button>
        </form>
        {recipMsg && <p className="mb-3 text-sm font-mono text-zinc-700 dark:text-zinc-300">{recipMsg}</p>}
        {loading ? (
          <p className="text-sm text-zinc-500">読込中…</p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-md">
            {recipients.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className={r.enabled ? '' : 'text-zinc-400 line-through'}>{r.email}</span>
                {r.note && <span className="text-xs text-zinc-500">({r.note})</span>}
                <span className="ml-auto flex gap-2">
                  <button
                    type="button"
                    onClick={() => toggleRecipient(r)}
                    className="px-2 py-1 text-xs rounded border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    {r.enabled ? '無効化' : '有効化'}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteRecipient(r)}
                    className="px-2 py-1 text-xs rounded border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
                  >
                    削除
                  </button>
                </span>
              </li>
            ))}
            {recipients.length === 0 && <li className="px-3 py-6 text-sm text-zinc-500 text-center">登録なし</li>}
          </ul>
        )}
      </section>
    </div>
  );
}
