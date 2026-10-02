import type { Campaign, Company, Lead, SearchStrategy } from '@prisma/client';
import { prisma } from '../db';
import { env } from '../env';
import { getLLM } from '../llm';
import { logAgent } from '../logger';
import { extractCompanyData, selectPagesToRead } from '../tools/extractCompanyData';
import { internalPageCandidates, visitWebsite } from '../tools/visitWebsite';
import type { VisitedPage } from '../tools/visitWebsite';
import { setLeadStatus } from './lead-status';

export type ResearchOutcome = {
  ok: boolean;
  pagesFetched: number;
  companyExists: boolean;
  signals: number;
  evidence: number;
  reason: string | null;
};

/** Pages read during research, cached on the request so qualification can reuse them. */
const pageCache = new Map<string, VisitedPage[]>();

export function cachedPages(leadId: string): VisitedPage[] {
  return pageCache.get(leadId) ?? [];
}

/**
 * Visits the company's own website, lets the model choose which further pages are
 * worth reading for this campaign, then extracts sourced facts.
 */
export async function researchCompany(
  campaign: Campaign,
  strategy: SearchStrategy | null,
  lead: Lead & { company: Company },
  options: { runId: string | null },
): Promise<ResearchOutcome> {
  await setLeadStatus(lead.id, 'RESEARCHING', 'Website research started.');

  const domain = lead.company.domain;
  const homepage = await visitWebsite(lead.company.websiteUrl ?? `https://${domain}`);

  if (!homepage.ok) {
    // A site we cannot read is not evidence of anything. Reject rather than guess.
    const reason = `Could not read the company website (${homepage.error ?? 'unknown error'}).`;
    await setLeadStatus(lead.id, 'REJECTED', reason, { rejectionReason: reason, qualified: false });
    await logAgent({
      type: 'RESEARCH',
      campaignId: campaign.id,
      leadId: lead.id,
      runId: options.runId,
      summary: `Research failed for ${domain}: website unreachable.`,
      error: homepage.error,
    });
    return { ok: false, pagesFetched: 0, companyExists: false, signals: 0, evidence: 0, reason };
  }

  const llm = await getLLM();
  const maxPages = Math.max(1, env().CRAWLER_MAX_PAGES_PER_COMPANY - 1);
  const candidates = internalPageCandidates(homepage, domain);

  const selection = await selectPagesToRead(llm, campaign, strategy, homepage, candidates, maxPages);

  const pages: VisitedPage[] = [homepage];
  for (const url of selection.urls) {
    const page = await visitWebsite(url);
    if (page.ok) pages.push(page);
  }
  pageCache.set(lead.id, pages);

  const searchContext = lead.discoverySourceUrl !== null
    ? [{ url: lead.discoverySourceUrl, title: lead.company.name, snippet: lead.discoveryQuery }]
    : [];

  const extracted = await extractCompanyData(llm, {
    campaign,
    strategy,
    domain,
    pages,
    searchContext,
  });
  const research = extracted.research;

  const pageUrls = new Set(pages.map((page) => page.finalUrl));
  // Only keep evidence whose source we actually fetched or were given.
  const knownUrls = new Set<string>([...pageUrls, ...searchContext.map((entry) => entry.url)]);
  const validEvidence = research.evidence.filter(
    (item) => item.url === null || knownUrls.has(item.url) || [...knownUrls].some((url) => url.startsWith(item.url ?? '\u0000')),
  );

  await prisma.company.update({
    where: { id: lead.companyId },
    data: {
      name: research.companyName ?? lead.company.name,
      country: research.country ?? lead.company.country,
      industry: research.industry ?? lead.company.industry,
      description: research.description ?? lead.company.description,
      employeeEstimate: research.employeeEstimate ?? lead.company.employeeEstimate,
      employeeNote: research.employeeNote ?? lead.company.employeeNote,
      websiteLanguage: research.websiteLanguage ?? lead.company.websiteLanguage,
      websiteUrl: homepage.finalUrl,
      researchSummary: research.summary,
      lastResearchedAt: new Date(),
    },
  });

  // Replace previous research evidence; discovery evidence is kept.
  await prisma.leadEvidence.deleteMany({ where: { leadId: lead.id, kind: 'research' } });
  if (validEvidence.length > 0) {
    await prisma.leadEvidence.createMany({
      data: validEvidence.map((item) => ({
        leadId: lead.id,
        claim: item.claim.slice(0, 1000),
        sourceUrl: item.url,
        kind: 'research',
      })),
    });
  }
  if (research.relevantSignals.length > 0) {
    await prisma.leadEvidence.createMany({
      data: research.relevantSignals.slice(0, 10).map((signal) => ({
        leadId: lead.id,
        claim: signal.slice(0, 1000),
        sourceUrl: validEvidence.find((item) => item.claim === signal)?.url ?? null,
        kind: 'signal',
      })),
    });
  }

  await logAgent({
    type: 'RESEARCH',
    campaignId: campaign.id,
    leadId: lead.id,
    runId: options.runId,
    summary: `Researched ${domain}: read ${pages.length} page(s), ${research.relevantSignals.length} signal(s), ${validEvidence.length} sourced claim(s).`,
    inputSummary: `Pages read: ${pages.map((page) => page.finalUrl).join(', ')}\nPage choice reason: ${selection.reason ?? 'n/a'}`,
    output: { research, droppedEvidence: research.evidence.length - validEvidence.length },
    model: extracted.model,
    provider: llm.name,
    durationMs: extracted.durationMs,
  });

  if (!research.companyExists) {
    const reason = 'The fetched pages do not establish that this is a real, operating company.';
    await setLeadStatus(lead.id, 'REJECTED', reason, { rejectionReason: reason, qualified: false });
    return { ok: false, pagesFetched: pages.length, companyExists: false, signals: 0, evidence: validEvidence.length, reason };
  }

  return {
    ok: true,
    pagesFetched: pages.length,
    companyExists: true,
    signals: research.relevantSignals.length,
    evidence: validEvidence.length,
    reason: null,
  };
}
