import { TeachPage } from '@bga/pages/teach';
import { notFound } from 'next/navigation';
import { getTranslation } from '@/i18n/server';
import { isLocale } from '@/i18n/settings';

const LearnRoute = async ({ params }: PageProps<'/[locale]/learn'>) => {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const t = getTranslation(locale);
  return <TeachPage t={t} />;
};

export default LearnRoute;
