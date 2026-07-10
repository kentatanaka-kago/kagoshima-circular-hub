// OpenAI embeddings for vector search (pgvector). Plain fetch — no SDK
// dependency. text-embedding-3-small: 1536 dims, ~$0.02 / 1M tokens, strong
// Japanese performance.
const OPENAI_URL = 'https://api.openai.com/v1/embeddings';
export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMS = 1536;

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set');
  if (texts.length === 0) return [];

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new Error(`OpenAI embeddings failed: ${res.status} ${detail}`);
  }
  const json = (await res.json()) as { data: Array<{ index: number; embedding: number[] }> };
  const out: number[][] = new Array(texts.length);
  for (const d of json.data) out[d.index] = d.embedding;
  return out;
}

// One canonical input text per article, so search and indexing agree.
// ai_summary is preferred over raw_excerpt (denser, less boilerplate).
export function embeddingInput(a: {
  title: string;
  source_name: string;
  tags?: string[] | null;
  ai_summary?: string | null;
  raw_excerpt?: string | null;
}): string {
  const body = a.ai_summary ?? a.raw_excerpt ?? '';
  return [a.title, a.source_name, (a.tags ?? []).join(' '), body]
    .filter(Boolean)
    .join('\n')
    .slice(0, 6000);
}
