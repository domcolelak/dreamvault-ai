import { getRequestConfig } from 'next-intl/server';
import { notFound } from 'next/navigation';

export const locales = ['en', 'sk', 'cs', 'de', 'hu', 'pl', 'ro', 'bg', 'ar', 'zh'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

export default getRequestConfig(async ({ locale }) => {
    if (!locale || !locales.includes(locale as Locale)) notFound();

    return {
        locale: locale as string,
        messages: (await import(`./messages/${locale}.json`)).default
    };
});