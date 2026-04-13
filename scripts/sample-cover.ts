import fs from 'node:fs';
import { generateCoverImage } from '../src/lib/blog/cover-image';

function loadDotenv(file = '.env.local') {
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

loadDotenv();

async function main() {
  const title = process.argv[2] ?? '鹿児島市の省エネ家電補助金、4月スタート';
  const tags = (process.argv[3] ?? '省エネ,補助金,脱炭素').split(',');

  console.log('Generating cover image…');
  console.log('  title:', title);
  console.log('  tags:', tags);

  const t0 = Date.now();
  const { pngBuffer, model, prompt } = await generateCoverImage({ title, tags });
  console.log(`Done in ${Date.now() - t0} ms (${pngBuffer.length.toLocaleString()} bytes)`);
  console.log('Model:', model);

  fs.mkdirSync('drafts', { recursive: true });
  const outPath = 'drafts/sample-cover.png';
  fs.writeFileSync(outPath, pngBuffer);
  fs.writeFileSync('drafts/sample-cover-prompt.txt', prompt);
  console.log(`Saved → ${outPath}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
