import type { EmailStatus } from '@prisma/client';
import { isValidEmailSyntax } from '../../utils/text';
import { NOT_CONFIGURED_MESSAGE, ProviderNotConfiguredError } from '../types';
import type { ProviderStatus } from '../types';
import type { EmailVerificationProvider, VerificationResult } from './types';

type HunterResponse = {
  data?: { result?: string; score?: number; status?: string };
  errors?: Array<{ details?: string }>;
};

/** Hunter.io email verifier. */
export class HunterEmailVerificationProvider implements EmailVerificationProvider {
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
        ? 'Configured. Hunter.io email verification.'
        : `${NOT_CONFIGURED_MESSAGE} EMAIL_VERIFICATION_API_KEY is missing for hunter.`,
    };
  }

  async verify(email: string): Promise<VerificationResult> {
    if (this.apiKey === null) {
      throw new ProviderNotConfiguredError('email_verification', this.name, this.status().detail);
    }
    if (!isValidEmailSyntax(email)) {
      return { status: 'INVALID', score: null, provider: this.name, detail: 'Invalid syntax.' };
    }

    const url = new URL('https://api.hunter.io/v2/email-verifier');
    url.searchParams.set('email', email);
    url.searchParams.set('api_key', this.apiKey);

    const response = await fetch(url, { signal: AbortSignal.timeout(25_000) });
    const data = (await response.json()) as HunterResponse;
    if (!response.ok) {
      throw new Error(`hunter returned ${response.status}: ${data.errors?.[0]?.details ?? ''}`);
    }

    const result = data.data?.result ?? 'unknown';
    const map: Record<string, EmailStatus> = {
      deliverable: 'VERIFIED',
      risky: 'VALID',
      accept_all: 'VALID',
      webmail: 'VALID',
      unknown: 'UNKNOWN',
      undeliverable: 'INVALID',
    };
    return {
      status: map[result] ?? 'UNKNOWN',
      score: typeof data.data?.score === 'number' ? data.data.score : null,
      provider: this.name,
      detail: `hunter result: ${result}`,
    };
  }
}
