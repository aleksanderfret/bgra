import type {
  AnswerMode,
  DocumentKind,
  Groundedness,
  PipelineStage,
  RetrievedSource,
} from '@bga/api-contract';
import { DOCUMENT_AUTHORITY } from '@bga/api-contract';
import type { AnswerError, AnswerNotice, AnswerState } from '@bga/utils/answer-state';

export type ThreadSlice = 'screen' | 'prompt' | 'archive';

export interface ThreadExchange {
  id: string;
  askedAt: string;
  question: string;
  mode: AnswerMode;
  expansionIds: string[];
  answer: AnswerState;
}

export interface ConversationThread {
  version: 1;
  gameId: string;
  exchanges: ThreadExchange[];
}

const ANSWER_MODES: readonly AnswerMode[] = ['teach', 'arbitrate'];
const PIPELINE_STAGES: readonly (PipelineStage | 'idle')[] = [
  'transcribing',
  'retrieving',
  'reranking',
  'generating',
  'speaking',
  'idle',
];
const GROUNDEDNESS: readonly Groundedness[] = ['grounded', 'partial', 'insufficient_evidence'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isAnswerMode = (value: unknown): value is AnswerMode =>
  typeof value === 'string' && ANSWER_MODES.some((mode) => mode === value);

const isPipelineStage = (value: unknown): value is PipelineStage | 'idle' =>
  typeof value === 'string' && PIPELINE_STAGES.some((stage) => stage === value);

const isGroundedness = (value: unknown): value is Groundedness =>
  typeof value === 'string' && GROUNDEDNESS.some((item) => item === value);

const isDocumentKind = (value: unknown): value is DocumentKind =>
  typeof value === 'string' && DOCUMENT_AUTHORITY.some((kind) => kind === value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const isNotice = (value: unknown): value is AnswerNotice => {
  if (!isRecord(value) || typeof value.code !== 'string' || !isRecord(value.params)) {
    return false;
  }
  return Object.values(value.params).every((param) => typeof param === 'string');
};

const isError = (value: unknown): value is AnswerError =>
  isRecord(value) && typeof value.code === 'string' && typeof value.message === 'string';

const isRetrievedSource = (value: unknown): value is RetrievedSource => {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.id === 'string' &&
    typeof value.gameId === 'string' &&
    typeof value.documentTitle === 'string' &&
    isDocumentKind(value.documentKind) &&
    (value.page === null || typeof value.page === 'number') &&
    typeof value.score === 'number' &&
    typeof value.excerpt === 'string' &&
    (value.imageUrl === null || typeof value.imageUrl === 'string')
  );
};

const isAnswerState = (value: unknown): value is AnswerState => {
  if (!isRecord(value)) {
    return false;
  }
  if (!isPipelineStage(value.stage) || typeof value.isStreaming !== 'boolean') {
    return false;
  }
  if (value.transcript !== null && typeof value.transcript !== 'string') {
    return false;
  }
  if (!Array.isArray(value.sources) || !value.sources.every(isRetrievedSource)) {
    return false;
  }
  if (typeof value.text !== 'string' || !isStringArray(value.figureIds)) {
    return false;
  }
  if (value.groundedness !== null && !isGroundedness(value.groundedness)) {
    return false;
  }
  if (value.notice !== null && !isNotice(value.notice)) {
    return false;
  }
  if (value.error !== null && !isError(value.error)) {
    return false;
  }
  return typeof value.rejectedFigureCount === 'number';
};

export const freezeAnswer = (answer: AnswerState): AnswerState => ({
  ...answer,
  isStreaming: false,
  stage: 'idle',
});

export const isThreadExchange = (value: unknown): value is ThreadExchange => {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.id === 'string' &&
    typeof value.askedAt === 'string' &&
    typeof value.question === 'string' &&
    isAnswerMode(value.mode) &&
    isStringArray(value.expansionIds) &&
    isAnswerState(value.answer)
  );
};

export const emptyThread = (gameId: string): ConversationThread => ({
  version: 1,
  gameId,
  exchanges: [],
});

export const appendExchange = (
  thread: ConversationThread,
  exchange: ThreadExchange,
): ConversationThread => ({
  ...thread,
  exchanges: [...thread.exchanges, exchange],
});

export const replaceExchangeAnswer = (
  thread: ConversationThread,
  exchangeId: string,
  answer: AnswerState,
): ConversationThread => ({
  ...thread,
  exchanges: thread.exchanges.map((exchange) =>
    exchange.id === exchangeId ? { ...exchange, answer } : exchange,
  ),
});

export const dropExchange = (
  thread: ConversationThread,
  exchangeId: string,
): ConversationThread => ({
  ...thread,
  exchanges: thread.exchanges.filter((exchange) => exchange.id !== exchangeId),
});

export const replaceExchangeQuestion = (
  thread: ConversationThread,
  exchangeId: string,
  question: string,
): ConversationThread => ({
  ...thread,
  exchanges: thread.exchanges.map((exchange) =>
    exchange.id === exchangeId ? { ...exchange, question } : exchange,
  ),
});

export const normalizeThreadQuestion = (question: string): string =>
  question.trim().toLowerCase().replace(/\s+/g, ' ');

const sameExpansionIds = (left: readonly string[], right: readonly string[]): boolean => {
  if (left.length !== right.length) {
    return false;
  }
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((id, index) => id === sortedRight[index]);
};

/** Last finished answer for the same question + expansions (no re-search). */
export const findReusableExchange = (
  thread: ConversationThread,
  question: string,
  expansionIds: readonly string[],
): ThreadExchange | null => {
  const normalized = normalizeThreadQuestion(question);
  if (normalized.length === 0) {
    return null;
  }
  for (let index = thread.exchanges.length - 1; index >= 0; index -= 1) {
    const exchange = thread.exchanges[index];
    if (exchange === undefined) {
      continue;
    }
    if (normalizeThreadQuestion(exchange.question) !== normalized) {
      continue;
    }
    if (!sameExpansionIds(exchange.expansionIds, expansionIds)) {
      continue;
    }
    if (exchange.answer.isStreaming || exchange.answer.error !== null) {
      continue;
    }
    if (exchange.answer.text.trim().length === 0) {
      continue;
    }
    return exchange;
  }
  return null;
};

export const selectExchanges = (
  thread: ConversationThread,
  slice: ThreadSlice,
): ThreadExchange[] => {
  switch (slice) {
    case 'screen':
      return thread.exchanges;
    // Stage 9 fills these. Sending old turns now would mix chat into the
    // prompt before we have a written cut rule.
    case 'prompt':
      return [];
    case 'archive':
      return [];
  }
};

export const serializeThread = (thread: ConversationThread): string => {
  const frozen: ConversationThread = {
    ...thread,
    exchanges: thread.exchanges.map((exchange) => ({
      ...exchange,
      answer: freezeAnswer(exchange.answer),
    })),
  };
  return JSON.stringify(frozen);
};

export const parseThread = (raw: unknown, gameId: string): ConversationThread => {
  if (!isRecord(raw) || raw.version !== 1 || raw.gameId !== gameId) {
    return emptyThread(gameId);
  }
  if (!Array.isArray(raw.exchanges)) {
    return emptyThread(gameId);
  }
  return {
    version: 1,
    gameId,
    exchanges: raw.exchanges.filter(isThreadExchange).map((exchange) => ({
      ...exchange,
      answer: freezeAnswer(exchange.answer),
    })),
  };
};
