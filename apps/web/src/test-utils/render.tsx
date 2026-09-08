import { MantineProvider } from '@mantine/core';
import { render as testingLibraryRender } from '@testing-library/react';
import type { FC, ReactNode } from 'react';
import { DEFAULT_COLOR_SCHEME, theme } from '@/app/theme';
import { I18nProvider } from '@/i18n/I18nProvider';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/settings';

interface TestProvidersProps {
  children: ReactNode;
  locale: Locale;
}

interface RenderWrapperProps {
  children: ReactNode;
}

const TestProviders: FC<TestProvidersProps> = ({ children, locale }) => (
  <I18nProvider locale={locale}>
    <MantineProvider theme={theme} defaultColorScheme={DEFAULT_COLOR_SCHEME} env="test">
      {children}
    </MantineProvider>
  </I18nProvider>
);

/**
 * Bare Testing Library throws: Mantine needs theme context, copy needs
 * i18next. `env="test"` kills transition delays so assertions stay sync.
 */
export const render = (ui: ReactNode, locale: Locale = DEFAULT_LOCALE) => {
  const Wrapper: FC<RenderWrapperProps> = ({ children }) => (
    <TestProviders locale={locale}>{children}</TestProviders>
  );
  return testingLibraryRender(ui, { wrapper: Wrapper });
};
