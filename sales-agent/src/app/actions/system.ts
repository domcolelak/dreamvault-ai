'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { syncInbox } from '@/lib/agent/imap-sync';
import { tick } from '@/lib/agent/runner';
import { prisma } from '@/lib/db';
import { createLLMProvider } from '@/lib/llm';
import { errorMessage } from '@/lib/logger';
import { getEmailProvider } from '@/lib/providers/email';
import { testImapConnection } from '@/lib/providers/imap/client';
import { ensureSettingsRow, resolveSettings } from '@/lib/settings';
import { emailDomain, isValidEmailSyntax } from '@/lib/utils/text';
import { normalizeDomain } from '@/lib/utils/url';

export type ActionResult = { ok: boolean; message: string };

/** Processes a batch of queued jobs from the UI, for operators without a worker. */
export async function runWorkerTick(max = 5): Promise<ActionResult> {
  try {
    const result = await tick(max);
    revalidatePath('/overview');
    revalidatePath('/campaigns');
    revalidatePath('/leads');
    if (result.processed === 0) return { ok: true, message: 'Queue is empty — nothing to do.' };
    const notes = result.details.map((detail) => `${detail.type}: ${detail.note}`).join(' · ');
    return {
      ok: result.failed === 0,
      message: `Processed ${result.processed} job(s), ${result.succeeded} ok, ${result.failed} failed. ${notes}`,
    };
  } catch (error) {
    return { ok: false, message: `Worker tick failed: ${errorMessage(error)}` };
  }
}

export async function syncInboxAction(): Promise<ActionResult> {
  const outcome = await syncInbox();
  revalidatePath('/inbox');
  revalidatePath('/overview');
  return { ok: outcome.configured, message: outcome.detail };
}

export async function testOllamaAction(): Promise<ActionResult> {
  const settings = await resolveSettings();
  const llm = createLLMProvider({
    provider: settings.llmProvider,
    model: settings.llmModel,
    baseUrl: settings.llmBaseUrl,
  });
  const health = await llm.health();
  const suffix = health.models !== undefined && health.models.length > 0
    ? ` Available models: ${health.models.slice(0, 12).join(', ')}.`
    : '';
  return { ok: health.ok, message: `${health.detail}${suffix}` };
}

export async function testSmtpAction(): Promise<ActionResult> {
  const result = await getEmailProvider().verifyConnection();
  return { ok: result.ok, message: result.detail };
}

export async function testImapAction(): Promise<ActionResult> {
  const result = await testImapConnection();
  return { ok: result.ok, message: result.detail };
}

const settingsSchema = z.object({
  llmProvider: z.string().trim().min(1),
  llmModel: z.string().trim().min(1).nullable(),
  llmBaseUrl: z.string().trim().url().nullable(),
  senderName: z.string().trim().min(1).nullable(),
  senderEmail: z.string().trim().email().nullable(),
  globalDailyEmailLimit: z.coerce.number().int().min(1).max(10_000),
  workingHoursStart: z.coerce.number().int().min(0).max(23),
  workingHoursEnd: z.coerce.number().int().min(1).max(24),
  timezone: z.string().trim().min(1),
  sendMinGapMinutes: z.coerce.number().int().min(1).max(600),
  sendMaxGapMinutes: z.coerce.number().int().min(1).max(600),
  searchProvider: z.string().trim().min(1),
  verificationProvider: z.string().trim().min(1),
  enrichmentProvider: z.string().trim().min(1),
  autoSendEmailStatuses: z.array(z.enum(['VERIFIED', 'VALID', 'UNKNOWN', 'GUESSED'])).min(1),
});

const nullableText = (value: FormDataEntryValue | null): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

export async function updateSettingsAction(formData: FormData): Promise<ActionResult> {
  const statuses = formData.getAll('autoSendEmailStatuses').map((value) => String(value));

  const parsed = settingsSchema.safeParse({
    llmProvider: formData.get('llmProvider'),
    llmModel: nullableText(formData.get('llmModel')),
    llmBaseUrl: nullableText(formData.get('llmBaseUrl')),
    senderName: nullableText(formData.get('senderName')),
    senderEmail: nullableText(formData.get('senderEmail')),
    globalDailyEmailLimit: formData.get('globalDailyEmailLimit'),
    workingHoursStart: formData.get('workingHoursStart'),
    workingHoursEnd: formData.get('workingHoursEnd'),
    timezone: formData.get('timezone'),
    sendMinGapMinutes: formData.get('sendMinGapMinutes'),
    sendMaxGapMinutes: formData.get('sendMaxGapMinutes'),
    searchProvider: formData.get('searchProvider'),
    verificationProvider: formData.get('verificationProvider'),
    enrichmentProvider: formData.get('enrichmentProvider'),
    autoSendEmailStatuses: statuses,
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, message: `${issue?.path.join('.') ?? 'input'}: ${issue?.message ?? 'invalid'}` };
  }
  if (parsed.data.workingHoursEnd <= parsed.data.workingHoursStart) {
    return { ok: false, message: 'Working hours end must be later than the start hour.' };
  }
  if (parsed.data.sendMaxGapMinutes < parsed.data.sendMinGapMinutes) {
    return { ok: false, message: 'Maximum send gap must be at least the minimum gap.' };
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: parsed.data.timezone });
  } catch {
    return { ok: false, message: `"${parsed.data.timezone}" is not a recognised IANA timezone.` };
  }

  const row = await ensureSettingsRow();
  await prisma.appSettings.update({
    where: { id: row.id },
    data: { ...parsed.data },
  });

  revalidatePath('/settings');
  return { ok: true, message: 'Settings saved.' };
}

const suppressionSchema = z.object({
  scope: z.enum(['EMAIL', 'DOMAIN']),
  value: z.string().trim().min(3),
  reason: z.enum(['OPT_OUT', 'REPLIED', 'MANUAL_BLOCK', 'BOUNCE', 'COMPLAINT', 'OTHER']),
  note: z.string().trim().max(500).nullable(),
});

export async function addSuppressionAction(formData: FormData): Promise<ActionResult> {
  const parsed = suppressionSchema.safeParse({
    scope: formData.get('scope'),
    value: formData.get('value'),
    reason: formData.get('reason'),
    note: nullableText(formData.get('note')),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid input.' };

  let value = parsed.data.value.toLowerCase();
  if (parsed.data.scope === 'EMAIL') {
    if (!isValidEmailSyntax(value) || emailDomain(value) === null) {
      return { ok: false, message: `"${value}" is not a valid email address.` };
    }
  } else {
    const domain = normalizeDomain(value);
    if (domain === null) return { ok: false, message: `"${value}" is not a valid domain.` };
    value = domain;
  }

  await prisma.suppressionEntry.upsert({
    where: { scope_value: { scope: parsed.data.scope, value } },
    update: { reason: parsed.data.reason, note: parsed.data.note },
    create: { scope: parsed.data.scope, value, reason: parsed.data.reason, note: parsed.data.note },
  });

  revalidatePath('/suppression');
  return { ok: true, message: `${value} added to the suppression list.` };
}

export async function removeSuppressionAction(id: string): Promise<ActionResult> {
  await prisma.suppressionEntry.delete({ where: { id } });
  revalidatePath('/suppression');
  return { ok: true, message: 'Entry removed.' };
}

export async function markInboundHandledAction(id: string): Promise<ActionResult> {
  await prisma.inboundEmail.update({
    where: { id },
    data: { needsManualHandling: false, handledAt: new Date() },
  });
  revalidatePath('/inbox');
  revalidatePath('/overview');
  return { ok: true, message: 'Marked as handled.' };
}

/** Takes a lead out of automation entirely and hands it to the operator. */
export async function stopAutomationAction(leadId: string): Promise<ActionResult> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { contactId: true } });
  if (lead === null) return { ok: false, message: 'Lead not found.' };

  await prisma.lead.update({
    where: { id: leadId },
    data: { automationStopped: true, status: 'MANUAL' },
  });
  await prisma.leadStatusHistory.create({
    data: { leadId, to: 'MANUAL', reason: 'Automation stopped manually by the operator.' },
  });
  await prisma.job.updateMany({
    where: { leadId, status: { in: ['PENDING', 'RUNNING'] } },
    data: { status: 'CANCELLED', finishedAt: new Date(), lockedAt: null },
  });
  await prisma.emailDraft.updateMany({
    where: { leadId, status: { in: ['DRAFT', 'APPROVED'] } },
    data: { scheduledAt: null, blockReason: 'Automation stopped manually.' },
  });
  if (lead.contactId !== null) {
    await prisma.contact.update({
      where: { id: lead.contactId },
      data: { globalDoNotAutoContact: true },
    });
  }

  revalidatePath(`/leads/${leadId}`);
  revalidatePath('/leads');
  return { ok: true, message: 'Automation stopped for this lead.' };
}
