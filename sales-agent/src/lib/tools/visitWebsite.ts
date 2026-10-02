import { env } from '../env';
import { extractHtmlLang, extractLinks, extractMetaDescription, extractTitle, htmlToText } from '../utils/html';
import { isHttpUrl, normalizeDomain, sameDomain } from '../utils/url';
import type { ExtractedLink } from '../utils/html';

export type VisitedPage = {
  url: string;
  finalUrl: string;
  ok: boolean;
  statusCode: number | null;
  title: string | null;
  metaDescription: string | null
  htmlLang: string | null;
  text: string;
  links: ExtractedLink[];
  error: string | null;
};

const MAX_BYTES = 1_500_000;
const MAX_TEXT_CHARS = 20_000;

/**
 * Fetches one public page and reduces it to readable text plus its links.
 * Only http(s) is followed, only text/html is parsed, and the response is size
 * capped so a hostile page cannot exhaust memory.
 */
export async function visitWebsite(url: string): Promise<VisitedPage> {
  const base: VisitedPage = {
    url,
    finalUrl: url,
    ok: false,
    statusCode: null,
    title: null,
    metaDescription: null,
    htmlLang: null,
    text: '',
    links: [],
    error: null,
  };

  if (!isHttpUrl(url)) return { ...base, error: 'Not an http(s) URL.' };

  const e = env();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), e.CRAWLER_TIMEOUT_SECONDS * 1000);

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': e.CRAWLER_USER_AGENT ?? 'SalesAgentBot/0.1',
        accept: 'text/html,application/xhtml+xml',
        'accept-language': '*',
      },
    });

    const contentType = response.headers.get('content-type') ?? '';
    if (!response.ok) {
      return { ...base, finalUrl: response.url || url, statusCode: response.status, error: `HTTP ${response.status}` };
    }
    if (!/text\/html|application\/xhtml/i.test(contentType)) {
      return {
        ...base,
        finalUrl: response.url || url,
        statusCode: response.status,
        error: `Unsupported content-type: ${contentType || 'unknown'}`,
      };
    }

    const buffer = await response.arrayBuffer();
    const html = new TextDecoder('utf-8', { fatal: false }).decode(buffer.slice(0, MAX_BYTES));
    const finalUrl = response.url || url;

    return {
      url,
      finalUrl,
      ok: true,
      statusCode: response.status,
      title: extractTitle(html),
      metaDescription: extractMetaDescription(html),
      htmlLang: extractHtmlLang(html),
      text: htmlToText(html).slice(0, MAX_TEXT_CHARS),
      links: extractLinks(html, finalUrl),
      error: null,
    };
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? `Timed out after ${e.CRAWLER_TIMEOUT_SECONDS}s`
        : error instanceof Error
          ? error.message
          : 'Fetch failed';
    return { ...base, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

/** Candidate URL together with the anchor text that led us to it. */
export type PageCandidate = { url: string; label: string };

/**
 * Collects internal link candidates from a homepage. Which of them are worth
 * reading is a decision for the LLM given the campaign — this function only
 * gathers, it does not filter by business meaning.
 */
export function internalPageCandidates(homepage: VisitedPage, domain: string, limit = 40): PageCandidate[] {
  const seen = new Set<string>();
  const candidates: PageCandidate[] = [];

  for (const link of homepage.links) {
    const linkDomain = normalizeDomain(link.url);
    if (linkDomain === null) continue;
    // Subdomains of the company (careers.example.com) count as internal.
    const isInternal = sameDomain(link.url, domain) || linkDomain.endsWith(`.${domain}`);
    if (!isInternal) continue;

    const normalized = link.url.split('#')[0] ?? link.url;
    if (normalized === homepage.finalUrl) continue;
    if (/\.(pdf|jpe?g|png|gif|svg|webp|zip|docx?|xlsx?|mp4|mp3)(\?|$)/i.test(normalized)) continue;
    if (seen.has(normalized)) continue;

    seen.add(normalized);
    candidates.push({ url: normalized, label: link.text });
    if (candidates.length >= limit) break;
  }

  return candidates;
}
