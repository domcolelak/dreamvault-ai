import { NOT_CONFIGURED_MESSAGE, ProviderNotConfiguredError } from '../types';
import type { ProviderStatus } from '../types';
import type { SearchProvider, SearchResult } from './types';

/**
 * Placeholder used when SEARCH_PROVIDER is unset. It never returns invented
 * results — it refuses, so the UI can say exactly what is missing.
 */
export class NullSearchProvider implements SearchProvider {
  readonly name = 'none';
  readonly configured = false;

  status(): ProviderStatus {
    return {
      name: this.name,
      configured: false,
      detail: `${NOT_CONFIGURED_MESSAGE} Set SEARCH_PROVIDER (serper, brave, google_cse) and SEARCH_API_KEY to enable lead discovery.`,
    };
  }

  search(): Promise<SearchResult[]> {
    throw new ProviderNotConfiguredError('search', this.name, this.status().detail);
  }

  searchJobs(): Promise<SearchResult[]> {
    throw new ProviderNotConfiguredError('search', this.name, this.status().detail);
  }
}
