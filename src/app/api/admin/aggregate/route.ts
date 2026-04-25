import { NextResponse } from 'next/server';
import { runAggregation } from '@/lib/aggregate';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST() {
  const result = await runAggregation();
  const status = result.ok ? 200 : 500;
  return NextResponse.json(result, { status });
}
