import { AppNav } from '@bga/components/app-nav';
import { EngineReadinessBanner } from '@bga/components/engine-readiness-banner';
import { PdfDropZone } from '@bga/components/pdf-drop-zone';
import { Container, Stack, Text, Title } from '@mantine/core';
import type { TFunction } from 'i18next';
import type { FC } from 'react';

export interface RulebooksPageProps {
  t: TFunction<'common'>;
}

export const RulebooksPage: FC<RulebooksPageProps> = ({ t }) => (
  <Container size="md" py="xl">
    <Stack gap="xl">
      <AppNav />
      <EngineReadinessBanner />
      <Stack gap={4}>
        <Title order={1}>{t('rulebooks.title')}</Title>
        <Text c="dimmed">{t('rulebooks.subtitle')}</Text>
      </Stack>
      <PdfDropZone />
    </Stack>
  </Container>
);
