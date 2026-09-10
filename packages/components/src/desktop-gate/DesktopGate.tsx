'use client';

import { ActivityProgress } from '@bga/components/activity-progress';
import { getDesktopApi } from '@bga/utils/desktop-bridge';
import { usePathname, useRouter } from 'next/navigation';
import { type FC, type ReactNode, useEffect, useState } from 'react';

const GATE_WAIT_VIEW = { activity: 'starting_assistant' as const, percent: null };

export interface DesktopGateProps {
  locale: string;
  children: ReactNode;
}

const isAllowedWhileGated = (pathname: string, locale: string): boolean => {
  const pathOnly = pathname.split('?')[0] ?? pathname;
  const allowed = [`/${locale}/init`, `/${locale}/settings`, `/${locale}/uninstall`];
  return allowed.some((base) => pathOnly === base || pathOnly.startsWith(`${base}/`));
};

/**
 * Keeps packaged desktop on /init until the gate passes.
 *
 * Initial `ready` must be false on both server and client. Starting true when
 * `window.bgaDesktop` is absent (SSR) and false in Electron caused a hydration
 * mismatch that left the init page mounted twice.
 */
export const DesktopGate: FC<DesktopGateProps> = ({ locale, children }) => {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const api = getDesktopApi();
    if (api === null) {
      setReady(true);
      return;
    }
    let cancelled = false;
    void api.getSetupState().then((state) => {
      if (cancelled) {
        return;
      }
      const pathOnly = pathname.split('?')[0] ?? pathname;
      const onInit = pathOnly === `/${locale}/init` || pathOnly.startsWith(`/${locale}/init/`);
      if (state.gatePassed && onInit) {
        router.replace(`/${locale}/add-game`);
      } else if (!state.gatePassed && !isAllowedWhileGated(pathname, locale)) {
        router.replace(`/${locale}/init`);
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [locale, pathname, router]);

  if (!ready) {
    return <ActivityProgress layout="page" view={GATE_WAIT_VIEW} />;
  }
  return children;
};
