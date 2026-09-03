import type { AskRequest, AssistantEvent, RetrievedSource } from '@bga/api-contract';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAskStream } from './useAskStream';

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

/** A stream the test drives frame by frame, so state can be read mid-answer. */
function engineStream() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array>;

  const body = new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController;
    },
  });

  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    body,
  } as Response);

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
}

const question: AskRequest = {
  gameId: 'azul',
  question: 'Ile kafelków dobieram?',
  mode: 'arbitrate',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useAskStream', () => {
  it('keeps every token even though painting is batched', async () => {
    const { result } = renderHook(() => useAskStream());
    const stream = engineStream();

    act(() => {
      void result.current.ask(question);
    });

    const words = Array.from({ length: 200 }, (_, index) => `t${index} `);
    await stream.send(...words.map((text): AssistantEvent => ({ type: 'token', text })));
    await stream.send({ type: 'done', answerId: 'ans-1', groundedness: 'grounded' });
    stream.close();

    await waitFor(() => {
      expect(result.current.state.isStreaming).toBe(false);
    });
    // The batch timer must never swallow the tail of an answer.
    expect(result.current.state.text).toBe(words.join(''));
  });

  it('shows the sources before the answer is finished', async () => {
    const { result } = renderHook(() => useAskStream());
    const stream = engineStream();

    act(() => {
      void result.current.ask(question);
    });

    await stream.send({ type: 'sources', sources: [source] });

    // Waiting out the token batch here would break the promise that evidence
    // is on screen before the first word.
    expect(result.current.state.sources).toEqual([source]);
    expect(result.current.state.isStreaming).toBe(true);

    stream.close();
  });

  it('does not repaint an answer the user cancelled', async () => {
    const { result } = renderHook(() => useAskStream());
    const stream = engineStream();

    act(() => {
      void result.current.ask(question);
    });
    await stream.send({ type: 'token', text: 'Dobierasz' });

    act(() => {
      result.current.cancel();
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(result.current.state.text).toBe('');
    expect(result.current.state.isStreaming).toBe(false);
  });
});
