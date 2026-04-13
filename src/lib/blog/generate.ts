import Anthropic from '@anthropic-ai/sdk';
import type { NewsArticle } from '../database.types';

export const BLOG_WRITER_MODEL = 'claude-sonnet-4-5-20250929';

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  return new Anthropic({ apiKey });
}

const SYSTEM_PROMPT = `あなたは鹿児島県のサーキュラーエコノミー実務を分かりやすく解説する note ブロガーです。読者は「県内の中小企業の担当者」「自治体職員」「環境担当者」を想定してください。

原文をもとに、800〜1500字の解説記事を書いてください。記事は Markdown テキストと図表のブロック配列として構成し、読者の理解を助けるために図表を積極的に挿入してください。

# 出力形式（JSON 厳守）

{
  "title": "記事タイトル",
  "hashtags": ["#タグ1", "#タグ2", ...],
  "blocks": [
    {"type": "markdown", "content": "Markdown テキスト"},
    {"type": "figure_image", "caption": "キャプション", "prompt": "英語の画像生成指示"},
    {"type": "figure_table", "caption": "キャプション", "html": "<h3>…</h3><table>…</table>"},
    ...
  ]
}

# ブロックの使い分け

- **markdown**: 段落・見出し (##, ###)・箇条書き (-) ・太字 (**x**)・引用 (>) OK。
  テーブル記法 (| …) は使わない（note が描画しないため）。
- **figure_image**: 概念図・イメージ図。日本語テキストを埋め込まず視覚的メタファーで
  表現したい場面に使う（例: 制度の全体像、関係者マップ、フロー）。
  prompt は英語で書き、スタイル「clean modern infographic illustration,
  green/blue pastel palette, flat geometric, no text」を追加すること。
- **figure_table**: 比較表・条件一覧・金額階段など、正確な日本語テキストや数値を
  見せたい場面に使う。html には以下のみ含める:
  <h3>（任意）</h3>, <table>, <thead>, <tbody>, <tr>, <th>, <td>, <strong>, <br>, <ul><li>。
  インラインスタイルや class は付けない（側で共通 CSS が当たる）。

# 本文の書き方

- 記事全体で **少なくとも 2つ（できれば 3〜4つ）の figure ブロック** を入れる。
  その記事にとって価値のある figure を選ぶこと（単なる装飾は不要）。
- markdown ブロックと figure ブロックを交互に配置し、読み進めながら図表が
  現れる流れにする。
- 冒頭 blocks[0] は markdown で導入 2-3 行。最後の block は markdown で
  まとめ + ハッシュタグを含めない（hashtags フィールドで別に返す）。
- トーンは「誰にとって、どういう意味を持つか」を解釈して伝える解説調。
  ですます調・平易な日本語・専門用語には補足。
- 出典URLは末尾の markdown ブロックに通常テキスト（http から始める）で記載。

# ルール

- 原文に根拠がない事実を作らない。不明な項目は「不明」と書く。
- タイトルは読者の興味を引く実務フック。
- コードブロックや説明は含めず、純粋な JSON のみ出力。`;

export interface BlogBlockMarkdown {
  type: 'markdown';
  content: string;
}
export interface BlogBlockFigureImage {
  type: 'figure_image';
  caption: string;
  prompt: string;
}
export interface BlogBlockFigureTable {
  type: 'figure_table';
  caption: string;
  html: string;
}
export type BlogBlock = BlogBlockMarkdown | BlogBlockFigureImage | BlogBlockFigureTable;

export interface GeneratedBlogPost {
  title: string;
  blocks: BlogBlock[];
  hashtags: string[];
  model: string;
}

export async function generateBlogPost(article: NewsArticle): Promise<GeneratedBlogPost> {
  const client = getClient();
  const userPrompt = [
    `出典: ${article.source_name}`,
    `出典URL: ${article.source_url}`,
    `発表日: ${article.published_at ?? '不明'}`,
    `タイトル: ${article.title}`,
    article.raw_excerpt ? `原文抜粋:\n${article.raw_excerpt.slice(0, 3000)}` : null,
    article.ai_summary ? `AI要約:\n${article.ai_summary}` : null,
    '',
    '上記を素材に、JSON で記事を出力してください。',
  ]
    .filter(Boolean)
    .join('\n');

  const res = await client.messages.create({
    model: BLOG_WRITER_MODEL,
    max_tokens: 6000,
    temperature: 0.4,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  const parsed = parseJson(text);
  if (!parsed.title || !Array.isArray(parsed.blocks)) {
    throw new Error('Blog post missing title or blocks');
  }
  return {
    title: parsed.title,
    blocks: parsed.blocks,
    hashtags: parsed.hashtags ?? [],
    model: BLOG_WRITER_MODEL,
  };
}

function parseJson(s: string): { title: string; blocks: BlogBlock[]; hashtags?: string[] } {
  const stripped = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const start = stripped.indexOf('{');
    const end = stripped.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(stripped.slice(start, end + 1));
    throw new Error('Could not parse blog post JSON');
  }
}

// Re-serialise blocks into plain Markdown for local draft files (post.md).
export function blocksToMarkdown(blocks: BlogBlock[]): string {
  return blocks
    .map((b) => {
      if (b.type === 'markdown') return b.content;
      if (b.type === 'figure_image') return `*[図表: ${b.caption}]*\n\n（画像: ${b.prompt.slice(0, 80)}...）`;
      if (b.type === 'figure_table') return `*[表: ${b.caption}]*\n\n${htmlToText(b.html)}`;
      return '';
    })
    .join('\n\n');
}

function htmlToText(html: string): string {
  // Very loose strip for the local Markdown preview; the real rendering is PNG
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
