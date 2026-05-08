// Ad-hoc: generate a Note draft for a specific news_articles.id, and append
// the kagoshima-circular-hub article URL at the end of the body.
//
// Usage: npx tsx scripts/_blog-by-id.ts <article-id> [--cover] [--dry-run]
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { generateBlogPost } from '../src/lib/blog/generate';
import { generateCoverImage } from '../src/lib/blog/cover-image';
import { publishToNoteDraft } from '../src/lib/blog/note-publisher';
import type { Database, NewsArticle } from '../src/lib/database.types';

function loadDotenv(file = '.env.local') {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

loadDotenv();

const HUB_BASE = 'https://kagoshima-circular-hub.vercel.app';
const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith('--'));
const DRY_RUN = args.includes('--dry-run') || process.env.BLOG_DRY_RUN === '1';
const COVER = args.includes('--cover') || process.env.BLOG_COVER === '1';

if (!id) {
  console.error('Usage: npx tsx scripts/_blog-by-id.ts <article-id> [--cover] [--dry-run]');
  process.exit(1);
}

async function main() {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data, error } = await supabase
    .from('news_articles')
    .select('*')
    .eq('id', id!)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`Article not found: ${id}`);
  const article = data as NewsArticle;
  console.log(`Selected article: ${article.title.slice(0, 80)}`);
  console.log(`Source: ${article.source_name} | ${article.source_url}`);
  if (article.note_draft_url) {
    console.warn(`  ⚠ already has note_draft_url: ${article.note_draft_url}`);
    console.warn('  proceeding to create a new draft anyway.');
  }

  console.log('\n1/3 Generating blog post (Claude)…');
  const post = await generateBlogPost(article);
  console.log(`  ✓ title: ${post.title.slice(0, 80)}`);
  console.log(`  ✓ body: ${post.body.length} chars`);
  console.log(`  ✓ hashtags: ${post.hashtags.join(' ')}`);

  const hubUrl = `${HUB_BASE}/news/${article.id}`;
  const bodyWithHub = `${post.body}\n\n---\n\n📎 鹿児島サーキュラーハブで詳細を見る:\n${hubUrl}\n`;

  let pngBuffer: Buffer | undefined;
  if (COVER) {
    console.log('\n2/3 Generating cover image (Nano Banana)…');
    const cover = await generateCoverImage({
      title: post.title,
      tags: article.tags,
      summary: article.ai_summary,
    });
    pngBuffer = cover.pngBuffer;
    console.log(`  ✓ ${pngBuffer.length.toLocaleString()} bytes, model ${cover.model}`);
  } else {
    console.log('\n2/3 Cover image skipped (default; pass --cover or BLOG_COVER=1 to enable)');
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const dir = path.join('drafts', `${stamp}_${article.id.slice(0, 8)}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'post.md'),
    `# ${post.title}\n\n${bodyWithHub}\n${post.hashtags.join(' ')}\n`,
  );
  if (pngBuffer) fs.writeFileSync(path.join(dir, 'cover.png'), pngBuffer);
  fs.writeFileSync(
    path.join(dir, 'meta.json'),
    JSON.stringify({ article_id: article.id, source_url: article.source_url, hub_url: hubUrl, post }, null, 2),
  );
  console.log(`  ✓ local drafts → ${dir}`);

  if (DRY_RUN) {
    console.log('\n[dry-run] Skipping note.com upload.');
    return;
  }

  console.log('\n3/3 Uploading draft to note.com (Playwright)…');
  let draftUrl = '';
  try {
    const result = await publishToNoteDraft({
      title: post.title,
      body: bodyWithHub,
      hashtags: post.hashtags,
      ...(pngBuffer ? { coverPng: pngBuffer } : {}),
    });
    draftUrl = result.draftUrl;
    console.log(`  ✓ draft URL: ${draftUrl}`);
    if (result.screenshotPath) console.log(`  ✓ screenshot: ${result.screenshotPath}`);
  } catch (e) {
    console.error(`  ✗ note upload failed: ${(e as Error).message}`);
    await supabase
      .from('news_articles')
      .update({ blog_title: post.title, blog_body: bodyWithHub } as never)
      .eq('id', article.id);
    throw e;
  }

  console.log('\nPersisting state to Supabase…');
  await supabase
    .from('news_articles')
    .update({
      blog_title: post.title,
      blog_body: bodyWithHub,
      note_draft_url: draftUrl,
    } as never)
    .eq('id', article.id);
  console.log('  ✓ note_draft_url written');

  console.log('\n✅ Done. Review the draft on note.com → 手動で公開ボタンを押してください。');
  console.log(`   ${draftUrl}`);
}

main().catch((e) => {
  console.error('[blog-by-id] FATAL:', e);
  process.exit(1);
});
