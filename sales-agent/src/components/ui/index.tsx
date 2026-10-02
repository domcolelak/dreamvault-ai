import clsx from 'clsx';
import Link from 'next/link';
import type { ReactNode } from 'react';

export function Card({
  children,
  className,
  title,
  description,
  actions,
}: {
  children?: ReactNode;
  className?: string;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className={clsx('card', className)}>
      {(title !== undefined || actions !== undefined) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            {title !== undefined && <h2 className="text-sm font-semibold text-fg">{title}</h2>}
            {description !== undefined && <p className="mt-1 text-sm text-fgMuted">{description}</p>}
          </div>
          {actions !== undefined && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      {children !== undefined && <div className="px-5 py-4">{children}</div>}
    </section>
  );
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="card px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-fgMuted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-fg">{value}</p>
      {hint !== undefined && <p className="mt-0.5 text-xs text-fgMuted">{hint}</p>}
    </div>
  );
}

type BadgeTone = 'neutral' | 'info' | 'good' | 'warn' | 'bad' | 'accent';

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'border-border bg-surfaceMuted text-fgMuted',
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  good: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  warn: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  bad: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  accent: 'border-accent/30 bg-accent/10 text-accent',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-xs font-medium',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center">
      <p className="text-sm font-medium text-fg">{title}</p>
      {children !== undefined && <div className="mx-auto mt-2 max-w-xl text-sm text-fgMuted">{children}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">{title}</h1>
        {description !== undefined && <p className="mt-1 max-w-3xl text-sm text-fgMuted">{description}</p>}
      </div>
      {actions !== undefined && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('card overflow-x-auto', className)}>
      <table className="w-full border-collapse text-left">{children}</table>
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <span className="label">{label}</span>
      {children}
      {hint !== undefined && <p className="mt-1 text-xs text-fgMuted">{hint}</p>}
    </div>
  );
}

export function InlineLink({ href, children }: { href: string; children: ReactNode }) {
  const external = href.startsWith('http');
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        className="break-all text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">
      {children}
    </Link>
  );
}

export function KeyValue({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-xs font-medium uppercase tracking-wide text-fgMuted">{item.label}</dt>
          <dd className="mt-0.5 text-sm text-fg">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function TagList({ values, tone = 'neutral' }: { values: string[]; tone?: BadgeTone }) {
  if (values.length === 0) return <span className="text-sm text-fgMuted">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((value) => (
        <Badge key={value} tone={tone}>
          {value}
        </Badge>
      ))}
    </div>
  );
}
