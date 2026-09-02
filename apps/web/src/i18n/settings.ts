/**
 * Which languages exist and which one wins when nothing else decides.
 *
 * Polish is the default because it is the language spoken at the table
 * (decision Z1); English is kept in step so that a hardcoded string shows up
 * immediately as untranslated text rather than months later.
 */
export const LOCALES = ['pl', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'pl';

/** One namespace: splitting an app this size would only add ceremony. */
export const NAMESPACE = 'common';

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}
