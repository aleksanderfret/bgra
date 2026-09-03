import { Container, Group, Stack } from '@mantine/core';
import { notFound } from 'next/navigation';
import { ColorSchemeSwitcher } from '@/features/color-scheme/ColorSchemeSwitcher';
import { PdfDropZone } from '@/features/desktop-setup/PdfDropZone';
import { SetupPanel } from '@/features/desktop-setup/SetupPanel';
import { LanguageSwitcher } from '@/features/language-switcher/LanguageSwitcher';
import { getTranslation } from '@/i18n/server';
import { isLocale } from '@/i18n/settings';

export default async function SetupPage({ params }: PageProps<'/[locale]/setup'>) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const t = getTranslation(locale);

  return (
    <Container size="md" py="xl">
      <Stack gap="xl">
        <Group justify="flex-end" wrap="wrap" component="nav" aria-label={t('preferences.label')}>
          <ColorSchemeSwitcher />
          <LanguageSwitcher />
        </Group>
        <SetupPanel />
        <PdfDropZone />
      </Stack>
    </Container>
  );
}
