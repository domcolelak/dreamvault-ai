import createMiddleware from 'next-intl/middleware';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { locales, defaultLocale } from './i18n';

const intlMiddleware = createMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'always'  // ← ZMENENÉ z 'as-needed' na 'always'
});

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next();
  }

  const isAppRoute = /^\/(en|sk|cs|de|hu|pl|ro|bg|ar|zh)(\/)?app(\/|$)/.test(pathname);

  if (isAppRoute) {
    const res = NextResponse.next();
    const supabase = createMiddlewareClient({ req, res });
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      const localeMatch = pathname.match(/^\/(en|sk|cs|de|hu|pl|ro|bg|ar|zh)\//);
      const detectedLocale = localeMatch ? `/${localeMatch[1]}` : '/en';
      return NextResponse.redirect(new URL(`${detectedLocale}/login`, req.url));
    }
  }

  return intlMiddleware(req);
}

export const config = {
  matcher: ['/((?!api|_next|.*\\..*).*)']
};