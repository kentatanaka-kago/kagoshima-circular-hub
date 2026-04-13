// One-time auth capture for note.com.
// 使い方:
//   npx tsx scripts/note-login.ts
// スクリプトがブラウザを開くので、note.com にログインしてください。
// ログインが完了して URL が /login から外れた時点で自動的にセッションを
// auth/note-state.json に保存してブラウザを閉じます。手動の Enter は不要。
import fs from 'node:fs';
import { chromium } from 'playwright';

const STATE_PATH = 'auth/note-state.json';
const LOGIN_URL = 'https://note.com/login';
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes to finish login

async function main() {
  fs.mkdirSync('auth', { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log(`Opening ${LOGIN_URL} …`);
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });

  console.log('');
  console.log('▶ ブラウザで note にログインしてください。');
  console.log('  ログインが完了すれば自動的にセッションを保存してブラウザを閉じます。');
  console.log('  （5分以内にログインを完了してください）');
  console.log('');

  const start = Date.now();
  let saved = false;

  // Poll until we're no longer on /login and the page looks authenticated.
  // Give the user up to TIMEOUT_MS.
  while (Date.now() - start < TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, 1500));
    try {
      const url = page.url();
      if (url.startsWith('https://note.com/login')) continue;
      if (url.startsWith('https://note.com/signup')) continue;
      if (!url.startsWith('https://note.com/') && !url.startsWith('https://editor.note.com/')) {
        // may be a 3rd-party OAuth step (Google, Apple). Keep waiting.
        continue;
      }
      // Stay on URL for ~2s to make sure navigation settled
      await new Promise((r) => setTimeout(r, 2000));
      if (page.url() === url) {
        await context.storageState({ path: STATE_PATH });
        console.log(`✓ セッションを ${STATE_PATH} に保存しました (URL: ${url})`);
        saved = true;
        break;
      }
    } catch {
      // page might still be navigating; keep polling
    }
  }

  if (!saved) {
    console.error('⚠ タイムアウト: 5分以内にログインが完了しませんでした。もう一度実行してください。');
  }

  await browser.close();
  process.exit(saved ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
