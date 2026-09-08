import { RulebooksPage } from '@bga/pages/rulebooks';
import { notFound } from 'next/navigation';
import { getTranslation } from '@/i18n/server';
import { isLocale } from '@/i18n/settings';

const RulebooksRoute = async ({ params }: PageProps<'/[locale]/rulebooks'>) => {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const t = getTranslation(locale);
  return <RulebooksPage t={t} />;
};

export default RulebooksRoute;
