'use client';

import { DEFAULT_LOCALE } from '@bga/utils/locale';
import { localeFromPathname } from '@bga/utils/locale-routing';
import { Anchor } from '@mantine/core';
import { usePathname, useRouter } from 'next/navigation';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';

export const SettingsEntryLink: FC = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const locale = localeFromPathname(pathname) ?? DEFAULT_LOCALE;

  const handleOpen = (): void => {
    router.push(`/${locale}/settings`);
  };

  return (
    <Anchor component="button" type="button" size="sm" onClick={handleOpen}>
      {t('settings.open')}
    </Anchor>
  );
};
