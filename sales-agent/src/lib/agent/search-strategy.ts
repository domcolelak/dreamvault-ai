import type { Campaign, SearchStrategy } from '@prisma/client';
import { prisma } from '../db';
import { completeStructured, getLLM } from '../llm';
import { campaignContext, SALES_AGENT_SYSTEM_PROMPT } from '../llm/prompts';
import { SearchStrategySchema, searchStrategyJsonSchema } from '../llm/schemas';
import { logAgent } from '../logger';

export async function getActiveStrategy(campaignId: string): Promise<SearchStrategy | null> {
  return prisma.searchStrategy.findFirst({
    where: { campaignId, isActive: true },
    orderBy: { version: 'desc' },
  });
}

/**
 * Builds the search strategy for a campaign. Queries, sources, signals and the
 * page kinds to inspect are all the model's decision given the brief — nothing
 * here branches on campaign type.
 */
export async function generateSearchStrategy(
  campaign: Campaign,
  options: { runId?: string | null } = {},
): Promise<SearchStrategy> {
  const llm = await getLLM();

  const result = await completeStructured(llm, {
    schema: SearchStrategySchema,
    schemaName: 'SearchStrategySchema',
    jsonSchema: searchStrategyJsonSchema,
    system: SALES_AGENT_SYSTEM_PROMPT,
    user: `${campaignContext(campaign)}

Design the search strategy for finding companies that match this campaign.

Rules for "queries":
- Between 8 and 16 queries, each one a string you would actually type into a web search engine.
- Use the languages in which these companies describe themselves. For a campaign targeting a specific country, that usually means the local language as well as English. For a worldwide campaign, favour English plus the languages of the largest relevant markets.
- Vary the angle across the set: what the company does, the buying signal, the region, the job titles they hire, the words they would use on their own website.
- You may use search operators (site:, intitle:, quoted phrases) where they help.
- Do not include queries aimed at directories or social networks as the destination; aim at company websites and job/career pages.
- Do not invent a specific company name.

"companySources": the kinds of sources worth searching for this campaign.
"signalsToLookFor": the concrete, publicly checkable facts that would confirm a company fits.
"decisionMakerRoles": the roles to look for at these companies, taken from the campaign and expanded with the local-language equivalents where that helps.
"pagesToInspect": the kinds of website pages most likely to carry the evidence for THIS campaign.
"rationale": two or three sentences on why this set of queries should surface the right companies.`,
    temperature: 0.4,
    maxTokens: 1800,
  });

  const latest = await prisma.searchStrategy.findFirst({
    where: { campaignId: campaign.id },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  const nextVersion = (latest?.version ?? 0) + 1;

  const [, strategy] = await prisma.$transaction([
    prisma.searchStrategy.updateMany({ where: { campaignId: campaign.id }, data: { isActive: false } }),
    prisma.searchStrategy.create({
      data: {
        campaignId: campaign.id,
        version: nextVersion,
        queries: result.value.queries,
        companySources: result.value.companySources,
        signalsToLookFor: result.value.signalsToLookFor,
        decisionMakerRoles:
          result.value.decisionMakerRoles.length > 0 ? result.value.decisionMakerRoles : campaign.decisionMakerRoles,
        pagesToInspect: result.value.pagesToInspect,
        rationale: result.value.rationale,
        isActive: true,
      },
    }),
  ]);

  await logAgent({
    type: 'SEARCH_STRATEGY',
    campaignId: campaign.id,
    runId: options.runId ?? null,
    summary: `Built search strategy v${nextVersion} with ${result.value.queries.length} queries`,
    output: result.value,
    model: result.model,
    provider: result.provider,
    durationMs: result.durationMs,
  });

  return strategy;
}

/** Returns the active strategy, generating one if the campaign has none yet. */
export async function ensureSearchStrategy(
  campaign: Campaign,
  options: { runId?: string | null } = {},
): Promise<SearchStrategy> {
  const existing = await getActiveStrategy(campaign.id);
  if (existing !== null) return existing;
  return generateSearchStrategy(campaign, options);
}
