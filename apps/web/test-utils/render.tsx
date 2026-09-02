import { MantineProvider } from '@mantine/core';
import { render as testingLibraryRender } from '@testing-library/react';
import type { ReactNode } from 'react';
import { theme } from '@/app/theme';

/**
 * Every Mantine component reads theme context, so a bare Testing Library
 * render throws. `env="test"` also disables transitions and portal delays,
 * which keeps assertions synchronous.
 */
export function render(ui: ReactNode) {
  return testingLibraryRender(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <MantineProvider theme={theme} env="test">
        {children}
      </MantineProvider>
    ),
  });
}
