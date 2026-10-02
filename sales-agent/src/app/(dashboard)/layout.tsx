import type { ReactNode } from 'react';
import { Sidebar } from '@/components/sidebar';
import { ThemeToggle } from '@/components/theme-toggle';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="lg:flex">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-end border-b border-border px-4 py-2 lg:px-8">
          <ThemeToggle />
        </div>
        <main className="mx-auto max-w-[1400px] px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
