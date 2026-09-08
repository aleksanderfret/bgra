'use client';

import { SegmentedControl, Stack, Text } from '@mantine/core';
import { usePathname, useRouter } from 'next/navigation';
import { type FC, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { withLocale } from '@/i18n/routing';
import { DEFAULT_LOCALE, isLocale, LOCALES } from '@/i18n/settings';

export const LanguageSwitcher: FC = () => {
  const { t, i18n } = useTranslation();
  const labelId = useId();
  const router = useRouter();
  const pathname = usePathname();

  const active = isLocale(i18n.language) ? i18n.language : DEFAULT_LOCALE;

  const handleLocaleChange = (value: string): void => {
    if (isLocale(value) && value !== active) {
      router.replace(withLocale(pathname, value));
    }
  };

  return (
    <Stack gap={4}>
      <Text id={labelId} size="xs" fw={500} component="span">
        {t('language.label')}
      </Text>
      <SegmentedControl
        size="xs"
        aria-labelledby={labelId}
        value={active}
        onChange={handleLocaleChange}
        data={LOCALES.map((locale) => ({
          value: locale,
          label: <span lang={locale}>{t(`language.${locale}`)}</span>,
        }))}
      />
    </Stack>
  );
};
