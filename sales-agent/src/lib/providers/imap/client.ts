import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { env } from '../../env';
import { NOT_CONFIGURED_MESSAGE } from '../types';
import type { ProviderStatus } from '../types';

export type FetchedMessage = {
  uid: number;
  mailbox: string;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  fromEmail: string | null;
  fromName: string | null;
  toEmail: string | null;
  subject: string | null;
  text: string | null;
  receivedAt: Date;
};

type ImapConfig = {
  host: string | null;
  port: number;
  secure: boolean;
  user: string | null;
  password: string | null;
  mailbox: string;
};

function imapConfig(): ImapConfig {
  const e = env();
  return {
    host: e.IMAP_HOST,
    port: e.IMAP_PORT,
    secure: e.IMAP_SECURE,
    user: e.IMAP_USER,
    password: e.IMAP_PASSWORD,
    mailbox: e.IMAP_MAILBOX ?? 'INBOX',
  };
}

export function imapStatus(): ProviderStatus {
  const config = imapConfig();
  const missing = [
    config.host === null ? 'IMAP_HOST' : null,
    config.user === null ? 'IMAP_USER' : null,
    config.password === null ? 'IMAP_PASSWORD' : null,
  ].filter((value): value is string => value !== null);

  if (missing.length > 0) {
    return {
      name: 'imap',
      configured: false,
      detail: `${NOT_CONFIGURED_MESSAGE} Reply detection is off. Missing: ${missing.join(', ')}.`,
    };
  }
  return {
    name: 'imap',
    configured: true,
    detail: `Configured for ${config.host}:${config.port}, mailbox ${config.mailbox}.`,
  };
}

function isConfigured(
  config: ImapConfig,
): config is ImapConfig & { host: string; user: string; password: string } {
  return config.host !== null && config.user !== null && config.password !== null;
}

async function withClient<T>(handler: (client: ImapFlow, mailbox: string) => Promise<T>): Promise<T> {
  const config = imapConfig();
  if (!isConfigured(config)) throw new Error(imapStatus().detail);

  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
    logger: false,
  });

  await client.connect();
  try {
    return await handler(client, config.mailbox);
  } finally {
    await client.logout().catch(() => {
      client.close();
    });
  }
}

export async function testImapConnection(): Promise<{ ok: boolean; detail: string }> {
  const status = imapStatus();
  if (!status.configured) return { ok: false, detail: status.detail };
  try {
    const count = await withClient(async (client, mailbox) => {
      const lock = await client.getMailboxLock(mailbox);
      try {
        return typeof client.mailbox === 'object' ? client.mailbox.exists : 0;
      } finally {
        lock.release();
      }
    });
    return { ok: true, detail: `IMAP login succeeded; mailbox holds ${count} message(s).` };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? `IMAP check failed: ${error.message}` : 'IMAP check failed.',
    };
  }
}

function toDate(value: Date | string | undefined | null): Date | null {
  if (value === undefined || value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

type AddressContainer = { value?: Array<{ address?: string; name?: string }> };

function firstAddress(value: unknown): { email: string | null; name: string | null } {
  if (value === null || value === undefined || typeof value !== 'object') {
    return { email: null, name: null };
  }
  const container = value as AddressContainer;
  const first = container.value?.[0];
  return {
    email: first?.address?.toLowerCase() ?? null,
    name: first?.name !== undefined && first.name.trim() !== '' ? first.name : null,
  };
}

/**
 * Fetches messages received since `since`. Only the headers needed for reply
 * threading plus the plain-text body are kept; nothing is marked as read.
 */
export async function fetchRecentMessages(since: Date, limit = 150): Promise<FetchedMessage[]> {
  return withClient(async (client, mailbox) => {
    const lock = await client.getMailboxLock(mailbox);
    const messages: FetchedMessage[] = [];
    try {
      for await (const message of client.fetch({ since }, { uid: true, source: true, internalDate: true })) {
        if (messages.length >= limit) break;
        if (message.source === undefined) continue;

        const parsed = await simpleParser(message.source);
        const from = firstAddress(parsed.from);
        const to = firstAddress(parsed.to);
        const references = Array.isArray(parsed.references)
          ? parsed.references
          : typeof parsed.references === 'string'
            ? [parsed.references]
            : [];

        messages.push({
          uid: message.uid,
          mailbox,
          messageId: parsed.messageId ?? null,
          inReplyTo: parsed.inReplyTo ?? null,
          references,
          fromEmail: from.email,
          fromName: from.name,
          toEmail: to.email,
          subject: parsed.subject ?? null,
          text: typeof parsed.text === 'string' ? parsed.text : null,
          receivedAt: toDate(parsed.date) ?? toDate(message.internalDate) ?? new Date(),
        });
      }
    } finally {
      lock.release();
    }
    return messages;
  });
}
