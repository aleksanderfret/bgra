'use client';

import { DEFAULT_LOCALE } from '@bga/utils/locale';
import { localeFromPathname } from '@bga/utils/locale-routing';
import { SegmentedControl, Stack, Text } from '@mantine/core';
import { usePathname, useRouter } from 'next/navigation';
import { type FC, useId } from 'react';
import { useTranslation } from 'react-i18next';

export type AppView = 'teach' | 'questions' | 'rulebooks';

const APP_VIEWS: readonly AppView[] = ['teach', 'questions', 'rulebooks'];

const isAppView = (value: string): value is AppView => APP_VIEWS.some((view) => view === value);

const viewFromPathname = (pathname: string): AppView => {
  const segments = pathname.split('/').filter(Boolean);
  const section = segments[1];
  if (section === 'teach') {
    return 'teach';
  }
  if (section === 'rulebooks') {
    return 'rulebooks';
  }
  return 'questions';
};

const pathForView = (locale: string, view: AppView): string => {
  if (view === 'teach') {
    return `/${locale}/teach`;
  }
  if (view === 'rulebooks') {
    return `/${locale}/rulebooks`;
  }
  return `/${locale}`;
};

export const AppNav: FC = () => {
  const { t } = useTranslation();
  const labelId = useId();
  const router = useRouter();
  const pathname = usePathname();
  const locale = localeFromPathname(pathname) ?? DEFAULT_LOCALE;
  const active = viewFromPathname(pathname);

  const handleViewChange = (value: string): void => {
    if (!isAppView(value)) {
      return;
    }
    const next = pathForView(locale, value);
    if (next !== pathname) {
      router.push(next);
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
          { value: 'teach', label: t('appNav.teach') },
          { value: 'questions', label: t('appNav.questions') },
          { value: 'rulebooks', label: t('appNav.rulebooks') },
        ]}
      />
    </Stack>
  );
};
