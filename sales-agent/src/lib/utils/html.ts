import { toAbsoluteUrl } from './url';

/** Strips scripts/styles/markup and collapses whitespace into readable text. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

export function extractTitle(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!match?.[1]) return null;
  const text = htmlToText(match[1]);
  return text.length > 0 ? text.slice(0, 300) : null;
}

export function extractMetaDescription(html: string): string | null {
  const patterns = [
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i,
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match?.[1]) return htmlToText(match[1]).slice(0, 600);
  }
  return null;
}

export function extractHtmlLang(html: string): string | null {
  const match = /<html[^>]+lang=["']([a-zA-Z-]{2,10})["']/i.exec(html);
  const lang = match?.[1]?.toLowerCase().split('-')[0];
  return lang && lang.length >= 2 ? lang : null;
}

export type ExtractedLink = { url: string; text: string };

export function extractLinks(html: string, baseUrl: string): ExtractedLink[] {
  const links: ExtractedLink[] = [];
  const re = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match = re.exec(html);
  while (match !== null) {
    const href = match[1];
    const label = match[2] ?? '';
    if (href && !/^(mailto:|tel:|javascript:|data:)/i.test(href)) {
      const absolute = toAbsoluteUrl(baseUrl, href);
      if (absolute !== null) links.push({ url: absolute, text: htmlToText(label).slice(0, 120) });
    }
    match = re.exec(html);
  }
  return links;
}
