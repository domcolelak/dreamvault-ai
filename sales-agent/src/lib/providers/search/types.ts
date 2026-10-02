import type { ProviderStatus } from '../types';

export type SearchResult = {
  title: string;
  url: string;
  snippet: string | null;
  /** Rank within the provider's own result list, 1-based. */
  position: number;
};

export type SearchQueryOptions = {
  limit?: number;
  /** ISO 3166-1 alpha-2 country hint, when the campaign gives one. */
  country?: string | null;
  /** ISO 639-1 language hint. */
  language?: string | null;
};

export interface SearchProvider {
  readonly name: string;
  readonly configured: boolean;
  status(): ProviderStatus;
  /** General web search. */
  search(query: string, options?: SearchQueryOptions): Promise<SearchResult[]>;
  /** Job-posting oriented search; falls back to `search` when unsupported. */
  searchJobs(query: string, options?: SearchQueryOptions): Promise<SearchResult[]>;
}
