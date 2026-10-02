import { NextResponse } from 'next/server';
import { tick } from '@/lib/agent/runner';
import { scheduleSends } from '@/lib/agent/scheduler';
import { authorizeRunner } from '@/lib/api-auth';
import { prisma } from '@/lib/db';
import { errorMessage } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * The entry point for an external scheduler (cron, systemd timer, Vercel Cron).
 * It schedules any due sends for active automatic campaigns and then drains a
 * batch of jobs.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const auth = authorizeRunner(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const url = new URL(request.url);
  const max = Math.min(50, Math.max(1, Number.parseInt(url.searchParams.get('max') ?? '10', 10) || 10));

  try {
    const active = await prisma.campaign.findMany({
      where: { status: 'ACTIVE', sendingMode: 'AUTOMATIC' },
      select: { id: true },
    });
    const scheduling = await Promise.all(
      active.map(async (campaign) => ({ campaignId: campaign.id, ...(await scheduleSends(campaign.id)) })),
    );

    const result = await tick(max);
    return NextResponse.json({ ok: true, scheduling, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: errorMessage(error) }, { status: 500 });
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  const auth = authorizeRunner(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const grouped = await prisma.job.groupBy({ by: ['type', 'status'], _count: { _all: true } });
  return NextResponse.json({
    ok: true,
    queue: grouped.map((row) => ({ type: row.type, status: row.status, count: row._count._all })),
  });
}
