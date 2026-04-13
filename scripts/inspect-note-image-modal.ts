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
  await page.goto('https://editor.note.com/new', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.locator('textarea[placeholder="記事タイトル"]').waitFor({ timeout: 30_000 });

  // Focus the body so the "add image" button is meaningful
  await page.locator('[contenteditable="true"][role="textbox"]').first().click();
  await page.waitForTimeout(500);

  // Click 画像を追加
  await page.getByRole('button', { name: '画像を追加' }).click();
  await page.waitForTimeout(2500);

  await page.screenshot({ path: 'drafts/note-image-modal.png', fullPage: true });

  const info = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')].slice(0, 40).map((b) => ({
      text: (b.textContent || '').trim().slice(0, 30),
      ariaLabel: b.getAttribute('aria-label') || undefined,
      dataTestid: b.getAttribute('data-testid') || undefined,
    }));
    const inputs = [...document.querySelectorAll('input')].map((i) => ({
      type: i.type,
      name: i.name,
      accept: i.accept,
      id: i.id,
      hidden: i.hidden,
      visible: i.offsetWidth > 0 && i.offsetHeight > 0,
    }));
    const dialogs = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')].map((d) => ({
      text: (d.textContent || '').trim().slice(0, 200),
      role: d.getAttribute('role'),
      ariaLabel: d.getAttribute('aria-label'),
    }));
    return { buttons, inputs, dialogs };
  });
  fs.writeFileSync('drafts/note-image-modal.json', JSON.stringify(info, null, 2));

  console.log('Dialogs:');
  info.dialogs.forEach((d, i) => console.log(`  [${i}]`, JSON.stringify(d).slice(0, 300)));
  console.log('\nFile inputs:');
  info.inputs.filter((i) => i.type === 'file').forEach((i, idx) => console.log(`  [${idx}]`, JSON.stringify(i)));
  console.log('\nButtons (first 25):');
  info.buttons.slice(0, 25).forEach((b, idx) => console.log(`  [${idx}]`, JSON.stringify(b)));

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
