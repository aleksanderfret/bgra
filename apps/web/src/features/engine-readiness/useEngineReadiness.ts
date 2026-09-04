'use client';

import { useEffect, useState } from 'react';
import {
  ENGINE_OFFLINE_AFTER_MS,
  type EnginePhase,
  isEngineHealthSnapshot,
  phaseFromPoll,
} from './engine-readiness';

const POLL_MS = 1_000;

export function useEngineReadiness(offlineAfterMs: number = ENGINE_OFFLINE_AFTER_MS): EnginePhase {
  const [phase, setPhase] = useState<EnginePhase>('starting');

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
      setPhase(
        phaseFromPoll({
          health,
          failedForMs: failedSince === null ? 0 : now - failedSince,
          offlineAfterMs,
        }),
      );
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

  return phase;
}
