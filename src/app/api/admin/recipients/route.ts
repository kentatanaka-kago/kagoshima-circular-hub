import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET() {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('mail_recipients')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ recipients: data ?? [] });
}

export async function POST(req: Request) {
  let payload: { email?: string; note?: string; enabled?: boolean };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const email = (payload.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'invalid email' }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const insert = {
    email,
    note: payload.note ?? null,
    enabled: payload.enabled ?? true,
  };
  const { data, error } = await admin
    .from('mail_recipients')
    .insert(insert as never)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ recipient: data });
}

export async function PATCH(req: Request) {
  let payload: { id?: string; enabled?: boolean; note?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (!payload.id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (typeof payload.enabled === 'boolean') update.enabled = payload.enabled;
  if (typeof payload.note === 'string') update.note = payload.note;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('mail_recipients')
    .update(update as never)
    .eq('id', payload.id)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ recipient: data });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id query param is required' }, { status: 400 });

  const admin = supabaseAdmin();
  const { error } = await admin.from('mail_recipients').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
