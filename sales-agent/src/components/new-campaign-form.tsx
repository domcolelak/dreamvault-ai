'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createCampaign } from '@/app/actions/campaigns';
import { Field } from './ui';

/**
 * The campaign creation form. It is a client component so that a successful
 * creation can navigate straight to the new campaign's detail page, where the
 * operator reviews the AI interpretation.
 */
export function NewCampaignForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        setPending(true);
        setError(null);
        try {
          const result = await createCampaign(formData);
          // A campaign id comes back even when interpretation failed, so the
          // operator can see the saved brief and retry from the detail page.
          if (result.campaignId !== undefined) {
            router.push(`/campaigns/${result.campaignId}`);
            return;
          }
          setError(result.message);
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : 'Could not create the campaign.');
        } finally {
          setPending(false);
        }
      }}
    >
      <div className="space-y-5">
        <Field
          label="What do you want to sell and who do you want to find?"
          hint="Include the region, the kind of company, the decision makers, any buying signals, and anything to avoid. Any language."
        >
          <textarea
            name="rawBrief"
            rows={9}
            required
            minLength={30}
            className="input"
            placeholder="Find ecommerce companies in Europe that are expanding internationally. I want to offer localization and multilingual customer support. Avoid dropshipping stores and microbusinesses. Target CEO, Head of Ecommerce, Head of Expansion or Localization Manager. Find 30 new leads per day."
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Lead target" hint="Total leads to find.">
            <input name="leadsTarget" type="number" min={1} max={10000} defaultValue={30} className="input" />
          </Field>
          <Field label="Daily send limit" hint="Max emails per day for this campaign.">
            <input name="dailySendLimit" type="number" min={1} max={1000} defaultValue={20} className="input" />
          </Field>
          <Field label="Minimum score" hint="Leads below this are never contacted.">
            <input name="minimumScore" type="number" min={0} max={100} defaultValue={75} className="input" />
          </Field>
        </div>

        <p className="rounded-md border border-border bg-surfaceMuted px-3 py-2 text-xs text-fgMuted">
          New campaigns always start in <strong className="text-fg">DRAFT_ONLY</strong> mode. Nothing is ever sent until
          you review the leads and switch the campaign to automatic yourself.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? 'Interpreting the brief…' : 'Create and interpret'}
        </button>
        {error !== null && <span className="max-w-prose text-sm text-rose-700 dark:text-rose-300">{error}</span>}
      </div>
    </form>
  );
}
