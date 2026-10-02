import type { EmailProvider, SendReceipt } from '../providers/email';
import { ProviderNotConfiguredError } from '../providers/types';

export type SendEmailInput = {
  to: string;
  subject: string;
  body: string;
  fromName: string | null;
  fromEmail: string;
  /** Campaign/lead ids are added as custom headers to aid manual threading. */
  campaignId: string;
  leadId: string;
};

export type SendEmailOutcome =
  | { ok: true; receipt: SendReceipt }
  | { ok: false; reason: string; configured: boolean };

/** The exact text that will be transmitted, for storing alongside the receipt. */
export function composeBody(body: string, fromName: string | null): string {
  const trimmed = body.trimEnd();
  if (fromName === null || trimmed.endsWith(fromName)) return trimmed;
  return `${trimmed}\n\n${fromName}`;
}

/**
 * Appends the sender identity and hands the message to the email provider.
 * No credential ever reaches this layer; it only sees the composed message.
 */
export async function sendEmail(
  provider: EmailProvider,
  input: SendEmailInput,
): Promise<SendEmailOutcome> {
  const text = composeBody(input.body, input.fromName);

  try {
    const receipt = await provider.send({
      to: input.to,
      subject: input.subject,
      text,
      fromName: input.fromName,
      fromEmail: input.fromEmail,
      replyTo: input.fromEmail,
      headers: {
        'X-Sales-Agent-Campaign': input.campaignId,
        'X-Sales-Agent-Lead': input.leadId,
      },
    });
    return { ok: true, receipt };
  } catch (error) {
    if (error instanceof ProviderNotConfiguredError) {
      return { ok: false, reason: error.message, configured: false };
    }
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Send failed.',
      configured: true,
    };
  }
}
