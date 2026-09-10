import { notFound, redirect } from 'next/navigation';
import { isLocale } from '@/i18n/settings';

/** Legacy path — prefer `/add-game`. */
const RulebooksRedirect = async ({ params }: PageProps<'/[locale]/rulebooks'>) => {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  redirect(`/${locale}/add-game`);
};

export default RulebooksRedirect;
