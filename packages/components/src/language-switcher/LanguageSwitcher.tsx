'use client';

import { DEFAULT_LOCALE, isLocale, LOCALES, type Locale } from '@bga/utils/locale';
import { saveLocalePreference } from '@bga/utils/locale-prefs';
import { withLocale } from '@bga/utils/locale-routing';
import { Group, Loader, SegmentedControl, Stack, Text } from '@mantine/core';
import { usePathname, useRouter } from 'next/navigation';
import { type FC, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

export const LanguageSwitcher: FC = () => {
  const { t, i18n } = useTranslation();
  const labelId = useId();
  const router = useRouter();
  const pathname = usePathname();
  const [ensuring, setEnsuring] = useState(false);

  const active = isLocale(i18n.language) ? i18n.language : DEFAULT_LOCALE;

  const handleLocaleChange = (value: string): void => {
    if (!isLocale(value) || value === active) {
      return;
    }
    const next: Locale = value;
    saveLocalePreference(next);
    // URL is the live locale; preference restores it on the next visit / launch.
    router.replace(withLocale(pathname, next));
    setEnsuring(true);
    void (async () => {
      try {
        await fetch('/api/engine/speech/ensure-voice', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ locale: next }),
        });
      } catch {
        // Speak may notice if the voice is still missing.
      } finally {
        setEnsuring(false);
      }
    })();
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
      {ensuring && (
        <Group gap={6} wrap="nowrap" role="status" aria-live="polite">
          <Loader size="xs" />
          <Text size="xs" c="dimmed">
            {t('language.ensuringVoice')}
          </Text>
        </Group>
      )}
    </Stack>
  );
};
