export const ENGINE_OFFLINE_AFTER_MS = 20_000;

export type EnginePhase = 'starting' | 'ready' | 'offline';

export interface EngineHealthSnapshot {
  components: Record<string, boolean>;
}

export function isEngineHealthSnapshot(value: unknown): value is EngineHealthSnapshot {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const components = (value as { components?: unknown }).components;
  return typeof components === 'object' && components !== null && !Array.isArray(components);
}

export function phaseFromPoll(options: {
  health: EngineHealthSnapshot | null;
  failedForMs: number;
  offlineAfterMs: number;
}): EnginePhase {
  const { health, failedForMs, offlineAfterMs } = options;
  if (health !== null && health.components.retrieval_loading === true) {
    return 'starting';
  }
  if (health !== null) {
    return 'ready';
  }
  if (failedForMs >= offlineAfterMs) {
    return 'offline';
  }
  return 'starting';
}
