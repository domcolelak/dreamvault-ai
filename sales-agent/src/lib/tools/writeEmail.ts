import type { Campaign, Contact, SearchStrategy } from '@prisma/client';
import { completeStructured, type LLMProvider } from '../llm';
import { campaignContext, EMAIL_RULES, LANGUAGE_RULES, SALES_AGENT_SYSTEM_PROMPT, strategyContext } from '../llm/prompts';
import { EmailGenerationSchema, emailGenerationJsonSchema } from '../llm/schemas';
import type { EmailGeneration } from '../llm/schemas';
import { wordCount } from '../utils/text';

export type EvidenceForEmail = { claim: string; sourceUrl: string | null };

export type WriteEmailInput = {
  campaign: Campaign;
  strategy: SearchStrategy | null;
  companyName: string;
  domain: string;
  companyDescription: string | null;
  websiteLanguage: string | null;
  country: string | null;
  contact: Pick<Contact, 'fullName' | 'firstName' | 'jobTitle' | 'isGeneric'>;
  recommendedAngle: string | null;
  strongestSignal: string | null;
  evidence: EvidenceForEmail[];
  senderName: string | null;
};

export type EmailQualityIssue = { code: string; detail: string };

const BANNED_PHRASES = [
  'i hope this email finds you well',
  'hope this finds you well',
  'hope you are doing well',
  'hope all is well',
  'i hope you are well',
  'reaching out to touch base',
  'circle back',
  'synergy',
  'game-changer',
  'revolutionary',
  'unsubscribe',
];

const PLACEHOLDER_RE = /(\[[A-Za-z ._-]{2,30}\]|\{\{[^}]{1,40}\}\}|<[A-Za-z ._-]{2,30}>|\bXYZ\b|YOUR_COMPANY)/;

/**
 * Mechanical checks on a generated email. These are deliberately in code, not in
 * the prompt alone: a model that ignores an instruction must still not be able to
 * ship a placeholder or an unsourced claim.
 */
export function checkEmailQuality(
  email: EmailGeneration,
  evidence: EvidenceForEmail[],
): EmailQualityIssue[] {
  const issues: EmailQualityIssue[] = [];
  const body = email.body.trim();
  const lowerBody = body.toLowerCase();
  const words = wordCount(body);

  if (words < 40) issues.push({ code: 'TOO_SHORT', detail: `Body is ${words} words; minimum is 40.` });
  if (words > 170) issues.push({ code: 'TOO_LONG', detail: `Body is ${words} words; maximum is 170.` });

  for (const phrase of BANNED_PHRASES) {
    if (lowerBody.includes(phrase)) {
      issues.push({ code: 'BANNED_PHRASE', detail: `Body contains the forbidden phrase "${phrase}".` });
    }
  }

  const placeholder = PLACEHOLDER_RE.exec(body) ?? PLACEHOLDER_RE.exec(email.subject);
  if (placeholder !== null) {
    issues.push({ code: 'PLACEHOLDER', detail: `Unfilled placeholder "${placeholder[0]}".` });
  }

  if (email.subject.trim().length > 90) {
    issues.push({ code: 'SUBJECT_TOO_LONG', detail: 'Subject exceeds 90 characters.' });
  }
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(email.subject)) {
    issues.push({ code: 'SUBJECT_EMOJI', detail: 'Subject contains an emoji.' });
  }
  if (/<[a-z/][^>]*>/i.test(body) || /\*\*|^#{1,6}\s/m.test(body)) {
    issues.push({ code: 'MARKUP', detail: 'Body contains HTML or markdown markup.' });
  }

  if (evidence.length === 0) {
    issues.push({ code: 'NO_EVIDENCE', detail: 'No verified evidence exists for this lead.' });
  } else {
    const known = new Set(evidence.map((item) => item.claim.trim().toLowerCase()));
    if (!known.has(email.personalizationEvidence.trim().toLowerCase())) {
      // Not fatal on its own — the model may paraphrase — but the source URL must
      // still be one we actually hold.
      const urls = new Set(
        evidence.map((item) => item.sourceUrl).filter((url): url is string => url !== null),
      );
      if (email.sourceUrl !== null && !urls.has(email.sourceUrl)) {
        issues.push({
          code: 'UNKNOWN_SOURCE_URL',
          detail: `sourceUrl "${email.sourceUrl}" is not among this lead's evidence URLs.`,
        });
      }
    }
  }

  const ctaCount = (body.match(/\?/g) ?? []).length;
  if (ctaCount > 3) {
    issues.push({ code: 'TOO_MANY_QUESTIONS', detail: `Body asks ${ctaCount} questions; keep to one clear ask.` });
  }

  return issues;
}

/** Generates the first-touch email. Follow-ups are never generated or scheduled. */
export async function writeEmail(
  llm: LLMProvider,
  input: WriteEmailInput,
): Promise<{ email: EmailGeneration; issues: EmailQualityIssue[]; model: string; durationMs: number }> {
  const evidenceBlock = input.evidence
    .map((item) => `- ${item.claim}${item.sourceUrl !== null ? ` [source: ${item.sourceUrl}]` : ' [no source]'}`)
    .join('\n');

  const result = await completeStructured(llm, {
    schema: EmailGenerationSchema,
    schemaName: 'EmailGenerationSchema',
    jsonSchema: emailGenerationJsonSchema,
    system: SALES_AGENT_SYSTEM_PROMPT,
    user: `${campaignContext(input.campaign)}

${strategyContext(input.strategy)}

=== RECIPIENT ===
Company: ${input.companyName} (${input.domain})
Company description: ${input.companyDescription ?? 'unknown'}
Country: ${input.country ?? 'unknown'}
Website language: ${input.websiteLanguage ?? 'unknown'}
Contact: ${input.contact.fullName ?? 'unknown name'}${input.contact.jobTitle !== null ? `, ${input.contact.jobTitle}` : ''}
First name for greeting: ${input.contact.firstName ?? 'unknown'}
This is a shared company mailbox rather than a named person: ${input.contact.isGeneric ? 'yes' : 'no'}
Sender name to write as: ${input.senderName ?? 'the sender'}

=== VERIFIED EVIDENCE (the ONLY facts you may reference) ===
${evidenceBlock || '(none)'}

Recommended angle: ${input.recommendedAngle ?? 'not determined'}
Strongest signal: ${input.strongestSignal ?? 'not determined'}

Write the first outreach email.

${EMAIL_RULES}

${LANGUAGE_RULES}

Greeting: use the contact's first name if known; if this is a shared mailbox, address the company politely without inventing a name.
"personalizationEvidence" must be the single evidence claim your opening relies on, and "sourceUrl" must be that claim's source URL from the list above. If the evidence list is empty, you must still not invent anything — write nothing that presumes knowledge of this company.`,
    temperature: 0.4,
    maxTokens: 900,
  });

  return {
    email: result.value,
    issues: checkEmailQuality(result.value, input.evidence),
    model: result.model,
    durationMs: result.durationMs,
  };
}
