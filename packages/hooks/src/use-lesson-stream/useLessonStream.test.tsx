import type { AssistantEvent, LessonSession, RetrievedSource } from '@bga/api-contract';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLessonStream } from './useLessonStream';

const source: RetrievedSource = {
  id: 'azul:rulebook:p04:c02',
  gameId: 'azul',
  documentTitle: 'Azul — instrukcja',
  documentKind: 'rulebook',
  page: 4,
  score: 0.9,
  excerpt: 'Przygotowanie gry...',
  imageUrl: '/static/assets/azul/p04.png',
};

const activeSession = (overrides: Partial<LessonSession> = {}): LessonSession => ({
  sessionId: 'a'.repeat(32),
  gameId: 'azul',
  expansionIds: [],
  syllabus: [
    {
      unitId: 'u00-setup',
      title: 'Setup',
      sectionRefs: ['azul/main/setup'],
      spineHint: 'goal',
    },
  ],
  unitIndex: 0,
  status: 'active',
  updatedAt: '2026-09-09T12:00:00Z',
  expiresAt: '2026-09-12T12:00:00Z',
  turns: [],
  ...overrides,
});

const engineStream = () => {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array>;

  const body = new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController;
    },
  });

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/lesson/active')) {
      return new Response(JSON.stringify({ session: activeSession() }), { status: 200 });
    }
    return new Response(body, { status: 200 });
  });

  return {
    async send(...events: AssistantEvent[]): Promise<void> {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      await act(async () => {
        await Promise.resolve();
      });
    },
    close(): void {
      controller.close();
    },
  };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useLessonStream', () => {
  it('keeps every token even though painting is batched', async () => {
    const { result } = renderHook(() => useLessonStream());
    const stream = engineStream();

    act(() => {
      void result.current.start('azul');
    });

    const words = Array.from({ length: 200 }, (_, index) => `t${index} `);
    await stream.send(...words.map((text): AssistantEvent => ({ type: 'token', text })));
    await stream.send({ type: 'done', answerId: 'ans-1', groundedness: 'grounded' });
    stream.close();

    await waitFor(() => {
      expect(result.current.state.isStreaming).toBe(false);
    });
    expect(result.current.state.text).toBe(words.join(''));
  });

  it('shows the sources before the answer is finished', async () => {
    const { result } = renderHook(() => useLessonStream());
    const stream = engineStream();

    act(() => {
      void result.current.start('azul');
    });

    await stream.send({ type: 'sources', sources: [source] });

    expect(result.current.state.sources).toEqual([source]);
    expect(result.current.state.isStreaming).toBe(true);

    stream.close();
  });

  it('does not repaint an answer the user cancelled', async () => {
    const { result } = renderHook(() => useLessonStream());
    const stream = engineStream();

    act(() => {
      void result.current.start('azul');
    });
    await stream.send({ type: 'token', text: 'Hello' });

    act(() => {
      result.current.cancel();
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(result.current.state.text).toBe('');
    expect(result.current.state.isStreaming).toBe(false);
  });

  it('aborts an in-flight stream when the hook unmounts', async () => {
    const { result, unmount } = renderHook(() => useLessonStream());
    const stream = engineStream();
    const abortSpy = vi.fn();

    act(() => {
      void result.current.start('azul');
    });
    await stream.send({ type: 'token', text: 'partial' });

    const firstCall = vi.mocked(globalThis.fetch).mock.calls[0];
    const init = firstCall?.[1] as RequestInit | undefined;
    const signal = init?.signal;
    expect(signal).toBeDefined();
    signal?.addEventListener('abort', abortSpy);

    unmount();

    expect(abortSpy).toHaveBeenCalled();
  });
});
