import { createInstance, type i18n as I18nInstance, type InitOptions } from 'i18next';
import { resources } from './resources';
import { DEFAULT_LOCALE, LOCALES, type Locale, NAMESPACE } from './settings';

export function i18nOptions(locale: Locale): InitOptions {
  return {
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: [...LOCALES],
    ns: [NAMESPACE],
    defaultNS: NAMESPACE,
    resources,
    // Engine codes are snake_case (`player_aid`); i18next's default `_` marker
    // would treat that as a plural of `player`. Must match `i18next.d.ts`.
    pluralSeparator: '--',
    contextSeparator: '--',
    // React already escapes; a second pass turns an apostrophe into `&#39;`.
    interpolation: { escapeValue: false },
  };
}

/**
 * No react-i18next here: it calls `React.createContext` on import, which RSC
 * does not have. A fresh instance per call — the i18next singleton would let
 * two concurrent locales overwrite each other mid-render.
 */
export function createI18nInstance(locale: Locale): I18nInstance {
  const instance = createInstance();

  void instance.init(i18nOptions(locale));

  return instance;
}
