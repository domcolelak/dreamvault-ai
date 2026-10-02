import type { Job, JobType, Prisma } from '@prisma/client';
import { prisma } from '../db';
import { errorMessage } from '../logger';

export type EnqueueInput = {
  type: JobType;
  campaignId?: string | null;
  leadId?: string | null;
  runId?: string | null;
  payload?: Prisma.InputJsonValue;
  /** Same key twice means the same job — enqueueing is idempotent. */
  idempotencyKey?: string | null;
  runAfter?: Date;
  maxAttempts?: number;
};

/**
 * Database-backed queue. Deliberately simple: a single table, an idempotency key
 * and a claim-by-update lock. Swapping in BullMQ later only means replacing
 * `enqueueJob`/`claimNextJob`, not the handlers.
 */
export async function enqueueJob(input: EnqueueInput): Promise<Job> {
  const data = {
    type: input.type,
    campaignId: input.campaignId ?? null,
    leadId: input.leadId ?? null,
    runId: input.runId ?? null,
    payload: input.payload,
    idempotencyKey: input.idempotencyKey ?? null,
    runAfter: input.runAfter ?? new Date(),
    maxAttempts: input.maxAttempts ?? 3,
  };

  if (input.idempotencyKey === null || input.idempotencyKey === undefined) {
    return prisma.job.create({ data });
  }

  const existing = await prisma.job.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing !== null) {
    // A finished job with the same key is re-armed; a pending one is left alone.
    if (existing.status === 'SUCCEEDED' || existing.status === 'CANCELLED') return existing;
    if (existing.status === 'FAILED') {
      return prisma.job.update({
        where: { id: existing.id },
        data: {
          status: 'PENDING',
          attempts: 0,
          lastError: null,
          lockedAt: null,
          runAfter: data.runAfter,
          runId: data.runId,
        },
      });
    }
    return existing;
  }

  return prisma.job.create({ data });
}

const LOCK_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Claims one due job. The conditional update is the lock: two concurrent workers
 * cannot both claim the same row because the second update matches zero rows.
 */
export async function claimNextJob(types?: JobType[]): Promise<Job | null> {
  const staleBefore = new Date(Date.now() - LOCK_TIMEOUT_MS);

  const candidate = await prisma.job.findFirst({
    where: {
      runAfter: { lte: new Date() },
      ...(types !== undefined ? { type: { in: types } } : {}),
      OR: [{ status: 'PENDING' }, { status: 'RUNNING', lockedAt: { lt: staleBefore } }],
    },
    orderBy: [{ runAfter: 'asc' }, { createdAt: 'asc' }],
  });
  if (candidate === null) return null;

  const claimed = await prisma.job.updateMany({
    where: { id: candidate.id, status: candidate.status, lockedAt: candidate.lockedAt },
    data: { status: 'RUNNING', lockedAt: new Date(), startedAt: new Date(), attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return null;

  return prisma.job.findUnique({ where: { id: candidate.id } });
}

export async function completeJob(jobId: string): Promise<void> {
  await prisma.job.update({
    where: { id: jobId },
    data: { status: 'SUCCEEDED', finishedAt: new Date(), lockedAt: null, lastError: null },
  });
}

/** Retries with exponential backoff until maxAttempts, then fails permanently. */
export async function failJob(jobId: string, error: unknown): Promise<{ willRetry: boolean }> {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (job === null) return { willRetry: false };

  const message = errorMessage(error).slice(0, 4000);
  const willRetry = job.attempts < job.maxAttempts;

  await prisma.job.update({
    where: { id: jobId },
    data: willRetry
      ? {
          status: 'PENDING',
          lockedAt: null,
          lastError: message,
          runAfter: new Date(Date.now() + 2 ** job.attempts * 30_000),
        }
      : { status: 'FAILED', lockedAt: null, finishedAt: new Date(), lastError: message },
  });

  return { willRetry };
}

export async function cancelCampaignJobs(campaignId: string): Promise<number> {
  const result = await prisma.job.updateMany({
    where: { campaignId, status: { in: ['PENDING', 'RUNNING'] } },
    data: { status: 'CANCELLED', finishedAt: new Date(), lockedAt: null },
  });
  return result.count;
}

export async function queueDepth(campaignId?: string): Promise<Record<string, number>> {
  const grouped = await prisma.job.groupBy({
    by: ['status'],
    _count: { _all: true },
    where: campaignId !== undefined ? { campaignId } : {},
  });
  return Object.fromEntries(grouped.map((row) => [row.status, row._count._all]));
}
