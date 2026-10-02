import nodemailer from 'nodemailer';
import type { Transporter, SendMailOptions } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { NOT_CONFIGURED_MESSAGE, ProviderNotConfiguredError } from '../types';
import type { ProviderStatus } from '../types';
import type { EmailProvider, OutboundEmail, SendReceipt } from './types';

export type SmtpConfig = {
  host: string | null;
  port: number;
  secure: boolean;
  user: string | null;
  password: string | null;
};

/**
 * SMTP sender (used with the Websupport mailbox in the default setup, but the
 * config is generic). Credentials come from ENV only and never leave this
 * module — in particular they are never part of any LLM request.
 */
export class SmtpEmailProvider implements EmailProvider {
  readonly name = 'smtp';
  private transporter: Transporter | null = null;

  constructor(private readonly config: SmtpConfig) {}

  get configured(): boolean {
    return this.config.host !== null && this.config.user !== null && this.config.password !== null;
  }

  status(): ProviderStatus {
    if (!this.configured) {
      const missing = [
        this.config.host === null ? 'SMTP_HOST' : null,
        this.config.user === null ? 'SMTP_USER' : null,
        this.config.password === null ? 'SMTP_PASSWORD' : null,
      ].filter((value): value is string => value !== null);
      return {
        name: this.name,
        configured: false,
        detail: `${NOT_CONFIGURED_MESSAGE} Missing: ${missing.join(', ')}.`,
      };
    }
    return {
      name: this.name,
      configured: true,
      detail: `Configured for ${this.config.host}:${this.config.port} (${this.config.secure ? 'TLS' : 'STARTTLS'}).`,
    };
  }

  private getTransporter(): Transporter {
    if (this.config.host === null || this.config.user === null || this.config.password === null) {
      throw new ProviderNotConfiguredError('email', this.name, this.status().detail);
    }
    if (this.transporter === null) {
      const options: SMTPTransport.Options = {
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        auth: { user: this.config.user, pass: this.config.password },
        connectionTimeout: 20_000,
        greetingTimeout: 20_000,
        socketTimeout: 30_000,
      };
      this.transporter = nodemailer.createTransport(options);
    }
    return this.transporter;
  }

  async verifyConnection(): Promise<{ ok: boolean; detail: string }> {
    if (!this.configured) return { ok: false, detail: this.status().detail };
    try {
      await this.getTransporter().verify();
      return { ok: true, detail: `SMTP login succeeded on ${this.config.host}:${this.config.port}.` };
    } catch (error) {
      return {
        ok: false,
        detail: error instanceof Error ? `SMTP check failed: ${error.message}` : 'SMTP check failed.',
      };
    }
  }

  async send(email: OutboundEmail): Promise<SendReceipt> {
    const mail: SendMailOptions = {
      from: email.fromName !== null ? { name: email.fromName, address: email.fromEmail } : email.fromEmail,
      to: email.to,
      subject: email.subject,
      text: email.text,
      ...(email.replyTo ? { replyTo: email.replyTo } : {}),
      ...(email.headers ? { headers: email.headers } : {}),
    };
    const info: SMTPTransport.SentMessageInfo = await this.getTransporter().sendMail(mail);

    const accepted = info.accepted.map((entry: string | { address: string }) => (typeof entry === 'string' ? entry : entry.address));
    const rejected = info.rejected.map((entry: string | { address: string }) => (typeof entry === 'string' ? entry : entry.address));

    if (accepted.length === 0) {
      throw new Error(`SMTP server did not accept the recipient ${email.to}: ${info.response ?? 'no response'}`);
    }

    return {
      messageId: info.messageId,
      accepted,
      rejected,
      response: info.response ?? null,
      sentAt: new Date(),
    };
  }
}
