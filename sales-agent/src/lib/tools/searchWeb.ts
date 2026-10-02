import { logAgent } from '../logger';
import type { SearchProvider, SearchQueryOptions, SearchResult } from '../providers/search';
import { ProviderNotConfiguredError } from '../providers/types';

export type SearchBatchResult = {
  query: string;
  results: SearchResult[];
  error: string | null;
};

/** Runs a single web search, reporting rather than throwing on provider errors. */
export async function searchWeb(
  provider: SearchProvider,
  query: string,
  options: SearchQueryOptions = {},
): Promise<SearchBatchResult> {
  try {
    const results = await provider.search(query, options);
    return { query, results, error: null };
  } catch (error) {
    if (error instanceof ProviderNotConfiguredError) throw error;
    return {
      query,
      results: [],
      error: error instanceof Error ? error.message : 'Search failed.',
    };
  }
}

/** Sequential on purpose: external search APIs are rate limited. */
export async function searchWebBatch(
  provider: SearchProvider,
  queries: string[],
  options: SearchQueryOptions = {},
  context?: { campaignId: string; runId: string | null },
): Promise<SearchBatchResult[]> {
  const batches: SearchBatchResult[] = [];
  for (const query of queries) {
    const batch = await searchWeb(provider, query, options);
    batches.push(batch);
    if (batch.error !== null && context) {
      await logAgent({
        type: 'PROVIDER_ERROR',
        campaignId: context.campaignId,
        runId: context.runId,
        summary: `Search query failed: ${query}`,
        error: batch.error,
        provider: provider.name,
      });
    }
  }
  return batches;
}
