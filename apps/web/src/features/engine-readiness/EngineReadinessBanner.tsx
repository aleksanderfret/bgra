'use client';

import { Alert, Button, Stack } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEngineReadiness } from './useEngineReadiness';

export function EngineReadinessBanner() {
  const { t } = useTranslation();
  const phase = useEngineReadiness();
  const [retrying, setRetrying] = useState(false);

  const retrySearch = async (): Promise<void> => {
    setRetrying(true);
    try {
      await fetch('/api/engine/retrieval/reload', { method: 'POST' });
    } catch {
      // Stay on search_unavailable; the button re-enables below.
    } finally {
      setRetrying(false);
    }
  };

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

  if (phase === 'search_unavailable') {
    return (
      <Alert color="yellow" title={t('engineReadiness.searchUnavailable.title')} role="alert">
        <Stack gap="sm">
          {t('engineReadiness.searchUnavailable.body')}
          <Button
            type="button"
            variant="light"
            color="yellow"
            loading={retrying}
            disabled={retrying}
            onClick={() => {
              void retrySearch();
            }}
          >
            {t('engineReadiness.searchUnavailable.retry')}
          </Button>
        </Stack>
      </Alert>
    );
  }

  return (
    <Alert color="orange" title={t('engineReadiness.offline.title')} role="alert">
      {t('engineReadiness.offline.body')}
    </Alert>
  );
}
