'use client';

import { ActivityProgress } from '@bga/components/activity-progress';
import { useEngineReadiness } from '@bga/hooks/use-engine-readiness';
import { enginePhaseToActivity } from '@bga/utils/activity-progress';
import { usePathname } from 'next/navigation';
import { type FC, type ReactNode, useEffect, useState } from 'react';

export interface AssistantReadyGateProps {
  children: ReactNode;
}

const FALLBACK_VIEW = { activity: 'preparing_search' as const, percent: null };

export const AssistantReadyGate: FC<AssistantReadyGateProps> = ({ children }) => {
  const pathname = usePathname();
  const phase = useEngineReadiness();
  const [seenReady, setSeenReady] = useState(false);
  const onInit = pathname.includes('/init');

  useEffect(() => {
    if (phase === 'ready') {
      setSeenReady(true);
    }
  }, [phase]);

  if (onInit) {
    return children;
  }

  if (phase === 'search_unavailable' || phase === 'offline') {
    return children;
  }

  if (!seenReady && (phase === 'starting' || phase === 'reading_layout')) {
    return <ActivityProgress layout="page" view={enginePhaseToActivity(phase) ?? FALLBACK_VIEW} />;
  }

  return children;
};
