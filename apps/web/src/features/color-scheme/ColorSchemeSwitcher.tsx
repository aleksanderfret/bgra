'use client';

import {
  SegmentedControl,
  Stack,
  Text,
  useMantineColorScheme,
  VisuallyHidden,
} from '@mantine/core';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { COLOR_SCHEMES, isColorScheme } from './schemes';

export function ColorSchemeSwitcher() {
  const { t } = useTranslation();
  const labelId = useId();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const [announcement, setAnnouncement] = useState('');

  const active = isColorScheme(colorScheme) ? colorScheme : 'auto';

  return (
    <Stack gap={4}>
      <Text id={labelId} size="xs" fw={500} component="span">
        {t('colorScheme.label')}
      </Text>
      <SegmentedControl
        size="xs"
        aria-labelledby={labelId}
        value={active}
        onChange={(value) => {
          if (isColorScheme(value) && value !== active) {
            setColorScheme(value);
            setAnnouncement(t('colorScheme.changed', { scheme: t(`colorScheme.${value}`) }));
          }
        }}
        data={COLOR_SCHEMES.map((value) => ({
          value,
          label: t(`colorScheme.${value}`),
        }))}
      />
      <VisuallyHidden>
        <p role="status">{announcement}</p>
      </VisuallyHidden>
    </Stack>
  );
}
