import type { Campaign, SearchStrategy } from '@prisma/client';
import { prisma } from '../db';
import { completeStructured, getLLM } from '../llm';
import { campaignContext, SALES_AGENT_SYSTEM_PROMPT } from '../llm/prompts';
import { DiscoveryCandidatesSchema, discoveryCandidatesJsonSchema } from '../llm/schemas';
import { logAgent } from '../logger';
import { getSearchProvider } from '../providers/search';
import { ProviderNotConfiguredError } from '../providers/types';
import { searchCompanies } from '../tools/searchCompanies';
import { isLikelyCompanyDomain, normalizeDomain } from '../utils/url';
import { enqueueJob } from './jobs';

export type DiscoveryOutcome = {
  searchedQueries: number;
  rawDomains: number;
  newLeads: number;
  skippedExisting: number;
  rejectedByModel: number;
  searchErrors: string[];
  providerConfigured: boolean;
  providerDetail: string;
};

const COUNTRY_CODE_RE = /^[a-z]{2}$/i;

/** Uses the campaign's first region as a search locale hint when it is a country code. */
function countryHint(campaign: Campaign): string | null {
  for (const region of campaign.targetRegions) {
    const trimmed = region.trim();
    if (COUNTRY_CODE_RE.test(trimmed)) return trimmed.toUpperCase();
  }
  return null;
}

/**
 * Runs the campaign's search queries, has the model sift the results down to
 * plausible company domains, and creates one lead per new company.
 *
 * Nothing is fabricated: a domain only becomes a candidate if a real search
 * result pointed at it. When no search provider is configured, discovery reports
 * that and creates nothing.
 */
export async function runDiscovery(
  campaign: Campaign,
  strategy: SearchStrategy,
  options: { runId: string; maxNewLeads?: number },
): Promise<DiscoveryOutcome> {
  const provider = await getSearchProvider();
  const providerStatus = provider.status();

  if (!provider.configured) {
    await logAgent({
      type: 'DISCOVERY',
      campaignId: campaign.id,
      runId: options.runId,
      summary: 'Discovery skipped: no search provider configured.',
      provider: provider.name,
      error: providerStatus.detail,
    });
    return {
      searchedQueries: 0,
      rawDomains: 0,
      newLeads: 0,
      skippedExisting: 0,
      rejectedByModel: 0,
      searchErrors: [providerStatus.detail],
      providerConfigured: false,
      providerDetail: providerStatus.detail,
    };
  }

  const maxNewLeads = options.maxNewLeads ?? campaign.leadsTarget;
  const queries = strategy.queries.slice(0, 16);

  let searched: Awaited<ReturnType<typeof searchCompanies>>;
  try {
    searched = await searchCompanies(
      provider,
      queries,
      { limit: 10, country: countryHint(campaign) },
      { campaignId: campaign.id, runId: options.runId },
    );
  } catch (error) {
    if (!(error instanceof ProviderNotConfiguredError)) throw error;
    return {
      searchedQueries: 0,
      rawDomains: 0,
      newLeads: 0,
      skippedExisting: 0,
      rejectedByModel: 0,
      searchErrors: [error.message],
      providerConfigured: false,
      providerDetail: error.message,
    };
  }

  const searchErrors = searched.batches
    .map((batch) => (batch.error !== null ? `${batch.query}: ${batch.error}` : null))
    .filter((value): value is string => value !== null);

  // Skip domains we already have a lead for in this campaign before spending tokens.
  const existingLeads = await prisma.lead.findMany({
    where: { campaignId: campaign.id },
    select: { company: { select: { domain: true } } },
  });
  const existingDomains = new Set(existingLeads.map((lead) => lead.company.domain));

  const fresh = searched.candidates.filter((candidate) => !existingDomains.has(candidate.domain));
  const skippedExisting = searched.candidates.length - fresh.length;

  if (fresh.length === 0) {
    await logAgent({
      type: 'DISCOVERY',
      campaignId: campaign.id,
      runId: options.runId,
      summary: `Discovery found no new domains (${searched.candidates.length} results, all already known).`,
      output: { searchErrors },
      provider: provider.name,
    });
    return {
      searchedQueries: queries.length,
      rawDomains: searched.candidates.length,
      newLeads: 0,
      skippedExisting,
      rejectedByModel: 0,
      searchErrors,
      providerConfigured: true,
      providerDetail: providerStatus.detail,
    };
  }

  const llm = await getLLM();
  const offered = fresh
    .slice(0, 60)
    .map(
      (candidate, index) =>
        `${index + 1}. ${candidate.domain}\n   titles: ${candidate.titles.slice(0, 2).join(' | ')}\n   snippets: ${candidate.snippets
          .slice(0, 2)
          .join(' | ')
          .slice(0, 400)}\n   found via: ${candidate.queries.slice(0, 3).join(' ; ')}`,
    )
    .join('\n');

  const sifted = await completeStructured(llm, {
    schema: DiscoveryCandidatesSchema,
    schemaName: 'DiscoveryCandidatesSchema',
    jsonSchema: discoveryCandidatesJsonSchema,
    system: SALES_AGENT_SYSTEM_PROMPT,
    user: `${campaignContext(campaign)}

Search results produced the following domains. Decide which of them are plausibly the kind of company this campaign is looking for, and therefore worth the cost of full research.

${offered}

Rules:
- Only return domains from the list, copied verbatim.
- Reject directories, marketplaces, news sites, social networks, job boards, agencies that merely write about the sector, and anything the campaign's exclusions rule out.
- This is a cheap pre-filter on titles and snippets only. Admit a domain when it is plausibly a match; the research step will confirm or reject it. Do not claim certainty you cannot have from a snippet.
- "whyRelevant" must point at something in the title or snippet, not at knowledge you bring yourself.
- Put every domain you drop in "rejected" with a short reason.`,
    temperature: 0.2,
    maxTokens: 2500,
  });

  const allowedDomains = new Map(fresh.map((candidate) => [candidate.domain, candidate]));
  let newLeads = 0;

  for (const candidate of sifted.value.candidates) {
    if (newLeads >= maxNewLeads) break;

    const domain = normalizeDomain(candidate.domain);
    if (domain === null || !isLikelyCompanyDomain(domain)) continue;
    const source = allowedDomains.get(domain);
    if (source === undefined) continue; // Not a domain we offered — ignore it.

    const company = await prisma.company.upsert({
      where: { domain },
      update: { name: candidate.companyName ?? undefined },
      create: {
        domain,
        name: candidate.companyName ?? domain,
        websiteUrl: `https://${domain}`,
      },
    });

    const existing = await prisma.lead.findUnique({
      where: { campaignId_companyId: { campaignId: campaign.id, companyId: company.id } },
      select: { id: true },
    });
    if (existing !== null) continue;

    const lead = await prisma.lead.create({
      data: {
        campaignId: campaign.id,
        companyId: company.id,
        status: 'DISCOVERED',
        discoverySourceUrl: candidate.sourceUrl ?? source.sourceUrls[0] ?? null,
        discoveryQuery: source.queries[0] ?? null,
      },
    });

    await prisma.leadStatusHistory.create({
      data: { leadId: lead.id, from: null, to: 'DISCOVERED', reason: candidate.whyRelevant },
    });

    if (candidate.whyRelevant !== null) {
      await prisma.leadEvidence.create({
        data: {
          leadId: lead.id,
          claim: candidate.whyRelevant,
          sourceUrl: candidate.sourceUrl ?? source.sourceUrls[0] ?? null,
          kind: 'discovery',
        },
      });
    }

    await enqueueJob({
      type: 'COMPANY_RESEARCH',
      campaignId: campaign.id,
      leadId: lead.id,
      runId: options.runId,
      idempotencyKey: `COMPANY_RESEARCH:${lead.id}`,
    });

    newLeads += 1;
  }

  await logAgent({
    type: 'DISCOVERY',
    campaignId: campaign.id,
    runId: options.runId,
    summary: `Discovery: ${queries.length} queries, ${searched.candidates.length} domains seen, ${newLeads} new leads queued for research.`,
    inputSummary: queries.join(' | ').slice(0, 2000),
    output: {
      newLeads,
      skippedExisting,
      rejected: sifted.value.rejected.slice(0, 40),
      searchErrors,
    },
    model: sifted.model,
    provider: provider.name,
    durationMs: sifted.durationMs,
  });

  return {
    searchedQueries: queries.length,
    rawDomains: searched.candidates.length,
    newLeads,
    skippedExisting,
    rejectedByModel: sifted.value.rejected.length,
    searchErrors,
    providerConfigured: true,
    providerDetail: providerStatus.detail,
  };
}
