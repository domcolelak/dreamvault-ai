import type { Campaign, Company, Lead, SearchStrategy } from '@prisma/client';
import { prisma } from '../db';
import { getLLM } from '../llm';
import { logAgent } from '../logger';
import { getEnrichmentProvider } from '../providers/enrichment';
import { getSearchProvider } from '../providers/search';
import { getVerificationProvider } from '../providers/verification';
import { applyEmailPattern, findContact, gatherContactCandidates } from '../tools/findContact';
import { verifyEmail } from '../tools/verifyEmail';
import { visitWebsite } from '../tools/visitWebsite';
import type { VisitedPage } from '../tools/visitWebsite';
import { emailDomain } from '../utils/text';
import { normalizeDomain } from '../utils/url';
import { findSuppression } from './dedup';
import { setLeadStatus } from './lead-status';

export type ContactOutcome = {
  found: boolean;
  contactId: string | null;
  email: string | null;
  emailStatus: string | null;
  reason: string;
};

/**
 * Looks for pages that typically carry people and addresses. Which pages exist is
 * discovered from the site, not assumed; a missing page is simply skipped.
 */
async function fetchContactPages(domain: string, strategy: SearchStrategy | null): Promise<VisitedPage[]> {
  const search = await getSearchProvider();
  const urls = new Set<string>();

  if (search.configured) {
    // Let the search engine tell us which of the company's pages mention people.
    const queries = [`site:${domain} contact`, `site:${domain} team OR management OR about`];
    for (const query of queries) {
      try {
        for (const result of await search.search(query, { limit: 5 })) {
          const resultDomain = normalizeDomain(result.url);
          if (resultDomain === domain || resultDomain?.endsWith(`.${domain}`)) urls.add(result.url);
        }
      } catch {
        // A failed query is not fatal; the direct-path fallback below still runs.
      }
    }
  }

  // Direct paths as a fallback. These are conventional URL shapes, not business
  // assumptions, and a 404 just yields nothing.
  const hinted = (strategy?.pagesToInspect ?? []).map((page) => page.toLowerCase().replace(/[^a-z-]/g, ''));
  const paths = ['contact', 'contacts', 'kontakt', 'about', 'about-us', 'team', 'impressum', ...hinted];
  for (const path of [...new Set(paths)].slice(0, 10)) {
    if (path === '') continue;
    urls.add(`https://${domain}/${path}`);
  }

  const pages: VisitedPage[] = [];
  for (const url of [...urls].slice(0, 8)) {
    const page = await visitWebsite(url);
    if (page.ok) pages.push(page);
    if (pages.length >= 5) break;
  }
  return pages;
}

/**
 * Finds and stores the contact for a qualified lead.
 *
 * An address is only ever stored if it came from the company's own pages or from
 * an enrichment provider; a pattern-derived address is stored as GUESSED, which
 * the pre-send validation treats as not trustworthy enough to auto-send unless
 * the operator widened that setting.
 */
export async function discoverContact(
  campaign: Campaign,
  strategy: SearchStrategy | null,
  lead: Lead & { company: Company },
  options: { runId: string | null; extraPages?: VisitedPage[] },
): Promise<ContactOutcome> {
  const domain = lead.company.domain;
  const roles = strategy?.decisionMakerRoles.length ? strategy.decisionMakerRoles : campaign.decisionMakerRoles;

  const enrichment = await getEnrichmentProvider();
  const homepage = await visitWebsite(lead.company.websiteUrl ?? `https://${domain}`);
  const contactPages = await fetchContactPages(domain, strategy);
  const pages = [
    ...(homepage.ok ? [homepage] : []),
    ...contactPages,
    ...(options.extraPages ?? []),
  ].filter((page, index, all) => all.findIndex((other) => other.finalUrl === page.finalUrl) === index);

  const candidates = await gatherContactCandidates(enrichment, domain, lead.company.name, roles, pages);

  const llm = await getLLM();
  const selected = await findContact(llm, campaign, strategy, domain, lead.company.name, candidates, pages);
  const selection = selected.selection;

  let email = selection.email;
  let foundOnPage = selection.emailFoundOnPage;
  let patternUsed: string | null = null;

  // No address found, but enrichment reported a real pattern for this domain and
  // we know the person's name: derive one and mark it GUESSED.
  if (email === null && candidates.emailPattern !== null && selection.found) {
    const derived = applyEmailPattern(
      candidates.emailPattern,
      selection.firstName,
      selection.lastName,
      domain,
    );
    if (derived !== null) {
      email = derived;
      foundOnPage = false;
      patternUsed = candidates.emailPattern;
    }
  }

  if (email === null) {
    const reason = selection.found
      ? `Identified ${selection.fullName ?? 'a contact'} but found no usable business email address.`
      : (selection.reason ?? 'No suitable contact could be identified from public sources.');
    await setLeadStatus(lead.id, 'REJECTED', reason, { rejectionReason: reason });
    await logAgent({
      type: 'CONTACT_SELECTION',
      campaignId: campaign.id,
      leadId: lead.id,
      runId: options.runId,
      summary: `No contactable address for ${domain}.`,
      output: { selection, enrichmentError: candidates.enrichmentError, pagesRead: pages.map((p) => p.finalUrl) },
      model: selected.model,
      provider: llm.name,
      durationMs: selected.durationMs,
    });
    return { found: false, contactId: null, email: null, emailStatus: null, reason };
  }

  // The address must belong to this company, or to a domain we can at least see.
  const addressDomain = emailDomain(email);
  const offDomain = addressDomain !== null && addressDomain !== domain && !addressDomain.endsWith(`.${domain}`);

  const suppression = await findSuppression(email);
  if (suppression !== null) {
    const reason = `Contact address is suppressed (${suppression.scope.toLowerCase()}, ${suppression.reason}).`;
    await setLeadStatus(lead.id, 'DO_NOT_CONTACT', reason, { rejectionReason: reason, automationStopped: true });
    await logAgent({
      type: 'CONTACT_SELECTION',
      campaignId: campaign.id,
      leadId: lead.id,
      runId: options.runId,
      summary: `Contact for ${domain} is on the suppression list.`,
      output: { email, suppression },
    });
    return { found: false, contactId: null, email, emailStatus: null, reason };
  }

  const verifier = await getVerificationProvider();
  const check = await verifyEmail(verifier, email, { foundOnPage });
  const emailStatus = patternUsed !== null && check.status !== 'INVALID' && check.status !== 'VERIFIED'
    ? 'GUESSED'
    : check.status;

  if (emailStatus === 'INVALID') {
    const reason = `Contact address ${email} is invalid: ${check.detail}`;
    await setLeadStatus(lead.id, 'REJECTED', reason, { rejectionReason: reason });
    await logAgent({
      type: 'CONTACT_SELECTION',
      campaignId: campaign.id,
      leadId: lead.id,
      runId: options.runId,
      summary: `Rejected ${domain}: invalid contact address.`,
      output: { email, check },
    });
    return { found: false, contactId: null, email, emailStatus, reason };
  }

  // Contact rows are globally unique on email so the same person is never
  // duplicated across campaigns.
  const contact = await prisma.contact.upsert({
    where: { email },
    update: {
      firstName: selection.firstName ?? undefined,
      lastName: selection.lastName ?? undefined,
      fullName: selection.fullName ?? undefined,
      jobTitle: selection.jobTitle ?? undefined,
      emailStatus,
      emailPattern: patternUsed,
      linkedinUrl: selection.linkedinUrl ?? undefined,
      sourceUrl: selection.sourceUrl ?? undefined,
      confidence: selection.confidence ?? undefined,
      isGeneric: selection.isGeneric,
    },
    create: {
      companyId: lead.companyId,
      firstName: selection.firstName,
      lastName: selection.lastName,
      fullName: selection.fullName,
      jobTitle: selection.jobTitle,
      email,
      emailStatus,
      emailPattern: patternUsed,
      linkedinUrl: selection.linkedinUrl,
      sourceUrl: selection.sourceUrl,
      confidence: selection.confidence,
      isGeneric: selection.isGeneric,
    },
  });

  await prisma.lead.update({ where: { id: lead.id }, data: { contactId: contact.id } });
  await setLeadStatus(
    lead.id,
    'CONTACT_FOUND',
    `Contact ${email} (${emailStatus})${offDomain ? ' — address is on a different domain than the website' : ''}.`,
  );

  await logAgent({
    type: 'CONTACT_SELECTION',
    campaignId: campaign.id,
    leadId: lead.id,
    runId: options.runId,
    summary: `Contact for ${domain}: ${selection.fullName ?? email} (${selection.jobTitle ?? 'title unknown'}), status ${emailStatus}.`,
    inputSummary: `Pages read: ${pages.map((page) => page.finalUrl).join(', ')}`,
    output: {
      selection,
      emailStatus,
      verification: check,
      patternUsed,
      offDomain,
      enrichmentError: candidates.enrichmentError,
    },
    model: selected.model,
    provider: llm.name,
    durationMs: selected.durationMs,
  });

  return { found: true, contactId: contact.id, email, emailStatus, reason: 'Contact stored.' };
}
