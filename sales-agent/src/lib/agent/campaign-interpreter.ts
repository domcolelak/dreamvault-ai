import type { Campaign } from '@prisma/client';
import { prisma } from '../db';
import { completeStructured, getLLM } from '../llm';
import { SALES_AGENT_SYSTEM_PROMPT } from '../llm/prompts';
import { CampaignInterpretationSchema, campaignInterpretationJsonSchema } from '../llm/schemas';
import type { CampaignInterpretation } from '../llm/schemas';
import { logAgent } from '../logger';

/**
 * Turns a free-text brief into structured campaign configuration.
 *
 * The prompt insists on deriving everything from the brief: no default industry,
 * no default country, no default persona. A brief about sports clubs and a brief
 * about German manufacturers go through exactly this code path.
 */
export async function interpretBrief(rawBrief: string): Promise<{
  interpretation: CampaignInterpretation;
  model: string;
  provider: string;
  durationMs: number;
}> {
  const llm = await getLLM();

  const result = await completeStructured(llm, {
    schema: CampaignInterpretationSchema,
    schemaName: 'CampaignInterpretationSchema',
    jsonSchema: campaignInterpretationJsonSchema,
    system: SALES_AGENT_SYSTEM_PROMPT,
    user: `An operator wrote the following campaign brief. Convert it into structured configuration.

=== BRIEF (verbatim) ===
"""
${rawBrief.trim()}
"""

Rules:
- Derive every field from this brief alone. Do not import assumptions from other industries, countries or sales playbooks.
- Keep the operator's own wording for what they sell.
- targetRegions: use the countries or regions stated. If the brief says worldwide or states nothing, return ["worldwide"].
- industries: only what the brief implies about the sector. Empty array if it is sector-agnostic.
- companySizeMin / companySizeMax: only when the brief gives numbers or an unambiguous size band ("micro", "enterprise"). Otherwise null, and explain your reading in companySizeNote.
- decisionMakerRoles: the roles named in the brief. If none are named, propose the roles that would plausibly own this buying decision in such a company, and say so in notes.
- buyingSignals: observable, checkable facts about a company that would indicate it needs this. Prefer things verifiable on a public website (a job posting, a new language version, a new location, a stated process). Empty array if the brief gives nothing to go on.
- exclusions: company kinds the brief says to avoid.
- preferredLanguages: ISO 639-1 codes, only when the brief states or clearly implies the outreach language. The language of the brief itself is NOT automatically the outreach language — leave the array empty if the brief does not say.
- leadsTarget / dailySendLimit: only if stated as numbers, else null.
- name: a short descriptive campaign name in the language of the brief.
- notes: anything important in the brief that no other field captures.`,
    temperature: 0.2,
    maxTokens: 1600,
  });

  await logAgent({
    type: 'CAMPAIGN_INTERPRETATION',
    summary: `Interpreted brief into campaign "${result.value.name}"`,
    inputSummary: rawBrief.slice(0, 1500),
    output: result.value,
    model: result.model,
    provider: result.provider,
    durationMs: result.durationMs,
  });

  return {
    interpretation: result.value,
    model: result.model,
    provider: result.provider,
    durationMs: result.durationMs,
  };
}

/** Writes an interpretation onto a campaign row. */
export async function applyInterpretation(
  campaignId: string,
  interpretation: CampaignInterpretation,
  options: { approved: boolean },
): Promise<Campaign> {
  return prisma.campaign.update({
    where: { id: campaignId },
    data: {
      name: interpretation.name,
      productOrService: interpretation.productOrService,
      targetCompanyDescription: interpretation.targetCompanyDescription,
      targetRegions: interpretation.targetRegions,
      industries: interpretation.industries,
      companySizeMin: interpretation.companySizeMin,
      companySizeMax: interpretation.companySizeMax,
      companySizeNote: interpretation.companySizeNote,
      decisionMakerRoles: interpretation.decisionMakerRoles,
      buyingSignals: interpretation.buyingSignals,
      exclusions: interpretation.exclusions,
      preferredLanguages: interpretation.preferredLanguages,
      interpretationNotes: interpretation.notes,
      interpretationApproved: options.approved,
      ...(interpretation.leadsTarget !== null ? { leadsTarget: interpretation.leadsTarget } : {}),
      ...(interpretation.dailySendLimit !== null ? { dailySendLimit: interpretation.dailySendLimit } : {}),
    },
  });
}
