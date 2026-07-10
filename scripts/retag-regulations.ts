// One-off backfill: scan existing articles (title + ai_summary) with the
// regulation keyword dictionary and merge the matched tags ('法規制' + the
// specific regulation names) into news_articles.tags. Safe to re-run.
//
// Usage: npx tsx scripts/retag-regulations.ts [--dry-run]
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { extractRegulationTags } from '../src/lib/scrapers/common';
import type { Database } from '../src/lib/database.types';

function loadDotenv(file = '.env.local') {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

loadDotenv();
const DRY_RUN = process.argv.includes('--dry-run');
const BATCH = 500;

async function main() {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  let offset = 0;
  let updated = 0;
  let scanned = 0;

  for (;;) {
    const { data, error } = await supabase
      .from('news_articles')
      .select('id, title, ai_summary, tags')
      .order('created_at', { ascending: true })
      .range(offset, offset + BATCH - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;

    type Row = { id: string; title: string; ai_summary: string | null; tags: string[] };
    for (const row of data as Row[]) {
      scanned += 1;
      const regTags = extractRegulationTags(`${row.title}\n${row.ai_summary ?? ''}`);
      if (regTags.length === 0) continue;
      const merged = [...new Set([...(row.tags ?? []), ...regTags])];
      if (merged.length === (row.tags ?? []).length) continue;

      console.log(`+ ${regTags.filter((t) => t !== '法規制').join(',') || '法規制'} ← ${row.title.slice(0, 60)}`);
      if (DRY_RUN) { updated += 1; continue; }
      const { error: updErr } = await supabase
        .from('news_articles')
        .update({ tags: merged } as never)
        .eq('id', row.id);
      if (updErr) console.error(`  ✗ ${row.id}: ${updErr.message}`);
      else updated += 1;
    }

    offset += BATCH;
  }

  console.log(`\n✅ scanned=${scanned} tagged=${updated}${DRY_RUN ? ' (dry-run)' : ''}`);
}

main().catch((e) => {
  console.error('[retag-regulations] FATAL:', e);
  process.exit(1);
});
