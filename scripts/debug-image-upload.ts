import fs from 'node:fs';
import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: false });  // visible
  const context = await browser.newContext({
    storageState: 'auth/note-state.json',
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    viewport: { width: 1280, height: 800 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  await page.goto('https://editor.note.com/new', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.locator('textarea[placeholder="記事タイトル"]').waitFor({ timeout: 30_000 });
  await page.locator('textarea[placeholder="記事タイトル"]').fill('debug image upload test');

  const body = page.locator('[contenteditable="true"][role="textbox"]').first();
  await body.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'drafts/debug-01-before-menu.png', fullPage: true });

  console.log('Click 画像を追加');
  await page.getByRole('button', { name: '画像を追加' }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'drafts/debug-02-menu-open.png', fullPage: true });

  const uploadMenuItem = page.locator('button').filter({ hasText: /画像をアップロード/ }).first();
  console.log('Upload menu item exists?', await uploadMenuItem.count());

  // Try filechooser + click
  const png = fs.readFileSync('drafts/sample-cover.png');

  let chooserHandled = false;
  page.on('filechooser', async (chooser) => {
    console.log('filechooser event fired');
    await chooser.setFiles({ name: 'cover.png', mimeType: 'image/png', buffer: png });
    chooserHandled = true;
  });

  await uploadMenuItem.click();
  console.log('Clicked upload menu item');

  // Wait to see what happens
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(1000);
    const imgCount = await page.locator('[contenteditable="true"][role="textbox"] img').count();
    const bodyImgCount = await page.locator('img').count();
    console.log(`  ${i+1}s: editor-img=${imgCount}, all-img=${bodyImgCount}, filechooserFired=${chooserHandled}`);
  }

  await page.screenshot({ path: 'drafts/debug-03-after-upload.png', fullPage: true });
  console.log('URL:', page.url());

  // List modal / dialogs visible
  const dialogs = await page.evaluate(() => {
    return [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], .modal')]
      .filter((el) => (el as HTMLElement).offsetWidth > 0)
      .map((el) => ({
        role: el.getAttribute('role') || undefined,
        ariaLabel: el.getAttribute('aria-label') || undefined,
        text: (el.textContent || '').slice(0, 200),
      }));
  });
  console.log('Visible dialogs:', dialogs);

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
