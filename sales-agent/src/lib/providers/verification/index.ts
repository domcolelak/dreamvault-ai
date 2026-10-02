import { env } from '../../env';
import { resolveSettings } from '../../settings';
import { HunterEmailVerificationProvider } from './hunter';
import { NullEmailVerificationProvider } from './none';
import type { EmailVerificationProvider } from './types';

export type { EmailVerificationProvider, VerificationResult } from './types';

export function createVerificationProvider(name: string): EmailVerificationProvider {
  switch (name) {
    case 'hunter':
      return new HunterEmailVerificationProvider(env().EMAIL_VERIFICATION_API_KEY);
    case 'none':
    default:
      return new NullEmailVerificationProvider();
  }
}

export async function getVerificationProvider(): Promise<EmailVerificationProvider> {
  const settings = await resolveSettings();
  return createVerificationProvider(settings.verificationProvider);
}
