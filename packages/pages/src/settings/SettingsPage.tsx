import { AppNav } from '@bga/components/app-nav';
import { ColorSchemeSwitcher } from '@bga/components/color-scheme-switcher';
import { LanguageSwitcher } from '@bga/components/language-switcher';
import { UninstallEntryLink } from '@bga/components/uninstall-entry-link';
import { Container, Stack, Text, Title } from '@mantine/core';
import type { TFunction } from 'i18next';
import type { FC } from 'react';

export interface SettingsPageProps {
  t: TFunction<'common'>;
}

export const SettingsPage: FC<SettingsPageProps> = ({ t }) => (
  <Container size="md" py="xl">
    <Stack gap="xl">
      <AppNav />
      <Stack gap={4}>
        <Title order={1}>{t('settings.title')}</Title>
        <Text c="dimmed">{t('settings.subtitle')}</Text>
      </Stack>
      <Stack gap="md" maw={420}>
        <LanguageSwitcher />
        <ColorSchemeSwitcher />
        <UninstallEntryLink />
      </Stack>
    </Stack>
  </Container>
);
