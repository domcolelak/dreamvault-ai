import type { ProviderStatus } from '../types';

export type OutboundEmail = {
  to: string;
  subject: string;
  /** Plain text only — the agent never generates HTML outreach. */
  text: string;
  fromName: string | null;
  fromEmail: string;
  replyTo?: string | null;
  headers?: Record<string, string>;
};

export type SendReceipt = {
  messageId: string;
  accepted: string[];
  rejected: string[];
  response: string | null;
  sentAt: Date;
};

export interface EmailProvider {
  readonly name: string;
  readonly configured: boolean;
  status(): ProviderStatus;
  /** Verifies credentials and connectivity without sending anything. */
  verifyConnection(): Promise<{ ok: boolean; detail: string }>;
  send(email: OutboundEmail): Promise<SendReceipt>;
}
