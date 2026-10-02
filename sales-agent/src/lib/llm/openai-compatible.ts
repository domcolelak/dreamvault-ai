import { LLMError, LLMNotConfiguredError } from './types';
import type { ChatMessage, CompletionOptions, CompletionResult, LLMProvider, ProviderHealth } from './types';

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

export type OpenAICompatibleConfig = {
  baseUrl: string | null;
  apiKey: string | null;
  model: string | null;
  timeoutMs: number;
  /** Label shown in the UI: openai, mistral, openrouter, vllm, ... */
  label?: string;
};

/**
 * Works against any `/chat/completions` endpoint: OpenAI, Mistral, OpenRouter,
 * Groq, vLLM, LM Studio, LiteLLM proxies. Anthropic needs its own provider
 * class (different wire format) and can be added beside this one.
 */
export class OpenAICompatibleProvider implements LLMProvider {
  readonly name: string;

  constructor(private readonly config: OpenAICompatibleConfig) {
    this.name = config.label ?? 'openai-compatible';
  }

  get model(): string {
    return this.config.model ?? '';
  }

  private requireConfig(): { baseUrl: string; model: string } {
    if (this.config.baseUrl === null) {
      throw new LLMNotConfiguredError(this.name, 'LLM_BASE_URL is not set.');
    }
    if (this.config.model === null) {
      throw new LLMNotConfiguredError(this.name, 'LLM_MODEL is not set.');
    }
    return { baseUrl: this.config.baseUrl.replace(/\/+$/, ''), model: this.config.model };
  }

  async complete(messages: ChatMessage[], options: CompletionOptions = {}): Promise<CompletionResult> {
    const { baseUrl, model } = this.requireConfig();
    const started = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? this.config.timeoutMs);

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {}),
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages,
          temperature: options.temperature ?? 0.2,
          ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
          ...(options.jsonSchema
            ? {
                response_format: {
                  type: 'json_schema',
                  json_schema: { name: 'structured_output', strict: false, schema: options.jsonSchema },
                },
              }
            : {}),
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new LLMError(`${this.name} returned ${response.status}: ${body.slice(0, 400)}`, this.name);
      }

      const data = (await response.json()) as ChatCompletionResponse;
      if (data.error?.message) throw new LLMError(data.error.message, this.name);
      const text = data.choices?.[0]?.message?.content ?? '';
      if (text.trim() === '') throw new LLMError(`${this.name} returned an empty response.`, this.name);

      return { text, model, provider: this.name, durationMs: Date.now() - started };
    } catch (error) {
      if (error instanceof LLMError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new LLMError(`${this.name} request timed out.`, this.name, error);
      }
      throw new LLMError(`Could not reach ${this.name} at ${this.config.baseUrl}.`, this.name, error);
    } finally {
      clearTimeout(timeout);
    }
  }

  async health(): Promise<ProviderHealth> {
    if (this.config.baseUrl === null || this.config.model === null) {
      return {
        configured: false,
        ok: false,
        detail: 'Set LLM_BASE_URL and LLM_MODEL to use an OpenAI-compatible provider.',
      };
    }
    try {
      const response = await fetch(`${this.config.baseUrl.replace(/\/+$/, '')}/models`, {
        headers: this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {},
        signal: AbortSignal.timeout(10_000),
      });
      return {
        configured: true,
        ok: response.ok,
        detail: response.ok ? 'Endpoint reachable.' : `Endpoint responded with ${response.status}.`,
      };
    } catch {
      return { configured: true, ok: false, detail: `Could not reach ${this.config.baseUrl}.` };
    }
  }
}
