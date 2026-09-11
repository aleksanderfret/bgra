export const ENGINE_OFFLINE_AFTER_MS = 20_000;

export type EnginePhase =
  | 'starting'
  | 'reading_layout'
  | 'ready'
  | 'search_unavailable'
  | 'offline';

export type WarmStage = 'starting_assistant' | 'teaching_answers' | 'finding_rules';

export interface EngineHealthSnapshot {
  components: Record<string, boolean>;
  warmStage?: WarmStage | null;
}

export interface PhaseFromPollOptions {
  health: EngineHealthSnapshot | null;
  failedForMs: number;
  offlineAfterMs: number;
}

const WARM_STAGES: readonly WarmStage[] = [
  'starting_assistant',
  'teaching_answers',
  'finding_rules',
];

export const isWarmStage = (value: unknown): value is WarmStage =>
  typeof value === 'string' && (WARM_STAGES as readonly string[]).includes(value);

export const isEngineHealthSnapshot = (value: unknown): value is EngineHealthSnapshot => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  if (!('components' in value)) {
    return false;
  }
  const { components } = value;
  if (typeof components !== 'object' || components === null || Array.isArray(components)) {
    return false;
  }
  if ('warmStage' in value) {
    const stage = value.warmStage;
    if (stage !== null && stage !== undefined && !isWarmStage(stage)) {
      return false;
    }
  }
  return true;
};

export const libraryCatchUpFromHealth = (health: EngineHealthSnapshot | null): boolean =>
  health?.components.library_catch_up === true;

export const warmStageFromHealth = (health: EngineHealthSnapshot | null): WarmStage | null => {
  if (health === null) {
    return null;
  }
  const stage = health.warmStage;
  return isWarmStage(stage) ? stage : null;
};

/**
 * Ask-ready wins over background layout / catch-up so the full-page gate does
 * not reopen after unlock.
 */
export const phaseFromPoll = (options: PhaseFromPollOptions): EnginePhase => {
  const { health, failedForMs, offlineAfterMs } = options;
  if (health === null) {
    return failedForMs >= offlineAfterMs ? 'offline' : 'starting';
  }
  const retrievalLoading = health.components.retrieval_loading === true;
  const rerankerReady = health.components.reranker === true;
  if (rerankerReady && !retrievalLoading) {
    return 'ready';
  }
  if (health.components.layout_ingest === true) {
    return 'reading_layout';
  }
  if (retrievalLoading) {
    return 'starting';
  }
  return 'search_unavailable';
};
