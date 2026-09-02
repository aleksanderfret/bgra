import type {
  AssistantEvent,
  Groundedness,
  PipelineStage,
  RetrievedSource,
} from '@bga/api-contract';

export interface AnswerState {
  stage: PipelineStage | 'idle';
  isStreaming: boolean;
  /** What speech-to-text heard, so a mishearing is visible rather than silent. */
  transcript: string | null;
  /** The evidence the backend retrieved. The answer may not go beyond it. */
  sources: RetrievedSource[];
  text: string;
  /** Ids of figures cleared for display, in the order the model referenced them. */
  figureIds: string[];
  groundedness: Groundedness | null;
  /** An engine state to phrase, e.g. "nothing is indexed for this game yet". */
  notice: { code: string; params: Record<string, string> } | null;
  error: { code: string; message: string } | null;
  /**
   * How many figure references were dropped because they pointed at something
   * outside the retrieved set. Anything above zero means the model invented a
   * citation, which is worth surfacing while tuning prompts.
   */
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

/** Resets everything except the stage, which moves straight into retrieval. */
export function startAnswer(): AnswerState {
  return { ...initialAnswerState, isStreaming: true, stage: 'retrieving' };
}

/**
 * Folds one stream event into the rendered answer.
 *
 * The important rule lives in the `figure` branch: a figure is displayed only
 * when its id is present in the `sources` the backend sent and that source
 * actually carries an image. A model that hallucinates a file path therefore
 * cannot put anything on screen — the reference is counted and discarded.
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

    // Audio is played by the speech layer, not stored in the answer.
    case 'audio':
      return state;

    default:
      return state;
  }
}

/** Figures cleared for display, resolved back to their source records. */
export function selectVisibleFigures(state: AnswerState): RetrievedSource[] {
  return state.figureIds.flatMap((id) => {
    const source = state.sources.find((candidate) => candidate.id === id);
    return source === undefined ? [] : [source];
  });
}
