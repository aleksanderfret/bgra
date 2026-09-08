'use client';

import {
  type DesktopSetupState,
  getDesktopApi,
  type RuntimeProgress,
} from '@bga/utils/desktop-bridge';
import { DEFAULT_LOCALE, isLocale } from '@bga/utils/locale';
import { Alert, Button, Group, List, Stack, Text } from '@mantine/core';
import { useRouter } from 'next/navigation';
import { type FC, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type Translate = ReturnType<typeof useTranslation>['t'];

const runtimeErrorMessage = (t: Translate, code: string): string => {
  switch (code) {
    case 'download_failed':
      return t('setup.runtime.error.download_failed');
    case 'ollama_timeout':
      return t('setup.runtime.error.ollama_timeout');
    case 'pull_failed':
      return t('setup.runtime.error.pull_failed');
    case 'search_timeout':
      return t('setup.runtime.error.search_timeout');
    default:
      return t('setup.runtime.error.runtime_failed');
  }
};

export const SetupPanel: FC = () => {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const locale = isLocale(i18n.language) ? i18n.language : DEFAULT_LOCALE;
  const [state, setState] = useState<DesktopSetupState | null>(null);
  const [diagnosticsPath, setDiagnosticsPath] = useState<string | null>(null);
  const [browserOnly, setBrowserOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<RuntimeProgress | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  useEffect(() => {
    const api = getDesktopApi();
    if (api === null) {
      setBrowserOnly(true);
      return;
    }
    void api.getSetupState().then(setState);
    return api.onRuntimeProgress((event) => {
      setProgress(event);
      if (event.stage === 'error') {
        setErrorCode(event.code);
      }
      if (event.stage === 'ready') {
        setErrorCode(null);
        void api
          .getSetupState()
          .then(async (next) => {
            setState(next);
            if (next.askReady) {
              await api.markSetupComplete();
              router.push(`/${locale}`);
            }
          })
          .catch(() => {
            /* stay on setup; player can retry */
          });
      }
    });
  }, [locale, router]);

  if (browserOnly) {
    return (
      <Alert color="blue" title={t('setup.browserOnly.title')}>
        {t('setup.browserOnly.body')}
      </Alert>
    );
  }

  if (state === null) {
    return <Text>{t('setup.loading')}</Text>;
  }

  const api = getDesktopApi();
  const profileId = state.recommendation?.profileId ?? 'starter-32gb';
  const reason = state.recommendation?.reason ?? 'starter';
  const warningReason = reason === 'insufficient_memory' || reason === 'insufficient_disk';
  const platform = state.machine?.platform;
  const missingValue = t('ui.missingValue');
  const stageMessage = (() => {
    if (progress === null) {
      return null;
    }
    switch (progress.stage) {
      case 'downloading_installer':
        return t('setup.runtime.stage.downloading_installer');
      case 'waiting_for_ollama':
        return t('setup.runtime.stage.waiting_for_ollama');
      case 'pulling_models':
        return t('setup.runtime.stage.pulling_models');
      case 'preparing_search':
        return t('setup.runtime.stage.preparing_search');
      default:
        return null;
    }
  })();

  const handleOpenDownloadPage = (): void => {
    void api?.openExternalHttps(state.ollamaDownloadUrl);
  };

  const handleContinue = (): void => {
    if (api === null) {
      return;
    }
    void api.markSetupComplete().then(() => {
      router.push(`/${locale}`);
    });
  };

  const handleEnsureRuntime = (): void => {
    if (api === null) {
      return;
    }
    setBusy(true);
    setErrorCode(null);
    void api
      .ensureRuntime()
      .then(() => api.markSetupComplete())
      .then(() => {
        router.push(`/${locale}`);
      })
      .catch(() => {
        /* progress event carries the error code */
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const handleSaveDiagnostics = (): void => {
    void api?.saveDiagnostics().then((result) => {
      setDiagnosticsPath(result.path);
    });
  };

  return (
    <Stack gap="lg">
      <Alert color="gray" title={t('setup.hardware.title')}>
        <List spacing="xs" size="sm">
          <List.Item>
            {t('setup.hardware.memory', {
              gib: state.machine?.totalMemoryGiB ?? missingValue,
            })}
          </List.Item>
          {state.machine?.gpuMemoryGiB != null && (
            <List.Item>{t('setup.hardware.gpu', { gib: state.machine.gpuMemoryGiB })}</List.Item>
          )}
          <List.Item>
            {t('setup.hardware.disk', {
              gib: state.machine?.freeDiskGiB ?? missingValue,
            })}
          </List.Item>
          <List.Item>
            {t('setup.hardware.platform', {
              platform: state.machine?.platform ?? missingValue,
            })}
          </List.Item>
        </List>
      </Alert>

      <Alert
        color={warningReason ? 'orange' : 'teal'}
        title={t(`setup.profile.${profileId}.title`)}
      >
        <Stack gap="xs">
          <Text size="sm">{t(`setup.profile.${profileId}.body`)}</Text>
          <Text size="sm" c="dimmed">
            {t('setup.profile.sharedRetrieval')}
          </Text>
          <Text size="sm">{t(`setup.reason.${reason}`)}</Text>
        </Stack>
      </Alert>

      <Alert color="gray" title={t('setup.runtime.needsTitle')}>
        <List spacing="xs" size="sm">
          <List.Item>{t('setup.runtime.needsOllama')}</List.Item>
          <List.Item>
            {t('setup.runtime.needsChatModel', {
              model: state.healthModels.llm || missingValue,
            })}
          </List.Item>
          <List.Item>
            {t('setup.runtime.needsEmbeddingModel', {
              model: state.healthModels.embedding || missingValue,
            })}
          </List.Item>
        </List>
      </Alert>

      {platform === 'darwin' ? (
        <Alert color="yellow" title={t('setup.runtime.osPromptMacTitle')}>
          <Text size="sm">{t('setup.runtime.osPromptMac')}</Text>
          <Text size="sm" mt="xs">
            {t('setup.runtime.macDragToApplications')}
          </Text>
          <Text size="sm" mt="xs">
            {t('setup.runtime.ignoreOllamaTerminal')}
          </Text>
        </Alert>
      ) : null}
      {platform === 'win32' ? (
        <Alert color="yellow" title={t('setup.runtime.osPromptWindowsTitle')}>
          <Text size="sm">{t('setup.runtime.osPromptWindows')}</Text>
        </Alert>
      ) : null}

      {stageMessage !== null ? (
        <Text size="sm" c="dimmed">
          {stageMessage}
        </Text>
      ) : null}

      {errorCode !== null ? (
        <Alert color="red" title={t('setup.runtime.errorTitle')}>
          <Text size="sm">{runtimeErrorMessage(t, errorCode)}</Text>
          <Button mt="sm" variant="light" onClick={handleOpenDownloadPage}>
            {t('setup.runtime.openDownloadPage')}
          </Button>
        </Alert>
      ) : null}

      {state.askReady ? (
        <Alert color="teal" title={t('setup.runtime.readyTitle')}>
          <Text size="sm">{t('setup.runtime.readyBody')}</Text>
        </Alert>
      ) : null}

      <Group>
        {state.askReady ? (
          <Button type="button" variant="filled" disabled={busy} onClick={handleContinue}>
            {t('setup.continue')}
          </Button>
        ) : (
          <Button type="button" loading={busy} disabled={busy} onClick={handleEnsureRuntime}>
            {t('setup.runtime.primaryAction')}
          </Button>
        )}
        {!state.askReady && !busy ? (
          <Text size="sm" c="dimmed">
            {t('setup.continueDisabledHint')}
          </Text>
        ) : null}
      </Group>

      <Group>
        <Button type="button" variant="default" onClick={handleSaveDiagnostics}>
          {t('setup.diagnostics.save')}
        </Button>
        {diagnosticsPath !== null ? (
          <Text size="sm" c="dimmed">
            {t('setup.diagnostics.saved', { path: diagnosticsPath })}
          </Text>
        ) : null}
      </Group>
    </Stack>
  );
};
