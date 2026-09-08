'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getDesktopApi } from '@/lib/desktop-bridge';

/**
 * Keeps packaged desktop on /setup until the gate passes.
 *
 * Initial `ready` must be false on both server and client. Starting true when
 * `window.bgaDesktop` is absent (SSR) and false in Electron caused a hydration
 * mismatch that left the setup page mounted twice.
 */
export function DesktopGate({ locale, children }: { locale: string; children: React.ReactNode }) {
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
      const onSetup = pathname.includes('/setup');
      if (!state.gatePassed && !onSetup) {
        router.replace(`/${locale}/setup`);
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [locale, pathname, router]);

  if (!ready) {
    return null;
  }
  return children;
}
