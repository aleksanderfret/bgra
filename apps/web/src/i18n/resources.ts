import en from './locales/en/common.json';
import pl from './locales/pl/common.json';

// Bundled on purpose: fetching a few KB of copy would flash untranslated text.
export const resources = {
  pl: { common: pl },
  en: { common: en },
} as const;
