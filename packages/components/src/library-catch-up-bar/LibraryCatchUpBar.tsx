'use client';

import { useEngineReadiness } from '@bga/hooks/use-engine-readiness';
import { Group, Loader, Paper, Text } from '@mantine/core';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import classes from './LibraryCatchUpBar.module.css';

export const LibraryCatchUpBar: FC = () => {
  const { t } = useTranslation();
  const { libraryCatchUp, phase } = useEngineReadiness();

  if (!libraryCatchUp || phase !== 'ready') {
    return null;
  }

  return (
    <Paper
      className={classes.bar}
      shadow="md"
      radius="md"
      p="sm"
      role="status"
      aria-live="polite"
      data-library-catch-up="true"
    >
      <Group gap="sm" wrap="nowrap" justify="center">
        <Loader size="sm" type="oval" />
        <Text size="sm">{t('engineReadiness.libraryCatchUp.body')}</Text>
      </Group>
    </Paper>
  );
};
