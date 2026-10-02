import { env } from '../../env';
import { resolveSettings } from '../../settings';
import { HunterEnrichmentProvider } from './hunter';
import { NullEnrichmentProvider } from './none';
import type { ContactEnrichmentProvider } from './types';

export type { ContactEnrichmentProvider, EnrichedContact, EnrichmentQuery } from './types';

export function createEnrichmentProvider(name: string): ContactEnrichmentProvider {
  switch (name) {
    case 'hunter':
      return new HunterEnrichmentProvider(env().ENRICHMENT_API_KEY);
    case 'none':
    default:
      return new NullEnrichmentProvider();
  }
}

export async function getEnrichmentProvider(): Promise<ContactEnrichmentProvider> {
  const settings = await resolveSettings();
  return createEnrichmentProvider(settings.enrichmentProvider);
}
