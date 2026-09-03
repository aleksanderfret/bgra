import type {
  AssistantEvent,
  Groundedness,
  PipelineStage,
  RetrievedSource,
} from '@bga/api-contract';
import { engineAssetUrl } from '@/lib/engine-proxy';

export interface AnswerState {
  stage: PipelineStage | 'idle';
  isStreaming: boolean;
  transcript: string | null;
  sources: RetrievedSource[];
  text: string;
  figureIds: string[];
  groundedness: Groundedness | null;
  notice: { code: string; params: Record<string, string> } | null;
  error: { code: string; message: string } | null;
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

export function startAnswer(): AnswerState {
  return { ...initialAnswerState, isStreaming: true, stage: 'retrieving' };
}

/**
 * A figure is shown only when its id is in `sources`, that source has an
 * image, and the image resolves to a path on this origin. Anything else is
 * counted in `rejectedFigureCount` and discarded.
 */
export function reduceAssistantEvent(state: AnswerState, event: AssistantEvent): AnswerState {
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
}

export interface VisibleFigure {
  source: RetrievedSource;
  /** Already behind the proxy, so the view never builds a URL of its own. */
  src: string;
}

export function selectVisibleFigures(state: AnswerState): VisibleFigure[] {
  return state.figureIds.flatMap((id) => {
    const source = state.sources.find((candidate) => candidate.id === id);
    if (source === undefined || source.imageUrl === null) {
      return [];
    }
    const src = engineAssetUrl(source.imageUrl);
    return src === null ? [] : [{ source, src }];
  });
}
