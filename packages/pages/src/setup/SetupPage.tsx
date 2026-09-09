import { ColorSchemeSwitcher } from '@bga/components/color-scheme-switcher';
import { LanguageSwitcher } from '@bga/components/language-switcher';
import { SetupPanel } from '@bga/components/setup-panel';
import { UninstallEntryLink } from '@bga/components/uninstall-entry-link';
import { Container, Group, Stack, Text, Title } from '@mantine/core';
import type { TFunction } from 'i18next';
import type { FC } from 'react';

export interface SetupPageProps {
  t: TFunction<'common'>;
}

export const SetupPage: FC<SetupPageProps> = ({ t }) => (
  <Container size="md" py="xl">
    <Stack gap="xl">
      <Group justify="flex-end" wrap="wrap" component="nav" aria-label={t('preferences.label')}>
        <ColorSchemeSwitcher />
        <LanguageSwitcher />
        <UninstallEntryLink />
      </Group>
      <Stack gap={4}>
        <Title order={1}>{t('setup.title')}</Title>
        <Text c="dimmed">{t('setup.subtitle')}</Text>
      </Stack>
      <SetupPanel />
    </Stack>
  </Container>
);
