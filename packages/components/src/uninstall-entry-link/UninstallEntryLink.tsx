'use client';

import { getDesktopApi } from '@bga/utils/desktop-bridge';
import { DEFAULT_LOCALE } from '@bga/utils/locale';
import { localeFromPathname } from '@bga/utils/locale-routing';
import { Anchor } from '@mantine/core';
import { usePathname, useRouter } from 'next/navigation';
import { type FC, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';

const subscribe = (): (() => void) => () => undefined;
const getDesktopSnapshot = (): boolean => getDesktopApi() !== null;
const getServerSnapshot = (): boolean => false;

export const UninstallEntryLink: FC = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const locale = localeFromPathname(pathname) ?? DEFAULT_LOCALE;
  const isDesktop = useSyncExternalStore(subscribe, getDesktopSnapshot, getServerSnapshot);

  const handleOpen = (): void => {
    router.push(`/${locale}/uninstall`);
  };

  if (!isDesktop) {
    return null;
  }

  return (
    <Anchor component="button" type="button" size="sm" onClick={handleOpen}>
      {t('uninstall.open')}
    </Anchor>
  );
};
