import { UninstallPage } from '@bga/pages/uninstall';
import { notFound } from 'next/navigation';
import { getTranslation } from '@/i18n/server';
import { isLocale } from '@/i18n/settings';

const UninstallRoute = async ({ params }: PageProps<'/[locale]/uninstall'>) => {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const t = getTranslation(locale);
  return <UninstallPage t={t} />;
};

export default UninstallRoute;
