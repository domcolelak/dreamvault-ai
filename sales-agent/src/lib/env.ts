import { z } from 'zod';

/**
 * Server-only environment access. Never import this from a client component —
 * every value here is a server secret or a server-side default.
 *
 * Nothing throws at import time: a missing provider key must degrade to a
 * clearly reported "not configured" state, not a crashed application.
 */

const boolish = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value.trim() === '') return fallback;
      return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
    });

const intish = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value.trim() === '') return fallback;
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) ? parsed : fallback;
    });

const str = z
  .string()
  .optional()
  .transform((value) => (value === undefined || value.trim() === '' ? null : value.trim()));

const envSchema = z.object({
  DATABASE_URL: str,

  LLM_PROVIDER: str,
  OLLAMA_BASE_URL: str,
  OLLAMA_MODEL: str,
  LLM_BASE_URL: str,
  LLM_API_KEY: str,
  LLM_MODEL: str,
  LLM_TIMEOUT_SECONDS: intish(180),

  SMTP_HOST: str,
  SMTP_PORT: intish(465),
  SMTP_SECURE: boolish(true),
  SMTP_USER: str,
  SMTP_PASSWORD: str,
  SMTP_FROM_NAME: str,
  SMTP_FROM_EMAIL: str,

  IMAP_HOST: str,
  IMAP_PORT: intish(993),
  IMAP_SECURE: boolish(true),
  IMAP_USER: str,
  IMAP_PASSWORD: str,
  IMAP_MAILBOX: str,

  APP_URL: str,
  JOB_RUNNER_TOKEN: str,

  SEARCH_PROVIDER: str,
  SEARCH_API_KEY: str,
  SEARCH_ENGINE_ID: str,

  EMAIL_VERIFICATION_PROVIDER: str,
  EMAIL_VERIFICATION_API_KEY: str,

  ENRICHMENT_PROVIDER: str,
  ENRICHMENT_API_KEY: str,

  GLOBAL_DAILY_EMAIL_LIMIT: intish(100),
  WORKING_HOURS_START: intish(9),
  WORKING_HOURS_END: intish(17),
  TIMEZONE: str,
  SEND_MIN_GAP_MINUTES: intish(4),
  SEND_MAX_GAP_MINUTES: intish(14),

  CRAWLER_USER_AGENT: str,
  CRAWLER_TIMEOUT_SECONDS: intish(20),
  CRAWLER_MAX_PAGES_PER_COMPANY: intish(6),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  // Parsing cannot fail: every field is optional with a transform.
  cached = envSchema.parse(process.env);
  return cached;
}

/** Defaults used wherever AppSettings has no stored override. */
export function envDefaults() {
  const e = env();
  return {
    llmProvider: e.LLM_PROVIDER ?? 'ollama',
    llmModel: e.LLM_PROVIDER === 'openai-compatible' ? e.LLM_MODEL : e.OLLAMA_MODEL,
    llmBaseUrl: e.LLM_PROVIDER === 'openai-compatible' ? e.LLM_BASE_URL : e.OLLAMA_BASE_URL,
    searchProvider: e.SEARCH_PROVIDER ?? 'none',
    verificationProvider: e.EMAIL_VERIFICATION_PROVIDER ?? 'none',
    enrichmentProvider: e.ENRICHMENT_PROVIDER ?? 'none',
    globalDailyEmailLimit: e.GLOBAL_DAILY_EMAIL_LIMIT,
    workingHoursStart: e.WORKING_HOURS_START,
    workingHoursEnd: e.WORKING_HOURS_END,
    timezone: e.TIMEZONE ?? 'UTC',
    sendMinGapMinutes: e.SEND_MIN_GAP_MINUTES,
    sendMaxGapMinutes: e.SEND_MAX_GAP_MINUTES,
    senderName: e.SMTP_FROM_NAME,
    senderEmail: e.SMTP_FROM_EMAIL,
  } as const;
}
