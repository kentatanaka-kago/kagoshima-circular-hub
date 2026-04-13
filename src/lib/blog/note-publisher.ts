// Posts a generated blog post to note.com as a DRAFT (does NOT click the
// public-publish button). Uses Playwright with a pre-captured session
// state — run scripts/note-login.ts once to produce auth/note-state.json.
//
// Selectors verified against note.com editor (editor.note.com/new) 2026-04:
//   - Title: <textarea placeholder="記事タイトル">
//   - Body:  <div contenteditable="true" role="textbox">
//   - Save:  <button>下書き保存</button>
//   - Cover is a separate flow on the publish screen; for MVP we embed
//     the cover as the first body image instead.
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

    // Wait for the editor to hydrate
    const titleLocator = page.locator('textarea[placeholder="記事タイトル"]');
    await titleLocator.waitFor({ timeout: 30_000 });

    // Title
    await titleLocator.click();
    await titleLocator.fill(input.title);

    // Body (contenteditable) — focus first
    const bodyLocator = page.locator('[contenteditable="true"][role="textbox"]').first();
    await bodyLocator.click();

    // Insert the cover image as the first body element so note uses it
    // as the article thumbnail.
    if (input.coverPng) {
      try {
        await insertCoverImage(page, input.coverPng);
        // Move cursor below the inserted image
        await bodyLocator.click();
        await page.keyboard.press('End');
        await page.keyboard.press('Enter');
      } catch (e) {
        console.error('[note-publisher] cover image upload failed, continuing without it:', (e as Error).message);
      }
    }

    // Paste the body markdown (as plain text; note renders headings/bullets/bold from Markdown-ish syntax typed into the editor)
    await pastePlainText(page, input.body + '\n\n' + input.hashtags.join(' '));

    // Give the editor a second to debounce autosave
    await page.waitForTimeout(1500);

    // Save draft
    await page.getByRole('button', { name: '下書き保存' }).click();

    // After saving, note typically navigates to /n/<id>/edit or keeps /new — try both
    let draftUrl = page.url();
    try {
      await page.waitForURL(/\/(notes|n)\/[A-Za-z0-9_-]+/, { timeout: 15_000 });
      draftUrl = page.url();
    } catch {
      // fall back to current URL
    }

    const screenshotPath = 'drafts/last-publish.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });

    return { draftUrl, screenshotPath };
  } finally {
    await browser.close();
  }
}

async function insertImage(page: Page, png: Buffer) {
  // Clicking "画像を追加" exposes a hidden <input type="file">
  const addImageButton = page.getByRole('button', { name: '画像を追加' });
  await addImageButton.click();

  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: png });

  // Upload takes a few seconds. Wait for the editor to insert an <img>.
  await page
    .locator('[contenteditable="true"][role="textbox"] img')
    .first()
    .waitFor({ timeout: 20_000 })
    .catch(() => undefined);
}

async function insertCoverImage(page: Page, png: Buffer) {
  // 1. Click the toolbar "画像を追加" which opens a menu.
  await page.getByRole('button', { name: '画像を追加' }).click();

  // 2. Click the "画像をアップロード" option in the menu. This triggers the
  //    native file chooser.
  const uploadMenuItem = page.locator('button').filter({ hasText: /画像をアップロード/ }).first();
  await uploadMenuItem.waitFor({ timeout: 10_000 });
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 10_000 }),
    uploadMenuItem.click(),
  ]);
  await chooser.setFiles({ name: 'cover.png', mimeType: 'image/png', buffer: png });

  // 3. note pops up an "画像のサイズの変更" dialog after the upload.
  //    We accept the default crop by clicking 保存.
  const cropDialog = page.locator('[role="dialog"]').filter({ hasText: /画像のサイズの変更/ });
  await cropDialog.waitFor({ timeout: 20_000 });
  await cropDialog.getByRole('button', { name: '保存' }).click();

  // 4. Wait for the crop dialog to close (= image committed to the article).
  //    Note puts the rendered <img> in a sibling block outside the main
  //    contenteditable, so polling that selector would fail; the dialog
  //    going away is the correct signal.
  await cropDialog.waitFor({ state: 'hidden', timeout: 30_000 });

  // Short pause so the editor settles before we paste body text.
  await page.waitForTimeout(800);
  await page.keyboard.press('Escape');
}

async function pastePlainText(page: Page, text: string) {
  // Simulate a paste event so the editor handles line breaks properly
  await page.evaluate(async (t) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', t);
    const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    const target = document.querySelector('[contenteditable="true"][role="textbox"]') as HTMLElement | null;
    target?.focus();
    target?.dispatchEvent(ev);
  }, text);
}
