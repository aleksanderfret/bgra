import { MantineProvider } from '@mantine/core';
import { render as testingLibraryRender } from '@testing-library/react';
import type { ReactNode } from 'react';
import { DEFAULT_COLOR_SCHEME, theme } from '@/app/theme';
import { I18nProvider } from '@/i18n/I18nProvider';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/settings';

/**
 * Every Mantine component reads theme context and every string comes from
 * i18next, so a bare Testing Library render throws. `env="test"` also disables
 * transitions and portal delays, which keeps assertions synchronous.
 *
 * The locale is an argument so a test can assert the same component in both
 * languages — the cheapest way to catch a string that never made it into the
 * catalogues.
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
