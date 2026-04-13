import Anthropic from '@anthropic-ai/sdk';
import type { NewsArticle } from '../database.types';

export const BLOG_WRITER_MODEL = 'claude-sonnet-4-5-20250929';

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  return new Anthropic({ apiKey });
}

const SYSTEM_PROMPT = `あなたは鹿児島県のサーキュラーエコノミー実務を分かりやすく解説する note ブロガーです。読者は「県内の中小企業の担当者」「自治体職員」「環境担当者」を想定してください。

原文の情報をもとに、800〜1200字の解説記事を1本書いてください。以下のトーンで:
- 事実を淡々と並べるのではなく、「誰にとって、どういう意味を持つか」を解釈して伝える
- 「今回の発表は、〜〜にとって重要です。理由は〜〜」のように、実務への影響を明示
- 平易な日本語、専門用語は補足。堅苦しくなりすぎないが、ですます調で信頼感を保つ
- 断定せず、不明な点は「詳細は出典を確認してください」と書く
- タイトルは読者の興味を引く実務フック

構成:
1. 導入（2-3行）: 何が起きたか／読者にとっての意味
2. 見出し + 本文 2〜4ブロック: 制度概要／対象者／金額・期限／実務で使えるポイント
3. まとめ（2-3行）: 要点と次のアクション
4. 出典明示

Markdown を使う（note.com は見出し、箇条書き、太字、引用に対応）。
**テーブル記法は note が描画しないので使わない**。代わりに箇条書きで:
  - **対象**: xxx
  - **期限**: xxx
  - **金額**: xxx
のように太字ラベル + 項目の形に整える。

出力は JSON で以下のスキーマに厳密に従う（コードブロックや説明なし、JSON のみ）:
{
  "title": "記事タイトル",
  "body": "Markdown 本文",
  "hashtags": ["#タグ1", "#タグ2", ...]
}`;

export interface GeneratedBlogPost {
  title: string;
  body: string;
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
    '上記をもとに、JSON で解説記事を出力してください。',
  ]
    .filter(Boolean)
    .join('\n');

  const res = await client.messages.create({
    model: BLOG_WRITER_MODEL,
    max_tokens: 3000,
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
  if (!parsed.title || !parsed.body) throw new Error('Blog post missing title or body');
  return {
    title: parsed.title,
    body: parsed.body,
    hashtags: parsed.hashtags ?? [],
    model: BLOG_WRITER_MODEL,
  };
}

function parseJson(s: string): { title: string; body: string; hashtags?: string[] } {
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
