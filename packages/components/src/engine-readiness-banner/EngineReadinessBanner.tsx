'use client';

import { useEngineReadiness } from '@bga/hooks/use-engine-readiness';
import { isEngineHealthSnapshot } from '@bga/utils/engine-readiness';
import { Alert, Button, Stack } from '@mantine/core';
import { type FC, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export const EngineReadinessBanner: FC = () => {
  const { t } = useTranslation();
  const phase = useEngineReadiness();
  const [retrying, setRetrying] = useState(false);
  const [speechMissing, setSpeechMissing] = useState(false);

  useEffect(() => {
    if (phase !== 'ready') {
      setSpeechMissing(false);
      return;
    }
    let cancelled = false;
    const checkSpeech = async (): Promise<void> => {
      try {
        const response = await fetch('/api/engine/health');
        if (!response.ok) {
          return;
        }
        const payload: unknown = await response.json();
        if (!isEngineHealthSnapshot(payload) || cancelled) {
          return;
        }
        const stt = payload.components.speech_stt;
        const tts = payload.components.speech_tts;
        // Only warn when health explicitly reports false (older engines omit keys).
        setSpeechMissing(stt === false || tts === false);
      } catch {
        // Keep silent; questions still work without speech.
      }
    };
    void checkSpeech();
    return () => {
      cancelled = true;
    };
  }, [phase]);

  const handleRetrySearch = (): void => {
    setRetrying(true);
    void fetch('/api/engine/retrieval/reload', { method: 'POST' })
      .catch(() => {
        // Stay on search_unavailable; the button re-enables below.
      })
      .finally(() => {
        setRetrying(false);
      });
  };

  if (phase === 'ready') {
    if (!speechMissing) {
      return null;
    }
    return (
      <Alert color="yellow" title={t('engineReadiness.speechMissing.title')} role="status">
        {t('engineReadiness.speechMissing.body')}
      </Alert>
    );
  }

  if (phase === 'reading_layout') {
    return (
      <Alert color="blue" title={t('engineReadiness.readingLayout.title')} role="status">
        {t('engineReadiness.readingLayout.body')}
      </Alert>
    );
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
            onClick={handleRetrySearch}
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
};
