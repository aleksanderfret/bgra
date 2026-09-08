import { AppNav } from '@bga/components/app-nav';
import { ColorSchemeSwitcher } from '@bga/components/color-scheme-switcher';
import { EngineReadinessBanner } from '@bga/components/engine-readiness-banner';
import { LanguageSwitcher } from '@bga/components/language-switcher';
import { PdfDropZone } from '@bga/components/pdf-drop-zone';
import { Container, Group, Stack, Text, Title } from '@mantine/core';
import type { TFunction } from 'i18next';
import type { FC } from 'react';

export interface RulebooksPageProps {
  t: TFunction<'common'>;
}

export const RulebooksPage: FC<RulebooksPageProps> = ({ t }) => (
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
        </Group>
      </Group>
      <EngineReadinessBanner />
      <Stack gap={4}>
        <Title order={1}>{t('rulebooks.title')}</Title>
        <Text c="dimmed">{t('rulebooks.subtitle')}</Text>
      </Stack>
      <PdfDropZone />
    </Stack>
  </Container>
);
