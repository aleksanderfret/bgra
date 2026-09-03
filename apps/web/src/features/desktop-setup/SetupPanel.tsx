'use client';

import { Alert, Button, Group, List, Stack, Text } from '@mantine/core';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_LOCALE, isLocale } from '@/i18n/settings';
import { type DesktopSetupState, getDesktopApi } from '@/lib/desktop-bridge';

export function SetupPanel() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const locale = isLocale(i18n.language) ? i18n.language : DEFAULT_LOCALE;
  const [state, setState] = useState<DesktopSetupState | null>(null);
  const [diagnosticsPath, setDiagnosticsPath] = useState<string | null>(null);
  const [browserOnly, setBrowserOnly] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [pullError, setPullError] = useState<string | null>(null);
  const [pullDone, setPullDone] = useState(false);

  useEffect(() => {
    const api = getDesktopApi();
    if (api === null) {
      setBrowserOnly(true);
      return;
    }
    void api.getSetupState().then(setState);
  }, []);

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

  const profileId = state.recommendation?.profileId ?? 'starter-32gb';
  const reason = state.recommendation?.reason ?? 'starter';
  const warningReason = reason === 'insufficient_memory' || reason === 'insufficient_disk';

  return (
    <Stack gap="lg">
      <Alert color="gray" title={t('setup.hardware.title')}>
        <List spacing="xs" size="sm">
          <List.Item>
            {t('setup.hardware.memory', {
              gib: state.machine?.totalMemoryGiB ?? '—',
            })}
          </List.Item>
          {state.machine?.gpuMemoryGiB != null && (
            <List.Item>{t('setup.hardware.gpu', { gib: state.machine.gpuMemoryGiB })}</List.Item>
          )}
          <List.Item>
            {t('setup.hardware.disk', {
              gib: state.machine?.freeDiskGiB ?? '—',
            })}
          </List.Item>
          <List.Item>
            {t('setup.hardware.platform', {
              platform: state.machine?.platform ?? '—',
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
          <Text size="sm">
            {t('setup.profile.diskNeed', {
              gib: state.recommendation?.approxDiskGiB ?? 0,
            })}
          </Text>
        </Stack>
      </Alert>

      {state.ollamaPath === null ? (
        <Alert color="orange" title={t('setup.ollama.missingTitle')}>
          <Stack gap="sm">
            <Text size="sm">{t('setup.ollama.missingBody')}</Text>
            <Button
              component="a"
              href={state.ollamaDownloadUrl}
              target="_blank"
              rel="noreferrer"
              variant="light"
            >
              {t('setup.ollama.download')}
            </Button>
          </Stack>
        </Alert>
      ) : (
        <Alert color="teal" title={t('setup.ollama.foundTitle')}>
          <Text size="sm">{t('setup.ollama.foundBody', { path: state.ollamaPath })}</Text>
        </Alert>
      )}

      <Alert color="gray" title={t('setup.models.title')}>
        <Stack gap="sm">
          <Text size="sm">{t('setup.models.body')}</Text>
          <Button
            type="button"
            loading={pulling}
            disabled={state.ollamaPath === null || state.uvPath === null}
            onClick={() => {
              const api = getDesktopApi();
              if (api === null) {
                return;
              }
              setPulling(true);
              setPullError(null);
              void api
                .pullModels()
                .then(() => {
                  setPullDone(true);
                })
                .catch((error: unknown) => {
                  setPullError(error instanceof Error ? error.message : String(error));
                })
                .finally(() => {
                  setPulling(false);
                });
            }}
          >
            {t('setup.models.pull')}
          </Button>
          {pullDone && (
            <Text size="sm" c="teal">
              {t('setup.models.pullDone')}
            </Text>
          )}
          {pullError !== null && (
            <Text size="sm" c="red">
              {t('setup.models.pullFailed', { message: pullError })}
            </Text>
          )}
        </Stack>
      </Alert>

      <Group>
        <Button
          type="button"
          onClick={() => {
            const api = getDesktopApi();
            if (api === null) {
              return;
            }
            void api.markSetupComplete().then(() => {
              router.push(`/${locale}`);
            });
          }}
        >
          {t('setup.continue')}
        </Button>
        <Button
          type="button"
          variant="default"
          onClick={() => {
            const api = getDesktopApi();
            if (api === null) {
              return;
            }
            void api.saveDiagnostics().then((result) => setDiagnosticsPath(result.path));
          }}
        >
          {t('setup.diagnostics.save')}
        </Button>
      </Group>
      {diagnosticsPath !== null && (
        <Text size="sm" c="dimmed">
          {t('setup.diagnostics.saved', { path: diagnosticsPath })}
        </Text>
      )}
    </Stack>
  );
}
