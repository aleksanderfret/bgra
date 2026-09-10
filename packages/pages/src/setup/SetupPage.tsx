import { SettingsEntryLink } from '@bga/components/settings-entry-link';
import { SetupPanel } from '@bga/components/setup-panel';
import { Container, Group, Stack } from '@mantine/core';
import type { TFunction } from 'i18next';
import type { FC } from 'react';

export interface SetupPageProps {
  t: TFunction<'common'>;
}

export const SetupPage: FC<SetupPageProps> = ({ t }) => (
  <Container size="md" py="xl">
    <Stack gap="xl">
      <Group justify="flex-end" wrap="wrap" component="nav" aria-label={t('appChrome.tools')}>
        <SettingsEntryLink />
      </Group>
      <SetupPanel />
    </Stack>
  </Container>
);
