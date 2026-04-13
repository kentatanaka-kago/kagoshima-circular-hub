import Anthropic from '@anthropic-ai/sdk';

export const SUMMARIZER_MODEL = 'claude-sonnet-4-5-20250929';

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  return new Anthropic({ apiKey });
}

const SYSTEM_INSTRUCTION = `あなたは鹿児島県のサーキュラーエコノミー実務担当者向けに、行政発表を要約する編集者です。読者がひと目で要点をつかめるように、GitHub Flavored Markdown を積極的に使って構造化してください。

利用できる記法: 見出し、箇条書き、番号付きリスト、太字、テーブル（|区切り）、ブロック引用、区切り線。

書き方:
1. 最初の1〜2行で記事の要点を短くまとめる（タイトルの言い換えではなく、「何が起きたか／何ができるか」を伝える）。
2. 記事の性質に応じて構造を選ぶ:
   - 補助金・公募 → テーブルで「対象 / 期限 / 金額 / 申請方法 など」を整理
   - 統計・調査結果 → テーブルまたは箇条書きで主要数値
   - 制度改正・ガイドライン → 箇条書きで変更点・実務への影響
   - 採択結果・お知らせ → 採択件数・採択者などを箇条書きで
   - イベント → 日時・場所・対象・費用
3. 本文量は 200〜450 字を目安に。読みやすさを優先し、短くまとまるなら短くてよい。
4. 日付は "YYYY年MM月DD日" 形式、金額・件数は原文のまま引用する。

守るべきこと:
- 原文抜粋に根拠がない情報は書かない。推測・創作・一般論で埋めない。
- 重要項目が原文に無ければ「不明」と明示する（テーブル内でも「不明」を使ってよい）。
- タイトルをそのまま繰り返さない。
- 出典リンクや「詳細は出典を参照…」などの文言は書かない（別UIで表示される）。`;

export interface SummarizeInput {
  title: string;
  source_name: string;
  excerpt?: string | null;
}

export interface SummarizeOutput {
  summary: string;
  model: string;
}

export async function summarizeArticle(input: SummarizeInput): Promise<SummarizeOutput> {
  const client = getClient();
  const userPrompt = [
    `出典: ${input.source_name}`,
    `タイトル: ${input.title}`,
    input.excerpt ? `抜粋:\n${input.excerpt.slice(0, 1800)}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const res = await withRetry(() =>
    client.messages.create({
      model: SUMMARIZER_MODEL,
      max_tokens: 800,
      temperature: 0.2,
      system: SYSTEM_INSTRUCTION,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  );

  const text = res.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
  if (!text) throw new Error('empty summary from Claude');
  return { summary: text, model: SUMMARIZER_MODEL };
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      const status = (e as { status?: number } | null)?.status;
      const retriable =
        status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
      if (!retriable || attempt === maxAttempts) throw e;
      const backoff = Math.min(8000, 500 * 2 ** (attempt - 1)) + Math.random() * 300;
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastError;
}
