import type { AssistantEvent, RetrievedSource } from '@bga/api-contract';
import { describe, expect, it } from 'vitest';
import {
  initialAnswerState,
  reduceAssistantEvent,
  selectVisibleFigures,
  startAnswer,
} from './answer-state';

const source = (overrides: Partial<RetrievedSource> = {}): RetrievedSource => ({
  id: 'azul:rulebook:p04:c02',
  gameId: 'azul',
  documentTitle: 'Azul — instrukcja',
  documentKind: 'rulebook',
  page: 4,
  score: 0.82,
  excerpt: 'Kafelki dobierasz z jednego talerzyka...',
  imageUrl: '/api/engine/static/azul/p04.png',
  ...overrides,
});

describe('reduceAssistantEvent', () => {
  it('accumulates streamed tokens in order', () => {
    const events: AssistantEvent[] = [
      { type: 'token', text: 'Bierzesz ' },
      { type: 'token', text: 'wszystkie ' },
      { type: 'token', text: 'kafelki.' },
    ];

    const state = events.reduce(reduceAssistantEvent, startAnswer());

    expect(state.text).toBe('Bierzesz wszystkie kafelki.');
  });

  it('displays a figure that the retriever actually returned', () => {
    const withSources = reduceAssistantEvent(startAnswer(), {
      type: 'sources',
      sources: [source()],
    });

    const state = reduceAssistantEvent(withSources, {
      type: 'figure',
      sourceId: 'azul:rulebook:p04:c02',
    });

    expect(state.figureIds).toEqual(['azul:rulebook:p04:c02']);
    expect(state.rejectedFigureCount).toBe(0);
    expect(selectVisibleFigures(state)).toHaveLength(1);
  });

  it('drops a figure the model invented and counts it', () => {
    const withSources = reduceAssistantEvent(startAnswer(), {
      type: 'sources',
      sources: [source()],
    });

    const state = reduceAssistantEvent(withSources, {
      type: 'figure',
      sourceId: 'azul:rulebook:p99:c01',
    });

    expect(state.figureIds).toEqual([]);
    expect(state.rejectedFigureCount).toBe(1);
    expect(selectVisibleFigures(state)).toEqual([]);
  });

  it('drops a figure reference to a source that has no image', () => {
    const withSources = reduceAssistantEvent(startAnswer(), {
      type: 'sources',
      sources: [source({ id: 'azul:video:001', documentKind: 'video_transcript', imageUrl: null })],
    });

    const state = reduceAssistantEvent(withSources, {
      type: 'figure',
      sourceId: 'azul:video:001',
    });

    expect(state.figureIds).toEqual([]);
    expect(state.rejectedFigureCount).toBe(1);
  });

  it('shows a repeated figure reference only once', () => {
    const withSources = reduceAssistantEvent(startAnswer(), {
      type: 'sources',
      sources: [source()],
    });
    const figure = { type: 'figure', sourceId: 'azul:rulebook:p04:c02' } as const;

    const state = reduceAssistantEvent(reduceAssistantEvent(withSources, figure), figure);

    expect(state.figureIds).toEqual(['azul:rulebook:p04:c02']);
  });

  it('records the transcript so a mishearing stays visible', () => {
    const state = reduceAssistantEvent(startAnswer(), {
      type: 'transcript',
      text: 'ile kafelków dobieram',
    });

    expect(state.transcript).toBe('ile kafelków dobieram');
  });

  it('stops streaming and keeps the groundedness verdict when done', () => {
    const state = reduceAssistantEvent(startAnswer(), {
      type: 'done',
      answerId: 'ans-1',
      groundedness: 'insufficient_evidence',
    });

    expect(state.isStreaming).toBe(false);
    expect(state.stage).toBe('idle');
    expect(state.groundedness).toBe('insufficient_evidence');
  });

  it('stops streaming on an error event', () => {
    const state = reduceAssistantEvent(startAnswer(), {
      type: 'error',
      code: 'engine_unreachable',
      message: 'rag-engine is not running',
    });

    expect(state.isStreaming).toBe(false);
    expect(state.error).toEqual({
      code: 'engine_unreachable',
      message: 'rag-engine is not running',
    });
  });

  it('keeps a notice as a code and its values, never as a sentence', () => {
    // The engine has no business choosing the wording; if this ever stored
    // prose, the interface would be stuck in whatever language Python picked.
    const state = reduceAssistantEvent(startAnswer(), {
      type: 'notice',
      code: 'engine_not_indexed',
      params: { gameId: 'azul', profile: 'starter-32gb' },
    });

    expect(state.notice).toEqual({
      code: 'engine_not_indexed',
      params: { gameId: 'azul', profile: 'starter-32gb' },
    });
    expect(state.isStreaming).toBe(true);
  });

  it('starts from a clean slate on every question', () => {
    expect(startAnswer()).toEqual({
      ...initialAnswerState,
      isStreaming: true,
      stage: 'retrieving',
    });
  });
});
