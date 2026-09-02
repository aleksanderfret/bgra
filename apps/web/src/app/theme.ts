import { createTheme, type MantineColorScheme } from '@mantine/core';

// ColorSchemeScript and MantineProvider must share this value. A mismatch is
// the usual cause of a flash of the wrong scheme on a Next.js refresh.
export const DEFAULT_COLOR_SCHEME: MantineColorScheme = 'auto';

export const theme = createTheme({
  primaryColor: 'indigo',
  defaultRadius: 'md',
  // The assistant is read at arm's length across a game table, so the base
  // font is a step larger than Mantine's default.
  fontSizes: {
    md: '1rem',
    lg: '1.125rem',
  },
});
