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

  it('is ready once health answers, loading finished, and the reranker is up', () => {
    expect(
      phaseFromPoll({
        health: { components: { retrieval_loading: false, reranker: true } },
        failedForMs: 0,
        offlineAfterMs: 20_000,
      }),
    ).toBe('ready');
  });

  it('is search_unavailable when loading finished but the reranker never came up', () => {
    expect(
      phaseFromPoll({
        health: { components: { retrieval_loading: false, reranker: false } },
        failedForMs: 0,
        offlineAfterMs: 20_000,
      }),
    ).toBe('search_unavailable');
  });

  it('is search_unavailable when the reranker key is missing', () => {
    expect(
      phaseFromPoll({
        health: { components: { retrieval_loading: false } },
        failedForMs: 0,
        offlineAfterMs: 20_000,
      }),
    ).toBe('search_unavailable');
  });

  it('prefers starting over search_unavailable while loading is still true', () => {
    expect(
      phaseFromPoll({
        health: { components: { retrieval_loading: true, reranker: false } },
        failedForMs: 0,
        offlineAfterMs: 20_000,
      }),
    ).toBe('starting');
  });

  it('is reading_layout while old PDFs are being re-read, even if search is still loading', () => {
    expect(
      phaseFromPoll({
        health: {
          components: { retrieval_loading: true, layout_ingest: true, reranker: false },
        },
        failedForMs: 0,
        offlineAfterMs: 20_000,
      }),
    ).toBe('reading_layout');
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
