import type {
  AssistantEvent,
  Groundedness,
  PipelineStage,
  RetrievedSource,
} from '@bga/api-contract';
import { engineAssetUrl } from '@bga/utils/engine-proxy';

export interface AnswerNotice {
  code: string;
  params: Record<string, string>;
}

export interface AnswerError {
  code: string;
  message: string;
}

export interface AnswerState {
  stage: PipelineStage | 'idle';
  isStreaming: boolean;
  transcript: string | null;
  sources: RetrievedSource[];
  text: string;
  figureIds: string[];
  groundedness: Groundedness | null;
  notice: AnswerNotice | null;
  error: AnswerError | null;
  rejectedFigureCount: number;
}

export const initialAnswerState: AnswerState = {
  stage: 'idle',
  isStreaming: false,
  transcript: null,
  sources: [],
  text: '',
  figureIds: [],
  groundedness: null,
  notice: null,
  error: null,
  rejectedFigureCount: 0,
};

export const startAnswer = (): AnswerState => {
  return { ...initialAnswerState, isStreaming: true, stage: 'retrieving' };
};

/**
 * A figure is shown only when its id is in `sources`, that source has an
 * image, and the image resolves to a path on this origin. Anything else is
 * counted in `rejectedFigureCount` and discarded.
 */
export const reduceAssistantEvent = (state: AnswerState, event: AssistantEvent): AnswerState => {
  switch (event.type) {
    case 'status':
      return { ...state, stage: event.stage };

    case 'transcript':
      return { ...state, transcript: event.text };

    case 'sources':
      return { ...state, sources: event.sources };

    case 'token':
      return { ...state, text: state.text + event.text };

    case 'figure': {
      const source = state.sources.find((candidate) => candidate.id === event.sourceId);
      if (source === undefined || source.imageUrl === null) {
        return { ...state, rejectedFigureCount: state.rejectedFigureCount + 1 };
      }
      if (engineAssetUrl(source.imageUrl) === null) {
        return { ...state, rejectedFigureCount: state.rejectedFigureCount + 1 };
      }
      if (state.figureIds.includes(event.sourceId)) {
        return state;
      }
      return { ...state, figureIds: [...state.figureIds, event.sourceId] };
    }

    case 'notice':
      return { ...state, notice: { code: event.code, params: event.params } };

    case 'done':
      return { ...state, isStreaming: false, stage: 'idle', groundedness: event.groundedness };

    case 'error':
      return {
        ...state,
        isStreaming: false,
        stage: 'idle',
        error: { code: event.code, message: event.message },
      };

    case 'audio':
      // Played by the speech layer, not stored on the answer.
      return state;

    default:
      return state;
  }
};

export interface VisibleFigure {
  source: RetrievedSource;
  /** Already behind the proxy, so the view never builds a URL of its own. */
  src: string;
}

export const selectVisibleFigures = (state: AnswerState): VisibleFigure[] => {
  return state.figureIds.flatMap((id) => {
    const source = state.sources.find((candidate) => candidate.id === id);
    if (source === undefined || source.imageUrl === null) {
      return [];
    }
    const src = engineAssetUrl(source.imageUrl);
    return src === null ? [] : [{ source, src }];
  });
};

/** Notices that describe a wait, so the status line says them instead of the stage. */
const WAIT_NOTICES = [
  'checking_sources_carefully',
  'preparing_assistant',
  'preparing_game_search',
] as const;

/** Mic / WAV failures — not "the rulebook had nothing". */
const SPEECH_NOTICES = ['speech_empty', 'speech_invalid_audio'] as const;

type WaitNotice = (typeof WAIT_NOTICES)[number];

const waitNoticeOf = (state: AnswerState): WaitNotice | undefined => {
  return WAIT_NOTICES.find((code) => code === state.notice?.code);
};

export const streamingStatusKey = (
  state: AnswerState,
): `notice.${WaitNotice}` | `stage.${PipelineStage}` | null => {
  if (!state.isStreaming || state.stage === 'idle') {
    return null;
  }
  const waiting = waitNoticeOf(state);
  if (state.text.length === 0 && waiting !== undefined) {
    return `notice.${waiting}`;
  }
  return `stage.${state.stage}`;
};

export const isBlockingNotice = (code: string): boolean => {
  return !WAIT_NOTICES.some((wait) => wait === code);
};

export const isSpeechNotice = (code: string): boolean => {
  return SPEECH_NOTICES.some((speech) => speech === code);
};

/** Prefer speech wording over the yellow "no basis in the documents" alert. */
export const shouldShowInsufficientEvidence = (state: AnswerState): boolean => {
  if (state.groundedness !== 'insufficient_evidence') {
    return false;
  }
  if (state.notice !== null && isSpeechNotice(state.notice.code)) {
    return false;
  }
  return true;
};
