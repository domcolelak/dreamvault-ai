import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import "../globals.css";

const inter = Inter({ subsets: ["latin", "latin-ext"] });

export const metadata: Metadata = {
  title: "DreamVault AI - Decode Your Dreams with AI",
  description: "Record your dream. Reveal its meaning. Understand your subconscious.",
};

export default async function EnLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const messages = await getMessages({ locale: 'zh' });

  return (
    <html lang="zh">
      <body className={`${inter.className} min-h-screen bg-slate-950 text-white`}>
        <NextIntlClientProvider messages={messages} locale="en">
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
