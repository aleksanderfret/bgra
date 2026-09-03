import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';

import { ColorSchemeScript, MantineProvider, mantineHtmlProps } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DEFAULT_COLOR_SCHEME, theme } from '@/app/theme';
import { I18nProvider } from '@/i18n/I18nProvider';
import { getTranslation } from '@/i18n/server';
import { isLocale, LOCALES } from '@/i18n/settings';

interface LocaleParams {
  params: Promise<{ locale: string }>;
}

export function generateStaticParams(): { locale: string }[] {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const { locale } = await params;
  const t = getTranslation(isLocale(locale) ? locale : 'pl');

  return {
    title: t('metadata.title'),
    description: t('metadata.description'),
  };
}

export default async function RootLayout({ children, params }: LayoutProps<'/[locale]'>) {
  const { locale } = await params;

  // The proxy only routes known locales, but a direct hit must 404, not fall back.
  if (!isLocale(locale)) {
    notFound();
  }

  return (
    <html lang={locale} {...mantineHtmlProps}>
      <head>
        {/* Must run before first paint or a refresh flashes the wrong scheme. */}
        <ColorSchemeScript defaultColorScheme={DEFAULT_COLOR_SCHEME} />
      </head>
      <body>
        <I18nProvider locale={locale}>
          <MantineProvider theme={theme} defaultColorScheme={DEFAULT_COLOR_SCHEME}>
            <Notifications />
            {children}
          </MantineProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
