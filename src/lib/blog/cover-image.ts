import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';

export const COVER_IMAGE_MODEL = 'gemini-2.5-flash-image';
// note.com recommended cover size; we centre-crop the model's square output.
const NOTE_COVER_WIDTH = 1280;
const NOTE_COVER_HEIGHT = 670;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
  return new GoogleGenAI({ apiKey });
}

const STYLE_INSTRUCTION = `クリーンでモダンなインフォグラフィック風のカバー画像。
- 色彩: 落ち着いたグリーン・ブルー・ホワイト基調。やわらかいグラデーション可。
- 構図: 中央に主要テーマを表すシンボル（例: 円環、リサイクル矢印、植物、工場と自然の調和など）。
- 文字は入れないこと（日本語フォントの文字化け防止）。
- 抽象的で幾何学的なグラフィック調。写真風やリアル過ぎる描写は避ける。
- 16:9 の横長、ブログカバーとして読みやすい配置。
- 人物は入れないこと。`;

export interface CoverImageInput {
  title: string;
  tags: string[];
  summary?: string | null;
}

export interface CoverImageOutput {
  pngBuffer: Buffer;
  model: string;
  prompt: string;
}

export async function generateCoverImage(input: CoverImageInput): Promise<CoverImageOutput> {
  const ai = getClient();
  const prompt = buildPrompt(input);

  const res = await ai.models.generateContent({
    model: COVER_IMAGE_MODEL,
    contents: prompt,
  });

  const parts = res.candidates?.[0]?.content?.parts ?? [];
  for (const p of parts) {
    if (p.inlineData?.data) {
      const raw = Buffer.from(p.inlineData.data, 'base64');
      const pngBuffer = await resizeToNoteCover(raw);
      return { pngBuffer, model: COVER_IMAGE_MODEL, prompt };
    }
  }
  throw new Error('Gemini did not return image data');
}

async function resizeToNoteCover(buf: Buffer): Promise<Buffer> {
  return sharp(buf)
    .resize({
      width: NOTE_COVER_WIDTH,
      height: NOTE_COVER_HEIGHT,
      fit: 'cover',
      position: 'centre',
    })
    .png()
    .toBuffer();
}

function buildPrompt(input: CoverImageInput): string {
  const themeHint = input.tags.length
    ? `記事テーマ: ${input.tags.join(' / ')}（サーキュラーエコノミー関連）`
    : 'サーキュラーエコノミー関連';
  return [
    STYLE_INSTRUCTION,
    '',
    `対象: ${input.title}`,
    themeHint,
    input.summary ? `内容抜粋: ${input.summary.slice(0, 200)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
