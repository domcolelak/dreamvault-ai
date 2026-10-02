import { NOT_CONFIGURED_MESSAGE } from '../types';
import type { ProviderStatus } from '../types';
import type { ContactEnrichmentProvider, EnrichedContact } from './types';

/**
 * No enrichment configured. Returns nothing rather than guessing — contact
 * discovery then falls back to reading the company's own public pages.
 */
export class NullEnrichmentProvider implements ContactEnrichmentProvider {
  readonly name = 'none';
  readonly configured = false;

  status(): ProviderStatus {
    return {
      name: this.name,
      configured: false,
      detail: `${NOT_CONFIGURED_MESSAGE} Contacts are taken only from the company's own public pages. Set ENRICHMENT_PROVIDER and ENRICHMENT_API_KEY to add a contact database.`,
    };
  }

  async findContacts(): Promise<EnrichedContact[]> {
    return [];
  }

  async findEmailPattern(): Promise<string | null> {
    return null;
  }
}
