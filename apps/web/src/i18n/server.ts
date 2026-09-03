import type { TFunction } from 'i18next';
import { createI18nInstance } from './instance';
import { type Locale, NAMESPACE } from './settings';

// Sync: catalogues are bundled. Making this async would force every metadata
// caller into an async boundary for nothing.
export function getTranslation(locale: Locale): TFunction<typeof NAMESPACE> {
  return createI18nInstance(locale).getFixedT(locale, NAMESPACE);
}
