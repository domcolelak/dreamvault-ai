import { prisma } from '../db';
import { logAgent } from '../logger';
import { resolveSettings } from '../settings';
import { enqueueJob } from './jobs';
import { countSentToday, minutesLeftInWindow, workingHoursState } from './rate-limit';

export type ScheduleOutcome = {
  scheduled: number;
  skipped: number;
  reason: string;
};

function randomGap(minMinutes: number, maxMinutes: number): number {
  const low = Math.max(1, Math.min(minMinutes, maxMinutes));
  const high = Math.max(low, maxMinutes);
  return low + Math.random() * (high - low);
}

/**
 * Spreads a campaign's remaining daily allowance across the rest of the working
 * window with a randomised gap between messages, instead of firing the whole
 * day's quota at once. Sends are represented as EMAIL_SEND jobs with a runAfter.
 */
export async function scheduleSends(campaignId: string): Promise<ScheduleOutcome> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (campaign === null) return { scheduled: 0, skipped: 0, reason: 'Campaign not found.' };

  if (campaign.status !== 'ACTIVE' || campaign.sendingMode !== 'AUTOMATIC') {
    return {
      scheduled: 0,
      skipped: 0,
      reason: `Campaign is ${campaign.status} / ${campaign.sendingMode}; nothing is scheduled for automatic sending.`,
    };
  }

  const hours = await workingHoursState();
  if (!hours.insideWorkingHours) {
    return {
      scheduled: 0,
      skipped: 0,
      reason: hours.isWeekend
        ? `Outside the sending window (weekend, ${hours.timezone}).`
        : `Outside the sending window (local time ${String(hours.localHour).padStart(2, '0')}:${String(
            hours.localMinute,
          ).padStart(2, '0')}, ${hours.timezone}).`,
    };
  }

  const settings = await resolveSettings();
  const sent = await countSentToday(campaignId);
  const campaignRemaining = campaign.dailySendLimit - sent.campaign;
  const globalRemaining = settings.globalDailyEmailLimit - sent.global;
  const allowance = Math.min(campaignRemaining, globalRemaining);

  if (allowance <= 0) {
    return {
      scheduled: 0,
      skipped: 0,
      reason: `Daily allowance exhausted (campaign ${sent.campaign}/${campaign.dailySendLimit}, mailbox ${sent.global}/${settings.globalDailyEmailLimit}).`,
    };
  }

  // Already-scheduled sends count against the allowance.
  const alreadyQueued = await prisma.job.count({
    where: { campaignId, type: 'EMAIL_SEND', status: { in: ['PENDING', 'RUNNING'] } },
  });
  const capacity = allowance - alreadyQueued;
  if (capacity <= 0) {
    return { scheduled: 0, skipped: 0, reason: `${alreadyQueued} send(s) are already queued for today.` };
  }

  const drafts = await prisma.emailDraft.findMany({
    where: {
      campaignId,
      status: 'DRAFT',
      scheduledAt: null,
      lead: { automationStopped: false, status: 'DRAFTED' },
      contact: { globalDoNotAutoContact: false },
    },
    orderBy: [{ lead: { score: 'desc' } }, { createdAt: 'asc' }],
    take: capacity,
  });

  if (drafts.length === 0) {
    return { scheduled: 0, skipped: 0, reason: 'No ready drafts waiting to be sent.' };
  }

  const windowMinutes = await minutesLeftInWindow();
  let cursor = Date.now();
  let scheduled = 0;

  for (const draft of drafts) {
    const gap = randomGap(settings.sendMinGapMinutes, settings.sendMaxGapMinutes);
    cursor += gap * 60_000;
    const runAfter = new Date(cursor);

    // Never schedule past the end of today's window; the next tick re-schedules.
    if (cursor - Date.now() > windowMinutes * 60_000) break;

    await prisma.emailDraft.update({ where: { id: draft.id }, data: { scheduledAt: runAfter } });
    await enqueueJob({
      type: 'EMAIL_SEND',
      campaignId,
      leadId: draft.leadId,
      idempotencyKey: `EMAIL_SEND:${draft.id}`,
      payload: { draftId: draft.id },
      runAfter,
    });
    scheduled += 1;
  }

  await logAgent({
    type: 'SEND_DECISION',
    campaignId,
    summary: `Scheduled ${scheduled} send(s) across the remaining ${windowMinutes} minute(s) of today's window.`,
    output: {
      scheduled,
      allowance,
      alreadyQueued,
      sentToday: sent,
      gapMinutes: [settings.sendMinGapMinutes, settings.sendMaxGapMinutes],
    },
  });

  return {
    scheduled,
    skipped: drafts.length - scheduled,
    reason: `Scheduled ${scheduled} send(s).`,
  };
}
