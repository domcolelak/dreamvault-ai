import { LLMError, LLMNotConfiguredError } from './types';
import type { ChatMessage, CompletionOptions, CompletionResult, LLMProvider, ProviderHealth } from './types';

type OllamaChatResponse = {
  message?: { content?: string };
  error?: string;
};

type OllamaTagsResponse = {
  models?: Array<{ name?: string }>;
};

export type OllamaConfig = {
  baseUrl: string | null;
  model: string | null;
  timeoutMs: number;
};

/** Local Ollama provider. Model and base URL always come from configuration. */
export class OllamaProvider implements LLMProvider {
  readonly name = 'ollama';

  constructor(private readonly config: OllamaConfig) {}

  get model(): string {
    return this.config.model ?? '';
  }

  private requireConfig(): { baseUrl: string; model: string } {
    const { baseUrl, model } = this.config;
    if (baseUrl === null) {
      throw new LLMNotConfiguredError(this.name, 'OLLAMA_BASE_URL is not set.');
    }
    if (model === null) {
      throw new LLMNotConfiguredError(this.name, 'No Ollama model configured (set OLLAMA_MODEL or pick one in Settings).');
    }
    return { baseUrl: baseUrl.replace(/\/+$/, ''), model };
  }

  async complete(messages: ChatMessage[], options: CompletionOptions = {}): Promise<CompletionResult> {
    const { baseUrl, model } = this.requireConfig();
    const started = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? this.config.timeoutMs);

    try {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          // Ollama accepts a JSON Schema in `format` and constrains decoding to it.
          ...(options.jsonSchema ? { format: options.jsonSchema } : {}),
          options: {
            temperature: options.temperature ?? 0.2,
            ...(options.maxTokens ? { num_predict: options.maxTokens } : {}),
          },
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new LLMError(`Ollama returned ${response.status}: ${body.slice(0, 400)}`, this.name);
      }

      const data = (await response.json()) as OllamaChatResponse;
      if (data.error) throw new LLMError(`Ollama error: ${data.error}`, this.name);
      const text = data.message?.content ?? '';
      if (text.trim() === '') throw new LLMError('Ollama returned an empty response.', this.name);

      return { text, model, provider: this.name, durationMs: Date.now() - started };
    } catch (error) {
      if (error instanceof LLMError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new LLMError('Ollama request timed out.', this.name, error);
      }
      throw new LLMError(`Could not reach Ollama at ${baseUrl}.`, this.name, error);
    } finally {
      clearTimeout(timeout);
    }
  }

  async health(): Promise<ProviderHealth> {
    const { baseUrl, model } = this.config;
    if (baseUrl === null) {
      return { configured: false, ok: false, detail: 'OLLAMA_BASE_URL is not set.' };
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/tags`, { signal: controller.signal });
      if (!response.ok) {
        return { configured: true, ok: false, detail: `Ollama responded with ${response.status}.` };
      }
      const data = (await response.json()) as OllamaTagsResponse;
      const models = (data.models ?? []).map((entry) => entry.name ?? '').filter((name) => name !== '');
      if (model === null) {
        return { configured: false, ok: false, detail: 'Reachable, but no model is configured.', models };
      }
      const present = models.some((name) => name === model || name.split(':')[0] === model);
      return {
        configured: true,
        ok: present,
        detail: present
          ? `Reachable; model "${model}" is available.`
          : `Reachable, but model "${model}" is not pulled. Run: ollama pull ${model}`,
        models,
      };
    } catch (error) {
      return {
        configured: true,
        ok: false,
        detail: error instanceof Error && error.name === 'AbortError'
          ? 'Connection to Ollama timed out.'
          : `Could not reach Ollama at ${baseUrl}.`,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
