import fs from 'node:fs';
import { chromium } from 'playwright';

async function main() {
  const png = fs.readFileSync('drafts/sample-cover.png');

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
  await page.locator('textarea[placeholder="記事タイトル"]').fill('cover-only test');
  const body = page.locator('[contenteditable="true"][role="textbox"]').first();
  await body.click();

  // Insert cover
  await page.getByRole('button', { name: '画像を追加' }).click();
  const uploadMenuItem = page.locator('button').filter({ hasText: /画像をアップロード/ }).first();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    uploadMenuItem.click(),
  ]);
  await chooser.setFiles({ name: 'cover.png', mimeType: 'image/png', buffer: png });

  const cropDialog = page.locator('[role="dialog"]').filter({ hasText: /画像のサイズの変更/ });
  await cropDialog.waitFor({ timeout: 20_000 });
  await cropDialog.getByRole('button', { name: '保存' }).click();
  await cropDialog.waitFor({ state: 'hidden' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'drafts/debug-cover-after-upload.png', fullPage: true });
  console.log('screenshot 1: after upload (before save)');
  console.log('img count:', await page.locator('img').count());

  // Directly save as draft WITHOUT pasting any body text
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: '下書き保存' }).click();
  try {
    await page.waitForURL(/\/(notes|n)\/[A-Za-z0-9_-]+/, { timeout: 15_000 });
  } catch {}
  const url = page.url();
  console.log('draft URL:', url);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'drafts/debug-cover-after-save.png', fullPage: true });
  console.log('img count after save:', await page.locator('img').count());

  // Navigate to edit URL and check images
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const imgs = await page.evaluate(() => {
    return [...document.querySelectorAll('img')].map(i => ({
      src: i.src.slice(0, 100),
      w: i.naturalWidth,
    }));
  });
  console.log('Images on reopened draft:', imgs.length);
  imgs.forEach(i => console.log(' ', JSON.stringify(i)));

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
