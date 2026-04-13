// Posts a generated blog post to note.com as a DRAFT.
// Uses Playwright with a pre-captured session (auth/note-state.json).
import fs from 'node:fs';
import { chromium, type Page } from 'playwright';
import type { BlogBlock } from './generate';
import { generateFigureImage } from './cover-image';
import { renderFigureHtmlToPng } from './figure-render';

const STATE_PATH = 'auth/note-state.json';
const EDITOR_URL = 'https://editor.note.com/new';

export interface PublishInput {
  title: string;
  blocks: BlogBlock[];
  hashtags: string[];
  coverPng?: Buffer;
}

export interface PublishResult {
  draftUrl: string;
  screenshotPath?: string;
  figureStats: { requested: number; rendered: number };
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

    // Cover image first (becomes the article thumbnail).
    if (input.coverPng) {
      try {
        await insertEditorImage(page, input.coverPng);
        await bodyLocator.click();
        await page.keyboard.press('End');
        await page.keyboard.press('Enter');
      } catch (e) {
        console.error('[note-publisher] cover upload failed:', (e as Error).message);
      }
    }

    // Walk blocks. Each figure block is rendered to PNG, then uploaded.
    let requestedFigures = 0;
    let renderedFigures = 0;

    for (let i = 0; i < input.blocks.length; i++) {
      const block = input.blocks[i];
      if (block.type === 'markdown') {
        await pastePlainText(page, block.content.trim() + '\n\n');
      } else if (block.type === 'figure_image') {
        requestedFigures += 1;
        try {
          console.log(`  [block ${i}] generating figure_image…`);
          const png = await generateFigureImage(block.prompt);
          await insertEditorImage(page, png);
          renderedFigures += 1;
          // bring cursor back into body
          await bodyLocator.click();
          await page.keyboard.press('End');
          await page.keyboard.press('Enter');
          if (block.caption) {
            await pastePlainText(page, `（図: ${block.caption}）\n\n`);
          }
        } catch (e) {
          console.error(`  [block ${i}] figure_image failed:`, (e as Error).message);
          if (block.caption) {
            await pastePlainText(page, `*[図: ${block.caption} — 生成失敗]*\n\n`);
          }
        }
      } else if (block.type === 'figure_table') {
        requestedFigures += 1;
        try {
          console.log(`  [block ${i}] rendering figure_table…`);
          const png = await renderFigureHtmlToPng(block.html);
          await insertEditorImage(page, png);
          renderedFigures += 1;
          await bodyLocator.click();
          await page.keyboard.press('End');
          await page.keyboard.press('Enter');
          if (block.caption) {
            await pastePlainText(page, `（表: ${block.caption}）\n\n`);
          }
        } catch (e) {
          console.error(`  [block ${i}] figure_table failed:`, (e as Error).message);
          if (block.caption) {
            await pastePlainText(page, `*[表: ${block.caption} — 生成失敗]*\n\n`);
          }
        }
      }
    }

    // Hashtags at the very end
    if (input.hashtags.length > 0) {
      await pastePlainText(page, '\n' + input.hashtags.join(' '));
    }

    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: '下書き保存' }).click();

    let draftUrl = page.url();
    try {
      await page.waitForURL(/\/(notes|n)\/[A-Za-z0-9_-]+/, { timeout: 15_000 });
      draftUrl = page.url();
    } catch {
      // fall back
    }

    const screenshotPath = 'drafts/last-publish.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });

    return {
      draftUrl,
      screenshotPath,
      figureStats: { requested: requestedFigures, rendered: renderedFigures },
    };
  } finally {
    await browser.close();
  }
}

async function insertEditorImage(page: Page, png: Buffer) {
  // Ensure focus is on an empty paragraph at the end of the body.
  // When the cursor sits on an empty paragraph, note shows a "+" block
  // inserter button (aria-label="メニューを開く") next to that paragraph.
  const body = page.locator('[contenteditable="true"][role="textbox"]').first();
  await body.click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);

  // 1. Click the "+" block inserter
  const plusBtn = page.locator('button[aria-label="メニューを開く"]').first();
  await plusBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await plusBtn.click();

  // 2. The expanded menu contains a "画像" row. The same upload flow
  //    (file chooser → crop dialog → 保存) runs from there.
  const imageMenuRow = page.locator('button', { hasText: /^画像$/ }).first();
  await imageMenuRow.waitFor({ state: 'visible', timeout: 10_000 });

  // Some renderings of the menu open a submenu with "画像をアップロード";
  // others open the file chooser directly. Handle both.
  let chooserPromise = page.waitForEvent('filechooser', { timeout: 10_000 });
  await imageMenuRow.click();
  let chooser;
  try {
    chooser = await chooserPromise;
  } catch {
    // Submenu path: look for "画像をアップロード"
    const uploadMenuItem = page.locator('button').filter({ hasText: /画像をアップロード/ }).first();
    await uploadMenuItem.waitFor({ state: 'visible', timeout: 10_000 });
    chooserPromise = page.waitForEvent('filechooser', { timeout: 10_000 });
    await uploadMenuItem.click();
    chooser = await chooserPromise;
  }
  await chooser.setFiles({ name: 'figure.png', mimeType: 'image/png', buffer: png });

  // 3. Cover images trigger a "画像のサイズの変更" crop dialog; inline
  //    body images don't. Handle it if it appears, wait briefly otherwise.
  const cropDialog = page.locator('[role="dialog"]').filter({ hasText: /画像のサイズの変更/ });
  const dialogPresent = await cropDialog
    .waitFor({ state: 'visible', timeout: 6_000 })
    .then(() => true)
    .catch(() => false);
  if (dialogPresent) {
    await cropDialog.getByRole('button', { name: '保存' }).click();
    await cropDialog.waitFor({ state: 'hidden', timeout: 30_000 });
  } else {
    // No crop dialog — wait for the upload to finish (image appears somewhere
    // on the page) before moving on.
    await page.waitForTimeout(2500);
  }
  await page.waitForTimeout(600);
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
  await page.waitForTimeout(150);
}
