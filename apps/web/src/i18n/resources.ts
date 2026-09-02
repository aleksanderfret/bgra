import en from './locales/en/common.json';
import pl from './locales/pl/common.json';

/**
 * Catalogues are bundled rather than fetched.
 *
 * The app is offline-first and both files together are a couple of kilobytes,
 * so a loading state for translations would cost more than it saves — and it
 * would put a flash of untranslated text on the first paint.
 */
export const resources = {
  pl: { common: pl },
  en: { common: en },
} as const;
