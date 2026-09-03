import { Container, Group, Stack, Text, Title } from '@mantine/core';
import { notFound } from 'next/navigation';
import { AppNav } from '@/features/app-nav/AppNav';
import { ColorSchemeSwitcher } from '@/features/color-scheme/ColorSchemeSwitcher';
import { PdfDropZone } from '@/features/desktop-setup/PdfDropZone';
import { LanguageSwitcher } from '@/features/language-switcher/LanguageSwitcher';
import { getTranslation } from '@/i18n/server';
import { isLocale } from '@/i18n/settings';

export default async function RulebooksPage({ params }: PageProps<'/[locale]/rulebooks'>) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const t = getTranslation(locale);

  return (
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
        <Stack gap={4}>
          <Title order={1}>{t('rulebooks.title')}</Title>
          <Text c="dimmed">{t('rulebooks.subtitle')}</Text>
        </Stack>
        <PdfDropZone />
      </Stack>
    </Container>
  );
}
