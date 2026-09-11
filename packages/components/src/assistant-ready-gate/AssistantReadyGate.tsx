'use client';

import { ActivityProgress } from '@bga/components/activity-progress';
import { useEngineReadiness } from '@bga/hooks/use-engine-readiness';
import { enginePhaseToActivity, warmStageToActivity } from '@bga/utils/activity-progress';
import { usePathname } from 'next/navigation';
import { type FC, type ReactNode, useEffect, useState } from 'react';

export interface AssistantReadyGateProps {
  children: ReactNode;
}

const FALLBACK_VIEW = { activity: 'starting_assistant' as const, percent: null };

export const AssistantReadyGate: FC<AssistantReadyGateProps> = ({ children }) => {
  const pathname = usePathname();
  const { phase, warmStage } = useEngineReadiness();
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
    const view = warmStageToActivity(warmStage) ?? enginePhaseToActivity(phase) ?? FALLBACK_VIEW;
    return <ActivityProgress layout="page" view={view} />;
  }

  return children;
};
