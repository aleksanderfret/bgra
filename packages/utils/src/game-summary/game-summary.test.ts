import { describe, expect, it } from 'vitest';
import { isGameSummary, isGameSummaryList } from './game-summary';

const validGame = {
  gameId: 'azul',
  title: 'Azul',
  chunkCount: 1,
  documentKinds: ['rulebook'],
  indexedAt: '2026-01-01T00:00:00Z',
  baseGameId: null,
  documents: [],
};

describe('isGameSummary', () => {
  it('accepts a full game summary', () => {
    expect(isGameSummary(validGame)).toBe(true);
  });

  it('rejects a partial object', () => {
    expect(isGameSummary({ gameId: 'azul', title: 'Azul' })).toBe(false);
  });
});

describe('isGameSummaryList', () => {
  it('accepts an array of summaries', () => {
    expect(isGameSummaryList([validGame])).toBe(true);
  });

  it('rejects a bare object', () => {
    expect(isGameSummaryList(validGame)).toBe(false);
  });
});
