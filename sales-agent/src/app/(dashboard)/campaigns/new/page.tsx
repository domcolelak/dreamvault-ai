import { NewCampaignForm } from '@/components/new-campaign-form';
import { Card, PageHeader } from '@/components/ui';
import { createLLMProvider } from '@/lib/llm';
import { resolveSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

const EXAMPLES = [
  'Find German manufacturing companies with 20-200 employees that appear to have manual administrative processes. I want to sell AI workflow automation. Target CEO, COO or Head of Operations.',
  'Nájdi slovenské športové kluby v kolektívnych športoch. Chcem im ponúknuť vytvorenie vlastnej klubovej hymny.',
  'Find US SaaS companies expanding into Europe. I want to sell localization and multilingual customer support. Target founders, Heads of Growth or Localization Managers.',
  'Nájdi účtovnícke firmy na Slovensku s minimálne 5 zamestnancami. Chcem im predávať AI voice agenta na zdvíhanie telefonátov.',
];

export default async function NewCampaignPage() {
  const settings = await resolveSettings();
  const llm = createLLMProvider({
    provider: settings.llmProvider,
    model: settings.llmModel,
    baseUrl: settings.llmBaseUrl,
  });
  const health = await llm.health();

  return (
    <>
      <PageHeader
        title="New campaign"
        description="Describe the campaign in your own words, in any language. The agent turns it into a structured configuration you can review and edit."
      />

      {!health.ok && (
        <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          <strong className="font-semibold">LLM not ready:</strong> {health.detail} The campaign will still be saved, but
          the brief cannot be interpreted until this is fixed.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.4fr,1fr]">
        <Card title="Campaign brief">
          <NewCampaignForm />
        </Card>

        <Card title="Example briefs" description="Four unrelated campaigns, all handled by the same code.">
          <ul className="space-y-3">
            {EXAMPLES.map((example) => (
              <li key={example} className="rounded-md border border-border bg-surfaceMuted px-3 py-2 text-sm text-fgMuted">
                {example}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
