import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sales Agent',
  description: 'Generic B2B outbound sales agent: campaign brief in, researched and evidenced leads out.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-bg font-sans text-fg antialiased">{children}</body>
    </html>
  );
}
