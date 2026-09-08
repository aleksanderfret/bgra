'use client';

import { DEFAULT_LOCALE } from '@bga/utils/locale';
import { localeFromPathname } from '@bga/utils/locale-routing';
import { SegmentedControl, Stack, Text } from '@mantine/core';
import { usePathname, useRouter } from 'next/navigation';
import { type FC, useId } from 'react';
import { useTranslation } from 'react-i18next';

export type AppView = 'assistant' | 'rulebooks';

const viewFromPathname = (pathname: string): AppView => {
  const segments = pathname.split('/').filter(Boolean);
  return segments[1] === 'rulebooks' ? 'rulebooks' : 'assistant';
};

const pathForView = (locale: string, view: AppView): string => {
  return view === 'rulebooks' ? `/${locale}/rulebooks` : `/${locale}`;
};

export const AppNav: FC = () => {
  const { t } = useTranslation();
  const labelId = useId();
  const router = useRouter();
  const pathname = usePathname();
  const locale = localeFromPathname(pathname) ?? DEFAULT_LOCALE;
  const active = viewFromPathname(pathname);

  const handleViewChange = (value: string): void => {
    if (value === 'assistant' || value === 'rulebooks') {
      const next = pathForView(locale, value);
      if (next !== pathname) {
        router.push(next);
      }
    }
  };

  return (
    <Stack gap={4} component="nav" aria-labelledby={labelId}>
      <Text id={labelId} size="xs" fw={500} component="span">
        {t('appNav.label')}
      </Text>
      <SegmentedControl
        size="sm"
        aria-labelledby={labelId}
        value={active}
        onChange={handleViewChange}
        data={[
          { value: 'assistant', label: t('appNav.assistant') },
          { value: 'rulebooks', label: t('appNav.rulebooks') },
        ]}
      />
    </Stack>
  );
};
