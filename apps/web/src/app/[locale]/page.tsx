import { notFound, redirect } from 'next/navigation';
import { isLocale } from '@/i18n/settings';

/** Old questions home — prefer `/check-rule`. */
const LocaleRootRedirect = async ({ params }: PageProps<'/[locale]'>) => {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  redirect(`/${locale}/check-rule`);
};

export default LocaleRootRedirect;
