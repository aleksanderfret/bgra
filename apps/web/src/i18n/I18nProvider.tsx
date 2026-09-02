'use client';

import { createInstance } from 'i18next';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { i18nOptions } from './instance';
import type { Locale } from './settings';

export interface I18nProviderProps {
  locale: Locale;
  children: ReactNode;
}

/**
 * Hands the active locale to every client component below it.
 *
 * The instance is rebuilt when the locale changes rather than mutated through
 * `changeLanguage`: switching language is a navigation to a different URL
 * segment, so the locale arrives as a prop and rebuilding keeps the rendered
 * language and the address bar from ever disagreeing.
 */
export function I18nProvider({ locale, children }: I18nProviderProps) {
  const instance = useMemo(() => {
    const created = createInstance();
    void created.use(initReactI18next).init(i18nOptions(locale));
    return created;
  }, [locale]);

  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>;
}
