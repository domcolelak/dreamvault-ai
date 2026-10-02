import { prisma } from '../db';
import { logAgent } from '../logger';
import { fetchRecentMessages, imapStatus } from '../providers/imap/client';
import type { FetchedMessage } from '../providers/imap/client';
import { snippet } from '../utils/text';
import { applyReplyStop } from './dedup';
import { setLeadStatus } from './lead-status';

export type SyncOutcome = {
  configured: boolean;
  fetched: number;
  stored: number;
  replies: number;
  detail: string;
};

type MatchResult = {
  sentEmailId: string | null;
  leadId: string | null;
  contactId: string | null;
  campaignId: string | null;
  matchedBy: string | null;
};

const NO_MATCH: MatchResult = {
  sentEmailId: null,
  leadId: null,
  contactId: null,
  campaignId: null,
  matchedBy: null,
};

/**
 * Matches an inbound message to one of our sent emails, trying the strongest
 * signal first: In-Reply-To, then References, then the sender address.
 */
async function matchToSentEmail(message: FetchedMessage): Promise<MatchResult> {
  const headerIds = [
    ...(message.inReplyTo !== null ? [message.inReplyTo] : []),
    ...message.references,
  ]
    .map((id) => id.trim())
    .filter((id) => id !== '');

  if (headerIds.length > 0) {
    const bySameHeader = await prisma.sentEmail.findFirst({
      where: { messageId: { in: headerIds } },
      orderBy: { sentAt: 'desc' },
    });
    if (bySameHeader !== null) {
      return {
        sentEmailId: bySameHeader.id,
        leadId: bySameHeader.leadId,
        contactId: bySameHeader.contactId,
        campaignId: bySameHeader.campaignId,
        matchedBy: message.inReplyTo !== null && headerIds[0] === message.inReplyTo ? 'in-reply-to' : 'references',
      };
    }
  }

  if (message.fromEmail !== null) {
    const bySender = await prisma.sentEmail.findFirst({
      where: { recipient: message.fromEmail },
      orderBy: { sentAt: 'desc' },
    });
    if (bySender !== null && bySender.sentAt <= message.receivedAt) {
      return {
        sentEmailId: bySender.id,
        leadId: bySender.leadId,
        contactId: bySender.contactId,
        campaignId: bySender.campaignId,
        matchedBy: 'sender-email',
      };
    }
  }

  return NO_MATCH;
}

/** Looks like an auto-reply rather than a human answer. */
function isAutoResponse(message: FetchedMessage): boolean {
  const subject = (message.subject ?? '').toLowerCase();
  return /^(auto(matic)?[- ]?reply|out of office|abwesenheit|mimo kancel|automatická odpoveď|automaticka odpoved)/.test(
    subject,
  );
}

/**
 * Pulls recent inbox messages, stores the ones belonging to our outreach, and
 * stops automation the moment a reply is recognised.
 */
export async function syncInbox(options: { sinceDays?: number; limit?: number } = {}): Promise<SyncOutcome> {
  const status = imapStatus();
  if (!status.configured) {
    return { configured: false, fetched: 0, stored: 0, replies: 0, detail: status.detail };
  }

  const since = new Date(Date.now() - (options.sinceDays ?? 14) * 24 * 60 * 60 * 1000);

  let messages: FetchedMessage[];
  try {
    messages = await fetchRecentMessages(since, options.limit ?? 150);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'IMAP fetch failed.';
    await logAgent({ type: 'IMAP_SYNC', summary: 'IMAP sync failed.', error: detail, provider: 'imap' });
    return { configured: true, fetched: 0, stored: 0, replies: 0, detail };
  }

  let stored = 0;
  let replies = 0;

  for (const message of messages) {
    // A message with no Message-ID cannot be deduplicated; fall back to a
    // synthetic but stable key so re-syncing does not duplicate rows.
    const messageId =
      message.messageId ?? `synthetic:${message.mailbox}:${message.uid}:${message.receivedAt.toISOString()}`;

    const existing = await prisma.inboundEmail.findUnique({ where: { messageId }, select: { id: true } });
    if (existing !== null) continue;

    const match = await matchToSentEmail(message);
    // Only inbound mail we can tie to our outreach is kept; the rest of the
    // mailbox is none of this application's business.
    if (match.sentEmailId === null) continue;

    const auto = isAutoResponse(message);

    await prisma.inboundEmail.create({
      data: {
        messageId,
        inReplyTo: message.inReplyTo,
        references: message.references.join(' ') || null,
        fromEmail: message.fromEmail ?? 'unknown',
        fromName: message.fromName,
        toEmail: message.toEmail,
        subject: message.subject,
        bodyText: message.text?.slice(0, 20_000) ?? null,
        bodySnippet: message.text !== null ? snippet(message.text, 400) : null,
        receivedAt: message.receivedAt,
        uid: message.uid,
        mailbox: message.mailbox,
        matchedBy: match.matchedBy,
        isReply: !auto,
        needsManualHandling: !auto,
        campaignId: match.campaignId,
        leadId: match.leadId,
        contactId: match.contactId,
        sentEmailId: match.sentEmailId,
      },
    });
    stored += 1;

    if (auto) continue;

    // A real reply: hard stop on all automation for this contact.
    if (match.contactId !== null) {
      await applyReplyStop(match.contactId, message.fromEmail, message.receivedAt);
    }
    if (match.leadId !== null) {
      await prisma.job.updateMany({
        where: { leadId: match.leadId, status: { in: ['PENDING', 'RUNNING'] } },
        data: { status: 'CANCELLED', finishedAt: new Date(), lockedAt: null },
      });
      await prisma.emailDraft.updateMany({
        where: { leadId: match.leadId, status: { in: ['DRAFT', 'APPROVED'] } },
        data: { status: 'DISCARDED', blockReason: 'Contact replied; further communication is manual.', scheduledAt: null },
      });
      await setLeadStatus(match.leadId, 'REPLIED', `Reply received from ${message.fromEmail ?? 'the contact'}.`, {
        repliedAt: message.receivedAt,
        automationStopped: true,
      });
    }

    replies += 1;

    await logAgent({
      type: 'IMAP_SYNC',
      campaignId: match.campaignId,
      leadId: match.leadId,
      summary: `Reply detected from ${message.fromEmail ?? 'unknown'} (matched by ${match.matchedBy}). Automation stopped for this contact.`,
      output: { subject: message.subject, receivedAt: message.receivedAt.toISOString() },
      provider: 'imap',
    });
  }

  const detail = `Fetched ${messages.length} message(s); stored ${stored} related to outreach; ${replies} reply/replies stopped automation.`;
  await logAgent({ type: 'IMAP_SYNC', summary: detail, provider: 'imap' });

  return { configured: true, fetched: messages.length, stored, replies, detail };
}
