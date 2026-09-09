import { TeachPage } from '@bga/pages/teach';
import { notFound } from 'next/navigation';
import { getTranslation } from '@/i18n/server';
import { isLocale } from '@/i18n/settings';

const TeachRoute = async ({ params }: PageProps<'/[locale]/teach'>) => {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const t = getTranslation(locale);
  return <TeachPage t={t} />;
};

export default TeachRoute;
