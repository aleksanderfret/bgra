import { DEFAULT_LOCALE, isLocale, type Locale } from './settings';

/** `/please` starts with `pl` but is not a Polish URL. */
export function localeFromPathname(pathname: string): Locale | null {
  const segment = pathname.split('/')[1] ?? '';
  return isLocale(segment) ? segment : null;
}

export function withLocale(pathname: string, locale: Locale): string {
  const segments = pathname.split('/');
  // `'/x'.split('/')` is `['', 'x']`, so the locale is always index 1.
  segments[1] = locale;
  return segments.join('/');
}

export function prefixLocale(pathname: string, locale: Locale = DEFAULT_LOCALE): string {
  return `/${locale}${pathname === '/' ? '' : pathname}`;
}
