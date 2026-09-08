import { HomePage } from '@bga/pages/home';
import { notFound } from 'next/navigation';
import { getTranslation } from '@/i18n/server';
import { isLocale } from '@/i18n/settings';

const HomeRoute = async ({ params }: PageProps<'/[locale]'>) => {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const t = getTranslation(locale);
  return <HomePage t={t} />;
};

export default HomeRoute;
