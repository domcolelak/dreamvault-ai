import { isLikelyCompanyDomain, normalizeDomain } from '../utils/url';
import type { SearchProvider, SearchQueryOptions } from '../providers/search';
import { searchWebBatch } from './searchWeb';
import type { SearchBatchResult } from './searchWeb';

export type CompanyCandidateSource = {
  domain: string;
  /** Pages that mentioned this domain, used later as evidence source URLs. */
  sourceUrls: string[];
  titles: string[];
  snippets: string[];
  queries: string[];
};

/**
 * Turns raw search results into deduplicated domain candidates. Directory and
 * social-network hosts are dropped as candidates but kept as source URLs, since
 * they are legitimate evidence about a company even when they are not the
 * company itself.
 */
export function collectCompanyCandidates(batches: SearchBatchResult[]): CompanyCandidateSource[] {
  const byDomain = new Map<string, CompanyCandidateSource>();

  for (const batch of batches) {
    for (const result of batch.results) {
      const domain = normalizeDomain(result.url);
      if (domain === null || !isLikelyCompanyDomain(domain)) continue;

      const existing = byDomain.get(domain);
      if (existing) {
        if (!existing.sourceUrls.includes(result.url)) existing.sourceUrls.push(result.url);
        if (!existing.titles.includes(result.title)) existing.titles.push(result.title);
        if (result.snippet !== null && !existing.snippets.includes(result.snippet)) {
          existing.snippets.push(result.snippet);
        }
        if (!existing.queries.includes(batch.query)) existing.queries.push(batch.query);
        continue;
      }

      byDomain.set(domain, {
        domain,
        sourceUrls: [result.url],
        titles: [result.title],
        snippets: result.snippet !== null ? [result.snippet] : [],
        queries: [batch.query],
      });
    }
  }

  // Domains surfaced by more than one query are more likely to be a real match.
  return [...byDomain.values()].sort((a, b) => b.queries.length - a.queries.length);
}

export async function searchCompanies(
  provider: SearchProvider,
  queries: string[],
  options: SearchQueryOptions = {},
  context?: { campaignId: string; runId: string | null },
): Promise<{ candidates: CompanyCandidateSource[]; batches: SearchBatchResult[] }> {
  const batches = await searchWebBatch(provider, queries, options, context);
  return { candidates: collectCompanyCandidates(batches), batches };
}
