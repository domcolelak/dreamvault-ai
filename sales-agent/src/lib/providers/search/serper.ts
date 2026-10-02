import { NOT_CONFIGURED_MESSAGE, ProviderNotConfiguredError } from '../types';
import type { ProviderStatus } from '../types';
import type { SearchProvider, SearchQueryOptions, SearchResult } from './types';

type SerperOrganic = { title?: string; link?: string; snippet?: string; position?: number };
type SerperResponse = { organic?: SerperOrganic[]; message?: string };

/** Serper.dev — Google results over a simple JSON API. */
export class SerperSearchProvider implements SearchProvider {
  readonly name = 'serper';

  constructor(private readonly apiKey: string | null) {}

  get configured(): boolean {
    return this.apiKey !== null;
  }

  status(): ProviderStatus {
    return {
      name: this.name,
      configured: this.configured,
      detail: this.configured
        ? 'Configured. Google results via serper.dev.'
        : `${NOT_CONFIGURED_MESSAGE} SEARCH_API_KEY is missing for serper.`,
    };
  }

  async search(query: string, options: SearchQueryOptions = {}): Promise<SearchResult[]> {
    if (this.apiKey === null) {
      throw new ProviderNotConfiguredError('search', this.name, this.status().detail);
    }
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': this.apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        q: query,
        num: Math.min(options.limit ?? 10, 20),
        ...(options.country ? { gl: options.country.toLowerCase() } : {}),
        ...(options.language ? { hl: options.language.toLowerCase() } : {}),
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`serper returned ${response.status}: ${body.slice(0, 300)}`);
    }
    const data = (await response.json()) as SerperResponse;
    if (data.message !== undefined && data.organic === undefined) {
      throw new Error(`serper error: ${data.message}`);
    }
    return (data.organic ?? [])
      .filter((item): item is SerperOrganic & { link: string } => typeof item.link === 'string')
      .map((item, index) => ({
        title: item.title ?? item.link,
        url: item.link,
        snippet: item.snippet ?? null,
        position: item.position ?? index + 1,
      }));
  }

  searchJobs(query: string, options: SearchQueryOptions = {}): Promise<SearchResult[]> {
    return this.search(query, options);
  }
}
