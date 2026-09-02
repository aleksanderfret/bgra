import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';

import { ColorSchemeScript, MantineProvider, mantineHtmlProps } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { Metadata } from 'next';
import { theme } from './theme';

export const metadata: Metadata = {
  title: 'BGA — asystent zasad gier planszowych',
  description:
    'Lokalny asystent głosowy, który uczy zasad gier planszowych na podstawie Twoich instrukcji.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="pl" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript defaultColorScheme="auto" />
      </head>
      <body>
        <MantineProvider theme={theme} defaultColorScheme="auto">
          <Notifications />
          {children}
        </MantineProvider>
      </body>
    </html>
  );
}
