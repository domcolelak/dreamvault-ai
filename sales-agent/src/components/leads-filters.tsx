'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

export type FilterOption = { value: string; label: string };

/**
 * Filter bar driven entirely by the URL, so every filtered view is linkable and
 * the server does the filtering.
 */
export function LeadsFilters({
  campaigns,
  statuses,
  emailStatuses,
  countries,
}: {
  campaigns: FilterOption[];
  statuses: FilterOption[];
  emailStatuses: FilterOption[];
  countries: FilterOption[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  const update = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value === '') next.delete(key);
      else next.set(key, value);
      next.delete('page');
      router.push(`/leads?${next.toString()}`);
    },
    [params, router],
  );

  const current = (key: string) => params.get(key) ?? '';

  return (
    <div className="card mb-5 flex flex-wrap items-end gap-3 px-4 py-3">
      <Select label="Campaign" value={current('campaign')} options={campaigns} onChange={(v) => update('campaign', v)} />
      <Select label="Status" value={current('status')} options={statuses} onChange={(v) => update('status', v)} />
      <Select
        label="Email status"
        value={current('emailStatus')}
        options={emailStatuses}
        onChange={(v) => update('emailStatus', v)}
      />
      <Select label="Country" value={current('country')} options={countries} onChange={(v) => update('country', v)} />

      <label className="flex flex-col gap-1">
        <span className="label mb-0">Min score</span>
        <input
          type="number"
          min={0}
          max={100}
          defaultValue={current('minScore')}
          onBlur={(event) => update('minScore', event.target.value)}
          className="input w-24"
        />
      </label>

      <label className="flex min-w-[200px] flex-1 flex-col gap-1">
        <span className="label mb-0">Search</span>
        <input
          type="search"
          placeholder="Company, domain, contact or email"
          defaultValue={current('q')}
          onKeyDown={(event) => {
            if (event.key === 'Enter') update('q', event.currentTarget.value);
          }}
          onBlur={(event) => update('q', event.target.value)}
          className="input"
        />
      </label>

      {params.toString() !== '' && (
        <button type="button" onClick={() => router.push('/leads')} className="btn-ghost">
          Clear
        </button>
      )}
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label mb-0">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="input w-auto min-w-[140px]">
        <option value="">All</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
