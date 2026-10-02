import { z } from 'zod';

/**
 * Every LLM interaction in the agent goes through one of these schemas. The Zod
 * schema is the validation authority; the matching `*JsonSchema` is what we hand
 * to the provider so it can constrain decoding.
 */

const nullableString = z.string().trim().min(1).nullable();
const stringList = z.array(z.string().trim().min(1)).default([]);

// --- 1. Campaign interpretation --------------------------------------------

export const CampaignInterpretationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  productOrService: z.string().trim().min(1),
  targetCompanyDescription: z.string().trim().min(1),
  targetRegions: stringList,
  industries: stringList,
  companySizeMin: z.number().int().nonnegative().nullable().default(null),
  companySizeMax: z.number().int().nonnegative().nullable().default(null),
  companySizeNote: nullableString.default(null),
  decisionMakerRoles: stringList,
  buyingSignals: stringList,
  exclusions: stringList,
  preferredLanguages: stringList,
  leadsTarget: z.number().int().positive().max(10_000).nullable().default(null),
  dailySendLimit: z.number().int().positive().max(1000).nullable().default(null),
  notes: nullableString.default(null),
});
export type CampaignInterpretation = z.infer<typeof CampaignInterpretationSchema>;

export const campaignInterpretationJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'name', 'productOrService', 'targetCompanyDescription', 'targetRegions', 'industries',
    'companySizeMin', 'companySizeMax', 'companySizeNote', 'decisionMakerRoles',
    'buyingSignals', 'exclusions', 'preferredLanguages', 'leadsTarget', 'dailySendLimit', 'notes',
  ],
  properties: {
    name: { type: 'string', description: 'Short campaign name, max 60 characters.' },
    productOrService: { type: 'string', description: 'What the user is selling, in their own terms.' },
    targetCompanyDescription: { type: 'string', description: 'The kind of company to look for.' },
    targetRegions: { type: 'array', items: { type: 'string' }, description: 'Countries/regions, or ["worldwide"].' },
    industries: { type: 'array', items: { type: 'string' } },
    companySizeMin: { type: ['integer', 'null'] },
    companySizeMax: { type: ['integer', 'null'] },
    companySizeNote: { type: ['string', 'null'] },
    decisionMakerRoles: { type: 'array', items: { type: 'string' } },
    buyingSignals: { type: 'array', items: { type: 'string' } },
    exclusions: { type: 'array', items: { type: 'string' } },
    preferredLanguages: { type: 'array', items: { type: 'string' }, description: 'ISO 639-1 codes if stated or clearly implied.' },
    leadsTarget: { type: ['integer', 'null'] },
    dailySendLimit: { type: ['integer', 'null'] },
    notes: { type: ['string', 'null'] },
  },
} as const satisfies Record<string, unknown>;

// --- 2. Search strategy -----------------------------------------------------

export const SearchStrategySchema = z.object({
  queries: z.array(z.string().trim().min(3)).min(1).max(30),
  companySources: stringList,
  signalsToLookFor: stringList,
  decisionMakerRoles: stringList,
  pagesToInspect: stringList,
  rationale: nullableString.default(null),
});
export type SearchStrategyOutput = z.infer<typeof SearchStrategySchema>;

export const searchStrategyJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['queries', 'companySources', 'signalsToLookFor', 'decisionMakerRoles', 'pagesToInspect', 'rationale'],
  properties: {
    queries: {
      type: 'array',
      items: { type: 'string' },
      description: 'Web search queries, in the languages most likely to surface these companies.',
    },
    companySources: { type: 'array', items: { type: 'string' } },
    signalsToLookFor: { type: 'array', items: { type: 'string' } },
    decisionMakerRoles: { type: 'array', items: { type: 'string' } },
    pagesToInspect: {
      type: 'array',
      items: { type: 'string' },
      description: 'Website page kinds worth reading for this campaign, e.g. careers, services, about.',
    },
    rationale: { type: ['string', 'null'] },
  },
} as const satisfies Record<string, unknown>;

// --- 3. Page selection (which pages of a site to read) ---------------------

export const PageSelectionSchema = z.object({
  urls: z.array(z.string().trim().min(1)).max(10).default([]),
  reason: nullableString.default(null),
});
export type PageSelection = z.infer<typeof PageSelectionSchema>;

export const pageSelectionJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['urls', 'reason'],
  properties: {
    urls: { type: 'array', items: { type: 'string' }, description: 'Subset of the offered URLs, verbatim.' },
    reason: { type: ['string', 'null'] },
  },
} as const satisfies Record<string, unknown>;

// --- 4. Company research ----------------------------------------------------

export const EvidenceItemSchema = z.object({
  claim: z.string().trim().min(1),
  url: nullableString.default(null),
});

export const CompanyResearchSchema = z.object({
  companyExists: z.boolean(),
  companyName: nullableString,
  country: nullableString.default(null),
  industry: nullableString.default(null),
  description: nullableString.default(null),
  employeeEstimate: z.number().int().positive().nullable().default(null),
  employeeNote: nullableString.default(null),
  websiteLanguage: nullableString.default(null),
  relevantSignals: stringList,
  evidence: z.array(EvidenceItemSchema).default([]),
  sourceUrls: stringList,
  summary: nullableString.default(null),
});
export type CompanyResearch = z.infer<typeof CompanyResearchSchema>;

const evidenceItemJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['claim', 'url'],
  properties: {
    claim: { type: 'string' },
    url: { type: ['string', 'null'], description: 'The exact source URL supporting this claim, from the provided pages.' },
  },
} as const;

export const companyResearchJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'companyExists', 'companyName', 'country', 'industry', 'description', 'employeeEstimate',
    'employeeNote', 'websiteLanguage', 'relevantSignals', 'evidence', 'sourceUrls', 'summary',
  ],
  properties: {
    companyExists: { type: 'boolean' },
    companyName: { type: ['string', 'null'] },
    country: { type: ['string', 'null'], description: 'ISO 3166-1 alpha-2 code when determinable, else null.' },
    industry: { type: ['string', 'null'] },
    description: { type: ['string', 'null'] },
    employeeEstimate: { type: ['integer', 'null'] },
    employeeNote: { type: ['string', 'null'] },
    websiteLanguage: { type: ['string', 'null'], description: 'ISO 639-1 code of the website content.' },
    relevantSignals: { type: 'array', items: { type: 'string' } },
    evidence: { type: 'array', items: evidenceItemJsonSchema },
    sourceUrls: { type: 'array', items: { type: 'string' } },
    summary: { type: ['string', 'null'] },
  },
} as const satisfies Record<string, unknown>;

// --- 5. Lead qualification --------------------------------------------------

export const LeadQualificationSchema = z.object({
  qualified: z.boolean(),
  score: z.number().int().min(0).max(100),
  reason: z.string().trim().min(1),
  strongestSignal: nullableString.default(null),
  recommendedAngle: nullableString.default(null),
  evidence: z.array(EvidenceItemSchema).default([]),
});
export type LeadQualification = z.infer<typeof LeadQualificationSchema>;

export const leadQualificationJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['qualified', 'score', 'reason', 'strongestSignal', 'recommendedAngle', 'evidence'],
  properties: {
    qualified: { type: 'boolean' },
    score: { type: 'integer', minimum: 0, maximum: 100 },
    reason: { type: 'string' },
    strongestSignal: { type: ['string', 'null'] },
    recommendedAngle: { type: ['string', 'null'] },
    evidence: { type: 'array', items: evidenceItemJsonSchema },
  },
} as const satisfies Record<string, unknown>;

// --- 6. Contact selection ---------------------------------------------------

export const ContactSelectionSchema = z.object({
  found: z.boolean(),
  fullName: nullableString.default(null),
  firstName: nullableString.default(null),
  lastName: nullableString.default(null),
  jobTitle: nullableString.default(null),
  /** Must be an address that literally appeared in the supplied page text. */
  email: nullableString.default(null),
  emailFoundOnPage: z.boolean().default(false),
  linkedinUrl: nullableString.default(null),
  sourceUrl: nullableString.default(null),
  isGeneric: z.boolean().default(false),
  confidence: z.number().int().min(0).max(100).nullable().default(null),
  reason: nullableString.default(null),
});
export type ContactSelection = z.infer<typeof ContactSelectionSchema>;

export const contactSelectionJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'found', 'fullName', 'firstName', 'lastName', 'jobTitle', 'email', 'emailFoundOnPage',
    'linkedinUrl', 'sourceUrl', 'isGeneric', 'confidence', 'reason',
  ],
  properties: {
    found: { type: 'boolean' },
    fullName: { type: ['string', 'null'] },
    firstName: { type: ['string', 'null'] },
    lastName: { type: ['string', 'null'] },
    jobTitle: { type: ['string', 'null'] },
    email: { type: ['string', 'null'], description: 'Copy verbatim from the page text, or null. Never construct one.' },
    emailFoundOnPage: { type: 'boolean', description: 'True only if the address appears literally in the supplied text.' },
    linkedinUrl: { type: ['string', 'null'] },
    sourceUrl: { type: ['string', 'null'] },
    isGeneric: { type: 'boolean', description: 'True for shared mailboxes such as info@ or office@.' },
    confidence: { type: ['integer', 'null'], minimum: 0, maximum: 100 },
    reason: { type: ['string', 'null'] },
  },
} as const satisfies Record<string, unknown>;

// --- 7. Email generation ----------------------------------------------------

export const EmailGenerationSchema = z.object({
  language: z.string().trim().min(2).max(10),
  subject: z.string().trim().min(3).max(120),
  body: z.string().trim().min(40),
  personalizationEvidence: z.string().trim().min(1),
  sourceUrl: nullableString.default(null),
});
export type EmailGeneration = z.infer<typeof EmailGenerationSchema>;

export const emailGenerationJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['language', 'subject', 'body', 'personalizationEvidence', 'sourceUrl'],
  properties: {
    language: { type: 'string', description: 'ISO 639-1 code of the language the email is written in.' },
    subject: { type: 'string' },
    body: { type: 'string', description: 'Plain text, 60-120 words, no placeholders, no markdown.' },
    personalizationEvidence: { type: 'string', description: 'The verified fact the opening line relies on.' },
    sourceUrl: { type: ['string', 'null'], description: 'URL proving that fact.' },
  },
} as const satisfies Record<string, unknown>;

// --- 8. Discovery candidate extraction -------------------------------------

export const DiscoveryCandidateSchema = z.object({
  domain: z.string().trim().min(3),
  companyName: nullableString.default(null),
  whyRelevant: nullableString.default(null),
  sourceUrl: nullableString.default(null),
});

export const DiscoveryCandidatesSchema = z.object({
  candidates: z.array(DiscoveryCandidateSchema).max(60).default([]),
  rejected: z
    .array(z.object({ domain: z.string().trim().min(1), reason: z.string().trim().min(1) }))
    .max(60)
    .default([]),
});
export type DiscoveryCandidates = z.infer<typeof DiscoveryCandidatesSchema>;

export const discoveryCandidatesJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['candidates', 'rejected'],
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['domain', 'companyName', 'whyRelevant', 'sourceUrl'],
        properties: {
          domain: { type: 'string', description: 'Bare company domain, e.g. example.com. Never a directory or social network.' },
          companyName: { type: ['string', 'null'] },
          whyRelevant: { type: ['string', 'null'] },
          sourceUrl: { type: ['string', 'null'] },
        },
      },
    },
    rejected: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['domain', 'reason'],
        properties: { domain: { type: 'string' }, reason: { type: 'string' } },
      },
    },
  },
} as const satisfies Record<string, unknown>;
