import fs from 'node:fs';
import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: 'auth/note-state.json',
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    viewport: { width: 1280, height: 800 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  // Visit note dashboard first and find the actual "create new post" link
  await page.goto('https://note.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  console.log('note.com URL:', page.url());
  await page.waitForTimeout(3000);

  // Find links that look like "create post"
  const createLinks = await page.evaluate(() => {
    return [...document.querySelectorAll('a[href]')]
      .map((a) => ({ href: (a as HTMLAnchorElement).href, text: (a.textContent || '').trim().slice(0, 30), aria: a.getAttribute('aria-label') || '' }))
      .filter((a) => /new|create|投稿|書く|下書き|editor/i.test(a.href + a.text + a.aria))
      .slice(0, 10);
  });
  console.log('Candidate "create post" links on dashboard:');
  createLinks.forEach((l) => console.log('  ', JSON.stringify(l)));

  // Try visiting editor URL
  await page.goto('https://editor.note.com/new', { waitUntil: 'domcontentloaded', timeout: 30000 });
  console.log('editor URL:', page.url());

  // Wait up to 20s for any textarea / contenteditable to appear
  let found = false;
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(1000);
    const count = await page.evaluate(() => {
      return document.querySelectorAll('input, textarea, [contenteditable]').length;
    });
    if (count > 0) {
      console.log(`Found ${count} input-ish elements after ${i + 1}s`);
      found = true;
      break;
    }
  }
  if (!found) console.log('Timed out waiting for editor to load');

  await page.screenshot({ path: 'drafts/note-editor-debug.png', fullPage: true });
  const html = await page.content();
  fs.writeFileSync('drafts/note-editor-debug.html', html);
  console.log('html size:', html.length);

  // Final snapshot of inputs/buttons
  const info = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input, textarea, [contenteditable]')].slice(0, 30).map((el) => ({
      tag: el.tagName.toLowerCase(),
      type: (el as HTMLInputElement).type || undefined,
      placeholder: (el as HTMLInputElement).placeholder || undefined,
      ariaLabel: el.getAttribute('aria-label') || undefined,
      contenteditable: el.getAttribute('contenteditable') || undefined,
      role: el.getAttribute('role') || undefined,
      dataTestid: el.getAttribute('data-testid') || undefined,
      id: el.id || undefined,
    }));
    const buttons = [...document.querySelectorAll('button')].slice(0, 30).map((b) => ({
      text: (b.textContent || '').trim().slice(0, 30),
      ariaLabel: b.getAttribute('aria-label') || undefined,
      dataTestid: b.getAttribute('data-testid') || undefined,
    }));
    return { inputs, buttons };
  });
  fs.writeFileSync('drafts/note-editor-debug.json', JSON.stringify(info, null, 2));

  console.log('\nInputs:');
  info.inputs.forEach((i, idx) => console.log(`  [${idx}]`, JSON.stringify(i)));
  console.log('\nButtons:');
  info.buttons.slice(0, 10).forEach((b, idx) => console.log(`  [${idx}]`, JSON.stringify(b)));

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
