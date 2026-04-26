import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { checkNotePublished } from '@/lib/note/check-published';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST() {
  try {
    const admin = supabaseAdmin();
    const result = await checkNotePublished(admin);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
