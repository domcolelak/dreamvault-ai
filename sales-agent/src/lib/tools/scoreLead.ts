import type { Campaign, SearchStrategy } from '@prisma/client';
import { completeStructured, type LLMProvider } from '../llm';
import { campaignContext, SALES_AGENT_SYSTEM_PROMPT, strategyContext } from '../llm/prompts';
import { LeadQualificationSchema, leadQualificationJsonSchema } from '../llm/schemas';
import type { CompanyResearch, LeadQualification } from '../llm/schemas';

/**
 * Scores a researched company against the campaign. The rubric is expressed in
 * the prompt rather than in code, so a different campaign automatically means a
 * different notion of "good lead" without any code change.
 */
export async function scoreLead(
  llm: LLMProvider,
  campaign: Campaign,
  strategy: SearchStrategy | null,
  research: CompanyResearch,
  domain: string,
): Promise<{ qualification: LeadQualification; model: string; durationMs: number }> {
  const result = await completeStructured(llm, {
    schema: LeadQualificationSchema,
    schemaName: 'LeadQualificationSchema',
    jsonSchema: leadQualificationJsonSchema,
    system: SALES_AGENT_SYSTEM_PROMPT,
    user: `${campaignContext(campaign)}

${strategyContext(strategy)}

=== RESEARCH FINDINGS FOR ${domain} ===
${JSON.stringify(research, null, 2)}

Decide whether this company is a lead worth contacting for THIS campaign.

Judge, and weigh against each other:
- ICP match: does the company match the target description, industry, region and size?
- Buying signal strength: are this campaign's signals actually present, and how strong?
- Company suitability: could this company plausibly buy and use what is being sold?
- Contact suitability: is it plausible that the requested kind of decision maker is reachable here?
- Evidence quality: is the match backed by concrete sourced facts, or only by vague wording?
- Timing: is there anything recent suggesting now is a good moment?

Scoring guidance:
- 85-100: strong ICP match with at least one concrete, sourced buying signal.
- 75-84: clear ICP match, weaker or indirect signals.
- 50-74: plausible but unproven; the brief's requirements are not demonstrably met.
- 0-49: wrong fit, or evidence too thin to justify contacting anyone.
The campaign's minimum qualifying score is ${campaign.minimumScore}. Set "qualified" to true only if you would stake your own reputation on this email being welcome.

An exclusion in the brief that applies here means qualified=false, whatever the other evidence says.
Rejecting is a valid and expected outcome. Do not inflate a score to fill a quota.
"evidence" must reuse the sourced claims from the research above — do not introduce new facts.
"recommendedAngle" is the single most compelling reason this specific company should care, in one sentence.`,
    temperature: 0.1,
    maxTokens: 1200,
  });

  return { qualification: result.value, model: result.model, durationMs: result.durationMs };
}
