export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

export function snippet(text: string, max = 400): string {
  return truncate(text.replace(/\s+/g, ' ').trim(), max);
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

export function extractEmails(text: string): string[] {
  const found = text.match(EMAIL_RE) ?? [];
  const cleaned = found
    .map((value) => value.toLowerCase())
    .filter((value) => !/\.(png|jpe?g|gif|svg|webp|css|js)$/i.test(value));
  return [...new Set(cleaned)];
}

export function isValidEmailSyntax(email: string): boolean {
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email.trim());
}

export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 0) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return domain.includes('.') ? domain : null;
}

const GENERIC_LOCAL_PARTS = new Set([
  'info', 'contact', 'hello', 'office', 'sales', 'kontakt', 'mail', 'email',
  'enquiries', 'enquiry', 'inquiries', 'support', 'admin', 'team', 'hi',
  'welcome', 'ahoj', 'firma', 'post', 'bureau', 'service', 'servis',
]);

export function isGenericMailbox(email: string): boolean {
  const local = email.split('@')[0]?.toLowerCase() ?? '';
  return GENERIC_LOCAL_PARTS.has(local);
}

/** Mailboxes we must never contact even if they appear on a website. */
const NEVER_CONTACT_LOCAL_PARTS = [
  'noreply', 'no-reply', 'donotreply', 'postmaster', 'abuse', 'webmaster',
  'mailer-daemon', 'bounce', 'unsubscribe', 'privacy', 'dpo', 'gdpr',
];

export function isUncontactableMailbox(email: string): boolean {
  const local = email.split('@')[0]?.toLowerCase() ?? '';
  return NEVER_CONTACT_LOCAL_PARTS.some((part) => local.includes(part));
}

export function splitName(fullName: string): { firstName: string | null; lastName: string | null } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0] ?? null, lastName: null };
  return { firstName: parts[0] ?? null, lastName: parts[parts.length - 1] ?? null };
}
