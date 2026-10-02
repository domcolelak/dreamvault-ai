import { env } from '../../env';
import { resolveSettings } from '../../settings';
import { BraveSearchProvider } from './brave';
import { GoogleCseSearchProvider } from './google-cse';
import { NullSearchProvider } from './none';
import { SerperSearchProvider } from './serper';
import type { SearchProvider } from './types';

export type { SearchProvider, SearchResult, SearchQueryOptions } from './types';

/**
 * Adding Apollo, Bing, a company register or a job board means adding a class
 * implementing SearchProvider and one case here.
 */
export function createSearchProvider(name: string): SearchProvider {
  const e = env();
  switch (name) {
    case 'serper':
      return new SerperSearchProvider(e.SEARCH_API_KEY);
    case 'brave':
      return new BraveSearchProvider(e.SEARCH_API_KEY);
    case 'google_cse':
      return new GoogleCseSearchProvider(e.SEARCH_API_KEY, e.SEARCH_ENGINE_ID);
    case 'none':
    default:
      return new NullSearchProvider();
  }
}

export async function getSearchProvider(): Promise<SearchProvider> {
  const settings = await resolveSettings();
  return createSearchProvider(settings.searchProvider);
}
