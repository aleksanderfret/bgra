import { RulebooksPage } from '@bga/pages/rulebooks';
import { notFound } from 'next/navigation';
import { getTranslation } from '@/i18n/server';
import { isLocale } from '@/i18n/settings';

const AddGameRoute = async ({ params }: PageProps<'/[locale]/add-game'>) => {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const t = getTranslation(locale);
  return <RulebooksPage t={t} />;
};

export default AddGameRoute;
