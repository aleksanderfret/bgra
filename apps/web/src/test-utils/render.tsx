import { MantineProvider } from '@mantine/core';
import { render as testingLibraryRender } from '@testing-library/react';
import type { ReactNode } from 'react';
import { DEFAULT_COLOR_SCHEME, theme } from '@/app/theme';
import { I18nProvider } from '@/i18n/I18nProvider';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/settings';

/**
 * Bare Testing Library throws: Mantine needs theme context, copy needs
 * i18next. `env="test"` kills transition delays so assertions stay sync.
 */
export function render(ui: ReactNode, locale: Locale = DEFAULT_LOCALE) {
  return testingLibraryRender(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <I18nProvider locale={locale}>
        <MantineProvider theme={theme} defaultColorScheme={DEFAULT_COLOR_SCHEME} env="test">
          {children}
        </MantineProvider>
      </I18nProvider>
    ),
  });
}
