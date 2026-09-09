'use client';

import type { UninstallSelectionPayload } from '@bga/utils/desktop-bridge';
import { getDesktopApi } from '@bga/utils/desktop-bridge';
import { DEFAULT_LOCALE } from '@bga/utils/locale';
import { localeFromPathname } from '@bga/utils/locale-routing';
import type { CheckboxProps } from '@mantine/core';
import { Alert, Button, Checkbox, Group, List, Stack, Text } from '@mantine/core';
import { usePathname, useRouter } from 'next/navigation';
import { type FC, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type Phase = 'choose' | 'confirm' | 'running' | 'done';

const defaultSelection = (): UninstallSelectionPayload => ({
  removeData: false,
  removeApplication: false,
  removeLlmModels: false,
  removeOllama: false,
});

export const UninstallPanel: FC = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const locale = localeFromPathname(pathname) ?? DEFAULT_LOCALE;
  const api = getDesktopApi();
  const [selection, setSelection] = useState(defaultSelection);
  const [phase, setPhase] = useState<Phase>('choose');
  const [platform, setPlatform] = useState<'darwin' | 'win32' | 'linux' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leftBehind, setLeftBehind] = useState<string[]>([]);

  useEffect(() => {
    if (api === null) {
      return;
    }
    let cancelled = false;
    void api.getUninstallPreview().then((preview) => {
      if (!cancelled) {
        setPlatform(preview.platform);
        setSelection(preview.defaults);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const handleBackHome = (): void => {
    router.push(`/${locale}`);
  };

  const handleToggleData: NonNullable<CheckboxProps['onChange']> = (event) => {
    setSelection((prev) => ({ ...prev, removeData: event.currentTarget.checked }));
  };
  const handleToggleApplication: NonNullable<CheckboxProps['onChange']> = (event) => {
    setSelection((prev) => ({ ...prev, removeApplication: event.currentTarget.checked }));
  };
  const handleToggleModels: NonNullable<CheckboxProps['onChange']> = (event) => {
    setSelection((prev) => ({ ...prev, removeLlmModels: event.currentTarget.checked }));
  };
  const handleToggleOllama: NonNullable<CheckboxProps['onChange']> = (event) => {
    setSelection((prev) => ({ ...prev, removeOllama: event.currentTarget.checked }));
  };
  const handleContinueToConfirm = (): void => {
    setPhase('confirm');
    setError(null);
  };
  const handleBackToChoose = (): void => {
    setPhase('choose');
  };
  const handleRun = (): void => {
    if (api === null) {
      return;
    }
    setPhase('running');
    setError(null);
    void api
      .runUninstall(selection)
      .then((report) => {
        const left: string[] = [];
        if (!selection.removeData) {
          left.push(t('uninstall.left.data'));
        }
        if (!selection.removeApplication) {
          left.push(t('uninstall.left.application'));
        }
        if (!selection.removeLlmModels) {
          left.push(t('uninstall.left.models'));
        }
        if (!selection.removeOllama) {
          left.push(t('uninstall.left.ollama'));
        }
        setLeftBehind(left);
        setPhase('done');
        if (!report.allSelectedOk) {
          setError(t('uninstall.error.partial'));
        }
      })
      .catch(() => {
        setError(t('uninstall.error.failed'));
        setPhase('confirm');
      });
  };

  if (api === null) {
    return (
      <Alert color="blue" title={t('uninstall.desktopOnly.title')}>
        <Text size="sm">{t('uninstall.desktopOnly.body')}</Text>
        <Button mt="sm" variant="light" onClick={handleBackHome}>
          {t('uninstall.desktopOnly.back')}
        </Button>
      </Alert>
    );
  }

  if (phase === 'done') {
    return (
      <Stack gap="md">
        <Alert color={error === null ? 'teal' : 'yellow'} title={t('uninstall.done.title')}>
          <Text size="sm">{t('uninstall.done.body')}</Text>
          {leftBehind.length > 0 ? (
            <List size="sm" mt="sm">
              {leftBehind.map((item) => (
                <List.Item key={item}>{item}</List.Item>
              ))}
            </List>
          ) : null}
          {error !== null ? (
            <Text size="sm" mt="sm">
              {error}
            </Text>
          ) : null}
        </Alert>
      </Stack>
    );
  }

  if (phase === 'confirm' || phase === 'running') {
    return (
      <Stack gap="md">
        <Alert color="red" title={t('uninstall.confirm.title')}>
          <Text size="sm">{t('uninstall.confirm.programAlways')}</Text>
          {selection.removeData ||
          selection.removeApplication ||
          selection.removeLlmModels ||
          selection.removeOllama ? (
            <>
              <Text size="sm" mt="sm">
                {t('uninstall.confirm.alsoSelected')}
              </Text>
              <List size="sm" mt="sm">
                {selection.removeData ? <List.Item>{t('uninstall.option.data')}</List.Item> : null}
                {selection.removeApplication ? (
                  <List.Item>{t('uninstall.option.application')}</List.Item>
                ) : null}
                {selection.removeLlmModels ? (
                  <List.Item>{t('uninstall.option.models')}</List.Item>
                ) : null}
                {selection.removeOllama ? (
                  <List.Item>{t('uninstall.option.ollama')}</List.Item>
                ) : null}
              </List>
            </>
          ) : null}
        </Alert>
        {error !== null ? (
          <Alert color="red" title={t('uninstall.error.title')}>
            <Text size="sm">{error}</Text>
          </Alert>
        ) : null}
        <Group>
          <Button
            type="button"
            variant="default"
            disabled={phase === 'running'}
            onClick={handleBackToChoose}
          >
            {t('uninstall.confirm.back')}
          </Button>
          <Button type="button" color="red" loading={phase === 'running'} onClick={handleRun}>
            {t('uninstall.confirm.run')}
          </Button>
        </Group>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      <Text size="sm">{t('uninstall.intro')}</Text>
      {platform === 'darwin' ? (
        <Alert color="gray" title={t('uninstall.macTrash.title')}>
          <Text size="sm">{t('uninstall.macTrash.body')}</Text>
        </Alert>
      ) : null}
      <Checkbox
        checked={selection.removeData}
        onChange={handleToggleData}
        label={t('uninstall.option.data')}
        description={t('uninstall.option.dataHelp')}
      />
      <Checkbox
        checked={selection.removeApplication}
        onChange={handleToggleApplication}
        label={t('uninstall.option.application')}
        description={t('uninstall.option.applicationHelp')}
      />
      <Checkbox
        checked={selection.removeLlmModels}
        onChange={handleToggleModels}
        label={t('uninstall.option.models')}
        description={t('uninstall.option.modelsHelp')}
      />
      <Checkbox
        checked={selection.removeOllama}
        onChange={handleToggleOllama}
        label={t('uninstall.option.ollama')}
        description={t('uninstall.option.ollamaHelp')}
      />
      {selection.removeOllama ? (
        <Alert color="yellow" title={t('uninstall.ollama.warningTitle')}>
          <Text size="sm">{t('uninstall.ollama.warning')}</Text>
        </Alert>
      ) : null}
      <Button type="button" color="red" variant="filled" onClick={handleContinueToConfirm}>
        {t('uninstall.continue')}
      </Button>
    </Stack>
  );
};
