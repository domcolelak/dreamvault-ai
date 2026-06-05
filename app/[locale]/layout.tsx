import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { locales } from '@/i18n';
import "../globals.css";

const inter = Inter({ subsets: ["latin", "latin-ext"] });

export async function generateMetadata({
    params: { locale }
}: {
    params: { locale: string }
}): Promise<Metadata> {
    const t = await getTranslations({ locale, namespace: 'landing.hero' });

    return {
        title: `DreamVault AI - ${t('title')}`,
        description: t('subtitle'),
    };
}

export function generateStaticParams() {
    return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
    children,
    params: { locale }
}: {
    children: React.ReactNode;
    params: { locale: string };
}) {
    if (!locales.includes(locale as any)) {
        notFound();
    }

    const messages = await getMessages();
    const isRTL = locale === 'ar';

    return (
        <html lang={locale} dir={isRTL ? 'rtl' : 'ltr'}>
            <body className={`${inter.className} min-h-screen bg-slate-950 text-white`}>
                <NextIntlClientProvider messages={messages}>
                    {children}
                </NextIntlClientProvider>
            </body>
        </html>
    );
}