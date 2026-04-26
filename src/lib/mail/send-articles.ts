import type { supabaseAdmin } from '@/lib/supabase';

type Admin = ReturnType<typeof supabaseAdmin>;

export interface MailResult {
  pending: number;
  sent: number;
  failed: number;
  recipients: number;
  skipped?: string;
  sampleErrors?: string[];
}

const MAIL_BATCH = 30;
const SEND_INTERVAL_MS = 600;
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

type Row = {
  id: string;
  source_type: string;
  source_id: string | null;
  source_name: string;
  source_url: string;
  title: string;
  published_at: string | null;
  scraped_at: string;
  tags: string[];
  ai_summary: string | null;
  raw_excerpt: string | null;
};

async function loadRecipients(admin: Admin): Promise<string[]> {
  const { data, error } = await admin
    .from('mail_recipients')
    .select('email, enabled')
    .eq('enabled', true);
  if (error || !data) return [];
  type RecipRow = { email: string; enabled: boolean };
  return (data as RecipRow[]).map((r) => r.email).filter(Boolean);
}

export async function emailUnsentArticles(admin: Admin): Promise<MailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!apiKey || !from) {
    return { pending: 0, sent: 0, failed: 0, recipients: 0, skipped: 'RESEND_API_KEY / MAIL_FROM not set' };
  }

  const recipients = await loadRecipients(admin);
  if (recipients.length === 0) {
    return { pending: 0, sent: 0, failed: 0, recipients: 0, skipped: 'no enabled recipients in mail_recipients' };
  }

  const { data, error } = await admin
    .from('news_articles')
    .select('id, source_type, source_id, source_name, source_url, title, published_at, scraped_at, tags, ai_summary, raw_excerpt')
    .is('emailed_at', null)
    .order('scraped_at', { ascending: true })
    .limit(MAIL_BATCH);

  if (error) return { pending: 0, sent: 0, failed: 0, recipients: recipients.length, skipped: error.message };
  if (!data || data.length === 0) return { pending: 0, sent: 0, failed: 0, recipients: recipients.length };

  const rows = data as Row[];
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const payload = {
        id: row.id,
        title: row.title,
        source_type: row.source_type,
        source_id: row.source_id,
        source_name: row.source_name,
        source_url: row.source_url,
        published_at: row.published_at,
        scraped_at: row.scraped_at,
        tags: row.tags,
        ai_summary: row.ai_summary,
        raw_excerpt: row.raw_excerpt,
      };
      const res = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          // BCC keeps recipient addresses private from each other.
          to: from,
          bcc: recipients,
          subject: `[鹿児島CE] ${row.source_name}｜${row.title}`,
          text: JSON.stringify(payload, null, 2),
        }),
      });
      if (!res.ok) {
        throw new Error(`resend ${res.status}: ${await res.text()}`);
      }
      const { error: updErr } = await admin
        .from('news_articles')
        .update({ emailed_at: new Date().toISOString() } as never)
        .eq('id', row.id);
      if (updErr) throw new Error(`update failed: ${updErr.message}`);
      sent += 1;
    } catch (e) {
      failed += 1;
      if (errors.length < 3) errors.push(e instanceof Error ? e.message : String(e));
    }
    // Stay under Resend's 2 req/sec default rate limit.
    await new Promise((r) => setTimeout(r, SEND_INTERVAL_MS));
  }

  return {
    pending: rows.length,
    sent,
    failed,
    recipients: recipients.length,
    ...(errors.length ? { sampleErrors: errors } : {}),
  };
}

export interface SingleMailResult {
  ok: boolean;
  sent: boolean;
  recipients: number;
  error?: string;
}

export async function emailSingleArticle(admin: Admin, articleId: string): Promise<SingleMailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!apiKey || !from) {
    return { ok: false, sent: false, recipients: 0, error: 'RESEND_API_KEY / MAIL_FROM not set' };
  }

  const recipients = await loadRecipients(admin);
  if (recipients.length === 0) {
    return { ok: false, sent: false, recipients: 0, error: 'no enabled recipients' };
  }

  const { data, error } = await admin
    .from('news_articles')
    .select('id, source_type, source_id, source_name, source_url, title, published_at, scraped_at, tags, ai_summary, raw_excerpt')
    .eq('id', articleId)
    .maybeSingle();
  if (error) return { ok: false, sent: false, recipients: recipients.length, error: error.message };
  if (!data) return { ok: false, sent: false, recipients: recipients.length, error: 'article not found' };

  const row = data as Row;
  const payload = {
    id: row.id,
    title: row.title,
    source_type: row.source_type,
    source_id: row.source_id,
    source_name: row.source_name,
    source_url: row.source_url,
    published_at: row.published_at,
    scraped_at: row.scraped_at,
    tags: row.tags,
    ai_summary: row.ai_summary,
    raw_excerpt: row.raw_excerpt,
  };

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: from,
      bcc: recipients,
      subject: `[鹿児島CE] ${row.source_name}｜${row.title}`,
      text: JSON.stringify(payload, null, 2),
    }),
  });
  if (!res.ok) {
    return {
      ok: false,
      sent: false,
      recipients: recipients.length,
      error: `resend ${res.status}: ${await res.text()}`,
    };
  }

  const { error: updErr } = await admin
    .from('news_articles')
    .update({ emailed_at: new Date().toISOString() } as never)
    .eq('id', row.id);
  if (updErr) {
    return { ok: false, sent: true, recipients: recipients.length, error: `update failed: ${updErr.message}` };
  }
  return { ok: true, sent: true, recipients: recipients.length };
}
