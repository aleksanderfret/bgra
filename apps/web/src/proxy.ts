import { type NextRequest, NextResponse } from 'next/server';
import { localeFromPathname, prefixLocale } from './i18n/routing';
import { DEFAULT_LOCALE } from './i18n/settings';

/**
 * Locale lives in the path, not a cookie: `<html lang>` and metadata are
 * produced before any client code runs. Bare paths always open Polish (Z1);
 * English is opt-in via `/en` or the language switcher.
 */

export const config = {
  // Skip `/api/engine/*` (would break the proxy) and static files.
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (localeFromPathname(pathname) !== null) {
    return NextResponse.next();
  }

  const target = request.nextUrl.clone();
  target.pathname = prefixLocale(pathname, DEFAULT_LOCALE);

  return NextResponse.redirect(target);
}
