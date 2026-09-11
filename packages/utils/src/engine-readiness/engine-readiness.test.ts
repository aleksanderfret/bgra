import { describe, expect, it } from 'vitest';
import {
  isEngineHealthSnapshot,
  libraryCatchUpFromHealth,
  phaseFromPoll,
  warmStageFromHealth,
} from './engine-readiness';

describe('isEngineHealthSnapshot', () => {
  it('accepts a health object with components', () => {
    expect(isEngineHealthSnapshot({ status: 'ok', components: { ollama: true } })).toBe(true);
  });

  it('accepts optional warmStage', () => {
    expect(
      isEngineHealthSnapshot({
        components: { ollama: true },
        warmStage: 'teaching_answers',
      }),
    ).toBe(true);
    expect(isEngineHealthSnapshot({ components: {}, warmStage: null })).toBe(true);
  });

  it('rejects an unknown warmStage', () => {
    expect(isEngineHealthSnapshot({ components: {}, warmStage: 'nope' })).toBe(false);
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

  it('stays ready during background layout and library catch-up', () => {
    expect(
      phaseFromPoll({
        health: {
          components: {
            retrieval_loading: false,
            reranker: true,
            layout_ingest: true,
            library_catch_up: true,
          },
        },
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

  it('is reading_layout while layout runs before Ask-ready', () => {
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

  it('stays ready while layout catch-up runs after Ask unlock', () => {
    expect(
      phaseFromPoll({
        health: {
          components: {
            retrieval_loading: false,
            reranker: true,
            layout_ingest: true,
            library_catch_up: true,
          },
        },
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

describe('warmStageFromHealth / libraryCatchUpFromHealth', () => {
  it('reads warmStage and library_catch_up', () => {
    expect(warmStageFromHealth(null)).toBeNull();
    expect(
      warmStageFromHealth({
        components: {},
        warmStage: 'finding_rules',
      }),
    ).toBe('finding_rules');
    expect(libraryCatchUpFromHealth({ components: { library_catch_up: true } })).toBe(true);
    expect(libraryCatchUpFromHealth({ components: {} })).toBe(false);
  });
});
