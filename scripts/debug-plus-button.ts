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
  await page.locator('textarea[placeholder="記事タイトル"]').fill('debug plus');
  const body = page.locator('[contenteditable="true"][role="textbox"]').first();
  await body.click();

  // Paste some text, then Enter to create empty paragraph
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/plain', 'Paragraph one.');
    const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    (document.querySelector('[contenteditable="true"][role="textbox"]') as HTMLElement)?.dispatchEvent(ev);
  });
  await page.waitForTimeout(400);
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);

  // Describe all visible buttons near the body
  const all = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')];
    return buttons.map((b, idx) => {
      const rect = b.getBoundingClientRect();
      return {
        idx,
        text: (b.textContent || '').trim().slice(0, 30),
        aria: b.getAttribute('aria-label') || undefined,
        classes: b.className.slice(0, 80),
        visible: rect.width > 0 && rect.height > 0,
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      };
    }).filter((b) => b.visible);
  });
  console.log('All visible buttons:');
  all.forEach((b) => console.log('  ', JSON.stringify(b)));

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
