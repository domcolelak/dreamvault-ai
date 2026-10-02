import type { Campaign, Company, Contact, Lead, SearchStrategy } from '@prisma/client';
import { prisma } from '../db';
import { getLLM } from '../llm';
import { logAgent } from '../logger';
import { resolveSettings } from '../settings';
import { writeEmail } from '../tools/writeEmail';
import type { EvidenceForEmail } from '../tools/writeEmail';
import { wordCount } from '../utils/text';
import { checkCanContact } from './dedup';
import { setLeadStatus } from './lead-status';

export type DraftOutcome = {
  ok: boolean;
  draftId: string | null;
  blocked: boolean;
  reason: string;
};

/**
 * Generates the first-touch email for a lead and stores it as a draft.
 *
 * A draft is created even when quality checks fail, but it is stored as BLOCKED
 * with the reason recorded, so the operator can see what the agent produced and
 * why it refuses to send it. Nothing is sent from this function.
 */
export async function generateDraft(
  campaign: Campaign,
  strategy: SearchStrategy | null,
  lead: Lead & { company: Company; contact: Contact | null },
  options: { runId: string | null },
): Promise<DraftOutcome> {
  if (lead.contact === null || lead.contact.email === null) {
    const reason = 'No contact with an email address is attached to this lead.';
    await setLeadStatus(lead.id, 'FAILED', reason, { failureReason: reason });
    return { ok: false, draftId: null, blocked: true, reason };
  }
  if (lead.automationStopped || lead.contact.globalDoNotAutoContact) {
    const reason = 'Automation is stopped for this contact (a reply was already received).';
    return { ok: false, draftId: null, blocked: true, reason };
  }

  const dedup = await checkCanContact({
    campaignId: campaign.id,
    contactId: lead.contact.id,
    email: lead.contact.email,
    companyDomain: lead.company.domain,
  });
  if (!dedup.allowed) {
    await setLeadStatus(lead.id, dedup.code.startsWith('SUPPRESSED') ? 'DO_NOT_CONTACT' : 'MANUAL', dedup.detail);
    await logAgent({
      type: 'EMAIL_GENERATION',
      campaignId: campaign.id,
      leadId: lead.id,
      runId: options.runId,
      summary: `Skipped drafting for ${lead.company.domain}: ${dedup.code}.`,
      output: dedup,
    });
    return { ok: false, draftId: null, blocked: true, reason: dedup.detail };
  }

  const evidenceRows = await prisma.leadEvidence.findMany({
    where: { leadId: lead.id },
    orderBy: { createdAt: 'asc' },
  });
  // Only sourced evidence may drive personalization.
  const evidence: EvidenceForEmail[] = evidenceRows
    .filter((row) => row.sourceUrl !== null)
    .map((row) => ({ claim: row.claim, sourceUrl: row.sourceUrl }));

  if (evidence.length === 0) {
    const reason =
      'No evidence with a source URL exists for this lead, so no honest personalization is possible.';
    await setLeadStatus(lead.id, 'FAILED', reason, { failureReason: reason });
    await logAgent({
      type: 'EMAIL_GENERATION',
      campaignId: campaign.id,
      leadId: lead.id,
      runId: options.runId,
      summary: `Refused to draft for ${lead.company.domain}: no sourced evidence.`,
    });
    return { ok: false, draftId: null, blocked: true, reason };
  }

  const settings = await resolveSettings();
  const llm = await getLLM();

  const generated = await writeEmail(llm, {
    campaign,
    strategy,
    companyName: lead.company.name,
    domain: lead.company.domain,
    companyDescription: lead.company.description,
    websiteLanguage: lead.company.websiteLanguage,
    country: lead.company.country,
    contact: {
      fullName: lead.contact.fullName,
      firstName: lead.contact.firstName,
      jobTitle: lead.contact.jobTitle,
      isGeneric: lead.contact.isGeneric,
    },
    recommendedAngle: lead.recommendedAngle,
    strongestSignal: lead.strongestSignal,
    evidence,
    senderName: settings.senderName,
  });

  const blocked = generated.issues.length > 0;
  const blockReason = blocked
    ? generated.issues.map((issue) => `${issue.code}: ${issue.detail}`).join(' | ')
    : null;

  // One active draft per lead: replace any previous unsent one.
  await prisma.emailDraft.deleteMany({
    where: { leadId: lead.id, status: { in: ['DRAFT', 'BLOCKED'] } },
  });

  const draft = await prisma.emailDraft.create({
    data: {
      campaignId: campaign.id,
      leadId: lead.id,
      contactId: lead.contact.id,
      language: generated.email.language,
      subject: generated.email.subject,
      body: generated.email.body,
      personalizationEvidence: generated.email.personalizationEvidence,
      sourceUrl: generated.email.sourceUrl,
      wordCount: wordCount(generated.email.body),
      status: blocked ? 'BLOCKED' : 'DRAFT',
      blockReason,
      model: generated.model,
    },
  });

  await setLeadStatus(
    lead.id,
    blocked ? 'FAILED' : 'DRAFTED',
    blocked ? `Draft failed quality checks: ${blockReason}` : 'First-touch email drafted.',
    blocked ? { failureReason: blockReason } : { failureReason: null },
  );

  await logAgent({
    type: 'EMAIL_GENERATION',
    campaignId: campaign.id,
    leadId: lead.id,
    runId: options.runId,
    summary: blocked
      ? `Drafted but blocked for ${lead.company.domain}: ${blockReason}`
      : `Drafted ${generated.email.language} email for ${lead.company.domain} (${wordCount(generated.email.body)} words).`,
    inputSummary: `Angle: ${lead.recommendedAngle ?? 'n/a'}\nEvidence: ${evidence
      .map((item) => item.claim)
      .join('; ')
      .slice(0, 1500)}`,
    output: { email: generated.email, issues: generated.issues },
    model: generated.model,
    provider: llm.name,
    durationMs: generated.durationMs,
  });

  return {
    ok: !blocked,
    draftId: draft.id,
    blocked,
    reason: blockReason ?? 'Draft ready.',
  };
}
