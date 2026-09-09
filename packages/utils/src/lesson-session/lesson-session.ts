import {
  DOCUMENT_AUTHORITY,
  type DocumentKind,
  type Groundedness,
  type LessonActiveResponse,
  type LessonSession,
  type LessonSessionStatus,
  type LessonSpineHint,
  type LessonSyllabusUnit,
  type LessonTurn,
  type LessonTurnKind,
  type RetrievedSource,
} from '@bga/api-contract';

const SESSION_STATUSES: readonly LessonSessionStatus[] = [
  'planning',
  'active',
  'paused',
  'completed',
  'expired',
];

const TURN_KINDS: readonly LessonTurnKind[] = ['plan', 'unit', 'digression'];

const SPINE_HINTS: readonly LessonSpineHint[] = [
  'goal',
  'theme',
  'mechanics',
  'turn',
  'sample_move',
];

const GROUNDEDNESS: readonly Groundedness[] = ['grounded', 'partial', 'insufficient_evidence'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isDocumentKind = (value: unknown): value is DocumentKind =>
  typeof value === 'string' && DOCUMENT_AUTHORITY.some((kind) => kind === value);

const isGroundedness = (value: unknown): value is Groundedness =>
  typeof value === 'string' && GROUNDEDNESS.some((item) => item === value);

const isLessonSessionStatus = (value: unknown): value is LessonSessionStatus =>
  typeof value === 'string' && SESSION_STATUSES.some((status) => status === value);

const isLessonTurnKind = (value: unknown): value is LessonTurnKind =>
  typeof value === 'string' && TURN_KINDS.some((kind) => kind === value);

const isSpineHint = (value: unknown): value is LessonSpineHint =>
  typeof value === 'string' && SPINE_HINTS.some((hint) => hint === value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

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

const isSyllabusUnit = (value: unknown): value is LessonSyllabusUnit => {
  if (!isRecord(value)) {
    return false;
  }
  if (typeof value.unitId !== 'string' || typeof value.title !== 'string') {
    return false;
  }
  if (!isStringArray(value.sectionRefs)) {
    return false;
  }
  if (value.spineHint === undefined || value.spineHint === null) {
    return true;
  }
  return isSpineHint(value.spineHint);
};

const isLessonTurn = (value: unknown): value is LessonTurn => {
  if (!isRecord(value)) {
    return false;
  }
  if (typeof value.id !== 'string' || !isLessonTurnKind(value.kind)) {
    return false;
  }
  if (value.unitId !== undefined && value.unitId !== null && typeof value.unitId !== 'string') {
    return false;
  }
  if (
    value.question !== undefined &&
    value.question !== null &&
    typeof value.question !== 'string'
  ) {
    return false;
  }
  if (typeof value.text !== 'string' || !isGroundedness(value.groundedness)) {
    return false;
  }
  return Array.isArray(value.sources) && value.sources.every(isRetrievedSource);
};

export const isLessonSession = (value: unknown): value is LessonSession => {
  if (!isRecord(value)) {
    return false;
  }
  if (typeof value.sessionId !== 'string' || typeof value.gameId !== 'string') {
    return false;
  }
  if (!isStringArray(value.expansionIds)) {
    return false;
  }
  if (!Array.isArray(value.syllabus) || !value.syllabus.every(isSyllabusUnit)) {
    return false;
  }
  if (typeof value.unitIndex !== 'number' || !isLessonSessionStatus(value.status)) {
    return false;
  }
  if (typeof value.updatedAt !== 'string' || typeof value.expiresAt !== 'string') {
    return false;
  }
  return Array.isArray(value.turns) && value.turns.every(isLessonTurn);
};

export const isLessonActiveResponse = (value: unknown): value is LessonActiveResponse => {
  if (!isRecord(value)) {
    return false;
  }
  if (!('session' in value)) {
    return false;
  }
  return value.session === null || isLessonSession(value.session);
};
