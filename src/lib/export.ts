import type { NewsArticle } from './database.types';

export interface ExportArticle {
  id: string;
  title: string;
  source_name: string;
  source_url: string;
  published_at: string | null;
  scraped_at: string;
  created_at: string;
  tags: string[];
  ai_summary: string | null;
}

export function toExport(a: NewsArticle): ExportArticle {
  return {
    id: a.id,
    title: a.title,
    source_name: a.source_name,
    source_url: a.source_url,
    published_at: a.published_at,
    scraped_at: a.scraped_at,
    created_at: a.created_at,
    tags: a.tags,
    ai_summary: a.ai_summary,
  };
}

function ymd(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function toJson(items: ExportArticle[] | ExportArticle): string {
  const payload = Array.isArray(items)
    ? { generated_at: new Date().toISOString(), count: items.length, items }
    : items;
  return JSON.stringify(payload, null, 2);
}

export function toMarkdown(items: ExportArticle[] | ExportArticle): string {
  const arr = Array.isArray(items) ? items : [items];
  const header = arr.length > 1
    ? `# 鹿児島サーキュラーエコノミー情報ポータル\n\n${arr.length}件 — 生成: ${ymd(new Date().toISOString())}\n\n---\n\n`
    : '';
  const body = arr
    .map((a) => {
      const tags = a.tags.length ? a.tags.join(', ') : '—';
      return [
        `## ${a.title}`,
        '',
        `- **出典**: ${a.source_name}`,
        `- **URL**: ${a.source_url}`,
        `- **発表日**: ${ymd(a.published_at)}`,
        `- **更新日**: ${ymd(a.scraped_at)}`,
        `- **タグ**: ${tags}`,
        '',
        '### AI要約',
        '',
        a.ai_summary ?? '（要約なし）',
      ].join('\n');
    })
    .join('\n\n---\n\n');
  return header + body;
}

export function toDocument(items: ExportArticle[] | ExportArticle): string {
  const arr = Array.isArray(items) ? items : [items];
  const header = arr.length > 1
    ? `鹿児島サーキュラーエコノミー情報ポータル\n${arr.length}件（生成: ${ymd(new Date().toISOString())}）\n\n${'='.repeat(40)}\n\n`
    : '';
  const body = arr
    .map((a) => {
      const tags = a.tags.length ? a.tags.join('、') : '—';
      const summary = a.ai_summary ? stripMarkdown(a.ai_summary) : '（要約なし）';
      return [
        a.title,
        '',
        `出典：${a.source_name}`,
        `URL：${a.source_url}`,
        `発表日：${ymd(a.published_at)}`,
        `更新日：${ymd(a.scraped_at)}`,
        `タグ：${tags}`,
        '',
        '【AI要約】',
        summary,
      ].join('\n');
    })
    .join('\n\n' + '─'.repeat(40) + '\n\n');
  return header + body;
}

function stripMarkdown(md: string): string {
  return md
    .replace(/^\s*#{1,6}\s+/gm, '')             // headings
    .replace(/\*\*(.+?)\*\*/g, '$1')            // **bold**
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1') // *italic*
    .replace(/`(.+?)`/g, '$1')                  // inline code
    .replace(/^\s*[-*+]\s+/gm, '・')            // bullets
    .replace(/^\s*\d+\.\s+/gm, '')              // numbered
    .replace(/\|\s*[-:]+\s*\|/g, '')            // table separators
    .replace(/^\s*\|/gm, '')                    // leading pipes
    .replace(/\|\s*$/gm, '')                    // trailing pipes
    .replace(/\s*\|\s*/g, '  ')                 // internal pipes → spaces
    .replace(/^---+\s*$/gm, '')                 // hr
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
