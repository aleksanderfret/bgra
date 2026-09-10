import { LOCALE_COOKIE_NAME, parseLocalePreference } from '@bga/utils/locale-prefs';
import { type NextRequest, NextResponse } from 'next/server';
import { localeFromPathname, prefixLocale } from './i18n/routing';
import { DEFAULT_LOCALE } from './i18n/settings';

/**
 * Active locale lives in the path (`<html lang>` / metadata before client JS).
 * Bare paths restore the last choice from the language-switcher cookie, else
 * Polish (Z1).
 */

export const config = {
  // Skip `/api/engine/*` (would break the proxy) and static files.
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};

export const proxy = (request: NextRequest): NextResponse => {
  const { pathname } = request.nextUrl;

  if (localeFromPathname(pathname) !== null) {
    return NextResponse.next();
  }

  const preferred =
    parseLocalePreference(request.cookies.get(LOCALE_COOKIE_NAME)?.value) ?? DEFAULT_LOCALE;

  const target = request.nextUrl.clone();
  target.pathname = prefixLocale(pathname, preferred);

  return NextResponse.redirect(target);
};
