import type { SearchProvider, SearchQueryOptions, SearchResult } from '../providers/search';
import { ProviderNotConfiguredError } from '../providers/types';

export type JobSearchResult = {
  query: string;
  results: SearchResult[];
  error: string | null;
};

/**
 * Job-posting search. Hiring activity is one of the most common buying signals,
 * but which roles matter is decided per campaign, never here.
 */
export async function searchJobs(
  provider: SearchProvider,
  query: string,
  options: SearchQueryOptions = {},
): Promise<JobSearchResult> {
  try {
    const results = await provider.searchJobs(query, options);
    return { query, results, error: null };
  } catch (error) {
    if (error instanceof ProviderNotConfiguredError) throw error;
    return { query, results: [], error: error instanceof Error ? error.message : 'Job search failed.' };
  }
}

/** Looks for hiring pages/postings tied to one company domain. */
export async function searchCompanyJobs(
  provider: SearchProvider,
  domain: string,
  roleHints: string[],
  options: SearchQueryOptions = {},
): Promise<JobSearchResult[]> {
  const roles = roleHints.slice(0, 3);
  const queries = roles.length > 0
    ? roles.map((role) => `site:${domain} ${role}`)
    : [`site:${domain} careers jobs`];

  const out: JobSearchResult[] = [];
  for (const query of queries) {
    out.push(await searchJobs(provider, query, options));
  }
  return out;
}
