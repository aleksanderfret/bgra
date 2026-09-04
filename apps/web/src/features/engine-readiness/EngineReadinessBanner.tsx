'use client';

import { Alert } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useEngineReadiness } from './useEngineReadiness';

export function EngineReadinessBanner() {
  const { t } = useTranslation();
  const phase = useEngineReadiness();

  if (phase === 'ready') {
    return null;
  }

  if (phase === 'starting') {
    return (
      <Alert color="blue" title={t('engineReadiness.starting.title')} role="status">
        {t('engineReadiness.starting.body')}
      </Alert>
    );
  }

  return (
    <Alert color="orange" title={t('engineReadiness.offline.title')} role="alert">
      {t('engineReadiness.offline.body')}
    </Alert>
  );
}
