'use client';

import type { Campaign } from '@prisma/client';
import { updateCampaignConfig } from '@/app/actions/campaigns';
import { ActionForm } from './action-form';
import { Field } from './ui';

/**
 * Lets the operator correct the AI's interpretation. Saving also marks the
 * interpretation as reviewed, which is a precondition for activating sending.
 */
export function CampaignConfigForm({ campaign }: { campaign: Campaign }) {
  const lines = (values: string[]) => values.join('\n');

  return (
    <ActionForm action={(formData) => updateCampaignConfig(campaign.id, formData)} submitLabel="Save configuration">
      <div className="space-y-5">
        <Field label="Campaign name">
          <input name="name" defaultValue={campaign.name} required className="input" />
        </Field>

        <Field label="What is being sold">
          <textarea name="productOrService" rows={2} defaultValue={campaign.productOrService ?? ''} className="input" />
        </Field>

        <Field label="Target companies">
          <textarea
            name="targetCompanyDescription"
            rows={3}
            defaultValue={campaign.targetCompanyDescription ?? ''}
            className="input"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Regions" hint="One per line. Use “worldwide” for no restriction.">
            <textarea name="targetRegions" rows={3} defaultValue={lines(campaign.targetRegions)} className="input" />
          </Field>
          <Field label="Industries" hint="One per line. Leave empty if sector-agnostic.">
            <textarea name="industries" rows={3} defaultValue={lines(campaign.industries)} className="input" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Decision maker roles" hint="One per line.">
            <textarea
              name="decisionMakerRoles"
              rows={4}
              defaultValue={lines(campaign.decisionMakerRoles)}
              className="input"
            />
          </Field>
          <Field label="Buying signals" hint="Publicly checkable facts. One per line.">
            <textarea name="buyingSignals" rows={4} defaultValue={lines(campaign.buyingSignals)} className="input" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Exclusions" hint="Company kinds to reject. One per line.">
            <textarea name="exclusions" rows={3} defaultValue={lines(campaign.exclusions)} className="input" />
          </Field>
          <Field label="Preferred languages" hint="ISO 639-1 codes. Empty means the agent decides per company.">
            <textarea
              name="preferredLanguages"
              rows={3}
              defaultValue={lines(campaign.preferredLanguages)}
              className="input"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Min employees">
            <input
              name="companySizeMin"
              type="number"
              min={0}
              defaultValue={campaign.companySizeMin ?? ''}
              className="input"
            />
          </Field>
          <Field label="Max employees">
            <input
              name="companySizeMax"
              type="number"
              min={0}
              defaultValue={campaign.companySizeMax ?? ''}
              className="input"
            />
          </Field>
          <Field label="Lead target">
            <input name="leadsTarget" type="number" min={1} defaultValue={campaign.leadsTarget} className="input" />
          </Field>
          <Field label="Daily send limit">
            <input
              name="dailySendLimit"
              type="number"
              min={1}
              defaultValue={campaign.dailySendLimit}
              className="input"
            />
          </Field>
          <Field label="Minimum score">
            <input
              name="minimumScore"
              type="number"
              min={0}
              max={100}
              defaultValue={campaign.minimumScore}
              className="input"
            />
          </Field>
        </div>

        <Field label="Notes" hint="Anything the agent should keep in mind for this campaign.">
          <textarea
            name="interpretationNotes"
            rows={3}
            defaultValue={campaign.interpretationNotes ?? ''}
            className="input"
          />
        </Field>
      </div>
    </ActionForm>
  );
}
