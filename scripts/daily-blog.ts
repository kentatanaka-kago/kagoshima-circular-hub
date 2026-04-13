// Daily blog pipeline: pick the freshest high-relevance article, generate
// a Claude-written explainer + a Nano-Banana cover, save a local Markdown
// draft, push a DRAFT to note.com, record the URL back to Supabase.
//
// Run manually:      npx tsx scripts/daily-blog.ts
// Run with launchd:  see Library/LaunchAgents/com.kagoshima-circular-hub.blog.plist
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { blocksToMarkdown, generateBlogPost } from '../src/lib/blog/generate';
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

const DRY_RUN = process.argv.includes('--dry-run') || process.env.BLOG_DRY_RUN === '1';

async function main() {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Pick the freshest not-yet-blogged article with AI summary + body.
  // Prefer 補助金 / 公募 / 採択 items since those have concrete value to readers.
  const { data, error } = await supabase
    .from('news_articles')
    .select('*')
    .is('note_draft_url', null)
    .not('ai_summary', 'is', null)
    .not('raw_excerpt', 'is', null)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(20);
  if (error) throw error;
  if (!data || data.length === 0) {
    console.log('No unblogged articles found. Nothing to do.');
    return;
  }

  const article = pickBest(data as NewsArticle[]);
  console.log(`Selected article: ${article.title.slice(0, 80)}`);
  console.log(`Source: ${article.source_name} | ${article.source_url}`);

  console.log('\n1/3 Generating blog post (Claude Sonnet 4.5)…');
  const post = await generateBlogPost(article);
  const figureCount = post.blocks.filter((b) => b.type !== 'markdown').length;
  console.log(`  ✓ title: ${post.title.slice(0, 80)}`);
  console.log(`  ✓ blocks: ${post.blocks.length} (markdown + ${figureCount} figure(s))`);
  console.log(`  ✓ hashtags: ${post.hashtags.join(' ')}`);

  console.log('\n2/3 Generating cover image (Nano Banana)…');
  const { pngBuffer, model: coverModel } = await generateCoverImage({
    title: post.title,
    tags: article.tags,
    summary: article.ai_summary,
  });
  console.log(`  ✓ ${pngBuffer.length.toLocaleString()} bytes, model ${coverModel}`);

  // Save locally
  const stamp = new Date().toISOString().slice(0, 10);
  const dir = path.join('drafts', `${stamp}_${article.id.slice(0, 8)}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'post.md'), `# ${post.title}\n\n${blocksToMarkdown(post.blocks)}\n\n${post.hashtags.join(' ')}\n`);
  fs.writeFileSync(path.join(dir, 'cover.png'), pngBuffer);
  fs.writeFileSync(
    path.join(dir, 'meta.json'),
    JSON.stringify({ article_id: article.id, source_url: article.source_url, post }, null, 2),
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
      blocks: post.blocks,
      hashtags: post.hashtags,
      coverPng: pngBuffer,
    });
    draftUrl = result.draftUrl;
    console.log(`  ✓ draft URL: ${draftUrl}`);
    console.log(`  ✓ figures: ${result.figureStats.rendered}/${result.figureStats.requested} rendered`);
    if (result.screenshotPath) console.log(`  ✓ screenshot: ${result.screenshotPath}`);
  } catch (e) {
    console.error(`  ✗ note upload failed: ${(e as Error).message}`);
    // Still record that we attempted so we don't retry the same article tomorrow
    await supabase
      .from('news_articles')
      .update({
        blog_title: post.title,
        blog_body: blocksToMarkdown(post.blocks),
      } as never)
      .eq('id', article.id);
    throw e;
  }

  console.log('\nPersisting state to Supabase…');
  await supabase
    .from('news_articles')
    .update({
      blog_title: post.title,
      blog_body: blocksToMarkdown(post.blocks),
      note_draft_url: draftUrl,
    } as never)
    .eq('id', article.id);
  console.log('  ✓ note_draft_url written');

  console.log('\n✅ Done. Review the draft on note.com → 手動で公開ボタンを押してください。');
  console.log(`   ${draftUrl}`);
}

function pickBest(articles: NewsArticle[]): NewsArticle {
  const priorityTags = new Set(['補助金', 'サーキュラー', '脱炭素']);
  // highest priority-tag count, then newest published_at
  return [...articles].sort((a, b) => {
    const pa = a.tags.filter((t) => priorityTags.has(t)).length;
    const pb = b.tags.filter((t) => priorityTags.has(t)).length;
    if (pb !== pa) return pb - pa;
    const da = a.published_at ? new Date(a.published_at).getTime() : 0;
    const db = b.published_at ? new Date(b.published_at).getTime() : 0;
    return db - da;
  })[0];
}

main().catch((e) => {
  console.error('[daily-blog] FATAL:', e);
  process.exit(1);
});
