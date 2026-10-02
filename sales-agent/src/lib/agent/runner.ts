import type { AgentRun, Campaign, Job } from '@prisma/client';
import { prisma } from '../db';
import { errorMessage, logAgent } from '../logger';
import { discoverContact } from './contact-discovery';
import { runDiscovery } from './discovery';
import { generateDraft } from './email-generation';
import { syncInbox } from './imap-sync';
import { claimNextJob, completeJob, enqueueJob, failJob } from './jobs';
import { isTerminal } from './lead-status';
import { qualifyLead } from './qualification';
import { cachedPages, researchCompany } from './research';
import { scheduleSends } from './scheduler';
import { ensureSearchStrategy, getActiveStrategy } from './search-strategy';
import { sendDraft } from './send';

export type TickResult = {
  processed: number;
  succeeded: number;
  failed: number;
  details: Array<{ jobId: string; type: string; ok: boolean; note: string }>;
};

export async function startRun(campaignId: string, trigger: string): Promise<AgentRun> {
  return prisma.agentRun.create({
    data: { campaignId, trigger, status: 'RUNNING', startedAt: new Date() },
  });
}

export async function finishRun(runId: string, error?: string): Promise<void> {
  await prisma.agentRun.update({
    where: { id: runId },
    data: {
      status: error === undefined ? 'SUCCEEDED' : 'FAILED',
      finishedAt: new Date(),
      error: error?.slice(0, 4000) ?? null,
    },
  });
}

async function bumpRun(runId: string | null, field: keyof Pick<AgentRun,
  'companiesFound' | 'leadsCreated' | 'leadsQualified' | 'leadsRejected' | 'contactsFound' | 'draftsCreated' | 'emailsSent'>,
  by = 1,
): Promise<void> {
  if (runId === null) return;
  await prisma.agentRun.update({ where: { id: runId }, data: { [field]: { increment: by } } }).catch(() => {
    // A run row may have been deleted with its campaign; counters are not critical.
  });
}

/** Loads a campaign only if it is in a state where automated work is allowed. */
async function loadWorkableCampaign(campaignId: string): Promise<Campaign | null> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (campaign === null) return null;
  if (campaign.status === 'PAUSED' || campaign.status === 'COMPLETED') return null;
  return campaign;
}

// --- Job handlers -----------------------------------------------------------

async function handleCampaignDiscovery(job: Job): Promise<string> {
  if (job.campaignId === null) return 'No campaign on job.';
  const campaign = await loadWorkableCampaign(job.campaignId);
  if (campaign === null) return 'Campaign is paused, completed or gone.';

  const strategy = await ensureSearchStrategy(campaign, { runId: job.runId });

  const existingLeadCount = await prisma.lead.count({ where: { campaignId: campaign.id } });
  const remaining = Math.max(0, campaign.leadsTarget - existingLeadCount);
  if (remaining === 0) {
    return `Lead target of ${campaign.leadsTarget} already reached (${existingLeadCount} leads).`;
  }

  const outcome = await runDiscovery(campaign, strategy, { runId: job.runId ?? '', maxNewLeads: remaining });
  await bumpRun(job.runId, 'companiesFound', outcome.rawDomains);
  await bumpRun(job.runId, 'leadsCreated', outcome.newLeads);

  if (!outcome.providerConfigured) return outcome.providerDetail;
  return `${outcome.newLeads} new lead(s) from ${outcome.searchedQueries} queries.`;
}

async function handleCompanyResearch(job: Job): Promise<string> {
  if (job.leadId === null || job.campaignId === null) return 'No lead on job.';
  const campaign = await loadWorkableCampaign(job.campaignId);
  if (campaign === null) return 'Campaign is paused, completed or gone.';

  const lead = await prisma.lead.findUnique({ where: { id: job.leadId }, include: { company: true } });
  if (lead === null) return 'Lead no longer exists.';
  if (isTerminal(lead.status)) return `Lead is ${lead.status}; nothing to research.`;

  const strategy = await getActiveStrategy(campaign.id);
  const outcome = await researchCompany(campaign, strategy, lead, { runId: job.runId });

  if (!outcome.ok) {
    await bumpRun(job.runId, 'leadsRejected');
    return outcome.reason ?? 'Research rejected the lead.';
  }

  await enqueueJob({
    type: 'LEAD_QUALIFICATION',
    campaignId: campaign.id,
    leadId: lead.id,
    runId: job.runId,
    idempotencyKey: `LEAD_QUALIFICATION:${lead.id}`,
  });
  return `Read ${outcome.pagesFetched} page(s), ${outcome.evidence} sourced claim(s).`;
}

async function handleLeadQualification(job: Job): Promise<string> {
  if (job.leadId === null || job.campaignId === null) return 'No lead on job.';
  const campaign = await loadWorkableCampaign(job.campaignId);
  if (campaign === null) return 'Campaign is paused, completed or gone.';

  const lead = await prisma.lead.findUnique({ where: { id: job.leadId }, include: { company: true } });
  if (lead === null) return 'Lead no longer exists.';
  if (isTerminal(lead.status)) return `Lead is ${lead.status}; nothing to qualify.`;

  const strategy = await getActiveStrategy(campaign.id);
  const outcome = await qualifyLead(campaign, strategy, lead, { runId: job.runId });

  if (!outcome.qualified) {
    await bumpRun(job.runId, 'leadsRejected');
    return `Rejected with score ${outcome.score}.`;
  }

  await bumpRun(job.runId, 'leadsQualified');
  await enqueueJob({
    type: 'CONTACT_DISCOVERY',
    campaignId: campaign.id,
    leadId: lead.id,
    runId: job.runId,
    idempotencyKey: `CONTACT_DISCOVERY:${lead.id}`,
  });
  return `Qualified with score ${outcome.score}.`;
}

async function handleContactDiscovery(job: Job): Promise<string> {
  if (job.leadId === null || job.campaignId === null) return 'No lead on job.';
  const campaign = await loadWorkableCampaign(job.campaignId);
  if (campaign === null) return 'Campaign is paused, completed or gone.';

  const lead = await prisma.lead.findUnique({ where: { id: job.leadId }, include: { company: true } });
  if (lead === null) return 'Lead no longer exists.';
  if (isTerminal(lead.status)) return `Lead is ${lead.status}; no contact lookup.`;

  const strategy = await getActiveStrategy(campaign.id);
  const outcome = await discoverContact(campaign, strategy, lead, {
    runId: job.runId,
    extraPages: cachedPages(lead.id),
  });

  if (!outcome.found) return outcome.reason;

  await bumpRun(job.runId, 'contactsFound');
  await prisma.lead.update({ where: { id: lead.id }, data: { status: 'READY' } });
  await prisma.leadStatusHistory.create({
    data: { leadId: lead.id, from: 'CONTACT_FOUND', to: 'READY', reason: 'Contact verified; ready to draft.' },
  });

  await enqueueJob({
    type: 'EMAIL_GENERATION',
    campaignId: campaign.id,
    leadId: lead.id,
    runId: job.runId,
    idempotencyKey: `EMAIL_GENERATION:${lead.id}`,
  });
  return `Contact ${outcome.email} (${outcome.emailStatus}).`;
}

async function handleEmailGeneration(job: Job): Promise<string> {
  if (job.leadId === null || job.campaignId === null) return 'No lead on job.';
  const campaign = await loadWorkableCampaign(job.campaignId);
  if (campaign === null) return 'Campaign is paused, completed or gone.';

  const lead = await prisma.lead.findUnique({
    where: { id: job.leadId },
    include: { company: true, contact: true },
  });
  if (lead === null) return 'Lead no longer exists.';
  if (isTerminal(lead.status)) return `Lead is ${lead.status}; no draft generated.`;

  const strategy = await getActiveStrategy(campaign.id);
  const outcome = await generateDraft(campaign, strategy, lead, { runId: job.runId });

  if (!outcome.ok) return outcome.reason;
  await bumpRun(job.runId, 'draftsCreated');

  // Only an AUTOMATIC campaign ever schedules a send. DRAFT_ONLY stops here.
  if (campaign.sendingMode === 'AUTOMATIC' && campaign.status === 'ACTIVE') {
    await scheduleSends(campaign.id);
  }
  return 'Draft created.';
}

async function handleEmailSend(job: Job): Promise<string> {
  const payload = job.payload;
  const draftId =
    payload !== null && typeof payload === 'object' && !Array.isArray(payload) && 'draftId' in payload
      ? String((payload as Record<string, unknown>).draftId)
      : null;
  if (draftId === null) return 'No draftId on job.';

  const outcome = await sendDraft(draftId, { runId: job.runId });
  if (!outcome.sent) return `Not sent: ${outcome.reason}`;

  await bumpRun(job.runId, 'emailsSent');
  return 'Sent.';
}

async function handleImapSync(): Promise<string> {
  const outcome = await syncInbox();
  return outcome.detail;
}

const HANDLERS: Record<Job['type'], (job: Job) => Promise<string>> = {
  CAMPAIGN_DISCOVERY: handleCampaignDiscovery,
  COMPANY_RESEARCH: handleCompanyResearch,
  LEAD_QUALIFICATION: handleLeadQualification,
  CONTACT_DISCOVERY: handleContactDiscovery,
  EMAIL_GENERATION: handleEmailGeneration,
  EMAIL_SEND: handleEmailSend,
  IMAP_SYNC: handleImapSync,
};

/**
 * Processes up to `max` due jobs. Safe to call concurrently: claiming a job is a
 * conditional update, so two callers never run the same job.
 */
export async function tick(max = 5): Promise<TickResult> {
  const result: TickResult = { processed: 0, succeeded: 0, failed: 0, details: [] };

  for (let i = 0; i < max; i += 1) {
    const job = await claimNextJob();
    if (job === null) break;

    result.processed += 1;
    try {
      const note = await HANDLERS[job.type](job);
      await completeJob(job.id);
      result.succeeded += 1;
      result.details.push({ jobId: job.id, type: job.type, ok: true, note });
    } catch (error) {
      const { willRetry } = await failJob(job.id, error);
      result.failed += 1;
      const note = `${errorMessage(error)}${willRetry ? ' (will retry)' : ' (gave up)'}`;
      result.details.push({ jobId: job.id, type: job.type, ok: false, note });
      await logAgent({
        type: 'SYSTEM',
        campaignId: job.campaignId,
        leadId: job.leadId,
        runId: job.runId,
        summary: `Job ${job.type} failed: ${errorMessage(error)}`,
        error: errorMessage(error),
      });
    }
  }

  // Close out runs whose jobs are all finished.
  await closeFinishedRuns();
  return result;
}

async function closeFinishedRuns(): Promise<void> {
  const openRuns = await prisma.agentRun.findMany({
    where: { status: 'RUNNING' },
    select: { id: true, startedAt: true },
  });

  for (const run of openRuns) {
    const outstanding = await prisma.job.count({
      where: { runId: run.id, status: { in: ['PENDING', 'RUNNING'] } },
    });
    if (outstanding > 0) continue;
    // Give a just-started run a grace period before declaring it done.
    if (run.startedAt !== null && Date.now() - run.startedAt.getTime() < 15_000) continue;
    await finishRun(run.id);
  }
}

/** Queues a full discovery pass for a campaign and returns the run. */
export async function triggerDiscovery(campaignId: string, trigger = 'manual'): Promise<AgentRun> {
  const run = await startRun(campaignId, trigger);
  await enqueueJob({
    type: 'CAMPAIGN_DISCOVERY',
    campaignId,
    runId: run.id,
    idempotencyKey: `CAMPAIGN_DISCOVERY:${run.id}`,
  });
  return run;
}

/** Queues draft generation for every lead that is ready but has no draft. */
export async function triggerDraftGeneration(campaignId: string): Promise<{ run: AgentRun; queued: number }> {
  const run = await startRun(campaignId, 'manual-drafts');

  const leads = await prisma.lead.findMany({
    where: {
      campaignId,
      automationStopped: false,
      status: { in: ['READY', 'CONTACT_FOUND'] },
      contactId: { not: null },
      drafts: { none: { status: { in: ['DRAFT', 'APPROVED', 'SENT'] } } },
    },
    select: { id: true },
  });

  for (const lead of leads) {
    await enqueueJob({
      type: 'EMAIL_GENERATION',
      campaignId,
      leadId: lead.id,
      runId: run.id,
      idempotencyKey: `EMAIL_GENERATION:${lead.id}`,
    });
  }

  return { run, queued: leads.length };
}
