import { SetupPage } from '@bga/pages/setup';
import { notFound } from 'next/navigation';
import { getTranslation } from '@/i18n/server';
import { isLocale } from '@/i18n/settings';

const InitRoute = async ({ params }: PageProps<'/[locale]/init'>) => {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const t = getTranslation(locale);
  return <SetupPage t={t} />;
};

export default InitRoute;
