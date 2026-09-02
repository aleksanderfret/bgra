import type { TFunction } from 'i18next';
import { createI18nInstance } from './instance';
import { type Locale, NAMESPACE } from './settings';

/**
 * Translations for a Server Component or for `generateMetadata`.
 *
 * Synchronous on purpose: the catalogues are bundled, so there is nothing to
 * await, and making this a promise would push every caller into an async
 * boundary for no gain.
 */
export function getTranslation(locale: Locale): TFunction<typeof NAMESPACE> {
  return createI18nInstance(locale).getFixedT(locale, NAMESPACE);
}
