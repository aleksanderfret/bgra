export const ENGINE_OFFLINE_AFTER_MS = 20_000;

export type EnginePhase =
  | 'starting'
  | 'reading_layout'
  | 'ready'
  | 'search_unavailable'
  | 'offline';

export interface EngineHealthSnapshot {
  components: Record<string, boolean>;
}

export interface PhaseFromPollOptions {
  health: EngineHealthSnapshot | null;
  failedForMs: number;
  offlineAfterMs: number;
}

export const isEngineHealthSnapshot = (value: unknown): value is EngineHealthSnapshot => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  if (!('components' in value)) {
    return false;
  }
  const { components } = value;
  return typeof components === 'object' && components !== null && !Array.isArray(components);
};

export const phaseFromPoll = (options: PhaseFromPollOptions): EnginePhase => {
  const { health, failedForMs, offlineAfterMs } = options;
  if (health === null) {
    return failedForMs >= offlineAfterMs ? 'offline' : 'starting';
  }
  if (health.components.layout_ingest === true) {
    return 'reading_layout';
  }
  if (health.components.retrieval_loading === true) {
    return 'starting';
  }
  if (health.components.reranker === true) {
    return 'ready';
  }
  return 'search_unavailable';
};
