import { AppNav } from '@bga/components/app-nav';
import { EngineReadinessBanner } from '@bga/components/engine-readiness-banner';
import { RulesChat } from '@bga/components/rules-chat';
import { Container, Stack, Text, Title } from '@mantine/core';
import type { TFunction } from 'i18next';
import type { FC } from 'react';

export interface HomePageProps {
  t: TFunction<'common'>;
}

export const HomePage: FC<HomePageProps> = ({ t }) => (
  <Container size="md" py="xl">
    <Stack gap="xl">
      <AppNav />
      <EngineReadinessBanner />
      <Stack gap={4}>
        <Title order={1}>{t('home.title')}</Title>
        <Text c="dimmed">{t('home.subtitle')}</Text>
      </Stack>
      <RulesChat />
    </Stack>
  </Container>
);
