'use client';

import {
  ENGINE_OFFLINE_AFTER_MS,
  type EnginePhase,
  isEngineHealthSnapshot,
  libraryCatchUpFromHealth,
  phaseFromPoll,
  type WarmStage,
  warmStageFromHealth,
} from '@bga/utils/engine-readiness';
import { useEffect, useState } from 'react';

const POLL_MS = 1_000;

export interface EngineReadiness {
  phase: EnginePhase;
  warmStage: WarmStage | null;
  libraryCatchUp: boolean;
}

export const useEngineReadiness = (
  offlineAfterMs: number = ENGINE_OFFLINE_AFTER_MS,
): EngineReadiness => {
  const [state, setState] = useState<EngineReadiness>({
    phase: 'starting',
    warmStage: null,
    libraryCatchUp: false,
  });

  useEffect(() => {
    let cancelled = false;
    let failedSince: number | null = null;

    const poll = async (): Promise<void> => {
      let health = null;
      try {
        const response = await fetch('/api/engine/health');
        if (response.ok) {
          const payload: unknown = await response.json();
          if (isEngineHealthSnapshot(payload)) {
            health = payload;
          }
        }
      } catch {
        health = null;
      }

      const now = Date.now();
      if (health === null) {
        failedSince ??= now;
      } else {
        failedSince = null;
      }

      if (cancelled) {
        return;
      }
      setState({
        phase: phaseFromPoll({
          health,
          failedForMs: failedSince === null ? 0 : now - failedSince,
          offlineAfterMs,
        }),
        warmStage: warmStageFromHealth(health),
        libraryCatchUp: libraryCatchUpFromHealth(health),
      });
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [offlineAfterMs]);

  return state;
};
