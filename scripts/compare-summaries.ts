import 'dotenv/config';
import fs from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

// load .env.local manually
const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const SYSTEM = `あなたは鹿児島県のサーキュラーエコノミー実務担当者向けに行政発表を要約する編集者です。

出力ルール:
- プレーンテキストのみ。Markdown 記号（#, *, -, \`, など）や見出し記号は絶対に使わない。
- 下記の3行を必ずこの順序で出力する。各行は1行にまとめる。
  対象：誰が対象か（事業者種別・地域・規模など）
  期限：申請や報告の締切日（YYYY年MM月DD日 形式で）。複数ある場合は代表1つ。
  金額・内容：補助上限額や提出物。数値があれば原文から引用する。
- いずれの項目も原文抜粋に根拠がなければ「不明」とだけ書く。絶対に推測・創作・一般論で埋めない。
- 3行のあとに任意で1行だけ「詳細は出典を参照してください」を添えてよい。
- タイトルをそのまま出力しない。タイトルに含まれる語で対象や金額を推測しない。`;

const MODELS = [
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-5-20250929',
  'claude-sonnet-4-6',
  'claude-opus-4-6',
];

// Pick diverse sample articles
const SAMPLE_TITLES_LIKE = [
  '%省エネルギー家電%',
  '%食品ロス発生量等調査%',
  '%再エネ関連製品%',
  '%産業廃棄物処理業%',
];

async function summarize(model: string, title: string, source_name: string, excerpt: string | null) {
  const userPrompt = [
    `出典: ${source_name}`,
    `タイトル: ${title}`,
    excerpt ? `抜粋:\n${excerpt.slice(0, 1200)}` : null,
  ].filter(Boolean).join('\n');

  const t0 = Date.now();
  const res = await client.messages.create({
    model,
    max_tokens: 400,
    temperature: 0.2,
    system: SYSTEM,
    messages: [{ role: 'user', content: userPrompt }],
  });
  const elapsed = Date.now() - t0;
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  return { text, elapsed, usage: res.usage };
}

(async () => {
  for (const pattern of SAMPLE_TITLES_LIKE) {
    const { data } = await supabase
      .from('news_articles')
      .select('id, title, source_name, raw_excerpt')
      .ilike('title', pattern)
      .limit(1);
    if (!data || data.length === 0) { console.log(`(skip: ${pattern} not found)`); continue; }
    const a = data[0] as { title: string; source_name: string; raw_excerpt: string | null };

    console.log('\n' + '='.repeat(78));
    console.log('TITLE:', a.title.slice(0, 100));
    console.log('SOURCE:', a.source_name, '| body chars:', a.raw_excerpt?.length ?? 0);
    console.log('='.repeat(78));

    for (const model of MODELS) {
      try {
        const r = await summarize(model, a.title, a.source_name, a.raw_excerpt);
        const cost = estimateCost(model, r.usage.input_tokens, r.usage.output_tokens);
        console.log(`\n▼ ${model}  (${r.elapsed}ms, in:${r.usage.input_tokens} out:${r.usage.output_tokens}, ≈ $${cost.toFixed(5)})`);
        console.log(r.text);
      } catch (e) {
        console.log(`\n▼ ${model}  ERR:`, (e as Error).message.slice(0, 120));
      }
    }
  }
})();

// Anthropic public pricing as of 2026-02 (USD per MTok). Keep conservative.
function estimateCost(model: string, inTok: number, outTok: number): number {
  const P: Record<string, [number, number]> = {
    'claude-haiku-4-5-20251001':  [0.80, 4.00],
    'claude-sonnet-4-5-20250929': [3.00, 15.00],
    'claude-sonnet-4-6':          [3.00, 15.00],
    'claude-opus-4-6':            [15.00, 75.00],
  };
  const [pi, po] = P[model] ?? [0, 0];
  return (inTok * pi + outTok * po) / 1_000_000;
}
