import { NOT_CONFIGURED_MESSAGE, ProviderNotConfiguredError } from '../types';
import type { ProviderStatus } from '../types';
import type { SearchProvider, SearchQueryOptions, SearchResult } from './types';

type CseItem = { title?: string; link?: string; snippet?: string };
type CseResponse = { items?: CseItem[]; error?: { message?: string } };

/** Google Programmable Search (Custom Search JSON API). */
export class GoogleCseSearchProvider implements SearchProvider {
  readonly name = 'google_cse';

  constructor(
    private readonly apiKey: string | null,
    private readonly engineId: string | null,
  ) {}

  get configured(): boolean {
    return this.apiKey !== null && this.engineId !== null;
  }

  status(): ProviderStatus {
    return {
      name: this.name,
      configured: this.configured,
      detail: this.configured
        ? 'Configured. Google Programmable Search.'
        : `${NOT_CONFIGURED_MESSAGE} google_cse needs both SEARCH_API_KEY and SEARCH_ENGINE_ID.`,
    };
  }

  async search(query: string, options: SearchQueryOptions = {}): Promise<SearchResult[]> {
    if (this.apiKey === null || this.engineId === null) {
      throw new ProviderNotConfiguredError('search', this.name, this.status().detail);
    }
    const url = new URL('https://www.googleapis.com/customsearch/v1');
    url.searchParams.set('key', this.apiKey);
    url.searchParams.set('cx', this.engineId);
    url.searchParams.set('q', query);
    url.searchParams.set('num', String(Math.min(options.limit ?? 10, 10)));
    if (options.country) url.searchParams.set('gl', options.country.toLowerCase());
    if (options.language) url.searchParams.set('lr', `lang_${options.language.toLowerCase()}`);

    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    const data = (await response.json()) as CseResponse;
    if (!response.ok || data.error?.message) {
      throw new Error(`google_cse error: ${data.error?.message ?? response.status}`);
    }
    return (data.items ?? [])
      .filter((item): item is CseItem & { link: string } => typeof item.link === 'string')
      .map((item, index) => ({
        title: item.title ?? item.link,
        url: item.link,
        snippet: item.snippet ?? null,
        position: index + 1,
      }));
  }

  searchJobs(query: string, options: SearchQueryOptions = {}): Promise<SearchResult[]> {
    return this.search(query, options);
  }
}
