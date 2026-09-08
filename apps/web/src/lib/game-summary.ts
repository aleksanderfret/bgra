import {
  DOCUMENT_AUTHORITY,
  type DocumentKind,
  type GameDocumentSummary,
  type GameSummary,
} from '@bga/api-contract';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isDocumentKind = (value: unknown): value is DocumentKind =>
  typeof value === 'string' && DOCUMENT_AUTHORITY.some((kind) => kind === value);

const isGameDocumentSummary = (value: unknown): value is GameDocumentSummary => {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.docKey === 'string' &&
    isDocumentKind(value.documentKind) &&
    typeof value.title === 'string' &&
    typeof value.chunkCount === 'number' &&
    typeof value.indexedAt === 'string'
  );
};

export const isGameSummary = (value: unknown): value is GameSummary => {
  if (!isRecord(value)) {
    return false;
  }
  if (typeof value.gameId !== 'string' || typeof value.title !== 'string') {
    return false;
  }
  if (typeof value.chunkCount !== 'number') {
    return false;
  }
  if (!Array.isArray(value.documentKinds) || !value.documentKinds.every(isDocumentKind)) {
    return false;
  }
  if (value.indexedAt !== null && typeof value.indexedAt !== 'string') {
    return false;
  }
  if (value.baseGameId !== null && typeof value.baseGameId !== 'string') {
    return false;
  }
  if (!Array.isArray(value.documents) || !value.documents.every(isGameDocumentSummary)) {
    return false;
  }
  return true;
};

export const isGameSummaryList = (value: unknown): value is GameSummary[] =>
  Array.isArray(value) && value.every(isGameSummary);
