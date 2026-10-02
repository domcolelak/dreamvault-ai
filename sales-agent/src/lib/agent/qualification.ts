import type { Campaign, Company, Lead, SearchStrategy } from '@prisma/client';
import { prisma } from '../db';
import { getLLM } from '../llm';
import { logAgent } from '../logger';
import { scoreLead } from '../tools/scoreLead';
import type { CompanyResearch } from '../llm/schemas';
import { setLeadStatus } from './lead-status';

export type QualificationOutcome = {
  qualified: boolean;
  score: number;
  reason: string;
};

/** Rebuilds the research view of a company from what was persisted. */
export async function researchFromDb(lead: Lead & { company: Company }): Promise<CompanyResearch> {
  const evidence = await prisma.leadEvidence.findMany({
    where: { leadId: lead.id },
    orderBy: { createdAt: 'asc' },
  });

  return {
    companyExists: true,
    companyName: lead.company.name,
    country: lead.company.country,
    industry: lead.company.industry,
    description: lead.company.description,
    employeeEstimate: lead.company.employeeEstimate,
    employeeNote: lead.company.employeeNote,
    websiteLanguage: lead.company.websiteLanguage,
    relevantSignals: evidence.filter((item) => item.kind === 'signal').map((item) => item.claim),
    evidence: evidence
      .filter((item) => item.kind !== 'signal')
      .map((item) => ({ claim: item.claim, url: item.sourceUrl })),
    sourceUrls: [
      ...new Set(evidence.map((item) => item.sourceUrl).filter((url): url is string => url !== null)),
    ],
    summary: lead.company.researchSummary,
  };
}

/**
 * Scores the lead against the campaign and applies the campaign's own minimum.
 * A lead below `minimumScore` is never advanced, whatever the model's own
 * `qualified` flag says.
 */
export async function qualifyLead(
  campaign: Campaign,
  strategy: SearchStrategy | null,
  lead: Lead & { company: Company },
  options: { runId: string | null },
): Promise<QualificationOutcome> {
  const llm = await getLLM();
  const research = await researchFromDb(lead);
  const scored = await scoreLead(llm, campaign, strategy, research, lead.company.domain);
  const qualification = scored.qualification;

  const meetsMinimum = qualification.score >= campaign.minimumScore;
  const qualified = qualification.qualified && meetsMinimum;

  await prisma.leadEvidence.deleteMany({ where: { leadId: lead.id, kind: 'qualification' } });
  const scoringEvidence = qualification.evidence.filter((item) => item.url !== null);
  if (scoringEvidence.length > 0) {
    await prisma.leadEvidence.createMany({
      data: scoringEvidence.map((item) => ({
        leadId: lead.id,
        claim: item.claim.slice(0, 1000),
        sourceUrl: item.url,
        kind: 'qualification',
      })),
    });
  }

  const reason = !meetsMinimum && qualification.qualified
    ? `Scored ${qualification.score}, below this campaign's minimum of ${campaign.minimumScore}. ${qualification.reason}`
    : qualification.reason;

  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      score: qualification.score,
      qualified,
      qualificationReason: reason.slice(0, 4000),
      strongestSignal: qualification.strongestSignal,
      recommendedAngle: qualification.recommendedAngle,
      rejectionReason: qualified ? null : reason.slice(0, 4000),
    },
  });

  await setLeadStatus(
    lead.id,
    qualified ? 'QUALIFIED' : 'REJECTED',
    `Score ${qualification.score} (minimum ${campaign.minimumScore}).`,
  );

  await logAgent({
    type: 'QUALIFICATION',
    campaignId: campaign.id,
    leadId: lead.id,
    runId: options.runId,
    summary: `${qualified ? 'Qualified' : 'Rejected'} ${lead.company.domain} with score ${qualification.score}.`,
    inputSummary: `Signals: ${research.relevantSignals.join('; ').slice(0, 1500)}`,
    output: { ...qualification, appliedMinimum: campaign.minimumScore, finalQualified: qualified },
    model: scored.model,
    provider: llm.name,
    durationMs: scored.durationMs,
  });

  return { qualified, score: qualification.score, reason };
}
