import acceptLanguage from 'accept-language';
import { type NextRequest, NextResponse } from 'next/server';
import { localeFromPathname, prefixLocale } from './i18n/routing';
import { DEFAULT_LOCALE, isLocale, LOCALES } from './i18n/settings';

/**
 * Makes sure every page URL names the language it is showing.
 *
 * The locale has to be in the path rather than in a cookie so that the server
 * render already knows it: `<html lang>` and the page metadata are produced
 * before any client code runs, and a cookie would make them a guess.
 */

acceptLanguage.languages([...LOCALES]);

export const config = {
  // `api` is excluded so the engine proxy under /api/engine/* is never
  // redirected, and `.*\..*` so static files keep their own URLs.
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
