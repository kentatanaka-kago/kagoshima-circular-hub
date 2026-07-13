import { NextResponse } from 'next/server';
import { searchCompanies } from '@/lib/gbizinfo';

export const runtime = 'nodejs';
export const maxDuration = 30;

// gBizINFO を叩くプロキシ。入力補完（デバウンス済み）から呼ばれるため、
// クエリ単位のメモリキャッシュと IP 単位のレート制限で外部 API を保護する。
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX = 500;
const cache = new Map<string, { at: number; body: unknown }>();

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60 * 1000;
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

export async function GET(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim();
  if (rateLimited(ip)) {
    return NextResponse.json({ error: '検索回数の上限に達しました。少しおいて再度お試しください' }, { status: 429 });
  }

  const q = (new URL(req.url).searchParams.get('q') ?? '').trim();
  if (q.length < 2 || q.length > 60) {
    return NextResponse.json({ error: '企業名は2〜60文字で入力してください' }, { status: 400 });
  }

  const cached = cache.get(q);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json(cached.body);
  }

  try {
    const companies = await searchCompanies(q);
    const body = { ok: true, companies };
    if (cache.size > CACHE_MAX) cache.clear();
    cache.set(q, { at: Date.now(), body });
    return NextResponse.json(body);
  } catch (e) {
    const status = (e as { status?: number }).status === 503 ? 503 : 502;
    const msg =
      status === 503
        ? '企業検索が未設定です（GBIZINFO_API_TOKEN）'
        : '企業情報の取得に失敗しました。しばらくして再度お試しください';
    console.error('[company-search]', (e as Error).message);
    return NextResponse.json({ error: msg }, { status });
  }
}
