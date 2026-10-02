import type { Campaign, SearchStrategy } from '@prisma/client';
import { completeStructured, type LLMProvider } from '../llm';
import { campaignContext, SALES_AGENT_SYSTEM_PROMPT, strategyContext } from '../llm/prompts';
import { CompanyResearchSchema, companyResearchJsonSchema, PageSelectionSchema, pageSelectionJsonSchema } from '../llm/schemas';
import type { CompanyResearch } from '../llm/schemas';
import { truncate } from '../utils/text';
import type { PageCandidate, VisitedPage } from './visitWebsite';

/**
 * Asks the model which of the offered internal pages are worth reading for THIS
 * campaign. There is no hardcoded page list: a club-anthem campaign may want
 * /team and /history, a localization campaign /careers and /markets.
 */
export async function selectPagesToRead(
  llm: LLMProvider,
  campaign: Campaign,
  strategy: SearchStrategy | null,
  homepage: VisitedPage,
  candidates: PageCandidate[],
  maxPages: number,
): Promise<{ urls: string[]; reason: string | null; model: string }> {
  if (candidates.length === 0) return { urls: [], reason: 'No internal links found.', model: llm.model };

  const offered = candidates
    .slice(0, 40)
    .map((candidate, index) => `${index + 1}. ${candidate.url}${candidate.label ? ` — "${candidate.label}"` : ''}`)
    .join('\n');

  const result = await completeStructured(llm, {
    schema: PageSelectionSchema,
    schemaName: 'PageSelectionSchema',
    jsonSchema: pageSelectionJsonSchema,
    system: SALES_AGENT_SYSTEM_PROMPT,
    user: `${campaignContext(campaign)}

${strategyContext(strategy)}

You are researching the company at ${homepage.finalUrl}.
Homepage title: ${homepage.title ?? 'unknown'}
Homepage text (truncated):
"""
${truncate(homepage.text, 3000)}
"""

Candidate internal pages:
${offered}

Choose at most ${maxPages} URLs that are most likely to tell you whether this company matches the campaign, and to yield the evidence and the right decision maker. Copy the URLs verbatim from the list. Choose fewer if fewer are useful.`,
    temperature: 0.1,
  });

  const allowed = new Set(candidates.map((candidate) => candidate.url));
  const urls = result.value.urls.filter((url) => allowed.has(url)).slice(0, maxPages);
  return { urls, reason: result.value.reason, model: result.model };
}

export type ResearchInput = {
  campaign: Campaign;
  strategy: SearchStrategy | null;
  domain: string;
  pages: VisitedPage[];
  /** Search snippets that led us here; usable as corroborating evidence. */
  searchContext: Array<{ url: string; title: string; snippet: string | null }>;
};

/**
 * Extracts structured company facts from the pages actually fetched. The prompt
 * forbids any claim that is not present in the supplied text, and requires a
 * source URL for each one.
 */
export async function extractCompanyData(
  llm: LLMProvider,
  input: ResearchInput,
): Promise<{ research: CompanyResearch; model: string; durationMs: number }> {
  const pageBlocks = input.pages
    .filter((page) => page.ok)
    .map(
      (page) => `--- PAGE: ${page.finalUrl}
TITLE: ${page.title ?? 'unknown'}
HTML LANG ATTRIBUTE: ${page.htmlLang ?? 'absent'}
TEXT:
${truncate(page.text, 6000)}`,
    )
    .join('\n\n');

  const searchBlock = input.searchContext
    .slice(0, 10)
    .map((entry) => `- ${entry.url} — ${entry.title}${entry.snippet ? `: ${entry.snippet}` : ''}`)
    .join('\n');

  const result = await completeStructured(llm, {
    schema: CompanyResearchSchema,
    schemaName: 'CompanyResearchSchema',
    jsonSchema: companyResearchJsonSchema,
    system: SALES_AGENT_SYSTEM_PROMPT,
    user: `${campaignContext(input.campaign)}

${strategyContext(input.strategy)}

=== COMPANY UNDER RESEARCH ===
Domain: ${input.domain}

=== SEARCH RESULTS THAT SURFACED THIS COMPANY ===
${searchBlock || '(none)'}

=== PAGES FETCHED FROM THE COMPANY'S OWN WEBSITE ===
${pageBlocks || '(no page could be fetched)'}

Extract what these sources actually state about this company.

Hard rules:
- Use only information present in the text above. Do not use prior knowledge about this company or brand.
- Every entry in "evidence" must have a "url" that appears among the pages or search results above.
- "relevantSignals" must list only signals that genuinely relate to this campaign's buying signals and that the text supports.
- If no page could be fetched and the search snippets are too thin to confirm the company exists, set companyExists to false.
- employeeEstimate: only when the text states or clearly implies a headcount. Otherwise null, with your reasoning in employeeNote.
- websiteLanguage: the language of the body content, not the html lang attribute alone.
- Unknown values are null. Never guess.`,
    temperature: 0.1,
    maxTokens: 2000,
  });

  return { research: result.value, model: result.model, durationMs: result.durationMs };
}
