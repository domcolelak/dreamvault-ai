import type { EmailStatus } from '@prisma/client';
import type { EmailVerificationProvider } from '../providers/verification';
import { ProviderNotConfiguredError } from '../providers/types';
import { isUncontactableMailbox, isValidEmailSyntax } from '../utils/text';

export type EmailCheck = {
  status: EmailStatus;
  score: number | null;
  provider: string;
  detail: string;
};

/**
 * Verifies an address. An address that was constructed from a pattern rather than
 * found on a page stays GUESSED unless a real provider confirms it — this is what
 * keeps "verified" meaningful at send time.
 */
export async function verifyEmail(
  provider: EmailVerificationProvider,
  email: string,
  options: { foundOnPage: boolean },
): Promise<EmailCheck> {
  const normalized = email.trim().toLowerCase();

  if (!isValidEmailSyntax(normalized)) {
    return { status: 'INVALID', score: null, provider: 'syntax', detail: 'Address is not syntactically valid.' };
  }
  if (isUncontactableMailbox(normalized)) {
    return {
      status: 'INVALID',
      score: null,
      provider: 'policy',
      detail: 'Role mailbox that must never receive outreach (noreply/abuse/privacy and similar).',
    };
  }

  let result: EmailCheck;
  try {
    const verified = await provider.verify(normalized);
    result = {
      status: verified.status,
      score: verified.score,
      provider: verified.provider,
      detail: verified.detail ?? '',
    };
  } catch (error) {
    if (error instanceof ProviderNotConfiguredError) {
      result = { status: 'UNKNOWN', score: null, provider: provider.name, detail: error.message };
    } else {
      result = {
        status: 'UNKNOWN',
        score: null,
        provider: provider.name,
        detail: error instanceof Error ? `Verification failed: ${error.message}` : 'Verification failed.',
      };
    }
  }

  // A pattern-derived address can only be downgraded by a weak check, never promoted.
  if (!options.foundOnPage && result.status !== 'INVALID' && result.status !== 'VERIFIED') {
    return { ...result, status: 'GUESSED', detail: `${result.detail} Address was derived from a pattern, not found on a page.`.trim() };
  }
  return result;
}
