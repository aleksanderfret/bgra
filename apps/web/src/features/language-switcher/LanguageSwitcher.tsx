'use client';

import { SegmentedControl } from '@mantine/core';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { withLocale } from '@/i18n/routing';
import { DEFAULT_LOCALE, isLocale, LOCALES } from '@/i18n/settings';

/**
 * Switches language by navigating, not by mutating i18next.
 *
 * The URL is the single source of truth for the locale, so changing it is the
 * whole operation: the server re-renders with the right `<html lang>` and the
 * provider rebuilds around the new segment.
 */
export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();

  const active = isLocale(i18n.language) ? i18n.language : DEFAULT_LOCALE;

  return (
    <SegmentedControl
      size="xs"
      aria-label={t('language.label')}
      value={active}
      onChange={(value) => {
        if (isLocale(value) && value !== active) {
          router.replace(withLocale(pathname, value));
        }
      }}
      data={LOCALES.map((locale) => ({ value: locale, label: t(`language.${locale}`) }))}
    />
  );
}
