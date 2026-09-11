import type { RuntimeProgress } from '@bga/utils/desktop-bridge';
import type { EnginePhase } from '@bga/utils/engine-readiness';

export const ACTIVITY_CODES = [
  'checking_computer',
  'starting_assistant',
  'teaching_answers',
  'finding_rules',
  'downloading_installer',
  'waiting_for_ollama',
  'pulling_models',
  'preparing_search',
  'reading_layout',
  'sending',
  'saving',
  'reading',
  'drawing',
  'filing',
  'community',
  'indexing',
] as const;

export type ActivityCode = (typeof ACTIVITY_CODES)[number];

export type IngestStage = Extract<
  ActivityCode,
  'saving' | 'reading' | 'drawing' | 'filing' | 'community' | 'indexing'
>;

export const INGEST_STAGES: readonly IngestStage[] = [
  'saving',
  'reading',
  'drawing',
  'filing',
  'community',
  'indexing',
];

export interface ActivityView {
  activity: ActivityCode | null;
  params?: Record<string, string>;
  percent: number | null;
  current?: number;
  total?: number;
}

export interface IngestProgressInput {
  stage: IngestStage;
  current?: number;
  total?: number;
  displayPercent: number;
}

export interface BlendUploadPercentOptions {
  uploadPercent: number | null;
  serverPercent: number | null;
  shown: number | null;
}

/** Leading band reserved for the browser upload; server work fills the rest. */
export const UPLOAD_BAND_END = 12;
export const SERVER_BAND_WEIGHT = 0.88;

const ACTIVITY_CODE_SET: ReadonlySet<string> = new Set(ACTIVITY_CODES);
const INGEST_STAGE_SET: ReadonlySet<string> = new Set(INGEST_STAGES);

export const isActivityCode = (value: unknown): value is ActivityCode => {
  return typeof value === 'string' && ACTIVITY_CODE_SET.has(value);
};

export const isIngestStage = (value: unknown): value is IngestStage => {
  return typeof value === 'string' && INGEST_STAGE_SET.has(value);
};

const clampPercent = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
};

export const runtimeProgressToActivity = (progress: RuntimeProgress): ActivityView | null => {
  switch (progress.stage) {
    case 'downloading_installer': {
      const total = progress.totalBytes;
      const received = progress.receivedBytes;
      let percent: number | null = null;
      if (
        typeof total === 'number' &&
        Number.isFinite(total) &&
        total >= 1 &&
        typeof received === 'number' &&
        Number.isFinite(received)
      ) {
        percent = clampPercent((100 * received) / total);
      }
      return { activity: 'downloading_installer', percent };
    }
    case 'waiting_for_ollama':
      return { activity: 'waiting_for_ollama', percent: null };
    case 'pulling_models':
      return { activity: 'pulling_models', percent: null };
    case 'preparing_search':
      return { activity: 'preparing_search', percent: null };
    case 'ready':
    case 'error':
      return null;
  }
};

export const enginePhaseToActivity = (phase: EnginePhase): ActivityView | null => {
  if (phase === 'starting') {
    return { activity: 'preparing_search', percent: null };
  }
  if (phase === 'reading_layout') {
    return { activity: 'reading_layout', percent: null };
  }
  return null;
};

export const warmStageToActivity = (
  stage: 'starting_assistant' | 'teaching_answers' | 'finding_rules' | null,
): ActivityView | null => {
  if (stage === null) {
    return null;
  }
  return { activity: stage, percent: null };
};

export const bootStageToActivity = (stage: ActivityCode): ActivityView => {
  return { activity: stage, percent: null };
};

export const ingestProgressToActivity = (input: IngestProgressInput): ActivityView => {
  return {
    activity: input.stage,
    percent: clampPercent(input.displayPercent),
    current: input.current,
    total: input.total,
  };
};

export const sendingActivity = (displayPercent: number): ActivityView => {
  return { activity: 'sending', percent: clampPercent(displayPercent) };
};

export const blendUploadPercent = (options: BlendUploadPercentOptions): number | null => {
  const { uploadPercent, serverPercent, shown } = options;
  let next: number | null = null;
  if (serverPercent !== null && Number.isFinite(serverPercent)) {
    next = UPLOAD_BAND_END + SERVER_BAND_WEIGHT * serverPercent;
  } else if (uploadPercent !== null && Number.isFinite(uploadPercent)) {
    next = (UPLOAD_BAND_END * uploadPercent) / 100;
  }
  if (next === null) {
    return shown === null ? null : clampPercent(shown);
  }
  if (shown !== null && Number.isFinite(shown)) {
    next = Math.max(shown, next);
  }
  return clampPercent(next);
};
