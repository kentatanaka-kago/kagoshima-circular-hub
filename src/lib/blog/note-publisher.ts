// Posts a generated blog post to note.com as a DRAFT (does NOT click the
// public-publish button). Uses Playwright with a pre-captured session
// state — run scripts/note-login.ts once to produce auth/note-state.json.
//
// note.com has no public API, so we drive the editor UI. Selectors below
// are best-effort; expect to revisit if note redesigns their editor.
import fs from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';

const STATE_PATH = 'auth/note-state.json';
const EDITOR_URL = 'https://editor.note.com/new';

export interface PublishInput {
  title: string;
  body: string;         // Markdown (headings, bullet lists, bold — no tables)
  hashtags: string[];
  coverPng?: Buffer;
}

export interface PublishResult {
  draftUrl: string;
  screenshotPath?: string;
}

export async function publishToNoteDraft(input: PublishInput): Promise<PublishResult> {
  if (!fs.existsSync(STATE_PATH)) {
    throw new Error(
      `Auth state not found at ${STATE_PATH}. Run "npx tsx scripts/note-login.ts" once first.`,
    );
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ storageState: STATE_PATH });
    const page = await context.newPage();
    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded' });

    // If note bounced us to /login, the saved state is stale
    if (page.url().includes('/login')) {
      throw new Error('Note session expired — rerun scripts/note-login.ts');
    }

    await writeTitle(page, input.title);
    await writeBody(page, input.body + '\n\n' + input.hashtags.join(' '));

    if (input.coverPng) {
      await uploadCoverImage(page, input.coverPng);
    }

    // Click "下書き保存" (Save as draft)
    await page.getByRole('button', { name: /下書き保存/ }).click();

    // Wait for URL to reflect the draft id (/notes/<id>/edit usually)
    await page.waitForURL(/\/(notes|n)\/[A-Za-z0-9_-]+/, { timeout: 20_000 });
    const draftUrl = page.url();

    const screenshotPath = `drafts/last-publish.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });

    return { draftUrl, screenshotPath };
  } finally {
    await maybeSaveStorage(browser);
    await browser.close();
  }
}

async function writeTitle(page: Page, title: string) {
  const titleField = page.locator('textarea[placeholder*="タイトル"], input[placeholder*="タイトル"]').first();
  await titleField.waitFor({ timeout: 15_000 });
  await titleField.click();
  await titleField.fill(title);
}

async function writeBody(page: Page, body: string) {
  // note editor is a contenteditable; target by placeholder text or role
  const editor = page
    .locator(
      '[contenteditable="true"][role="textbox"], [contenteditable="true"][placeholder*="本文"], [contenteditable="true"][aria-label*="本文"]',
    )
    .first();
  await editor.waitFor({ timeout: 15_000 });
  await editor.click();

  // Typing every character is slow and also triggers autocomplete; paste instead.
  await page.evaluate(async (text) => {
    const data = new DataTransfer();
    data.setData('text/plain', text);
    const evt = new ClipboardEvent('paste', { clipboardData: data, bubbles: true });
    (document.activeElement as HTMLElement | null)?.dispatchEvent(evt);
  }, body);

  await page.waitForTimeout(500); // let the editor settle
}

async function uploadCoverImage(page: Page, png: Buffer) {
  // note editor exposes a hidden <input type="file"> for header image
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles({
    name: 'cover.png',
    mimeType: 'image/png',
    buffer: png,
  });
  // Wait for upload — usually an editor toast or an <img src="...note.mu..."> appears
  await page.waitForTimeout(3000);
}

async function maybeSaveStorage(_browser: Browser) {
  // Intentionally left blank. We do not rewrite the storage state so the
  // original login session remains authoritative.
}
