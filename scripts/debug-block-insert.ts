import fs from 'node:fs';
import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: 'auth/note-state.json',
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    viewport: { width: 1280, height: 800 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();
  await page.goto('https://editor.note.com/new', { waitUntil: 'domcontentloaded' });
  await page.locator('textarea[placeholder="記事タイトル"]').waitFor();
  await page.locator('textarea[placeholder="記事タイトル"]').fill('debug block insert');

  const body = page.locator('[contenteditable="true"][role="textbox"]').first();
  await body.click();

  async function snapshotButtons(tag: string) {
    const info = await page.evaluate(() => {
      return [...document.querySelectorAll('button')].map((b) => ({
        text: (b.textContent || '').trim().slice(0, 30),
        aria: b.getAttribute('aria-label') || undefined,
      })).filter((b) => b.text || b.aria);
    });
    console.log(`\n== ${tag} ==`);
    info.slice(0, 25).forEach((b, i) => console.log(`  [${i}]`, JSON.stringify(b)));
  }

  await snapshotButtons('after focus body (empty)');

  // Paste some text
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/plain', 'Hello this is a paragraph.\n\n');
    const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    (document.querySelector('[contenteditable="true"][role="textbox"]') as HTMLElement)?.dispatchEvent(ev);
  });
  await page.waitForTimeout(500);
  await snapshotButtons('after first paste');

  // Press Enter to create empty paragraph
  await body.click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  await snapshotButtons('after Enter (empty paragraph)');

  await page.screenshot({ path: 'drafts/debug-block-insert.png', fullPage: true });
  console.log('\nScreenshot saved.');
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
