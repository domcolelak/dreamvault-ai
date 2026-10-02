import {
  testImapAction,
  testOllamaAction,
  testSmtpAction,
  updateSettingsAction,
} from '@/app/actions/system';
import { ActionButton } from '@/components/action-button';
import { ActionForm } from '@/components/action-form';
import { ConfiguredBadge } from '@/components/status-badge';
import { Card, Field, KeyValue, PageHeader } from '@/components/ui';
import { env } from '@/lib/env';
import { createLLMProvider } from '@/lib/llm';
import { getEmailProvider } from '@/lib/providers/email';
import { imapStatus } from '@/lib/providers/imap/client';
import { createEnrichmentProvider } from '@/lib/providers/enrichment';
import { createSearchProvider } from '@/lib/providers/search';
import { createVerificationProvider } from '@/lib/providers/verification';
import { resolveSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

const LLM_PROVIDERS = [
  { value: 'ollama', label: 'Ollama (local)' },
  { value: 'openai-compatible', label: 'OpenAI-compatible endpoint' },
] as const;

const SEARCH_PROVIDERS = ['none', 'serper', 'brave', 'google_cse'] as const;
const VERIFICATION_PROVIDERS = ['none', 'hunter'] as const;
const ENRICHMENT_PROVIDERS = ['none', 'hunter'] as const;
const TRUST_STATUSES = ['VERIFIED', 'VALID', 'UNKNOWN', 'GUESSED'] as const;

export default async function SettingsPage() {
  const settings = await resolveSettings();
  const e = env();

  const llm = createLLMProvider({
    provider: settings.llmProvider,
    model: settings.llmModel,
    baseUrl: settings.llmBaseUrl,
  });
  const search = createSearchProvider(settings.searchProvider);
  const verification = createVerificationProvider(settings.verificationProvider);
  const enrichment = createEnrichmentProvider(settings.enrichmentProvider);
  const smtp = getEmailProvider();
  const imap = imapStatus();

  return (
    <>
      <PageHeader
        title="Settings"
        description="Credentials live in environment variables only and are never sent to the model. Everything below is safe to change at runtime."
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card title="Connection tests">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-fg">Ollama / LLM</span>
              <ActionButton action={testOllamaAction}>Test</ActionButton>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-fg">SMTP</span>
              <ActionButton action={testSmtpAction}>Test</ActionButton>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-fg">IMAP</span>
              <ActionButton action={testImapAction}>Test</ActionButton>
            </div>
          </div>
        </Card>

        <Card title="Email (from environment)" description="Change these in .env and restart.">
          <KeyValue
            items={[
              { label: 'SMTP', value: <ConfiguredBadge configured={smtp.configured} /> },
              { label: 'SMTP host', value: e.SMTP_HOST ?? 'not set' },
              { label: 'SMTP port', value: `${e.SMTP_PORT} ${e.SMTP_SECURE ? '(TLS)' : '(STARTTLS)'}` },
              { label: 'IMAP', value: <ConfiguredBadge configured={imap.configured} /> },
              { label: 'IMAP host', value: e.IMAP_HOST ?? 'not set' },
              { label: 'IMAP mailbox', value: e.IMAP_MAILBOX ?? 'INBOX' },
            ]}
          />
          <p className="mt-3 text-xs text-fgMuted">{smtp.status().detail}</p>
          <p className="mt-1 text-xs text-fgMuted">{imap.detail}</p>
        </Card>

        <Card title="Provider status">
          <KeyValue
            items={[
              { label: 'LLM', value: `${llm.name} · ${settings.llmModel ?? 'no model'}` },
              { label: 'Search', value: <ConfiguredBadge configured={search.configured} /> },
              { label: 'Verification', value: <ConfiguredBadge configured={verification.configured} /> },
              { label: 'Enrichment', value: <ConfiguredBadge configured={enrichment.configured} /> },
            ]}
          />
          <ul className="mt-3 space-y-1 text-xs text-fgMuted">
            <li>{search.status().detail}</li>
            <li>{verification.status().detail}</li>
            <li>{enrichment.status().detail}</li>
          </ul>
        </Card>
      </div>

      <Card title="Configuration" description="Stored in the database; these override the .env defaults.">
        <ActionForm action={updateSettingsAction} submitLabel="Save settings">
          <div className="space-y-8">
            <section>
              <h3 className="mb-3 text-sm font-semibold text-fg">LLM</h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Provider">
                  <select name="llmProvider" defaultValue={settings.llmProvider} className="input">
                    {LLM_PROVIDERS.map((provider) => (
                      <option key={provider.value} value={provider.value}>
                        {provider.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Model" hint="Never hardcoded. Any tag your provider serves.">
                  <input name="llmModel" defaultValue={settings.llmModel ?? ''} className="input" placeholder="qwen3" />
                </Field>
                <Field label="Base URL" hint="Ollama or your OpenAI-compatible endpoint.">
                  <input
                    name="llmBaseUrl"
                    defaultValue={settings.llmBaseUrl ?? ''}
                    className="input"
                    placeholder="http://localhost:11434"
                  />
                </Field>
              </div>
            </section>

            <section>
              <h3 className="mb-3 text-sm font-semibold text-fg">Sender identity</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Sender name">
                  <input name="senderName" defaultValue={settings.senderName ?? ''} className="input" />
                </Field>
                <Field label="Sender email" hint="Must be a mailbox your SMTP account may send from.">
                  <input
                    name="senderEmail"
                    type="email"
                    defaultValue={settings.senderEmail ?? ''}
                    className="input"
                  />
                </Field>
              </div>
            </section>

            <section>
              <h3 className="mb-3 text-sm font-semibold text-fg">Limits and scheduling</h3>
              <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
                <Field label="Mailbox daily limit">
                  <input
                    name="globalDailyEmailLimit"
                    type="number"
                    min={1}
                    defaultValue={settings.globalDailyEmailLimit}
                    className="input"
                  />
                </Field>
                <Field label="Hours start">
                  <input
                    name="workingHoursStart"
                    type="number"
                    min={0}
                    max={23}
                    defaultValue={settings.workingHoursStart}
                    className="input"
                  />
                </Field>
                <Field label="Hours end">
                  <input
                    name="workingHoursEnd"
                    type="number"
                    min={1}
                    max={24}
                    defaultValue={settings.workingHoursEnd}
                    className="input"
                  />
                </Field>
                <Field label="Min gap (min)">
                  <input
                    name="sendMinGapMinutes"
                    type="number"
                    min={1}
                    defaultValue={settings.sendMinGapMinutes}
                    className="input"
                  />
                </Field>
                <Field label="Max gap (min)">
                  <input
                    name="sendMaxGapMinutes"
                    type="number"
                    min={1}
                    defaultValue={settings.sendMaxGapMinutes}
                    className="input"
                  />
                </Field>
                <Field label="Timezone" hint="IANA name.">
                  <input name="timezone" defaultValue={settings.timezone} className="input" />
                </Field>
              </div>
            </section>

            <section>
              <h3 className="mb-1 text-sm font-semibold text-fg">Automatic-send trust threshold</h3>
              <p className="mb-3 text-sm text-fgMuted">
                Only contacts whose address carries one of these statuses may be emailed automatically. INVALID is never
                sendable.
              </p>
              <div className="flex flex-wrap gap-4">
                {TRUST_STATUSES.map((status) => (
                  <label key={status} className="flex items-center gap-2 text-sm text-fg">
                    <input
                      type="checkbox"
                      name="autoSendEmailStatuses"
                      value={status}
                      defaultChecked={settings.autoSendEmailStatuses.includes(status)}
                      className="h-4 w-4 rounded border-border"
                    />
                    {status}
                  </label>
                ))}
              </div>
            </section>

            <section>
              <h3 className="mb-3 text-sm font-semibold text-fg">Providers</h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Search provider" hint="API keys come from .env.">
                  <select name="searchProvider" defaultValue={settings.searchProvider} className="input">
                    {SEARCH_PROVIDERS.map((provider) => (
                      <option key={provider} value={provider}>
                        {provider}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Email verification">
                  <select name="verificationProvider" defaultValue={settings.verificationProvider} className="input">
                    {VERIFICATION_PROVIDERS.map((provider) => (
                      <option key={provider} value={provider}>
                        {provider}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Contact enrichment">
                  <select name="enrichmentProvider" defaultValue={settings.enrichmentProvider} className="input">
                    {ENRICHMENT_PROVIDERS.map((provider) => (
                      <option key={provider} value={provider}>
                        {provider}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </section>
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
