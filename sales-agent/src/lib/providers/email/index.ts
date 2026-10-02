import { env } from '../../env';
import { SmtpEmailProvider } from './smtp';
import type { EmailProvider } from './types';

export type { EmailProvider, OutboundEmail, SendReceipt } from './types';

/** SMTP is the only sender in the MVP; the interface allows an API sender later. */
export function createEmailProvider(): EmailProvider {
  const e = env();
  return new SmtpEmailProvider({
    host: e.SMTP_HOST,
    port: e.SMTP_PORT,
    secure: e.SMTP_SECURE,
    user: e.SMTP_USER,
    password: e.SMTP_PASSWORD,
  });
}

export function getEmailProvider(): EmailProvider {
  return createEmailProvider();
}
