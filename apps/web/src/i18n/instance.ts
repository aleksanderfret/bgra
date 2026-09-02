import { createInstance, type i18n as I18nInstance, type InitOptions } from 'i18next';
import { resources } from './resources';
import { DEFAULT_LOCALE, LOCALES, type Locale, NAMESPACE } from './settings';

/** The configuration the server and the browser have to agree on. */
export function i18nOptions(locale: Locale): InitOptions {
  return {
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: [...LOCALES],
    ns: [NAMESPACE],
    defaultNS: NAMESPACE,
    resources,
    // Keys are engine codes such as `player_aid`, and `_` is i18next's default
    // plural and context marker. Kept in step with `i18next.d.ts`, which needs
    // the same two values to type keys the way they are actually looked up.
    pluralSeparator: '--',
    contextSeparator: '--',
    // React escapes everything it renders already; escaping here as well turns
    // an apostrophe in a rule name into `&#39;` on screen.
    interpolation: { escapeValue: false },
  };
}

/**
 * A plain i18next instance, with react-i18next deliberately not attached.
 *
 * This module is reachable from Server Components, and react-i18next calls
 * `React.createContext` while it is being imported — a function the React
 * Server Components build does not have. Wiring React in happens in
 * `I18nProvider`, which is a client module. Keeping it out of here is what
 * lets `generateMetadata` translate at all.
 *
 * A fresh instance per caller, rather than the i18next singleton, because two
 * requests can be rendering different locales at the same moment and a shared
 * instance would let one overwrite the other's language mid-render. The
 * resources are already in memory, so `init` completes synchronously and `t`
 * is usable on the line after this call.
 */
export function createI18nInstance(locale: Locale): I18nInstance {
  const instance = createInstance();

  void instance.init(i18nOptions(locale));

  return instance;
}
