import { AppNav } from '@bga/components/app-nav';
import { EngineReadinessBanner } from '@bga/components/engine-readiness-banner';
import { LessonPanel } from '@bga/components/lesson-panel';
import { Container, Stack, Text, Title } from '@mantine/core';
import type { TFunction } from 'i18next';
import type { FC } from 'react';

export interface TeachPageProps {
  t: TFunction<'common'>;
}

export const TeachPage: FC<TeachPageProps> = ({ t }) => (
  <Container size="md" py="xl">
    <Stack gap="xl">
      <AppNav />
      <EngineReadinessBanner />
      <Stack gap={4}>
        <Title order={1}>{t('teach.title')}</Title>
        <Text c="dimmed">{t('teach.subtitle')}</Text>
      </Stack>
      <LessonPanel />
    </Stack>
  </Container>
);
