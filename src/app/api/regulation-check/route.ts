import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase';
import { embedTexts } from '@/lib/ai/embeddings';
import { REGULATION_TAG } from '@/lib/scrapers/common';
import type { MatchedArticle } from '@/lib/database.types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_INPUT_CHARS = 40;
const RETRIEVE_COUNT = 30;
const CONTEXT_ARTICLES = 8;

// Best-effort per-IP rate limit. In-memory, so each serverless instance
// counts separately — a deterrent, not a hard guarantee.
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (list.length >= RATE_LIMIT) return true;
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return false;
}

const SYSTEM_PROMPT = `あなたは鹿児島県の中小企業の実務担当者向けに、サーキュラーエコノミー関連の法規制を案内するアドバイザーです。入力された製品・部品・素材名について、関係しうる法規制と実務準備を簡潔に整理してください。

出力形式（GitHub Flavored Markdown）:
1. 冒頭1〜2行で「この製品に最も影響が大きい規制は何か」を要約
2. テーブル: | 規制 | 地域 | 求められること | 時期 |（関係する規制のみ、3〜6行程度）
3. 「### いま準備できること」として実務チェックリストを箇条書き3〜6項目（例: データ整備、サプライヤーへの確認、公式情報の購読）

守ること:
- 参考記事に根拠がある内容を優先し、記事にない一般知識で補う場合は施行時期など不確かな数値を断定しない
- 対象外と思われる規制は無理に含めない。入力が製品・部品・素材名として解釈できない場合は、その旨を短く伝えて例を示す
- 全体で600字程度まで。法的助言ではなく情報整理であることを踏まえ、断定を避ける`;

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'AI機能が未設定です' }, { status: 503 });

  const ip = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim();
  if (rateLimited(ip)) {
    return NextResponse.json({ error: '利用回数の上限に達しました。1時間ほどおいて再度お試しください' }, { status: 429 });
  }

  let product: string;
  try {
    const body = (await req.json()) as { product?: string };
    product = (body.product ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'expected JSON body { product }' }, { status: 400 });
  }
  if (product.length < 2 || product.length > MAX_INPUT_CHARS) {
    return NextResponse.json({ error: `製品・部品名は2〜${MAX_INPUT_CHARS}文字で入力してください` }, { status: 400 });
  }

  // Retrieve regulation articles semantically close to the product.
  let related: MatchedArticle[] = [];
  try {
    const [vector] = await embedTexts([`${product} に関係する法規制・義務・報告要件`]);
    const { data, error } = await supabaseAdmin().rpc('match_news_articles', {
      query_embedding: JSON.stringify(vector),
      match_count: RETRIEVE_COUNT,
    });
    if (error) throw new Error(error.message);
    related = ((data ?? []) as MatchedArticle[])
      .filter((a) => a.tags?.includes(REGULATION_TAG))
      .slice(0, CONTEXT_ARTICLES);
  } catch (e) {
    console.error('[regulation-check] retrieval failed:', (e as Error).message);
    // Continue without grounding articles — the model is told to hedge.
  }

  const articleContext = related.length
    ? related
        .map(
          (a, i) =>
            `[記事${i + 1}] ${a.title}（${a.source_name}, ${a.published_at?.slice(0, 10) ?? '日付不明'}）\n${(a.ai_summary ?? '').slice(0, 600)}`,
        )
        .join('\n\n')
    : '（関連する収集記事なし — 一般知識のみで簡潔に回答し、その旨を明記すること）';

  const client = new Anthropic({ apiKey });
  let answer: string;
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      temperature: 0.2,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `製品・部品名: ${product}\n\n参考記事（当サイトが収集した法規制関連記事）:\n${articleContext}`,
        },
      ],
    });
    answer = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
  } catch (e) {
    return NextResponse.json({ error: `AI応答の生成に失敗しました: ${(e as Error).message}` }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    product,
    answer,
    sources: related.map((a) => ({
      id: a.id,
      title: a.title,
      source_name: a.source_name,
      published_at: a.published_at,
    })),
  });
}
