/**
 * Polish is the table language (Z1). English exists so a hardcoded string
 * shows up as untranslated text on `/en` instead of months later.
 */
export const LOCALES = ['pl', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'pl';

export const NAMESPACE = 'common';

export const isLocale = (value: string): value is Locale =>
  LOCALES.some((locale) => locale === value);
