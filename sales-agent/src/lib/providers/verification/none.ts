import { isValidEmailSyntax } from '../../utils/text';
import { NOT_CONFIGURED_MESSAGE } from '../types';
import type { ProviderStatus } from '../types';
import type { EmailVerificationProvider, VerificationResult } from './types';

/**
 * Syntax-only fallback. It can mark an address INVALID (syntax) but it can never
 * claim VERIFIED — an unverifiable address stays UNKNOWN, which keeps the
 * pre-send validation honest.
 */
export class NullEmailVerificationProvider implements EmailVerificationProvider {
  readonly name = 'none';
  readonly configured = false;

  status(): ProviderStatus {
    return {
      name: this.name,
      configured: false,
      detail: `${NOT_CONFIGURED_MESSAGE} Only syntax is checked; addresses stay UNKNOWN. Set EMAIL_VERIFICATION_PROVIDER and EMAIL_VERIFICATION_API_KEY for real verification.`,
    };
  }

  async verify(email: string): Promise<VerificationResult> {
    const syntaxOk = isValidEmailSyntax(email);
    return {
      status: syntaxOk ? 'UNKNOWN' : 'INVALID',
      score: null,
      provider: this.name,
      detail: syntaxOk
        ? 'Syntax valid; no verification provider configured.'
        : 'Address is not syntactically valid.',
    };
  }
}
