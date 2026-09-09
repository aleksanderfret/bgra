import { AppNav } from '@bga/components/app-nav';
import { ColorSchemeSwitcher } from '@bga/components/color-scheme-switcher';
import { DiagnosticsButton } from '@bga/components/diagnostics-button';
import { EngineReadinessBanner } from '@bga/components/engine-readiness-banner';
import { LanguageSwitcher } from '@bga/components/language-switcher';
import { RulesChat } from '@bga/components/rules-chat';
import { UninstallEntryLink } from '@bga/components/uninstall-entry-link';
import { Container, Group, Stack, Text, Title } from '@mantine/core';
import type { TFunction } from 'i18next';
import type { FC } from 'react';

export interface HomePageProps {
  t: TFunction<'common'>;
}

export const HomePage: FC<HomePageProps> = ({ t }) => (
  <Container size="md" py="xl">
    <Stack gap="xl">
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <AppNav />
        <Group
          gap="xs"
          wrap="wrap"
          justify="flex-end"
          align="flex-start"
          component="nav"
          aria-label={t('preferences.label')}
        >
          <ColorSchemeSwitcher />
          <LanguageSwitcher />
          <DiagnosticsButton />
          <UninstallEntryLink />
        </Group>
      </Group>
      <EngineReadinessBanner />
      <Stack gap={4}>
        <Title order={1}>{t('home.title')}</Title>
        <Text c="dimmed">{t('home.subtitle')}</Text>
      </Stack>
      <RulesChat />
    </Stack>
  </Container>
);
