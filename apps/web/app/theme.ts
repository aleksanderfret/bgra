import { createTheme } from '@mantine/core';

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
