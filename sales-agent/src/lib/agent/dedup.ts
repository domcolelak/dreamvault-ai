import { prisma } from '../db';
import { emailDomain } from '../utils/text';
import { normalizeDomain } from '../utils/url';

export type DedupVerdict = {
  allowed: boolean;
  /** Machine-readable reason, used in logs and in the UI. */
  code:
    | 'OK'
    | 'SUPPRESSED_EMAIL'
    | 'SUPPRESSED_DOMAIN'
    | 'ALREADY_CONTACTED_IN_CAMPAIGN'
    | 'GLOBAL_DO_NOT_AUTO_CONTACT'
    | 'CONTACT_REPLIED'
    | 'ALREADY_CONTACTED_ANY_CAMPAIGN'
    | 'DOMAIN_ALREADY_CONTACTED_IN_CAMPAIGN';
  detail: string;
};

const ok: DedupVerdict = { allowed: true, code: 'OK', detail: 'No duplicate or suppression match.' };

/** True when the address or its domain is on the suppression list. */
export async function findSuppression(email: string): Promise<{ scope: 'EMAIL' | 'DOMAIN'; reason: string } | null> {
  const normalized = email.trim().toLowerCase();
  const domain = emailDomain(normalized);

  const values = [normalized, ...(domain !== null ? [domain] : [])];
  const entry = await prisma.suppressionEntry.findFirst({
    where: { value: { in: values } },
    orderBy: { createdAt: 'desc' },
  });
  if (entry === null) return null;
  return { scope: entry.scope, reason: entry.reason };
}

/**
 * Full duplicate/suppression check for one (campaign, contact) pair. This runs
 * both when a draft is created and again immediately before any send, because
 * a reply may have arrived in between.
 */
export async function checkCanContact(params: {
  campaignId: string;
  contactId: string;
  email: string;
  companyDomain: string;
}): Promise<DedupVerdict> {
  const email = params.email.trim().toLowerCase();

  const suppression = await findSuppression(email);
  if (suppression !== null) {
    return {
      allowed: false,
      code: suppression.scope === 'EMAIL' ? 'SUPPRESSED_EMAIL' : 'SUPPRESSED_DOMAIN',
      detail: `On the suppression list (${suppression.scope.toLowerCase()}, reason: ${suppression.reason}).`,
    };
  }

  const contact = await prisma.contact.findUnique({
    where: { id: params.contactId },
    select: { globalDoNotAutoContact: true, status: true, repliedAt: true },
  });
  if (contact === null) {
    return { allowed: false, code: 'ALREADY_CONTACTED_IN_CAMPAIGN', detail: 'Contact no longer exists.' };
  }
  if (contact.globalDoNotAutoContact) {
    return {
      allowed: false,
      code: 'GLOBAL_DO_NOT_AUTO_CONTACT',
      detail: 'This contact is under a global do-not-auto-contact hold (they replied at least once).',
    };
  }
  if (contact.status === 'REPLIED' || contact.repliedAt !== null) {
    return { allowed: false, code: 'CONTACT_REPLIED', detail: 'This contact has already replied; handle manually.' };
  }
  if (contact.status === 'DO_NOT_CONTACT') {
    return { allowed: false, code: 'GLOBAL_DO_NOT_AUTO_CONTACT', detail: 'Contact is marked do-not-contact.' };
  }

  const alreadyInCampaign = await prisma.sentEmail.findFirst({
    where: { campaignId: params.campaignId, OR: [{ contactId: params.contactId }, { recipient: email }] },
    select: { id: true, sentAt: true },
  });
  if (alreadyInCampaign !== null) {
    return {
      allowed: false,
      code: 'ALREADY_CONTACTED_IN_CAMPAIGN',
      detail: `Already emailed in this campaign on ${alreadyInCampaign.sentAt.toISOString().slice(0, 10)}.`,
    };
  }

  const alreadyAnywhere = await prisma.sentEmail.findFirst({
    where: { recipient: email },
    select: { id: true, campaignId: true, sentAt: true },
  });
  if (alreadyAnywhere !== null) {
    return {
      allowed: false,
      code: 'ALREADY_CONTACTED_ANY_CAMPAIGN',
      detail: `This address was already contacted by another campaign on ${alreadyAnywhere.sentAt
        .toISOString()
        .slice(0, 10)}.`,
    };
  }

  // One company, one conversation per campaign — do not email two people at the
  // same company in the same campaign.
  const domain = normalizeDomain(params.companyDomain);
  if (domain !== null) {
    const domainContacted = await prisma.sentEmail.findFirst({
      where: { campaignId: params.campaignId, recipient: { endsWith: `@${domain}` } },
      select: { id: true, recipient: true },
    });
    if (domainContacted !== null) {
      return {
        allowed: false,
        code: 'DOMAIN_ALREADY_CONTACTED_IN_CAMPAIGN',
        detail: `Someone at ${domain} (${domainContacted.recipient}) was already contacted in this campaign.`,
      };
    }
  }

  return ok;
}

/**
 * Applies the global stop after a reply: the contact is flagged, every lead for
 * that contact stops automation, and the address is suppressed.
 */
export async function applyReplyStop(contactId: string, email: string | null, when: Date): Promise<void> {
  await prisma.contact.update({
    where: { id: contactId },
    data: {
      status: 'REPLIED',
      repliedAt: when,
      globalDoNotAutoContact: true,
    },
  });

  await prisma.lead.updateMany({
    where: { contactId, automationStopped: false },
    data: { automationStopped: true },
  });

  if (email !== null) {
    const normalized = email.trim().toLowerCase();
    await prisma.suppressionEntry.upsert({
      where: { scope_value: { scope: 'EMAIL', value: normalized } },
      update: {},
      create: {
        scope: 'EMAIL',
        value: normalized,
        reason: 'REPLIED',
        note: 'Added automatically when a reply was detected. Further communication is manual.',
      },
    });
  }
}
