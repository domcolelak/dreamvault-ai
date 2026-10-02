import { z } from 'zod';
import { env } from '../env';
import { resolveSettings } from '../settings';
import { parseJsonSafely } from './json';
import { OllamaProvider } from './ollama';
import { OpenAICompatibleProvider } from './openai-compatible';
import { LLMError } from './types';
import type { LLMProvider, StructuredRequest } from './types';

export type { LLMProvider, ProviderHealth, ChatMessage } from './types';
export { LLMError, LLMNotConfiguredError } from './types';

/**
 * Builds the configured provider. Adding Anthropic / Mistral-native / any other
 * backend means adding a class implementing LLMProvider and a case here — no
 * call site changes, and no model name is ever hardcoded.
 */
export function createLLMProvider(config: {
  provider: string;
  model: string | null;
  baseUrl: string | null;
}): LLMProvider {
  const timeoutMs = env().LLM_TIMEOUT_SECONDS * 1000;
  switch (config.provider) {
    case 'openai-compatible':
    case 'openai':
    case 'mistral':
    case 'openrouter':
      return new OpenAICompatibleProvider({
        baseUrl: config.baseUrl ?? env().LLM_BASE_URL,
        apiKey: env().LLM_API_KEY,
        model: config.model,
        timeoutMs,
        label: config.provider === 'openai-compatible' ? 'openai-compatible' : config.provider,
      });
    case 'ollama':
    default:
      return new OllamaProvider({
        baseUrl: config.baseUrl ?? env().OLLAMA_BASE_URL,
        model: config.model,
        timeoutMs,
      });
  }
}

export async function getLLM(): Promise<LLMProvider> {
  const settings = await resolveSettings();
  return createLLMProvider({
    provider: settings.llmProvider,
    model: settings.llmModel,
    baseUrl: settings.llmBaseUrl,
  });
}

export type StructuredResult<T> = {
  value: T;
  model: string;
  provider: string;
  durationMs: number;
  attempts: number;
};

const JSON_ONLY_RULE =
  'Respond with a single JSON object that conforms to the provided JSON schema. ' +
  'No prose, no markdown fences, no explanation outside the JSON. ' +
  'Where a value is not known or cannot be verified, use null — never invent a value.';

/**
 * Asks the model for a value of a known shape and validates it with Zod.
 * An unvalidatable response is retried with the validation error fed back; if it
 * still fails we throw, so no downstream step can ever act on invalid output.
 */
export async function completeStructured<T extends z.ZodTypeAny>(
  llm: LLMProvider,
  request: StructuredRequest<T>,
): Promise<StructuredResult<z.infer<T>>> {
  const retries = request.retries ?? 2;
  let lastError = 'unknown error';
  let totalDuration = 0;

  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    const repair =
      attempt === 1
        ? ''
        : `\n\nYour previous response was rejected: ${lastError}\nReturn corrected JSON only.`;

    const result = await llm.complete(
      [
        { role: 'system', content: `${request.system}\n\n${JSON_ONLY_RULE}` },
        {
          role: 'user',
          content: `${request.user}\n\nJSON schema (${request.schemaName}):\n${JSON.stringify(
            request.jsonSchema,
          )}${repair}`,
        },
      ],
      {
        temperature: request.temperature ?? 0.2,
        maxTokens: request.maxTokens,
        jsonSchema: request.jsonSchema,
      },
    );
    totalDuration += result.durationMs;

    const parsed = parseJsonSafely(result.text);
    if (!parsed.ok) {
      lastError = parsed.error;
      continue;
    }

    const validated = request.schema.safeParse(parsed.value);
    if (!validated.success) {
      lastError = validated.error.issues
        .slice(0, 6)
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('; ');
      continue;
    }

    return {
      value: validated.data as z.infer<T>,
      model: result.model,
      provider: result.provider,
      durationMs: totalDuration,
      attempts: attempt,
    };
  }

  throw new LLMError(
    `Model output failed ${request.schemaName} validation after ${retries + 1} attempts: ${lastError}`,
    llm.name,
  );
}
