import { describe, expect, it } from 'vitest';
import { isEngineHealthSnapshot, phaseFromPoll } from './engine-readiness';

describe('isEngineHealthSnapshot', () => {
  it('accepts a health object with components', () => {
    expect(isEngineHealthSnapshot({ status: 'ok', components: { ollama: true } })).toBe(true);
  });

  it('rejects a games list payload', () => {
    expect(isEngineHealthSnapshot([])).toBe(false);
  });
});

describe('phaseFromPoll', () => {
  it('is starting while the reranker is still loading', () => {
    expect(
      phaseFromPoll({
        health: { components: { retrieval_loading: true, reranker: false } },
        failedForMs: 0,
        offlineAfterMs: 20_000,
      }),
    ).toBe('starting');
  });

  it('is ready once health answers and loading has finished', () => {
    expect(
      phaseFromPoll({
        health: { components: { retrieval_loading: false, reranker: true } },
        failedForMs: 0,
        offlineAfterMs: 20_000,
      }),
    ).toBe('ready');
  });

  it('is starting when health cannot be reached yet', () => {
    expect(
      phaseFromPoll({
        health: null,
        failedForMs: 1_000,
        offlineAfterMs: 20_000,
      }),
    ).toBe('starting');
  });

  it('is offline after health stays unreachable', () => {
    expect(
      phaseFromPoll({
        health: null,
        failedForMs: 20_000,
        offlineAfterMs: 20_000,
      }),
    ).toBe('offline');
  });
});
