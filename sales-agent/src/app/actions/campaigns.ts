'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { applyInterpretation, interpretBrief } from '@/lib/agent/campaign-interpreter';
import { cancelCampaignJobs } from '@/lib/agent/jobs';
import { generateSearchStrategy } from '@/lib/agent/search-strategy';
import { triggerDiscovery, triggerDraftGeneration } from '@/lib/agent/runner';
import { scheduleSends } from '@/lib/agent/scheduler';
import { sendDraft } from '@/lib/agent/send';
import { prisma } from '@/lib/db';
import { errorMessage } from '@/lib/logger';
import { getOwner } from '@/lib/settings';

export type ActionResult = { ok: boolean; message: string; campaignId?: string };

const createSchema = z.object({
  rawBrief: z.string().trim().min(30, 'Describe what you sell and who to find — at least a couple of sentences.'),
  leadsTarget: z.coerce.number().int().positive().max(10_000).default(30),
  dailySendLimit: z.coerce.number().int().positive().max(1000).default(20),
  minimumScore: z.coerce.number().int().min(0).max(100).default(75),
});

/**
 * Creates a campaign from a free-text brief and asks the LLM to interpret it.
 * The campaign always starts as DRAFT / DRAFT_ONLY: automatic sending is only
 * ever enabled by an explicit, separate operator action.
 */
export async function createCampaign(formData: FormData): Promise<ActionResult> {
  const parsed = createSchema.safeParse({
    rawBrief: formData.get('rawBrief'),
    leadsTarget: formData.get('leadsTarget') ?? undefined,
    dailySendLimit: formData.get('dailySendLimit') ?? undefined,
    minimumScore: formData.get('minimumScore') ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const owner = await getOwner();
  const campaign = await prisma.campaign.create({
    data: {
      userId: owner.id,
      name: 'Untitled campaign',
      rawBrief: parsed.data.rawBrief,
      leadsTarget: parsed.data.leadsTarget,
      dailySendLimit: parsed.data.dailySendLimit,
      minimumScore: parsed.data.minimumScore,
      status: 'DRAFT',
      sendingMode: 'DRAFT_ONLY',
    },
  });

  try {
    const { interpretation } = await interpretBrief(parsed.data.rawBrief);
    await applyInterpretation(campaign.id, interpretation, { approved: false });
  } catch (error) {
    revalidatePath('/campaigns');
    return {
      ok: false,
      campaignId: campaign.id,
      message: `Campaign saved, but the brief could not be interpreted: ${errorMessage(error)}`,
    };
  }

  revalidatePath('/campaigns');
  revalidatePath('/overview');
  return { ok: true, campaignId: campaign.id, message: 'Campaign created and brief interpreted.' };
}

export async function reinterpretBrief(campaignId: string): Promise<ActionResult> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (campaign === null) return { ok: false, message: 'Campaign not found.' };

  try {
    const { interpretation } = await interpretBrief(campaign.rawBrief);
    await applyInterpretation(campaignId, interpretation, { approved: false });
  } catch (error) {
    return { ok: false, message: `Interpretation failed: ${errorMessage(error)}` };
  }
  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: true, message: 'Brief re-interpreted. Review the configuration before activating.' };
}

const listField = (value: FormDataEntryValue | null): string[] =>
  typeof value === 'string'
    ? value
        .split(/[\n,]/)
        .map((entry) => entry.trim())
        .filter((entry) => entry !== '')
    : [];

const optionalInt = (value: FormDataEntryValue | null): number | null => {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Saves the operator's edits to the AI interpretation and marks it reviewed. */
export async function updateCampaignConfig(campaignId: string, formData: FormData): Promise<ActionResult> {
  const name = String(formData.get('name') ?? '').trim();
  if (name === '') return { ok: false, message: 'Campaign name is required.' };

  const minimumScore = optionalInt(formData.get('minimumScore')) ?? 75;
  const leadsTarget = optionalInt(formData.get('leadsTarget')) ?? 30;
  const dailySendLimit = optionalInt(formData.get('dailySendLimit')) ?? 20;

  if (minimumScore < 0 || minimumScore > 100) return { ok: false, message: 'Minimum score must be 0-100.' };
  if (leadsTarget < 1) return { ok: false, message: 'Lead target must be at least 1.' };
  if (dailySendLimit < 1) return { ok: false, message: 'Daily send limit must be at least 1.' };

  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      name,
      productOrService: String(formData.get('productOrService') ?? '').trim() || null,
      targetCompanyDescription: String(formData.get('targetCompanyDescription') ?? '').trim() || null,
      targetRegions: listField(formData.get('targetRegions')),
      industries: listField(formData.get('industries')),
      companySizeMin: optionalInt(formData.get('companySizeMin')),
      companySizeMax: optionalInt(formData.get('companySizeMax')),
      decisionMakerRoles: listField(formData.get('decisionMakerRoles')),
      buyingSignals: listField(formData.get('buyingSignals')),
      exclusions: listField(formData.get('exclusions')),
      preferredLanguages: listField(formData.get('preferredLanguages')),
      interpretationNotes: String(formData.get('interpretationNotes') ?? '').trim() || null,
      minimumScore,
      leadsTarget,
      dailySendLimit,
      interpretationApproved: true,
    },
  });

  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: true, message: 'Configuration saved and marked as reviewed.' };
}

export async function setCampaignStatus(
  campaignId: string,
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED',
): Promise<ActionResult> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (campaign === null) return { ok: false, message: 'Campaign not found.' };

  if (status === 'ACTIVE' && !campaign.interpretationApproved) {
    return {
      ok: false,
      message: 'Review and save the campaign configuration before activating it.',
    };
  }

  await prisma.campaign.update({ where: { id: campaignId }, data: { status } });

  if (status === 'PAUSED' || status === 'COMPLETED') {
    const cancelled = await cancelCampaignJobs(campaignId);
    await prisma.emailDraft.updateMany({
      where: { campaignId, status: 'DRAFT', scheduledAt: { not: null } },
      data: { scheduledAt: null },
    });
    revalidatePath(`/campaigns/${campaignId}`);
    revalidatePath('/campaigns');
    return { ok: true, message: `Campaign ${status.toLowerCase()}; ${cancelled} queued job(s) cancelled.` };
  }

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath('/campaigns');
  return { ok: true, message: `Campaign is now ${status}.` };
}

/**
 * Switching a campaign to AUTOMATIC is the one place where automated sending is
 * enabled, and it always requires a reviewed configuration.
 */
export async function setSendingMode(
  campaignId: string,
  mode: 'DRAFT_ONLY' | 'AUTOMATIC',
): Promise<ActionResult> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (campaign === null) return { ok: false, message: 'Campaign not found.' };

  if (mode === 'AUTOMATIC' && !campaign.interpretationApproved) {
    return {
      ok: false,
      message: 'Review and save the campaign configuration before enabling automatic sending.',
    };
  }

  await prisma.campaign.update({ where: { id: campaignId }, data: { sendingMode: mode } });

  if (mode === 'DRAFT_ONLY') {
    await prisma.job.updateMany({
      where: { campaignId, type: 'EMAIL_SEND', status: { in: ['PENDING', 'RUNNING'] } },
      data: { status: 'CANCELLED', finishedAt: new Date(), lockedAt: null },
    });
    await prisma.emailDraft.updateMany({ where: { campaignId, scheduledAt: { not: null } }, data: { scheduledAt: null } });
  }

  revalidatePath(`/campaigns/${campaignId}`);
  return {
    ok: true,
    message:
      mode === 'AUTOMATIC'
        ? 'Automatic sending enabled. Drafts will be sent gradually inside your working hours.'
        : 'Switched back to draft-only. Scheduled sends were cancelled.',
  };
}

export async function runDiscoveryAction(campaignId: string): Promise<ActionResult> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (campaign === null) return { ok: false, message: 'Campaign not found.' };
  if (campaign.status === 'PAUSED' || campaign.status === 'COMPLETED') {
    return { ok: false, message: `Campaign is ${campaign.status}; resume it first.` };
  }

  const run = await triggerDiscovery(campaignId, 'manual-discovery');
  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: true, message: `Discovery queued (run ${run.id.slice(0, 8)}). Run the worker to process it.` };
}

export async function regenerateStrategyAction(campaignId: string): Promise<ActionResult> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (campaign === null) return { ok: false, message: 'Campaign not found.' };
  try {
    const strategy = await generateSearchStrategy(campaign);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, message: `Search strategy v${strategy.version} created with ${strategy.queries.length} queries.` };
  } catch (error) {
    return { ok: false, message: `Could not build a strategy: ${errorMessage(error)}` };
  }
}

export async function generateDraftsAction(campaignId: string): Promise<ActionResult> {
  const { queued } = await triggerDraftGeneration(campaignId);
  revalidatePath(`/campaigns/${campaignId}`);
  return {
    ok: true,
    message:
      queued === 0
        ? 'No leads are waiting for a draft.'
        : `Queued draft generation for ${queued} lead(s). Run the worker to process it.`,
  };
}

export async function scheduleSendsAction(campaignId: string): Promise<ActionResult> {
  const outcome = await scheduleSends(campaignId);
  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: outcome.scheduled > 0, message: outcome.reason };
}

/** Manual send of a single draft, available in DRAFT_ONLY mode too. */
export async function sendDraftNowAction(draftId: string): Promise<ActionResult> {
  const draft = await prisma.emailDraft.findUnique({
    where: { id: draftId },
    select: { campaignId: true, leadId: true, campaign: { select: { sendingMode: true, status: true } } },
  });
  if (draft === null) return { ok: false, message: 'Draft not found.' };

  // A manual send still goes through the same validation, but the operator's
  // click substitutes for the campaign-level AUTOMATIC switch.
  const original = draft.campaign;
  const needsTemporaryMode = original.sendingMode !== 'AUTOMATIC' || original.status !== 'ACTIVE';
  if (needsTemporaryMode) {
    await prisma.campaign.update({
      where: { id: draft.campaignId },
      data: { sendingMode: 'AUTOMATIC', status: 'ACTIVE' },
    });
  }

  try {
    const outcome = await sendDraft(draftId);
    revalidatePath(`/leads/${draft.leadId}`);
    revalidatePath(`/campaigns/${draft.campaignId}`);
    return { ok: outcome.sent, message: outcome.sent ? 'Email sent.' : outcome.reason };
  } finally {
    if (needsTemporaryMode) {
      await prisma.campaign.update({
        where: { id: draft.campaignId },
        data: { sendingMode: original.sendingMode, status: original.status },
      });
    }
  }
}

export async function discardDraftAction(draftId: string): Promise<ActionResult> {
  const draft = await prisma.emailDraft.findUnique({ where: { id: draftId }, select: { leadId: true } });
  if (draft === null) return { ok: false, message: 'Draft not found.' };
  await prisma.emailDraft.update({
    where: { id: draftId },
    data: { status: 'DISCARDED', scheduledAt: null, blockReason: 'Discarded by the operator.' },
  });
  revalidatePath(`/leads/${draft.leadId}`);
  return { ok: true, message: 'Draft discarded.' };
}

export async function deleteCampaignAction(campaignId: string): Promise<ActionResult> {
  await prisma.campaign.delete({ where: { id: campaignId } });
  revalidatePath('/campaigns');
  revalidatePath('/overview');
  return { ok: true, message: 'Campaign deleted.' };
}
