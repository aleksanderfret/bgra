'use client';

import { SegmentedControl, Stack, Text } from '@mantine/core';
import { usePathname, useRouter } from 'next/navigation';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { localeFromPathname } from '@/i18n/routing';
import { DEFAULT_LOCALE } from '@/i18n/settings';

export type AppView = 'assistant' | 'rulebooks';

function viewFromPathname(pathname: string): AppView {
  const segments = pathname.split('/').filter(Boolean);
  return segments[1] === 'rulebooks' ? 'rulebooks' : 'assistant';
}

function pathForView(locale: string, view: AppView): string {
  return view === 'rulebooks' ? `/${locale}/rulebooks` : `/${locale}`;
}

export function AppNav() {
  const { t } = useTranslation();
  const labelId = useId();
  const router = useRouter();
  const pathname = usePathname();
  const locale = localeFromPathname(pathname) ?? DEFAULT_LOCALE;
  const active = viewFromPathname(pathname);

  return (
    <Stack gap={4} component="nav" aria-labelledby={labelId}>
      <Text id={labelId} size="xs" fw={500} component="span">
        {t('appNav.label')}
      </Text>
      <SegmentedControl
        size="sm"
        aria-labelledby={labelId}
        value={active}
        onChange={(value) => {
          if (value === 'assistant' || value === 'rulebooks') {
            const next = pathForView(locale, value);
            if (next !== pathname) {
              router.push(next);
            }
          }
        }}
        data={[
          { value: 'assistant', label: t('appNav.assistant') },
          { value: 'rulebooks', label: t('appNav.rulebooks') },
        ]}
      />
    </Stack>
  );
}
