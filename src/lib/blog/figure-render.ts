// Render an HTML fragment (a <table>/<h3>/<ul>) into a PNG that can be
// uploaded into the note body as a figure. Uses a small Playwright instance
// with a JP-friendly font stack so Japanese text renders correctly.
import { chromium } from 'playwright';

const FIGURE_WIDTH = 960;
const CSS = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 28px;
    background: #ffffff;
    font-family: -apple-system, BlinkMacSystemFont, 'Hiragino Sans', 'Hiragino Kaku Gothic ProN',
                 'Yu Gothic', 'Meiryo', sans-serif;
    color: #1f2937;
  }
  h3 {
    font-size: 18px;
    font-weight: 700;
    margin: 0 0 16px;
    color: #0f172a;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 14px;
  }
  thead tr { background: #f1f5f9; }
  th, td {
    border: 1px solid #e2e8f0;
    padding: 10px 14px;
    text-align: left;
    vertical-align: top;
    line-height: 1.55;
  }
  th { font-weight: 600; color: #0f172a; }
  tr:nth-child(even) td { background: #fafafa; }
  strong { font-weight: 700; color: #0f172a; }
  ul { margin: 0; padding-left: 20px; }
  li { margin-bottom: 4px; }
`;

export async function renderFigureHtmlToPng(html: string): Promise<Buffer> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      locale: 'ja-JP',
      viewport: { width: FIGURE_WIDTH, height: 800 },
      deviceScaleFactor: 2, // high-DPI output
    });
    const page = await context.newPage();
    await page.setContent(
      `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><style>${CSS}</style></head><body><div id="fig">${html}</div></body></html>`,
      { waitUntil: 'networkidle' },
    );
    const buf = await page.locator('#fig').screenshot({ omitBackground: false });
    return buf;
  } finally {
    await browser.close();
  }
}
