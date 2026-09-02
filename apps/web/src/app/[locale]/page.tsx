import { Container, Group, Stack, Text, Title } from '@mantine/core';
import { notFound } from 'next/navigation';
import { ColorSchemeSwitcher } from '@/features/color-scheme/ColorSchemeSwitcher';
import { LanguageSwitcher } from '@/features/language-switcher/LanguageSwitcher';
import { RulesChat } from '@/features/rules-chat/RulesChat';
import { getTranslation } from '@/i18n/server';
import { isLocale } from '@/i18n/settings';

export default async function Home({ params }: PageProps<'/[locale]'>) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const t = getTranslation(locale);

  return (
    <Container size="md" py="xl">
      <Stack gap="xl">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={4}>
            <Title order={1}>{t('home.title')}</Title>
            <Text c="dimmed">{t('home.subtitle')}</Text>
          </Stack>
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
        <RulesChat />
      </Stack>
    </Container>
  );
}
