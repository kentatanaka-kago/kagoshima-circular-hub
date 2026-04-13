// Polls the user's note.com RSS feed and backfills note_post_url for
// articles whose note_draft_url is already set (= we posted a draft)
// but note_post_url is still null (= draft hasn't been matched yet).
//
// Matching is by note article id:
//   draft URL: https://editor.note.com/notes/<id>/edit/
//   public URL: https://note.com/<username>/n/<id>
// Both share <id>.
import type { supabaseAdmin } from '../supabase';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export interface CheckResult {
  rssItems: number;
  matched: number;
  updated: number;
  noteUsername: string | null;
}

function extractNoteId(url: string | null): string | null {
  if (!url) return null;
  // draft URL shape: editor.note.com/notes/<id>/edit OR notes/<id>/edit
  const m =
    /\/notes\/([a-zA-Z0-9]+)/.exec(url) ??
    /\/n\/([a-zA-Z0-9]+)/.exec(url) ??
    null;
  return m?.[1] ?? null;
}

export async function checkNotePublished(
  admin: ReturnType<typeof supabaseAdmin>,
): Promise<CheckResult> {
  const noteUsername = process.env.NOTE_USERNAME ?? null;
  if (!noteUsername) return { rssItems: 0, matched: 0, updated: 0, noteUsername };

  const rssUrl = `https://note.com/${noteUsername}/rss`;
  const res = await fetch(rssUrl, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`note RSS fetch failed: ${res.status}`);
  const xml = await res.text();

  // Pull each <item> out, keep title/link/pubDate
  type RssItem = { id: string; url: string; pubDate: string | null };
  const items: RssItem[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const body = m[1];
    const link = /<link>([\s\S]*?)<\/link>/.exec(body)?.[1]?.trim();
    const pubDate = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(body)?.[1]?.trim() ?? null;
    const id = extractNoteId(link ?? null);
    if (id && link) items.push({ id, url: link, pubDate });
  }

  if (items.length === 0) {
    return { rssItems: 0, matched: 0, updated: 0, noteUsername };
  }

  // Find articles that have a draft URL but no post URL yet.
  const { data: pending, error } = await admin
    .from('news_articles')
    .select('id, note_draft_url')
    .not('note_draft_url', 'is', null)
    .is('note_post_url', null);
  if (error) throw error;

  const rows = (pending ?? []) as { id: string; note_draft_url: string | null }[];
  let matched = 0;
  let updated = 0;

  const idToRow = new Map<string, { id: string }>();
  for (const r of rows) {
    const id = extractNoteId(r.note_draft_url);
    if (id) idToRow.set(id, { id: r.id });
  }

  for (const item of items) {
    const row = idToRow.get(item.id);
    if (!row) continue;
    matched += 1;
    const postedAt = item.pubDate ? new Date(item.pubDate).toISOString() : null;
    const { error: updErr } = await admin
      .from('news_articles')
      .update({
        note_post_url: item.url,
        note_posted_at: postedAt,
      } as never)
      .eq('id', row.id);
    if (!updErr) updated += 1;
  }

  return { rssItems: items.length, matched, updated, noteUsername };
}
