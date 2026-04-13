import { GoogleGenAI } from '@google/genai';

export const SUMMARIZER_MODEL = 'gemini-2.5-flash';

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
  return new GoogleGenAI({ apiKey });
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
  const ai = getClient();
  const userPrompt = [
    `出典: ${input.source_name}`,
    `タイトル: ${input.title}`,
    input.excerpt ? `抜粋:\n${input.excerpt.slice(0, 1200)}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const res = await withRetry(() =>
    ai.models.generateContent({
      model: SUMMARIZER_MODEL,
      contents: userPrompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.2,
        maxOutputTokens: 400,
      },
    }),
  );

  const text = (res.text ?? '').trim();
  if (!text) throw new Error('empty summary from Gemini');
  return { summary: text, model: SUMMARIZER_MODEL };
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      const msg = e instanceof Error ? e.message : String(e);
      // Retry only on transient upstream conditions; fail fast on 4xx client errors other than 429.
      const retriable = /\b(503|502|504|UNAVAILABLE)\b/i.test(msg) || /\b(429|RESOURCE_EXHAUSTED)\b/i.test(msg);
      if (!retriable || attempt === maxAttempts) throw e;
      const backoff = Math.min(8000, 500 * 2 ** (attempt - 1)) + Math.random() * 300;
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastError;
}
