import { prisma } from './db';
import { startOfLocalDay } from './agent/rate-limit';
import { resolveSettings } from './settings';

export type TodayStats = {
  found: number;
  qualified: number;
  ready: number;
  sent: number;
  replies: number;
  needsHandling: number;
  dayStart: Date;
  timezone: string;
};

/** Headline numbers for the Overview page, counted in the operator's timezone. */
export async function todayStats(): Promise<TodayStats> {
  const settings = await resolveSettings();
  const dayStart = startOfLocalDay(new Date(), settings.timezone);

  const [found, qualified, ready, sent, replies, needsHandling] = await Promise.all([
    prisma.lead.count({ where: { createdAt: { gte: dayStart } } }),
    prisma.lead.count({ where: { qualified: true, updatedAt: { gte: dayStart } } }),
    prisma.lead.count({ where: { status: { in: ['READY', 'DRAFTED'] } } }),
    prisma.sentEmail.count({ where: { sentAt: { gte: dayStart } } }),
    prisma.inboundEmail.count({ where: { isReply: true, receivedAt: { gte: dayStart } } }),
    prisma.inboundEmail.count({ where: { isReply: true, needsManualHandling: true } }),
  ]);

  return { found, qualified, ready, sent, replies, needsHandling, dayStart, timezone: settings.timezone };
}

export type CampaignPerformanceRow = {
  id: string;
  name: string;
  status: string;
  sendingMode: string;
  isDemo: boolean;
  leadsTarget: number;
  dailySendLimit: number;
  minimumScore: number;
  leads: number;
  qualified: number;
  drafts: number;
  sent: number;
  replies: number;
  sentToday: number;
};

export async function campaignPerformance(): Promise<CampaignPerformanceRow[]> {
  const settings = await resolveSettings();
  const dayStart = startOfLocalDay(new Date(), settings.timezone);

  const campaigns = await prisma.campaign.findMany({
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    include: {
      _count: { select: { leads: true, sentEmails: true } },
    },
  });

  return Promise.all(
    campaigns.map(async (campaign) => {
      const [qualified, drafts, replies, sentToday] = await Promise.all([
        prisma.lead.count({ where: { campaignId: campaign.id, qualified: true } }),
        prisma.emailDraft.count({ where: { campaignId: campaign.id, status: { in: ['DRAFT', 'BLOCKED'] } } }),
        prisma.lead.count({ where: { campaignId: campaign.id, status: 'REPLIED' } }),
        prisma.sentEmail.count({ where: { campaignId: campaign.id, sentAt: { gte: dayStart } } }),
      ]);

      return {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        sendingMode: campaign.sendingMode,
        isDemo: campaign.isDemo,
        leadsTarget: campaign.leadsTarget,
        dailySendLimit: campaign.dailySendLimit,
        minimumScore: campaign.minimumScore,
        leads: campaign._count.leads,
        qualified,
        drafts,
        sent: campaign._count.sentEmails,
        replies,
        sentToday,
      };
    }),
  );
}
