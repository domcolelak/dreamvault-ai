import { NOT_CONFIGURED_MESSAGE, ProviderNotConfiguredError } from '../types';
import type { ProviderStatus } from '../types';
import type { ContactEnrichmentProvider, EnrichedContact, EnrichmentQuery } from './types';

type HunterDomainSearch = {
  data?: {
    pattern?: string | null;
    emails?: Array<{
      value?: string;
      first_name?: string | null;
      last_name?: string | null;
      position?: string | null;
      linkedin?: string | null;
      confidence?: number | null;
      verification?: { status?: string | null } | null;
      sources?: Array<{ uri?: string }>;
    }>;
  };
  errors?: Array<{ details?: string }>;
};

/** Hunter.io domain search as a contact enrichment source. */
export class HunterEnrichmentProvider implements ContactEnrichmentProvider {
  readonly name = 'hunter';

  constructor(private readonly apiKey: string | null) {}

  get configured(): boolean {
    return this.apiKey !== null;
  }

  status(): ProviderStatus {
    return {
      name: this.name,
      configured: this.configured,
      detail: this.configured
        ? 'Configured. Hunter.io domain search.'
        : `${NOT_CONFIGURED_MESSAGE} ENRICHMENT_API_KEY is missing for hunter.`,
    };
  }

  private async domainSearch(domain: string): Promise<HunterDomainSearch> {
    if (this.apiKey === null) {
      throw new ProviderNotConfiguredError('enrichment', this.name, this.status().detail);
    }
    const url = new URL('https://api.hunter.io/v2/domain-search');
    url.searchParams.set('domain', domain);
    url.searchParams.set('api_key', this.apiKey);
    url.searchParams.set('limit', '25');

    const response = await fetch(url, { signal: AbortSignal.timeout(25_000) });
    const data = (await response.json()) as HunterDomainSearch;
    if (!response.ok) {
      throw new Error(`hunter returned ${response.status}: ${data.errors?.[0]?.details ?? ''}`);
    }
    return data;
  }

  async findContacts(query: EnrichmentQuery): Promise<EnrichedContact[]> {
    const data = await this.domainSearch(query.domain);
    return (data.data?.emails ?? [])
      .filter((entry): entry is NonNullable<typeof entry> & { value: string } => typeof entry.value === 'string')
      .map((entry) => {
        const first = entry.first_name ?? null;
        const last = entry.last_name ?? null;
        const full = [first, last].filter((part): part is string => part !== null).join(' ');
        return {
          fullName: full === '' ? null : full,
          firstName: first,
          lastName: last,
          jobTitle: entry.position ?? null,
          email: entry.value.toLowerCase(),
          emailVerified: entry.verification?.status === 'valid',
          linkedinUrl: entry.linkedin ?? null,
          sourceUrl: entry.sources?.[0]?.uri ?? null,
          confidence: typeof entry.confidence === 'number' ? entry.confidence : null,
        };
      });
  }

  async findEmailPattern(domain: string): Promise<string | null> {
    const data = await this.domainSearch(domain);
    return data.data?.pattern ?? null;
  }
}
