import type { LeadStatus, Prisma } from '@prisma/client';
import { prisma } from '../db';

/**
 * Updates a lead's status and records the transition. Every status change in the
 * application goes through here so the history is always complete.
 */
export async function setLeadStatus(
  leadId: string,
  to: LeadStatus,
  reason: string | null,
  extra: Prisma.LeadUpdateInput = {},
): Promise<void> {
  const current = await prisma.lead.findUnique({ where: { id: leadId }, select: { status: true } });
  if (current === null) return;
  if (current.status === to && Object.keys(extra).length === 0) return;

  await prisma.$transaction([
    prisma.lead.update({ where: { id: leadId }, data: { status: to, ...extra } }),
    prisma.leadStatusHistory.create({
      data: { leadId, from: current.status, to, reason: reason?.slice(0, 1000) ?? null },
    }),
  ]);
}

/** Statuses from which no further automated work should be attempted. */
const TERMINAL: ReadonlySet<LeadStatus> = new Set<LeadStatus>([
  'REJECTED',
  'REPLIED',
  'MANUAL',
  'DO_NOT_CONTACT',
]);

export function isTerminal(status: LeadStatus): boolean {
  return TERMINAL.has(status);
}
