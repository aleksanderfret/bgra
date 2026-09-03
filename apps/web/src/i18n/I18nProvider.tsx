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

export function I18nProvider({ locale, children }: I18nProviderProps) {
  // Rebuild on locale change rather than `changeLanguage`: the URL segment is
  // the source of truth, and mutating a shared instance would desync them.
  const instance = useMemo(() => {
    const created = createInstance();
    void created.use(initReactI18next).init(i18nOptions(locale));
    return created;
  }, [locale]);

  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>;
}
