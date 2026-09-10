import { isLocale, type Locale } from '@bga/utils/locale';

/** Persist the player's interface language across visits and app launches. */
export const LOCALE_STORAGE_KEY = 'bga.locale.v1';

/** Cookie name so the Next proxy can restore locale before any client code runs. */
export const LOCALE_COOKIE_NAME = 'bga.locale';

const LOCALE_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 365;

export const parseLocalePreference = (value: string | null | undefined): Locale | null => {
  if (value === null || value === undefined) {
    return null;
  }
  return isLocale(value) ? value : null;
};

export const loadLocalePreference = (): Locale | null => {
  if (typeof localStorage === 'undefined') {
    return null;
  }
  try {
    return parseLocalePreference(localStorage.getItem(LOCALE_STORAGE_KEY));
  } catch {
    return null;
  }
};

export const saveLocalePreference = (locale: Locale): void => {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // Quota / private mode — cookie below may still stick.
    }
  }
  if (typeof document !== 'undefined') {
    // Cookie Store API is async and not everywhere yet; the Next proxy must see
    // this on the next bare-path request, so the classic cookie writer stays.
    // biome-ignore lint/suspicious/noDocumentCookie: preference must sync to HTTP cookie for proxy/desktop
    document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE_SEC}; SameSite=Lax`;
  }
};
