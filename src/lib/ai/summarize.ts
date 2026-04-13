import Anthropic from '@anthropic-ai/sdk';

export const SUMMARIZER_MODEL = 'claude-haiku-4-5-20251001';

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  return new Anthropic({ apiKey });
}

const SYSTEM_INSTRUCTION = `あなたは鹿児島県のサーキュラーエコノミー実務担当者向けに行政発表を要約する編集者です。
出力は必ず日本語の箇条書き3行以内で、以下の観点を含めてください:
- 対象（誰が対象か / 対象事業者）
- 期限（いつまでに / 申請・報告の締切）
- 金額や報告内容（いくら貰えるか / 何を提出するか）
確証が持てない項目は「不明」と明記。推測しないこと。本文がタイトルのみで判断できない場合は「詳細は出典を参照してください」と1行添える。`;

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
