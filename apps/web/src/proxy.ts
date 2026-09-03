import acceptLanguage from 'accept-language';
import { type NextRequest, NextResponse } from 'next/server';
import { localeFromPathname, prefixLocale } from './i18n/routing';
import { DEFAULT_LOCALE, isLocale, LOCALES } from './i18n/settings';

/**
 * Locale lives in the path, not a cookie: `<html lang>` and metadata are
 * produced before any client code runs.
 */

acceptLanguage.languages([...LOCALES]);

export const config = {
  // Skip `/api/engine/*` (would break the proxy) and static files.
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (localeFromPathname(pathname) !== null) {
    return NextResponse.next();
  }

  const negotiated = acceptLanguage.get(request.headers.get('accept-language'));
  const target = request.nextUrl.clone();
  target.pathname = prefixLocale(
    pathname,
    negotiated !== null && isLocale(negotiated) ? negotiated : DEFAULT_LOCALE,
  );

  return NextResponse.redirect(target);
}
