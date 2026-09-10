import { notFound, redirect } from 'next/navigation';
import { isLocale } from '@/i18n/settings';

/** Legacy path — prefer `/init`. */
const SetupRedirect = async ({ params }: PageProps<'/[locale]/setup'>) => {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  redirect(`/${locale}/init`);
};

export default SetupRedirect;
