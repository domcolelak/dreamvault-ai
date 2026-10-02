import type { Campaign, SearchStrategy } from '@prisma/client';
import { completeStructured, type LLMProvider } from '../llm';
import { campaignContext, SALES_AGENT_SYSTEM_PROMPT, strategyContext } from '../llm/prompts';
import { ContactSelectionSchema, contactSelectionJsonSchema } from '../llm/schemas';
import type { ContactSelection } from '../llm/schemas';
import type { ContactEnrichmentProvider, EnrichedContact } from '../providers/enrichment';
import { ProviderNotConfiguredError } from '../providers/types';
import { emailDomain, extractEmails, isGenericMailbox, isUncontactableMailbox, splitName, truncate } from '../utils/text';
import type { VisitedPage } from './visitWebsite';

export type ContactCandidateSet = {
  /** Addresses that literally appear in the fetched page text. */
  pageEmails: Array<{ email: string; sourceUrl: string }>;
  enriched: EnrichedContact[];
  enrichmentError: string | null;
  emailPattern: string | null;
};

/** Gathers contact raw material from the company's own pages and from enrichment. */
export async function gatherContactCandidates(
  enrichment: ContactEnrichmentProvider,
  domain: string,
  companyName: string | null,
  roles: string[],
  pages: VisitedPage[],
): Promise<ContactCandidateSet> {
  const pageEmails: Array<{ email: string; sourceUrl: string }> = [];
  const seen = new Set<string>();

  for (const page of pages) {
    if (!page.ok) continue;
    for (const email of extractEmails(page.text)) {
      if (seen.has(email)) continue;
      if (isUncontactableMailbox(email)) continue;
      seen.add(email);
      pageEmails.push({ email, sourceUrl: page.finalUrl });
    }
  }

  let enriched: EnrichedContact[] = [];
  let enrichmentError: string | null = null;
  let emailPattern: string | null = null;

  try {
    enriched = await enrichment.findContacts({ domain, companyName, roles });
    emailPattern = await enrichment.findEmailPattern(domain);
  } catch (error) {
    enrichmentError =
      error instanceof ProviderNotConfiguredError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Enrichment failed.';
  }

  return { pageEmails, enriched, enrichmentError, emailPattern };
}

/**
 * Picks the best contact for the campaign's requested decision maker roles.
 *
 * The model may only return an address that appears in the material it was given.
 * Any address it returns is cross-checked here against that material, and a
 * fabricated one is discarded — the code, not the prompt, is the backstop.
 */
export async function findContact(
  llm: LLMProvider,
  campaign: Campaign,
  strategy: SearchStrategy | null,
  domain: string,
  companyName: string | null,
  candidates: ContactCandidateSet,
  pages: VisitedPage[],
): Promise<{ selection: ContactSelection; model: string; durationMs: number; emailWasInSources: boolean }> {
  const pageBlocks = pages
    .filter((page) => page.ok)
    .map((page) => `--- PAGE: ${page.finalUrl}\n${truncate(page.text, 4000)}`)
    .join('\n\n');

  const knownEmails = candidates.pageEmails.map((entry) => `${entry.email} (found on ${entry.sourceUrl})`);
  const enrichedBlock = candidates.enriched
    .slice(0, 15)
    .map(
      (contact) =>
        `- ${contact.fullName ?? 'unknown name'} | ${contact.jobTitle ?? 'unknown title'} | ${contact.email ?? 'no email'}` +
        `${contact.emailVerified ? ' | provider-verified' : ''}${contact.linkedinUrl ? ` | ${contact.linkedinUrl}` : ''}`,
    )
    .join('\n');

  const result = await completeStructured(llm, {
    schema: ContactSelectionSchema,
    schemaName: 'ContactSelectionSchema',
    jsonSchema: contactSelectionJsonSchema,
    system: SALES_AGENT_SYSTEM_PROMPT,
    user: `${campaignContext(campaign)}

${strategyContext(strategy)}

=== COMPANY ===
Domain: ${domain}
Name: ${companyName ?? 'unknown'}

=== EMAIL ADDRESSES FOUND IN THE COMPANY'S OWN PAGES ===
${knownEmails.length > 0 ? knownEmails.join('\n') : '(none found)'}

=== CONTACTS FROM THE ENRICHMENT PROVIDER ===
${enrichedBlock || (candidates.enrichmentError ?? '(no enrichment provider configured)')}

=== PAGE TEXT (names and titles may appear here) ===
${pageBlocks || '(no pages available)'}

Select the single best person to contact for this campaign, in this priority order:
1. A person whose title matches one of the campaign's requested decision maker roles.
2. For a small company, the founder or owner, even if their title is not on the list.
3. A general business mailbox (for example an office or contact address) as a last resort — set isGeneric to true.

Hard rules:
- "email" must be copied character-for-character from the addresses or contacts listed above. If none is available, set email to null and emailFoundOnPage to false. Never construct an address from a name and a domain.
- Set emailFoundOnPage to true only for an address from the "FOUND IN THE COMPANY'S OWN PAGES" list.
- Names and titles must come from the material above, not from prior knowledge.
- "sourceUrl" must be a URL from the material above.
- "confidence" is how sure you are that this is the right person AND the right address for this campaign.
- If you cannot identify anybody, set found to false. That is an acceptable answer.`,
    temperature: 0.1,
    maxTokens: 900,
  });

  const selection = result.value;
  const allowedEmails = new Set<string>([
    ...candidates.pageEmails.map((entry) => entry.email),
    ...candidates.enriched
      .map((contact) => contact.email)
      .filter((email): email is string => email !== null)
      .map((email) => email.toLowerCase()),
  ]);

  let emailWasInSources = false;
  if (selection.email !== null) {
    const normalized = selection.email.trim().toLowerCase();
    emailWasInSources = allowedEmails.has(normalized);
    if (!emailWasInSources || emailDomain(normalized) === null) {
      // The model produced an address nobody gave it. Drop it rather than send to it.
      selection.email = null;
      selection.emailFoundOnPage = false;
      selection.reason = `${selection.reason ?? ''} [system: proposed address was not present in the sources and was discarded]`.trim();
    } else {
      selection.email = normalized;
      selection.isGeneric = selection.isGeneric || isGenericMailbox(normalized);
      selection.emailFoundOnPage = candidates.pageEmails.some((entry) => entry.email === normalized);
    }
  }

  if (selection.fullName !== null && (selection.firstName === null || selection.lastName === null)) {
    const parts = splitName(selection.fullName);
    selection.firstName = selection.firstName ?? parts.firstName;
    selection.lastName = selection.lastName ?? parts.lastName;
  }

  return { selection, model: result.model, durationMs: result.durationMs, emailWasInSources };
}

/**
 * Builds an address from an observed company pattern. Used only when enrichment
 * reported a real pattern for the domain; the result is always stored as GUESSED.
 */
export function applyEmailPattern(
  pattern: string,
  firstName: string | null,
  lastName: string | null,
  domain: string,
): string | null {
  if (firstName === null && lastName === null) return null;
  const first = (firstName ?? '').toLowerCase().replace(/[^a-z]/g, '');
  const last = (lastName ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (first === '' && last === '') return null;

  const local = pattern
    .replace(/\{first\}/gi, first)
    .replace(/\{last\}/gi, last)
    .replace(/\{f\}/gi, first.slice(0, 1))
    .replace(/\{l\}/gi, last.slice(0, 1))
    .replace(/[^a-z0-9._-]/g, '');

  if (local === '' || local.startsWith('.') || local.endsWith('.')) return null;
  return `${local}@${domain}`;
}
