import { UninstallPanel } from '@bga/components/uninstall-panel';
import { Container, Stack, Text, Title } from '@mantine/core';
import type { TFunction } from 'i18next';
import type { FC } from 'react';

export interface UninstallPageProps {
  t: TFunction<'common'>;
}

export const UninstallPage: FC<UninstallPageProps> = ({ t }) => (
  <Container size="md" py="xl">
    <Stack gap="xl">
      <Stack gap={4}>
        <Title order={1}>{t('uninstall.title')}</Title>
        <Text c="dimmed">{t('uninstall.subtitle')}</Text>
      </Stack>
      <UninstallPanel />
    </Stack>
  </Container>
);
