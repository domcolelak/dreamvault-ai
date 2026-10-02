import { prisma } from '../db';
import { logAgent } from '../logger';
import { getEmailProvider } from '../providers/email';
import { resolveSettings } from '../settings';
import { composeBody, sendEmail } from '../tools/sendEmail';
import { setLeadStatus } from './lead-status';
import { validateBeforeSend } from './validation';

export type SendOutcome = {
  sent: boolean;
  sentEmailId: string | null;
  reason: string;
  failures: Array<{ code: string; detail: string }>;
};

/**
 * Sends one draft, but only after full pre-send validation. Every refusal is
 * recorded with its reasons so the operator can always answer "why was this not
 * sent?" from the dashboard.
 *
 * No follow-up is ever created here. One lead gets exactly one automated email.
 */
export async function sendDraft(draftId: string, options: { runId?: string | null } = {}): Promise<SendOutcome> {
  const draft = await prisma.emailDraft.findUnique({
    where: { id: draftId },
    include: {
      campaign: true,
      lead: { include: { company: true, contact: true } },
    },
  });

  if (draft === null) {
    return { sent: false, sentEmailId: null, reason: 'Draft no longer exists.', failures: [] };
  }
  if (draft.status === 'SENT') {
    return { sent: false, sentEmailId: null, reason: 'Draft was already sent.', failures: [] };
  }

  const validation = await validateBeforeSend({
    campaign: draft.campaign,
    lead: draft.lead,
    draft,
  });

  if (!validation.allowed) {
    const reason = validation.failures.map((failure) => `${failure.code}: ${failure.detail}`).join(' | ');
    await prisma.emailDraft.update({
      where: { id: draft.id },
      data: { status: 'BLOCKED', blockReason: reason.slice(0, 4000), scheduledAt: null },
    });
    await logAgent({
      type: 'SEND_DECISION',
      campaignId: draft.campaignId,
      leadId: draft.leadId,
      runId: options.runId ?? null,
      summary: `Refused to send to ${draft.lead.contact?.email ?? 'unknown recipient'}: ${validation.failures
        .map((failure) => failure.code)
        .join(', ')}`,
      output: { failures: validation.failures, warnings: validation.warnings },
    });
    return { sent: false, sentEmailId: null, reason, failures: validation.failures };
  }

  const contact = draft.lead.contact;
  const settings = await resolveSettings();
  // Validation guarantees both of these, but the types do not.
  if (contact === null || contact.email === null || settings.senderEmail === null) {
    return { sent: false, sentEmailId: null, reason: 'Recipient or sender address missing.', failures: [] };
  }

  const provider = getEmailProvider();
  const outcome = await sendEmail(provider, {
    to: contact.email,
    subject: draft.subject,
    body: draft.body,
    fromName: settings.senderName,
    fromEmail: settings.senderEmail,
    campaignId: draft.campaignId,
    leadId: draft.leadId,
  });

  if (!outcome.ok) {
    await prisma.emailDraft.update({
      where: { id: draft.id },
      data: { status: 'BLOCKED', blockReason: `Send failed: ${outcome.reason}`.slice(0, 4000), scheduledAt: null },
    });
    await setLeadStatus(draft.leadId, 'FAILED', `Send failed: ${outcome.reason}`, {
      failureReason: outcome.reason.slice(0, 4000),
    });
    await logAgent({
      type: 'SEND_RESULT',
      campaignId: draft.campaignId,
      leadId: draft.leadId,
      runId: options.runId ?? null,
      summary: `Send to ${contact.email} failed.`,
      error: outcome.reason,
      provider: provider.name,
    });
    return { sent: false, sentEmailId: null, reason: outcome.reason, failures: [] };
  }

  const exactBody = composeBody(draft.body, settings.senderName);

  const sentEmail = await prisma.sentEmail.create({
    data: {
      campaignId: draft.campaignId,
      leadId: draft.leadId,
      contactId: contact.id,
      draftId: draft.id,
      messageId: outcome.receipt.messageId,
      recipient: contact.email,
      fromEmail: settings.senderEmail,
      subject: draft.subject,
      body: exactBody,
      language: draft.language,
      sentAt: outcome.receipt.sentAt,
    },
  });

  await prisma.emailDraft.update({
    where: { id: draft.id },
    data: { status: 'SENT', scheduledAt: null, blockReason: null },
  });
  await prisma.contact.update({
    where: { id: contact.id },
    data: { status: 'CONTACTED', lastContactedAt: outcome.receipt.sentAt },
  });
  await setLeadStatus(draft.leadId, 'SENT', `First-touch email sent to ${contact.email}.`, {
    firstSentAt: draft.lead.firstSentAt ?? outcome.receipt.sentAt,
  });

  await logAgent({
    type: 'SEND_RESULT',
    campaignId: draft.campaignId,
    leadId: draft.leadId,
    runId: options.runId ?? null,
    summary: `Sent "${draft.subject}" to ${contact.email}.`,
    output: {
      messageId: outcome.receipt.messageId,
      accepted: outcome.receipt.accepted,
      rejected: outcome.receipt.rejected,
      language: draft.language,
    },
    provider: provider.name,
  });

  return { sent: true, sentEmailId: sentEmail.id, reason: 'Sent.', failures: [] };
}
