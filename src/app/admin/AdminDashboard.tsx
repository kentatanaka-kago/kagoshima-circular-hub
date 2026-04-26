'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

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
  note_post_url: string | null;
  note_posted_at: string | null;
  ai_summary: string | null;
  raw_excerpt: string | null;
  emailed_at: string | null;
}

interface Recipient {
  id: string;
  email: string;
  enabled: boolean;
  note: string | null;
  created_at: string;
}

type StatusFilter = 'all' | 'note_published' | 'note_unpublished' | 'ungenerated' | 'generated';

const PAGE_SIZE = 50;

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'note_published', label: 'note公開済' },
  { value: 'note_unpublished', label: 'note未公開' },
  { value: 'ungenerated', label: '未生成' },
  { value: 'generated', label: '生成済' },
];

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

function articleStatus(a: ArticleRow): { label: string; cls: string } {
  if (a.note_post_url) return { label: 'note公開済', cls: 'text-emerald-600' };
  if (a.note_draft_url) return { label: 'note下書き', cls: 'text-sky-600' };
  if (a.blog_body) return { label: '生成済（未投稿）', cls: 'text-amber-600' };
  return { label: '未生成', cls: 'text-zinc-400' };
}

export function AdminDashboard() {
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [total, setTotal] = useState(0);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [aggregating, setAggregating] = useState(false);
  const [aggResult, setAggResult] = useState<string | null>(null);

  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [genResult, setGenResult] = useState<string | null>(null);

  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<string | null>(null);

  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState('');
  const [newNote, setNewNote] = useState('');
  const [recipMsg, setRecipMsg] = useState<string | null>(null);

  const buildArticlesUrl = useCallback(() => {
    const params = new URLSearchParams();
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(page * PAGE_SIZE));
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (searchQuery) params.set('q', searchQuery);
    for (const s of selectedSources) params.append('source', s);
    return `/api/admin/articles?${params.toString()}`;
  }, [page, statusFilter, searchQuery, selectedSources]);

  const loadArticles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(buildArticlesUrl(), { cache: 'no-store' });
      const json = await res.json();
      setArticles(json.articles ?? []);
      setTotal(json.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [buildArticlesUrl]);

  const loadAux = useCallback(async () => {
    const [rRes, sRes] = await Promise.all([
      fetch('/api/admin/recipients', { cache: 'no-store' }),
      fetch('/api/admin/sources', { cache: 'no-store' }),
    ]);
    const rJson = await rRes.json();
    const sJson = await sRes.json();
    setRecipients(rJson.recipients ?? []);
    setSources(sJson.sources ?? []);
  }, []);

  useEffect(() => {
    loadArticles();
  }, [loadArticles]);

  useEffect(() => {
    loadAux();
  }, [loadAux]);

  function resetToFirstPage() {
    setPage(0);
  }

  function applyStatus(next: StatusFilter) {
    setStatusFilter(next);
    resetToFirstPage();
  }

  function toggleSource(name: string) {
    setSelectedSources((prev) =>
      prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name],
    );
    resetToFirstPage();
  }

  function clearSources() {
    setSelectedSources([]);
    resetToFirstPage();
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchQuery(searchInput.trim());
    resetToFirstPage();
  }

  function clearSearch() {
    setSearchInput('');
    setSearchQuery('');
    resetToFirstPage();
  }

  async function runAggregate() {
    setAggregating(true);
    setAggResult(null);
    try {
      const res = await fetch('/api/admin/aggregate', { method: 'POST' });
      const json = await res.json();
      const summary = `候補:${json.candidates ?? 0} 新規:${json.inserted ?? 0} 本文:${json.bodies?.ok ?? 0} 要約:${json.summarized?.ok ?? 0} メール送信:${json.mailed?.sent ?? 0}/${json.mailed?.recipients ?? 0}人`;
      setAggResult(res.ok ? `✓ ${summary}` : `✗ ${json.insertError ?? 'エラー'}`);
      await loadArticles();
    } catch (e) {
      setAggResult(`✗ ${(e as Error).message}`);
    } finally {
      setAggregating(false);
    }
  }

  async function refreshStatus() {
    setRefreshing(true);
    setRefreshResult(null);
    try {
      const res = await fetch('/api/admin/refresh-status', { method: 'POST' });
      const json = await res.json();
      if (res.ok && json.ok) {
        setRefreshResult(
          `✓ note RSS:${json.rssItems ?? 0}件 / 一致:${json.matched ?? 0}件 / 更新:${json.updated ?? 0}件`,
        );
        await loadArticles();
      } else {
        setRefreshResult(`✗ ${json.error ?? 'エラー'}`);
      }
    } catch (e) {
      setRefreshResult(`✗ ${(e as Error).message}`);
    } finally {
      setRefreshing(false);
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
        await loadArticles();
      } else {
        setGenResult(`✗ ${json.error ?? 'エラー'}`);
      }
    } catch (e) {
      setGenResult(`✗ ${(e as Error).message}`);
    } finally {
      setGeneratingId(null);
    }
  }

  async function sendMail(article: ArticleRow) {
    const ok = confirm(
      `この記事を有効な配信先全員に即時メール送信します。\n\n${article.source_name}｜${article.title}\n\nよろしいですか？`,
    );
    if (!ok) return;
    setSendingId(article.id);
    setSendResult(null);
    try {
      const res = await fetch('/api/admin/send-mail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId: article.id }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setSendResult(`✓ 送信成功（配信先 ${json.recipients}人）— ${article.title}`);
        await loadArticles();
      } else {
        setSendResult(`✗ ${json.error ?? '送信失敗'}`);
      }
    } catch (e) {
      setSendResult(`✗ ${(e as Error).message}`);
    } finally {
      setSendingId(null);
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
        await loadAux();
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
    await loadAux();
  }

  async function deleteRecipient(r: Recipient) {
    if (!confirm(`${r.email} を削除しますか?`)) return;
    await fetch(`/api/admin/recipients?id=${encodeURIComponent(r.id)}`, { method: 'DELETE' });
    await loadAux();
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const showingFrom = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const showingTo = Math.min(total, page * PAGE_SIZE + articles.length);

  const filterActive = useMemo(
    () => statusFilter !== 'all' || selectedSources.length > 0 || searchQuery.length > 0,
    [statusFilter, selectedSources, searchQuery],
  );

  function clearAllFilters() {
    setStatusFilter('all');
    setSelectedSources([]);
    setSearchInput('');
    setSearchQuery('');
    resetToFirstPage();
  }

  return (
    <div className="space-y-12">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">管理ダッシュボード</h1>
        <p className="text-sm text-zinc-500 mt-1">公開ナビからは到達できません。URLは秘匿してください。</p>
      </header>

      <section>
        <h2 className="text-lg font-semibold mb-3">運用アクション</h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={runAggregate}
            disabled={aggregating}
            className="px-4 py-2 rounded-md bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {aggregating ? '取得中…' : '今すぐ取得（スクレイピング→要約→メール）'}
          </button>
          <button
            type="button"
            onClick={refreshStatus}
            disabled={refreshing}
            className="px-4 py-2 rounded-md border border-zinc-300 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            title="note RSSを取得し、note_post_url/note_posted_at を最新化します"
          >
            {refreshing ? '更新中…' : 'note公開ステータスを更新'}
          </button>
        </div>
        <div className="mt-3 space-y-1 text-sm font-mono text-zinc-700 dark:text-zinc-300">
          {aggResult && <p>{aggResult}</p>}
          {refreshResult && <p>{refreshResult}</p>}
        </div>
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-3 gap-2 flex-wrap">
          <h2 className="text-lg font-semibold">記事一覧</h2>
          <p className="text-xs text-zinc-500">
            {total === 0 ? '0件' : `${showingFrom}–${showingTo} / 全 ${total} 件`}
          </p>
        </div>

        <div className="space-y-3 mb-4">
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((opt) => {
              const active = statusFilter === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => applyStatus(opt.value)}
                  className={`px-3 py-1 rounded-full text-xs border transition ${
                    active
                      ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100'
                      : 'border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-xs text-zinc-500 mr-1">発表元:</span>
            {sources.length === 0 && <span className="text-xs text-zinc-400">（読込中）</span>}
            {sources.map((s) => {
              const active = selectedSources.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSource(s)}
                  className={`px-2.5 py-0.5 rounded-full text-xs border transition ${
                    active
                      ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100'
                      : 'border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800'
                  }`}
                >
                  {s}
                </button>
              );
            })}
            {selectedSources.length > 0 && (
              <button
                type="button"
                onClick={clearSources}
                className="px-2 py-0.5 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                クリア
              </button>
            )}
          </div>

          <form onSubmit={submitSearch} className="flex flex-wrap gap-2">
            <input
              type="search"
              placeholder="フリーワード検索（タイトル / 発表元 / 要約 / 本文）"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="flex-1 min-w-[220px] px-3 py-1.5 text-sm border border-zinc-300 rounded dark:border-zinc-700 dark:bg-zinc-900"
            />
            <button
              type="submit"
              className="px-4 py-1.5 rounded bg-zinc-900 text-white text-sm hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              検索
            </button>
            {searchQuery && (
              <button
                type="button"
                onClick={clearSearch}
                className="px-3 py-1.5 rounded border border-zinc-300 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                解除
              </button>
            )}
            {filterActive && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="px-3 py-1.5 rounded text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                すべての条件をクリア
              </button>
            )}
          </form>
        </div>

        {sendResult && <p className="mb-3 text-sm font-mono text-zinc-700 dark:text-zinc-300">{sendResult}</p>}
        {genResult && <p className="mb-3 text-sm font-mono text-zinc-700 dark:text-zinc-300">{genResult}</p>}

        {loading ? (
          <p className="text-sm text-zinc-500">読込中…</p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-md">
            {articles.map((a) => {
              const status = articleStatus(a);
              const canGenerate = !!a.raw_excerpt && !!a.ai_summary;
              return (
                <li key={a.id} className="flex items-start gap-3 px-3 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs text-zinc-500 flex-wrap">
                      <span>{a.source_name}</span>
                      <span>·</span>
                      <span>{fmt(a.published_at ?? a.scraped_at)}</span>
                      {a.emailed_at && (
                        <span className="text-zinc-400">· メール送信済 {fmt(a.emailed_at)}</span>
                      )}
                      <span className={`ml-auto ${status.cls}`}>{status.label}</span>
                    </div>
                    <a
                      href={a.note_post_url ?? a.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="block mt-1 text-sm font-medium hover:underline truncate"
                    >
                      {a.title}
                    </a>
                  </div>
                  <div className="shrink-0 flex flex-col gap-1.5 items-stretch">
                    <button
                      type="button"
                      onClick={() => generateBlog(a.id)}
                      disabled={!canGenerate || generatingId === a.id || !!a.note_post_url}
                      className="px-3 py-1 rounded text-xs font-medium border border-zinc-300 hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed dark:border-zinc-700 dark:hover:bg-zinc-800"
                      title={canGenerate ? '生成（再生成可）' : '本文 or 要約 が未取得のため生成不可'}
                    >
                      {generatingId === a.id ? '生成中…' : a.blog_body ? '再生成' : '生成'}
                    </button>
                    <button
                      type="button"
                      onClick={() => sendMail(a)}
                      disabled={sendingId === a.id}
                      className="px-3 py-1 rounded text-xs font-medium border border-zinc-300 hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed dark:border-zinc-700 dark:hover:bg-zinc-800"
                      title="この記事を有効な配信先全員に即時メール送信"
                    >
                      {sendingId === a.id ? '送信中…' : 'メール送信'}
                    </button>
                  </div>
                </li>
              );
            })}
            {articles.length === 0 && <li className="px-3 py-6 text-sm text-zinc-500 text-center">該当する記事がありません</li>}
          </ul>
        )}

        <div className="mt-4 flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0 || loading}
            className="px-3 py-1.5 rounded border border-zinc-300 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            ← 前へ
          </button>
          <span className="text-zinc-500">
            {page + 1} / {totalPages} ページ
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={page + 1 >= totalPages || loading}
            className="px-3 py-1.5 rounded border border-zinc-300 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            次へ →
          </button>
        </div>
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
      </section>
    </div>
  );
}
