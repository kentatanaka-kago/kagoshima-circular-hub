// One-time backfill of pgvector embeddings for existing articles.
// The daily aggregate also embeds up to 200 rows/run; this script just
// finishes the whole backlog in one go.
//
// Usage: npx tsx scripts/backfill-embeddings.ts
// Requires .env.local with NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { embedTexts, embeddingInput } from '../src/lib/ai/embeddings';
import type { Database } from '../src/lib/database.types';

function loadDotenv(file = '.env.local') {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

loadDotenv();

const API_BATCH = 50;

async function main() {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  let totalOk = 0;
  let totalFailed = 0;

  for (;;) {
    const { data, error } = await supabase
      .from('news_articles')
      .select('id, title, source_name, tags, ai_summary, raw_excerpt')
      .is('embedding', null)
      .or('ai_summary.not.is.null,raw_excerpt.not.is.null')
      .limit(API_BATCH);
    if (error) throw error;
    if (!data || data.length === 0) break;

    type Row = {
      id: string; title: string; source_name: string;
      tags: string[]; ai_summary: string | null; raw_excerpt: string | null;
    };
    const rows = data as Row[];
    const vectors = await embedTexts(rows.map(embeddingInput));

    for (let i = 0; i < rows.length; i++) {
      const { error: updErr } = await supabase
        .from('news_articles')
        .update({ embedding: JSON.stringify(vectors[i]) } as never)
        .eq('id', rows[i].id);
      if (updErr) {
        totalFailed += 1;
        console.error(`  ✗ ${rows[i].id}: ${updErr.message}`);
      } else {
        totalOk += 1;
      }
    }
    console.log(`embedded ${totalOk} (failed ${totalFailed}) …`);
  }

  console.log(`\n✅ Done. embedded=${totalOk} failed=${totalFailed}`);
}

main().catch((e) => {
  console.error('[backfill-embeddings] FATAL:', e);
  process.exit(1);
});
