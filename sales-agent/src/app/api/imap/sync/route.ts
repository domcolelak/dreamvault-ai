import { NextResponse } from 'next/server';
import { syncInbox } from '@/lib/agent/imap-sync';
import { authorizeRunner } from '@/lib/api-auth';
import { errorMessage } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Pulls new mail and stops automation for any contact who replied. */
export async function POST(request: Request): Promise<NextResponse> {
  const auth = authorizeRunner(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const url = new URL(request.url);
  const sinceDays = Math.min(90, Math.max(1, Number.parseInt(url.searchParams.get('sinceDays') ?? '14', 10) || 14));

  try {
    const outcome = await syncInbox({ sinceDays });
    return NextResponse.json({ ok: outcome.configured, ...outcome });
  } catch (error) {
    return NextResponse.json({ ok: false, error: errorMessage(error) }, { status: 500 });
  }
}
