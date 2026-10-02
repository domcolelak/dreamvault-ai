/** Normalises a hostname/URL to a bare, lowercase registrable-ish domain. */
export function normalizeDomain(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;
  let host = trimmed;
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
    host = new URL(withScheme).hostname;
  } catch {
    host = trimmed.split('/')[0] ?? trimmed;
  }
  host = host.replace(/^www\./, '').replace(/\.$/, '');
  if (!host.includes('.') || /\s/.test(host)) return null;
  return host;
}

export function toAbsoluteUrl(base: string, href: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

export function sameDomain(a: string, b: string): boolean {
  const da = normalizeDomain(a);
  const db = normalizeDomain(b);
  return da !== null && db !== null && da === db;
}

const EXCLUDED_HOSTS = new Set([
  'facebook.com', 'www.facebook.com', 'linkedin.com', 'www.linkedin.com',
  'twitter.com', 'x.com', 'instagram.com', 'youtube.com', 'tiktok.com',
  'pinterest.com', 'reddit.com', 'wikipedia.org', 'en.wikipedia.org',
  'crunchbase.com', 'glassdoor.com', 'indeed.com', 'yelp.com',
  'amazon.com', 'ebay.com', 'medium.com', 'github.com', 'google.com',
  'maps.google.com', 'play.google.com', 'apps.apple.com', 'apple.com',
]);

/**
 * Directories, social networks and marketplaces are useful as *sources* but are
 * never themselves the prospect company.
 */
export function isLikelyCompanyDomain(domain: string): boolean {
  if (EXCLUDED_HOSTS.has(domain)) return false;
  const bare = domain.replace(/^www\./, '');
  if (EXCLUDED_HOSTS.has(bare)) return false;
  // Obvious aggregator subdomains.
  if (/\.(blogspot|wordpress|wixsite|weebly|github\.io)\./.test(domain)) return false;
  return true;
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
