'use client';

import { useState } from 'react';
import { toDocument, toJson, toMarkdown, type ExportArticle } from '@/lib/export';

type Format = 'json' | 'markdown' | 'document';

const LABEL: Record<Format, string> = {
  json: 'JSON',
  markdown: 'Markdown',
  document: 'ドキュメント',
};

export function CopyMenu({
  items,
  size = 'md',
}: {
  items: ExportArticle[] | ExportArticle;
  size?: 'sm' | 'md';
}) {
  const [copied, setCopied] = useState<Format | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function doCopy(format: Format) {
    setError(null);
    const text =
      format === 'json'
        ? toJson(items)
        : format === 'markdown'
          ? toMarkdown(items)
          : toDocument(items);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(format);
      setTimeout(() => setCopied(null), 1800);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'コピー失敗');
    }
  }

  const count = Array.isArray(items) ? items.length : 1;
  const btnPad = size === 'sm' ? 'px-2.5 py-1' : 'px-3 py-1.5';
  const fontSize = size === 'sm' ? 'text-[11px]' : 'text-xs';

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className={`${fontSize} text-zinc-500 mr-0.5`}>
        {count === 1 ? 'この記事をコピー:' : `${count}件をコピー:`}
      </span>
      {(['json', 'markdown', 'document'] as Format[]).map((f) => (
        <button
          key={f}
          type="button"
          onClick={() => doCopy(f)}
          className={`rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 ${btnPad} ${fontSize} font-medium text-zinc-700 dark:text-zinc-300 transition-colors ${copied === f ? 'ring-1 ring-emerald-500 text-emerald-700 dark:text-emerald-400' : ''}`}
        >
          {copied === f ? '✓ コピー完了' : LABEL[f]}
        </button>
      ))}
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
