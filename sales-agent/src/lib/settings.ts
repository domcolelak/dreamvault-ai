import type { AppSettings, EmailStatus } from '@prisma/client';
import { prisma } from './db';
import { env, envDefaults } from './env';

export const DEMO_USER_EMAIL = 'owner@sales-agent.local';

/** The MVP is single-operator: one implicit owner row, created on demand. */
export async function getOwner() {
  const existing = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
  if (existing) return existing;
  return prisma.user.create({ data: { email: DEMO_USER_EMAIL, name: 'Owner' } });
}

export type ResolvedSettings = {
  userId: string;
  llmProvider: string;
  llmModel: string | null;
  llmBaseUrl: string | null;
  senderName: string | null;
  senderEmail: string | null;
  globalDailyEmailLimit: number;
  workingHoursStart: number;
  workingHoursEnd: number;
  timezone: string;
  sendMinGapMinutes: number;
  sendMaxGapMinutes: number;
  autoSendEmailStatuses: EmailStatus[];
  searchProvider: string;
  verificationProvider: string;
  enrichmentProvider: string;
};

/**
 * Stored settings win over ENV, ENV wins over built-in defaults. Credentials are
 * never stored in the database — they stay in ENV only.
 */
export async function resolveSettings(): Promise<ResolvedSettings> {
  const owner = await getOwner();
  const stored: AppSettings | null = await prisma.appSettings.findUnique({ where: { userId: owner.id } });
  const defaults = envDefaults();
  const e = env();

  return {
    userId: owner.id,
    llmProvider: stored?.llmProvider ?? defaults.llmProvider,
    llmModel: stored?.llmModel ?? defaults.llmModel ?? null,
    llmBaseUrl: stored?.llmBaseUrl ?? defaults.llmBaseUrl ?? null,
    senderName: stored?.senderName ?? e.SMTP_FROM_NAME,
    senderEmail: stored?.senderEmail ?? e.SMTP_FROM_EMAIL,
    globalDailyEmailLimit: stored?.globalDailyEmailLimit ?? defaults.globalDailyEmailLimit,
    workingHoursStart: stored?.workingHoursStart ?? defaults.workingHoursStart,
    workingHoursEnd: stored?.workingHoursEnd ?? defaults.workingHoursEnd,
    timezone: stored?.timezone ?? defaults.timezone,
    sendMinGapMinutes: stored?.sendMinGapMinutes ?? defaults.sendMinGapMinutes,
    sendMaxGapMinutes: stored?.sendMaxGapMinutes ?? defaults.sendMaxGapMinutes,
    autoSendEmailStatuses: stored?.autoSendEmailStatuses ?? ['VERIFIED', 'VALID'],
    searchProvider: stored?.searchProvider ?? defaults.searchProvider,
    verificationProvider: stored?.verificationProvider ?? defaults.verificationProvider,
    enrichmentProvider: stored?.enrichmentProvider ?? defaults.enrichmentProvider,
  };
}

export async function ensureSettingsRow(): Promise<AppSettings> {
  const owner = await getOwner();
  const existing = await prisma.appSettings.findUnique({ where: { userId: owner.id } });
  if (existing) return existing;
  const defaults = envDefaults();
  return prisma.appSettings.create({
    data: {
      userId: owner.id,
      globalDailyEmailLimit: defaults.globalDailyEmailLimit,
      workingHoursStart: defaults.workingHoursStart,
      workingHoursEnd: defaults.workingHoursEnd,
      timezone: defaults.timezone,
      sendMinGapMinutes: defaults.sendMinGapMinutes,
      sendMaxGapMinutes: defaults.sendMaxGapMinutes,
    },
  });
}
