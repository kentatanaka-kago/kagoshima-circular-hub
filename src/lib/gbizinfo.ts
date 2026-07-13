// gBizINFO REST API v2 クライアント（経産省の法人情報 API）。
// 認証は X-hojinInfo-api-token ヘッダー。トークンは無料の利用申請で取得し、
// GBIZINFO_API_TOKEN に設定する。サーバー側専用 — クライアントに露出させない。
// 仕様: https://api.info.gbiz.go.jp/hojin/swagger-ui/index.html?urls.primaryName=v2
const BASE_URL = 'https://api.info.gbiz.go.jp/hojin/v2';

export interface CompanySearchHit {
  corporate_number: string;
  name: string;
  location: string | null;
}

export interface CompanyProfile extends CompanySearchHit {
  company_url: string | null;
  business_summary: string | null;
  business_items: string[];
  employee_number: number | null;
  capital_stock: number | null;
  date_of_establishment: string | null;
  certifications: string[];
  subsidies: string[];
  patents: string[];
}

class GbizError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function gbizFetch(path: string, params: Record<string, string>): Promise<unknown> {
  const token = process.env.GBIZINFO_API_TOKEN;
  if (!token) throw new GbizError('GBIZINFO_API_TOKEN not set', 503);
  const url = `${BASE_URL}${path}?${new URLSearchParams(params)}`;
  const res = await fetch(url, {
    headers: { 'X-hojinInfo-api-token': token, Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new GbizError(`gBizINFO ${path} failed: ${res.status}`, res.status);
  return res.json();
}

type HojinRow = Record<string, unknown>;

function rows(json: unknown): HojinRow[] {
  return ((json as Record<string, unknown>)?.['hojin-infos'] as HojinRow[]) ?? [];
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' ? v : null;
}

function titles(v: unknown, limit: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((item) => str((item as HojinRow)?.title))
    .filter((t): t is string => t !== null)
    .slice(0, limit);
}

export async function searchCompanies(name: string, limit = 8): Promise<CompanySearchHit[]> {
  const json = await gbizFetch('/hojin', { name, limit: String(limit), page: '1' });
  return rows(json)
    .map((r) => ({
      corporate_number: str(r.corporate_number) ?? '',
      name: str(r.name) ?? '',
      location: str(r.location),
    }))
    .filter((c) => c.corporate_number !== '' && c.name !== '');
}

// 法人基本情報＋公表データ（届出認定・補助金・特許のタイトル）をまとめて取得。
// 付随情報は欠けても致命的ではないので、失敗は握りつぶして空配列にする。
export async function fetchCompanyProfile(corporateNumber: string): Promise<CompanyProfile | null> {
  const basicJson = await gbizFetch(`/hojin/${corporateNumber}`, {});
  const basic = rows(basicJson)[0];
  if (!basic) return null;

  const [cert, subsidy, patent] = await Promise.all(
    (['certification', 'subsidy', 'patent'] as const).map((kind) =>
      gbizFetch(`/hojin/${corporateNumber}/${kind}`, {}).catch(() => null),
    ),
  );

  return {
    corporate_number: corporateNumber,
    name: str(basic.name) ?? '',
    location: str(basic.location),
    company_url: str(basic.company_url),
    business_summary: str(basic.business_summary),
    business_items: Array.isArray(basic.business_items)
      ? basic.business_items.map((b) => str(b)).filter((b): b is string => b !== null).slice(0, 10)
      : [],
    employee_number: num(basic.employee_number),
    capital_stock: num(basic.capital_stock),
    date_of_establishment: str(basic.date_of_establishment),
    certifications: titles(rows(cert)[0]?.certification, 10),
    subsidies: titles(rows(subsidy)[0]?.subsidy, 10),
    patents: titles(rows(patent)[0]?.patent, 10),
  };
}

// AI に渡す企業プロフィールのテキスト表現。
export function profileToText(p: CompanyProfile): string {
  const lines = [
    `企業名: ${p.name}（法人番号 ${p.corporate_number}）`,
    p.location && `所在地: ${p.location}`,
    p.company_url && `Webサイト: ${p.company_url}`,
    p.business_summary && `事業概要: ${p.business_summary}`,
    p.business_items.length > 0 && `事業内容: ${p.business_items.join('、')}`,
    p.employee_number !== null && `従業員数: ${p.employee_number}名`,
    p.capital_stock !== null && `資本金: ${p.capital_stock.toLocaleString()}円`,
    p.certifications.length > 0 && `届出・認定: ${p.certifications.join('、')}`,
    p.subsidies.length > 0 && `受給補助金: ${p.subsidies.join('、')}`,
    p.patents.length > 0 && `特許・商標: ${p.patents.join('、')}`,
  ];
  return lines.filter(Boolean).join('\n');
}
