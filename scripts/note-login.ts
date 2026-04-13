// Run this ONCE manually to capture an authenticated session for note.com.
// The script opens a visible browser. Log in through the real flow
// (email/password, Google SSO — whatever you use), then come back to the
// terminal and press Enter. The cookies + localStorage get saved to
// auth/note-state.json and reused by the publisher script indefinitely
// (note sessions are long-lived).
//
// Usage:
//   npx tsx scripts/note-login.ts
import fs from 'node:fs';
import readline from 'node:readline/promises';
import { chromium } from 'playwright';

const STATE_PATH = 'auth/note-state.json';
const LOGIN_URL = 'https://note.com/login';

async function main() {
  fs.mkdirSync('auth', { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log(`Opening ${LOGIN_URL} …`);
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
  console.log('');
  console.log('▶ ブラウザでログインしてください（メール+パスワード or Google SSO）。');
  console.log('  ログイン完了して note のトップページ（自分のダッシュボード）に遷移したら、');
  console.log('  このターミナルに戻って Enter を押してください。');
  console.log('');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question('ログインが完了したら Enter →');
  rl.close();

  const url = page.url();
  console.log(`現在の URL: ${url}`);
  if (url.includes('/login')) {
    console.error('⚠ まだ /login のままです。ログインをもう一度試してから実行してください。');
    await browser.close();
    process.exit(1);
  }

  await context.storageState({ path: STATE_PATH });
  console.log(`✓ セッションを ${STATE_PATH} に保存しました。`);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
