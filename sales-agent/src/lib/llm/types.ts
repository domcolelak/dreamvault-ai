import type { z } from 'zod';

export type ChatRole = 'system' | 'user' | 'assistant';

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type CompletionOptions = {
  temperature?: number;
  maxTokens?: number;
  /** JSON Schema the provider should constrain generation to, when supported. */
  jsonSchema?: Record<string, unknown>;
  timeoutMs?: number;
};

export type CompletionResult = {
  text: string;
  model: string;
  provider: string;
  durationMs: number;
};

export type ProviderHealth = {
  configured: boolean;
  ok: boolean;
  detail: string;
  /** Model names the provider reports as available, when it can tell us. */
  models?: string[];
};

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  complete(messages: ChatMessage[], options?: CompletionOptions): Promise<CompletionResult>;
  health(): Promise<ProviderHealth>;
}

/** Thrown when a provider is reachable but the response could not be used. */
export class LLMError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

export class LLMNotConfiguredError extends LLMError {
  constructor(provider: string, detail: string) {
    super(detail, provider);
    this.name = 'LLMNotConfiguredError';
  }
}

export type StructuredRequest<T extends z.ZodTypeAny> = {
  schema: T;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  /** How many times to re-ask after a validation failure. */
  retries?: number;
};
