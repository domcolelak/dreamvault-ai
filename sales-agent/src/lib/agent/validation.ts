import type { Campaign, Company, Contact, EmailDraft, Lead } from '@prisma/client';
import { prisma } from '../db';
import { getEmailProvider } from '../providers/email';
import { resolveSettings } from '../settings';
import { checkEmailQuality } from '../tools/writeEmail';
import { isUncontactableMailbox, isValidEmailSyntax } from '../utils/text';
import { checkCanContact } from './dedup';
import { countSentToday } from './rate-limit';

export type ValidationFailure = { code: string; detail: string };

export type ValidationResult =
  | { allowed: true; warnings: ValidationFailure[] }
  | { allowed: false; failures: ValidationFailure[]; warnings: ValidationFailure[] };

export type SendCandidate = {
  campaign: Campaign;
  lead: Lead & { company: Company; contact: Contact | null };
  draft: EmailDraft;
};

/**
 * The single gate every automatic send passes through. Each check is independent
 * and all are evaluated so the operator sees every reason at once, not just the
 * first one.
 */
export async function validateBeforeSend(candidate: SendCandidate): Promise<ValidationResult> {
  const failures: ValidationFailure[] = [];
  const warnings: ValidationFailure[] = [];
  const { campaign, lead, draft } = candidate;

  if (campaign.status !== 'ACTIVE') {
    failures.push({ code: 'CAMPAIGN_NOT_ACTIVE', detail: `Campaign status is ${campaign.status}, not ACTIVE.` });
  }
  if (campaign.sendingMode !== 'AUTOMATIC') {
    failures.push({
      code: 'SENDING_MODE_NOT_AUTOMATIC',
      detail: `Campaign sending mode is ${campaign.sendingMode}. Automatic sending requires AUTOMATIC.`,
    });
  }
  if (!campaign.interpretationApproved) {
    failures.push({
      code: 'INTERPRETATION_NOT_REVIEWED',
      detail: 'The campaign interpretation has not been reviewed by a human yet.',
    });
  }

  if (lead.automationStopped) {
    failures.push({ code: 'AUTOMATION_STOPPED', detail: 'Automation is stopped for this lead.' });
  }
  if (lead.status === 'REPLIED' || lead.repliedAt !== null) {
    failures.push({ code: 'LEAD_REPLIED', detail: 'This lead already replied; further contact is manual.' });
  }
  if (lead.qualified !== true) {
    failures.push({ code: 'LEAD_NOT_QUALIFIED', detail: 'Lead is not marked qualified.' });
  }
  if (lead.score === null) {
    failures.push({ code: 'LEAD_NOT_SCORED', detail: 'Lead has no score.' });
  } else if (lead.score < campaign.minimumScore) {
    failures.push({
      code: 'BELOW_MINIMUM_SCORE',
      detail: `Lead score ${lead.score} is below the campaign minimum of ${campaign.minimumScore}.`,
    });
  }

  if (campaign.exclusions.length > 0 && lead.rejectionReason !== null) {
    warnings.push({
      code: 'HAS_REJECTION_NOTE',
      detail: `Lead carries a rejection note: ${lead.rejectionReason.slice(0, 200)}`,
    });
  }

  const contact = lead.contact;
  if (contact === null || contact.email === null) {
    failures.push({ code: 'NO_EMAIL', detail: 'The lead has no contact email address.' });
  } else {
    const email = contact.email;
    if (!isValidEmailSyntax(email)) {
      failures.push({ code: 'EMAIL_SYNTAX', detail: `Address ${email} is not syntactically valid.` });
    }
    if (isUncontactableMailbox(email)) {
      failures.push({ code: 'ROLE_MAILBOX', detail: `Address ${email} is a mailbox that must never be contacted.` });
    }
    if (contact.emailStatus === 'INVALID') {
      failures.push({ code: 'EMAIL_INVALID', detail: `Address ${email} is marked INVALID.` });
    }

    const settings = await resolveSettings();
    if (!settings.autoSendEmailStatuses.includes(contact.emailStatus)) {
      failures.push({
        code: 'EMAIL_STATUS_NOT_TRUSTED',
        detail: `Address status ${contact.emailStatus} is not in the allowed automatic-send statuses (${settings.autoSendEmailStatuses.join(
          ', ',
        )}).`,
      });
    }

    const dedup = await checkCanContact({
      campaignId: campaign.id,
      contactId: contact.id,
      email,
      companyDomain: lead.company.domain,
    });
    if (!dedup.allowed) failures.push({ code: dedup.code, detail: dedup.detail });
  }

  // Personalization must rest on evidence we hold, with a source.
  const evidence = await prisma.leadEvidence.findMany({
    where: { leadId: lead.id, sourceUrl: { not: null } },
    select: { claim: true, sourceUrl: true },
  });
  if (evidence.length === 0) {
    failures.push({ code: 'NO_SOURCED_EVIDENCE', detail: 'No evidence with a source URL exists for this lead.' });
  }
  if (draft.personalizationEvidence.trim() === '') {
    failures.push({ code: 'NO_PERSONALIZATION', detail: 'Draft carries no personalization evidence.' });
  }

  if (draft.status === 'BLOCKED') {
    failures.push({ code: 'DRAFT_BLOCKED', detail: draft.blockReason ?? 'Draft is blocked.' });
  }
  if (draft.status === 'SENT') {
    failures.push({ code: 'DRAFT_ALREADY_SENT', detail: 'This draft was already sent.' });
  }

  // Re-run the content checks against the stored draft: it may have been edited.
  const contentIssues = checkEmailQuality(
    {
      language: draft.language,
      subject: draft.subject,
      body: draft.body,
      personalizationEvidence: draft.personalizationEvidence,
      sourceUrl: draft.sourceUrl,
    },
    evidence.map((row) => ({ claim: row.claim, sourceUrl: row.sourceUrl })),
  );
  for (const issue of contentIssues) {
    failures.push({ code: `CONTENT_${issue.code}`, detail: issue.detail });
  }

  // Limits.
  const sentToday = await countSentToday(campaign.id);
  if (sentToday.campaign >= campaign.dailySendLimit) {
    failures.push({
      code: 'CAMPAIGN_DAILY_LIMIT',
      detail: `Campaign sent ${sentToday.campaign} today; its limit is ${campaign.dailySendLimit}.`,
    });
  }
  const settings = await resolveSettings();
  if (sentToday.global >= settings.globalDailyEmailLimit) {
    failures.push({
      code: 'GLOBAL_DAILY_LIMIT',
      detail: `Mailbox sent ${sentToday.global} today; the global limit is ${settings.globalDailyEmailLimit}.`,
    });
  }

  // Mailbox health / configuration.
  const emailProvider = getEmailProvider();
  if (!emailProvider.configured) {
    failures.push({ code: 'SMTP_NOT_CONFIGURED', detail: emailProvider.status().detail });
  }
  if (settings.senderEmail === null) {
    failures.push({ code: 'NO_SENDER_EMAIL', detail: 'No sender address is configured (SMTP_FROM_EMAIL).' });
  }

  if (failures.length > 0) return { allowed: false, failures, warnings };
  return { allowed: true, warnings };
}
