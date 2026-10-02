'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/overview', label: 'Overview' },
  { href: '/campaigns', label: 'Campaigns' },
  { href: '/leads', label: 'Leads' },
  { href: '/inbox', label: 'Inbox' },
  { href: '/suppression', label: 'Suppression' },
  { href: '/settings', label: 'Settings' },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2 lg:h-screen lg:w-56 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:border-b-0 lg:border-r lg:px-3 lg:py-5">
      <div className="hidden px-2 pb-5 lg:block">
        <Link href="/overview" className="block">
          <span className="text-sm font-semibold tracking-tight text-fg">Sales Agent</span>
          <span className="mt-0.5 block text-xs text-fgMuted">Outbound research &amp; outreach</span>
        </Link>
      </div>
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              'whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition',
              active ? 'bg-surfaceMuted text-fg' : 'text-fgMuted hover:bg-surfaceMuted hover:text-fg',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
