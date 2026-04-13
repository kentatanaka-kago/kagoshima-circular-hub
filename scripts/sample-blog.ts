import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { generateBlogPost } from '../src/lib/blog/generate';
import type { Database, NewsArticle } from '../src/lib/database.types';

function loadDotenv(file = '.env.local') {
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

loadDotenv();

async function main() {
  const slug = process.argv[2]; // optional: match title substring
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  let q = supabase
    .from('news_articles')
    .select('*')
    .not('ai_summary', 'is', null)
    .not('raw_excerpt', 'is', null)
    .order('published_at', { ascending: false, nullsFirst: false });
  if (slug) q = q.ilike('title', `%${slug}%`);
  const { data, error } = await q.limit(1);
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('No article found');

  const article = data[0] as NewsArticle;
  console.log('Source article:');
  console.log('  TITLE:', article.title);
  console.log('  SOURCE:', article.source_name);
  console.log('  URL:', article.source_url);
  console.log('');
  console.log('Generating blog post…');

  const t0 = Date.now();
  const post = await generateBlogPost(article);
  console.log(`Done in ${Date.now() - t0} ms, model=${post.model}`);
  console.log('Hashtags:', post.hashtags);
  console.log('');

  const outDir = 'drafts';
  fs.mkdirSync(outDir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const filename = `${date}_${article.id.slice(0, 8)}.md`;
  const outPath = path.join(outDir, filename);

  const frontmatter = [
    '---',
    `title: "${post.title.replace(/"/g, '\\"')}"`,
    `source: "${article.source_name}"`,
    `source_url: "${article.source_url}"`,
    `article_id: "${article.id}"`,
    `generated_at: "${new Date().toISOString()}"`,
    `model: "${post.model}"`,
    `hashtags: [${post.hashtags.map((t) => `"${t}"`).join(', ')}]`,
    '---',
    '',
  ].join('\n');

  fs.writeFileSync(outPath, frontmatter + post.body + '\n');
  console.log(`\nSaved → ${outPath}\n`);
  console.log('----- BLOG POST -----');
  console.log(`# ${post.title}\n`);
  console.log(post.body);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
