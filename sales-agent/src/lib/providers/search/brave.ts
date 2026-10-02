import { NOT_CONFIGURED_MESSAGE, ProviderNotConfiguredError } from '../types';
import type { ProviderStatus } from '../types';
import type { SearchProvider, SearchQueryOptions, SearchResult } from './types';

type BraveWebResult = { title?: string; url?: string; description?: string };
type BraveResponse = { web?: { results?: BraveWebResult[] } };

/** Brave Search API. */
export class BraveSearchProvider implements SearchProvider {
  readonly name = 'brave';

  constructor(private readonly apiKey: string | null) {}

  get configured(): boolean {
    return this.apiKey !== null;
  }

  status(): ProviderStatus {
    return {
      name: this.name,
      configured: this.configured,
      detail: this.configured
        ? 'Configured. Brave Search API.'
        : `${NOT_CONFIGURED_MESSAGE} SEARCH_API_KEY is missing for brave.`,
    };
  }

  async search(query: string, options: SearchQueryOptions = {}): Promise<SearchResult[]> {
    if (this.apiKey === null) {
      throw new ProviderNotConfiguredError('search', this.name, this.status().detail);
    }
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', String(Math.min(options.limit ?? 10, 20)));
    if (options.country) url.searchParams.set('country', options.country.toUpperCase());
    if (options.language) url.searchParams.set('search_lang', options.language.toLowerCase());

    const response = await fetch(url, {
      headers: { 'X-Subscription-Token': this.apiKey, accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`brave returned ${response.status}: ${body.slice(0, 300)}`);
    }
    const data = (await response.json()) as BraveResponse;
    return (data.web?.results ?? [])
      .filter((item): item is BraveWebResult & { url: string } => typeof item.url === 'string')
      .map((item, index) => ({
        title: item.title ?? item.url,
        url: item.url,
        snippet: item.description ?? null,
        position: index + 1,
      }));
  }

  searchJobs(query: string, options: SearchQueryOptions = {}): Promise<SearchResult[]> {
    return this.search(query, options);
  }
}
