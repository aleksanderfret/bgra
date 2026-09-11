'use client';

import type { GameCatalogueItem } from '@bga/api-contract';
import { useEngineReadiness } from '@bga/hooks/use-engine-readiness';
import { GAMES_CHANGED_EVENT } from '@bga/utils/desktop-bridge';
import { useCallback, useEffect, useSyncExternalStore } from 'react';

const isCatalogueList = (value: unknown): value is GameCatalogueItem[] => {
  if (!Array.isArray(value)) {
    return false;
  }
  return value.every((item) => {
    if (typeof item !== 'object' || item === null) {
      return false;
    }
    return (
      'gameId' in item &&
      typeof item.gameId === 'string' &&
      'title' in item &&
      typeof item.title === 'string' &&
      'baseGameId' in item &&
      (item.baseGameId === null || typeof item.baseGameId === 'string')
    );
  });
};

type Listener = () => void;

let snapshot: GameCatalogueItem[] | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<Listener>();

const emit = (): void => {
  for (const listener of listeners) {
    listener();
  }
};

const subscribe = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = (): GameCatalogueItem[] | null => snapshot;

const getServerSnapshot = (): GameCatalogueItem[] | null => null;

const fetchCatalogue = async (enginePhase: string): Promise<void> => {
  if (inflight !== null) {
    await inflight;
    return;
  }
  inflight = (async () => {
    try {
      const response = await fetch('/api/engine/games/catalogue');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload: unknown = await response.json();
      if (isCatalogueList(payload)) {
        snapshot = payload;
        emit();
      }
    } catch {
      if (enginePhase === 'offline') {
        snapshot = [];
        emit();
      } else if (enginePhase === 'ready' && snapshot === null) {
        // Stay null so the UI keeps "loading"; interval / games-changed will retry.
      }
    } finally {
      inflight = null;
    }
  })();
  await inflight;
};

export interface UseGameCatalogue {
  games: GameCatalogueItem[] | null;
}

export const useGameCatalogue = (): UseGameCatalogue => {
  const { phase: enginePhase } = useEngineReadiness();
  const games = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const load = useCallback(async (): Promise<void> => {
    await fetchCatalogue(enginePhase);
  }, [enginePhase]);

  useEffect(() => {
    void load();
    const onChanged = (): void => {
      snapshot = null;
      emit();
      void load();
    };
    window.addEventListener(GAMES_CHANGED_EVENT, onChanged);
    const retry = window.setInterval(() => {
      if (snapshot === null) {
        void load();
      }
    }, 1_000);
    return () => {
      window.removeEventListener(GAMES_CHANGED_EVENT, onChanged);
      window.clearInterval(retry);
    };
  }, [load]);

  return { games };
};
