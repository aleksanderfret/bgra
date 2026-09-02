import { DEFAULT_LOCALE, isLocale, type Locale } from './settings';

/**
 * The locale a path is already carrying, or `null` when it carries none.
 *
 * Used by the proxy to decide whether a request needs redirecting, so it has
 * to reject a prefix that merely starts with the right letters: `/please`
 * begins with `pl` but is not a Polish URL.
 */
export function localeFromPathname(pathname: string): Locale | null {
  const segment = pathname.split('/')[1] ?? '';
  return isLocale(segment) ? segment : null;
}

/** The same path shown in another language. */
export function withLocale(pathname: string, locale: Locale): string {
  const segments = pathname.split('/');
  // An absolute path always splits with an empty first element, so the locale
  // is segment 1 whether or not the path already had one.
  segments[1] = locale;
  return segments.join('/');
}

/** A path that has no locale segment yet, prefixed with one. */
export function prefixLocale(pathname: string, locale: Locale = DEFAULT_LOCALE): string {
  return `/${locale}${pathname === '/' ? '' : pathname}`;
}
