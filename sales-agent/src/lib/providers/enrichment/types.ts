import type { ProviderStatus } from '../types';

export type EnrichedContact = {
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  jobTitle: string | null;
  email: string | null;
  /** True only when the provider states the address was verified. */
  emailVerified: boolean;
  linkedinUrl: string | null;
  sourceUrl: string | null;
  confidence: number | null;
};

export type EnrichmentQuery = {
  domain: string;
  companyName: string | null;
  /** Roles the campaign asked for, most desirable first. */
  roles: string[];
};

export interface ContactEnrichmentProvider {
  readonly name: string;
  readonly configured: boolean;
  status(): ProviderStatus;
  /** Returns contacts the provider actually holds; empty array when it has none. */
  findContacts(query: EnrichmentQuery): Promise<EnrichedContact[]>;
  /** Email pattern the provider observed for the domain, e.g. "{first}.{last}". */
  findEmailPattern(domain: string): Promise<string | null>;
}
