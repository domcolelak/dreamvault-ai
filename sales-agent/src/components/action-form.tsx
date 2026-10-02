'use client';

import clsx from 'clsx';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ReactNode } from 'react';

export type FormOutcome = { ok: boolean; message: string; campaignId?: string };

/**
 * Wraps a form around a server action that takes FormData and returns an outcome,
 * rendering that outcome instead of navigating away silently.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  className,
}: {
  action: (formData: FormData) => Promise<FormOutcome>;
  children: ReactNode;
  submitLabel: string;
  className?: string;
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<FormOutcome | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      className={className}
      onSubmit={async (event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        setPending(true);
        setOutcome(null);
        try {
          const result = await action(formData);
          setOutcome(result);
          router.refresh();
        } catch (error) {
          setOutcome({ ok: false, message: error instanceof Error ? error.message : 'Submit failed.' });
        } finally {
          setPending(false);
        }
      }}
    >
      {children}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? 'Working…' : submitLabel}
        </button>
        {outcome !== null && (
          <span
            className={clsx(
              'max-w-prose text-sm',
              outcome.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300',
            )}
          >
            {outcome.message}
          </span>
        )}
      </div>
    </form>
  );
}
