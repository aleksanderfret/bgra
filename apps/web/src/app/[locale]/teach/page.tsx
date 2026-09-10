import { notFound, redirect } from 'next/navigation';
import { isLocale } from '@/i18n/settings';

/** Legacy path — prefer `/learn`. */
const TeachRedirect = async ({ params }: PageProps<'/[locale]/teach'>) => {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  redirect(`/${locale}/learn`);
};

export default TeachRedirect;
