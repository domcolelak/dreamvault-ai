'use client';

import clsx from 'clsx';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { ReactNode } from 'react';

export type ActionOutcome = { ok: boolean; message: string };

/**
 * Runs a server action and shows its result inline. Used everywhere instead of
 * silent fire-and-forget buttons, so the operator always sees why something did
 * or did not happen.
 */
export function ActionButton({
  action,
  children,
  variant = 'secondary',
  confirm,
  className,
  onDone,
  redirectTo,
}: {
  action: () => Promise<ActionOutcome>;
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  confirm?: string;
  className?: string;
  onDone?: (outcome: ActionOutcome) => void;
  /** Navigate here instead of refreshing, when the action succeeds. */
  redirectTo?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<ActionOutcome | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    if (confirm !== undefined && !window.confirm(confirm)) return;
    setRunning(true);
    setOutcome(null);
    try {
      const result = await action();
      setOutcome(result);
      onDone?.(result);
      if (result.ok && redirectTo !== undefined) router.push(redirectTo);
      else startTransition(() => router.refresh());
    } catch (error) {
      setOutcome({ ok: false, message: error instanceof Error ? error.message : 'Action failed.' });
    } finally {
      setRunning(false);
    }
  };

  const busy = running || pending;

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className={clsx(
          variant === 'primary' && 'btn-primary',
          variant === 'secondary' && 'btn-secondary',
          variant === 'ghost' && 'btn-ghost',
          variant === 'danger' && 'btn border-rose-500/40 bg-rose-500/10 text-rose-700 hover:bg-rose-500/20 dark:text-rose-300',
          className,
        )}
      >
        {busy ? 'Working…' : children}
      </button>
      {outcome !== null && (
        <span
          className={clsx(
            'max-w-prose text-xs',
            outcome.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300',
          )}
        >
          {outcome.message}
        </span>
      )}
    </span>
  );
}
