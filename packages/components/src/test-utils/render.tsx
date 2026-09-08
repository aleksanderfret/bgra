import { DEFAULT_LOCALE, type Locale } from '@bga/utils/locale';
import { I18nProvider } from '@bga-web-i18n/I18nProvider';
import { DEFAULT_COLOR_SCHEME, theme } from '@bga-web-theme';
import { MantineProvider } from '@mantine/core';
import {
  act,
  cleanup,
  fireEvent,
  screen,
  render as testingLibraryRender,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FC, ReactNode } from 'react';

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

export { act, cleanup, fireEvent, screen, userEvent, waitFor, within };
