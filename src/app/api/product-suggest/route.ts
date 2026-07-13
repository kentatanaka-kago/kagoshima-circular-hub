import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { fetchCompanyProfile, profileToText } from '@/lib/gbizinfo';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = 'claude-haiku-4-5-20251001';
// Haiku 4.5 は基本版の web_search のみ対応（_20260209 系は Opus/Sonnet 4.6+）。
const WEB_SEARCH_TOOL = { type: 'web_search_20250305' as const, name: 'web_search' as const, max_uses: 3 };

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

const SYSTEM_PROMPT = `あなたは企業の公表データから、その企業が製造・販売・取り扱いしていそうな製品・部品・素材を推定するアシスタントです。推定した製品名は、サーキュラーエコノミー関連の法規制チェック（ESPR・電池規則・プラ新法など）の入力に使われます。

出力: JSON配列のみを返す。説明文・コードフェンス禁止。
- 要素は製品・部品・素材名の文字列（2〜20文字、日本語）
- 3〜6件。規制チェックの入力として意味のある具体性で（例:「リチウムイオン電池」「プラスチック容器」「鉄スクラップ」。「製品」「サービス」のような抽象語は禁止）
- 公表データに根拠のあるものを優先し、業種からの一般的な推定は後ろに置く
- 推定できない場合は空配列 [] を返す`;

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'AI機能が未設定です' }, { status: 503 });

  const ip = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim();
  if (rateLimited(ip)) {
    return NextResponse.json({ error: '利用回数の上限に達しました。1時間ほどおいて再度お試しください' }, { status: 429 });
  }

  let corporateNumber: string;
  let useWebSearch: boolean;
  try {
    const body = (await req.json()) as { corporate_number?: string; use_web_search?: boolean };
    corporateNumber = (body.corporate_number ?? '').trim();
    useWebSearch = body.use_web_search === true;
  } catch {
    return NextResponse.json({ error: 'expected JSON body { corporate_number }' }, { status: 400 });
  }
  if (!/^\d{13}$/.test(corporateNumber)) {
    return NextResponse.json({ error: '法人番号が不正です' }, { status: 400 });
  }

  let profile;
  try {
    profile = await fetchCompanyProfile(corporateNumber);
  } catch (e) {
    console.error('[product-suggest] profile fetch failed:', (e as Error).message);
    const status = (e as { status?: number }).status === 503 ? 503 : 502;
    return NextResponse.json({ error: '企業情報の取得に失敗しました' }, { status });
  }
  if (!profile) return NextResponse.json({ error: '企業が見つかりませんでした' }, { status: 404 });

  const client = new Anthropic({ apiKey });
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      temperature: 0.2,
      system: SYSTEM_PROMPT,
      tools: useWebSearch ? [WEB_SEARCH_TOOL] : undefined,
      messages: [
        {
          role: 'user',
          content: `以下の企業が扱っていそうな製品・部品・素材を推定してください。${
            useWebSearch ? '公表データが薄い場合は企業名でWeb検索し、公式サイトの事業内容も参考にしてください。' : ''
          }\n\n${profileToText(profile)}`,
        },
      ],
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    const products = parseProducts(text);
    return NextResponse.json({
      ok: true,
      company: { corporate_number: profile.corporate_number, name: profile.name, location: profile.location },
      products,
      used_web_search: useWebSearch,
    });
  } catch (e) {
    return NextResponse.json({ error: `AI応答の生成に失敗しました: ${(e as Error).message}` }, { status: 502 });
  }
}

// コードフェンスや前置きが混ざっても配列部分だけ拾う寛容パース。
function parseProducts(text: string): string[] {
  const match = text.match(/\[[\s\S]*?\]/);
  if (!match) return [];
  try {
    const arr = JSON.parse(match[0]) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((v): v is string => typeof v === 'string')
      .map((v) => v.trim())
      .filter((v) => v.length >= 2 && v.length <= 40)
      .slice(0, 6);
  } catch {
    return [];
  }
}
