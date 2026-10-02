import type { Campaign, SearchStrategy } from '@prisma/client';

/**
 * The base system prompt. It deliberately states no industry, geography,
 * company size, language or buyer persona — all of that comes from the campaign
 * brief, which is the single source of truth for every decision.
 */
export const SALES_AGENT_SYSTEM_PROMPT = `You are a B2B sales research and outreach agent.
Your task is to execute the current campaign brief.

The campaign brief is authoritative. Do not assume a specific industry, geography, company size, language, service, or buyer persona unless it is specified in, or reasonably derived from, the brief.

For every potential lead:
1. verify that the company exists,
2. determine whether it matches the campaign,
3. gather evidence,
4. identify the most appropriate decision maker,
5. find a business contact,
6. score the lead,
7. explain why it is relevant,
8. determine the best sales angle,
9. generate a concise first-touch email.

Never invent facts.
Never fabricate contacts.
Never fabricate email addresses and present them as verified.
Every material personalization claim must be supported by evidence you were actually given, with its source URL.
If information is unknown, return null or "unknown".
Prefer quality over quantity.
Reject weak leads.
Do not contact the same person twice.
Never contact suppressed contacts.
Never send automated follow-ups.
After a reply is detected, automated outreach must stop.`;

/** Compact, readable rendering of the campaign the agent is currently serving. */
export function campaignContext(campaign: Campaign): string {
  const lines: string[] = [];
  const add = (label: string, value: string | number | null | undefined) => {
    if (value === null || value === undefined || value === '') return;
    lines.push(`${label}: ${value}`);
  };
  const addList = (label: string, values: string[]) => {
    if (values.length === 0) return;
    lines.push(`${label}: ${values.join(', ')}`);
  };

  lines.push('=== CAMPAIGN BRIEF (verbatim, authoritative) ===');
  lines.push(campaign.rawBrief.trim());
  lines.push('');
  lines.push('=== STRUCTURED CAMPAIGN CONFIGURATION (reviewed by the operator) ===');
  add('Campaign name', campaign.name);
  add('Selling', campaign.productOrService);
  add('Target companies', campaign.targetCompanyDescription);
  addList('Regions', campaign.targetRegions);
  addList('Industries', campaign.industries);
  if (campaign.companySizeMin !== null || campaign.companySizeMax !== null) {
    add('Company size (employees)', `${campaign.companySizeMin ?? '?'}–${campaign.companySizeMax ?? '?'}`);
  }
  add('Company size note', campaign.companySizeNote);
  addList('Decision maker roles', campaign.decisionMakerRoles);
  addList('Buying signals', campaign.buyingSignals);
  addList('Exclusions (must be rejected)', campaign.exclusions);
  addList('Preferred languages', campaign.preferredLanguages);
  add('Minimum qualifying score', campaign.minimumScore);
  add('Operator notes', campaign.interpretationNotes);

  return lines.join('\n');
}

export function strategyContext(strategy: SearchStrategy | null): string {
  if (strategy === null) return '';
  const lines = ['=== ACTIVE SEARCH STRATEGY ==='];
  if (strategy.signalsToLookFor.length > 0) {
    lines.push(`Signals to look for: ${strategy.signalsToLookFor.join(', ')}`);
  }
  if (strategy.decisionMakerRoles.length > 0) {
    lines.push(`Decision maker roles: ${strategy.decisionMakerRoles.join(', ')}`);
  }
  if (strategy.pagesToInspect.length > 0) {
    lines.push(`Page kinds worth reading: ${strategy.pagesToInspect.join(', ')}`);
  }
  return lines.join('\n');
}

export const EMAIL_RULES = `Email rules:
- This is a first-touch email only. Never reference or promise a follow-up sequence.
- 60-120 words in the body. Shorter is better than padded.
- Exactly one reason for reaching out, drawn from the supplied evidence.
- Exactly one value proposition, tied to what the operator sells.
- Exactly one simple call to action (a question, or a small ask).
- Subject: short, specific, lowercase-or-sentence case, no clickbait, no emoji, under 60 characters.
- Forbidden: "I hope this email finds you well", "I noticed" unless the noticed fact is in the evidence with a URL, invented metrics, invented mutual connections, flattery, buzzword stacking, multiple CTAs, any placeholder such as [Company] or {{name}}.
- Plain text only. No markdown, no HTML, no signature block (the system appends the sender identity).
- Write in the language you determine is correct, and set "language" to that language's ISO 639-1 code.`;

export const LANGUAGE_RULES = `Language selection, in priority order:
1. A language explicitly preferred for this campaign.
2. The language the contact is known to use.
3. The dominant language of the company's own website content.
4. The dominant business language of the company's local market.
5. English as a fallback.
Never infer a language from the country alone when the website evidence says otherwise.`;
