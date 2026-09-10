import { SettingsPage } from '@bga/pages/settings';
import { notFound } from 'next/navigation';
import { getTranslation } from '@/i18n/server';
import { isLocale } from '@/i18n/settings';

const SettingsRoute = async ({ params }: PageProps<'/[locale]/settings'>) => {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const t = getTranslation(locale);
  return <SettingsPage t={t} />;
};

export default SettingsRoute;
