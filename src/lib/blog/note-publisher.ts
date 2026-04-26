// Posts a generated blog post to note.com as a DRAFT.
// Body images are intentionally not inserted — cover only.
import fs from 'node:fs';
import { marked } from 'marked';
import { chromium, type Page } from 'playwright';

const STATE_PATH = 'auth/note-state.json';
const EDITOR_URL = 'https://editor.note.com/new';
const PASTE_KEY = process.platform === 'darwin' ? 'Meta+V' : 'Control+V';

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
    // Required for navigator.clipboard.write inside page.evaluate. Without this,
    // a real Cmd+V paste lands no useful clipboardData on note's ProseMirror
    // editor, which silently drops the body when 下書き保存 serialises state.
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: 'https://editor.note.com',
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

    // Body + hashtags as a single rich paste (HTML + plain).
    await pasteRichContent(page, input.body, input.hashtags);

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

    // Reopen the draft and confirm the body actually persisted. Catches the
    // failure mode where ProseMirror state never received the paste even
    // though it rendered in the DOM.
    await verifyDraftBody(page, draftUrl);

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

// Renders markdown to a minimal HTML subset (h2, p, ul/li, strong, em),
// writes both text/html and text/plain to the system clipboard, then fires
// a real Cmd+V at the editor. Trusted paste with text/html lets note's
// ProseMirror transformPasted produce real headings/lists/bold instead of
// literal `##` characters.
async function pasteRichContent(page: Page, markdownBody: string, hashtags: string[]) {
  const fullMarkdown =
    markdownBody + (hashtags.length ? '\n\n' + hashtags.join(' ') : '');
  const html = await marked.parse(fullMarkdown, { gfm: true, breaks: false });

  await page.evaluate(
    async ({ html, plain }) => {
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      });
      await navigator.clipboard.write([item]);
    },
    { html, plain: fullMarkdown },
  );

  // Caller positioned the cursor at the end of the editor (after cover),
  // so don't re-click — just fire the OS-level paste shortcut.
  await page.keyboard.press(PASTE_KEY);
  await page.waitForTimeout(1500);
}

async function verifyDraftBody(page: Page, draftUrl: string) {
  if (!/\/(notes|n)\/[A-Za-z0-9_-]+/.test(draftUrl)) {
    throw new Error(`note draft URL did not settle: ${draftUrl}`);
  }
  console.log('  [publisher] verifying saved body…');
  await page.goto(draftUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  const editor = page.locator('[contenteditable="true"][role="textbox"]').first();
  await editor.waitFor({ timeout: 30_000 });
  // Allow ProseMirror to hydrate from the saved doc.
  await page.waitForTimeout(2500);
  const text = (await editor.innerText()).replace(/\s+/g, '');
  if (text.length < 100) {
    await page.screenshot({ path: 'drafts/verify-fail.png', fullPage: true });
    throw new Error(
      `note draft body verification failed: only ${text.length} non-whitespace chars on reload (draft: ${draftUrl})`,
    );
  }
  console.log(`  [publisher] verified ${text.length} chars in saved draft`);
}
