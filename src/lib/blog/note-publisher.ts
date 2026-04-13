// Posts a generated blog post to note.com as a DRAFT.
// Body images are intentionally not inserted — cover only.
import fs from 'node:fs';
import { chromium, type Page } from 'playwright';

const STATE_PATH = 'auth/note-state.json';
const EDITOR_URL = 'https://editor.note.com/new';

export interface PublishInput {
  title: string;
  body: string;
  hashtags: string[];
  coverPng?: Buffer;
}

export interface PublishResult {
  draftUrl: string;
  screenshotPath?: string;
}

export async function publishToNoteDraft(input: PublishInput): Promise<PublishResult> {
  if (!fs.existsSync(STATE_PATH)) {
    throw new Error(`Auth state not found at ${STATE_PATH}. Run "npx tsx scripts/note-login.ts" first.`);
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      storageState: STATE_PATH,
      locale: 'ja-JP',
      timezoneId: 'Asia/Tokyo',
      viewport: { width: 1280, height: 800 },
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    if (page.url().includes('/login')) {
      throw new Error('Note session expired — rerun scripts/note-login.ts');
    }

    const titleLocator = page.locator('textarea[placeholder="記事タイトル"]');
    await titleLocator.waitFor({ timeout: 30_000 });
    await titleLocator.click();
    await titleLocator.fill(input.title);

    const bodyLocator = page.locator('[contenteditable="true"][role="textbox"]').first();
    await bodyLocator.click();

    // Cover image: inserted first so note uses it as the thumbnail.
    if (input.coverPng) {
      try {
        console.log('  [publisher] inserting cover image…');
        await insertCoverImage(page, input.coverPng);
        console.log('  [publisher] cover image inserted');
        await bodyLocator.click();
        await page.keyboard.press('End');
        await page.keyboard.press('Enter');
      } catch (e) {
        console.error('  [publisher] cover image FAILED:', (e as Error).message);
        await page.screenshot({ path: `drafts/cover-fail-${Date.now()}.png`, fullPage: false });
      }
    }

    // Body + hashtags as a single paste.
    await pastePlainText(page, input.body + '\n\n' + input.hashtags.join(' '));

    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: '下書き保存' }).click();

    let draftUrl = page.url();
    try {
      await page.waitForURL(/\/(notes|n)\/[A-Za-z0-9_-]+/, { timeout: 15_000 });
      draftUrl = page.url();
    } catch {
      // stay on current URL
    }

    const screenshotPath = 'drafts/last-publish.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    return { draftUrl, screenshotPath };
  } finally {
    await browser.close();
  }
}

// Cover image upload — uses the toolbar "画像を追加" button (aria-label).
// This path goes through the "画像のサイズの変更" crop dialog and produces
// the article thumbnail, which is exactly the flow we want for the cover.
async function insertCoverImage(page: Page, png: Buffer) {
  await page.getByRole('button', { name: '画像を追加' }).click();

  const uploadMenuItem = page.locator('button').filter({ hasText: /画像をアップロード/ }).first();
  await uploadMenuItem.waitFor({ timeout: 10_000 });

  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 10_000 }),
    uploadMenuItem.click(),
  ]);
  await chooser.setFiles({ name: 'cover.png', mimeType: 'image/png', buffer: png });

  const cropDialog = page.locator('[role="dialog"]').filter({ hasText: /画像のサイズの変更/ });
  await cropDialog.waitFor({ timeout: 20_000 });
  await cropDialog.getByRole('button', { name: '保存' }).click();
  await cropDialog.waitFor({ state: 'hidden', timeout: 30_000 });

  // The crop dialog closes instantly but the actual upload to note's CDN
  // takes several more seconds. If we save the draft before then, the
  // placeholder never resolves and the saved post has no image. Wait for
  // an <img> with note's asset host to be present.
  await page.waitForFunction(
    () => !!document.querySelector('img[src*="st-note.com"], img[src*="assets.st-note"]'),
    null,
    { timeout: 60_000 },
  );
  await page.waitForTimeout(800);
  await page.keyboard.press('Escape');
}

async function pastePlainText(page: Page, text: string) {
  await page.evaluate(async (t) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', t);
    const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    const target = document.querySelector('[contenteditable="true"][role="textbox"]') as HTMLElement | null;
    target?.focus();
    target?.dispatchEvent(ev);
  }, text);
}
