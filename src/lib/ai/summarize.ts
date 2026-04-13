import Anthropic from '@anthropic-ai/sdk';

export const SUMMARIZER_MODEL = 'claude-haiku-4-5-20251001';

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  return new Anthropic({ apiKey });
}

const SYSTEM_INSTRUCTION = `あなたは鹿児島県のサーキュラーエコノミー実務担当者向けに行政発表を要約する編集者です。

出力ルール:
- プレーンテキストのみ。Markdown 記号（#, *, -, \`, など）や見出し記号は絶対に使わない。
- 下記の3行を必ずこの順序で出力する。各行は1行にまとめる。
  対象：誰が対象か（事業者種別・地域・規模など）
  期限：申請や報告の締切日（YYYY年MM月DD日 形式で）。複数ある場合は代表1つ。
  金額・内容：補助上限額や提出物。数値があれば原文から引用する。
- いずれの項目も原文抜粋に根拠がなければ「不明」とだけ書く。絶対に推測・創作・一般論で埋めない。
- 3行のあとに任意で1行だけ「詳細は出典を参照してください」を添えてよい。
- タイトルをそのまま出力しない。タイトルに含まれる語で対象や金額を推測しない。`;

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
    input.excerpt ? `抜粋:\n${input.excerpt.slice(0, 1200)}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const res = await withRetry(() =>
    client.messages.create({
      model: SUMMARIZER_MODEL,
      max_tokens: 400,
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
