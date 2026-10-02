import type { EmailStatus } from '@prisma/client';
import type { ProviderStatus } from '../types';

export type VerificationResult = {
  status: EmailStatus;
  /** 0-100 when the provider reports one. */
  score: number | null;
  provider: string;
  detail: string | null;
};

export interface EmailVerificationProvider {
  readonly name: string;
  readonly configured: boolean;
  status(): ProviderStatus;
  /** Must never upgrade an address to VERIFIED without a real provider check. */
  verify(email: string): Promise<VerificationResult>;
}
